"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

import { useSession } from "app/lib/auth-client";
import { AvatarStack } from "components/Admin/ui/person";
import { useRealtimeChannel } from "hooks/useRealtimeChannel";
import { presenceChannel } from "lib/realtime/channels";

import { navItemFor } from "./nav-config";
import { normalizeAdminPath, useSelectedEvent } from "./use-selected-event";

const HEARTBEAT_MS = 15_000;
const TTL_MS = 45_000;

export type Peer = {
  userId: string;
  name: string;
  image: string | null;
  /** Page title they are on ("Agenda"). */
  page: string;
  /** What they are editing right now (a talk id), so others see it taken. */
  focus: string | null;
  at: number;
};

type PresenceContext = { peers: Peer[]; setFocus: (focus: string | null) => void };

const Context = createContext<PresenceContext>({ peers: [], setFocus: () => {} });

/**
 * Who else has this event's admin open, over the existing socket: a heartbeat every 15 s on
 * a `private:` channel (site staff only), dropped after 45 s of silence.
 */
export function PresenceProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const { data: session } = useSession();
  const { selected, communitySlug } = useSelectedEvent();
  const pathname = usePathname();
  const page = navItemFor(normalizeAdminPath(pathname, communitySlug))?.title ?? "Admin";
  const [peers, setPeers] = useState<Record<string, Peer>>({});
  const [focus, setFocus] = useState<string | null>(null);
  const me = session?.user;
  const channel = enabled && selected && me ? presenceChannel(selected.id) : null;

  const { publish } = useRealtimeChannel(channel, (event, payload) => {
    const peer = payload as Peer;
    if (!peer?.userId || peer.userId === me?.id) return;
    setPeers((current) => {
      const next = { ...current };
      if (event === "leave") delete next[peer.userId];
      else next[peer.userId] = { ...peer, at: Date.now() };
      return next;
    });
  });

  const announce = useRef<() => void>(() => {});
  announce.current = () => {
    if (!channel || !me) return;
    publish("here", { userId: me.id, name: me.name, image: me.image ?? null, page, focus, at: Date.now() });
  };

  useEffect(() => {
    if (!channel) return;
    announce.current();
    const timer = setInterval(() => announce.current(), HEARTBEAT_MS);
    const sweep = setInterval(() => {
      setPeers((current) =>
        Object.fromEntries(Object.entries(current).filter(([, peer]) => Date.now() - peer.at < TTL_MS))
      );
    }, 5_000);
    const leave = () => me && publish("leave", { userId: me.id });
    window.addEventListener("pagehide", leave);
    return () => {
      clearInterval(timer);
      clearInterval(sweep);
      window.removeEventListener("pagehide", leave);
      leave();
      setPeers({});
    };
  }, [channel, me, publish]);

  // A new page or focus goes out right away, not on the next beat.
  useEffect(() => announce.current(), [page, focus]);

  const value = useMemo(
    () => ({ peers: Object.values(peers).sort((a, b) => a.name.localeCompare(b.name)), setFocus }),
    [peers]
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function usePresence() {
  return useContext(Context);
}

/** Mark something as being edited by me while `id` is set (cleared on unmount). */
export function usePresenceFocus(id: string | null) {
  const { setFocus } = usePresence();
  const set = useCallback(setFocus, [setFocus]);
  useEffect(() => {
    set(id);
    return () => set(null);
  }, [id, set]);
}

/** The header's "who else is here". */
export function PresenceAvatars() {
  const { peers } = usePresence();
  if (peers.length === 0) return null;

  return (
    <AvatarStack
      className="max-sm:hidden"
      details="También en el admin"
      max={3}
      people={peers.map((peer) => ({
        id: peer.userId,
        name: peer.name,
        image: peer.image,
        title: `${peer.name} · ${peer.page}`,
      }))}
      size={24}
    />
  );
}
