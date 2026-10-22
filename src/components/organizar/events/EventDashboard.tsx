"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  FilePen,
  Link2Off,
  Mail,
  QrCode as QrIcon,
  Search,
  Send,
  Ticket,
  Users,
  X,
} from "lucide-react";

import { downloadCsv } from "components/Admin/attendees/helpers";
import { QrCode } from "components/Admin/comms/QrCode";
import { SurveyTab } from "components/Admin/comms/SurveyTab";
import { ConfirmDialog } from "components/Admin/panel";
import { MicroLabel, Meter, PageContainer, PageHeader, Panel, PanelHead } from "components/Admin/ui/page";
import { EmptyState, ErrorState } from "components/Admin/ui/states";
import { RelativeTime } from "components/Admin/ui/time";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Input } from "components/shared/ui/input";
import { Skeleton } from "components/shared/ui/skeleton";
import { Textarea } from "components/shared/ui/textarea";
import { toast } from "components/shared/ui/toast-utils";
import { cn } from "app/lib/utils";
import { daysBetween } from "lib/calendar/holidays";
import { dayKey, shortWhen } from "lib/community/time";
import { NOT_ATTENDING_LABEL, type Presence } from "lib/orpc/attendees/schemas";
import { orpc } from "lib/orpc/client";
import { ROLE_RANK } from "lib/roles";

import type { CalendarCommunity } from "../calendar/CalendarClient";
import { EventbriteStatus } from "../integrations/EventbriteStatus";
import { usePanel } from "../shell/context";

const TABS = [
  { key: "resumen", title: "Resumen", admin: false },
  { key: "inscriptos", title: "Inscriptos", admin: true },
  { key: "puerta", title: "Puerta", admin: true },
  { key: "mensajes", title: "Mensajes", admin: true },
  { key: "encuesta", title: "Encuesta", admin: false },
] as const;
type Tab = (typeof TABS)[number]["key"];

/** A published event, run from the panel: who's coming, the door, writing to people, the survey. */
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
  const { current } = usePanel();
  const isAdmin = current ? ROLE_RANK[current.role] >= ROLE_RANK.admin : false;
  const input = { communityId: community.id, eventId };
  const event = useQuery(orpc.events.get.queryOptions({ input }));
  const stats = useQuery(orpc.events.stats.queryOptions({ input }));
  const requested = params.get("tab");
  const visible = TABS.filter((tab) => isAdmin || !tab.admin);
  const tab: Tab = visible.some((item) => item.key === requested) ? (requested as Tab) : "resumen";
  const go = (key: Tab) => {
    const next = new URLSearchParams(params.toString());
    next.set("tab", key);
    window.history.replaceState(null, "", `${pathname}?${next.toString()}`);
  };

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

  return (
    <PageContainer size="large">
      <PageHeader
        actions={
          <div className="flex gap-1.5">
            <Button asChild variant="outline">
              <Link href={`/organizar/panel/${community.slug}/eventos/${eventId}/editar`}>
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
        <Summary
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
          isAdmin={isAdmin}
          registration={data.registration}
          stats={stats}
          onGo={go}
        />
      ) : null}
      {tab === "inscriptos" ? <People eventId={eventId} input={input} /> : null}
      {tab === "puerta" ? (
        <Door checkedIn={stats.data?.checkedIn ?? 0} attending={stats.data?.attending ?? 0} input={input} />
      ) : null}
      {tab === "mensajes" ? <Messages input={input} stats={stats.data} /> : null}
      {tab === "encuesta" ? (
        <Survey communitySlug={data.communitySlug} eventId={eventId} eventSlug={data.slug} />
      ) : null}

      {!isAdmin ? (
        <p className="mt-6 text-meta text-muted-foreground">
          Los nombres y mails de quienes se anotan los ven solo las personas admin de la comunidad.
        </p>
      ) : null}
    </PageContainer>
  );
}

function Stat({
  label,
  value,
  of,
  tone,
}: {
  label: string;
  value: number;
  of?: number | null;
  tone?: "primary" | "info" | "success" | "warning";
}) {
  return (
    <Panel className="flex flex-col gap-2 p-4">
      <MicroLabel>{label}</MicroLabel>
      <p className="font-terminal text-[28px] leading-8 font-semibold text-foreground tabular-nums">
        {value}
        {of ? <span className="text-[16px] text-muted-foreground">/{of}</span> : null}
      </p>
      {of ? <Meter label={label} max={of} tone={tone} value={value} /> : null}
    </Panel>
  );
}

