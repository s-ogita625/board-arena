"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlayingCard } from "@/components/board/PlayingCard";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import type { BabanukiPublic, BabanukiPrivate } from "@/lib/games/cards/online";

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

export function OnlineBabanuki({ roomId, meSeat, players, finished: finishedInit }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [pub, setPub] = useState<BabanukiPublic | null>(null);
  const [priv, setPriv] = useState<BabanukiPrivate | null>(null);
  const [finished, setFinished] = useState(finishedInit);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const me = players.find((p) => p.seat === meSeat)!;
  const opp = players.find((p) => p.seat !== meSeat);

  // Initialize state on mount (idempotent server-side)
  useEffect(() => {
    fetch("/api/cards/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId }),
    }).catch(() => {});
  }, [roomId]);

  // Load + subscribe to public state
  const loadPublic = useCallback(async () => {
    const { data } = await supabase
      .from("rooms")
      .select("public_state, status")
      .eq("id", roomId)
      .single();
    if (data?.public_state) setPub(data.public_state as BabanukiPublic);
    if (data?.status === "finished") setFinished(true);
  }, [roomId, supabase]);

  const loadPrivate = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("room_private_state")
      .select("state")
      .eq("room_id", roomId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (data?.state) setPriv(data.state as BabanukiPrivate);
  }, [roomId, supabase]);

  useEffect(() => {
    loadPublic();
    loadPrivate();
    const ch = supabase
      .channel(`room:${roomId}:baba`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "boardarena", table: "rooms", filter: `id=eq.${roomId}` },
        (payload) => {
          const row = payload.new as { public_state: BabanukiPublic; status: string };
          if (row.public_state) setPub(row.public_state);
          if (row.status === "finished") setFinished(true);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "boardarena", table: "room_private_state", filter: `room_id=eq.${roomId}` },
        () => {
          loadPrivate();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [roomId, supabase, loadPublic, loadPrivate]);

  // Detect end-of-game from public_state
  useEffect(() => {
    if (!pub) return;
    if (pub.winnerId !== undefined) {
      setFinished(true);
      if (pub.winnerId === null) setMessage("引き分け");
      else if (pub.winnerId === me.user_id) setMessage("勝利！（先にあがりました）");
      else setMessage("敗北...（ジョーカーを持ったまま終了）");
    }
  }, [pub, me.user_id]);

  async function pickIndex(idx: number) {
    if (busy || finished || !pub) return;
    if (pub.turn !== meSeat) return;
    setBusy(true);
    try {
      const res = await fetch("/api/cards/babanuki", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, cardIndex: idx }),
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

  if (!pub) {
    return <p className="text-sm text-slate-500">準備中...</p>;
  }

  const oppCount = pub.counts[(meSeat + 1) % 2] ?? 0;
  const myTurn = pub.turn === meSeat && !finished;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-semibold">オンライン ババ抜き</h2>
        <span className="text-sm text-slate-500">
          {me.username} vs {opp?.username ?? "—"}
        </span>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>相手の手札 ({oppCount} 枚)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: oppCount }).map((_, i) => (
              <PlayingCard
                key={i}
                variant="back"
                size="sm"
                disabled={!myTurn || busy}
                onClick={() => pickIndex(i)}
              />
            ))}
            {oppCount === 0 && (
              <p className="text-sm text-slate-400">相手はあがりました</p>
            )}
          </div>
          {myTurn && oppCount > 0 && (
            <p className="text-xs text-slate-500 mt-2">
              相手の手札から 1 枚クリックしてください
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>あなたの手札 ({priv?.hand.length ?? 0} 枚)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {(priv?.hand ?? []).map((c) => (
              <PlayingCard key={c.id} card={c} size="sm" />
            ))}
            {(priv?.hand.length ?? 0) === 0 && (
              <p className="text-sm text-slate-400">あがりました</p>
            )}
          </div>
          {pub.lastDraw && (
            <p className="text-xs text-slate-500">
              直前のドロー: <span className="font-mono">{pub.lastDraw.cardId}</span>
              {pub.lastDraw.paired ? "（ペア成立）" : ""}
            </p>
          )}
          {message && <p className="text-lg font-semibold">{message}</p>}
          <div className="flex gap-2">
            {!finished && (
              <Button variant="danger" onClick={resign}>投了</Button>
            )}
            {finished && (
              <Button onClick={() => router.push("/")}>ホームに戻る</Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
