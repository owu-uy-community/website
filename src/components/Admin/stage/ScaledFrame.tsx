"use client";

import { useEffect, useRef, useState, type Ref } from "react";

import { cn } from "app/lib/utils";
import { DEFAULT_CANVAS, type StageCanvas } from "lib/owy-stage/canvas";

/** A stage page laid out at its logical size and scaled to its box — pixel-identical to the OBS source. */
export function ScaledFrame({
  src,
  title,
  canvas = DEFAULT_CANVAS,
  frameRef,
  className,
}: {
  src: string;
  title: string;
  canvas?: StageCanvas;
  frameRef?: Ref<HTMLIFrameElement>;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.2);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / canvas.w));
    observer.observe(el);
    return () => observer.disconnect();
  }, [canvas.w]);

  return (
    <div
      ref={box}
      className={cn("relative w-full overflow-hidden rounded-md bg-black", className)}
      style={{ aspectRatio: `${canvas.w} / ${canvas.h}` }}
    >
      <iframe
        ref={frameRef}
        className="pointer-events-none absolute top-0 left-0 origin-top-left border-0"
        loading="lazy"
        src={src}
        style={{ width: canvas.w, height: canvas.h, transform: `scale(${scale})` }}
        tabIndex={-1}
        title={title}
      />
    </div>
  );
}
