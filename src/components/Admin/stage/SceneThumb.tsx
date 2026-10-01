"use client";

import { useRef, useState } from "react";

import { ScaledFrame } from "./ScaledFrame";

/**
 * A scene card image: the pre-rendered thumbnail (`pnpm stage:thumbs`) by
 * default, the live preview page while the mouse rests on it. Scenes without
 * a thumbnail yet fall back to the live page.
 */
export function SceneThumb({ id, title }: { id: string; title: string }) {
  const [live, setLive] = useState(false);
  const [missing, setMissing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A 404 that lands before hydration never fires onError, which used to leave
  // a broken-image icon forever; catch it when the element mounts instead.
  const check = (img: HTMLImageElement | null) => {
    if (img?.complete && img.naturalWidth === 0) setMissing(true);
  };

  const enter = () => {
    timer.current = setTimeout(() => setLive(true), 350);
  };
  const leave = () => {
    if (timer.current) clearTimeout(timer.current);
    setLive(false);
  };

  return (
    <div className="relative" onMouseEnter={enter} onMouseLeave={leave}>
      {live || missing ? (
        <ScaledFrame src={`/owy/stage/${id}?preview=1`} title={title} />
      ) : (
        <div className="relative aspect-video w-full overflow-hidden rounded-md bg-black">
          <img
            alt=""
            className="h-full w-full object-cover"
            decoding="async"
            loading="lazy"
            onError={() => setMissing(true)}
            ref={check}
            src={`/owy-stage/thumbs/${id}.jpg`}
          />
        </div>
      )}
    </div>
  );
}
