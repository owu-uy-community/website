"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { orpc } from "lib/orpc";

export type AdminEvent = {
  id: string;
  name: string;
  slug: string;
  startDate: string;
  communityId: string;
  communityName: string;
  communitySlug: string;
};

const LAST_EVENT_KEY = "owu-admin:last-event";

function subscribeLastEvent(listener: () => void) {
  window.addEventListener("storage", listener);
  return () => window.removeEventListener("storage", listener);
}
const lastEventSnapshot = () => window.localStorage.getItem(LAST_EVENT_KEY);
const noLastEvent = () => null;

/**
 * The admin's working scope, read from the URL: the community lives in the
 * path (/admin/<communitySlug>/…) and the event in `?event=<slug>`. Keeping
 * both in the URL means a page can be shared or bookmarked as "this board for
 * this org", and a refresh cannot silently switch tenants. Pages outside a
 * community (OBS, Escenas…) keep the event chosen last on this device.
 */
export function useSelectedEvent(): {
  events: AdminEvent[];
  /** Events of the selected community only. */
  communityEvents: AdminEvent[];
  selected: AdminEvent | null;
  /** Community slug from the path, or the selected event's community. */
  communitySlug: string | null;
  /**
   * Where event links point: the selected event, or until the event list loads, the community
   * and event already in the URL. A link clicked that early must not fall back to its bare path,
   * which forwards to the newest event of any community.
   */
  scope: EventScope | null;
  isLoading: boolean;
} {
  const params = useParams();
  const searchParams = useSearchParams();
  // `[communitySlug]` on the scoped pages; the communities admin section uses
  // `[slug]` (+ `[eventSlug]`) for the same thing — honor both so the switcher
  // reflects the community/event being managed, not the newest event overall.
  const routeCommunity =
    typeof params?.communitySlug === "string"
      ? params.communitySlug
      : typeof params?.slug === "string"
        ? params.slug
        : null;
  const routeEvent = typeof params?.eventSlug === "string" ? params.eventSlug : null;
  const eventSlug = searchParams.get("event") ?? routeEvent;
  const lastEventId = useSyncExternalStore(subscribeLastEvent, lastEventSnapshot, noLastEvent);

  const { data, isLoading } = useQuery(orpc.openSpaces.listForAdmin.queryOptions({ staleTime: 60_000 }));
  const events = (data ?? []) as AdminEvent[];

  const communityEvents = routeCommunity ? events.filter((event) => event.communitySlug === routeCommunity) : events;

  // Newest event is the sensible default: it is the one being run. With a
  // community in the route, never fall back to another community's event —
  // "no events here" must not silently become "some other tenant's event".
  const selected =
    (eventSlug ? communityEvents.find((event) => event.slug === eventSlug) : undefined) ??
    (!routeCommunity && !eventSlug ? events.find((event) => event.id === lastEventId) : undefined) ??
    communityEvents[0] ??
    (routeCommunity ? null : events[0]) ??
    null;

  useEffect(() => {
    if (selected && selected.id !== window.localStorage.getItem(LAST_EVENT_KEY)) {
      window.localStorage.setItem(LAST_EVENT_KEY, selected.id);
    }
  }, [selected]);

  return {
    events,
    communityEvents,
    selected,
    communitySlug: routeCommunity ?? selected?.communitySlug ?? null,
    scope: selected
      ? { communitySlug: selected.communitySlug, slug: selected.slug }
      : routeCommunity && eventSlug
        ? { communitySlug: routeCommunity, slug: eventSlug }
        : null,
    isLoading,
  };
}

export type EventScope = { communitySlug: string; slug: string };

/** An event page's href in `scope` (a canonical nav href when there is none yet). */
export function eventHref(scope: EventScope | null, href: string): string {
  return scope ? scopedAdminHref(scope.communitySlug, href, scope.slug) : href;
}

/**
 * Community-scoped admin URL: `/admin/<community>/<subpage>?event=<slug>`.
 * `subpath` is the canonical nav href ("/admin/openspace"; "/admin" is the event's Hoy).
 */
export function scopedAdminHref(communitySlug: string, subpath: string, eventSlug?: string): string {
  const path = `/admin/${communitySlug}${subpath.replace(/^\/admin/, "")}`;
  return eventSlug ? `${path}?event=${encodeURIComponent(eventSlug)}` : path;
}

/** Strips the community segment so nav items match on their canonical href. */
export function normalizeAdminPath(pathname: string | null, communitySlug: string | null): string | null {
  if (!pathname || !communitySlug) return pathname;
  const prefix = `/admin/${communitySlug}`;
  if (pathname === prefix) return "/admin";
  return pathname.startsWith(`${prefix}/`) ? `/admin${pathname.slice(prefix.length)}` : pathname;
}