function Summary({
  stats,
  registration,
  eventbrite,
  isAdmin,
  onGo,
}: {
  stats: ReturnType<
    typeof useQuery<{
      capacity: number | null;
      taken: number;
      attending: number;
      waiting: number;
      pending: number;
      cancelled: number;
      checkedIn: number;
    }>
  >;
  registration: "none" | "owu" | "external" | "eventbrite";
  /** How its publication on Eventbrite is going, when people sign up there */
  eventbrite: React.ReactNode;
  isAdmin: boolean;
  onGo: (tab: Tab) => void;
}) {
  if (registration !== "owu" && registration !== "eventbrite") {
    return (
      <Panel>
        <EmptyState
          compact
          description={
            registration === "none"
              ? "Es de entrada libre: no hay inscripción que seguir."
              : "La inscripción es en otro sitio."
          }
          icon={Ticket}
          title="Sin inscripción en OWU"
        />
      </Panel>
    );
  }
  if (!stats.data) return <Skeleton className="h-28 rounded-lg" />;
  const data = stats.data;

  return (
    <div className="flex flex-col gap-4">
      {eventbrite}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Lugares ocupados" of={data.capacity} tone="primary" value={data.taken} />
        {registration === "owu" ? (
          <>
            <Stat label="En espera" value={data.waiting} />
            <Stat label="Por aprobar" value={data.pending} />
          </>
        ) : null}
        <Stat label="Acreditados" of={data.attending || null} tone="success" value={data.checkedIn} />
      </div>
      {data.pending > 0 && isAdmin ? (
        <Panel className="flex items-center gap-3 p-3.5">
          <Users aria-hidden className="size-4 text-warning" />
          <p className="flex-1 text-ui text-foreground">
            {data.pending === 1 ? "Una persona espera" : `${data.pending} personas esperan`} que la apruebes.
          </p>
          <Button size="sm" variant="outline" onClick={() => onGo("inscriptos")}>
            Revisar
          </Button>
        </Panel>
      ) : null}
    </div>
  );
}

const PEOPLE_TABS: { key: Presence; title: string }[] = [
  { key: "all", title: "Todos" },
  { key: "out", title: "Anotados" },
  { key: "waiting", title: "En espera" },
  { key: "pending", title: "Por aprobar" },
  { key: "in", title: "Acreditados" },
  { key: "cancelled", title: "Bajas" },
];

