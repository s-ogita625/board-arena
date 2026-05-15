import { buildDeck, shuffle, type Card } from "./deck";

/**
 * Simplified Daifugo (大富豪 / 大貧民) rules:
 *  - 4 players (or 2/3), one deck + 1 joker
 *  - Card strength: 3 < 4 < 5 < ... < 13(K) < 1(A) < 2 < Joker
 *  - Plays: singles, pairs, triples, quads (no sequences for simplicity)
 *  - Joker = wildcard (singletons only here)
 *  - Must beat current play in same count & higher rank, or pass
 *  - When everyone passes, last player resets and starts new trick
 *  - No revolution / 8-cut / shibari (kept simple to be reliably playable)
 */

export type Play = Card[]; // length 1..4

export interface DaifugoState {
  hands: Card[][];
  turn: number;
  current: Play | null;   // current top of pile
  lastPlayer: number | null; // last who played (becomes starter after passes)
  passes: number;         // consecutive passes
  finishedOrder: number[];
  numPlayers: number;
}

export function rankStrength(c: Card): number {
  if (c.suit === "JOKER") return 100;
  // 3..13 → 3..13, 1(A) → 14, 2 → 15
  if (c.rank === 1) return 14;
  if (c.rank === 2) return 15;
  return c.rank;
}

function sortHand(hand: Card[]): Card[] {
  return hand.slice().sort((a, b) => rankStrength(a) - rankStrength(b));
}

export function initDaifugo(numPlayers: number): DaifugoState {
  const deck = shuffle(buildDeck(1));
  const hands: Card[][] = Array.from({ length: numPlayers }, () => []);
  for (let i = 0; i < deck.length; i++) hands[i % numPlayers].push(deck[i]);
  return {
    hands: hands.map(sortHand),
    turn: 0,
    current: null,
    lastPlayer: null,
    passes: 0,
    finishedOrder: [],
    numPlayers,
  };
}

function groupByRank(hand: Card[]): Map<number, Card[]> {
  const m = new Map<number, Card[]>();
  for (const c of hand) {
    if (c.suit === "JOKER") continue;
    const arr = m.get(c.rank) ?? [];
    arr.push(c);
    m.set(c.rank, arr);
  }
  return m;
}

/** Enumerate legal plays from given hand against current top. */
export function legalPlays(hand: Card[], current: Play | null): Play[] {
  const out: Play[] = [];
  const jokers = hand.filter((c) => c.suit === "JOKER");
  const nonJokers = hand.filter((c) => c.suit !== "JOKER");
  const groups = groupByRank(nonJokers);

  const minStrength = current ? rankStrength(current[0]) : -1;
  const requiredLen = current ? current.length : 0;

  // singles
  if (!current || requiredLen === 1) {
    for (const [, cards] of groups) {
      for (const c of cards) {
        if (rankStrength(c) > minStrength) out.push([c]);
      }
    }
    for (const j of jokers) {
      // Joker single is always strongest
      out.push([j]);
    }
  }
  // pairs/triples/quads
  for (const want of [2, 3, 4]) {
    if (current && requiredLen !== want) continue;
    for (const [, cards] of groups) {
      if (cards.length + jokers.length < want) continue;
      const needJ = Math.max(0, want - cards.length);
      // use up to needJ jokers (only when joker available)
      if (cards.length >= want) {
        if (rankStrength(cards[0]) > minStrength) {
          out.push(cards.slice(0, want));
        }
      } else if (jokers.length >= needJ) {
        const combo = [...cards.slice(0, want - needJ), ...jokers.slice(0, needJ)];
        if (rankStrength(cards[0]) > minStrength) out.push(combo);
      }
    }
  }
  return out;
}

/** Strength of a play (used to rank choices). */
export function playStrength(p: Play): number {
  return rankStrength(p[0]);
}

export interface DaifugoMove {
  kind: "play" | "pass";
  cards?: Play;
}

export function applyDaifugoMove(state: DaifugoState, m: DaifugoMove): DaifugoState {
  const ns: DaifugoState = {
    ...state,
    hands: state.hands.map((h) => h.slice()),
  };
  if (m.kind === "pass" || !m.cards) {
    ns.passes += 1;
    // advance turn
    ns.turn = nextAlive(ns, ns.turn);
    // everyone but lastPlayer passed → reset
    const alive = ns.hands.filter((h) => h.length > 0).length;
    if (ns.passes >= alive - 1 && ns.lastPlayer != null) {
      ns.current = null;
      ns.passes = 0;
      ns.turn = ns.lastPlayer;
      // if lastPlayer already finished, skip to next alive
      if (ns.hands[ns.turn].length === 0) ns.turn = nextAlive(ns, ns.turn);
      ns.lastPlayer = null;
    }
    return ns;
  }
  // play
  const ids = new Set(m.cards.map((c) => c.id));
  ns.hands[state.turn] = ns.hands[state.turn].filter((c) => !ids.has(c.id));
  ns.current = m.cards;
  ns.lastPlayer = state.turn;
  ns.passes = 0;
  if (ns.hands[state.turn].length === 0 && !ns.finishedOrder.includes(state.turn)) {
    ns.finishedOrder.push(state.turn);
  }
  ns.turn = nextAlive(ns, state.turn);
  return ns;
}

function nextAlive(state: DaifugoState, from: number): number {
  let p = from;
  for (let i = 0; i < state.numPlayers; i++) {
    p = (p + 1) % state.numPlayers;
    if (state.hands[p].length > 0) return p;
  }
  return from;
}

export function isDaifugoOver(state: DaifugoState): boolean {
  return state.hands.filter((h) => h.length > 0).length <= 1;
}

export function daifugoRanks(state: DaifugoState): number[] {
  const ranks = Array(state.numPlayers).fill(state.numPlayers);
  state.finishedOrder.forEach((p, i) => (ranks[p] = i + 1));
  // remaining player gets last rank automatically
  return ranks;
}

/** AI: pick a play given level. */
export function aiPickDaifugo(state: DaifugoState, level: number): DaifugoMove {
  const hand = state.hands[state.turn];
  const plays = legalPlays(hand, state.current);
  if (plays.length === 0) return { kind: "pass" };

  // Level 1: random play (or pass occasionally)
  // Level 10: keep strong cards (don't burn 2/Joker early), prefer to dump weak
  const handStrength = hand.length;
  const sorted = plays.slice().sort((a, b) => playStrength(a) - playStrength(b));

  if (level <= 2) {
    const r = Math.random();
    if (state.current && r < 0.3) return { kind: "pass" };
    return { kind: "play", cards: plays[Math.floor(Math.random() * plays.length)] };
  }
  if (level >= 8) {
    // Prefer smallest play that beats current; save jokers/2s if not desperate.
    for (const p of sorted) {
      if (p[0].suit === "JOKER" && handStrength > 3) continue;
      if (rankStrength(p[0]) === 15 && handStrength > 4) continue; // save 2
      return { kind: "play", cards: p };
    }
    // fallback: play smallest available
    return { kind: "play", cards: sorted[0] };
  }
  // Mid levels: play the weakest legal play
  return { kind: "play", cards: sorted[0] };
}
