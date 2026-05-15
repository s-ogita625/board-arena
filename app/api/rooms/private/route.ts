import { NextResponse } from "next/server";
import { createSupabaseServer, createSupabaseAdmin } from "@/lib/supabase/server";

/**
 * POST /api/rooms/private
 * Creates a new private (friend) room owned by the caller.
 *  - game starts as "lobby" (a sentinel that play routes ignore).
 *  - passcode is a 6-char A-Z/0-9 string (avoiding ambiguous chars).
 *  - The host is inserted into room_players at seat 0.
 *  - rated = false so private games don't affect the public ranking.
 *
 * Returns: { roomId, passcode }
 */

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L
function makePasscode(len = 6): string {
  let out = "";
  for (let i = 0; i < len; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

export async function POST() {
  const supabase = createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseAdmin();

  // We don't yet know which game the host will choose, but the rooms.game
  // column has a CHECK constraint that only allows real GameIds. Park the
  // row as "chess" while in waiting status; /api/rooms/start will overwrite
  // it the moment the host actually picks a game.
  let lastError: string | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const passcode = makePasscode();
    const { data: room, error } = await admin
      .from("rooms")
      .insert({
        game: "chess",
        status: "waiting",
        max_players: 4,
        desired_players: 2,
        visibility: "private",
        passcode,
        host_id: user.id,
        rated: false,
        state: { kind: "lobby" },
      })
      .select("id, passcode")
      .single();
    if (!error && room) {
      await admin.from("room_players").insert({
        room_id: room.id,
        user_id: user.id,
        seat: 0,
        rating_before: 1000,
      });
      return NextResponse.json({ roomId: room.id, passcode: room.passcode });
    }
    lastError = error?.message ?? null;
  }
  return NextResponse.json(
    { error: lastError ?? "could not create room" },
    { status: 500 },
  );
}
