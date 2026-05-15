"use client";

import { useEffect, useState } from "react";
import type { Clock } from "@/lib/games/clock";

interface Props {
  clock: Clock | undefined | null;
  /** My seat — used to decide whether THIS clock is timing me out. */
  mySeat: number;
  /** Fired once when the clock first crosses 0 on my own turn. The caller
   * is expected to notify /api/game/timeout. */
  onExpire?: () => void;
  label?: string;
}

function fmt(ms: number) {
  if (ms <= 0) return "0.0";
  const s = ms / 1000;
  return s >= 10 ? Math.ceil(s).toString() : s.toFixed(1);
}

export function TurnTimer({ clock, mySeat, onExpire, label }: Props) {
  const [now, setNow] = useState(() => Date.now());
  const [fired, setFired] = useState(false);

  // Reset the "fired" guard whenever the clock target changes.
  useEffect(() => {
    setFired(false);
  }, [clock?.turnStartedAt, clock?.turnSeat]);

  // Tick every 200ms while a clock is active.
  useEffect(() => {
    if (!clock) return;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [clock]);

  // Fire onExpire once.
  useEffect(() => {
    if (!clock || fired || !onExpire) return;
    if (clock.turnSeat !== mySeat) return;
    const remaining =
      clock.turnLimitMs - (now - Date.parse(clock.turnStartedAt));
    if (remaining <= 0) {
      setFired(true);
      onExpire();
    }
  }, [clock, fired, mySeat, now, onExpire]);

  if (!clock) return null;

  const remaining = Math.max(
    0,
    clock.turnLimitMs - (now - Date.parse(clock.turnStartedAt)),
  );
  const ratio = Math.max(0, Math.min(1, remaining / clock.turnLimitMs));
  const ownTurn = clock.turnSeat === mySeat;
  const danger = remaining < 8_000;

  return (
    <div className="inline-flex flex-col gap-1 min-w-[120px]">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-[10px] uppercase tracking-widest text-arena-textMute">
          {label ?? (ownTurn ? "YOUR TIMER" : "OPP TIMER")}
        </span>
        <span
          className={`font-mono text-lg leading-none ${
            danger
              ? "text-arena-accent animate-pulse"
              : ownTurn
                ? "text-arena-primary"
                : "text-arena-textDim"
          }`}
        >
          {fmt(remaining)}
          <span className="text-xs">s</span>
        </span>
      </div>
      <div className="h-1 w-full bg-arena-bg border border-arena-border overflow-hidden">
        <div
          className={`h-full ${
            danger
              ? "bg-arena-accent"
              : ownTurn
                ? "bg-arena-primary"
                : "bg-arena-textMute"
          }`}
          style={{ width: `${ratio * 100}%`, transition: "width 200ms linear" }}
        />
      </div>
    </div>
  );
}
