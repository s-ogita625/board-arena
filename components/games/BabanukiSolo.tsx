"use client";

import { useCallback, useEffect, useState } from "react";
import { LevelPicker } from "@/components/common/LevelPicker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  aiPickIndex,
  babaRanks,
  drawAndProgress,
  initBaba,
  isBabaOver,
  prevAlive,
  type BabaState,
} from "@/lib/games/cards/babanuki";
import { cardLabel } from "@/lib/games/cards/deck";
import { PlayingCard } from "@/components/board/PlayingCard";
import { reportSoloResult } from "@/lib/results/report";

const HUMAN = 0;

type Phase = "setup" | "playing" | "finished";

export function BabanukiSolo() {
  const [phase, setPhase] = useState<Phase>("setup");
  const [level, setLevel] = useState(3);
  const [numPlayers, setNumPlayers] = useState(2);
  const [state, setState] = useState<BabaState | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);

  function addLog(s: string) {
    setLog((arr) => [s, ...arr].slice(0, 8));
  }

  const finalize = useCallback(
    (s: BabaState) => {
      if (!isBabaOver(s)) return false;
      const ranks = babaRanks(s);
      const meRank = ranks[HUMAN];
      const won = meRank < numPlayers; // ババ抜きは最後の1人が負け
      setMsg(won ? `あなたは ${meRank}位 で抜けました！` : "あなたが最後 → 負け");
      setPhase("finished");
      reportSoloResult({
        game: "babanuki",
        outcome: meRank === 1 ? 1 : meRank === numPlayers ? 0 : 0.5,
      }).catch(() => {});
      return true;
    },
    [numPlayers],
  );

  useEffect(() => {
    if (phase !== "playing" || !state) return;
    if (isBabaOver(state)) {
      finalize(state);
      return;
    }
    if (state.turn !== HUMAN) {
      const t = setTimeout(() => {
        const idx = aiPickIndex(state, state.turn, level);
        const drawer = state.turn;
        const opp = prevAlive(state, drawer);
        const { state: ns, drawn } = drawAndProgress(state, idx);
        addLog(
          `P${drawer + 1} が P${opp + 1} から引いた: ${
            drawn.suit === "JOKER" ? "🃏" : "(秘密)"
          }`,
        );
        setState(ns);
      }, 700);
      return () => clearTimeout(t);
    }
  }, [phase, state, level, finalize]);

  function start() {
    const s = initBaba(numPlayers);
    setState(s);
    setLog([]);
    setMsg(null);
    setPhase("playing");
  }

  function humanDraw(idx: number) {
    if (!state || state.turn !== HUMAN) return;
    const opp = prevAlive(state, HUMAN);
    const { state: ns, drawn } = drawAndProgress(state, idx);
    addLog(`あなたは P${opp + 1} から ${cardLabel(drawn)} を引いた`);
    setState(ns);
  }

  if (phase === "setup") {
    return (
      <Card className="max-w-md mx-auto">
        <CardHeader><CardTitle>ババ抜き - ソロ</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-medium mb-2">人数 (あなた + CPU)</p>
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
            <p className="text-sm font-medium mb-2">CPU レベル</p>
            <LevelPicker value={level} onChange={setLevel} />
          </div>
          <Button onClick={start}>開始</Button>
        </CardContent>
      </Card>
    );
  }

  if (!state) return null;

  const oppForHuman = prevAlive(state, HUMAN);
  const myTurn = state.turn === HUMAN && state.hands[HUMAN].length > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">ババ抜き Lv {level}</h2>
        <Button variant="ghost" size="sm" onClick={() => setPhase("setup")}>リセット</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>
              {myTurn
                ? `あなたの番 — P${oppForHuman + 1} から1枚引いてください`
                : `P${state.turn + 1} の番`}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Other players */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {state.hands.map((h, idx) =>
                idx === HUMAN ? null : (
                  <div key={idx} className="p-3 border rounded bg-slate-50 dark:bg-slate-900">
                    <p className="text-sm font-medium mb-1">
                      P{idx + 1} (CPU) — {h.length} 枚
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {h.map((c, i) => (
                        <PlayingCard
                          key={c.id}
                          card={c}
                          variant="back"
                          disabled={!myTurn || idx !== oppForHuman}
                          onClick={() => humanDraw(i)}
                        />
                      ))}
                    </div>
                  </div>
                ),
              )}
            </div>

            {/* My hand */}
            <div className="p-3 border rounded bg-amber-50 dark:bg-amber-950/30">
              <p className="text-sm font-medium mb-1">あなたの手札 ({state.hands[HUMAN].length}枚)</p>
              <div className="flex flex-wrap gap-1">
                {state.hands[HUMAN].map((c) => (
                  <PlayingCard key={c.id} card={c} variant="open" />
                ))}
              </div>
            </div>

            {msg && <p className="text-lg font-semibold">{msg}</p>}
            {phase === "finished" && (
              <Button onClick={() => setPhase("setup")}>もう一度</Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>ログ</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-xs">
            {log.map((l, i) => <p key={i}>{l}</p>)}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
