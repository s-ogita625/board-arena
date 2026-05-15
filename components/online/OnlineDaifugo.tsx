"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlayingCard } from "@/components/board/PlayingCard";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import type { DaifugoPublic, DaifugoPrivate } from "@/lib/games/cards/online";
import { legalPlays } from "@/lib/games/cards/daifugo";

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

export function OnlineDaifugo({ roomId, meSeat, players, finished: finishedInit }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [pub, setPub] = useState<DaifugoPublic | null>(null);
  const [priv, setPriv] = useState<DaifugoPrivate | null>(null);
  const [finished, setFinished] = useState(finishedInit);
  const [message, setMessage] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
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
    if (data?.public_state) setPub(data.public_state as DaifugoPublic);
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
    if (data?.state) setPriv(data.state as DaifugoPrivate);
  }, [roomId, supabase]);

  useEffect(() => {
    loadPublic();
    loadPrivate();
    const ch = supabase
      .channel(`room:${roomId}:daifugo`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "boardarena", table: "rooms", filter: `id=eq.${roomId}` },
        (payload) => {
          const row = payload.new as { public_state: DaifugoPublic; status: string };
          if (row.public_state) setPub(row.public_state);
          if (row.status === "finished") setFinished(true);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "boardarena", table: "room_private_state", filter: `room_id=eq.${roomId}` },
        () => {
          loadPrivate();
          setSelected([]);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [roomId, supabase, loadPublic, loadPrivate]);

  useEffect(() => {
    if (!pub) return;
    if (pub.winnerId !== undefined) {
      setFinished(true);
      if (pub.winnerId === null) setMessage("引き分け");
      else if (pub.winnerId === me.user_id) setMessage("勝利！");
      else setMessage("敗北...");
    }
  }, [pub, me.user_id]);

  function toggleSelect(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  const isMyTurn = pub?.turn === meSeat && !finished;

  // Compute whether currently selected cards form a legal play
  const selectedIsLegal = useMemo(() => {
    if (!priv || !pub) return false;
    if (selected.length === 0) return false;
    const chosen = priv.hand.filter((c) => selected.includes(c.id));
    if (chosen.length !== selected.length) return false;
    const plays = legalPlays(priv.hand, pub.current);
    const key = chosen.map((c) => c.id).sort().join(",");
    return plays.some((p) => p.map((c) => c.id).sort().join(",") === key);
  }, [priv, pub, selected]);

  async function play() {
    if (busy || !isMyTurn || !selectedIsLegal) return;
    setBusy(true);
    try {
      const res = await fetch("/api/cards/daifugo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, action: "play", cardIds: selected }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        setMessage(`エラー: ${j?.error ?? res.statusText}`);
      } else {
        setSelected([]);
      }
    } finally {
      setBusy(false);
    }
  }

  async function pass() {
    if (busy || !isMyTurn) return;
    setBusy(true);
    try {
      await fetch("/api/cards/daifugo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, action: "pass" }),
      });
      setSelected([]);
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

  const oppCount = pub.counts[(meSeat + 1) % 2] ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-semibold">オンライン 大富豪</h2>
        <span className="text-sm text-slate-500">
          {me.username} vs {opp?.username ?? "—"}
        </span>
        <span className="text-sm">
          {finished ? "" : isMyTurn ? "あなたの手番" : "相手の手番"}
        </span>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>相手 ({oppCount} 枚)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-1">
            {Array.from({ length: oppCount }).map((_, i) => (
              <PlayingCard key={i} variant="back" size="sm" />
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>場</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-1 min-h-[5rem]">
            {pub.current ? (
              pub.current.map((c) => (
                <PlayingCard key={c.id} card={c} variant="open" size="sm" />
              ))
            ) : (
              <p className="text-sm text-slate-400">場は空です（自由に出せます）</p>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-2">パス: {pub.passes}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>あなたの手札 ({priv?.hand.length ?? 0} 枚)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-1">
            {(priv?.hand ?? []).map((c) => (
              <PlayingCard
                key={c.id}
                card={c}
                variant="open"
                size="sm"
                selected={selected.includes(c.id)}
                onClick={() => toggleSelect(c.id)}
              />
            ))}
          </div>
          {message && <p className="text-lg font-semibold">{message}</p>}
          <div className="flex flex-wrap gap-2">
            <Button onClick={play} disabled={!isMyTurn || !selectedIsLegal || busy}>
              出す
            </Button>
            <Button variant="secondary" onClick={pass} disabled={!isMyTurn || !pub.current || busy}>
              パス
            </Button>
            {!finished && <Button variant="danger" onClick={resign}>投了</Button>}
            {finished && <Button onClick={() => router.push("/")}>ホームに戻る</Button>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
