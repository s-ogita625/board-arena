"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { gameLabel, isGameId } from "@/lib/utils";
import { createSupabaseBrowser } from "@/lib/supabase/client";

export default function MatchingPage() {
  const router = useRouter();
  const params = useParams<{ game: string }>();
  const game = params.game;
  const [elapsed, setElapsed] = useState(0);
  const [status, setStatus] = useState<string>("マッチング中...");
  const cancelRef = useRef(false);

  useEffect(() => {
    if (!isGameId(game)) return;
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
          body: JSON.stringify({ game }),
        });
        const json = await res.json();
        if (json.roomId) {
          router.push(`/play/${game}/room/${json.roomId}`);
          return;
        }
        if (json.error) {
          setStatus(`エラー: ${json.error}`);
          return;
        }
        // wait 3s before polling
        await new Promise<void>((r) => { timer = setTimeout(r, 3000); });
      }
    }
    poll();

    const tick = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => {
      mounted = false;
      cancelRef.current = true;
      clearInterval(tick);
      clearTimeout(timer);
      // best-effort cancel
      fetch(`/api/match?game=${game}`, { method: "DELETE" }).catch(() => {});
    };
  }, [game, router]);

  if (!isGameId(game)) return null;

  return (
    <div className="max-w-md mx-auto mt-16">
      <Card>
        <CardHeader>
          <CardTitle>{gameLabel(game)} - オンラインマッチング</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <p>{status}</p>
          <p className="text-3xl font-mono">{elapsed}s</p>
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
