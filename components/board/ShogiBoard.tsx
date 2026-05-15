"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  applyMove,
  legalMoves,
  PIECE_KANJI,
  type Move,
  type Side,
  type State,
} from "@/lib/games/shogi/engine";

interface Props {
  state: State;
  humanSide: Side;
  onMove: (m: Move) => void;
  disabled?: boolean;
}

type Selection =
  | { kind: "board"; r: number; c: number }
  | { kind: "hand"; piece: "R" | "B" | "G" | "S" | "N" | "L" | "P" }
  | null;

export function ShogiBoard({ state, humanSide, onMove, disabled }: Props) {
  const [sel, setSel] = useState<Selection>(null);

  const allMoves = useMemo(() => legalMoves(state), [state]);

  const legalForSel = useMemo(() => {
    if (!sel) return [] as Move[];
    if (sel.kind === "board") {
      return allMoves.filter(
        (m) => m.kind === "move" && m.from[0] === sel.r && m.from[1] === sel.c,
      );
    }
    return allMoves.filter((m) => m.kind === "drop" && m.piece === sel.piece);
  }, [sel, allMoves]);

  function clickBoard(r: number, c: number) {
    if (disabled || state.turn !== humanSide) return;
    if (!sel) {
      const cell = state.board[r][c];
      if (cell && cell.owner === humanSide) setSel({ kind: "board", r, c });
      return;
    }
    const move = legalForSel.find((m) => m.to[0] === r && m.to[1] === c);
    if (!move) {
      // re-select if clicked own piece
      const cell = state.board[r][c];
      if (cell && cell.owner === humanSide) {
        setSel({ kind: "board", r, c });
      } else {
        setSel(null);
      }
      return;
    }
    // Promotion option for moves
    if (move.kind === "move") {
      const alt = legalForSel.find(
        (m) =>
          m.kind === "move" &&
          m.to[0] === r &&
          m.to[1] === c &&
          m.promote !== move.promote,
      );
      if (alt) {
        const promote = confirm("成りますか？");
        const chosen = promote
          ? legalForSel.find(
              (m) => m.kind === "move" && m.to[0] === r && m.to[1] === c && m.promote,
            )
          : legalForSel.find(
              (m) => m.kind === "move" && m.to[0] === r && m.to[1] === c && !m.promote,
            );
        if (chosen) onMove(chosen);
        setSel(null);
        return;
      }
    }
    onMove(move);
    setSel(null);
  }

  function clickHand(piece: "R" | "B" | "G" | "S" | "N" | "L" | "P", side: Side) {
    if (disabled || state.turn !== humanSide || side !== humanSide) return;
    if (state.hands[side][piece] <= 0) return;
    setSel({ kind: "hand", piece });
  }

  const targets = new Set(legalForSel.map((m) => `${m.to[0]},${m.to[1]}`));

  // For display: if humanSide is Sente (S), keep board as-is (row 0 top = G).
  // If humanSide is Gote (G), flip board.
  const flipped = humanSide === "G";

  function renderHand(side: Side) {
    const h = state.hands[side];
    const entries = Object.entries(h) as ["R" | "B" | "G" | "S" | "N" | "L" | "P", number][];
    return (
      <div className={cn("flex gap-1 flex-wrap p-2 border rounded", side === humanSide ? "bg-amber-50 dark:bg-amber-950/30" : "")}>
        <span className="text-xs text-slate-500 self-center w-12">
          {side === "S" ? "先手" : "後手"}
        </span>
        {entries.filter(([, n]) => n > 0).length === 0 ? (
          <span className="text-xs text-slate-400">—</span>
        ) : (
          entries.map(
            ([p, n]) =>
              n > 0 && (
                <button
                  key={p}
                  onClick={() => clickHand(p, side)}
                  disabled={side !== humanSide || state.turn !== humanSide}
                  className={cn(
                    "px-2 py-1 text-sm border rounded",
                    sel?.kind === "hand" && sel.piece === p
                      ? "bg-yellow-200 dark:bg-yellow-700"
                      : "bg-white dark:bg-slate-900",
                    side !== humanSide && "opacity-60 cursor-not-allowed",
                  )}
                >
                  {PIECE_KANJI[p]}×{n}
                </button>
              ),
          )
        )}
      </div>
    );
  }

  const rows = flipped ? [...state.board].slice().reverse() : state.board;

  return (
    <div className="space-y-2 inline-block">
      {renderHand(flipped ? "S" : "G")}
      <div className="inline-block border border-slate-700">
        {rows.map((row, rIdx) => {
          const realR = flipped ? 8 - rIdx : rIdx;
          const cells = flipped ? [...row].slice().reverse() : row;
          return (
            <div key={realR} className="flex">
              {cells.map((cell, cIdx) => {
                const realC = flipped ? 8 - cIdx : cIdx;
                const isSel =
                  sel?.kind === "board" && sel.r === realR && sel.c === realC;
                const isTarget = targets.has(`${realR},${realC}`);
                return (
                  <button
                    key={realC}
                    onClick={() => clickBoard(realR, realC)}
                    className={cn(
                      "w-9 h-10 sm:w-11 sm:h-12 border border-slate-700/60 flex items-center justify-center text-lg sm:text-xl",
                      "bg-amber-100 dark:bg-amber-900/40",
                      isSel && "ring-2 ring-yellow-500",
                      isTarget && "bg-emerald-200/70 dark:bg-emerald-700/40",
                    )}
                  >
                    {cell ? (
                      <span
                        className={cn(
                          "leading-none",
                          // The opponent's pieces face the viewer upside-down.
                          // Previously this was hard-coded to "G", which made
                          // the Gote player's own pieces appear inverted.
                          cell.owner !== humanSide && "rotate-180",
                          cell.piece.startsWith("+") && "text-red-700",
                        )}
                      >
                        {PIECE_KANJI[cell.piece]}
                      </span>
                    ) : (
                      ""
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
      {renderHand(flipped ? "G" : "S")}
    </div>
  );
}
