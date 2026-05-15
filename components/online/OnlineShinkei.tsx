"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlayingCard } from "@/components/board/PlayingCard";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import type { ShinkeiPublic } from "@/lib/games/cards/online";
import { TurnTimer } from "@/components/common/TurnTimer";
import { useResignOnUnload } from "@/lib/hooks/useResignOnUnload";

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
  const channelRef = useRef<RealtimeChannel | null>(null);

  useResignOnUnload(roomId, finished);

  const fireTimeout = useCallback(async () => {
    await fetch("/api/game/timeout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId }),
    }).catch(() => {});
  }, [roomId]);

  const pokeOpponent = useCallback(async () => {
    try {
      await channelRef.current?.send({ type: "broadcast", event: "poke", payload: {} });
    } catch {
      /* primary path is postgres_changes; ignore */
    }
  }, []);

  const me = players.find((p) => p.seat === meSeat)!;
  const opp = players.find((p) => p.seat !== meSeat);

  const loadPublic = useCallback(async () => {
    const { data } = await supabase
      .from("rooms")
      .select("public_state, status")
      .eq("id", roomId)
      .single();
    if (data?.public_state) setPub(data.public_state as ShinkeiPublic);
    if (data?.status === "finished") setFinished(true);
  }, [roomId, supabase]);

  // Initialize state on mount. Await so we can re-load public state after the
  // server write completes, instead of racing it.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await fetch("/api/cards/init", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomId }),
        });
      } catch {
        /* ignore */
      }
      if (!cancelled) {
        await loadPublic();
        await pokeOpponent();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [roomId, loadPublic, pokeOpponent]);

  useEffect(() => {
    loadPublic();
    const ch = supabase
      .channel(`room:${roomId}:shinkei`, { config: { broadcast: { self: false } } })
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "boardarena", table: "rooms", filter: `id=eq.${roomId}` },
        (payload) => {
          const row = payload.new as { public_state: ShinkeiPublic; status: string };
          if (row.public_state) setPub(row.public_state);
          if (row.status === "finished") setFinished(true);
        },
      )
      .on("broadcast", { event: "poke" }, () => {
        loadPublic();
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          loadPublic();
        }
      });
    channelRef.current = ch;
    return () => {
      channelRef.current = null;
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
      const res = await fetch("/api/cards/shinkei", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, action: "resolve" }),
      });
      if (res.ok) {
        await loadPublic();
        await pokeOpponent();
      }
    }, 1500);
    return () => clearTimeout(t);
  }, [pub, finished, meSeat, roomId, loadPublic, pokeOpponent]);

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
      } else {
        await loadPublic();
        await pokeOpponent();
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

  const N = pub.seats.length;
  const myTurn = pub.turn === meSeat && !finished;
  const revealedMap = new Map(pub.revealed.map((r) => [r.index, r.card]));
  const takenSet = new Set(pub.taken);
  const playerLookup = new Map(players.map((p) => [p.user_id, p]));
  const turnUserId = pub.seats[pub.turn] ?? null;
  const turnUsername = turnUserId
    ? playerLookup.get(turnUserId)?.username ?? "？"
    : "";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">オンライン 神経衰弱 ({N}人)</h2>
          <span className="text-sm">
            {finished ? "" : myTurn ? "あなたの手番" : `${turnUsername} の手番`}
          </span>
        </div>
        <TurnTimer clock={pub.clock} mySeat={meSeat} onExpire={fireTimeout} />
      </div>
      <div className="flex flex-wrap gap-2 text-sm">
        {pub.seats.map((uid, idx) => {
          const info = playerLookup.get(uid);
          const isMe = idx === meSeat;
          const isTurn = pub.turn === idx;
          return (
            <span
              key={uid}
              className={`px-2 py-1 rounded border ${
                isTurn
                  ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30"
                  : "border-slate-300"
              }`}
            >
              {info?.username ?? "—"}
              {isMe && "（あなた）"}: {pub.scores[idx] ?? 0}
            </span>
          );
        })}
      </div>

      <Card>
        <CardContent className="pt-4 overflow-x-auto">
          <div className="grid grid-cols-13 gap-0.5 sm:gap-1 max-w-3xl min-w-[360px]">
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
