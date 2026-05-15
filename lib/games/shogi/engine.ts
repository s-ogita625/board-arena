/**
 * Minimal shogi engine.
 *  - 9x9 board, indices [row 0..8][col 0..8] with row 0 = sente (player) bottom? Here we use:
 *      row 0 = top (gote side initial), row 8 = bottom (sente side initial)
 *  - Sente (先手, lower-case) is the human-style "first player" — we use 'S'/'G' for owner.
 *  - Pieces:
 *      K(玉) R(飛) B(角) G(金) S(銀) N(桂) L(香) P(歩)
 *    Promoted: +R(竜) +B(馬) +S +N +L +P
 *  - Captures (持ち駒) per side as counts.
 *
 * NOTE: This is a compact but functional engine for casual play (no repetition rules,
 * no perpetual-check, no nifu detection beyond drop validation, no uchifuzume).
 */

export type Side = "S" | "G"; // 先手 / 後手
export type Piece =
  | "K" | "R" | "B" | "G" | "S" | "N" | "L" | "P"
  | "+R" | "+B" | "+S" | "+N" | "+L" | "+P";

export interface Cell {
  piece: Piece;
  owner: Side;
}

export type Board = (Cell | null)[][]; // [row][col]

export interface Hand {
  R: number; B: number; G: number; S: number; N: number; L: number; P: number;
}

export interface State {
  board: Board;
  hands: { S: Hand; G: Hand };
  turn: Side;
}

export type Move =
  | { kind: "move"; from: [number, number]; to: [number, number]; promote: boolean }
  | { kind: "drop"; piece: Exclude<Piece, "K" | `+${string}`>; to: [number, number] };

export function emptyHand(): Hand {
  return { R: 0, B: 0, G: 0, S: 0, N: 0, L: 0, P: 0 };
}

export function initialState(): State {
  const board: Board = Array.from({ length: 9 }, () => Array(9).fill(null));
  const set = (r: number, c: number, piece: Piece, owner: Side) => {
    board[r][c] = { piece, owner };
  };

  // Gote (top, rows 0..2)
  set(0, 0, "L", "G");
  set(0, 1, "N", "G");
  set(0, 2, "S", "G");
  set(0, 3, "G", "G");
  set(0, 4, "K", "G");
  set(0, 5, "G", "G");
  set(0, 6, "S", "G");
  set(0, 7, "N", "G");
  set(0, 8, "L", "G");
  set(1, 1, "B", "G");
  set(1, 7, "R", "G");
  for (let c = 0; c < 9; c++) set(2, c, "P", "G");

  // Sente (bottom, rows 6..8)
  for (let c = 0; c < 9; c++) set(6, c, "P", "S");
  set(7, 1, "R", "S");
  set(7, 7, "B", "S");
  set(8, 0, "L", "S");
  set(8, 1, "N", "S");
  set(8, 2, "S", "S");
  set(8, 3, "G", "S");
  set(8, 4, "K", "S");
  set(8, 5, "G", "S");
  set(8, 6, "S", "S");
  set(8, 7, "N", "S");
  set(8, 8, "L", "S");

  return { board, hands: { S: emptyHand(), G: emptyHand() }, turn: "S" };
}

const DIR = {
  N: [-1, 0],
  S: [1, 0],
  E: [0, 1],
  W: [0, -1],
  NE: [-1, 1],
  NW: [-1, -1],
  SE: [1, 1],
  SW: [1, -1],
} as const;

// "forward" depends on side; for S forward = -1 (up), for G forward = +1 (down)
function forward(side: Side) { return side === "S" ? -1 : 1; }

function inBoard(r: number, c: number) {
  return r >= 0 && r < 9 && c >= 0 && c < 9;
}

