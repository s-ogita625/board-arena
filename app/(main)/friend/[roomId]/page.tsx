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
    return <p className="text-sm text-slate-500 mt-12 text-center">読み込み中...</p>;
  }

  return (
    <div className="max-w-xl mx-auto mt-12 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>フレンド対戦ロビー</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <p className="text-sm text-slate-500">パスコード（相手にこれを共有）</p>
            <p className="font-mono text-3xl tracking-widest select-all">
              {room.passcode ?? "—"}
            </p>
          </div>
          <div>
            <p className="text-sm text-slate-500">参加者</p>
            <ul className="list-disc pl-5">
              {members.map((m) => (
                <li key={m.user_id} className="text-sm">
                  {m.username}
                  {m.user_id === room.host_id && " (ホスト)"}
                  {m.user_id === myUserId && " (あなた)"}
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>

      {isHost ? (
        <Card>
          <CardHeader>
            <CardTitle>ゲームを選んで開始</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium mb-1">種目</p>
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
            </div>

            {selectedGameDef && selectedGameDef.maxPlayers > 2 && (
              <div>
                <p className="text-sm font-medium mb-1">人数</p>
                <div className="flex gap-2">
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
              </div>
            )}

            <p className="text-xs text-slate-500">
              現在 {members.length} 人参加中 / 必要 {selectedPlayers} 人
            </p>

            <Button
              onClick={startGame}
              disabled={busy || members.length < selectedPlayers}
            >
              {gameLabel(selectedGame)} を開始
            </Button>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-slate-500">
              ホストがゲームを選択するのを待っています...
            </p>
          </CardContent>
        </Card>
      )}

      <Button variant="secondary" onClick={() => router.push("/")}>
        ホームに戻る
      </Button>
    </div>
  );
}
