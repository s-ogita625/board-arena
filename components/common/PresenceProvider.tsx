"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";

interface PresenceCtx {
  online: number;
}

const Ctx = createContext<PresenceCtx>({ online: 0 });

export function usePresence() {
  return useContext(Ctx);
}

/**
 * Subscribes every authenticated browser tab to a global Realtime channel
 * called `lobby_presence` and tracks itself. The number of unique presence
 * keys (one per user_id) is exposed as the global online count.
 *
 * Unauthenticated visitors don't count. Multiple tabs from the same user
 * count once because we key by user_id.
 */
export function PresenceProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [online, setOnline] = useState(0);

  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | null = null;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!mounted) return;
      if (!user) {
        // Listeners only — we still want to display the count to logged-out
        // visitors, so attach without tracking.
        const ch = supabase.channel("lobby_presence", {
          config: { presence: { key: "anon-" + Math.random().toString(36).slice(2, 8) } },
        });
        ch.on("presence", { event: "sync" }, () => {
          if (!mounted) return;
          const state = ch.presenceState();
          // Don't count anonymous viewers, only authenticated user keys.
          const realUsers = Object.keys(state).filter((k) => !k.startsWith("anon-"));
          setOnline(realUsers.length);
        }).subscribe();
        unsubscribe = () => {
          supabase.removeChannel(ch);
        };
        return;
      }

      const ch = supabase.channel("lobby_presence", {
        config: { presence: { key: user.id } },
      });
      ch.on("presence", { event: "sync" }, () => {
        if (!mounted) return;
        const state = ch.presenceState();
        const realUsers = Object.keys(state).filter((k) => !k.startsWith("anon-"));
        setOnline(realUsers.length);
      }).subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await ch.track({ at: new Date().toISOString() });
        }
      });
      unsubscribe = () => {
        supabase.removeChannel(ch);
      };
    })();

    return () => {
      mounted = false;
      if (unsubscribe) unsubscribe();
    };
  }, [supabase]);

  return <Ctx.Provider value={{ online }}>{children}</Ctx.Provider>;
}
