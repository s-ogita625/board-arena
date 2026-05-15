"use client";

import { useCallback, useEffect, useState } from "react";
import { LevelPicker } from "@/components/common/LevelPicker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  aiPickPair,
  flip,
  initShinkei,
  isShinkeiOver,
  memorize,
  resolveTurn,
  shinkeiRanks,
  type ShinkeiState,
} from "@/lib/games/cards/shinkei";
import { cardLabel } from "@/lib/games/cards/deck";
import { reportSoloResult } from "@/lib/results/report";

const HUMAN = 0;
type Phase = "setup" | "playing" | "finished";

export function ShinkeiSolo() {
  const [phase, setPhase] = useState<Phase>("setup");
  const [level, setLevel] = useState(3);
  const [numPlayers, setNumPlayers] = useState(2);
  const [state, setState] = useState<ShinkeiState | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);

  const finalize = useCallback(
    (s: ShinkeiState) => {
      if (!isShinkeiOver(s)) return false;
      const r = shinkeiRanks(s);
      const meRank = r[HUMAN];
      setMsg(`あなたは ${meRank}位 / ${numPlayers}人 (取り札: ${s.scores[HUMAN]})`);
      setPhase("finished");
      const outcome: 0 | 0.5 | 1 = meRank === 1 ? 1 : meRank === numPlayers ? 0 : 0.5;
      reportSoloResult({ game: "shinkei", outcome }).catch(() => {});
      return true;
    },
    [numPlayers],
  );

  // AI turn loop
  useEffect(() => {
    if (phase !== "playing" || !state || thinking) return;
    if (isShinkeiOver(state)) { finalize(state); return; }
    if (state.turn === HUMAN) return;

    setThinking(true);
    let s = state;
    const me = state.turn;
    const [a, b] = aiPickPair(s, me, level);
    setTimeout(() => {
      // flip first
      s = flip(s, a);
      s = memorize(s, makeAIList(s.numPlayers, level), a);
      setState({ ...s });
      setTimeout(() => {
        s = flip(s, b);
        s = memorize(s, makeAIList(s.numPlayers, level), b);
        setState({ ...s });
        setTimeout(() => {
          const { state: ns } = resolveTurn(s);
          setState(ns);
          setThinking(false);
          finalize(ns);
        }, 800);
      }, 400);
    }, 400);
  }, [phase, state, thinking, level, finalize]);

  function makeAIList(np: number, lv: number) {
    const arr: { player: number; level: number }[] = [];
    for (let p = 0; p < np; p++) if (p !== HUMAN) arr.push({ player: p, level: lv });
    return arr;
  }

  function start() {
    setState(initShinkei(numPlayers, 0));
    setMsg(null);
    setPhase("playing");
  }

  function humanFlip(idx: number) {
    if (!state || state.turn !== HUMAN || thinking) return;
    if (state.taken[idx] || state.revealed[idx]) return;
    let s = flip(state, idx);
    s = memorize(s, makeAIList(s.numPlayers, level), idx);
    const flipped = s.revealed.filter(Boolean).length;
    setState(s);
    if (flipped === 2) {
      setThinking(true);
      setTimeout(() => {
        const { state: ns } = resolveTurn(s);
        setState(ns);
        setThinking(false);
        finalize(ns);
      }, 900);
    }
  }

  if (phase === "setup") {
    return (
      <Card className="max-w-md mx-auto">
        <CardHeader><CardTitle>神経衰弱 - ソロ</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-medium mb-2">人数</p>
            <div className="flex gap-2">
              {[2, 3, 4].map((n) => (
                <Button
                  key={n}
                  variant={numPlayers === n ? "primary" : "secondary"}
                  onClick={() => setNumPlayers(n)}
                >
                  {n}人
                </Button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm font-medium mb-2">CPU レベル (記憶力)</p>
            <LevelPicker value={level} onChange={setLevel} />
          </div>
          <Button onClick={start}>開始</Button>
        </CardContent>
      </Card>
    );
  }

  if (!state) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">神経衰弱 Lv {level}</h2>
        <Button variant="ghost" size="sm" onClick={() => setPhase("setup")}>リセット</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {state.turn === HUMAN ? "あなたの番" : `P${state.turn + 1} の番 (考え中…)`}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-8 sm:grid-cols-13 gap-1">
            {state.board.map((c, i) => {
              const open = state.revealed[i];
              const taken = state.taken[i];
              return (
                <button
                  key={i}
                  onClick={() => humanFlip(i)}
                  disabled={taken || thinking || state.turn !== HUMAN}
                  className={
                    "aspect-[2/3] rounded text-xs font-medium border " +
                    (taken
                      ? "bg-transparent border-transparent text-transparent"
                      : open
                        ? "bg-white text-slate-900"
                        : "bg-blue-600 text-white hover:bg-blue-700")
                  }
                >
                  {taken ? "" : open ? cardLabel(c!) : "?"}
                </button>
              );
            })}
          </div>
          <div className="flex gap-4 text-sm">
            {state.scores.map((s, i) => (
              <span key={i}>
                {i === HUMAN ? "あなた" : `P${i + 1}`}: {s}組
              </span>
            ))}
          </div>
          {msg && <p className="text-lg font-semibold">{msg}</p>}
          {phase === "finished" && (
            <Button onClick={() => setPhase("setup")}>もう一度</Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
