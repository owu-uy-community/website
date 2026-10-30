"use client";

import { useState } from "react";

import { cn } from "app/lib/utils";

import { ScaledFrame } from "./ScaledFrame";

/**
 * A scene card image: the pre-rendered thumbnail (`pnpm stage:thumbs`). A
 * scene without one yet falls back to its live page. No hover preview: a
 * touchscreen fires mouseenter on every tap, and the preview monitor shows
 * any scene live anyway.
 */
export function SceneThumb({ id, title, className }: { id: string; title: string; className?: string }) {
  const [missing, setMissing] = useState(false);

  // A 404 that lands before hydration never fires onError, which used to leave
  // a broken-image icon forever; catch it when the element mounts instead.
  const check = (img: HTMLImageElement | null) => {
    if (img?.complete && img.naturalWidth === 0) setMissing(true);
  };

  if (missing) return <ScaledFrame className={className} src={`/owy/stage/${id}?preview=1`} title={title} />;

  return (
    <div className={cn("relative aspect-video w-full overflow-hidden rounded-md bg-black", className)}>
      <img
        alt=""
        className="h-full w-full object-cover"
        decoding="async"
        draggable={false}
        loading="lazy"
        onError={() => setMissing(true)}
        ref={check}
        src={`/owy-stage/thumbs/${id}.jpg`}
      />
    </div>
  );
}
