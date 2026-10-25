"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * ←/→ walk the community's events (not while typing or with the lightbox open), and "Volver"
 * goes back to the archive row it came from when it came from there.
 */
export default function EventNav({ previous, next, archive }: { previous?: string; next?: string; archive: string }) {
  const router = useRouter();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (document.querySelector('[role="dialog"]')) return;
      if ((event.target as Element).closest("input, textarea, select, [contenteditable]")) return;
      const slug = event.key === "ArrowLeft" ? previous : event.key === "ArrowRight" ? next : undefined;
      if (slug) router.push(`/timeline/${slug}`);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [previous, next, router]);

  return (
    <Link
      className="inline-flex items-center gap-1.5 text-sm text-zinc-300 transition-colors hover:text-white"
      href={archive}
      onClick={(event) => {
        // Came from the archive (it left a note): Back restores the list where it was
        if (sessionStorage.getItem("timeline:return") && window.history.length > 1) {
          event.preventDefault();
          router.back();
        }
      }}
    >
      <ArrowLeft aria-hidden className="size-4" /> Volver al archivo
    </Link>
  );
}
