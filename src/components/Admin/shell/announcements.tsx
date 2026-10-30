"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { skipToken, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Check, Megaphone, TriangleAlert } from "lucide-react";

import { useSession } from "app/lib/auth-client";
import { cn } from "app/lib/utils";
import { PersonAvatar } from "components/Admin/ui/person";
import { SwipeRow, type SwipeAction } from "components/Admin/ui/swipe";
import { RelativeTime } from "components/Admin/ui/time";
import { Button } from "components/shared/ui/button";
import { Skeleton } from "components/shared/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "components/shared/ui/popover";
import { toast } from "components/shared/ui/toast-utils";
import { useRealtimeChannel } from "hooks/useRealtimeChannel";
import { orpc } from "lib/orpc";
import type { StaffAnnouncement } from "lib/orpc/staff-tasks/schemas";
import { eventChannel } from "lib/realtime/channels";

import { URGENT_COOKIE } from "./nav-config";
import { useShell } from "./use-shell-status";
import { eventHref } from "./use-selected-event";

/** The selected event's announcements, kept fresh by the staff channel's pings. */
function useAnnouncements() {
  const { selected } = useShell();
  const queryClient = useQueryClient();
  const eventId = selected?.id ?? null;
  const query = useQuery(
    orpc.staffTasks.announcements.list.queryOptions({
      input: eventId ? { eventId } : skipToken,
      staleTime: 30_000,
      refetchOnWindowFocus: true,
    })
  );
  useRealtimeChannel(eventId ? eventChannel(eventId, "staff") : null, () => {
    if (eventId) {
      void queryClient.invalidateQueries({ queryKey: orpc.staffTasks.announcements.list.key({ input: { eventId } }) });
    }
  });

  const ack = useMutation(
    orpc.staffTasks.announcements.ack.mutationOptions({
      onMutate: ({ announcementId }) => {
        const key = orpc.staffTasks.announcements.list.queryKey({ input: { eventId: eventId ?? "" } });
        queryClient.setQueryData<StaffAnnouncement[]>(key, (old = []) =>
          old.map((item) => (item.id === announcementId ? { ...item, ackedByMe: true } : item))
        );
      },
      onSettled: () =>
        eventId &&
        queryClient.invalidateQueries({ queryKey: orpc.staffTasks.announcements.list.key({ input: { eventId } }) }),
      onError: (error) => toast.error("No se pudo confirmar", error.message),
    })
  );

  return { eventId, announcements: query.data ?? [], loaded: query.isSuccess, ack };
}

const waitingForMe = (announcement: StaffAnnouncement, meId: string | undefined) =>
  Boolean(meId) && !announcement.ackedByMe && announcement.pending.some((person) => person.userId === meId);

/**
 * Urgent announcements reach every admin page, not only Staff y tareas: a banner that stays
 * until "Recibido", plus a toast for every new announcement while you work. `hint` (the cookie
 * above, read by the layout) holds the banner's room until the data arrives: a banner that
 * appeared after the first paint pushed the whole page down.
 */
export function UrgentBanner({ hint = false }: { hint?: boolean }) {
  const pathname = usePathname();
  const { data: session, isPending: sessionPending } = useSession();
  const meId = session?.user.id;
  const { eventId, announcements, loaded, ack } = useAnnouncements();
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!loaded) return;
    if (seen.current === null) {
      seen.current = new Set(announcements.map((item) => item.id));
      return;
    }
    for (const item of announcements) {
      if (seen.current.has(item.id)) continue;
      seen.current.add(item.id);
      if (item.author?.id === meId) continue;
      const from = item.author?.name ?? "Staff";
      if (item.urgent) toast.warning(`Urgente · ${from}`, item.body.slice(0, 140));
      else toast.info(`Anuncio de ${from}`, item.body.slice(0, 140));
    }
  }, [announcements, loaded, meId]);

  const urgent = announcements.find((item) => item.urgent && waitingForMe(item, meId));
  const ready = loaded && !sessionPending;
  const holding = hint && !ready;
  const banner = useRef<HTMLDivElement>(null);
  // Which announcement is shown in full: a new one starts clamped again.
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const showing = Boolean(urgent);
  useEffect(() => {
    if (!ready) return;
    document.cookie = showing
      ? `${URGENT_COOKIE}=1; path=/admin; max-age=86400; samesite=lax`
      : `${URGENT_COOKIE}=; path=/admin; max-age=0`;
  }, [ready, showing]);

  // Full-height pages size themselves with --admin-content-h; while the banner shows, it takes
  // its height out of that.
  useEffect(() => {
    const element = banner.current;
    const root = document.documentElement;
    if (!element) {
      root.style.removeProperty("--admin-banner-h");
      return;
    }
    const observer = new ResizeObserver(([entry]) =>
      root.style.setProperty(
        "--admin-banner-h",
        `${Math.ceil(entry.borderBoxSize[0]?.blockSize ?? entry.contentRect.height)}px`
      )
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--admin-banner-h");
    };
  }, [urgent?.id, holding]);

  // Mi turno shows the urgent announcement as its own big card, with the big "Recibido".
  if (pathname?.endsWith("/mi-turno")) return null;
  if (holding) {
    return (
      <div
        ref={banner}
        aria-hidden
        className="flex h-[89px] items-center border-b border-primary/30 bg-primary-surface px-4 sm:h-[49px] md:px-5"
      >
        <Skeleton className="h-3 w-1/2 bg-primary/10" />
      </div>
    );
  }
  if (!urgent || !eventId) return null;

  const expanded = expandedId === urgent.id;
  // On a touchscreen a swipe either way is "Recibido" too; the button stays.
  const received: SwipeAction = {
    label: "Recibido",
    icon: Check,
    tone: "ok",
    run: () => ack.mutate({ eventId, announcementId: urgent.id }),
  };

  return (
    <div ref={banner} className="border-b border-primary/30" role="alert">
      <SwipeRow className="rounded-none" disabled={ack.isPending} left={received} right={received}>
        {/* A phone gets two short rows (what and who, with Recibido beside them; then the text, two
            lines until tapped) instead of a wall that left full-height pages a single row. */}
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 bg-primary-surface px-4 py-2 sm:flex sm:py-2.5 md:px-5">
          <TriangleAlert aria-hidden className="size-4 shrink-0 text-primary motion-safe:animate-blink-step" />
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="font-terminal text-2xs tracking-[0.14em] text-primary uppercase">Urgente</span>
            <span className="truncate text-meta text-muted-foreground sm:hidden">
              {urgent.author?.name ?? "Staff"} · <RelativeTime className="text-meta" date={urgent.createdAt} />
            </span>
          </span>
          <p className="min-w-0 flex-1 text-ui text-foreground max-sm:hidden">
            {urgent.body}
            <span className="text-muted-foreground"> · {urgent.author?.name ?? "Staff"} · </span>
            <RelativeTime className="text-muted-foreground" date={urgent.createdAt} />
          </p>
          <Button className="sm:order-last" disabled={ack.isPending} size="sm" onClick={received.run}>
            <Check />
            Recibido
          </Button>
          <button
            aria-expanded={expanded}
            className="col-span-3 text-left text-ui text-foreground sm:hidden"
            type="button"
            onClick={() => setExpandedId(expanded ? null : urgent.id)}
          >
            <span className={cn(!expanded && "line-clamp-2")}>{urgent.body}</span>
          </button>
        </div>
      </SwipeRow>
    </div>
  );
}

