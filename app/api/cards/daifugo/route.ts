import { NextResponse } from "next/server";
import { createSupabaseServer, createSupabaseAdmin } from "@/lib/supabase/server";
import type { Card } from "@/lib/games/cards/deck";
import type { DaifugoPublic, DaifugoPrivate } from "@/lib/games/cards/online";
import { legalPlays, rankStrength } from "@/lib/games/cards/daifugo";
import { newClock } from "@/lib/games/clock";

/**
 * POST /api/cards/daifugo  body: { roomId, action: "play", cardIds: string[] }
 *                          or { roomId, action: "pass" }
 *
 * 2-player simplified daifugo: same as solo logic but the server is the
 * referee. Only the seated player whose turn it is can submit a move.
 */

export async function POST(req: Request) {
  const supabase = createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body.roomId !== "string" || typeof body.action !== "string") {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  const { data: room } = await admin
    .from("rooms")
    .select("id, game, status, state, public_state")
    .eq("id", body.roomId)
    .single();
  if (!room || room.game !== "daifugo") {
    return NextResponse.json({ error: "room not found" }, { status: 404 });
  }
  if (room.status === "finished") {
    return NextResponse.json({ error: "finished" }, { status: 400 });
  }

  const pub = room.public_state as DaifugoPublic;
  const priv = room.state as { kind: "daifugo"; hands: Card[][] };
  if (!pub || pub.kind !== "daifugo" || !priv?.hands) {
    return NextResponse.json({ error: "not initialized" }, { status: 400 });
  }
  const meSeat = pub.seats.indexOf(user.id);
  if (meSeat < 0) return NextResponse.json({ error: "not a participant" }, { status: 403 });
  if (meSeat !== pub.turn) return NextResponse.json({ error: "not your turn" }, { status: 400 });

  const hands = priv.hands.map((h) => h.slice());
  const myHand = hands[meSeat];
  const N = pub.seats.length;

  const finishSeats = pub.finished.slice();
  let nextTurn = pub.turn;
  let nextCurrent: Card[] | null = pub.current;
  let nextLastSeat: number | null = pub.lastSeat;
  let nextPasses = pub.passes;
  let isOver = false;
  let winnerId: string | null | undefined = undefined;

  // Move the turn clockwise, skipping seats whose hand is already empty.
  function advance(from: number): number {
    let t = (from + 1) % N;
    for (let step = 0; step < N; step++) {
      if (hands[t].length > 0) return t;
      t = (t + 1) % N;
    }
    return from; // everyone empty (game over)
  }

  if (body.action === "play") {
    if (!Array.isArray(body.cardIds) || body.cardIds.length === 0) {
      return NextResponse.json({ error: "bad cardIds" }, { status: 400 });
    }
    const wantedIds: string[] = body.cardIds;
    const chosen: Card[] = [];
    for (const id of wantedIds) {
      const c = myHand.find((x) => x.id === id);
      if (!c) return NextResponse.json({ error: "card not in hand" }, { status: 400 });
      chosen.push(c);
    }
    const plays = legalPlays(myHand, pub.current);
    const chosenIds = chosen.map((c) => c.id).sort().join(",");
    const legal = plays.some(
      (p) => p.map((c) => c.id).sort().join(",") === chosenIds,
    );
    if (!legal) return NextResponse.json({ error: "illegal play" }, { status: 400 });

    const ids = new Set(chosen.map((c) => c.id));
    hands[meSeat] = myHand.filter((c) => !ids.has(c.id));
    nextCurrent = chosen;
    nextLastSeat = meSeat;
    nextPasses = 0;

    if (hands[meSeat].length === 0 && !finishSeats.includes(user.id)) {
      finishSeats.push(user.id);
    }
    if (hands.filter((h) => h.length > 0).length <= 1) {
      isOver = true;
      winnerId = finishSeats[0] ?? null;
    }
    if (!isOver) nextTurn = advance(meSeat);
  } else if (body.action === "pass") {
    nextPasses = pub.passes + 1;
    const alive = hands.filter((h) => h.length > 0).length;
    nextTurn = advance(meSeat);
    // When everyone but the last player to lay cards has passed, the field
    // is cleared and that player leads again.
    if (nextPasses >= alive - 1 && nextLastSeat != null) {
      nextCurrent = null;
      nextPasses = 0;
      nextTurn = nextLastSeat;
      if (hands[nextTurn].length === 0) {
        nextTurn = advance(nextLastSeat);
      }
      nextLastSeat = null;
    }
  } else {
    return NextResponse.json({ error: "bad action" }, { status: 400 });
  }

  const newPub: DaifugoPublic = {
    ...pub,
    counts: hands.map((h) => h.length),
    current: nextCurrent,
    lastSeat: nextLastSeat,
    passes: nextPasses,
    turn: nextTurn,
    finished: finishSeats,
    winnerId,
    version: pub.version + 1,
    clock: isOver ? undefined : newClock("daifugo", nextTurn),
  };

  await admin.from("rooms").update({
    state: { kind: "daifugo", hands },
    public_state: newPub,
    updated_at: new Date().toISOString(),
  }).eq("id", room.id);

  // update private states. Sort hand by strength for nicer UI.
  for (let i = 0; i < pub.seats.length; i++) {
    const p: DaifugoPrivate = {
      kind: "daifugo",
      hand: hands[i].slice().sort((a, b) => rankStrength(a) - rankStrength(b)),
      version: newPub.version,
    };
    await admin.from("room_private_state").upsert(
      { room_id: room.id, user_id: pub.seats[i], state: p, updated_at: new Date().toISOString() },
      { onConflict: "room_id,user_id" },
    );
  }

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
