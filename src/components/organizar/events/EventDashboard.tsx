"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, FilePen } from "lucide-react";

import { PageContainer, PageHeader } from "components/Admin/ui/page";
import { ErrorState } from "components/Admin/ui/states";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
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
import { DoorTab } from "./DoorTab";
import { EmailsTab } from "./EmailsTab";
import { FeedbackTab } from "./FeedbackTab";
import { PeopleTab } from "./PeopleTab";
import { PublicationsTab } from "./PublicationsTab";
import { SettingsTab } from "./SettingsTab";
import { SummaryTab } from "./SummaryTab";

/** The dashboard's tabs; `requires` hides one from whoever holds none of those permissions. */
const TABS = [
  { key: "resumen", title: "Resumen" },
  // The whole list (attendee:read), or just who waits for approval (rsvp:review, editors)
  { key: "inscriptos", title: "Inscriptos", requires: ["attendee:read", "rsvp:review"] },
  { key: "puerta", title: "Puerta", requires: ["event:door-link"] },
  { key: "emails", title: "Emails", requires: ["event:message"] },
  { key: "publicaciones", title: "Publicaciones" },
  { key: "feedback", title: "Feedback" },
  { key: "ajustes", title: "Ajustes" },
] as const satisfies readonly { key: string; title: string; requires?: readonly CommunityPermission[] }[];
export type Tab = (typeof TABS)[number]["key"];
/** Tabs that changed name: their old links still land */
const RENAMED: Record<string, Tab> = { mensajes: "emails", encuesta: "feedback" };

/**
 * A published event, run from the panel: how it's going, who's coming, the door, emails, where
 * it's published, feedback and its settings. Names and emails are for the community's admins.
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
  const tab: Tab = visible.find((item) => item.key === requested)?.key ?? "resumen";
  const go = (key: Tab) => {
    const next = new URLSearchParams(params.toString());
    next.set("tab", key);
    window.history.replaceState(null, "", `${pathname}?${next.toString()}`);
  };

  // Check-ins, sign-ups and seat changes ping the event's ops channel: read the counts again
  useRealtimeChannel(eventChannel(eventId, "ops"), (topic) => {
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

      <nav
        aria-label="Secciones del evento"
        className="mb-5 flex [scrollbar-width:none] gap-5 overflow-x-auto border-b border-border"
      >
        {visible.map((item) => (
          <button
            key={item.key}
            aria-current={tab === item.key ? "page" : undefined}
            className={cn(
              "relative h-9 shrink-0 text-ui font-medium whitespace-nowrap transition-colors after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-full",
              tab === item.key ? "text-foreground after:bg-primary" : "text-muted-foreground hover:text-foreground"
            )}
            type="button"
            onClick={() => go(item.key)}
          >
            {item.title}
          </button>
        ))}
      </nav>

      {tab === "resumen" ? (
        <SummaryTab
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
          stats={stats}
          onGo={go}
        />
      ) : null}
      {tab === "inscriptos" ? <PeopleTab event={data} input={input} /> : null}
      {tab === "puerta" ? (
        <DoorTab
          base={base}
          input={input}
          linked={stats.data?.doorLink ?? false}
          registration={data.registration}
          startDate={data.startDate}
        />
      ) : null}
      {tab === "emails" ? <EmailsTab event={data} input={input} stats={stats.data} /> : null}
      {tab === "publicaciones" ? <PublicationsTab base={base} community={community} event={data} /> : null}
      {tab === "feedback" ? <FeedbackTab event={data} input={input} /> : null}
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
