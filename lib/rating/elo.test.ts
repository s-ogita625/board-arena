import { describe, it, expect } from "vitest";
import { expectedScore, updateElo, updateEloMulti } from "./elo";

describe("Elo", () => {
  it("equal ratings → expected 0.5", () => {
    expect(expectedScore(1500, 1500)).toBeCloseTo(0.5, 5);
  });

  it("underdog gains more when beating favorite", () => {
    const underdogWin = updateElo(1000, 1500, 1);
    const favWinSmall = updateElo(1500, 1000, 1);
    expect(underdogWin.deltaA).toBeGreaterThan(favWinSmall.deltaA);
  });

  it("draw nets zero around equal ratings", () => {
    const r = updateElo(1200, 1200, 0.5);
    expect(r.deltaA).toBe(0);
    expect(r.deltaB).toBe(0);
  });

  it("multi-player: winner gets positive, loser negative", () => {
    const { deltas } = updateEloMulti([1000, 1100, 1200, 1300], [1, 2, 3, 4]);
    expect(deltas[0]).toBeGreaterThan(0);
    expect(deltas[3]).toBeLessThan(0);
  });
});