function pieceMoves(state: State, r: number, c: number): [number, number][] {
  const cell = state.board[r][c];
  if (!cell) return [];
  const { piece, owner } = cell;
  const f = forward(owner);
  const targets: [number, number][] = [];

  const slide = (dr: number, dc: number) => {
    let nr = r + dr, nc = c + dc;
    while (inBoard(nr, nc)) {
      const t = state.board[nr][nc];
      if (!t) {
        targets.push([nr, nc]);
      } else {
        if (t.owner !== owner) targets.push([nr, nc]);
        break;
      }
      nr += dr; nc += dc;
    }
  };
  const step = (dr: number, dc: number) => {
    const nr = r + dr, nc = c + dc;
    if (!inBoard(nr, nc)) return;
    const t = state.board[nr][nc];
    if (!t || t.owner !== owner) targets.push([nr, nc]);
  };

  switch (piece) {
    case "P":
      step(f, 0); break;
    case "L":
      slide(f, 0); break;
    case "N":
      step(2 * f, -1); step(2 * f, 1); break;
    case "S":
      step(f, -1); step(f, 0); step(f, 1);
      step(-f, -1); step(-f, 1);
      break;
    case "G":
    case "+P": case "+L": case "+N": case "+S":
      step(f, -1); step(f, 0); step(f, 1);
      step(0, -1); step(0, 1);
      step(-f, 0);
      break;
    case "K":
      for (const k of Object.keys(DIR) as (keyof typeof DIR)[]) {
        const [dr, dc] = DIR[k]; step(dr, dc);
      }
      break;
    case "B":
      slide(1, 1); slide(1, -1); slide(-1, 1); slide(-1, -1); break;
    case "R":
      slide(1, 0); slide(-1, 0); slide(0, 1); slide(0, -1); break;
    case "+B":
      slide(1, 1); slide(1, -1); slide(-1, 1); slide(-1, -1);
      step(1, 0); step(-1, 0); step(0, 1); step(0, -1);
      break;
    case "+R":
      slide(1, 0); slide(-1, 0); slide(0, 1); slide(0, -1);
      step(1, 1); step(1, -1); step(-1, 1); step(-1, -1);
      break;
  }
  return targets;
}

function inPromotionZone(side: Side, r: number): boolean {
  return side === "S" ? r <= 2 : r >= 6;
}

function mustPromote(side: Side, piece: Piece, r: number): boolean {
  if (piece === "P" || piece === "L") {
    return side === "S" ? r === 0 : r === 8;
  }
  if (piece === "N") {
    return side === "S" ? r <= 1 : r >= 7;
  }
  return false;
}

function canPromote(piece: Piece): boolean {
  return ["P", "L", "N", "S", "B", "R"].includes(piece);
}

function promote(piece: Piece): Piece {
  switch (piece) {
    case "P": return "+P";
    case "L": return "+L";
    case "N": return "+N";
    case "S": return "+S";
    case "B": return "+B";
    case "R": return "+R";
    default: return piece;
  }
}

function unpromote(piece: Piece): Piece {
  if (piece.startsWith("+")) return piece.slice(1) as Piece;
  return piece;
}

export function legalMoves(state: State): Move[] {
  const out: Move[] = [];
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const cell = state.board[r][c];
      if (!cell || cell.owner !== state.turn) continue;
      const tos = pieceMoves(state, r, c);
      for (const [nr, nc] of tos) {
        const canPromo = canPromote(cell.piece) &&
          (inPromotionZone(state.turn, r) || inPromotionZone(state.turn, nr));
        const must = mustPromote(state.turn, cell.piece, nr);
        if (must) {
          out.push({ kind: "move", from: [r, c], to: [nr, nc], promote: true });
        } else {
          out.push({ kind: "move", from: [r, c], to: [nr, nc], promote: false });
          if (canPromo) {
            out.push({ kind: "move", from: [r, c], to: [nr, nc], promote: true });
          }
        }
      }
    }
  }
  // drops
  const hand = state.hands[state.turn];
  const dropable: (keyof Hand)[] = ["R", "B", "G", "S", "N", "L", "P"];
  for (const p of dropable) {
    if (hand[p] <= 0) continue;
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (state.board[r][c]) continue;
        // 不成・行き所のない駒の制限
        if (p === "P" || p === "L") {
          if (state.turn === "S" && r === 0) continue;
          if (state.turn === "G" && r === 8) continue;
        }
        if (p === "N") {
          if (state.turn === "S" && r <= 1) continue;
          if (state.turn === "G" && r >= 7) continue;
        }
        // 二歩
        if (p === "P") {
          let nifu = false;
          for (let rr = 0; rr < 9; rr++) {
            const x = state.board[rr][c];
            if (x && x.owner === state.turn && x.piece === "P") { nifu = true; break; }
          }
          if (nifu) continue;
        }
        out.push({ kind: "drop", piece: p as Move extends { kind: "drop"; piece: infer P } ? P : never, to: [r, c] });
      }
    }
  }
  // Filter moves that leave own king in check
  return out.filter((m) => {
    const next = applyMove(state, m);
    return !isInCheck(next, state.turn);
  });
}

