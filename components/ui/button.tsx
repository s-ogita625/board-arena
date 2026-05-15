"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

// Sharp-edged, Apex/Valorant-style buttons.
const variantClasses: Record<Variant, string> = {
  primary:
    "bg-arena-primary text-arena-bg border border-arena-primary hover:bg-arena-primaryHi hover:shadow-neon disabled:bg-arena-border disabled:text-arena-textMute disabled:border-arena-border",
  secondary:
    "bg-arena-surface text-arena-text border border-arena-border hover:bg-arena-surface2 hover:border-arena-primary/60",
  ghost:
    "bg-transparent text-arena-text border border-transparent hover:border-arena-primary hover:text-arena-primary",
  danger:
    "bg-transparent text-arena-accent border border-arena-accent hover:bg-arena-accent hover:text-white",
};

const sizeClasses: Record<Size, string> = {
  sm: "h-8 px-4 text-[11px]",
  md: "h-10 px-6 text-xs",
  lg: "h-12 px-8 text-sm",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "shine relative inline-flex items-center justify-center font-display uppercase tracking-[0.18em] rounded-none transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-arena-primary disabled:cursor-not-allowed disabled:opacity-60",
          variantClasses[variant],
          sizeClasses[size],
          className,
        )}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";
