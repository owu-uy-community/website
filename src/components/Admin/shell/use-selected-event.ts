"use client";

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

/**
 * The admin's working scope, read from the URL: the community lives in the
 * path (/admin/<communitySlug>/…) and the event in `?event=<slug>`. Keeping
 * both in the URL means a page can be shared or bookmarked as "this board for
 * this org", and a refresh cannot silently switch tenants.
 */
export function useSelectedEvent(): {
  events: AdminEvent[];
  /** Events of the selected community only. */
  communityEvents: AdminEvent[];
  selected: AdminEvent | null;
  /** Community slug from the path, or the selected event's community. */
  communitySlug: string | null;
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

  const { data, isLoading } = useQuery(orpc.openSpaces.listForAdmin.queryOptions({ staleTime: 60_000 }));
  const events = (data ?? []) as AdminEvent[];

  const communityEvents = routeCommunity ? events.filter((event) => event.communitySlug === routeCommunity) : events;

  // Newest event is the sensible default: it is the one being run. With a
  // community in the route, never fall back to another community's event —
  // "no events here" must not silently become "some other tenant's event".
  const selected =
    (eventSlug ? communityEvents.find((event) => event.slug === eventSlug) : communityEvents[0]) ??
    communityEvents[0] ??
    (routeCommunity ? null : events[0]) ??
    null;

  return {
    events,
    communityEvents,
    selected,
    communitySlug: routeCommunity ?? selected?.communitySlug ?? null,
    isLoading,
  };
}

/**
 * Community-scoped admin URL: `/admin/<community>/<subpage>?event=<slug>`.
 * `subpath` is the canonical nav href ("/admin/openspace").
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
