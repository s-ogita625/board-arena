import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        board: {
          light: "#f0d9b5",
          dark: "#b58863",
        },
        arena: {
          bg: "#0a0d12",
          surface: "#11151c",
          surface2: "#1a2030",
          border: "#2a3344",
          primary: "#00e5ff",
          primaryHi: "#7ef9ff",
          accent: "#ff2d55",
          warning: "#ffb020",
          success: "#22d3a0",
          text: "#e6edf7",
          textDim: "#8a94a7",
          textMute: "#5a6478",
        },
        // legacy brand alias maps to arena.primary so existing usages keep
        // working while the Arena theme rolls out.
        brand: {
          DEFAULT: "#00e5ff",
          fg: "#0a0d12",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      gridTemplateColumns: {
        13: "repeat(13, minmax(0, 1fr))",
      },
      boxShadow: {
        neon: "0 0 20px rgba(0,229,255,0.4)",
        neonStrong: "0 0 30px rgba(0,229,255,0.7)",
      },
      keyframes: {
        scan: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100%)" },
        },
        flicker: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.6" },
        },
      },
      animation: {
        scan: "scan 6s linear infinite",
        flicker: "flicker 2.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
