import { Geist_Mono, Inter, Open_Sans, Poppins, Press_Start_2P } from "next/font/google";

/**
 * The site's fonts, self-hosted by next/font: downloaded at build time, preloaded, no requests to
 * Google from the browser and no render-blocking @import. Each one is a CSS variable on <html>
 * (Tailwind's font families read them); canvas code that draws text needs the real family names,
 * so it uses `poppins.style.fontFamily` and friends instead of a literal "Poppins".
 */
export const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const poppins = Poppins({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-poppins",
  display: "swap",
});

export const geistMono = Geist_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-geist-mono",
  display: "swap",
});

export const openSans = Open_Sans({ subsets: ["latin"], variable: "--font-open-sans", display: "swap" });

export const pressStart = Press_Start_2P({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-press-start",
  display: "swap",
});

export const fontVariables = [inter, poppins, geistMono, openSans, pressStart].map((font) => font.variable).join(" ");
