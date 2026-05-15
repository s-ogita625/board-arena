"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Chess, type Square } from "chess.js";
import { ChessBoard } from "@/components/board/ChessBoard";
import { LevelPicker } from "@/components/common/LevelPicker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { pickChessMove } from "@/lib/games/chess/ai";
import { reportSoloResult } from "@/lib/results/report";

type Phase = "setup" | "playing" | "finished";

export function ChessSolo() {
  const [phase, setPhase] = useState<Phase>("setup");
  const [level, setLevel] = useState(3);
  const [humanColor, setHumanColor] = useState<"w" | "b">("w");
  const [tick, setTick] = useState(0);
  const [game] = useState(() => new Chess());
  const [resultMsg, setResultMsg] = useState<string | null>(null);

  // chess.js インスタンスは参照不変なので、内部状態の変化は tick で検知する
  const aiTurn = useMemo(() => game.turn() !== humanColor, [game, humanColor, tick]);

  const finalize = useCallback(() => {
    let outcome: 0 | 0.5 | 1 = 0.5;
    let msg = "引き分け";
    if (game.isCheckmate()) {
      const winnerWhite = game.turn() === "b";
      const humanWon = (winnerWhite && humanColor === "w") || (!winnerWhite && humanColor === "b");
      outcome = humanWon ? 1 : 0;
      msg = humanWon ? "あなたの勝ち！" : "CPUの勝ち";
    } else if (game.isDraw()) {
      msg = "引き分け";
      outcome = 0.5;
    }
    setResultMsg(msg);
    setPhase("finished");
    reportSoloResult({ game: "chess", outcome }).catch(() => {});
  }, [game, humanColor]);

  // AI move loop — tick も依存に入れて、AI が指した後 / プレイヤーが指した後の
  // 両方で再評価し終局判定する
  useEffect(() => {
    if (phase !== "playing") return;
    if (game.isGameOver()) {
      finalize();
      return;
    }
    if (aiTurn) {
      const t = setTimeout(() => {
        const san = pickChessMove(game.fen(), { level });
        if (san) {
          game.move(san);
          setTick((n) => n + 1);
        }
      }, 350);
      return () => clearTimeout(t);
    }
  }, [phase, aiTurn, tick, game, level, finalize]);

  function handleMove(from: Square, to: Square, promotion: "q" | "r" | "b" | "n" = "q") {
    if (phase !== "playing") return false;
    try {
      const m = game.move({ from, to, promotion });
      if (!m) return false;
      setTick((n) => n + 1);
      return true;
    } catch {
      return false;
    }
  }

  function newGame(side: "w" | "b") {
    game.reset();
    setHumanColor(side);
    setResultMsg(null);
    setPhase("playing");
    setTick((n) => n + 1);
  }

  if (phase === "setup") {
    return (
      <Card className="max-w-md mx-auto">
        <CardHeader>
          <CardTitle>チェス - ソロ</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-medium mb-2">CPU レベル (1 弱 ～ 10 強)</p>
            <LevelPicker value={level} onChange={setLevel} />
          </div>
          <div className="flex gap-2">
            <Button onClick={() => newGame("w")}>白で開始</Button>
            <Button onClick={() => newGame("b")} variant="secondary">黒で開始</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">チェス vs CPU Lv {level}</h2>
        <Button variant="ghost" size="sm" onClick={() => setPhase("setup")}>
          リセット
        </Button>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        <ChessBoard
          game={game}
          humanColor={humanColor}
          onMove={handleMove}
          flipped={humanColor === "b"}
          disabled={phase !== "playing"}
          versionKey={tick}
        />
        <Card className="flex-1">
          <CardHeader>
            <CardTitle>状況</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm" data-version={tick}>
            <p>あなた: {humanColor === "w" ? "白" : "黒"}</p>
            <p>手番: {game.turn() === "w" ? "白" : "黒"}</p>
            {game.inCheck() && <p className="text-red-600">王手！</p>}
            {resultMsg && (
              <p className="text-lg font-semibold mt-4">{resultMsg}</p>
            )}
            {phase === "finished" && (
              <Button onClick={() => setPhase("setup")} className="mt-2">
                もう一度
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
