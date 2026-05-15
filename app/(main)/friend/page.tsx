"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function FriendLandingPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createRoom() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/rooms/private", { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.roomId) {
        setError(json.error ?? "部屋を作成できませんでした");
        return;
      }
      router.push(`/friend/${json.roomId}`);
    } finally {
      setBusy(false);
    }
  }

  async function joinRoom(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/rooms/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode: code }),
      });
      const json = await res.json();
      if (!res.ok || !json.roomId) {
        setError(json.error ?? "入室できませんでした");
        return;
      }
      router.push(`/friend/${json.roomId}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-md mx-auto mt-12 space-y-6">
      <h1 className="text-2xl font-semibold">フレンド対戦</h1>
      <p className="text-sm text-slate-500">
        プライベート部屋を建ててパスコードを共有するか、教えてもらったパスコードで入室します。
        ここでの対戦結果はレーティングに反映されません（カジュアル扱い）。
      </p>

      <Card>
        <CardHeader>
          <CardTitle>部屋を建てる</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-slate-500">
            建てるとパスコードが発行されます。それを相手に共有してください。
          </p>
          <Button onClick={createRoom} disabled={busy}>
            部屋を作る
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>部屋に入る</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={joinRoom} className="space-y-3">
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="パスコード（例: AB3D7K）"
              maxLength={16}
              className="w-full px-3 py-2 border rounded font-mono uppercase tracking-wider"
              autoCapitalize="characters"
              autoComplete="off"
            />
            <Button type="submit" disabled={busy || !code.trim()}>
              入室する
            </Button>
          </form>
        </CardContent>
      </Card>

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}
