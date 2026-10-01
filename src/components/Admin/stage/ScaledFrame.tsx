"use client";

import { useEffect, useRef, useState } from "react";

/** A stage page laid out at 1920×1080 and scaled to its box — pixel-identical to the OBS source. */
export function ScaledFrame({ src, title }: { src: string; title: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.2);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / 1920));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={box} className="relative aspect-video w-full overflow-hidden rounded-md bg-black">
      <iframe
        className="pointer-events-none absolute top-0 left-0 h-[1080px] w-[1920px] origin-top-left border-0"
        loading="lazy"
        src={src}
        style={{ transform: `scale(${scale})` }}
        tabIndex={-1}
        title={title}
      />
    </div>
  );
}
