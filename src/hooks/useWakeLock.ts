"use client";

import { useEffect } from "react";

/** Keeps a tablet's screen on while it is the desk (re-requested when the tab comes back). */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    const request = () => {
      if (document.visibilityState !== "visible") return;
      navigator.wakeLock
        .request("screen")
        .then((sentinel) => {
          lock = sentinel;
        })
        .catch(() => undefined);
    };
    request();
    document.addEventListener("visibilitychange", request);

    return () => {
      document.removeEventListener("visibilitychange", request);
      void lock?.release();
    };
  }, [active]);
}
