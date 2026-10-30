"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronDown, ExternalLink, FilePen } from "lucide-react";

import { PageContainer, PageHeader } from "components/Admin/ui/page";
import { ScrollCue } from "components/Admin/ui/scroll-cue";
import { ErrorState } from "components/Admin/ui/states";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "components/shared/ui/dropdown-menu";
import { Skeleton } from "components/shared/ui/skeleton";
import { cn } from "app/lib/utils";
import { useRealtimeChannel } from "hooks/useRealtimeChannel";
import { daysBetween } from "lib/calendar/holidays";
import { dayKey, shortWhen } from "lib/community/time";
import { orpc } from "lib/orpc/client";
import { eventChannel } from "lib/realtime/channels";
import type { CommunityPermission } from "lib/authz/catalog";

import type { CalendarCommunity } from "../calendar/CalendarClient";
import { EventbriteStatus } from "../integrations/EventbriteStatus";
import { usePanel } from "../shell/context";
import { DespuesTab } from "./DespuesTab";
import { DoorTab } from "./DoorTab";
import { EmailsTab } from "./EmailsTab";
import { HoyTab } from "./HoyTab";
import { PeopleTab } from "./PeopleTab";
import { PublicationsTab } from "./PublicationsTab";
import { SettingsTab } from "./SettingsTab";

/** The dashboard's sections; `requires` hides one from whoever holds none of those permissions. */
const TABS = [
  { key: "hoy", title: "Hoy" },
  // The whole list (attendee:read), or just who waits for approval (rsvp:review, editors)
  { key: "personas", title: "Personas", requires: ["attendee:read", "rsvp:review"] },
  { key: "mensajes", title: "Mensajes", requires: ["event:message"] },
  { key: "difusion", title: "Difusión" },
  { key: "despues", title: "Después" },
  { key: "ajustes", title: "Ajustes" },
] as const satisfies readonly { key: string; title: string; requires?: readonly CommunityPermission[] }[];
/** The door, opened from Hoy (its link, the scanner, letting people in by name): a page of Hoy, not a tab */
export type Tab = (typeof TABS)[number]["key"] | "puerta";
/** Sections that changed name: their old links still land */
const RENAMED: Record<string, Tab> = {
  resumen: "hoy",
  inscriptos: "personas",
  emails: "mensajes",
  publicaciones: "difusion",
  feedback: "despues",
  encuesta: "despues",
};
/** On phones the strip is "Hoy · Personas · Más ▾" */
const UP_FRONT: Tab[] = ["hoy", "personas"];

/** Focus what a deep link names (`#recordatorio`) once it's on the page, so the next key works there. */
function useFocusHash(tab: Tab, ready: boolean, asked: number) {
  useEffect(() => {
    if (!ready) return;
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id) return;
    let tries = 0;
    const timer = window.setInterval(() => {
      const target = document.getElementById(id);
      tries += 1;
      if (!target && tries < 40) return;
      window.clearInterval(timer);
      if (!target) return;
      target.scrollIntoView({ block: "center" });
      const field = target.matches("input, textarea, select, button, a, [tabindex]")
        ? target
        : (target.querySelector<HTMLElement>("input, textarea, select, button") ?? target);
      if (field === target && !target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
      field.focus({ preventScroll: true });
    }, 100);

    return () => window.clearInterval(timer);
  }, [tab, ready, asked]);
}

/**
 * A published event, run from the panel: Hoy changes with the event's phase (getting ready, the
 * day, the close-out); then its people, messages, where it's announced, what stays after, and
 * its settings. Names and emails are for the community's admins.
 */
