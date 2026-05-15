"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { gameLabel, isGameId } from "@/lib/utils";
import { createSupabaseBrowser } from "@/lib/supabase/client";

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

export default function MatchingPage() {
  const router = useRouter();
  const params = useParams<{ game: string }>();
  const search = useSearchParams();
  const game = params.game;
  const onlineReady = ONLINE_READY.has(game);
  const supportsMulti = MULTI_SIZE.has(game);

  // 人数選択: クエリ ?players=N から取得。トランプ系で未指定なら選択画面を出す。
  const playersParam = Number(search.get("players"));
  const initialPlayers =
    supportsMulti && [2, 3, 4].includes(playersParam) ? playersParam : null;
  const [players, setPlayers] = useState<number | null>(
    supportsMulti ? initialPlayers : 2,
  );

  const [elapsed, setElapsed] = useState(0);
  const [status, setStatus] = useState<string>("マッチング中...");
  const [pendingNeeded, setPendingNeeded] = useState<number | null>(null);
  const cancelRef = useRef(false);

  useEffect(() => {
    if (!isGameId(game)) return;
    if (!onlineReady) return;
    if (players === null) return; // 人数未選択の間はキューに入れない
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
          setStatus(`エラー: ${json.error}`);
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
      <div className="max-w-md mx-auto mt-16">
        <Card>
          <CardHeader>
            <CardTitle>{gameLabel(game)} - オンライン対戦</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-center">
            <p className="text-sm text-slate-500">
              このゲームのオンライン対戦は近日公開予定です。
              <br />
              ソロ（CPU 10 段階）でお楽しみください。
            </p>
            <div className="flex gap-2 justify-center">
              <Button onClick={() => router.push(`/play/${game}/solo`)}>
                ソロで遊ぶ
              </Button>
              <Button variant="secondary" onClick={() => router.push("/")}>
                ホームに戻る
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 人数選択画面（トランプ系のみ、未選択時）
  if (supportsMulti && players === null) {
    return (
      <div className="max-w-md mx-auto mt-16">
        <Card>
          <CardHeader>
            <CardTitle>{gameLabel(game)} - 対戦人数を選択</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-center">
            <p className="text-sm text-slate-500">
              同じ人数でマッチング待機している人と対戦します
            </p>
            <div className="grid grid-cols-3 gap-2">
              {[2, 3, 4].map((n) => (
                <Button
                  key={n}
                  onClick={() => {
                    setPlayers(n);
                    router.replace(`/play/${game}/match?players=${n}`);
                  }}
                >
                  {n} 人対戦
                </Button>
              ))}
            </div>
            <Button variant="secondary" onClick={() => router.push("/")}>
              ホームに戻る
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto mt-16">
      <Card>
        <CardHeader>
          <CardTitle>
            {gameLabel(game)} - オンラインマッチング
            {supportsMulti && players && `（${players}人対戦）`}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <p>{status}</p>
          <p className="text-3xl font-mono">{elapsed}s</p>
          {pendingNeeded !== null && pendingNeeded > 0 && (
            <p className="text-sm text-slate-500">
              あと {pendingNeeded} 人参加待ち
            </p>
          )}
          <p className="text-xs text-slate-500">
            待ち時間が長いほどレート差の許容を広げます
          </p>
          <Button variant="secondary" onClick={() => router.back()}>
            キャンセル
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
