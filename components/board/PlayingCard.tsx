"use client";

import type { Card as PlayCard } from "@/lib/games/cards/deck";
import { isRed, rankLabel, suitGlyph } from "@/lib/games/cards/deck";
import { cn } from "@/lib/utils";

interface PlayingCardProps {
  /** "empty" バリアントでは省略可 */
  card?: PlayCard;
  /** "open" 表向き / "back" 裏 / "empty" 空マス */
  variant?: "open" | "back" | "empty";
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  size?: "sm" | "md";
  className?: string;
}

/**
 * 標準的なトランプ表示:
 * - 左上にランク、右下にスート (♥♦ は赤、♠♣ は黒)
 * - 中央に大きめのスート
 * - 裏向きは青模様
 */
export function PlayingCard({
  card,
  variant = "open",
  selected,
  disabled,
  onClick,
  size = "md",
  className,
}: PlayingCardProps) {
  const sizeCls =
    size === "sm"
      ? "w-7 h-10 text-[9px] sm:w-10 sm:h-14 sm:text-[10px]"
      : "w-10 h-14 text-[10px] sm:w-14 sm:h-20 sm:text-sm";
  const base =
    "relative rounded border shadow-sm flex items-center justify-center select-none transition";
  const isJoker = card?.suit === "JOKER";
  const red = !!card && !isJoker && isRed(card);

  if (variant === "back") {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className={cn(
          base,
          sizeCls,
          "bg-gradient-to-br from-blue-600 to-blue-800 text-white border-blue-900",
          "disabled:opacity-50 hover:brightness-110",
          className,
        )}
      >
        <span className="text-lg font-bold opacity-70">?</span>
      </button>
    );
  }

  if (variant === "empty") {
    return (
      <div
        className={cn(
          base,
          sizeCls,
          "bg-slate-100 dark:bg-slate-800 border-dashed border-slate-300 dark:border-slate-700",
          className,
        )}
      />
    );
  }

  // open
  if (!card) return null;
  return (
    <button
      type="button"
      disabled={disabled || !onClick}
      onClick={onClick}
      className={cn(
        base,
        sizeCls,
        "bg-white dark:bg-slate-100 border-slate-300 text-slate-900",
        red && "text-red-600",
        selected && "ring-2 ring-amber-500 -translate-y-1",
        disabled && "opacity-60",
        onClick && !disabled && "hover:-translate-y-0.5 cursor-pointer",
        !onClick && "cursor-default",
        className,
      )}
    >
      {isJoker ? (
        <span className="text-base sm:text-2xl">🃏</span>
      ) : (
        <>
          <span
            className={cn(
              "absolute top-0.5 left-0.5 sm:left-1 font-bold leading-none",
              red ? "text-red-600" : "text-slate-900",
            )}
          >
            {rankLabel(card)}
          </span>
          <span
            className={cn(
              "text-base sm:text-2xl leading-none",
              red ? "text-red-600" : "text-slate-900",
            )}
          >
            {suitGlyph(card)}
          </span>
          <span
            className={cn(
              "absolute bottom-0.5 right-0.5 sm:right-1 leading-none rotate-180",
              red ? "text-red-600" : "text-slate-900",
            )}
          >
            {rankLabel(card)}
          </span>
        </>
      )}
    </button>
  );
}
