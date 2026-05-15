/**
 * Supabase Postgres types (boardarena schema)
 *
 * 物理的には boardarena.* に配置しているが、@supabase/ssr のジェネリクス推論は
 * Database["public"] を参照するケースがあるため、両方のキーで同じ型を露出させる。
 */

export type GameId = "chess" | "shogi" | "babanuki" | "daifugo" | "shinkei";
export type RoomStatus = "waiting" | "playing" | "finished";

interface BoardArenaSchema {
  Tables: {
    profiles: {
      Row: {
        id: string;
        username: string;
        bio: string | null;
        avatar_url: string | null;
        created_at: string;
      };
      Insert: {
        id: string;
        username: string;
        bio?: string | null;
        avatar_url?: string | null;
        created_at?: string;
      };
      Update: {
        id?: string;
        username?: string;
        bio?: string | null;
        avatar_url?: string | null;
        created_at?: string;
      };
      Relationships: [];
    };
    game_stats: {
      Row: {
        user_id: string;
        game: GameId;
        rating: number;
        wins: number;
        losses: number;
        draws: number;
        updated_at: string;
      };
      Insert: {
        user_id: string;
        game: GameId;
        rating?: number;
        wins?: number;
        losses?: number;
        draws?: number;
        updated_at?: string;
      };
      Update: {
        user_id?: string;
        game?: GameId;
        rating?: number;
        wins?: number;
        losses?: number;
        draws?: number;
        updated_at?: string;
      };
      Relationships: [];
    };
    rooms: {
      Row: {
        id: string;
        game: GameId;
        status: RoomStatus;
        max_players: number;
        state: Record<string, unknown> | null;
        public_state: Record<string, unknown> | null;
        created_at: string;
        updated_at: string;
      };
      Insert: {
        id?: string;
        game: GameId;
        status?: RoomStatus;
        max_players?: number;
        state?: Record<string, unknown> | null;
        public_state?: Record<string, unknown> | null;
        created_at?: string;
        updated_at?: string;
      };
      Update: {
        id?: string;
        game?: GameId;
        status?: RoomStatus;
        max_players?: number;
        state?: Record<string, unknown> | null;
        public_state?: Record<string, unknown> | null;
        created_at?: string;
        updated_at?: string;
      };
      Relationships: [];
    };
    room_players: {
      Row: {
        room_id: string;
        user_id: string;
        seat: number;
        rating_before: number;
        joined_at: string;
      };
      Insert: {
        room_id: string;
        user_id: string;
        seat: number;
        rating_before: number;
        joined_at?: string;
      };
      Update: {
        room_id?: string;
        user_id?: string;
        seat?: number;
        rating_before?: number;
        joined_at?: string;
      };
      Relationships: [];
    };
    match_queue: {
      Row: {
        user_id: string;
        game: GameId;
        rating: number;
        joined_at: string;
      };
      Insert: {
        user_id: string;
        game: GameId;
        rating: number;
        joined_at?: string;
      };
      Update: {
        user_id?: string;
        game?: GameId;
        rating?: number;
        joined_at?: string;
      };
      Relationships: [];
    };
    match_results: {
      Row: {
        id: string;
        room_id: string | null;
        game: GameId;
        winner_id: string | null;
        rating_changes: Record<string, number>;
        created_at: string;
      };
      Insert: {
        id?: string;
        room_id?: string | null;
        game: GameId;
        winner_id?: string | null;
        rating_changes: Record<string, number>;
        created_at?: string;
      };
      Update: {
        id?: string;
        room_id?: string | null;
        game?: GameId;
        winner_id?: string | null;
        rating_changes?: Record<string, number>;
        created_at?: string;
      };
      Relationships: [];
    };
  };
  Views: Record<string, never>;
  Functions: Record<string, never>;
  Enums: Record<string, never>;
  CompositeTypes: Record<string, never>;
}

export interface Database {
  boardarena: BoardArenaSchema;
  public: BoardArenaSchema;
}
