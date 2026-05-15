import { Chess, type Move } from "chess.js";

/**
 * Level: 1 (very weak) .. 10 (strongest)
 *  - depth scales 1..4
 *  - randomness scales from 80% random to 0%
 */
export interface ChessAIOptions {
  level: number; // 1..10
}

const PIECE_VALUE: Record<string, number> = {
  p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000,
};

function evaluate(game: Chess): number {
  if (game.isCheckmate()) return game.turn() === "w" ? -99999 : 99999;
  if (game.isDraw()) return 0;
  let score = 0;
  const board = game.board();
  for (const row of board) {
    for (const sq of row) {
      if (!sq) continue;
      const val = PIECE_VALUE[sq.type] ?? 0;
      score += sq.color === "w" ? val : -val;
    }
  }
  return score;
}

function minimax(
  game: Chess,
  depth: number,
  alpha: number,
  beta: number,
  maximizing: boolean,
): number {
  if (depth === 0 || game.isGameOver()) return evaluate(game);

  const moves = game.moves({ verbose: true }) as Move[];
  if (maximizing) {
    let value = -Infinity;
    for (const m of moves) {
      game.move(m);
      value = Math.max(value, minimax(game, depth - 1, alpha, beta, false));
      game.undo();
      alpha = Math.max(alpha, value);
      if (alpha >= beta) break;
    }
    return value;
  } else {
    let value = Infinity;
    for (const m of moves) {
      game.move(m);
      value = Math.min(value, minimax(game, depth - 1, alpha, beta, true));
      game.undo();
      beta = Math.min(beta, value);
      if (alpha >= beta) break;
    }
    return value;
  }
}

export function pickChessMove(fen: string, opts: ChessAIOptions): string | null {
  const lvl = Math.max(1, Math.min(10, opts.level));
  const game = new Chess(fen);
  const legal = game.moves({ verbose: true }) as Move[];
  if (legal.length === 0) return null;

  // Random portion: lvl1 → 80%, lvl10 → 0%
  const randomRate = Math.max(0, 0.9 - lvl * 0.09);
  if (Math.random() < randomRate) {
    return legal[Math.floor(Math.random() * legal.length)].san;
  }

  const depth = Math.min(4, 1 + Math.floor(lvl / 3)); // 1..4
  const isWhite = game.turn() === "w";

  let bestScore = isWhite ? -Infinity : Infinity;
  let bestMoves: Move[] = [];

  for (const m of legal) {
    game.move(m);
    const score = minimax(game, depth - 1, -Infinity, Infinity, !isWhite);
    game.undo();
    if (isWhite ? score > bestScore : score < bestScore) {
      bestScore = score;
      bestMoves = [m];
    } else if (score === bestScore) {
      bestMoves.push(m);
    }
  }
  const pick = bestMoves[Math.floor(Math.random() * bestMoves.length)];
  return pick.san;
}
