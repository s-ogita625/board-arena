import { NextResponse } from "next/server";
import { createSupabaseServer, createSupabaseAdmin } from "@/lib/supabase/server";

/**
 * POST /api/game/resign  body: { roomId, reason?: string }
 *
 * Marks the calling user as having forfeited. Intended for two paths:
 *  - user clicks 投了 in the UI
 *  - the browser tab is being torn down (the client may fire this through
 *    navigator.sendBeacon on `beforeunload` to register a "task-killed"
 *    defeat).
 *
 * The seat that resigned loses; everyone else still in the room wins.
 * Idempotent: a finished room responds 200 with alreadyFinished.
 */
export async function POST(req: Request) {
  const supabase = createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // sendBeacon submits as text/plain; tolerate both JSON and plain text.
  let body: { roomId?: string; reason?: string } | null = null;
  try {
    body = await req.json();
  } catch {
    const text = await req.text().catch(() => "");
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }
  if (!body || typeof body.roomId !== "string") {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  const { data: room } = await admin
    .from("rooms")
    .select("id, status, state, public_state")
    .eq("id", body.roomId)
    .maybeSingle();
  if (!room) {
    return NextResponse.json({ error: "room not found" }, { status: 404 });
  }
  if (room.status === "finished") {
    return NextResponse.json({ ok: true, alreadyFinished: true });
  }

  const { data: members } = await admin
    .from("room_players")
    .select("user_id, seat")
    .eq("room_id", room.id)
    .order("seat", { ascending: true });
  const me = members?.find((m) => m.user_id === user.id);
  if (!me) {
    return NextResponse.json({ error: "not a participant" }, { status: 403 });
  }
  const others = (members ?? []).filter((m) => m.user_id !== user.id);
  const winnerId = others[0]?.user_id ?? null;

  const newState = {
    ...(room.state as Record<string, unknown>),
    winnerId,
    clock: undefined,
    resignedSeat: me.seat,
  };
  const newPub = room.public_state
    ? {
        ...(room.public_state as Record<string, unknown>),
        winnerId,
        clock: undefined,
        resignedSeat: me.seat,
      }
    : null;

  await admin
    .from("rooms")
    .update({
      state: newState,
      public_state: newPub,
      status: "finished",
      updated_at: new Date().toISOString(),
    })
    .eq("id", room.id);

  await fetch(new URL("/api/result/online", req.url), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: req.headers.get("cookie") ?? "",
    },
    body: JSON.stringify({ roomId: room.id, winnerId }),
  }).catch(() => {});

  return NextResponse.json({ ok: true, winnerId });
}
