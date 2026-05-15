import { NextResponse } from "next/server";
import { createSupabaseServer, createSupabaseAdmin } from "@/lib/supabase/server";

/**
 * POST /api/rooms/join  body: { passcode: string }
 *
 * Finds a private room with the given passcode (case-insensitive) and adds
 * the caller as the next free seat. If the caller is already a member,
 * just hand back the roomId.
 */
export async function POST(req: Request) {
  const supabase = createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body.passcode !== "string") {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const code = body.passcode.trim().toUpperCase();
  if (code.length < 4 || code.length > 16) {
    return NextResponse.json({ error: "bad passcode" }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  const { data: room } = await admin
    .from("rooms")
    .select("id, status, max_players, host_id")
    .eq("visibility", "private")
    .eq("passcode", code)
    .maybeSingle();
  if (!room) {
    return NextResponse.json({ error: "room not found" }, { status: 404 });
  }
  if (room.status === "finished") {
    return NextResponse.json({ error: "room finished" }, { status: 400 });
  }

  // Already a member?
  const { data: existing } = await admin
    .from("room_players")
    .select("seat")
    .eq("room_id", room.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ roomId: room.id });
  }

  // Find the next free seat.
  const { data: members } = await admin
    .from("room_players")
    .select("seat")
    .eq("room_id", room.id)
    .order("seat", { ascending: true });
  const taken = new Set((members ?? []).map((m) => m.seat));
  let seat = 0;
  while (taken.has(seat)) seat++;
  if (seat >= room.max_players) {
    return NextResponse.json({ error: "room is full" }, { status: 400 });
  }

  await admin.from("room_players").insert({
    room_id: room.id,
    user_id: user.id,
    seat,
    rating_before: 1000,
  });

  return NextResponse.json({ roomId: room.id, seat });
}
