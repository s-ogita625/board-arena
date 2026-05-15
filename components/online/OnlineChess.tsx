"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Chess, type Square } from "chess.js";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { ChessBoard } from "@/components/board/ChessBoard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import type { Clock } from "@/lib/games/clock";
import { TurnTimer } from "@/components/common/TurnTimer";
import { useResignOnUnload } from "@/lib/hooks/useResignOnUnload";

interface PlayerInfo {
  user_id: string;
  seat: number;
  username: string;
  avatar_url: string | null;
}

interface Props {
  roomId: string;
  meSeat: number;
  players: PlayerInfo[];
  finished: boolean;
}

interface ChessRoomState {
  kind: "chess";
  fen?: string;
  history?: string[]; // SAN list
  winnerId?: string | null;
  clock?: Clock;
}

export function OnlineChess({ roomId, meSeat, players, finished: finishedInit }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [game] = useState(() => new Chess());
  // tick is used as a version key for <ChessBoard> so that mutations on the
  // same `game` instance (which doesn't change identity) still trigger
  // re-render of the squares.
  const [tick, setTick] = useState(0);
  const [finished, setFinished] = useState(finishedInit);
  const [message, setMessage] = useState<string | null>(null);
  const [clock, setClock] = useState<Clock | undefined>(undefined);
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Resign on tab close so a task-kill counts as a loss for the leaver.
  useResignOnUnload(roomId, finished);

  // Seat 0 plays white, seat 1 plays black
  const humanColor: "w" | "b" = meSeat === 0 ? "w" : "b";
  const opp = players.find((p) => p.seat !== meSeat);
  const me = players.find((p) => p.seat === meSeat)!;

  const syncFromRow = useCallback(
    (state: ChessRoomState | null) => {
      if (!state) return;
      if (state.fen) {
        try { game.load(state.fen); } catch { /* ignore */ }
        setTick((n) => n + 1);
      }
      setClock(state.clock);
      if (state.winnerId !== undefined) {
        setFinished(true);
        if (state.winnerId === null) setMessage("引き分け");
        else if (state.winnerId === me.user_id) setMessage("勝利！");
        else setMessage("敗北...");
      }
    },
    [game, me.user_id],
  );

  const fireTimeout = useCallback(async () => {
    await fetch("/api/game/timeout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId }),
    }).catch(() => {});
  }, [roomId]);

  // initial load + subscribe
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase
        .from("rooms")
        .select("state, status")
        .eq("id", roomId)
        .single();
      if (mounted && data) {
        syncFromRow(data.state as ChessRoomState);
        if (data.status === "finished") setFinished(true);
      }
    })();

    const ch = supabase
      .channel(`room:${roomId}`, { config: { broadcast: { self: false } } })
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "boardarena", table: "rooms", filter: `id=eq.${roomId}` },
        (payload) => {
          const newRow = payload.new as { state: ChessRoomState; status: string };
          syncFromRow(newRow.state);
          if (newRow.status === "finished") setFinished(true);
        },
      )
      // Broadcast fallback: opponents publish to this channel after writing
      // their move via /api/game/move, so we always receive it even when
      // postgres_changes can't make it through.
      .on("broadcast", { event: "state" }, (msg) => {
        const state = (msg.payload as { state?: ChessRoomState } | undefined)?.state;
        if (state) syncFromRow(state);
      })
      .subscribe();
    channelRef.current = ch;
    return () => {
      mounted = false;
      channelRef.current = null;
      supabase.removeChannel(ch);
    };
  }, [roomId, supabase, syncFromRow]);

  async function pushState(extra?: Partial<ChessRoomState>) {
    const state: ChessRoomState = {
      kind: "chess",
      fen: game.fen(),
      history: game.history(),
      ...extra,
    };
    // Server-side update via service role to avoid RLS visibility lag on
    // browser-side rooms.update.
    await fetch("/api/game/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId, state }),
    });
    // Broadcast as a safety net for the opponent, in case postgres_changes
    // isn't delivering UPDATE events on the boardarena schema.
    try {
      await channelRef.current?.send({
        type: "broadcast",
        event: "state",
        payload: { state },
      });
    } catch {
      /* postgres_changes is the primary path; ignore broadcast errors */
    }
  }

  async function maybeReportEnd() {
    if (!game.isGameOver()) return false;
    let winnerId: string | null = null;
    if (game.isCheckmate()) {
      // side to move lost
      winnerId = game.turn() === "w" ? opp?.user_id ?? null : me.user_id;
      // adjust based on humanColor
      const winnerColor = game.turn() === "w" ? "b" : "w";
      winnerId = winnerColor === humanColor ? me.user_id : opp?.user_id ?? null;
    }
    await pushState({ winnerId });
    await fetch("/api/result/online", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId, winnerId }),
    });
    return true;
  }

  function handleMove(from: Square, to: Square, promotion: "q" | "r" | "b" | "n" = "q") {
    if (finished) return false;
    if (game.turn() !== humanColor) return false;
    try {
      const m = game.move({ from, to, promotion });
      if (!m) return false;
      setTick((n) => n + 1);
      pushState().then(() => maybeReportEnd());
      return true;
    } catch {
      return false;
    }
  }

  async function resign() {
    if (finished) return;
    const winnerId = opp?.user_id ?? null;
    setFinished(true);
    setMessage("投了しました");
    await pushState({ winnerId });
    await fetch("/api/result/online", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId, winnerId }),
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">オンライン チェス</h2>
          <span className="text-sm text-slate-500">
            あなた: {me.username} ({humanColor === "w" ? "白" : "黒"}) vs {opp?.username ?? "—"}
          </span>
        </div>
        <TurnTimer clock={clock} mySeat={meSeat} onExpire={fireTimeout} />
      </div>
      <div className="flex flex-col md:flex-row gap-6">
        <ChessBoard
          game={game}
          humanColor={humanColor}
          flipped={humanColor === "b"}
          onMove={handleMove}
          disabled={finished}
          versionKey={tick}
        />
        <Card className="flex-1">
          <CardHeader><CardTitle>状況</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>手番: {game.turn() === "w" ? "白" : "黒"}</p>
            {message && <p className="text-lg font-semibold">{message}</p>}
            {!finished && (
              <Button variant="danger" onClick={resign}>投了</Button>
            )}
            {finished && (
              <Button onClick={() => router.push("/")}>ホームに戻る</Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
