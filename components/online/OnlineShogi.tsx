"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { ShogiBoard } from "@/components/board/ShogiBoard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import {
  applyMove,
  initialState,
  isInCheck,
  legalMoves,
  type Move,
  type Side,
  type State,
} from "@/lib/games/shogi/engine";
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

interface ShogiRoomState {
  kind: "shogi";
  state?: State;
  winnerId?: string | null;
  clock?: Clock;
}

export function OnlineShogi({ roomId, meSeat, players, finished: finishedInit }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [state, setState] = useState<State>(() => initialState());
  const [finished, setFinished] = useState(finishedInit);
  const [message, setMessage] = useState<string | null>(null);
  const [clock, setClock] = useState<Clock | undefined>(undefined);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useResignOnUnload(roomId, finished);

  // Seat 0 plays Sente (先手), seat 1 plays Gote (後手)
  const humanSide: Side = meSeat === 0 ? "S" : "G";
  const opp = players.find((p) => p.seat !== meSeat);
  const me = players.find((p) => p.seat === meSeat)!;

  const syncFromRow = useCallback(
    (row: ShogiRoomState | null) => {
      if (!row) return;
      if (row.state) setState(row.state);
      setClock(row.clock);
      if (row.winnerId !== undefined) {
        setFinished(true);
        if (row.winnerId === null) setMessage("引き分け");
        else if (row.winnerId === me.user_id) setMessage("勝利！");
        else setMessage("敗北...");
      }
    },
    [me.user_id],
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
        syncFromRow(data.state as ShogiRoomState);
        if (data.status === "finished") setFinished(true);
      }
    })();

    const ch = supabase
      .channel(`room:${roomId}`, { config: { broadcast: { self: false } } })
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "boardarena", table: "rooms", filter: `id=eq.${roomId}` },
        (payload) => {
          const newRow = payload.new as { state: ShogiRoomState; status: string };
          syncFromRow(newRow.state);
          if (newRow.status === "finished") setFinished(true);
        },
      )
      .on("broadcast", { event: "state" }, (msg) => {
        const s = (msg.payload as { state?: ShogiRoomState } | undefined)?.state;
        if (s) syncFromRow(s);
      })
      .subscribe();
    channelRef.current = ch;
    return () => {
      mounted = false;
      channelRef.current = null;
      supabase.removeChannel(ch);
    };
  }, [roomId, supabase, syncFromRow]);

  async function pushState(next: State, extra?: Partial<ShogiRoomState>) {
    const payloadState: ShogiRoomState = { kind: "shogi", state: next, ...extra };
    // Server-side update via service role (bypasses RLS visibility lag).
    await fetch("/api/game/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId, state: payloadState }),
    });
    // Broadcast safety net in case postgres_changes doesn't reach opponent.
    try {
      await channelRef.current?.send({
        type: "broadcast",
        event: "state",
        payload: { state: payloadState },
      });
    } catch {
      /* primary path is postgres_changes; ignore */
    }
  }

  async function reportWinner(winnerId: string | null) {
    await fetch("/api/result/online", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId, winnerId }),
    });
  }

  function handleMove(m: Move) {
    if (finished) return;
    if (state.turn !== humanSide) return;
    const next = applyMove(state, m);
    setState(next);

    // detect end: opponent has no legal moves
    const oppSide: Side = humanSide === "S" ? "G" : "S";
    const oppMoves = legalMoves(next);
    let winnerId: string | null | undefined = undefined;
    if (oppMoves.length === 0) {
      // checkmate or stalemate; in shogi stalemate is rare, treat as loss for side-to-move
      if (isInCheck(next, oppSide)) {
        winnerId = me.user_id; // we checkmated
      } else {
        winnerId = null; // unlikely draw
      }
    }

    pushState(next, winnerId !== undefined ? { winnerId } : undefined).then(() => {
      if (winnerId !== undefined) reportWinner(winnerId);
    });
  }

  async function resign() {
    if (finished) return;
    const winnerId = opp?.user_id ?? null;
    setFinished(true);
    setMessage("投了しました");
    await pushState(state, { winnerId });
    await reportWinner(winnerId);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">オンライン 将棋</h2>
          <span className="text-sm text-slate-500">
            あなた: {me.username} ({humanSide === "S" ? "先手" : "後手"}) vs {opp?.username ?? "—"}
          </span>
        </div>
        <TurnTimer clock={clock} mySeat={meSeat} onExpire={fireTimeout} />
      </div>
      <div className="flex flex-col md:flex-row gap-6">
        <ShogiBoard
          state={state}
          humanSide={humanSide}
          onMove={handleMove}
          disabled={finished}
        />
        <Card className="flex-1">
          <CardHeader><CardTitle>状況</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>手番: {state.turn === "S" ? "先手" : "後手"}</p>
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
