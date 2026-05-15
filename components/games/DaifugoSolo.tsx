"use client";

import { useCallback, useEffect, useState } from "react";
import { LevelPicker } from "@/components/common/LevelPicker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  aiPickDaifugo,
  applyDaifugoMove,
  daifugoRanks,
  initDaifugo,
  isDaifugoOver,
  legalPlays,
  type DaifugoState,
} from "@/lib/games/cards/daifugo";
import { cardLabel, type Card as PlayCard } from "@/lib/games/cards/deck";
import { PlayingCard } from "@/components/board/PlayingCard";
import { reportSoloResult } from "@/lib/results/report";

const HUMAN = 0;
type Phase = "setup" | "playing" | "finished";

export function DaifugoSolo() {
  const [phase, setPhase] = useState<Phase>("setup");
  const [level, setLevel] = useState(3);
  const [numPlayers, setNumPlayers] = useState(2);
  const [state, setState] = useState<DaifugoState | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);

  function addLog(s: string) { setLog((arr) => [s, ...arr].slice(0, 10)); }

  const finalize = useCallback(
    (s: DaifugoState) => {
      if (!isDaifugoOver(s)) return false;
      const r = daifugoRanks(s);
      const meRank = r[HUMAN];
      setMsg(`あなたは ${meRank}位 / ${numPlayers}人`);
      setPhase("finished");
      const outcome: 0 | 0.5 | 1 = meRank === 1 ? 1 : meRank === numPlayers ? 0 : 0.5;
      reportSoloResult({ game: "daifugo", outcome }).catch(() => {});
      return true;
    },
    [numPlayers],
  );

  useEffect(() => {
    if (phase !== "playing" || !state) return;
    if (isDaifugoOver(state)) { finalize(state); return; }
    if (state.turn !== HUMAN) {
      const t = setTimeout(() => {
        const move = aiPickDaifugo(state, level);
        const next = applyDaifugoMove(state, move);
        addLog(
          move.kind === "pass"
            ? `P${state.turn + 1} パス`
            : `P${state.turn + 1} → ${move.cards!.map(cardLabel).join(" ")}`,
        );
        setState(next);
        finalize(next);
      }, 600);
      return () => clearTimeout(t);
    }
  }, [phase, state, level, finalize]);

  function start() {
    const s = initDaifugo(numPlayers);
    setState(s);
    setSelected(new Set());
    setMsg(null);
    setLog([]);
    setPhase("playing");
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function humanPlay() {
    if (!state) return;
    const hand = state.hands[HUMAN];
    const chosen = hand.filter((c) => selected.has(c.id));
    if (chosen.length === 0) return;
    // ensure equal ranks (allow joker as wildcard for >=2 cards)
    const plays = legalPlays(hand, state.current);
    const match = plays.find(
      (p) =>
        p.length === chosen.length &&
        p.every((c) => chosen.find((x) => x.id === c.id)),
    );
    if (!match) {
      addLog("⚠ その出し方はできません");
      return;
    }
    const next = applyDaifugoMove(state, { kind: "play", cards: chosen });
    addLog(`あなた → ${chosen.map(cardLabel).join(" ")}`);
    setState(next);
    setSelected(new Set());
    finalize(next);
  }

  function humanPass() {
    if (!state) return;
    const next = applyDaifugoMove(state, { kind: "pass" });
    addLog("あなた → パス");
    setState(next);
    setSelected(new Set());
  }

  if (phase === "setup") {
    return (
      <Card className="max-w-md mx-auto">
        <CardHeader><CardTitle>大富豪 - ソロ</CardTitle></CardHeader>
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
            <p className="text-xs text-slate-500 mt-1">
              ※ 簡易ルール: シングル/ペア/トリプル/クアド・ジョーカー1枚。革命/8切り/しばり無し。
            </p>
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
  const myTurn = state.turn === HUMAN && state.hands[HUMAN].length > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">大富豪 Lv {level}</h2>
        <Button variant="ghost" size="sm" onClick={() => setPhase("setup")}>リセット</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>
              {myTurn ? "あなたの番" : `P${state.turn + 1} の番`}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-3 border rounded bg-slate-50 dark:bg-slate-900">
              <p className="text-xs text-slate-500">場</p>
              <div className="flex flex-wrap gap-1 min-h-[3rem] items-center">
                {state.current
                  ? state.current.map((c) => (
                      <PlayingCard key={c.id} card={c} variant="open" size="sm" />
                    ))
                  : <span className="text-xs text-slate-400">（場は流れています）</span>}
              </div>
            </div>

            {/* Opponent hand counts */}
            <div className="grid grid-cols-2 gap-2">
              {state.hands.map((h, i) =>
                i === HUMAN ? null : (
                  <div key={i} className="text-xs p-2 border rounded">
                    P{i + 1} (CPU) — {h.length} 枚
                  </div>
                ),
              )}
            </div>

            <div className="p-3 border rounded bg-amber-50 dark:bg-amber-950/30">
              <p className="text-sm font-medium mb-1">あなたの手札 ({state.hands[HUMAN].length}枚)</p>
              <div className="flex flex-wrap gap-1">
                {state.hands[HUMAN].map((c: PlayCard) => (
                  <PlayingCard
                    key={c.id}
                    card={c}
                    variant="open"
                    selected={selected.has(c.id)}
                    disabled={!myTurn}
                    onClick={() => toggle(c.id)}
                  />
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={humanPlay} disabled={!myTurn || selected.size === 0}>
                出す ({selected.size})
              </Button>
              <Button onClick={humanPass} disabled={!myTurn || !state.current} variant="secondary">
                パス
              </Button>
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
