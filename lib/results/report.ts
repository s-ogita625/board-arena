import type { GameId } from "@/lib/utils";

export interface SoloResultPayload {
  game: GameId;
  outcome: 0 | 0.5 | 1; // human's score
}

/**
 * Send the result of a solo (vs CPU) match to the server so that win/loss
 * counts can be updated. Rating is *not* updated for solo games.
 * Silently ignores errors (e.g. user not logged in).
 */
export async function reportSoloResult(payload: SoloResultPayload) {
  try {
    await fetch("/api/result/solo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    /* noop */
  }
}
