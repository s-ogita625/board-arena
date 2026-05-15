"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

interface MeProfile {
  id: string;
  username: string;
  avatar_url: string | null;
}

export function Header() {
  const router = useRouter();
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
        .single();
      setMe(prof ?? { id: user.id, username: "player", avatar_url: null });
    });
  }, []);

  async function signOut() {
    const supabase = createSupabaseBrowser();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="border-b border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-950/70 backdrop-blur sticky top-0 z-30">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link href="/" className="font-bold text-lg tracking-tight">
          🎲 BoardArena
        </Link>
        <nav className="flex items-center gap-2">
          <Link href="/ranking/chess">
            <Button variant="ghost" size="sm">ランキング</Button>
          </Link>
          {me ? (
            <>
              <Link href={`/profile/${me.id}`}>
                <Button variant="ghost" size="sm">
                  {me.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={me.avatar_url}
                      alt=""
                      className="w-6 h-6 rounded-full mr-2 object-cover"
                    />
                  ) : null}
                  {me.username}
                </Button>
              </Link>
              <Button variant="ghost" size="sm" onClick={signOut}>
                ログアウト
              </Button>
            </>
          ) : (
            <>
              <Link href="/login">
                <Button variant="ghost" size="sm">ログイン</Button>
              </Link>
              <Link href="/signup">
                <Button size="sm">新規登録</Button>
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
