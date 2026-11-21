"use client";

import { Share2 } from "lucide-react";

import { toast } from "components/shared/ui/toast-utils";

/** Share the page: the phone's share sheet when there is one, otherwise the link to the clipboard. */
export function ShareButton({ url, title, className }: { url: string; title: string; className?: string }) {
  const share = async () => {
    if ("share" in navigator) {
      try {
        await navigator.share({ title, url });
        return;
      } catch (error) {
        // Closing the share sheet is not a failure; anything else falls back to copying
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copiado", "Pegalo donde lo quieras compartir.");
    } catch {
      toast.error("No pudimos copiar el link", url);
    }
  };

  return (
    <button className={className} type="button" onClick={() => void share()}>
      <Share2 aria-hidden className="size-4" />
      Compartir
    </button>
  );
}
