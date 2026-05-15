/**
 * Shared types for online card games (babanuki / shinkei / daifugo).
 *
 * - Public state lives in `boardarena.rooms.public_state` and is broadcast
 *   to all participants via Realtime.
 * - Private state (hands) lives in `boardarena.room_private_state` keyed
 *   by (room_id, user_id) and is only readable by the owning user.
 */

import type { Card } from "./deck";

/** ---------------- babanuki ---------------- */

export interface BabanukiPublic {
  kind: "babanuki";
  /** seats in turn order */
  seats: string[]; // user ids by seat index
  /** counts[i] = card count of seats[i] */
  counts: number[];
  /** index in seats whose turn it is (this player draws from prev seat) */
  turn: number;
  /** seats that have finished (in order) */
  finished: string[];
  /** if game over, winner_id (last loser is the one *not* finished); null if draw */
  winnerId?: string | null;
  /** last drawn info, for UI feedback. Cleared on next move. */
  lastDraw?: {
    fromUserId: string;
    toUserId: string;
    /** the card drawn (revealed to everyone after the draw resolves) */
    cardId: string;
    paired: boolean;
  };
  /** monotonically increasing move counter (for client de-dup) */
  version: number;
}

export interface BabanukiPrivate {
  kind: "babanuki";
  /** my hand (sorted). Updated whenever the public state advances. */
  hand: Card[];
  version: number;
}

/** ---------------- shinkei ---------------- */

export interface ShinkeiPublic {
  kind: "shinkei";
  seats: string[];
  /** board card ids in fixed positions; null when taken */
  /** Public board reveals only when face-up; otherwise just `null` for hidden. */
  /** length = 52 */
  positions: number;
  /** Currently face-up (revealed) indices and their cards (revealed publicly) */
  revealed: { index: number; card: Card }[];
  /** Permanently taken indices */
  taken: number[];
  /** scores by seat */
  scores: number[];
  turn: number;
  /** when both cards flipped and matched/no-match resolved, leave them visible briefly */
  pending?: { matched: boolean };
  winnerId?: string | null;
  version: number;
}

/** Shinkei has no private state (everyone sees the same revealed board) */
export interface ShinkeiPrivate {
  kind: "shinkei";
  version: number;
}

/** ---------------- daifugo (2-player simplified) ---------------- */

export interface DaifugoPublic {
  kind: "daifugo";
  seats: string[];
  counts: number[];
  /** current pile top (face-up) */
  current: Card[] | null;
  /** seat of last player who played a non-pass */
  lastSeat: number | null;
  /** consecutive passes */
  passes: number;
  turn: number;
  finished: string[];
  winnerId?: string | null;
  version: number;
}

export interface DaifugoPrivate {
  kind: "daifugo";
  hand: Card[];
  version: number;
}

export type CardPublicState =
  | BabanukiPublic
  | ShinkeiPublic
  | DaifugoPublic;

export type CardPrivateState =
  | BabanukiPrivate
  | ShinkeiPrivate
  | DaifugoPrivate;
