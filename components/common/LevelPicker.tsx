"use client";

import { cn } from "@/lib/utils";

interface Props {
  value: number;
  onChange: (v: number) => void;
}

export function LevelPicker({ value, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {Array.from({ length: 10 }, (_, i) => i + 1).map((lv) => (
        <button
          key={lv}
          onClick={() => onChange(lv)}
          className={cn(
            "w-10 h-10 rounded-md border text-sm font-medium transition",
            value === lv
              ? "bg-brand text-brand-fg border-brand"
              : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800",
          )}
          aria-label={`Lv ${lv}`}
        >
          {lv}
        </button>
      ))}
    </div>
  );
}
