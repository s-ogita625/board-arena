/**
 * Per-turn time-limit clock shared across every game's state.
 *
 * We store the wall-clock instant the current turn began (`turnStartedAt`)
 * and the limit in milliseconds (`turnLimitMs`). Each server-side move
 * handler is expected to reset `turnStartedAt` when it advances the turn.
 * Clients compute the remaining time as
 *   `turnStartedAt + turnLimitMs - now()`.
 *
 * Limits are intentionally per-turn (not Fischer / increment style) so the
 * UI stays simple even for casual card games.
 */

export interface Clock {
  turnStartedAt: string; // ISO timestamp
  turnLimitMs: number;
  turnSeat: number;
}

export const TURN_LIMITS_MS: Record<string, number> = {
  chess:    60_000, // 60 sec/move
  shogi:    60_000,
  babanuki: 30_000,
  daifugo:  30_000,
  shinkei:  30_000,
};

export function newClock(game: string, turnSeat: number): Clock {
  return {
    turnStartedAt: new Date().toISOString(),
    turnLimitMs: TURN_LIMITS_MS[game] ?? 60_000,
    turnSeat,
  };
}

export function isExpired(clock: Clock | undefined | null, nowMs: number = Date.now()): boolean {
  if (!clock) return false;
  const start = Date.parse(clock.turnStartedAt);
  if (Number.isNaN(start)) return false;
  return nowMs - start > clock.turnLimitMs;
}

export function remainingMs(clock: Clock | undefined | null, nowMs: number = Date.now()): number {
  if (!clock) return 0;
  const start = Date.parse(clock.turnStartedAt);
  if (Number.isNaN(start)) return 0;
  return Math.max(0, clock.turnLimitMs - (nowMs - start));
}
