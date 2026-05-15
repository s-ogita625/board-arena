"use client";

import { useEffect } from "react";

/**
 * Counts a task-kill (tab close, navigation away, crash-like reload) as a
 * resignation. Uses navigator.sendBeacon when available because it's the
 * only API guaranteed to deliver during page unload.
 *
 * Skips when the game is already finished so we don't accidentally double-
 * record a result after the natural end-of-game flow.
 */
export function useResignOnUnload(roomId: string, finished: boolean) {
  useEffect(() => {
    if (finished) return;
    const handler = () => {
      try {
        const payload = JSON.stringify({ roomId, reason: "unload" });
        if (typeof navigator !== "undefined" && navigator.sendBeacon) {
          const blob = new Blob([payload], { type: "application/json" });
          navigator.sendBeacon("/api/game/resign", blob);
        } else {
          fetch("/api/game/resign", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: payload,
            keepalive: true,
          }).catch(() => {});
        }
      } catch {
        /* best-effort */
      }
    };
    window.addEventListener("pagehide", handler);
    window.addEventListener("beforeunload", handler);
    return () => {
      window.removeEventListener("pagehide", handler);
      window.removeEventListener("beforeunload", handler);
    };
  }, [roomId, finished]);
}