/** The header bell: the latest announcements and what is still waiting for you. */
export function AnnouncementsBell() {
  const { data: session } = useSession();
  const meId = session?.user.id;
  const { scope, status } = useShell();
  const { eventId, announcements, ack } = useAnnouncements();
  const waiting = announcements.filter((item) => waitingForMe(item, meId));
  const allHref = scope ? eventHref(scope, status?.me.siteAdmin ? "/admin/comunicacion" : "/admin/tareas") : "/admin";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          aria-label={waiting.length ? `Anuncios: ${waiting.length} sin leer` : "Anuncios"}
          className="relative"
          size="icon-sm"
          variant="ghost"
        >
          <Bell />
          {waiting.length > 0 ? (
            <span className="absolute top-1 right-1 size-1.5 rounded-full bg-primary ring-2 ring-background" />
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[22rem] p-0">
        <div className="flex h-10 items-center gap-2 border-b border-border px-3">
          <Megaphone aria-hidden className="size-4 text-muted-foreground" />
          <span className="text-ui font-semibold">Anuncios</span>
          {waiting.length ? (
            <span className="font-terminal text-meta text-primary">{waiting.length} sin leer</span>
          ) : null}
          <Link className="touch-target ml-auto text-meta text-muted-foreground hover:text-foreground" href={allHref}>
            Ver todo
          </Link>
        </div>
        {announcements.length === 0 ? (
          <p className="px-3 py-8 text-center text-ui text-muted-foreground">Nadie anunció nada todavía.</p>
        ) : (
          <ul className="max-h-80 scrollbar-thin divide-y divide-border overflow-y-auto">
            {announcements.slice(0, 8).map((item) => {
              const mine = waitingForMe(item, meId) && eventId;
              // Swiping right on one waiting for you is "Recibido", like its button.
              const received: SwipeAction | null = mine
                ? {
                    label: "Recibido",
                    icon: Check,
                    tone: "ok",
                    run: () => ack.mutate({ eventId, announcementId: item.id }),
                  }
                : null;

              return (
                <li key={item.id}>
                  <SwipeRow className="rounded-none" right={received}>
                    <div
                      className={cn(
                        "flex gap-2.5 px-3 py-2.5",
                        // Opaque, so the swipe's action only shows once the row slides.
                        mine ? "bg-[color-mix(in_oklab,hsl(var(--primary))_3%,hsl(var(--popover)))]" : "bg-popover"
                      )}
                    >
                      <PersonAvatar image={item.author?.image} name={item.author?.name ?? "Staff"} size={22} />
                      <div className="min-w-0 flex-1">
                        <p className="text-ui text-foreground">
                          {item.urgent ? (
                            <span className="mr-1.5 font-terminal text-2xs text-primary uppercase">Urgente</span>
                          ) : null}
                          {item.body}
                        </p>
                        {/* Running text, so a narrow panel wraps it between words, not inside the name. */}
                        <p className="mt-0.5 text-meta text-muted-foreground">
                          {item.author?.name ?? "Staff"} · <RelativeTime date={item.createdAt} />
                          {item.pending.length > 0 ? ` · faltan ${item.pending.length}` : null}
                        </p>
                      </div>
                      {received ? (
                        <Button size="xs" variant="outline" onClick={received.run}>
                          Recibido
                        </Button>
                      ) : null}
                    </div>
                  </SwipeRow>
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
