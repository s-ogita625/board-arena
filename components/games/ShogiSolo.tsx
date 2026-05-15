"use client";

import { useCallback, useEffect, useState } from "react";
import { ShogiBoard } from "@/components/board/ShogiBoard";
import { LevelPicker } from "@/components/common/LevelPicker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  applyMove,
  initialState,
  isInCheck,
  legalMoves,
  type Move,
  type Side,
  type State,
} from "@/lib/games/shogi/engine";
import { pickShogiMove } from "@/lib/games/shogi/ai";
import { reportSoloResult } from "@/lib/results/report";

type Phase = "setup" | "playing" | "finished";

export function ShogiSolo() {
  const [phase, setPhase] = useState<Phase>("setup");
  const [level, setLevel] = useState(3);
  const [humanSide, setHumanSide] = useState<Side>("S");
  const [state, setState] = useState<State>(() => initialState());
  const [msg, setMsg] = useState<string | null>(null);

  const finalize = useCallback(
    (s: State) => {
      // legal moves of side to move = 0 → loss for that side
      const me = humanSide;
      const moves = legalMoves(s);
      if (moves.length > 0) return false;
      const loser = s.turn;
      const humanWon = loser !== me;
      setMsg(humanWon ? "あなたの勝ち！" : "CPUの勝ち");
      setPhase("finished");
      reportSoloResult({ game: "shogi", outcome: humanWon ? 1 : 0 }).catch(() => {});
      return true;
    },
    [humanSide],
  );

  useEffect(() => {
    if (phase !== "playing") return;
    if (state.turn !== humanSide) {
      const t = setTimeout(() => {
        const m = pickShogiMove(state, { level });
        if (!m) {
          finalize(state);
          return;
        }
        const next = applyMove(state, m);
        setState(next);
        finalize(next);
      }, 300);
      return () => clearTimeout(t);
    } else {
      // check if human has no moves
      if (legalMoves(state).length === 0) finalize(state);
    }
  }, [phase, state, humanSide, level, finalize]);

  function handleMove(m: Move) {
    const next = applyMove(state, m);
    setState(next);
    finalize(next);
  }

  function newGame(side: Side) {
    setState(initialState());
    setHumanSide(side);
    setMsg(null);
    setPhase("playing");
  }

  if (phase === "setup") {
    return (
      <Card className="max-w-md mx-auto">
        <CardHeader><CardTitle>将棋 - ソロ</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-medium mb-2">CPU レベル (1 弱 ～ 10 強)</p>
            <LevelPicker value={level} onChange={setLevel} />
          </div>
          <div className="flex gap-2">
            <Button onClick={() => newGame("S")}>先手で開始</Button>
            <Button onClick={() => newGame("G")} variant="secondary">後手で開始</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">将棋 vs CPU Lv {level}</h2>
        <Button variant="ghost" size="sm" onClick={() => setPhase("setup")}>リセット</Button>
      </div>
      <div className="flex flex-col md:flex-row gap-6">
        <ShogiBoard
          state={state}
          humanSide={humanSide}
          onMove={handleMove}
          disabled={phase !== "playing"}
        />
        <Card className="flex-1">
          <CardHeader><CardTitle>状況</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>あなた: {humanSide === "S" ? "先手" : "後手"}</p>
            <p>手番: {state.turn === "S" ? "先手" : "後手"}</p>
            {isInCheck(state, state.turn) && <p className="text-red-600">王手！</p>}
            {msg && <p className="text-lg font-semibold mt-4">{msg}</p>}
            {phase === "finished" && (
              <Button onClick={() => setPhase("setup")} className="mt-2">もう一度</Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
