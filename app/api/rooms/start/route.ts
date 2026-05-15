import { NextResponse } from "next/server";
import { createSupabaseServer, createSupabaseAdmin } from "@/lib/supabase/server";
import { isGameId } from "@/lib/utils";

/**
 * POST /api/rooms/start  body: { roomId, game, players }
 *
 * Host only. Locks the room into the chosen game and player count, sets
 * status to "playing", and (for card games) the card init route is then
 * called from the client.
 */
export async function POST(req: Request) {
  const supabase = createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (
    !body ||
    typeof body.roomId !== "string" ||
    !isGameId(body.game) ||
    !Number.isInteger(body.players)
  ) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const game = body.game as string;
  const players = body.players as number;
  if (players < 2 || players > 4) {
    return NextResponse.json({ error: "players 2-4" }, { status: 400 });
  }
  if ((game === "chess" || game === "shogi") && players !== 2) {
    return NextResponse.json(
      { error: "chess/shogi must be 2 players" },
      { status: 400 },
    );
  }

  const admin = createSupabaseAdmin();
  const { data: room } = await admin
    .from("rooms")
    .select("id, host_id, status, visibility")
    .eq("id", body.roomId)
    .maybeSingle();
  if (!room) {
    return NextResponse.json({ error: "room not found" }, { status: 404 });
  }
  if (room.visibility !== "private") {
    return NextResponse.json({ error: "not a private room" }, { status: 400 });
  }
  if (room.host_id !== user.id) {
    return NextResponse.json({ error: "host only" }, { status: 403 });
  }
  if (room.status === "playing" || room.status === "finished") {
    return NextResponse.json({ error: "already started" }, { status: 400 });
  }

  // Verify we have the right number of members.
  const { count } = await admin
    .from("room_players")
    .select("user_id", { count: "exact", head: true })
    .eq("room_id", room.id);
  if ((count ?? 0) < players) {
    return NextResponse.json(
      { error: `need ${players} players, have ${count ?? 0}` },
      { status: 400 },
    );
  }

  const { error } = await admin
    .from("rooms")
    .update({
      game,
      desired_players: players,
      status: "playing",
      state: { kind: game, history: [] },
      // public_state remains null so /api/cards/init creates the full state.
      updated_at: new Date().toISOString(),
    })
    .eq("id", room.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
