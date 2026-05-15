/**
 * Shared types for online card games (babanuki / shinkei / daifugo).
 *
 * - Public state lives in `boardarena.rooms.public_state` and is broadcast
 *   to all participants via Realtime.
 * - Private state (hands) lives in `boardarena.room_private_state` keyed
 *   by (room_id, user_id) and is only readable by the owning user.
 */

import type { Card } from "./deck";
import type { Clock } from "../clock";

/** ---------------- babanuki ---------------- */

export interface BabanukiPublic {
  kind: "babanuki";
  seats: string[];
  counts: number[];
  turn: number;
  finished: string[];
  winnerId?: string | null;
  lastDraw?: {
    fromUserId: string;
    toUserId: string;
    cardId: string;
    paired: boolean;
  };
  version: number;
  clock?: Clock;
}

export interface BabanukiPrivate {
  kind: "babanuki";
  hand: Card[];
  version: number;
}

/** ---------------- shinkei ---------------- */

export interface ShinkeiPublic {
  kind: "shinkei";
  seats: string[];
  positions: number;
  revealed: { index: number; card: Card }[];
  taken: number[];
  scores: number[];
  turn: number;
  pending?: { matched: boolean };
  winnerId?: string | null;
  version: number;
  clock?: Clock;
}

export interface ShinkeiPrivate {
  kind: "shinkei";
  version: number;
}

/** ---------------- daifugo ---------------- */

export interface DaifugoPublic {
  kind: "daifugo";
  seats: string[];
  counts: number[];
  current: Card[] | null;
  lastSeat: number | null;
  passes: number;
  turn: number;
  finished: string[];
  winnerId?: string | null;
  version: number;
  clock?: Clock;
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
