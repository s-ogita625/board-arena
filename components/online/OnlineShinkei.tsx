"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlayingCard } from "@/components/board/PlayingCard";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import type { ShinkeiPublic } from "@/lib/games/cards/online";

interface PlayerInfo {
  user_id: string;
  seat: number;
  username: string;
  avatar_url: string | null;
}

interface Props {
  roomId: string;
  meSeat: number;
  players: PlayerInfo[];
  finished: boolean;
}

export function OnlineShinkei({ roomId, meSeat, players, finished: finishedInit }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [pub, setPub] = useState<ShinkeiPublic | null>(null);
  const [finished, setFinished] = useState(finishedInit);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const me = players.find((p) => p.seat === meSeat)!;
  const opp = players.find((p) => p.seat !== meSeat);

  useEffect(() => {
    fetch("/api/cards/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId }),
    }).catch(() => {});
  }, [roomId]);

  const loadPublic = useCallback(async () => {
    const { data } = await supabase
      .from("rooms")
      .select("public_state, status")
      .eq("id", roomId)
      .single();
    if (data?.public_state) setPub(data.public_state as ShinkeiPublic);
    if (data?.status === "finished") setFinished(true);
  }, [roomId, supabase]);

  useEffect(() => {
    loadPublic();
    const ch = supabase
      .channel(`room:${roomId}:shinkei`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "boardarena", table: "rooms", filter: `id=eq.${roomId}` },
        (payload) => {
          const row = payload.new as { public_state: ShinkeiPublic; status: string };
          if (row.public_state) setPub(row.public_state);
          if (row.status === "finished") setFinished(true);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [roomId, supabase, loadPublic]);

  useEffect(() => {
    if (!pub) return;
    if (pub.winnerId !== undefined) {
      setFinished(true);
      if (pub.winnerId === null) setMessage("引き分け");
      else if (pub.winnerId === me.user_id) setMessage("勝利！");
      else setMessage("敗北...");
    }
  }, [pub, me.user_id]);

  // Auto-resolve 2 seconds after the 2nd reveal, on either client (the API
  // is idempotent: only the current player can resolve, server validates).
  useEffect(() => {
    if (!pub || finished) return;
    if (pub.revealed.length !== 2) return;
    if (pub.turn !== meSeat) return;
    const t = setTimeout(async () => {
      await fetch("/api/cards/shinkei", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, action: "resolve" }),
      });
    }, 1500);
    return () => clearTimeout(t);
  }, [pub, finished, meSeat, roomId]);

  async function flip(idx: number) {
    if (busy || finished || !pub) return;
    if (pub.turn !== meSeat) return;
    if (pub.revealed.length >= 2) return;
    if (pub.revealed.find((r) => r.index === idx)) return;
    if (pub.taken.includes(idx)) return;
    setBusy(true);
    try {
      const res = await fetch("/api/cards/shinkei", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, action: "flip", index: idx }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        setMessage(`エラー: ${j?.error ?? res.statusText}`);
      }
    } finally {
      setBusy(false);
    }
  }

  async function resign() {
    if (finished) return;
    setFinished(true);
    setMessage("投了しました");
    await fetch("/api/result/online", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId, winnerId: opp?.user_id ?? null }),
    });
  }

  if (!pub) return <p className="text-sm text-slate-500">準備中...</p>;

  const myTurn = pub.turn === meSeat && !finished;
  const revealedMap = new Map(pub.revealed.map((r) => [r.index, r.card]));
  const takenSet = new Set(pub.taken);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-semibold">オンライン 神経衰弱</h2>
        <span className="text-sm text-slate-500">
          {me.username} ({pub.scores[meSeat] ?? 0}) vs {opp?.username ?? "—"} ({pub.scores[(meSeat + 1) % 2] ?? 0})
        </span>
        <span className="text-sm">
          {finished ? "" : myTurn ? "あなたの手番" : "相手の手番"}
        </span>
      </div>

      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-13 gap-1 max-w-3xl">
            {Array.from({ length: pub.positions }).map((_, i) => {
              const rev = revealedMap.get(i);
              const taken = takenSet.has(i);
              if (taken) {
                return <PlayingCard key={i} variant="empty" size="sm" />;
              }
              if (rev) {
                return <PlayingCard key={i} card={rev} variant="open" size="sm" />;
              }
              return (
                <PlayingCard
                  key={i}
                  variant="back"
                  size="sm"
                  disabled={!myTurn || busy || pub.revealed.length >= 2}
                  onClick={() => flip(i)}
                />
              );
            })}
          </div>
          {message && <p className="text-lg font-semibold mt-3">{message}</p>}
          <div className="flex gap-2 mt-3">
            {!finished && <Button variant="danger" onClick={resign}>投了</Button>}
            {finished && <Button onClick={() => router.push("/")}>ホームに戻る</Button>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
