/* eslint-disable react/jsx-no-comment-textnodes */
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { gameLabel, type GameId } from "@/lib/utils";

const GAMES: { id: GameId; label: string; minPlayers: number; maxPlayers: number }[] = [
  { id: "chess",    label: "チェス",     minPlayers: 2, maxPlayers: 2 },
  { id: "shogi",    label: "将棋",       minPlayers: 2, maxPlayers: 2 },
  { id: "babanuki", label: "ババ抜き",   minPlayers: 2, maxPlayers: 4 },
  { id: "shinkei",  label: "神経衰弱",   minPlayers: 2, maxPlayers: 4 },
  { id: "daifugo",  label: "大富豪",     minPlayers: 2, maxPlayers: 4 },
];

interface Member {
  user_id: string;
  seat: number;
  username: string;
}

export default function FriendLobbyPage() {
  const router = useRouter();
  const params = useParams<{ roomId: string }>();
  const roomId = params.roomId;
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [room, setRoom] = useState<{
    id: string;
    status: string;
    game: string;
    passcode: string | null;
    host_id: string | null;
    desired_players: number;
  } | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedGame, setSelectedGame] = useState<GameId>("chess");
  const [selectedPlayers, setSelectedPlayers] = useState<number>(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auth
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setMyUserId(data.user.id);
      else router.push("/login");
    });
  }, [supabase, router]);

  // Poll room + members every 2s so we don't depend on realtime here.
  useEffect(() => {
    let cancelled = false;
    async function tick() {
      const { data: r } = await supabase
        .from("rooms")
        .select("id, status, game, passcode, host_id, desired_players")
        .eq("id", roomId)
        .maybeSingle();
      if (cancelled) return;
      if (r) {
        setRoom(r);
        // If host has started the game, everyone jumps in.
        if (r.status === "playing" && r.game !== "lobby") {
          router.push(`/play/${r.game}/room/${roomId}`);
          return;
        }
      }
      const { data: m } = await supabase
        .from("room_players")
        .select("user_id, seat, profiles!inner(username)")
        .eq("room_id", roomId)
        .order("seat", { ascending: true });
      if (cancelled) return;
      if (m) {
        setMembers(
          m.map((row) => ({
            user_id: row.user_id,
            seat: row.seat,
            username:
              (row.profiles as unknown as { username: string })?.username ?? "—",
          })),
        );
      }
    }
    tick();
    const interval = setInterval(tick, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [roomId, supabase, router]);

  const isHost = room && myUserId && room.host_id === myUserId;
  const selectedGameDef = GAMES.find((g) => g.id === selectedGame);

  // Keep selectedPlayers in valid range for the chosen game.
  useEffect(() => {
    if (!selectedGameDef) return;
    if (selectedPlayers < selectedGameDef.minPlayers) {
      setSelectedPlayers(selectedGameDef.minPlayers);
    } else if (selectedPlayers > selectedGameDef.maxPlayers) {
      setSelectedPlayers(selectedGameDef.maxPlayers);
    }
  }, [selectedGame, selectedGameDef, selectedPlayers]);

  async function startGame() {
    if (!isHost) return;
    if (members.length < selectedPlayers) {
      setError(`${selectedPlayers}人になってからスタートできます`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/rooms/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId,
          game: selectedGame,
          players: selectedPlayers,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "開始できませんでした");
        return;
      }
      // Polling will pick up status=playing and route everyone in.
      router.push(`/play/${selectedGame}/room/${roomId}`);
    } finally {
      setBusy(false);
    }
  }

  if (!room) {
    return (
      <p className="text-sm text-arena-textDim mt-12 text-center font-mono">
        // LOADING ROOM...
      </p>
    );
  }

  return (
    <div className="max-w-xl mx-auto mt-8 space-y-5">
      {/* Header strip */}
      <section className="border-l-4 border-arena-primary pl-5 py-3">
        <p className="font-display uppercase tracking-[0.3em] text-arena-primary text-xs">
          // PRIVATE LOBBY
        </p>
        <h1 className="font-display uppercase text-2xl tracking-wider mt-1">
          ROOM #{room.passcode ?? "----"}
        </h1>
      </section>

      {/* Passcode + members */}
      <div className="relative corner-brackets bg-arena-surface border border-arena-border p-6 scanline">
        <span className="cb1" /><span className="cb2" />
        <p className="text-arena-textMute font-mono text-[10px] uppercase tracking-widest">
          // PASSCODE — share with your friends
        </p>
        <p className="font-mono text-4xl tracking-[0.4em] text-arena-primary select-all mt-2">
          {room.passcode ?? "—"}
        </p>

        <div className="mt-6">
          <p className="text-arena-textMute font-mono text-[10px] uppercase tracking-widest mb-2">
            // PARTICIPANTS ({members.length})
          </p>
          <ul className="space-y-1">
            {members.map((m, i) => (
              <li
                key={m.user_id}
                className="flex items-center gap-3 px-3 py-2 bg-arena-bg border-l-2 border-arena-primary/60"
              >
                <span className="font-mono text-arena-textMute text-xs w-6">
                  0{i + 1}
                </span>
                <span className="font-display uppercase tracking-wider text-sm">
                  {m.username}
                </span>
                {m.user_id === room.host_id && (
                  <span className="font-mono text-[10px] px-1.5 py-0.5 bg-arena-primary/20 border border-arena-primary/40 text-arena-primary uppercase">
                    HOST
                  </span>
                )}
                {m.user_id === myUserId && (
                  <span className="font-mono text-[10px] text-arena-textDim ml-auto">
                    (YOU)
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Host controls */}
      {isHost ? (
        <div className="relative bg-arena-surface border border-arena-border p-6 space-y-5">
          <p className="font-display uppercase tracking-[0.22em] text-arena-primary text-xs">
            // SELECT GAME
          </p>
          <div className="grid grid-cols-3 gap-2">
            {GAMES.map((g) => (
              <Button
                key={g.id}
                variant={selectedGame === g.id ? "primary" : "secondary"}
                onClick={() => setSelectedGame(g.id)}
              >
                {g.label}
              </Button>
            ))}
          </div>

          {selectedGameDef && selectedGameDef.maxPlayers > 2 && (
            <>
              <p className="font-display uppercase tracking-[0.22em] text-arena-primary text-xs">
                // PLAYERS
              </p>
              <div className="grid grid-cols-3 gap-2">
                {[2, 3, 4].map((n) => (
                  <Button
                    key={n}
                    variant={selectedPlayers === n ? "primary" : "secondary"}
                    onClick={() => setSelectedPlayers(n)}
                    disabled={
                      n < selectedGameDef.minPlayers ||
                      n > selectedGameDef.maxPlayers
                    }
                  >
                    {n} 人
                  </Button>
                ))}
              </div>
            </>
          )}

          <p className="text-xs font-mono text-arena-textDim">
            // {members.length} / {selectedPlayers} READY
          </p>

          <Button
            onClick={startGame}
            disabled={busy || members.length < selectedPlayers}
            size="lg"
            className="w-full"
          >
            START {gameLabel(selectedGame)}
          </Button>
          {error && (
            <p className="text-sm text-arena-accent font-mono">
              // ERROR: {error}
            </p>
          )}
        </div>
      ) : (
        <div className="bg-arena-surface border border-arena-border p-6 text-center">
          <p className="font-mono text-arena-textDim text-sm">
            // WAITING FOR HOST TO PICK A GAME...
          </p>
        </div>
      )}

      <Button variant="ghost" onClick={() => router.push("/")}>
        ← HOME
      </Button>
    </div>
  );
}