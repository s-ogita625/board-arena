import { NextResponse } from "next/server";
import { createSupabaseServer, createSupabaseAdmin } from "@/lib/supabase/server";
import { isGameId } from "@/lib/utils";

const TOLERANCE_STEPS = [50, 100, 200, 400, 800, 1600, 9999];

/**
 * POST /api/match
 * body: { game: GameId }
 * Behavior:
 *  - Look for opponent in match_queue within tolerance (based on waiting time).
 *  - If found: create room + room_players, remove both from queue.
 *  - Else: insert self into queue.
 *  Returns: { roomId?: string, waiting?: true }
 */
export async function POST(req: Request) {
  const supabase = createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || !isGameId(body.game)) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const game = body.game;

  const admin = createSupabaseAdmin();

  // If I'm already in an active room for this game, hand back that room.
  // This is how the *second* player (who was sitting in the queue) learns
  // about the room created by the first player on their next poll.
  const { data: activeRooms } = await admin
    .from("room_players")
    .select("room_id, rooms!inner(id, game, status)")
    .eq("user_id", user.id)
    .eq("rooms.game", game)
    .in("rooms.status", ["playing", "waiting"]);
  const activeRoom = (activeRooms ?? []).find((r) => r.room_id);
  if (activeRoom) {
    // Clean up any leftover queue entry just in case.
    await admin.from("match_queue").delete().eq("user_id", user.id).eq("game", game);
    return NextResponse.json({ roomId: activeRoom.room_id });
  }

  // get my rating
  const { data: myStat } = await admin
    .from("game_stats")
    .select("rating")
    .eq("user_id", user.id)
    .eq("game", game)
    .single();
  const myRating = myStat?.rating ?? 1000;

  // already in queue? Check time to widen tolerance.
  const { data: existing } = await admin
    .from("match_queue")
    .select("user_id, joined_at")
    .eq("user_id", user.id)
    .eq("game", game)
    .maybeSingle();

  const elapsedSec = existing
    ? (Date.now() - new Date(existing.joined_at).getTime()) / 1000
    : 0;
  const stepIdx = Math.min(TOLERANCE_STEPS.length - 1, Math.floor(elapsedSec / 10));
  const tol = TOLERANCE_STEPS[stepIdx];

  // Look for opponent
  const { data: candidates } = await admin
    .from("match_queue")
    .select("user_id, rating, joined_at")
    .eq("game", game)
    .neq("user_id", user.id)
    .gte("rating", myRating - tol)
    .lte("rating", myRating + tol)
    .order("joined_at", { ascending: true })
    .limit(1);

  if (candidates && candidates.length > 0) {
    const opp = candidates[0];
    // Create room
    const { data: room, error: roomErr } = await admin
      .from("rooms")
      .insert({
        game,
        status: "playing",
        max_players: 2,
        state: { kind: game, history: [] },
        // public_state is intentionally left null here. Writing a stub like
        // { kind: game } caused /api/cards/init to early-return on its
        // idempotency check (which only compared `kind`), so deck/hands were
        // never generated for card games. Init is the only owner of public_state.
      })
      .select("id")
      .single();
    if (roomErr || !room) {
      return NextResponse.json({ error: roomErr?.message ?? "room create failed" }, { status: 500 });
    }
    await admin.from("room_players").insert([
      { room_id: room.id, user_id: user.id,    seat: 0, rating_before: myRating },
      { room_id: room.id, user_id: opp.user_id, seat: 1, rating_before: opp.rating },
    ]);
    // remove both from queue
    await admin
      .from("match_queue")
      .delete()
      .in("user_id", [user.id, opp.user_id])
      .eq("game", game);

    // Confirm both room_players rows are visible (i.e. committed) before we
    // hand the roomId back to clients. Otherwise the 2nd player can hit the
    // room page before their RLS-visible membership row exists.
    for (let attempt = 0; attempt < 5; attempt++) {
      const { count } = await admin
        .from("room_players")
        .select("user_id", { count: "exact", head: true })
        .eq("room_id", room.id);
      if ((count ?? 0) >= 2) break;
      await new Promise((r) => setTimeout(r, 100));
    }

    return NextResponse.json({ roomId: room.id });
  }

  // Not matched: ensure in queue
  if (!existing) {
    await admin.from("match_queue").upsert({
      user_id: user.id,
      game,
      rating: myRating,
      joined_at: new Date().toISOString(),
    });
  }
  return NextResponse.json({ waiting: true, tolerance: tol, elapsedSec });
}

export async function DELETE(req: Request) {
  const supabase = createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const game = url.searchParams.get("game");
  if (!game || !isGameId(game)) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const admin = createSupabaseAdmin();
  await admin.from("match_queue").delete().eq("user_id", user.id).eq("game", game);
  return NextResponse.json({ ok: true });
}
