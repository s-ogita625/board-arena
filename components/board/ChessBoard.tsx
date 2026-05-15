"use client";

import { useMemo, useState } from "react";
import type { Chess, Square } from "chess.js";
import { cn } from "@/lib/utils";

const PIECE_GLYPH: Record<string, string> = {
  wp: "♙", wn: "♘", wb: "♗", wr: "♖", wq: "♕", wk: "♔",
  bp: "♟", bn: "♞", bb: "♝", br: "♜", bq: "♛", bk: "♚",
};

interface Props {
  game: Chess;
  /** color the human plays as; "w" or "b". Set to null to allow both sides (e.g. analysis) */
  humanColor?: "w" | "b" | null;
  onMove: (from: Square, to: Square, promotion?: "q" | "r" | "b" | "n") => boolean;
  flipped?: boolean;
  disabled?: boolean;
  /** 親側で手番を進めるたびに変わるキー。同一 game 参照の中身が変わった事を React に伝える */
  versionKey?: number;
}

export function ChessBoard({
  game,
  humanColor = "w",
  onMove,
  flipped = false,
  disabled,
  versionKey = 0,
}: Props) {
  const [from, setFrom] = useState<Square | null>(null);

  const board = useMemo(() => game.board(), [game, versionKey]);
  const rows = flipped ? [...board].reverse() : board;
  const files = flipped ? ["h", "g", "f", "e", "d", "c", "b", "a"] : ["a", "b", "c", "d", "e", "f", "g", "h"];

  const legalTargets = useMemo(() => {
    if (!from) return new Set<string>();
    const moves = game.moves({ square: from, verbose: true }) as { to: string }[];
    return new Set(moves.map((m) => m.to));
  }, [from, game, versionKey]);

  function onSquareClick(sq: Square) {
    if (disabled) return;
    if (humanColor && game.turn() !== humanColor) return;
    const piece = game.get(sq);
    if (from) {
      if (sq === from) {
        setFrom(null);
        return;
      }
      // try move
      const ok = onMove(from, sq, "q");
      setFrom(null);
      if (!ok && piece && piece.color === game.turn()) {
        setFrom(sq);
      }
    } else {
      if (piece && piece.color === game.turn()) setFrom(sq);
    }
  }

  return (
    <div className="inline-block border border-slate-700 select-none">
      {rows.map((row, rIdx) => {
        const cells = flipped ? [...row].reverse() : row;
        const rankNum = flipped ? rIdx + 1 : 8 - rIdx;
        return (
          <div key={rIdx} className="flex">
            {cells.map((cell, cIdx) => {
              const file = files[cIdx];
              const sq = `${file}${rankNum}` as Square;
              const isLight = (rIdx + cIdx) % 2 === 0;
              const isSel = from === sq;
              const isTarget = legalTargets.has(sq);
              const glyph = cell ? PIECE_GLYPH[`${cell.color}${cell.type}`] : "";
              return (
                <button
                  key={sq}
                  onClick={() => onSquareClick(sq)}
                  className={cn(
                    "w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center text-3xl sm:text-4xl",
                    isLight ? "bg-board-light" : "bg-board-dark",
                    isSel && "ring-2 ring-inset ring-yellow-400",
                    isTarget && "after:content-[''] relative",
                  )}
                  aria-label={sq}
                >
                  {isTarget && !cell && (
                    <span className="absolute w-3 h-3 rounded-full bg-emerald-600/60" />
                  )}
                  {isTarget && cell && (
                    <span className="absolute inset-0 ring-2 ring-emerald-600/70 rounded" />
                  )}
                  <span className={cn(cell?.color === "w" ? "text-white drop-shadow" : "text-black")}>
                    {glyph}
                  </span>
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
