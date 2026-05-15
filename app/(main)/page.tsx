/* eslint-disable react/jsx-no-comment-textnodes */
"use client";

import Link from "next/link";
import { GAMES } from "@/lib/utils";
import { usePresence } from "@/components/common/PresenceProvider";

// オンライン対応済みのゲーム。未対応のものは「近日公開」表示。
const ONLINE_READY: ReadonlySet<string> = new Set([
  "chess",
  "shogi",
  "babanuki",
  "shinkei",
  "daifugo",
]);

// English/codename labels used in the Apex/Valorant-styled tiles.
const EN: Record<string, string> = {
  chess:    "CHESS",
  shogi:    "SHOGI",
  babanuki: "OLD MAID",
  daifugo:  "PRESIDENT",
  shinkei:  "MEMORY",
};

const ROLE_TAG: Record<string, string> = {
  chess:    "TACTICAL",
  shogi:    "TACTICAL",
  babanuki: "PARTY",
  daifugo:  "PARTY",
  shinkei:  "MIND",
};

export default function HomePage() {
  const { online } = usePresence();

  return (
    <div className="space-y-10">
      {/* HERO */}
      <section className="relative scanline border-l-4 border-arena-primary pl-6 py-8">
        <p className="font-display uppercase tracking-[0.32em] text-arena-primary text-xs">
          // SELECT YOUR GAME
        </p>
        <h1 className="font-display uppercase text-4xl sm:text-5xl md:text-6xl tracking-wider mt-2">
          PLAY <span className="text-arena-primary">BOARD ARENA</span>
        </h1>
        <p className="text-arena-textDim text-sm mt-2">
          チェス・将棋・トランプ — Solo (CPU 10段階) / Online (Rated) / Friend Match
        </p>
      </section>

      {/* Status bar */}
      <section className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-arena-surface/60 border border-arena-border">
        <div className="flex items-center gap-4 text-xs font-mono">
          <span className="text-arena-success">
            <span className="inline-block w-1.5 h-1.5 bg-arena-success rounded-full mr-2 animate-pulse" />
            {online} PLAYERS ONLINE
          </span>
          <span className="text-arena-textDim">SERVERS: <span className="text-arena-primary">OPTIMAL</span></span>
        </div>
        <Link
          href="/friend"
          className="shine relative inline-flex items-center gap-3 px-5 h-10 bg-arena-bg border-l-4 border-arena-accent text-arena-text hover:bg-arena-surface hover:border-arena-primary transition-all font-display uppercase tracking-[0.18em] text-xs"
        >
          🤝 FRIEND MATCH <span className="text-arena-textDim">/ フレンド対戦</span>
        </Link>
      </section>

      {/* Game tiles */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {GAMES.map((g, idx) => {
          const onlineReady = ONLINE_READY.has(g.id);
          return (
            <div
              key={g.id}
              className="group relative bg-arena-surface border border-arena-border hover:border-arena-primary p-5 overflow-hidden transition-all duration-200 hover:-translate-y-0.5"
            >
              {/* Decorative corner */}
              <div className="pointer-events-none absolute -right-12 -top-12 w-32 h-32 bg-arena-primary/10 rotate-45 group-hover:bg-arena-primary/25 transition" />
              {/* Left accent line */}
              <span className="pointer-events-none absolute top-0 left-0 w-1 h-full bg-arena-primary scale-y-0 group-hover:scale-y-100 origin-top transition-transform" />

              <div className="relative">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-[10px] text-arena-textMute">
                    // 0{idx + 1}
                  </span>
                  <span className="font-mono text-[10px] uppercase px-2 py-0.5 bg-arena-bg border border-arena-border text-arena-primary">
                    {ROLE_TAG[g.id]}
                  </span>
                </div>
                <h3 className="font-display uppercase tracking-wider text-3xl flex items-center gap-2">
                  <span>{g.emoji}</span>
                  <span>{EN[g.id] ?? g.id}</span>
                </h3>
                <p className="text-arena-textDim text-sm mt-1">{g.name}</p>
                <p className="text-arena-textMute text-[11px] mt-1 font-mono">
                  MAX {g.maxPlayers} PLAYERS
                </p>

                <div className="flex gap-2 mt-5">
                  <Link
                    href={`/play/${g.id}/solo`}
                    className="shine flex-1 inline-flex items-center justify-center h-10 px-4 bg-arena-surface2 border border-arena-border text-arena-text hover:border-arena-primary hover:text-arena-primary font-display uppercase tracking-[0.18em] text-xs transition"
                  >
                    SOLO
                  </Link>
                  {onlineReady ? (
                    <Link
                      href={`/play/${g.id}/match`}
                      className="shine flex-1 inline-flex items-center justify-center h-10 px-4 bg-arena-primary border border-arena-primary text-arena-bg hover:bg-arena-primaryHi hover:shadow-neon font-display uppercase tracking-[0.18em] text-xs transition"
                    >
                      QUEUE
                    </Link>
                  ) : (
                    <span className="flex-1 inline-flex items-center justify-center h-10 px-4 bg-transparent text-arena-textMute border border-dashed border-arena-border font-display uppercase tracking-[0.18em] text-[10px] cursor-not-allowed">
                      SOON
                    </span>
                  )}
                </div>

                <Link
                  href={`/ranking/${g.id}`}
                  className="block text-[11px] text-arena-textDim hover:text-arena-primary font-mono mt-3"
                >
                  → VIEW RANKING
                </Link>
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}