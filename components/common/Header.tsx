"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { usePresence } from "./PresenceProvider";

interface MeProfile {
  id: string;
  username: string;
  avatar_url: string | null;
}

const NAV_LINKS: { label: string; sub: string; href: string }[] = [
  { label: "PLAY",    sub: "ホーム",     href: "/" },
  { label: "FRIEND",  sub: "フレンド",   href: "/friend" },
  { label: "RANKING", sub: "ランキング", href: "/ranking/chess" },
];

export function Header() {
  const router = useRouter();
  const { online } = usePresence();
  const [me, setMe] = useState<MeProfile | null>(null);

  useEffect(() => {
    const supabase = createSupabaseBrowser();
    supabase.auth.getUser().then(async ({ data }) => {
      const user = data.user;
      if (!user) {
        setMe(null);
        return;
      }
      const { data: prof } = await supabase
        .from("profiles")
        .select("id, username, avatar_url")
        .eq("id", user.id)
        .maybeSingle();
      if (!prof) {
        await fetch("/api/bootstrap", { method: "POST" });
        const { data: prof2 } = await supabase
          .from("profiles")
          .select("id, username, avatar_url")
          .eq("id", user.id)
          .maybeSingle();
        setMe(prof2 ?? { id: user.id, username: "player", avatar_url: null });
      } else {
        setMe(prof);
      }
    });
  }, []);

  async function signOut() {
    const supabase = createSupabaseBrowser();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 h-16 bg-arena-bg/90 backdrop-blur border-b border-arena-border">
      <div className="h-full px-4 sm:px-6 flex items-center justify-between gap-4">
        {/* Logo */}
        <Link
          href="/"
          className="font-display uppercase tracking-[0.22em] text-base sm:text-lg whitespace-nowrap"
        >
          BOARD<span className="text-arena-primary">/</span>ARENA
        </Link>

        {/* Center nav */}
        <nav className="hidden md:flex items-stretch h-16 gap-0">
          {NAV_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="px-4 flex items-center font-display uppercase tracking-[0.18em] text-xs text-arena-text hover:text-arena-primary border-b-2 border-transparent hover:border-arena-primary hover:bg-arena-surface/40 transition"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        {/* Right cluster */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Online badge */}
          <span
            className="font-mono text-[10px] sm:text-[11px] px-2 py-1 bg-arena-surface border border-arena-border whitespace-nowrap"
            title="現在オンラインのプレイヤー数"
          >
            <span className="inline-block w-1.5 h-1.5 bg-arena-success rounded-full mr-1.5 animate-pulse" />
            {online} ONLINE
          </span>

          {me ? (
            <div className="flex items-center gap-2 sm:gap-3 pl-2 sm:pl-3 border-l border-arena-border">
              <Link
                href={`/profile/${me.id}`}
                className="flex items-center gap-2 hover:bg-arena-surface px-2 py-1 transition"
              >
                {me.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={me.avatar_url}
                    alt=""
                    className="w-8 h-8 object-cover ring-1 ring-arena-primary/60"
                  />
                ) : (
                  <span className="w-8 h-8 bg-arena-surface2 ring-1 ring-arena-primary/40 flex items-center justify-center font-display text-arena-primary text-sm uppercase">
                    {me.username.slice(0, 1)}
                  </span>
                )}
                <span className="hidden sm:block leading-tight">
                  <span className="block font-display uppercase text-xs tracking-wider">
                    {me.username}
                  </span>
                  <span className="block font-mono text-[10px] text-arena-primary">
                    ONLINE
                  </span>
                </span>
              </Link>
              <Button variant="ghost" size="sm" onClick={signOut}>
                LOGOUT
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 pl-2 sm:pl-3 border-l border-arena-border">
              <Link href="/login">
                <Button variant="ghost" size="sm">
                  LOGIN
                </Button>
              </Link>
              <Link href="/signup">
                <Button size="sm">SIGN UP</Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