function People({ eventId, input }: { eventId: string; input: { communityId: string; eventId: string } }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Presence>("all");
  const [q, setQ] = useState("");
  const list = useQuery(
    orpc.attendees.list.queryOptions({ input: { eventId, status, q, pageSize: 200, sort: "-registered" } })
  );
  const review = useMutation(
    orpc.rsvps.review.mutationOptions({
      onSuccess: (result) => {
        toast.success(result.status === "declined" ? "No aprobado" : "Aprobado", "Le avisamos por mail.");
        void queryClient.invalidateQueries({ queryKey: orpc.attendees.list.key() });
        void queryClient.invalidateQueries({ queryKey: orpc.events.stats.key() });
      },
      onError: (error) => toast.error("No se pudo", error.message),
    })
  );
  const exportCsv = useMutation(
    orpc.attendees.export.mutationOptions({
      onSuccess: downloadCsv,
      onError: (error) => toast.error("No se pudo exportar", error.message),
    })
  );
  const totals = list.data?.totals;

  return (
    <Panel>
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <div className="flex [scrollbar-width:none] gap-1 overflow-x-auto">
          {PEOPLE_TABS.map((item) => (
            <Button
              key={item.key}
              aria-pressed={status === item.key}
              className={cn(status === item.key && "bg-raised text-foreground")}
              size="sm"
              variant="ghost"
              onClick={() => setStatus(item.key)}
            >
              {item.title}
              <span className="font-terminal text-2xs text-muted-foreground tabular-nums">
                {totals ? totals[item.key] : "–"}
              </span>
            </Button>
          ))}
        </div>
        <label className="relative ml-auto w-full sm:w-56">
          <span className="sr-only">Buscar</span>
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            className="pl-8"
            placeholder="Nombre o email"
            value={q}
            onChange={(change) => setQ(change.target.value)}
          />
        </label>
        <Button
          disabled={exportCsv.isPending}
          size="sm"
          variant="outline"
          onClick={() => exportCsv.mutate({ eventId, status, q })}
        >
          <Download />
          CSV
        </Button>
      </div>
      {list.isError ? (
        <ErrorState onRetry={() => void list.refetch()} title="No pudimos traer la lista" />
      ) : !list.data ? (
        <Skeleton className="m-3 h-32" />
      ) : list.data.rows.length === 0 ? (
        <EmptyState compact icon={Users} title={q ? "Nadie coincide" : "Nadie acá todavía"} />
      ) : (
        <ul className="divide-y divide-border">
          {list.data.rows.map((person) => (
            <li key={person.id} className="flex flex-wrap items-center gap-3 px-3.5 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-ui font-medium text-foreground">
                  {person.name}
                  {person.ticketClass === "En la puerta" ? (
                    <span className="text-muted-foreground"> · en la puerta</span>
                  ) : null}
                </p>
                <p className="truncate text-meta text-muted-foreground">
                  {person.email || "sin email"}
                  {person.registeredAt ? (
                    <>
                      {" · "}
                      <RelativeTime className="text-meta" date={person.registeredAt} />
                    </>
                  ) : null}
                </p>
              </div>
              {person.checkedInAt ? (
                <Badge variant="success">
                  <Check aria-hidden />
                  Acreditado
                </Badge>
              ) : person.status === "attending" ? (
                <Badge variant="secondary">Anotado</Badge>
              ) : (
                <Badge variant={person.status === "pending" ? "warning" : "outline"}>
                  {NOT_ATTENDING_LABEL[person.status]}
                </Badge>
              )}
              {person.status === "pending" ? (
                <div className="flex gap-1">
                  <Button
                    disabled={review.isPending}
                    size="xs"
                    variant="outline"
                    onClick={() => review.mutate({ ...input, attendeeId: person.id, decision: "decline" })}
                  >
                    <X />
                    No
                  </Button>
                  <Button
                    disabled={review.isPending}
                    size="xs"
                    onClick={() => review.mutate({ ...input, attendeeId: person.id, decision: "approve" })}
                  >
                    <Check />
                    Aprobar
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function Door({
  input,
  checkedIn,
  attending,
}: {
  input: { communityId: string; eventId: string };
  checkedIn: number;
  attending: number;
}) {
  const [revoking, setRevoking] = useState(false);
  const link = useMutation(
    orpc.events.doorLink.mutationOptions({ onError: (error) => toast.error("No se pudo", error.message) })
  );
  const revoke = useMutation(
    orpc.events.revokeDoor.mutationOptions({
      onSuccess: () => {
        link.reset();
        setRevoking(false);
        toast.success("Links anulados", "Los que repartiste ya no abren la puerta.");
      },
      onError: (error) => toast.error("No se pudo anular", error.message),
    })
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Panel>
        <PanelHead icon={QrIcon} title="Link para quienes ayudan en la puerta" />
        <div className="flex flex-col gap-4 p-4">
          <p className="text-ui text-muted-foreground">
            Abre el escáner sin cuenta: escanean los QR, buscan por nombre y suman a quien llega sin anotarse. Vale
            hasta la noche del evento y lo podés anular cuando quieras.
          </p>
          {link.data ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
              <div className="rounded-lg bg-white p-2">
                <QrCode size={140} title="Link de la puerta" value={link.data.url} />
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <p className="truncate rounded-md border border-border bg-raised/50 px-2.5 py-1.5 font-terminal text-meta text-foreground">
                  {link.data.url}
                </p>
                <p className="text-meta text-muted-foreground">
                  Vale hasta el <span className="font-terminal tabular-nums">{shortWhen(link.data.expiresAt)}</span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      void navigator.clipboard.writeText(link.data?.url ?? "").then(() => toast.success("Link copiado"))
                    }
                  >
                    <Copy />
                    Copiar
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <a href={link.data.url} rel="noreferrer" target="_blank">
                      <ExternalLink />
                      Abrir
                    </a>
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setRevoking(true)}>
                    <Link2Off />
                    Anular
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <Button className="self-start" disabled={link.isPending} onClick={() => link.mutate(input)}>
              <QrIcon />
              Crear el link
            </Button>
          )}
        </div>
      </Panel>
      <Panel className="flex flex-col gap-2 p-4">
        <MicroLabel>En la puerta</MicroLabel>
        <p className="font-terminal text-[28px] leading-8 font-semibold text-foreground tabular-nums">
          {checkedIn}
          <span className="text-[16px] text-muted-foreground">/{attending || checkedIn}</span>
        </p>
        <Meter label="Acreditados" max={attending || checkedIn || 1} tone="success" value={checkedIn} />
      </Panel>
      <ConfirmDialog
        confirmLabel="Anular los links"
        description="Los links que repartiste dejan de abrir la puerta. Después podés crear uno nuevo."
        open={revoking}
        pending={revoke.isPending}
        pendingLabel="Anulando…"
        title="¿Anular los links de la puerta?"
        onConfirm={() => revoke.mutate(input)}
        onOpenChange={setRevoking}
      />
    </div>
  );
}

const AUDIENCES = [
  { key: "attending", title: "Anotados" },
  { key: "waiting", title: "En espera" },
  { key: "pending", title: "Por aprobar" },
] as const;

function Messages({
  input,
  stats,
}: {
  input: { communityId: string; eventId: string };
  stats: { attending: number; waiting: number; pending: number } | undefined;
}) {
  const [to, setTo] = useState<("attending" | "waiting" | "pending")[]>(["attending"]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [confirming, setConfirming] = useState(false);
  const count = to.reduce((sum, key) => sum + (stats?.[key] ?? 0), 0);
  const send = useMutation(
    orpc.events.message.mutationOptions({
      onSuccess: (result) => {
        toast.success(`Mandado a ${result.sent} ${result.sent === 1 ? "persona" : "personas"}`);
        setConfirming(false);
        setSubject("");
        setBody("");
      },
      onError: (error) => {
        setConfirming(false);
        toast.error("No se pudo mandar", error.message);
      },
    })
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <Panel>
        <PanelHead icon={Mail} title="Escribir a la gente" />
        <form
          className="flex flex-col gap-4 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            setConfirming(true);
          }}
        >
          <fieldset className="flex flex-wrap gap-1.5">
            <legend className="mb-2">
              <MicroLabel>A quiénes</MicroLabel>
            </legend>
            {AUDIENCES.map((audience) => {
              const on = to.includes(audience.key);

              return (
                <button
                  key={audience.key}
                  aria-pressed={on}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-meta transition-colors",
                    on ? "border-primary/60 bg-primary-surface text-foreground" : "border-input text-muted-foreground"
                  )}
                  type="button"
                  onClick={() => setTo(on ? to.filter((key) => key !== audience.key) : [...to, audience.key])}
                >
                  {audience.title}
                  <span className="font-terminal tabular-nums">{stats?.[audience.key] ?? "–"}</span>
                </button>
              );
            })}
          </fieldset>
          <label className="flex flex-col gap-1.5">
            <MicroLabel>Asunto</MicroLabel>
            <Input
              maxLength={120}
              minLength={3}
              required
              value={subject}
              onChange={(change) => setSubject(change.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="flex items-baseline justify-between">
              <MicroLabel>Mensaje</MicroLabel>
              <span className="font-terminal text-2xs text-muted-foreground tabular-nums">{body.length}/5000</span>
            </span>
            <Textarea
              maxLength={5000}
              minLength={10}
              required
              rows={7}
              value={body}
              onChange={(change) => setBody(change.target.value)}
            />
          </label>
          <Button className="self-end" disabled={to.length === 0 || count === 0} type="submit">
            <Send />
            Mandar a {count} {count === 1 ? "persona" : "personas"}
          </Button>
        </form>
      </Panel>
      <Panel>
        <PanelHead title="Lo que mandamos solos" />
        <ol className="flex flex-col gap-3 p-4 text-ui">
          {[
            ["Al anotarse", "Confirmación con la invitación del calendario y el QR"],
            ["48 h antes", "¿Seguís yendo? Con «No puedo ir» para liberar el lugar"],
            ["2 h antes", "Cómo llegar y la entrada"],
            ["Si cambia la fecha o el lugar", "El aviso y la invitación actualizada"],
            ["Al día siguiente", "La encuesta, si está abierta"],
          ].map(([when, what]) => (
            <li key={when} className="flex flex-col">
              <span className="font-terminal text-meta text-muted-foreground">{when}</span>
              <span className="text-foreground">{what}</span>
            </li>
          ))}
        </ol>
      </Panel>
      <ConfirmDialog
        confirmLabel={`Mandar a ${count}`}
        description="Le llega un mail a cada una. No se puede deshacer."
        open={confirming}
        pending={send.isPending}
        pendingLabel="Mandando…"
        title={`¿Mandar «${subject}»?`}
        onConfirm={() => send.mutate({ ...input, to, subject, body })}
        onOpenChange={setConfirming}
      />
    </div>
  );
}

function Survey({ eventId, eventSlug, communitySlug }: { eventId: string; eventSlug: string; communitySlug: string }) {
  const survey = useQuery(orpc.surveys.get.queryOptions({ input: { eventId }, staleTime: 30_000 }));

  return (
    <SurveyTab
      communitySlug={communitySlug}
      eventId={eventId}
      eventSlug={eventSlug}
      survey={survey}
      surveyUrl={
        typeof window === "undefined"
          ? undefined
          : `${window.location.origin}/comunidad/${communitySlug}/events/${eventSlug}/encuesta`
      }
    />
  );
}
