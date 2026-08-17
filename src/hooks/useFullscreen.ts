"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Fullscreen toggle for one element. `supported` is resolved on the client
 * because `document.fullscreenEnabled` cannot be known while rendering on the
 * server — callers hide their button until it is true rather than shipping a
 * control that does nothing (iOS Safari).
 */
export function useFullscreen<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    setSupported(typeof document !== "undefined" && document.fullscreenEnabled);

    // Also fires when the user leaves with Escape, so the button stays honest.
    const onChange = () => setIsFullscreen(document.fullscreenElement === ref.current);
    document.addEventListener("fullscreenchange", onChange);

    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggle = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await ref.current?.requestFullscreen();
    } catch {
      // Denied or unsupported: the page stays perfectly usable as-is.
    }
  }, []);

  return { ref, isFullscreen, supported, toggle };
}
