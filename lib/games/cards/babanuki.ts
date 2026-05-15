import { buildDeck, shuffle, type Card } from "./deck";

export interface BabaState {
  hands: Card[][];          // hand per player; empty array = finished/winner
  finishedOrder: number[];  // player indices in order they ran out
  turn: number;             // whose turn (active player; turn means "this player draws from previous active player")
  numPlayers: number;
  /**
   * AI memory: for each player and each card id, prob of being the joker (0..1).
   * Updated by AI when they draw and discover.
   */
  memory: Record<number, Record<string, number>>;
}

function discardPairs(hand: Card[]): Card[] {
  const counts = new Map<number, Card[]>();
  for (const c of hand) {
    if (c.suit === "JOKER") continue;
    const arr = counts.get(c.rank) ?? [];
    arr.push(c);
    counts.set(c.rank, arr);
  }
  const removeIds = new Set<string>();
  for (const arr of counts.values()) {
    const pairs = Math.floor(arr.length / 2);
    for (let i = 0; i < pairs * 2; i++) removeIds.add(arr[i].id);
  }
  return hand.filter((c) => !removeIds.has(c.id));
}

export function initBaba(numPlayers: number): BabaState {
  const deck = shuffle(buildDeck(1));
  const hands: Card[][] = Array.from({ length: numPlayers }, () => []);
  let idx = 0;
  for (const card of deck) {
    hands[idx % numPlayers].push(card);
    idx++;
  }
  const reduced = hands.map(discardPairs);
  return {
    hands: reduced,
    finishedOrder: [],
    turn: 0,
    numPlayers,
    memory: {},
  };
}

/** Returns the next player who still has cards, going forward. */
function nextAlive(state: BabaState, from: number): number {
  let p = from;
  for (let i = 0; i < state.numPlayers; i++) {
    p = (p + 1) % state.numPlayers;
    if (state.hands[p].length > 0) return p;
  }
  return from;
}

/** previous alive player (the one this player draws from on their turn) */
export function prevAlive(state: BabaState, from: number): number {
  let p = from;
  for (let i = 0; i < state.numPlayers; i++) {
    p = (p - 1 + state.numPlayers) % state.numPlayers;
    if (state.hands[p].length > 0) return p;
  }
  return from;
}

/** Draw card at given index from previous player into current player's hand,
 *  discard pairs, advance turn. Returns updated state and the drawn card id. */
export function drawAndProgress(
  state: BabaState,
  cardIndex: number,
): { state: BabaState; drawn: Card } {
  const me = state.turn;
  const opp = prevAlive(state, me);
  const newHands = state.hands.map((h) => h.slice());
  const drawn = newHands[opp].splice(cardIndex, 1)[0];
  newHands[me].push(drawn);
  newHands[me] = discardPairs(newHands[me]);
  // Reshuffle every hand so card indices change between turns. Without this
  // both players can memorize joker positions and avoid them indefinitely.
  for (let i = 0; i < newHands.length; i++) newHands[i] = shuffle(newHands[i]);
  const finished = [...state.finishedOrder];
  if (newHands[me].length === 0 && !finished.includes(me)) finished.push(me);
  if (newHands[opp].length === 0 && !finished.includes(opp)) finished.push(opp);

  let nextTurn = nextAlive({ ...state, hands: newHands }, me);
  // skip me if I just finished
  if (newHands[me].length === 0) {
    nextTurn = nextAlive({ ...state, hands: newHands }, me);
  }

  return {
    state: { ...state, hands: newHands, finishedOrder: finished, turn: nextTurn },
    drawn,
  };
}

/** Returns true if game is over (only one player still has cards == loser). */
export function isBabaOver(state: BabaState): boolean {
  return state.hands.filter((h) => h.length > 0).length <= 1;
}

/** Final ranking (rank 1 = first to finish). The remaining player is last. */
export function babaRanks(state: BabaState): number[] {
  const ranks: number[] = Array(state.numPlayers).fill(state.numPlayers);
  state.finishedOrder.forEach((p, i) => (ranks[p] = i + 1));
  return ranks;
}

/** AI: choose card index to draw from opponent. */
export function aiPickIndex(state: BabaState, aiPlayer: number, level: number): number {
  const opp = prevAlive(state, aiPlayer);
  const oppHand = state.hands[opp];
  if (oppHand.length === 0) return 0;
  // memory: for level lv, we have `lv/10` chance to "know" joker position when one of opponent's cards was previously seen.
  const knowledgeRate = level / 10;
  const mem = state.memory[opp] ?? {};
  const scored = oppHand.map((c, i) => {
    const jokerProb = mem[c.id] ?? 0.5;
    // Higher levels strongly avoid jokers; low levels are nearly random
    const aversion = knowledgeRate;
    const score = (1 - jokerProb) * aversion + (1 - aversion) * Math.random();
    return { i, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0].i;
}
