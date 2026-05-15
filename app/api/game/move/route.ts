import { NextResponse } from "next/server";
import { createSupabaseServer, createSupabaseAdmin } from "@/lib/supabase/server";

/**
 * POST /api/game/move
 * body: { roomId: string, state: object, winnerId?: string | null }
 *
 * Writes the new room state with the service role to bypass RLS update
 * visibility lag, after verifying the caller is actually a participant of the
 * room. Used by chess/shogi which keep their full game state in `rooms.state`.
 *
 * This avoids the issue where `supabase.from("rooms").update(...)` from the
 * browser silently affects 0 rows because the RLS update policy can't see the
 * caller's `room_players` row yet, which manifested as "the opponent never
 * sees my move".
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

  // Verify the caller is a participant of the room.
  const { data: membership } = await admin
    .from("room_players")
    .select("room_id")
    .eq("room_id", body.roomId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) {
    return NextResponse.json({ error: "not a participant" }, { status: 403 });
  }

  // Persist the new state. winnerId is optional and, if present, is merged
  // into the state payload by the caller already; we don't need to touch it
  // here.
  const { error } = await admin
    .from("rooms")
    .update({
      state: body.state,
      updated_at: new Date().toISOString(),
    })
    .eq("id", body.roomId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  // The client is expected to broadcast to its room channel after this call
  // returns so that the opponent gets the update even if postgres_changes
  // isn't being delivered (e.g. publication / RLS issues on a custom schema).
  return NextResponse.json({ ok: true });
}
