import type { Config } from "tailwindcss";

const config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
    "*.{svg}",
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "1.5rem",
      screens: {
        "2xl": "1280px",
      },
    },
    extend: {
      fontFamily: {
        pixel: ['"Press Start 2P"', "monospace"],
        display: ["Poppins", "sans-serif"],
        terminal: ['"Geist Mono"', "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "var(--background)",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      blur: {
        "4xl": "128px",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        infiniteSlider: {
          "0%": { transform: "translateX(0)" },
          "100%": {
            transform: "translateX(calc(-250px * 5))",
          },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
        blink: {
          "50%": { opacity: "0" },
        },
        "fade-up": {
          from: { opacity: "0", transform: "translateY(16px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        glitch: {
          "0%, 100%": {
            transform: "translate3d(0, 0, 0)",
            filter: "drop-shadow(0 0 0 transparent) drop-shadow(0 0 0 transparent)",
            opacity: "1",
          },
          "20%": {
            transform: "translate3d(-3px, 1px, 0)",
            filter: "drop-shadow(6px 0 rgba(1,98,200,0.9)) drop-shadow(-6px 0 rgba(245,187,3,0.9))",
          },
          "40%": {
            transform: "translate3d(4px, -2px, 0)",
            filter: "drop-shadow(-5px 0 rgba(1,98,200,0.85)) drop-shadow(5px 0 rgba(245,187,3,0.85))",
            opacity: "0.86",
          },
          "60%": {
            transform: "translate3d(-2px, 1px, 0)",
            filter: "drop-shadow(4px 0 rgba(1,98,200,0.8)) drop-shadow(-4px 0 rgba(245,187,3,0.8))",
          },
          "80%": {
            transform: "translate3d(3px, -1px, 0)",
            filter: "drop-shadow(-3px 0 rgba(1,98,200,0.7)) drop-shadow(3px 0 rgba(245,187,3,0.7))",
            opacity: "0.94",
          },
        },
        assemble: {
          from: { opacity: "0", transform: "scale(0.3) rotate(-35deg)" },
          to: { opacity: "1", transform: "scale(1) rotate(0deg)" },
        },
        drift: {
          "0%, 100%": { transform: "translateY(0) rotate(0deg)" },
          "50%": { transform: "translateY(-12px) rotate(3deg)" },
        },
        "terminal-pulse": {
          "0%, 100%": {
            transform: "scale(1)",
            boxShadow: "0 0 0 0 rgba(245,187,3,0), 0 8px 30px rgba(0,0,0,0.45)",
          },
          "30%": {
            transform: "scale(1.04)",
            boxShadow: "0 0 0 4px rgba(245,187,3,0.32), 0 8px 30px rgba(0,0,0,0.45)",
          },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        ["infinite-slider"]: "infiniteSlider 20s linear infinite",
        float: "float 6s ease-in-out infinite",
        blink: "blink 1.05s steps(1) infinite",
        "fade-up": "fade-up 0.9s cubic-bezier(0.2, 0.7, 0.2, 1) forwards",
        glitch: "glitch 0.4s linear infinite",
        assemble: "assemble 0.7s cubic-bezier(0.2, 0.9, 0.25, 1.25) both",
        drift: "drift 7s ease-in-out infinite",
        "terminal-pulse": "terminal-pulse 0.55s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;

export default config;
