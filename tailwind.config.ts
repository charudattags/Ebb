import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Deep blue-green water, not tinted grey.
        bg: {
          DEFAULT: "#081918",
          panel: "#0d211f",
          raised: "#123029",
          border: "#1c3c35",
        },
        ink: {
          DEFAULT: "#eef4f0",
          dim: "#9fb8b0",
          faint: "#5f7d75",
        },
        // Surplus reads warm (above the line); deficit reads cool/desaturated.
        tide: {
          surplus: "#e3aa5f",
          surplusStrong: "#f0c179",
          deficit: "#4d7480",
          deficitStrong: "#6a97a3",
        },
        // One colour per classification, identical everywhere it appears.
        class: {
          seasonal: "#3fb2a0", // tidal teal — expected, calm
          temporary: "#e0a53a", // amber
          structural: "#e2604c", // deep coral — the only alarming colour
          improving: "#93d9ab", // pale green
          stable: "#8aa39d", // muted slate
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-body)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      backdropBlur: {
        glass: "10px",
      },
      keyframes: {
        "pulse-highlight": {
          "0%, 100%": { opacity: "0.35" },
          "50%": { opacity: "0.9" },
        },
        "fade-up": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "pulse-highlight": "pulse-highlight 1.6s ease-in-out infinite",
        "fade-up": "fade-up 0.3s ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
