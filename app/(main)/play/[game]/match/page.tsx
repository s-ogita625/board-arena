/* eslint-disable react/jsx-no-comment-textnodes */
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { gameLabel, isGameId } from "@/lib/utils";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { usePresence } from "@/components/common/PresenceProvider";

// オンライン対戦が実装済みのゲーム
const ONLINE_READY: ReadonlySet<string> = new Set([
  "chess",
  "shogi",
  "babanuki",
  "shinkei",
  "daifugo",
]);

// 人数選択を許可するゲーム（トランプ系のみ 2-4 人）
const MULTI_SIZE: ReadonlySet<string> = new Set([
  "babanuki",
  "shinkei",
  "daifugo",
]);

const EN: Record<string, string> = {
  chess:    "CHESS",
  shogi:    "SHOGI",
  babanuki: "OLD MAID",
  daifugo:  "PRESIDENT",
  shinkei:  "MEMORY",
};

export default function MatchingPage() {
  const router = useRouter();
  const params = useParams<{ game: string }>();
  const search = useSearchParams();
  const game = params.game;
  const onlineReady = ONLINE_READY.has(game);
  const supportsMulti = MULTI_SIZE.has(game);
  const { online } = usePresence();

  const playersParam = Number(search.get("players"));
  const initialPlayers =
    supportsMulti && [2, 3, 4].includes(playersParam) ? playersParam : null;
  const [players, setPlayers] = useState<number | null>(
    supportsMulti ? initialPlayers : 2,
  );

  const [elapsed, setElapsed] = useState(0);
  const [status, setStatus] = useState<string>("SEARCHING MATCH...");
  const [pendingNeeded, setPendingNeeded] = useState<number | null>(null);
  const cancelRef = useRef(false);

  useEffect(() => {
    if (!isGameId(game)) return;
    if (!onlineReady) return;
    if (players === null) return;
    cancelRef.current = false;

    let mounted = true;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      const supabase = createSupabaseBrowser();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      while (mounted && !cancelRef.current) {
        const res = await fetch("/api/match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ game, players }),
          cache: "no-store",
        });
        const json = await res.json();
        if (json.roomId) {
          router.refresh();
          await new Promise((r) => setTimeout(r, 250));
          router.push(`/play/${game}/room/${json.roomId}`);
          return;
        }
        if (json.error) {
          setStatus(`ERROR: ${json.error}`);
          return;
        }
        if (typeof json.needed === "number") setPendingNeeded(json.needed);
        await new Promise<void>((r) => { timer = setTimeout(r, 2000); });
      }
    }
    poll();

    const tick = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => {
      mounted = false;
      cancelRef.current = true;
      clearInterval(tick);
      clearTimeout(timer);
      fetch(`/api/match?game=${game}`, { method: "DELETE" }).catch(() => {});
    };
  }, [game, router, onlineReady, players]);

  if (!isGameId(game)) return null;

  if (!onlineReady) {
    return (
      <div className="max-w-md mx-auto mt-12">
        <div className="relative corner-brackets bg-arena-surface border border-arena-border p-8">
          <span className="cb1" /><span className="cb2" />
          <p className="font-display uppercase tracking-[0.3em] text-arena-textMute text-xs">// COMING SOON</p>
          <h2 className="font-display uppercase text-2xl tracking-wider mt-2">{EN[game] ?? game}</h2>
          <p className="text-sm text-arena-textDim mt-3">
            このゲームのオンライン対戦は近日公開予定です。<br />
            ソロ（CPU 10 段階）でお楽しみください。
          </p>
          <div className="flex gap-2 mt-5">
            <Button onClick={() => router.push(`/play/${game}/solo`)}>SOLO</Button>
            <Button variant="ghost" onClick={() => router.push("/")}>HOME</Button>
          </div>
        </div>
      </div>
    );
  }

  // 人数選択画面（トランプ系のみ、未選択時）
  if (supportsMulti && players === null) {
    return (
      <div className="max-w-md mx-auto mt-12">
        <div className="relative corner-brackets bg-arena-surface border border-arena-border p-8">
          <span className="cb1" /><span className="cb2" />
          <p className="font-display uppercase tracking-[0.3em] text-arena-primary text-xs">// SELECT MODE</p>
          <h2 className="font-display uppercase text-3xl tracking-wider mt-2">{EN[game] ?? game}</h2>
          <p className="text-sm text-arena-textDim mt-1">{gameLabel(game)} — 対戦人数を選んでください</p>

          <div className="grid grid-cols-3 gap-2 mt-6">
            {[2, 3, 4].map((n) => (
              <button
                key={n}
                onClick={() => {
                  setPlayers(n);
                  router.replace(`/play/${game}/match?players=${n}`);
                }}
                className="shine bg-arena-bg border border-arena-border hover:border-arena-primary hover:bg-arena-surface2 transition py-5 font-display uppercase tracking-[0.18em] text-arena-text hover:text-arena-primary"
              >
                <span className="block text-2xl">{n}</span>
                <span className="block text-[10px] mt-1">PLAYERS</span>
              </button>
            ))}
          </div>

          <Button variant="ghost" className="w-full mt-5" onClick={() => router.push("/")}>
            BACK / 戻る
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto mt-12">
      <div className="relative corner-brackets bg-arena-surface border border-arena-border p-10 text-center scanline">
        <span className="cb1" /><span className="cb2" />

        <p className="font-display uppercase tracking-[0.3em] text-arena-primary text-xs">
          // SEARCHING MATCH
        </p>
        <h2 className="font-display uppercase text-3xl tracking-wider mt-2">
          {EN[game] ?? game}
        </h2>
        <p className="text-arena-textDim text-xs mt-1">
          {gameLabel(game)}
          {supportsMulti && players && ` / ${players}人対戦`}
        </p>

        {/* Pulse ring */}
        <div className="relative mx-auto my-8 w-32 h-32">
          <div className="absolute inset-0 rounded-full border-2 border-arena-primary animate-ping opacity-40" />
          <div className="absolute inset-3 rounded-full border border-arena-primary/60 animate-pulse" />
          <div className="absolute inset-0 flex items-center justify-center font-mono text-3xl text-arena-primary">
            {elapsed}
            <span className="text-base text-arena-textDim">s</span>
          </div>
        </div>

        <p className="text-arena-text font-display tracking-widest uppercase text-sm">{status}</p>

        <div className="grid grid-cols-2 gap-2 text-xs font-mono mt-6">
          <div className="bg-arena-bg border border-arena-border p-2">
            <p className="text-arena-textMute">ONLINE</p>
            <p className="text-arena-success text-base">{online}</p>
          </div>
          <div className="bg-arena-bg border border-arena-border p-2">
            <p className="text-arena-textMute">NEEDED</p>
            <p className="text-arena-warning text-base">
              {pendingNeeded ?? "—"}
            </p>
          </div>
        </div>

        <p className="text-arena-textDim text-[11px] mt-4 font-mono">
          // RATING TOLERANCE EXPANDS OVER TIME
        </p>

        <Button variant="danger" className="w-full mt-6" onClick={() => router.back()}>
          CANCEL / キャンセル
        </Button>
      </div>
    </div>
  );
}