export function findKing(state: State, side: Side): [number, number] | null {
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const x = state.board[r][c];
      if (x && x.owner === side && x.piece === "K") return [r, c];
    }
  }
  return null;
}

export function isInCheck(state: State, side: Side): boolean {
  const k = findKing(state, side);
  if (!k) return true; // king captured
  const opp: Side = side === "S" ? "G" : "S";
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const cell = state.board[r][c];
      if (!cell || cell.owner !== opp) continue;
      const tos = pieceMoves(state, r, c);
      for (const [nr, nc] of tos) {
        if (nr === k[0] && nc === k[1]) return true;
      }
    }
  }
  return false;
}

export function applyMove(state: State, m: Move): State {
  // deep-ish copy
  const board: Board = state.board.map((row) => row.map((x) => (x ? { ...x } : null)));
  const hands = {
    S: { ...state.hands.S },
    G: { ...state.hands.G },
  };
  const turn: Side = state.turn === "S" ? "G" : "S";

  if (m.kind === "move") {
    const [fr, fc] = m.from;
    const [tr, tc] = m.to;
    const piece = board[fr][fc]!;
    const target = board[tr][tc];
    if (target) {
      // capture: piece type becomes (unpromoted) and owner flips
      const key = unpromote(target.piece) as keyof Hand;
      if (key !== ("K" as never)) {
        hands[state.turn][key] = (hands[state.turn][key] ?? 0) + 1;
      }
    }
    const newPiece: Piece = m.promote ? promote(piece.piece) : piece.piece;
    board[tr][tc] = { piece: newPiece, owner: piece.owner };
    board[fr][fc] = null;
  } else {
    const [tr, tc] = m.to;
    hands[state.turn][m.piece] -= 1;
    board[tr][tc] = { piece: m.piece, owner: state.turn };
  }

  return { board, hands, turn };
}

const PIECE_VALUE: Record<Piece, number> = {
  P: 100, L: 430, N: 450, S: 640, G: 690, B: 890, R: 1040, K: 15000,
  "+P": 420, "+L": 540, "+N": 560, "+S": 670, "+B": 1150, "+R": 1300,
};

export function evaluate(state: State): number {
  let score = 0;
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const cell = state.board[r][c];
      if (!cell) continue;
      const v = PIECE_VALUE[cell.piece] ?? 0;
      score += cell.owner === "S" ? v : -v;
    }
  }
  const handValues = (h: Hand) =>
    h.P * 90 + h.L * 400 + h.N * 420 + h.S * 600 + h.G * 650 + h.B * 850 + h.R * 1000;
  score += handValues(state.hands.S);
  score -= handValues(state.hands.G);
  return score;
}

export const PIECE_KANJI: Record<Piece, string> = {
  K: "玉", R: "飛", B: "角", G: "金", S: "銀", N: "桂", L: "香", P: "歩",
  "+R": "竜", "+B": "馬", "+S": "全", "+N": "圭", "+L": "杏", "+P": "と",
};
