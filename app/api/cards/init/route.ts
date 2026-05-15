import { NextResponse } from "next/server";
import { createSupabaseServer, createSupabaseAdmin } from "@/lib/supabase/server";
import { buildDeck, shuffle, type Card } from "@/lib/games/cards/deck";
import type {
  BabanukiPublic,
  BabanukiPrivate,
  ShinkeiPublic,
  ShinkeiPrivate,
  DaifugoPublic,
  DaifugoPrivate,
} from "@/lib/games/cards/online";

/**
 * POST /api/cards/init  body: { roomId }
 *
 * Initializes the public/private state of a card-game room. Idempotent:
 * if the room already has a `kind`-tagged public_state, returns ok.
 *
 * Discards pairs in initial babanuki hands as usual.
 */

function discardPairs(hand: Card[]): Card[] {
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
  return hand.filter((c) => !removeIds.has(c.id));
}

export async function POST(req: Request) {
  const supabase = createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body.roomId !== "string") {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  const { data: room } = await admin
    .from("rooms")
    .select("id, game, status, public_state")
    .eq("id", body.roomId)
    .single();
  if (!room) return NextResponse.json({ error: "room not found" }, { status: 404 });
  if (room.status === "finished") {
    return NextResponse.json({ ok: true, finished: true });
  }

  const { data: players } = await admin
    .from("room_players")
    .select("user_id, seat")
    .eq("room_id", room.id)
    .order("seat", { ascending: true });
  if (!players || players.length !== 2) {
    return NextResponse.json({ error: "not 2-player room" }, { status: 400 });
  }
  if (!players.find((p) => p.user_id === user.id)) {
    return NextResponse.json({ error: "not a participant" }, { status: 403 });
  }

  // Idempotency: if public_state already has matching kind, no-op.
  const ps = (room.public_state ?? null) as { kind?: string } | null;
  if (ps && ps.kind === room.game) {
    return NextResponse.json({ ok: true, alreadyInitialized: true });
  }

  const seatIds = players.map((p) => p.user_id);

  if (room.game === "babanuki") {
    const deck = shuffle(buildDeck(1));
    const hands: Card[][] = [[], []];
    deck.forEach((c, i) => hands[i % 2].push(c));
    const reduced = hands.map(discardPairs);
    const pub: BabanukiPublic = {
      kind: "babanuki",
      seats: seatIds,
      counts: reduced.map((h) => h.length),
      turn: 0,
      finished: [],
      version: 1,
    };
    await admin.from("rooms").update({
      state: { kind: "babanuki", hands: reduced },
      public_state: pub,
      updated_at: new Date().toISOString(),
    }).eq("id", room.id);
    // private rows
    for (let i = 0; i < 2; i++) {
      const priv: BabanukiPrivate = { kind: "babanuki", hand: reduced[i], version: 1 };
      await admin.from("room_private_state").upsert(
        { room_id: room.id, user_id: seatIds[i], state: priv },
        { onConflict: "room_id,user_id" },
      );
    }
    return NextResponse.json({ ok: true });
  }

  if (room.game === "shinkei") {
    const cards = shuffle(buildDeck(0));
    const pub: ShinkeiPublic = {
      kind: "shinkei",
      seats: seatIds,
      positions: cards.length,
      revealed: [],
      taken: [],
      scores: [0, 0],
      turn: 0,
      version: 1,
    };
    await admin.from("rooms").update({
      state: { kind: "shinkei", board: cards },
      public_state: pub,
      updated_at: new Date().toISOString(),
    }).eq("id", room.id);
    for (let i = 0; i < 2; i++) {
      const priv: ShinkeiPrivate = { kind: "shinkei", version: 1 };
      await admin.from("room_private_state").upsert(
        { room_id: room.id, user_id: seatIds[i], state: priv },
        { onConflict: "room_id,user_id" },
      );
    }
    return NextResponse.json({ ok: true });
  }

  if (room.game === "daifugo") {
    const deck = shuffle(buildDeck(1));
    const hands: Card[][] = [[], []];
    deck.forEach((c, i) => hands[i % 2].push(c));
    const pub: DaifugoPublic = {
      kind: "daifugo",
      seats: seatIds,
      counts: hands.map((h) => h.length),
      current: null,
      lastSeat: null,
      passes: 0,
      turn: 0,
      finished: [],
      version: 1,
    };
    await admin.from("rooms").update({
      state: { kind: "daifugo", hands },
      public_state: pub,
      updated_at: new Date().toISOString(),
    }).eq("id", room.id);
    for (let i = 0; i < 2; i++) {
      const priv: DaifugoPrivate = { kind: "daifugo", hand: hands[i], version: 1 };
      await admin.from("room_private_state").upsert(
        { room_id: room.id, user_id: seatIds[i], state: priv },
        { onConflict: "room_id,user_id" },
      );
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unsupported game" }, { status: 400 });
}
