export type Suit = "♠" | "♥" | "♦" | "♣";
/** rank: 1..13 (1=A, 11=J, 12=Q, 13=K), and 0 = JOKER */
export interface Card {
  suit: Suit | "JOKER";
  rank: number;
  id: string;
}

export function buildDeck(withJokers = 0): Card[] {
  const suits: Suit[] = ["♠", "♥", "♦", "♣"];
  const deck: Card[] = [];
  for (const s of suits) {
    for (let r = 1; r <= 13; r++) {
      deck.push({ suit: s, rank: r, id: `${s}${r}` });
    }
  }
  for (let i = 0; i < withJokers; i++) {
    deck.push({ suit: "JOKER", rank: 0, id: `J${i + 1}` });
  }
  return deck;
}

export function shuffle<T>(arr: T[], rng: () => number = Math.random): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function cardLabel(c: Card): string {
  if (c.suit === "JOKER") return "🃏";
  const r = c.rank;
  const label =
    r === 1 ? "A" : r === 11 ? "J" : r === 12 ? "Q" : r === 13 ? "K" : String(r);
  return `${c.suit}${label}`;
}

export function isRed(c: Card) {
  return c.suit === "♥" || c.suit === "♦";
}
