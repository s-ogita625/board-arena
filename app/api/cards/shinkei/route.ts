import { NextResponse } from "next/server";
import { createSupabaseServer, createSupabaseAdmin } from "@/lib/supabase/server";
import type { Card } from "@/lib/games/cards/deck";
import type { ShinkeiPublic } from "@/lib/games/cards/online";

/**
 * POST /api/cards/shinkei  body: { roomId: string, action: "flip", index: number }
 *                          or { roomId: string, action: "resolve" }
 *
 * - "flip" reveals one card publicly.
 * - "resolve" is called when 2 cards are revealed; matches or hides them and
 *   advances turn accordingly.
 */

export async function POST(req: Request) {
  const supabase = createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body.roomId !== "string" || typeof body.action !== "string") {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  const { data: room } = await admin
    .from("rooms")
    .select("id, game, status, state, public_state")
    .eq("id", body.roomId)
    .single();
  if (!room || room.game !== "shinkei") {
    return NextResponse.json({ error: "room not found" }, { status: 404 });
  }
  if (room.status === "finished") {
    return NextResponse.json({ error: "finished" }, { status: 400 });
  }

  const pub = room.public_state as ShinkeiPublic;
  const priv = room.state as { kind: "shinkei"; board: Card[] };
  if (!pub || pub.kind !== "shinkei" || !priv?.board) {
    return NextResponse.json({ error: "not initialized" }, { status: 400 });
  }
  const meSeat = pub.seats.indexOf(user.id);
  if (meSeat < 0) return NextResponse.json({ error: "not a participant" }, { status: 403 });
  if (meSeat !== pub.turn) return NextResponse.json({ error: "not your turn" }, { status: 400 });

  if (body.action === "flip") {
    const idx = body.index;
    if (!Number.isInteger(idx) || idx < 0 || idx >= priv.board.length) {
      return NextResponse.json({ error: "bad index" }, { status: 400 });
    }
    if (pub.taken.includes(idx)) {
      return NextResponse.json({ error: "already taken" }, { status: 400 });
    }
    if (pub.revealed.find((r) => r.index === idx)) {
      return NextResponse.json({ error: "already revealed" }, { status: 400 });
    }
    if (pub.revealed.length >= 2) {
      return NextResponse.json({ error: "must resolve first" }, { status: 400 });
    }
    const newPub: ShinkeiPublic = {
      ...pub,
      revealed: [...pub.revealed, { index: idx, card: priv.board[idx] }],
      version: pub.version + 1,
    };
    await admin.from("rooms").update({
      public_state: newPub,
      updated_at: new Date().toISOString(),
    }).eq("id", room.id);
    return NextResponse.json({ ok: true, version: newPub.version });
  }

  if (body.action === "resolve") {
    if (pub.revealed.length !== 2) {
      return NextResponse.json({ error: "need 2 revealed" }, { status: 400 });
    }
    const [a, b] = pub.revealed;
    const ca = a.card;
    const cb = b.card;
    const matched =
      (ca.suit === "JOKER" && cb.suit === "JOKER") ||
      (ca.suit !== "JOKER" && cb.suit !== "JOKER" && ca.rank === cb.rank);

    const scores = pub.scores.slice();
    const taken = pub.taken.slice();
    if (matched) {
      taken.push(a.index, b.index);
      scores[meSeat] += 1;
    }
    const remaining = priv.board.length - taken.length;
    const isOver = remaining === 0;
    let winnerId: string | null | undefined = undefined;
    if (isOver) {
      const max = Math.max(...scores);
      const top = scores
        .map((s, i) => (s === max ? i : -1))
        .filter((i) => i >= 0);
      winnerId = top.length === 1 ? pub.seats[top[0]] : null; // draw if tied
    }
    const nextTurn = matched ? meSeat : (meSeat + 1) % pub.seats.length;
    const newPub: ShinkeiPublic = {
      ...pub,
      revealed: [],
      taken,
      scores,
      turn: nextTurn,
      pending: undefined,
      winnerId,
      version: pub.version + 1,
    };
    await admin.from("rooms").update({
      public_state: newPub,
      updated_at: new Date().toISOString(),
    }).eq("id", room.id);

    if (isOver) {
      await fetch(new URL("/api/result/online", req.url), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: req.headers.get("cookie") ?? "",
        },
        body: JSON.stringify({ roomId: room.id, winnerId: winnerId ?? null }),
      }).catch(() => {});
    }
    return NextResponse.json({ ok: true, matched, version: newPub.version });
  }

  return NextResponse.json({ error: "bad action" }, { status: 400 });
}
