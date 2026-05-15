/* eslint-disable react/jsx-no-comment-textnodes */
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

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
    <div className="max-w-xl mx-auto mt-8 space-y-6">
      <section className="border-l-4 border-arena-accent pl-5 py-4">
        <p className="font-display uppercase tracking-[0.32em] text-arena-accent text-xs">
          // FRIEND MATCH
        </p>
        <h1 className="font-display uppercase text-3xl sm:text-4xl tracking-wider mt-2">
          PRIVATE LOBBY
        </h1>
        <p className="text-arena-textDim text-sm mt-1">
          パスコードを共有して、知り合いだけの部屋で対戦。レートは変動しません（カジュアル）。
        </p>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* CREATE */}
        <div className="relative corner-brackets bg-arena-surface border border-arena-border p-6">
          <span className="cb1" /><span className="cb2" />
          <p className="font-display uppercase tracking-[0.22em] text-arena-primary text-xs mb-3">
            // HOST
          </p>
          <h2 className="font-display uppercase text-xl tracking-wider">CREATE ROOM</h2>
          <p className="text-arena-textDim text-xs mt-2">
            部屋を建てるとパスコードが発行されます。相手に共有してください。
          </p>
          <Button onClick={createRoom} disabled={busy} className="w-full mt-5">
            CREATE / 部屋を作る
          </Button>
        </div>

        {/* JOIN */}
        <div className="relative corner-brackets bg-arena-surface border border-arena-border p-6">
          <span className="cb1" /><span className="cb2" />
          <p className="font-display uppercase tracking-[0.22em] text-arena-accent text-xs mb-3">
            // GUEST
          </p>
          <h2 className="font-display uppercase text-xl tracking-wider">JOIN ROOM</h2>
          <form onSubmit={joinRoom} className="space-y-3 mt-3">
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="PASSCODE (e.g. AB3D7K)"
              maxLength={16}
              className="w-full px-4 py-3 bg-arena-bg border border-arena-border focus:border-arena-primary focus:outline-none focus-visible:ring-1 focus-visible:ring-arena-primary font-mono uppercase tracking-[0.3em] text-center text-lg"
              autoCapitalize="characters"
              autoComplete="off"
            />
            <Button type="submit" disabled={busy || !code.trim()} className="w-full">
              JOIN / 入室
            </Button>
          </form>
        </div>
      </div>

      {error && (
        <p className="text-sm text-arena-accent font-mono">// ERROR: {error}</p>
      )}
    </div>
  );
}