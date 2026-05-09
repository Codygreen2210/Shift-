import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: "#0D0D0D",
          1: "#141312",
          2: "#1B1A18",
        },
        accent: "#FF6B35",
        gold: "#FFD166",
        success: "#06D6A0",
        danger: "#E63946",
        ink: {
          DEFAULT: "#F5F1E8",
          2: "#BFB8A8",
          3: "#6E6962",
        },
      },
      fontFamily: {
        display: ['"Fraunces"', "Georgia", "serif"],
        sans: ['"DM Sans"', "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
