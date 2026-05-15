import { buildDeck, shuffle, type Card } from "./deck";

export interface ShinkeiState {
  board: (Card | null)[]; // length 52 (or 54 if jokers)
  revealed: boolean[];    // currently face-up (during a turn). Cleared on mismatch.
  taken: boolean[];       // permanently removed
  turn: number;
  scores: number[];       // pairs collected
  numPlayers: number;
  /** Per-AI memory: cardId -> position (0-based). Built when AI sees a flip. */
  memory: Record<number, Record<string, number>>;
}

export function initShinkei(numPlayers: number, withJokers = 0): ShinkeiState {
  const cards = shuffle(buildDeck(withJokers));
  return {
    board: cards,
    revealed: cards.map(() => false),
    taken: cards.map(() => false),
    turn: 0,
    scores: Array(numPlayers).fill(0),
    numPlayers,
    memory: {},
  };
}

export function flip(state: ShinkeiState, idx: number): ShinkeiState {
  if (state.taken[idx] || state.revealed[idx]) return state;
  const next: ShinkeiState = {
    ...state,
    revealed: state.revealed.slice(),
    memory: { ...state.memory },
  };
  next.revealed[idx] = true;
  // record memory for all "watchers" with chance based on their level: caller decides.
  // (We expose a separate updateMemory function so the UI can call once per flip.)
  return next;
}

export function resolveTurn(state: ShinkeiState): {
  state: ShinkeiState;
  matched: boolean;
  flippedIndices: number[];
} {
  const flipped: number[] = [];
  state.revealed.forEach((v, i) => v && flipped.push(i));
  if (flipped.length !== 2) {
    return { state, matched: false, flippedIndices: flipped };
  }
  const [a, b] = flipped;
  const ca = state.board[a]!;
  const cb = state.board[b]!;
  const matched =
    (ca.suit === "JOKER" && cb.suit === "JOKER") ||
    (ca.suit !== "JOKER" && cb.suit !== "JOKER" && ca.rank === cb.rank);

  const next: ShinkeiState = {
    ...state,
    revealed: state.board.map(() => false),
    taken: state.taken.slice(),
    scores: state.scores.slice(),
  };

  if (matched) {
    next.taken[a] = true;
    next.taken[b] = true;
    next.scores[state.turn] += 1;
    // same player continues
    next.turn = state.turn;
  } else {
    // advance
    let t = state.turn;
    for (let i = 0; i < state.numPlayers; i++) {
      t = (t + 1) % state.numPlayers;
      if (!isShinkeiOver(next)) break;
    }
    next.turn = t;
  }
  return { state: next, matched, flippedIndices: flipped };
}

export function isShinkeiOver(state: ShinkeiState): boolean {
  return state.taken.every(Boolean) ||
    state.taken.filter((x) => !x).length === 0;
}

export function shinkeiRanks(state: ShinkeiState): number[] {
  // higher score = better; ties -> same rank
  const scored = state.scores.map((s, i) => ({ i, s }));
  scored.sort((a, b) => b.s - a.s);
  const ranks = Array(state.numPlayers).fill(0);
  let currentRank = 0;
  let prev = Infinity;
  scored.forEach((x, idx) => {
    if (x.s !== prev) currentRank = idx + 1;
    ranks[x.i] = currentRank;
    prev = x.s;
  });
  return ranks;
}

/** Update AI memory: when index `idx` is flipped showing card `c`,
 *  each AI memorizes with probability `level/10`. */
export function memorize(
  state: ShinkeiState,
  aiPlayers: { player: number; level: number }[],
  idx: number,
): ShinkeiState {
  const c = state.board[idx];
  if (!c) return state;
  const memory = { ...state.memory };
  for (const ai of aiPlayers) {
    const rate = ai.level / 10;
    if (Math.random() < rate) {
      const m = { ...(memory[ai.player] ?? {}) };
      m[c.id] = idx;
      memory[ai.player] = m;
    }
  }
  return { ...state, memory };
}

/** AI: choose 2 indices to flip. */
export function aiPickPair(
  state: ShinkeiState,
  player: number,
  level: number,
): [number, number] {
  const available: number[] = [];
  state.taken.forEach((t, i) => {
    if (!t) available.push(i);
  });
  const mem = state.memory[player] ?? {};
  // find a known matching pair from memory
  const idsByRank = new Map<string, number[]>();
  for (const [id, idx] of Object.entries(mem)) {
    if (state.taken[idx]) continue;
    const c = state.board[idx];
    if (!c) continue;
    const key = c.suit === "JOKER" ? "JOKER" : String(c.rank);
    const arr = idsByRank.get(key) ?? [];
    arr.push(idx);
    idsByRank.set(key, arr);
  }
  for (const arr of idsByRank.values()) {
    if (arr.length >= 2) return [arr[0], arr[1]];
  }
  // pick first index intelligently: prefer unknown card to gain info
  const knownIdx = new Set(Object.values(mem));
  const unknown = available.filter((i) => !knownIdx.has(i));
  const firstPool = unknown.length > 0 ? unknown : available;
  const a = firstPool[Math.floor(Math.random() * firstPool.length)];
  // For second pick, see if memory has match for revealed card a
  const cardA = state.board[a]!;
  const matchKey = cardA.suit === "JOKER" ? "JOKER" : String(cardA.rank);
  const memArr = idsByRank.get(matchKey) ?? [];
  const memMatch = memArr.find((i) => i !== a);
  if (memMatch != null) return [a, memMatch];
  const rest = available.filter((i) => i !== a);
  const b = rest[Math.floor(Math.random() * rest.length)];
  return [a, b];
}
