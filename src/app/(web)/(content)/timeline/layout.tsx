import type React from "react";
import type { Metadata } from "next";

// Kept out of search engines, /timeline and every page under it; each page's title and
// Open Graph card stay for shared links (link previews don't read robots)
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function TimelineLayout({ children }: { children: React.ReactNode }) {
  return children;
}
