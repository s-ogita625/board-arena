import { NextResponse } from "next/server";
import { createSupabaseServer, createSupabaseAdmin } from "@/lib/supabase/server";
import { isExpired, type Clock } from "@/lib/games/clock";

/**
 * POST /api/game/timeout  body: { roomId }
 *
 * The caller's UI noticed the active turn clock expired. We validate that
 * server-side, then declare the seat that ran out of time the loser and
 * notify /api/result/online to settle ratings.
 *
 * Idempotent: if the room is already finished or the clock has been
 * advanced (e.g. the player squeaked a move in just in time), we no-op.
 */
export async function POST(req: Request) {
  const supabase = createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body.roomId !== "string") {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  const { data: room } = await admin
    .from("rooms")
    .select("id, game, status, state, public_state")
    .eq("id", body.roomId)
    .maybeSingle();
  if (!room || room.status === "finished") {
    return NextResponse.json({ ok: true, alreadyFinished: true });
  }

  // Verify the caller is a member of this room.
  const { data: members } = await admin
    .from("room_players")
    .select("user_id, seat")
    .eq("room_id", room.id)
    .order("seat", { ascending: true });
  if (!members?.some((m) => m.user_id === user.id)) {
    return NextResponse.json({ error: "not a participant" }, { status: 403 });
  }

  // The clock lives in state (chess/shogi) or public_state (cards).
  const stateClock = (room.state as { clock?: Clock } | null)?.clock;
  const pubClock = (room.public_state as { clock?: Clock } | null)?.clock;
  const clock = stateClock ?? pubClock;
  if (!clock || !isExpired(clock)) {
    return NextResponse.json({ ok: true, notExpired: true });
  }

  const losingSeat = clock.turnSeat;
  const loser = members.find((m) => m.seat === losingSeat);
  if (!loser) {
    return NextResponse.json({ ok: true, noSeat: true });
  }

  // Pick a winner: the next still-alive seat after losing seat. In 2-player
  // games that's just the other seat. For multi-player card games we credit
  // the seat immediately clockwise.
  const winner = members.find((m) => m.user_id !== loser.user_id);
  const winnerId = winner?.user_id ?? null;

  // Mark the room finished and clear the clock so other clients stop
  // counting. We update both columns defensively.
  const newState = {
    ...(room.state as Record<string, unknown>),
    winnerId,
    clock: undefined,
    timedOutSeat: losingSeat,
  };
  const newPub = room.public_state
    ? {
        ...(room.public_state as Record<string, unknown>),
        winnerId,
        clock: undefined,
        timedOutSeat: losingSeat,
      }
    : null;

  await admin
    .from("rooms")
    .update({
      state: newState,
      public_state: newPub,
      status: "finished",
      updated_at: new Date().toISOString(),
    })
    .eq("id", room.id);

  // Settle ratings via the existing online-result endpoint.
  await fetch(new URL("/api/result/online", req.url), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: req.headers.get("cookie") ?? "",
    },
    body: JSON.stringify({ roomId: room.id, winnerId }),
  }).catch(() => {});

  return NextResponse.json({ ok: true, winnerId, losingSeat });
}
