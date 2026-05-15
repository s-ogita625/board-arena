/**
 * Supabase Postgres types
 * (manually maintained; replace with `supabase gen types typescript` output once project is linked)
 */

export type GameId = "chess" | "shogi" | "babanuki" | "daifugo" | "shinkei";
export type RoomStatus = "waiting" | "playing" | "finished";

export interface Database {
  public: {
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
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
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
        Update: Partial<Database["public"]["Tables"]["game_stats"]["Insert"]>;
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
        Update: Partial<Database["public"]["Tables"]["rooms"]["Insert"]>;
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
        Update: Partial<Database["public"]["Tables"]["room_players"]["Insert"]>;
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
        Update: Partial<Database["public"]["Tables"]["match_queue"]["Insert"]>;
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
        Update: Partial<Database["public"]["Tables"]["match_results"]["Insert"]>;
      };
    };
  };
}
