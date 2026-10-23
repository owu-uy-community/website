"use client";

import { useEffect, useRef } from "react";

const STAR_COUNT = 700;
// Depth units per millisecond: a slow drift toward the visitor
const SPEED = 0.04;

/**
 * The stars drifting toward the visitor behind every page of the community site. One loop,
 * stopped on unmount (client navigations used to stack a new one each time); a still sky under
 * reduced motion. Drawing white at alpha on a transparent canvas is the same picture as the old
 * black canvas with `mix-blend-mode: screen`, without the browser blending the viewport every frame.
 */
export default function Starfield() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const stars = Array.from({ length: STAR_COUNT }, () => ({
      x: Math.random() * 1600 - 800,
      y: Math.random() * 900 - 450,
      z: Math.random() * 1000,
    }));

    const draw = () => {
      const { width, height } = canvas;
      context.clearRect(0, 0, width, height);
      context.fillStyle = "#fff";
      for (const star of stars) {
        const x = width / 2 + star.x / (star.z * 0.001);
        const y = height / 2 + star.y / (star.z * 0.001);
        if (x < 0 || x >= width || y < 0 || y >= height) continue;
        const depth = star.z / 1000;
        context.globalAlpha = 1 - depth * depth;
        context.fillRect(x, y, 1, 1);
      }
    };

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      draw();
    };

    let frame = 0;
    let last: number | undefined;
    const tick = (now: number) => {
      // Capped so a tab coming back from the background doesn't jump the whole sky
      const step = Math.min(now - (last ?? now), 100) * SPEED;
      last = now;
      for (const star of stars) {
        star.z -= step;
        while (star.z <= 1) star.z += 1000;
      }
      draw();
      frame = requestAnimationFrame(tick);
    };

    // The sky starts once the page is idle: decoration never competes with hydration
    let stopped = false;
    (window.requestIdleCallback ?? setTimeout)(() => {
      if (stopped) return;
      resize();
      window.addEventListener("resize", resize);
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) frame = requestAnimationFrame(tick);
    });

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-10" />;
}
