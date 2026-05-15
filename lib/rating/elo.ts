/**
 * Elo rating utilities.
 *
 * Score convention:
 *   1   = win
 *   0.5 = draw
 *   0   = loss
 */

export type Score = 0 | 0.5 | 1;

export function expectedScore(rA: number, rB: number): number {
  return 1 / (1 + Math.pow(10, (rB - rA) / 400));
}

export function kFactor(rating: number): number {
  if (rating < 1500) return 32;
  if (rating < 2000) return 24;
  return 16;
}

export interface EloOutcome {
  ratingA: number;
  ratingB: number;
  deltaA: number;
  deltaB: number;
}

/** Pairwise Elo update. */
export function updateElo(
  rA: number,
  rB: number,
  scoreA: Score,
): EloOutcome {
  const eA = expectedScore(rA, rB);
  const eB = 1 - eA;
  const scoreB = (1 - scoreA) as Score;
  const deltaA = Math.round(kFactor(rA) * (scoreA - eA));
  const deltaB = Math.round(kFactor(rB) * (scoreB - eB));
  return {
    ratingA: rA + deltaA,
    ratingB: rB + deltaB,
    deltaA,
    deltaB,
  };
}

/**
 * Multi-player Elo update by finishing order.
 * For each player, we treat the rest of the field's average rating as the opponent
 * and award fractional score based on (N - rank) / (N - 1).
 */
export function updateEloMulti(
  ratings: number[],
  ranks: number[],
): { newRatings: number[]; deltas: number[] } {
  const n = ratings.length;
  if (ranks.length !== n) throw new Error("ratings/ranks length mismatch");

  const deltas = ratings.map(() => 0);
  for (let i = 0; i < n; i++) {
    const others = ratings.filter((_, idx) => idx !== i);
    const avgOpp = others.reduce((a, b) => a + b, 0) / others.length;
    const expected = expectedScore(ratings[i], avgOpp);
    const actual = (n - ranks[i]) / (n - 1); // rank 1 → 1.0, rank N → 0
    deltas[i] = Math.round(kFactor(ratings[i]) * (actual - expected));
  }
  const newRatings = ratings.map((r, i) => r + deltas[i]);
  return { newRatings, deltas };
}
