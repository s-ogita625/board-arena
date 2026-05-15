import { NextResponse } from "next/server";
import { createSupabaseServer, createSupabaseAdmin } from "@/lib/supabase/server";
import { isGameId } from "@/lib/utils";

export async function POST(req: Request) {
  const supabase = createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || !isGameId(body.game)) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const outcome = body.outcome;
  if (![0, 0.5, 1].includes(outcome)) {
    return NextResponse.json({ error: "bad outcome" }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  const { data: stat } = await admin
    .from("game_stats")
    .select("wins, losses, draws")
    .eq("user_id", user.id)
    .eq("game", body.game)
    .single();

  const wins = (stat?.wins ?? 0) + (outcome === 1 ? 1 : 0);
  const losses = (stat?.losses ?? 0) + (outcome === 0 ? 1 : 0);
  const draws = (stat?.draws ?? 0) + (outcome === 0.5 ? 1 : 0);

  await admin
    .from("game_stats")
    .upsert(
      {
        user_id: user.id,
        game: body.game,
        wins,
        losses,
        draws,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,game" },
    );

  return NextResponse.json({ ok: true });
}
