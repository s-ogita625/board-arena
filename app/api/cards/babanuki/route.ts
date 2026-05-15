import { NextResponse } from "next/server";
import { createSupabaseServer, createSupabaseAdmin } from "@/lib/supabase/server";
import { shuffle, type Card } from "@/lib/games/cards/deck";
import type { BabanukiPublic, BabanukiPrivate } from "@/lib/games/cards/online";

/**
 * POST /api/cards/babanuki  body: { roomId: string, cardIndex: number }
 *
 * Draws card #cardIndex from the previous seat (opponent) into the current
 * player's hand. Server is the sole source of truth, so clients cannot
 * choose cards from their own hand or peek at opponents'.
 */

function discardPairs(hand: Card[]): { hand: Card[]; paired: boolean } {
  const counts = new Map<number, Card[]>();
  for (const c of hand) {
    if (c.suit === "JOKER") continue;
    const arr = counts.get(c.rank) ?? [];
    arr.push(c);
    counts.set(c.rank, arr);
  }
  const removeIds = new Set<string>();
  for (const arr of counts.values()) {
    const pairs = Math.floor(arr.length / 2);
    for (let i = 0; i < pairs * 2; i++) removeIds.add(arr[i].id);
  }
  return {
    hand: hand.filter((c) => !removeIds.has(c.id)),
    paired: removeIds.size > 0,
  };
}

export async function POST(req: Request) {
  const supabase = createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body.roomId !== "string" || typeof body.cardIndex !== "number") {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  const { data: room } = await admin
    .from("rooms")
    .select("id, game, status, state, public_state")
    .eq("id", body.roomId)
    .single();
  if (!room || room.game !== "babanuki") {
    return NextResponse.json({ error: "room not found" }, { status: 404 });
  }
  if (room.status === "finished") {
    return NextResponse.json({ error: "finished" }, { status: 400 });
  }

  const pub = room.public_state as BabanukiPublic;
  const priv = room.state as { kind: "babanuki"; hands: Card[][] };
  if (!pub || pub.kind !== "babanuki" || !priv?.hands) {
    return NextResponse.json({ error: "not initialized" }, { status: 400 });
  }

  const meSeat = pub.seats.indexOf(user.id);
  if (meSeat < 0) return NextResponse.json({ error: "not a participant" }, { status: 403 });
  if (meSeat !== pub.turn) return NextResponse.json({ error: "not your turn" }, { status: 400 });

  const N = pub.seats.length;
  // Draw from the previous seat that still has cards (counter-clockwise).
  let oppSeat = (meSeat - 1 + N) % N;
  for (let step = 0; step < N - 1 && priv.hands[oppSeat].length === 0; step++) {
    oppSeat = (oppSeat - 1 + N) % N;
  }
  const oppHand = priv.hands[oppSeat];
  if (!oppHand || oppHand.length === 0) {
    return NextResponse.json({ error: "opponent empty" }, { status: 400 });
  }
  const idx = body.cardIndex;
  if (!Number.isInteger(idx) || idx < 0 || idx >= oppHand.length) {
    return NextResponse.json({ error: "bad cardIndex" }, { status: 400 });
  }

  const newOpp = oppHand.slice();
  const drawn = newOpp.splice(idx, 1)[0];
  const merged = [...priv.hands[meSeat], drawn];
  const { hand: newMe, paired } = discardPairs(merged);

  // Re-shuffle every hand after a draw. Without this, both players can
  // memorize where the joker sits because the previous victim's cards stay
  // at the same indices forever (and the same trick lets the drawer dodge
  // it indefinitely). Shuffling means the joker's position changes between
  // turns even though the cards themselves are the same.
  const newHands = priv.hands.slice();
  newHands[meSeat] = shuffle(newMe);
  newHands[oppSeat] = shuffle(newOpp);
  for (let i = 0; i < newHands.length; i++) {
    if (i !== meSeat && i !== oppSeat) {
      newHands[i] = shuffle(newHands[i]);
    }
  }

  const finishedSeats = pub.finished.slice();
  const meUserId = pub.seats[meSeat];
  const oppUserId = pub.seats[oppSeat];
  if (newMe.length === 0 && !finishedSeats.includes(meUserId)) finishedSeats.push(meUserId);
  if (newOpp.length === 0 && !finishedSeats.includes(oppUserId)) finishedSeats.push(oppUserId);

  // Game ends when only one player still holds cards (they are the joker
  // holder = loser). In multi-player babanuki we treat the player who
  // emptied first as the overall winner (other finishers tie behind).
  let winnerId: string | null | undefined = undefined;
  const stillHolding = newHands
    .map((h, i) => (h.length > 0 ? pub.seats[i] : null))
    .filter((v): v is string => !!v);
  const isOver = stillHolding.length <= 1;
  if (isOver) {
    winnerId = finishedSeats[0] ?? null;
  }

  // Next turn: advance clockwise (meSeat + 1) and skip players who already
  // finished. If everyone but one is finished, isOver is already true.
  let nextTurn = pub.turn;
  if (!isOver) {
    let t = (meSeat + 1) % N;
    for (let step = 0; step < N; step++) {
      if (newHands[t].length > 0) break;
      t = (t + 1) % N;
    }
    nextTurn = t;
  }

  const newPub: BabanukiPublic = {
    ...pub,
    counts: newHands.map((h) => h.length),
    turn: nextTurn,
    finished: finishedSeats,
    lastDraw: {
      fromUserId: oppUserId,
      toUserId: meUserId,
      cardId: drawn.id,
      paired,
    },
    winnerId,
    version: pub.version + 1,
  };

  await admin.from("rooms").update({
    state: { kind: "babanuki", hands: newHands },
    public_state: newPub,
    updated_at: new Date().toISOString(),
  }).eq("id", room.id);

  // private updates for both players
  for (let i = 0; i < pub.seats.length; i++) {
    const p: BabanukiPrivate = {
      kind: "babanuki",
      hand: newHands[i],
      version: newPub.version,
    };
    await admin.from("room_private_state").upsert(
      { room_id: room.id, user_id: pub.seats[i], state: p, updated_at: new Date().toISOString() },
      { onConflict: "room_id,user_id" },
    );
  }

  // If game ended, post result for Elo update + close room.
  if (isOver) {
    await fetch(new URL("/api/result/online", req.url), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: req.headers.get("cookie") ?? "",
      },
      body: JSON.stringify({ roomId: room.id, winnerId: winnerId ?? null }),
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true, version: newPub.version });
}
