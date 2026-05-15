import { applyMove, evaluate, legalMoves, type Move, type State } from "./engine";

export interface ShogiAIOptions {
  level: number; // 1..10
}

const PIECE_VALUE: Record<string, number> = {
  P: 100, L: 430, N: 450, S: 640, G: 690, B: 890, R: 1040, K: 15000,
  "+P": 420, "+L": 540, "+N": 560, "+S": 670, "+B": 1150, "+R": 1300,
};
function pieceValue(p: string): number {
  return PIECE_VALUE[p] ?? 0;
}

/**
 * Score a move for move-ordering. Captures (MVV-LVA) and promotions go first,
 * which dramatically improves alpha-beta cutoffs.
 */
function scoreMove(state: State, m: Move): number {
  let s = 0;
  if (m.kind === "move") {
    const target = state.board[m.to[0]][m.to[1]];
    if (target) {
      s += 1000;
      const attacker = state.board[m.from[0]][m.from[1]];
      const cap = pieceValue(target.piece);
      const att = attacker ? pieceValue(attacker.piece) : 0;
      s += cap * 10 - att;
    }
    if (m.promote) s += 200;
  } else {
    s += 5; // small bias for drops
  }
  return s;
}

function orderedMoves(state: State): Move[] {
  return legalMoves(state)
    .map((m) => ({ m, s: scoreMove(state, m) }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.m);
}

/**
 * Quiescence: at the search horizon, keep expanding capturing moves only to
 * avoid the horizon effect on piece exchanges.
 */
function quiescence(state: State, alpha: number, beta: number, qDepth: number): number {
  const stand = evaluate(state);
  if (qDepth <= 0) return stand;
  if (state.turn === "S") {
    if (stand >= beta) return beta;
    if (stand > alpha) alpha = stand;
  } else {
    if (stand <= alpha) return alpha;
    if (stand < beta) beta = stand;
  }
  const captures = legalMoves(state).filter(
    (m) => m.kind === "move" && state.board[m.to[0]][m.to[1]] != null,
  );
  if (captures.length === 0) return stand;
  const ordered = captures
    .map((m) => ({ m, s: scoreMove(state, m) }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.m);

  if (state.turn === "S") {
    let v = stand;
    for (const m of ordered) {
      const sc = quiescence(applyMove(state, m), alpha, beta, qDepth - 1);
      if (sc > v) v = sc;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    return v;
  } else {
    let v = stand;
    for (const m of ordered) {
      const sc = quiescence(applyMove(state, m), alpha, beta, qDepth - 1);
      if (sc < v) v = sc;
      if (v < beta) beta = v;
      if (alpha >= beta) break;
    }
    return v;
  }
}

function alphaBeta(state: State, depth: number, alpha: number, beta: number, qDepth: number): number {
  if (depth === 0) return quiescence(state, alpha, beta, qDepth);
  const moves = orderedMoves(state);
  if (moves.length === 0) {
    return state.turn === "S" ? -90000 : 90000;
  }
  if (state.turn === "S") {
    let v = -Infinity;
    for (const m of moves) {
      v = Math.max(v, alphaBeta(applyMove(state, m), depth - 1, alpha, beta, qDepth));
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    return v;
  } else {
    let v = Infinity;
    for (const m of moves) {
      v = Math.min(v, alphaBeta(applyMove(state, m), depth - 1, alpha, beta, qDepth));
      if (v < beta) beta = v;
      if (alpha >= beta) break;
    }
    return v;
  }
}

/** If the king is sitting there to be taken, always take it. */
function findInstantMate(state: State): Move | null {
  for (const m of legalMoves(state)) {
    if (m.kind !== "move") continue;
    const target = state.board[m.to[0]][m.to[1]];
    if (target && target.piece === "K") return m;
  }
  return null;
}

export function pickShogiMove(state: State, opts: ShogiAIOptions): Move | null {
  const lvl = Math.max(1, Math.min(10, opts.level));
  const moves = orderedMoves(state);
  if (moves.length === 0) return null;

  const instant = findInstantMate(state);
  if (instant) return instant;

  // Random rate decays with level. Lv1 ~76% random, Lv10 fully deterministic.
  const randomRate = Math.max(0, 0.85 - lvl * 0.09);
  if (Math.random() < randomRate) {
    // Even on a random pick, prefer the better half of ordered moves so it
    // isn't catastrophically bad at low levels.
    const pool = moves.slice(0, Math.max(1, Math.floor(moves.length / 2)));
    return pool[Math.floor(Math.random() * pool.length)];
  }

  const depth = lvl <= 2 ? 1 : lvl <= 4 ? 2 : lvl <= 7 ? 3 : 4;
  const qDepth = lvl <= 4 ? 0 : lvl <= 7 ? 2 : 4;
  const maximizing = state.turn === "S";

  // Iterative deepening: each iter refines the root preference.
  let bestScore = maximizing ? -Infinity : Infinity;
  let best: Move[] = [moves[0]];
  for (let d = 1; d <= depth; d++) {
    let iterScore = maximizing ? -Infinity : Infinity;
    let iterBest: Move[] = [];
    for (const m of moves) {
      const v = alphaBeta(applyMove(state, m), d - 1, -Infinity, Infinity, qDepth);
      if (maximizing ? v > iterScore : v < iterScore) {
        iterScore = v;
        iterBest = [m];
      } else if (v === iterScore) {
        iterBest.push(m);
      }
    }
    bestScore = iterScore;
    best = iterBest;
    if (Math.abs(bestScore) >= 80000) break; // forced mate line found
  }

  return best[Math.floor(Math.random() * best.length)];
}
