import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        reckon: {
          bg: "#060B18",
          card: "rgba(255,255,255,0.03)",
          border: "rgba(255,255,255,0.06)",
          teal: "#00FFD1",
          blue: "#6C8CFF",
          purple: "#A78BFA",
          amber: "#FBBF24",
          red: "#FF6B6B",
          green: "#34D399",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      animation: {
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
        "fade-up": "fade-up 0.5s ease-out forwards",
        "slide-in-right": "slide-in-right 0.4s ease-out forwards",
        "draw-line": "draw-line 1.5s ease-out forwards",
        "breathe": "breathe 2s ease-in-out infinite",
        "count-up": "count-up 1.2s ease-out",
        "border-flow": "border-flow 3s linear infinite",
        "float": "float 6s ease-in-out infinite",
      },
      keyframes: {
        "pulse-glow": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" },
        },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-right": {
          "0%": { opacity: "0", transform: "translateX(20px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        "draw-line": {
          "0%": { strokeDashoffset: "1000" },
          "100%": { strokeDashoffset: "0" },
        },
        "breathe": {
          "0%, 100%": { boxShadow: "0 0 4px rgba(52,211,153,0.4)" },
          "50%": { boxShadow: "0 0 12px rgba(52,211,153,0.8)" },
        },
        "border-flow": {
          "0%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
          "100%": { backgroundPosition: "0% 50%" },
        },
        "float": {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-4px)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
