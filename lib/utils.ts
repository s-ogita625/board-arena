import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const GAMES = [
  { id: "chess", name: "チェス", emoji: "♟️", maxPlayers: 2 },
  { id: "shogi", name: "将棋", emoji: "🀄", maxPlayers: 2 },
  { id: "babanuki", name: "ババ抜き", emoji: "🃏", maxPlayers: 4 },
  { id: "daifugo", name: "大富豪", emoji: "👑", maxPlayers: 4 },
  { id: "shinkei", name: "神経衰弱", emoji: "🧠", maxPlayers: 4 },
] as const;

export type GameId = (typeof GAMES)[number]["id"];

export const GAME_IDS = GAMES.map((g) => g.id) as readonly GameId[];

export function isGameId(value: string): value is GameId {
  return (GAME_IDS as readonly string[]).includes(value);
}

export function gameLabel(id: GameId): string {
  return GAMES.find((g) => g.id === id)?.name ?? id;
}
