import { NextResponse } from "next/server";
import { createSupabaseServer, createSupabaseAdmin } from "@/lib/supabase/server";
import { newClock } from "@/lib/games/clock";

/**
 * POST /api/game/move
 * body: { roomId: string, state: object }
 *
 * Writes the new state with the service role (bypassing RLS visibility lag
 * after match creation). Also attaches a fresh per-turn clock for the next
 * seat so the opponent's UI can countdown.
 */
export async function POST(req: Request) {
  const supabase = createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (
    !body ||
    typeof body.roomId !== "string" ||
    !body.state ||
    typeof body.state !== "object"
  ) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const admin = createSupabaseAdmin();

  const { data: membership } = await admin
    .from("room_players")
    .select("room_id, seat")
    .eq("room_id", body.roomId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) {
    return NextResponse.json({ error: "not a participant" }, { status: 403 });
  }

  const { data: members } = await admin
    .from("room_players")
    .select("user_id, seat")
    .eq("room_id", body.roomId)
    .order("seat", { ascending: true });
  const N = members?.length ?? 2;
  const mySeat = membership.seat as number;
  const nextSeat = (mySeat + 1) % N;

  const incoming = body.state as { kind?: string; winnerId?: string | null };
  const game: string = typeof incoming.kind === "string" ? incoming.kind : "chess";

  // Only schedule the next clock if the move didn't end the game.
  const stateWithClock = {
    ...(incoming as Record<string, unknown>),
    clock: incoming.winnerId !== undefined ? undefined : newClock(game, nextSeat),
  };

  const { error } = await admin
    .from("rooms")
    .update({
      state: stateWithClock,
      updated_at: new Date().toISOString(),
    })
    .eq("id", body.roomId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
