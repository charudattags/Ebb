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
        bg: {
          DEFAULT: "#0b0e14",
          panel: "#12161f",
          raised: "#181d29",
          border: "#232938",
        },
        ink: {
          DEFAULT: "#e6e9f0",
          dim: "#9aa3b5",
          faint: "#5c6478",
        },
        class: {
          seasonal: "#3aa0ff",
          structural: "#ff5c6c",
          temporary: "#f5a623",
          improving: "#3ecf8e",
          stable: "#8b93a7",
        },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
