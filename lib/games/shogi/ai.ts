import { applyMove, evaluate, legalMoves, type Move, type State } from "./engine";

export interface ShogiAIOptions {
  level: number; // 1..10
}

function minimax(state: State, depth: number, alpha: number, beta: number): number {
  if (depth === 0) return evaluate(state);
  const moves = legalMoves(state);
  if (moves.length === 0) {
    // 詰み
    return state.turn === "S" ? -90000 : 90000;
  }
  if (state.turn === "S") {
    let v = -Infinity;
    for (const m of moves) {
      v = Math.max(v, minimax(applyMove(state, m), depth - 1, alpha, beta));
      alpha = Math.max(alpha, v);
      if (alpha >= beta) break;
    }
    return v;
  } else {
    let v = Infinity;
    for (const m of moves) {
      v = Math.min(v, minimax(applyMove(state, m), depth - 1, alpha, beta));
      beta = Math.min(beta, v);
      if (alpha >= beta) break;
    }
    return v;
  }
}

export function pickShogiMove(state: State, opts: ShogiAIOptions): Move | null {
  const lvl = Math.max(1, Math.min(10, opts.level));
  const moves = legalMoves(state);
  if (moves.length === 0) return null;

  const randomRate = Math.max(0, 0.9 - lvl * 0.09);
  if (Math.random() < randomRate) {
    return moves[Math.floor(Math.random() * moves.length)];
  }

  // Shogi branching factor is high; keep depth modest.
  const depth = lvl <= 3 ? 1 : lvl <= 6 ? 2 : 3;
  const maximizing = state.turn === "S";
  let bestScore = maximizing ? -Infinity : Infinity;
  let best: Move[] = [];
  for (const m of moves) {
    const v = minimax(applyMove(state, m), depth - 1, -Infinity, Infinity);
    if (maximizing ? v > bestScore : v < bestScore) {
      bestScore = v; best = [m];
    } else if (v === bestScore) {
      best.push(m);
    }
  }
  return best[Math.floor(Math.random() * best.length)];
}
