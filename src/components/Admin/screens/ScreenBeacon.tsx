"use client";

import { useEffect, useState } from "react";

import { useRealtimeChannel } from "hooks/useRealtimeChannel";
import { client } from "lib/orpc";
import type { ScreenSignal } from "lib/orpc/screens/schemas";
import { GLOBAL_CHANNELS } from "lib/realtime/channels";

const ID_KEY = "owu-screen-id";
const BEAT_MS = 20_000;
const IDENTIFY_MS = 5_000;

/** The id this display keeps for good, so the name the admin gives it survives reloads. */
function screenId(): string {
  const fresh = `scr-${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36)}`;
  try {
    const stored = window.localStorage.getItem(ID_KEY);
    if (stored) return stored;
    window.localStorage.setItem(ID_KEY, fresh);
  } catch {
    // Storage blocked: this session still shows up, as a new screen.
  }

  return fresh;
}

/**
 * Keeps this display on the Pantallas page: a beat every 20 s and whenever it comes back to the
 * foreground. Returns the name to show while the admin asks "which one is this?", and reloads
 * when told to. Previews embedded in the admin (monitors, thumbnails) aren't screens: they stay
 * quiet. `eventId` left undefined keeps the event the screen already had.
 */
export function useScreenHeartbeat(eventId?: string | null): ScreenSignal | null {
  const [id, setId] = useState("");
  const [shown, setShown] = useState<ScreenSignal | null>(null);

  useEffect(() => {
    if (window.top === window.self) setId(screenId());
  }, []);

  useEffect(() => {
    if (!id) return;
    const beat = () =>
      void client.screens
        .beat({ id, path: window.location.pathname, eventId, userAgent: navigator.userAgent })
        .catch(() => undefined);
    const onVisibility = () => document.visibilityState === "visible" && beat();
    beat();
    const timer = setInterval(beat, BEAT_MS);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [id, eventId]);

  useRealtimeChannel(id ? GLOBAL_CHANNELS.screens : null, (event, payload) => {
    const signal = payload as ScreenSignal;
    if (signal.id !== id) return;
    if (event === "reload") window.location.reload();
    if (event === "identify") setShown(signal);
  });

  useEffect(() => {
    if (!shown) return;
    const timer = setTimeout(() => setShown(null), IDENTIFY_MS);

    return () => clearTimeout(timer);
  }, [shown]);

  return shown;
}

/** Mount once per display page: invisible, except for the full-screen name on identify. */
export function ScreenBeacon({ eventId }: { eventId?: string | null }) {
  const shown = useScreenHeartbeat(eventId);
  if (!shown) return null;

  return (
    <div
      aria-live="assertive"
      className="fixed inset-0 z-[2147483647] flex flex-col items-center justify-center gap-[3vh] bg-black/90 p-[6vw] text-center text-white shadow-[inset_0_0_0_min(1.5vw,3vh)_#F5BB03]"
      role="status"
    >
      <p className="font-terminal text-[min(2.2vw,4vh)] tracking-[0.3em] text-[#F5BB03] uppercase">Esta pantalla es</p>
      <p className="font-display text-[min(8vw,15vh)] leading-none font-bold text-balance">
        {shown.name || "Sin nombre"}
      </p>
      <p className="font-terminal text-[min(2vw,3.6vh)] text-white/60">
        {[shown.label, shown.id].filter(Boolean).join(" · ")}
      </p>
    </div>
  );
}
