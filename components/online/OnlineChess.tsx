"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Chess, type Square } from "chess.js";
import { ChessBoard } from "@/components/board/ChessBoard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowser } from "@/lib/supabase/client";

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
}

export function OnlineChess({ roomId, meSeat, players, finished: finishedInit }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [game] = useState(() => new Chess());
  const [, setTick] = useState(0);
  const [finished, setFinished] = useState(finishedInit);
  const [message, setMessage] = useState<string | null>(null);

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
      if (state.winnerId !== undefined) {
        setFinished(true);
        if (state.winnerId === null) setMessage("引き分け");
        else if (state.winnerId === me.user_id) setMessage("勝利！");
        else setMessage("敗北...");
      }
    },
    [game, me.user_id],
  );

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
      .channel(`room:${roomId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "boardarena", table: "rooms", filter: `id=eq.${roomId}` },
        (payload) => {
          const newRow = payload.new as { state: ChessRoomState; status: string };
          syncFromRow(newRow.state);
          if (newRow.status === "finished") setFinished(true);
        },
      )
      .subscribe();
    return () => {
      mounted = false;
      supabase.removeChannel(ch);
    };
  }, [roomId, supabase, syncFromRow]);

  async function pushState(extra?: Partial<ChessRoomState>) {
    await supabase
      .from("rooms")
      .update({
        state: {
          kind: "chess",
          fen: game.fen(),
          history: game.history(),
          ...extra,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", roomId);
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
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-semibold">オンライン チェス</h2>
        <span className="text-sm text-slate-500">
          あなた: {me.username} ({humanColor === "w" ? "白" : "黒"}) vs {opp?.username ?? "—"}
        </span>
      </div>
      <div className="flex flex-col md:flex-row gap-6">
        <ChessBoard
          game={game}
          humanColor={humanColor}
          flipped={humanColor === "b"}
          onMove={handleMove}
          disabled={finished}
        />
        <Card className="flex-1">
          <CardHeader><CardTitle>状況</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>手番: {game.turn() === "w" ? "白" : "黒"}</p>
            {game.inCheck() && <p className="text-red-600">王手！</p>}
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