export function EventDashboard({
  community,
  eventId,
  today,
}: {
  community: CalendarCommunity;
  eventId: string;
  today: string;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const { can } = usePanel();
  const input = { communityId: community.id, eventId };
  const event = useQuery(orpc.events.get.queryOptions({ input, refetchOnWindowFocus: false }));
  const stats = useQuery(orpc.events.stats.queryOptions({ input }));
  const asked = params.get("tab") ?? "";
  const requested = RENAMED[asked] ?? asked;
  const visible = TABS.filter((tab) => !("requires" in tab) || tab.requires.some((permission) => can(permission)));
  const tab: Tab =
    requested === "puerta" && can("event:door-link")
      ? "puerta"
      : (visible.find((item) => item.key === requested)?.key ?? "hoy");
  // The strip marks Hoy while the door (a page of Hoy) is open
  const current = tab === "puerta" ? "hoy" : tab;
  // Sections change in place (no server round trip that would remount them), with the field to focus
  const [focusAsked, setFocusAsked] = useState(0);
  const go = (key: Tab, anchor?: string) => {
    const next = new URLSearchParams(params.toString());
    next.set("tab", key);
    window.history.replaceState(null, "", `${pathname}?${next.toString()}${anchor ? `#${anchor}` : ""}`);
    setFocusAsked((count) => count + 1);
  };
  useFocusHash(tab, Boolean(event.data), focusAsked);

  // Check-ins, sign-ups and seat changes ping the event's ops channel: read the counts again
  useRealtimeChannel(eventChannel(eventId, "ops"), (topic) => {
    if (topic === "rundown") void queryClient.invalidateQueries({ queryKey: orpc.events.agenda.key() });
    if (topic !== "checkins") return;
    void queryClient.invalidateQueries({ queryKey: orpc.events.stats.key() });
    void queryClient.invalidateQueries({ queryKey: orpc.attendees.key() });
  });

  if (event.isError) {
    return (
      <PageContainer>
        <ErrorState onRetry={() => void event.refetch()} title="No pudimos abrir el evento" />
      </PageContainer>
    );
  }
  if (!event.data) {
    return (
      <PageContainer>
        <Skeleton className="mb-6 h-10 w-80" />
        <Skeleton className="h-64 rounded-lg" />
      </PageContainer>
    );
  }
  const data = event.data;
  const days = daysBetween(today, dayKey(data.startDate));
  const pagePath = `/comunidad/${data.communitySlug}/events/${data.slug}`;
  const base = `/organizar/panel/${community.slug}/eventos/${eventId}`;
  const more = visible.filter((item) => !UP_FRONT.includes(item.key));
  const inMore = more.find((item) => item.key === current);
  const tabButton = (item: (typeof TABS)[number], className?: string) => (
    <button
      key={item.key}
      aria-current={current === item.key ? "page" : undefined}
      className={cn(
        "relative shrink-0 font-medium whitespace-nowrap transition-colors",
        current === item.key ? "text-foreground" : "text-muted-foreground hover:text-foreground",
        className
      )}
      type="button"
      onClick={() => go(item.key)}
    >
      {item.title}
    </button>
  );

  return (
    <PageContainer size="large">
      <PageHeader
        actions={
          <div className="flex gap-1.5">
            <Button asChild variant="outline">
              <Link href={`${base}/editar`}>
                <FilePen />
                Editar
              </Link>
            </Button>
            <Button asChild variant="outline">
              <a href={pagePath} rel="noreferrer" target="_blank">
                <ExternalLink />
                Ver la página
              </a>
            </Button>
          </div>
        }
        description={<span className="font-terminal tabular-nums">{shortWhen(data.startDate)}</span>}
        meta={
          data.status === "cancelled" ? (
            <Badge variant="destructive">Cancelado</Badge>
          ) : days >= 0 ? (
            <Badge variant="success">{days === 0 ? "Es hoy" : days === 1 ? "Mañana" : `Faltan ${days} días`}</Badge>
          ) : (
            <Badge variant="secondary">Pasó</Badge>
          )
        }
        title={data.name}
      />

      <nav aria-label="Secciones del evento" className="mb-5 max-sm:hidden">
        <ScrollCue className="border-b border-border">
          <div className="flex gap-5">
            {visible.map((item) =>
              tabButton(
                item,
                cn(
                  "h-9 text-ui after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-full",
                  current === item.key && "after:bg-primary"
                )
              )
            )}
          </div>
        </ScrollCue>
      </nav>
      <nav aria-label="Secciones del evento" className="mb-5 sm:hidden">
        <div className="grid auto-cols-fr grid-flow-col gap-1 rounded-lg border border-border bg-raised/40 p-1">
          {visible
            .filter((item) => UP_FRONT.includes(item.key))
            .map((item) =>
              tabButton(item, cn("h-11 rounded-md text-ui", current === item.key && "bg-card shadow-edge"))
            )}
          {more.length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-current={inMore ? "page" : undefined}
                className={cn(
                  "flex h-11 items-center justify-center gap-1 rounded-md text-ui font-medium whitespace-nowrap",
                  inMore ? "bg-card text-foreground shadow-edge" : "text-muted-foreground"
                )}
              >
                {inMore ? inMore.title : "Más"}
                <ChevronDown aria-hidden className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-44">
                {more.map((item) => (
                  <DropdownMenuItem
                    key={item.key}
                    aria-current={current === item.key ? "page" : undefined}
                    className="min-h-11 text-ui"
                    onSelect={() => go(item.key)}
                  >
                    {item.title}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </nav>

      {tab === "hoy" ? (
        <HoyTab
          base={base}
          days={days}
          event={data}
          eventbrite={
            data.registration === "eventbrite" ? (
              <EventbriteStatus
                communityId={community.id}
                communitySlug={community.slug}
                draft={false}
                eventId={eventId}
              />
            ) : null
          }
          input={input}
          stats={stats}
          onGo={go}
        />
      ) : null}
      {tab === "puerta" ? (
        <div className="flex flex-col gap-3">
          <Button className="self-start" size="sm" variant="ghost" onClick={() => go("hoy")}>
            <ArrowLeft />
            Volver a Hoy
          </Button>
          <DoorTab
            base={base}
            input={input}
            linked={stats.data?.doorLink ?? false}
            registration={data.registration}
            startDate={data.startDate}
          />
        </div>
      ) : null}
      {tab === "personas" ? <PeopleTab event={data} input={input} /> : null}
      {tab === "mensajes" ? <EmailsTab event={data} input={input} stats={stats.data} /> : null}
      {tab === "difusion" ? <PublicationsTab community={community} event={data} input={input} /> : null}
      {tab === "despues" ? <DespuesTab event={data} input={input} /> : null}
      {tab === "ajustes" ? (
        <SettingsTab canCancel={can("event:cancel")} event={data} input={input} stats={stats.data} />
      ) : null}

      {!can("attendee:read") ? (
        <p className="mt-6 text-meta text-muted-foreground">
          Los nombres y mails de quienes se anotan los ven solo las personas admin de la comunidad.
        </p>
      ) : null}
    </PageContainer>
  );
}
