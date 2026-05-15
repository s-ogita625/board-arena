import { NextResponse } from "next/server";
import { createSupabaseServer, createSupabaseAdmin } from "@/lib/supabase/server";
import { isGameId } from "@/lib/utils";

const TOLERANCE_STEPS = [50, 100, 200, 400, 800, 1600, 9999];

const SUPPORTS_MULTI = new Set(["babanuki", "daifugo", "shinkei"]);

/**
 * POST /api/match
 * body: { game: GameId, players?: 2|3|4 }
 *   players defaults to 2. Only the card games support > 2.
 *
 * Behavior:
 *  - If I'm already in an active room for this game, return its id.
 *  - Else look for waiters in the same (game, desired_players) pool within
 *    rating tolerance. When we have desired_players - 1 partners (so the
 *    final size matches), create the room with all of us and clear queue.
 *  - Else upsert myself into the queue at this size.
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
  let desiredPlayers = Number.isInteger(body.players) ? body.players : 2;
  if (!SUPPORTS_MULTI.has(game)) desiredPlayers = 2;
  if (desiredPlayers < 2 || desiredPlayers > 4) {
    return NextResponse.json({ error: "players must be 2-4" }, { status: 400 });
  }

  const admin = createSupabaseAdmin();

  // If I'm already in an active room for this game, hand back that room.
  const { data: activeRooms } = await admin
    .from("room_players")
    .select("room_id, rooms!inner(id, game, status, visibility)")
    .eq("user_id", user.id)
    .eq("rooms.game", game)
    .eq("rooms.visibility", "public")
    .in("rooms.status", ["playing", "waiting"]);
  const activeRoom = (activeRooms ?? []).find((r) => r.room_id);
  if (activeRoom) {
    await admin
      .from("match_queue")
      .delete()
      .eq("user_id", user.id)
      .eq("game", game);
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

  // existing queue entry (we keep at most one per game per user; switch size
  // means we overwrite)
  const { data: existing } = await admin
    .from("match_queue")
    .select("user_id, joined_at, desired_players")
    .eq("user_id", user.id)
    .eq("game", game)
    .maybeSingle();

  const elapsedSec =
    existing && existing.desired_players === desiredPlayers
      ? (Date.now() - new Date(existing.joined_at).getTime()) / 1000
      : 0;
  const stepIdx = Math.min(TOLERANCE_STEPS.length - 1, Math.floor(elapsedSec / 10));
  const tol = TOLERANCE_STEPS[stepIdx];

  const partnersNeeded = desiredPlayers - 1;
  const { data: candidates } = await admin
    .from("match_queue")
    .select("user_id, rating, joined_at")
    .eq("game", game)
    .eq("desired_players", desiredPlayers)
    .neq("user_id", user.id)
    .gte("rating", myRating - tol)
    .lte("rating", myRating + tol)
    .order("joined_at", { ascending: true })
    .limit(partnersNeeded);

  if (candidates && candidates.length >= partnersNeeded) {
    // Create the room with all participants.
    const { data: room, error: roomErr } = await admin
      .from("rooms")
      .insert({
        game,
        status: "playing",
        max_players: desiredPlayers,
        desired_players: desiredPlayers,
        visibility: "public",
        rated: true,
        state: { kind: game, history: [] },
      })
      .select("id")
      .single();
    if (roomErr || !room) {
      return NextResponse.json(
        { error: roomErr?.message ?? "room create failed" },
        { status: 500 },
      );
    }
    // Seat order: I take 0, partners take 1..N-1 in queue join order.
    const everyone = [
      { user_id: user.id, rating: myRating },
      ...candidates.map((c) => ({ user_id: c.user_id, rating: c.rating })),
    ];
    await admin.from("room_players").insert(
      everyone.map((p, i) => ({
        room_id: room.id,
        user_id: p.user_id,
        seat: i,
        rating_before: p.rating,
      })),
    );
    await admin
      .from("match_queue")
      .delete()
      .in(
        "user_id",
        everyone.map((p) => p.user_id),
      )
      .eq("game", game);

    // Confirm room_players visibility before handing back the id.
    for (let attempt = 0; attempt < 5; attempt++) {
      const { count } = await admin
        .from("room_players")
        .select("user_id", { count: "exact", head: true })
        .eq("room_id", room.id);
      if ((count ?? 0) >= desiredPlayers) break;
      await new Promise((r) => setTimeout(r, 100));
    }

    return NextResponse.json({ roomId: room.id });
  }

  // Not matched: (re)insert into queue at current size. user_id is PK so
  // switching game / size simply overwrites the prior entry.
  await admin.from("match_queue").upsert(
    {
      user_id: user.id,
      game,
      rating: myRating,
      desired_players: desiredPlayers,
      joined_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  return NextResponse.json({
    waiting: true,
    tolerance: tol,
    elapsedSec,
    desiredPlayers,
    needed: partnersNeeded - (candidates?.length ?? 0),
  });
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
