import { NextResponse } from "next/server";
import { createSupabaseServer, createSupabaseAdmin } from "@/lib/supabase/server";
import { isGameId } from "@/lib/utils";
import { updateElo } from "@/lib/rating/elo";

/**
 * POST /api/result/online
 * body: { roomId: string, winnerId: string | null }  // null = draw
 *
 * Verifies the caller is a participant, the room is "playing", and that
 * `winnerId` is null or one of the participants. Computes Elo deltas and
 * updates game_stats; marks room as "finished".
 */
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
    .select("id, game, status")
    .eq("id", body.roomId)
    .single();
  if (!room) return NextResponse.json({ error: "room not found" }, { status: 404 });
  if (!isGameId(room.game)) return NextResponse.json({ error: "bad game" }, { status: 500 });
  if (room.status === "finished") {
    return NextResponse.json({ ok: true, idempotent: true });
  }

  const { data: players } = await admin
    .from("room_players")
    .select("user_id, seat, rating_before")
    .eq("room_id", room.id)
    .order("seat", { ascending: true });
  if (!players || players.length !== 2) {
    return NextResponse.json({ error: "not 2-player room" }, { status: 400 });
  }
  const me = players.find((p) => p.user_id === user.id);
  if (!me) return NextResponse.json({ error: "not a participant" }, { status: 403 });

  const winnerId: string | null = body.winnerId ?? null;
  if (winnerId !== null && !players.find((p) => p.user_id === winnerId)) {
    return NextResponse.json({ error: "bad winnerId" }, { status: 400 });
  }

  const [a, b] = players;
  const aWin = winnerId === a.user_id ? 1 : winnerId === b.user_id ? 0 : 0.5;
  const { ratingA, ratingB, deltaA, deltaB } = updateElo(
    a.rating_before,
    b.rating_before,
    aWin as 0 | 0.5 | 1,
  );

  // Update game_stats for each player
  for (const [p, newRating, delta, score] of [
    [a, ratingA, deltaA, aWin] as const,
    [b, ratingB, deltaB, 1 - aWin] as const,
  ]) {
    const { data: stat } = await admin
      .from("game_stats")
      .select("wins, losses, draws")
      .eq("user_id", p.user_id)
      .eq("game", room.game)
      .single();
    await admin.from("game_stats").upsert(
      {
        user_id: p.user_id,
        game: room.game,
        rating: newRating,
        wins: (stat?.wins ?? 0) + (score === 1 ? 1 : 0),
        losses: (stat?.losses ?? 0) + (score === 0 ? 1 : 0),
        draws: (stat?.draws ?? 0) + (score === 0.5 ? 1 : 0),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,game" },
    );
  }

  // Save match_results & close room
  await admin.from("match_results").insert({
    room_id: room.id,
    game: room.game,
    winner_id: winnerId,
    rating_changes: { [a.user_id]: deltaA, [b.user_id]: deltaB },
  });
  await admin.from("rooms").update({ status: "finished" }).eq("id", room.id);

  return NextResponse.json({
    ok: true,
    deltas: { [a.user_id]: deltaA, [b.user_id]: deltaB },
  });
}
