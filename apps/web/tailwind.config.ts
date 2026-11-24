import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: "#0F766E", dark: "#115E59", soft: "#CCFBF1" },
        ink: "#0F172A",
        muted: "#64748B",
        line: "#E2E8F0",
        surface: "#F2F5F4",
        open: { DEFAULT: "#16A34A", soft: "#DCFCE7", text: "#15803D" },
        queue: { DEFAULT: "#D97706", soft: "#FEF3C7", text: "#B45309" },
        closed: { DEFAULT: "#DC2626", soft: "#FEE2E2", text: "#B91C1C" },
        unknown: { DEFAULT: "#94A3B8", soft: "#E2E8F0", text: "#475569" },
      },
      fontFamily: {
        sans: ["var(--font-jakarta)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        float: "0 8px 20px -8px rgba(15,23,42,.3)",
        chip: "0 2px 6px rgba(15,23,42,.1)",
        sheet: "0 -12px 30px -12px rgba(15,23,42,.3)",
      },
    },
  },
  plugins: [],
};

export default config;
