import { NextResponse } from "next/server";
import { createSupabaseServer, createSupabaseAdmin } from "@/lib/supabase/server";
import { GAME_IDS } from "@/lib/utils";

/**
 * Ensures the current user has a boardarena.profiles row and a game_stats row per game.
 * Called by the main layout on first access after login.
 */
export async function POST() {
  const supabase = createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createSupabaseAdmin();

  // Username from metadata or email
  const metaUsername = (user.user_metadata as Record<string, unknown> | null)?.["username"];
  const baseName =
    typeof metaUsername === "string" && metaUsername.length >= 2
      ? metaUsername
      : (user.email ? user.email.split("@")[0] : `player_${user.id.slice(0, 6)}`);

  // Try to upsert profile, retry with suffix on unique-conflict
  let username = baseName.slice(0, 24);
  let tries = 0;
  while (tries < 5) {
    const { error } = await admin
      .from("profiles")
      .upsert({ id: user.id, username }, { onConflict: "id" });
    if (!error) break;
    // unique violation on username
    if (error.code === "23505") {
      username = (baseName.slice(0, 18) + "_" + Math.random().toString(36).slice(2, 6)).slice(0, 24);
      tries++;
      continue;
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Ensure one row per game in game_stats
  const rows = GAME_IDS.map((g) => ({ user_id: user.id, game: g }));
  const { error: gsErr } = await admin
    .from("game_stats")
    .upsert(rows, { onConflict: "user_id,game", ignoreDuplicates: true });
  if (gsErr) {
    return NextResponse.json({ error: gsErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, username });
}
