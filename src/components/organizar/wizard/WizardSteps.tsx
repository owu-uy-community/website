"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  CircleAlert,
  CircleCheck,
  Coffee,
  Copy,
  ExternalLink,
  Globe,
  Lightbulb,
  MapPin,
  MessagesSquare,
  Mic,
  Monitor,
  Plus,
  Smartphone,
  Sparkles,
  Ticket,
  Trash2,
  X,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { cn } from "app/lib/utils";
import { SettingsCard, SettingsRow, SettingsSection } from "components/Admin/settings/settings";
import { MicroLabel } from "components/Admin/ui/page";
import { ErrorState } from "components/Admin/ui/states";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Input } from "components/shared/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "components/shared/ui/select";
import { Skeleton } from "components/shared/ui/skeleton";
import { Switch } from "components/shared/ui/switch";
import { Textarea } from "components/shared/ui/textarea";
import { toast } from "components/shared/ui/toast-utils";
import { RichText } from "components/shared/RichText";
import { MessagePreview } from "components/Admin/comms/MessageFields";
import { DateTimeInput } from "components/Admin/settings/event-fields";
import { dayKey, montevideoIso, shortWhen } from "lib/community/time";
import { TOPICS } from "lib/community/topics";
import { orpc } from "lib/orpc/client";
import { SIZE_BUCKETS, type EditableEvent } from "lib/orpc/events/schemas";
import { AMENITIES, AMENITY_LABEL, type Amenity } from "lib/orpc/venues/schemas";
import { announcementText } from "lib/organizar/announcement";
import { UNTITLED, type Issue, type StepKey } from "lib/organizar/steps";
import { SIZE_LABEL, SIZE_PEOPLE } from "lib/organizar/venue-fit";
import { factLines } from "lib/organizar/venue-facts";

import type { CalendarCommunity } from "../calendar/CalendarClient";
import { EventbriteStatus } from "../integrations/EventbriteStatus";
import { RequestComposer, RequestList, VenueCard } from "../venues/VenuesClient";
import { DatePicker } from "./DatePicker";
import { QuestionPresets, useCapacityHint, VolunteerRoles } from "./SignupExtras";
import { FEEDBACK_TIMING, RSVP_CLOSE_HINT } from "lib/organizar/rules";
import { suggestedCloseAt } from "lib/organizar/rsvp-state";

/** A change to the draft; `schedule` (a published event's new date) is sent at once, not kept. */
export type DraftChange = Partial<EditableEvent> & {
  schedule?: { day: string; startTime: string; durationMin: number };
  /** The co-organizing communities, saved right away (the server says which joined and which are invited) */
  cohostIds?: string[];
};

export type StepProps = {
  draft: EditableEvent;
  set: (change: DraftChange) => void;
  errors: Partial<Record<keyof EditableEvent, string>>;
  community: CalendarCommunity;
  today: string;
  /** Read the event again (a hold, a venue answer) */
  refresh: () => void;
};

const FORMAT: { value: NonNullable<EditableEvent["format"]>; title: string; hint: string; icon: LucideIcon }[] = [
  { value: "charlas", title: "Charlas", hint: "Una o más charlas, con preguntas", icon: Mic },
  { value: "taller", title: "Taller", hint: "Manos a la obra, con compu", icon: Wrench },
  { value: "open-space", title: "Open space", hint: "La agenda la arma la gente", icon: MessagesSquare },
  { value: "social", title: "Social", hint: "Juntarse a charlar, after", icon: Coffee },
  { value: "hackathon", title: "Hackathon", hint: "Equipos y un desafío", icon: Lightbulb },
  { value: "otro", title: "Otro", hint: "Algo distinto", icon: Sparkles },
];

function ChoiceCards<T extends string>({
  name,
  value,
  options,
  onChange,
}: {
  name: string;
  value: T | null;
  options: { value: T; title: string; hint: string; icon: LucideIcon; badge?: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div
      className={cn("grid gap-2 sm:grid-cols-2", options.length % 3 === 0 && "lg:grid-cols-3")}
      role="radiogroup"
      aria-label={name}
    >
      {options.map((option) => (
        <button
          key={option.value}
          aria-checked={value === option.value}
          className={cn(
            "flex items-start gap-3 rounded-lg border border-input bg-raised/50 p-3 text-left transition-colors hover:border-subtle/40",
            value === option.value && "border-primary/60 bg-primary-surface"
          )}
          role="radio"
          type="button"
          onClick={() => onChange(option.value)}
        >
          <option.icon
            aria-hidden
            className={cn("mt-0.5 size-4 shrink-0", value === option.value ? "text-primary" : "text-muted-foreground")}
          />
          <span className="min-w-0">
            <span className="flex items-center gap-1.5 text-ui font-medium text-foreground">
              {option.title}
              {option.badge ? <Badge variant="success">{option.badge}</Badge> : null}
            </span>
            <span className="block text-meta text-muted-foreground">{option.hint}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

/** A toggle chip (topics, needs) */
function Chip({
  on,
  disabled,
  onClick,
  children,
}: {
  on: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-pressed={on}
      className={cn(
        "rounded-md border px-2 py-1 text-meta transition-colors disabled:opacity-50",
        on
          ? "border-primary/60 bg-primary-surface text-foreground"
          : "border-input text-muted-foreground hover:text-foreground"
      )}
      disabled={disabled}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

const SIZE_HINT: Record<(typeof SIZE_BUCKETS)[number], string> = {
  "hasta-30": "Una sala chica alcanza",
  "30-60": "Un meetup de los de siempre",
  "60-120": "Un auditorio o una oficina grande",
  "120+": "Algo grande: hay pocos lugares así",
};
const SIZES = SIZE_BUCKETS.map((value) => ({ value, title: SIZE_LABEL[value], hint: SIZE_HINT[value], icon: Users }));

export function StepTipo({ draft, set }: StepProps) {
  const toggle = (need: string) =>
    set({ needs: draft.needs.includes(need) ? draft.needs.filter((item) => item !== need) : [...draft.needs, need] });

  return (
    <>
      <SettingsSection id="tipo" title="¿Qué tipo de evento es?">
        <ChoiceCards name="Formato" options={FORMAT} value={draft.format} onChange={(format) => set({ format })} />
      </SettingsSection>
      <SettingsSection id="tamano" title="¿Cuánta gente esperás?">
        <ChoiceCards
          name="Cuánta gente"
          options={SIZES}
          value={draft.sizeBucket}
          onChange={(sizeBucket) => set({ sizeBucket })}
        />
      </SettingsSection>
      <SettingsSection id="necesidades" title="¿Qué necesita el lugar?">
        <SettingsCard>
          <SettingsRow hint="Los espacios que lo tienen aparecen primero. Podés saltear este paso." label="Necesidades">
            <div className="flex flex-wrap gap-1.5">
              {AMENITIES.map((amenity) => (
                <Chip key={amenity} on={draft.needs.includes(amenity)} onClick={() => toggle(amenity)}>
                  {AMENITY_LABEL[amenity]}
                </Chip>
              ))}
            </div>
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>
    </>
  );
}

export function StepDatos({ draft, set, errors, community }: StepProps) {
  const [preview, setPreview] = useState(false);
  const others = useQuery({
    ...orpc.communities.list.queryOptions({ input: {} }),
    staleTime: 5 * 60_000,
    select: (all) => all.filter((item) => item.id !== community.id && item.listed),
  });
  const chosen = draft.cohosts.map((cohost) => cohost.id);
  const addable = (others.data ?? []).filter((item) => !chosen.includes(item.id));

  return (
    <SettingsSection id="datos" title="Lo que ve la gente">
      <SettingsCard>
        <SettingsRow
          error={errors.name}
          hint="Corto y concreto: va en el título y en el link."
          htmlFor="event-name"
          label="Nombre"
        >
          <Input
            id="event-name"
            maxLength={120}
            placeholder="Python Montevideo: cierre del año"
            value={draft.name === UNTITLED ? "" : draft.name}
            onChange={(event) => set({ name: event.target.value || UNTITLED })}
          />
        </SettingsRow>
        <SettingsRow
          error={errors.summary}
          hint={
            <>
              Una línea para la tarjeta, la imagen para compartir y Meetup.{" "}
              <span className="font-terminal tabular-nums">{draft.summary?.length ?? 0}/140</span>
            </>
          }
          htmlFor="event-summary"
          label="Resumen"
        >
          <Input
            id="event-summary"
            maxLength={140}
            placeholder="Tres charlas cortas sobre Python en producción, y pizza"
            value={draft.summary ?? ""}
            onChange={(event) => set({ summary: event.target.value || null })}
          />
        </SettingsRow>
        <SettingsRow
          error={errors.description}
          hint={
            <>
              Agenda, charlas, a quién está dirigido. Admite Markdown.{" "}
              <button className="underline underline-offset-2" type="button" onClick={() => setPreview(!preview)}>
                {preview ? "Editar" : "Ver cómo queda"}
              </button>
            </>
          }
          htmlFor="event-description"
          label="Descripción"
        >
          {preview ? (
            <div className="prose-sm max-h-80 overflow-y-auto rounded-md border border-border bg-raised/40 p-3 text-ui text-foreground [&_a]:underline [&_li]:ml-4 [&_ul]:list-disc">
              <RichText content={draft.description ?? ""} />
            </div>
          ) : (
            <Textarea
              id="event-description"
              maxLength={10_000}
              placeholder={"## Agenda\n- 19:00 Bienvenida\n- 19:15 Primera charla"}
              rows={8}
              value={draft.description ?? ""}
              onChange={(event) => set({ description: event.target.value || null })}
            />
          )}
        </SettingsRow>
        <SettingsRow error={errors.talks} hint="Título y quién la da: salen en la página del evento." label="Charlas">
          <div className="flex flex-col gap-2">
            {draft.talks.map((talk, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  aria-label={`Charla ${index + 1}`}
                  maxLength={160}
                  placeholder="Título de la charla"
                  value={talk.title}
                  onChange={(event) =>
                    set({
                      talks: draft.talks.map((item, at) =>
                        at === index ? { ...item, title: event.target.value } : item
                      ),
                    })
                  }
                />
                <Input
                  aria-label={`Quién da la charla ${index + 1}`}
                  className="w-44 shrink-0"
                  maxLength={120}
                  placeholder="Quién la da"
                  value={talk.speaker}
                  onChange={(event) =>
                    set({
                      talks: draft.talks.map((item, at) =>
                        at === index ? { ...item, speaker: event.target.value } : item
                      ),
                    })
                  }
                />
                <Button
                  aria-label={`Quitar la charla ${index + 1}`}
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => set({ talks: draft.talks.filter((_, at) => at !== index) })}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
            {draft.talks.length < 12 ? (
              <Button
                className="self-start"
                size="xs"
                variant="outline"
                onClick={() => set({ talks: [...draft.talks, { title: "", speaker: "" }] })}
              >
                <Plus />
                Charla
              </Button>
            ) : null}
          </div>
        </SettingsRow>
        <SettingsRow hint="Hasta 5. El calendario los usa para saber con quién chocás." label="Temas">
          <div className="flex flex-wrap gap-1.5">
            {TOPICS.map((topic) => {
              const on = draft.topics.includes(topic.value);

              return (
                <Chip
                  key={topic.value}
                  disabled={!on && draft.topics.length >= 5}
                  on={on}
                  onClick={() =>
                    set({
                      topics: on
                        ? draft.topics.filter((value) => value !== topic.value)
                        : [...draft.topics, topic.value],
                    })
                  }
                >
                  {topic.label}
                </Chip>
              );
            })}
          </div>
        </SettingsRow>
        <SettingsRow
          hint="Otras comunidades que lo arman con ustedes. Si no la organizás vos, le llega una invitación cuando lo publiques y aparece en su perfil si acepta."
          label="Coorganizan"
        >
          <div className="flex flex-col items-start gap-2">
            {draft.cohosts.length > 0 ? (
              <ul className="flex flex-wrap gap-1.5">
                {draft.cohosts.map((cohost) => (
                  <li
                    key={cohost.id}
                    className="flex h-7 items-center gap-1.5 rounded-md border border-input pr-1 pl-2 text-meta text-foreground"
                  >
                    {cohost.name}
                    {cohost.status === "invited" ? <Badge variant="warning">Invitada</Badge> : null}
                    {cohost.status === "declined" ? <Badge variant="secondary">Dijo que no</Badge> : null}
                    <button
                      aria-label={`Sacar a ${cohost.name}`}
                      className="grid size-5 place-items-center rounded-sm text-muted-foreground hover:bg-raised hover:text-foreground"
                      type="button"
                      onClick={() =>
                        set({
                          cohostIds: chosen.filter((id) => id !== cohost.id),
                          cohosts: draft.cohosts.filter((item) => item.id !== cohost.id),
                        })
                      }
                    >
                      <X aria-hidden className="size-3" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <Select
              disabled={chosen.length >= 3 || addable.length === 0}
              value=""
              onValueChange={(id) => {
                const picked = addable.find((item) => item.id === id);
                // Shown at once (the server then says who joined and who's invited), so a second
                // pick right after builds on this one
                set({
                  cohostIds: [...chosen, id],
                  cohosts: picked
                    ? [...draft.cohosts, { id, name: picked.name, slug: picked.slug, status: "invited" }]
                    : draft.cohosts,
                });
              }}
            >
              <SelectTrigger aria-label="Sumar una comunidad" className="w-56">
                <SelectValue placeholder={chosen.length >= 3 ? "Hasta 3 comunidades" : "Sumar una comunidad"} />
              </SelectTrigger>
              <SelectContent>
                {addable.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </SettingsRow>
      </SettingsCard>
    </SettingsSection>
  );
}

export function StepFecha({ draft, set, community, today, refresh }: StepProps) {
  return (
    <SettingsSection id="fecha" title={draft.status === "published" ? "Fecha del evento" : "Elegí la fecha"}>
      <SettingsCard className="py-4">
        <DatePicker
          communityId={community.id}
          event={draft}
          today={today}
          onHeld={refresh}
          onSchedule={(schedule) => set({ schedule })}
        />
      </SettingsCard>
    </SettingsSection>
  );
}

const MODES: { value: EditableEvent["mode"]; title: string; hint: string; icon: LucideIcon }[] = [
  { value: "presencial", title: "Presencial", hint: "En un lugar", icon: MapPin },
  { value: "online", title: "Online", hint: "Por streaming o videollamada", icon: Monitor },
  { value: "hibrido", title: "Híbrido", hint: "En un lugar y transmitido", icon: Globe },
];

export function StepLugar({ draft, set, errors, community, today, refresh }: StepProps) {
  const queryClient = useQueryClient();
  const inPerson = draft.mode !== "online";
  const want = {
    communityId: community.id,
    size: draft.sizeBucket,
    needs: draft.needs.filter((need): need is Amenity => (AMENITIES as readonly string[]).includes(need)),
    day: draft.dateChosen ? dayKey(draft.startDate) : null,
  };
  const venues = useQuery({
    ...orpc.venues.list.queryOptions({ input: want }),
    enabled: inPerson && !draft.venue,
  });
  const requests = useQuery({
    ...orpc.venues.requests.queryOptions({ input: { communityId: community.id } }),
    enabled: inPerson,
  });
  const [asking, setAsking] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const mine = (requests.data ?? []).filter((request) => request.eventId === draft.id);
  const open = mine.find((request) => request.status === "pending" || request.status === "proposed");
  const pending = new Set(
    (requests.data ?? []).filter((request) => request.status === "pending").map((request) => request.venue.id)
  );
  const ranked = venues.data ?? [];
  const shown = all ? ranked : ranked.slice(0, 4);
  const facts = draft.venue ? factLines(draft.venue.facts) : [];

  return (
    <SettingsSection id="espacio" title="Dónde">
      <ChoiceCards name="Modalidad" options={MODES} value={draft.mode} onChange={(mode) => set({ mode })} />
      {inPerson ? (
        <SettingsCard className="mt-3">
          {draft.venue ? (
            <SettingsRow hint="Aceptó el pedido: la dirección la ven quienes se anoten." label="Espacio">
              <div className="flex flex-col gap-1.5 rounded-md border border-success/40 bg-success-surface px-3 py-2">
                <div className="flex items-center gap-2.5">
                  <Building2 aria-hidden className="size-4 text-success" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-ui font-medium text-foreground">{draft.venue.name}</span>
                    <span className="block truncate text-meta text-muted-foreground">
                      {draft.venue.neighbourhood} · {draft.venue.address}
                    </span>
                  </span>
                </div>
                {facts.length > 0 ? (
                  <ul aria-label="Cómo es el espacio" className="pl-6.5 text-meta text-muted-foreground">
                    {facts.map((fact) => (
                      <li key={fact}>{fact}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </SettingsRow>
          ) : (
            <>
              {requests.isError ? (
                <ErrorState
                  className="m-3"
                  compact
                  title="No pudimos traer tus pedidos"
                  onRetry={() => void requests.refetch()}
                />
              ) : mine.length > 0 ? (
                <RequestList
                  className="m-3"
                  communityId={community.id}
                  requests={mine}
                  title="Pedidos para este evento"
                  onChanged={refresh}
                />
              ) : null}
              {open ? null : (
                <div className="flex flex-col gap-2 border-b border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <MicroLabel>
                      {draft.sizeBucket || draft.needs.length > 0 || draft.dateChosen
                        ? "Los que mejor encajan con tu evento"
                        : "Espacios"}
                    </MicroLabel>
                    {ranked.some((venue) => venue.requestable) ? (
                      <Button size="sm" variant="outline" onClick={() => setAsking("broadcast")}>
                        Pedir a varios a la vez
                      </Button>
                    ) : null}
                  </div>
                  {venues.isError ? (
                    <ErrorState compact title="No pudimos traer los espacios" onRetry={() => void venues.refetch()} />
                  ) : venues.isPending ? (
                    <Skeleton className="h-28 rounded-lg" />
                  ) : ranked.length === 0 ? (
                    <p className="text-meta text-muted-foreground">Todavía no hay espacios cargados.</p>
                  ) : (
                    <ul className="grid gap-2">
                      {shown.map((venue) => (
                        <VenueCard
                          key={venue.id}
                          pending={pending.has(venue.id)}
                          venue={venue}
                          onAsk={() => setAsking(venue.id)}
                        />
                      ))}
                    </ul>
                  )}
                  {ranked.length > shown.length || all ? (
                    <Button className="self-start" size="xs" variant="ghost" onClick={() => setAll(!all)}>
                      {all ? "Ver menos" : `Ver los ${ranked.length} espacios`}
                    </Button>
                  ) : null}
                </div>
              )}
              <SettingsRow
                error={errors.placeName}
                hint="Si ya lo tenés resuelto por tu cuenta."
                htmlFor="place-name"
                label="U otro lugar"
              >
                <div className="flex flex-col gap-2">
                  <Input
                    id="place-name"
                    maxLength={120}
                    placeholder="Facultad de Ingeniería, salón 301"
                    value={draft.placeName ?? ""}
                    onChange={(event) => set({ placeName: event.target.value || null })}
                  />
                  <Input
                    aria-label="Dirección"
                    maxLength={200}
                    placeholder="Dirección"
                    value={draft.placeAddress ?? ""}
                    onChange={(event) => set({ placeAddress: event.target.value || null })}
                  />
                  <Input
                    aria-label="Link al mapa"
                    inputMode="url"
                    placeholder="Link al mapa (opcional)"
                    value={draft.venueMapUrl ?? ""}
                    onChange={(event) => set({ venueMapUrl: event.target.value || null })}
                  />
                  {errors.venueMapUrl ? <p className="text-meta text-live-foreground">{errors.venueMapUrl}</p> : null}
                </div>
              </SettingsRow>
            </>
          )}
        </SettingsCard>
      ) : null}
      {draft.mode !== "presencial" ? (
        <SettingsCard className="mt-3">
          <SettingsRow
            error={errors.onlineUrl}
            hint="Solo lo reciben quienes estén confirmados, nunca la página pública."
            htmlFor="online-url"
            label="Link de la transmisión"
          >
            <Input
              id="online-url"
              inputMode="url"
              placeholder="https://meet.google.com/…"
              value={draft.onlineUrl ?? ""}
              onChange={(event) => set({ onlineUrl: event.target.value || null })}
            />
          </SettingsRow>
        </SettingsCard>
      ) : null}
      <RequestComposer
        community={community}
        needs={want.needs}
        presetAttendees={draft.capacity ?? (draft.sizeBucket ? SIZE_PEOPLE[draft.sizeBucket] : undefined)}
        presetEventId={draft.id}
        target={asking === "broadcast" ? "broadcast" : (ranked.find((venue) => venue.id === asking) ?? null)}
        today={today}
        onClose={() => setAsking(null)}
        onSent={() => {
          setAsking(null);
          void queryClient.invalidateQueries({ queryKey: orpc.venues.key() });
          refresh();
        }}
      />
    </SettingsSection>
  );
}

const REGISTRATIONS: {
  value: EditableEvent["registration"];
  title: string;
  hint: string;
  icon: LucideIcon;
  badge?: string;
}[] = [
  {
    value: "owu",
    title: "Con OWU",
    hint: "Cupo, lista de espera, recordatorios y QR en la puerta",
    icon: Users,
    badge: "Gratis",
  },
  {
    value: "eventbrite",
    title: "En Eventbrite",
    hint: "Con la cuenta de la comunidad: se publica y se actualiza solo",
    icon: Ticket,
  },
  { value: "external", title: "En otro sitio", hint: "Meetup, un formulario, otra página", icon: Globe },
  { value: "none", title: "Sin inscripción", hint: "Entrada libre, sin anotarse", icon: CircleCheck },
];

/** "18:30" on Montevideo's clock, for a time input */
const clockOf = (iso: string) => shortWhen(iso).split(" · ")[1] ?? "19:00";

export function StepInscripcion({ draft, set, errors, community }: StepProps) {
  const showUpHint = useCapacityHint(community.id);
  const closes = draft.rsvpClosesAt;
  const question = (index: number, change: Partial<EditableEvent["questions"][number]>) =>
    set({ questions: draft.questions.map((item, at) => (at === index ? { ...item, ...change } : item)) });
  const add = (label = "") =>
    draft.questions.length < 5 &&
    set({ questions: [...draft.questions, { id: Math.random().toString(36).slice(2, 10), label, required: false }] });

  return (
    <SettingsSection id="inscripcion" title="Cómo se anota la gente">
      <ChoiceCards
        name="Inscripción"
        options={REGISTRATIONS}
        value={draft.registration}
        onChange={(registration) => set({ registration })}
      />
      {draft.registration === "eventbrite" ? (
        <div className="mt-3 flex flex-col gap-3">
          <EventbriteStatus
            communityId={community.id}
            communitySlug={community.slug}
            draft={draft.status === "draft"}
            eventId={draft.id}
          />
          <SettingsCard>
            <SettingsRow
              error={errors.capacity}
              hint="Las entradas gratis que abre Eventbrite. A los eventos gratis falta cerca de un tercio de quienes se anotan."
              htmlFor="capacity"
              label="Cupo"
            >
              <Input
                className="w-28 font-terminal tabular-nums"
                id="capacity"
                inputMode="numeric"
                min={1}
                placeholder="60"
                type="number"
                value={draft.capacity ?? ""}
                onChange={(event) => set({ capacity: event.target.value ? Number(event.target.value) : null })}
              />
            </SettingsRow>
          </SettingsCard>
        </div>
      ) : null}
      {draft.registration === "external" ? (
        <SettingsCard className="mt-3">
          <SettingsRow error={errors.registrationUrl} htmlFor="registration-url" label="Link de inscripción">
            <Input
              id="registration-url"
              inputMode="url"
              placeholder="https://www.eventbrite.com/e/…"
              value={draft.registrationUrl ?? ""}
              onChange={(event) => set({ registrationUrl: event.target.value || null })}
            />
          </SettingsRow>
        </SettingsCard>
      ) : null}
      {draft.registration === "owu" ? (
        <SettingsCard className="mt-3">
          <SettingsRow error={errors.capacity} hint={showUpHint} htmlFor="capacity" label="Cupo">
            <Input
              className="w-28 font-terminal tabular-nums"
              id="capacity"
              inputMode="numeric"
              min={1}
              placeholder="Sin límite"
              type="number"
              value={draft.capacity ?? ""}
              onChange={(event) => set({ capacity: event.target.value ? Number(event.target.value) : null })}
            />
          </SettingsRow>
          <SettingsRow
            compact
            hint="Cuando alguien libera su lugar, se lo ofrecemos al siguiente."
            htmlFor="waitlist"
            label="Lista de espera"
          >
            <Switch checked={draft.waitlist} id="waitlist" onCheckedChange={(waitlist) => set({ waitlist })} />
          </SettingsRow>
          <SettingsRow
            error={errors.rsvpClosesAt}
            hint={
              closes ? "Después de esa hora ya no se anota nadie; quien llegue entra en la puerta." : RSVP_CLOSE_HINT
            }
            htmlFor="rsvp-closes"
            label="Cierre de inscripción"
          >
            {closes ? (
              <div className="flex items-center gap-2">
                <DateTimeInput
                  day={dayKey(closes)}
                  id="rsvp-closes"
                  time={clockOf(closes)}
                  timeLabel="Hora de cierre"
                  onClockChange={(time) =>
                    time && set({ rsvpClosesAt: new Date(montevideoIso(`${dayKey(closes)}T${time}`)).toISOString() })
                  }
                  onDayChange={(day) =>
                    set({ rsvpClosesAt: new Date(montevideoIso(`${day}T${clockOf(closes)}`)).toISOString() })
                  }
                />
                <Button
                  aria-label="Que cierre cuando empieza"
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => set({ rsvpClosesAt: null })}
                >
                  <X />
                </Button>
              </div>
            ) : (
              <Button
                size="xs"
                variant="outline"
                onClick={() => set({ rsvpClosesAt: suggestedCloseAt(draft.startDate) })}
              >
                <Plus />
                Otro horario de cierre
              </Button>
            )}
          </SettingsRow>
          <SettingsRow compact hint="Cada inscripción espera tu OK." htmlFor="approval" label="Aprobar a mano">
            <Switch checked={draft.approval} id="approval" onCheckedChange={(approval) => set({ approval })} />
          </SettingsRow>
          <SettingsRow hint="Acompañantes por persona." label="+1">
            <Select
              value={String(draft.guestsAllowed)}
              onValueChange={(value) => set({ guestsAllowed: Number(value) })}
            >
              <SelectTrigger aria-label="Acompañantes" className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[0, 1, 2, 3].map((count) => (
                  <SelectItem key={count} value={String(count)}>
                    {count === 0 ? "Sin acompañantes" : `Hasta ${count}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingsRow>
          <SettingsRow
            hint="Hasta 5, cortas. «Primera vez» no hace falta: lo sabemos por la asistencia."
            label="Preguntas"
          >
            <div className="flex flex-col gap-2">
              {draft.questions.map((item, index) => (
                <div key={item.id} className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <Input
                      aria-label={`Pregunta ${index + 1}`}
                      maxLength={200}
                      value={item.label}
                      onChange={(event) => question(index, { label: event.target.value })}
                    />
                    <label className="flex shrink-0 items-center gap-1.5 text-meta text-muted-foreground">
                      <Switch
                        aria-label={`Pregunta ${index + 1} obligatoria`}
                        checked={item.required}
                        onCheckedChange={(required) => question(index, { required })}
                      />
                      Obligatoria
                    </label>
                    <Button
                      aria-label={`Quitar la pregunta ${index + 1}`}
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => set({ questions: draft.questions.filter((_, at) => at !== index) })}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                  {item.options?.length ? (
                    <p className="text-meta text-muted-foreground">Opciones: {item.options.join(" · ")}</p>
                  ) : null}
                  {item.preset === "ci" ? (
                    <p className="text-meta text-warning-foreground">
                      Dato sensible: lo ven quienes administran la comunidad y la seguridad del espacio; se borra a la
                      semana del evento.
                    </p>
                  ) : null}
                </div>
              ))}
              {draft.questions.length < 5 ? (
                <div className="flex flex-col gap-1.5">
                  <Button className="self-start" size="xs" variant="outline" onClick={() => add()}>
                    <Plus />
                    Pregunta
                  </Button>
                  <QuestionPresets draft={draft} set={set} />
                </div>
              ) : null}
            </div>
          </SettingsRow>
          <VolunteerRoles draft={draft} set={set} />
          <SettingsRow hint="Lo mandamos solos; no hace falta hacer nada." label="Mails">
            <ul className="flex flex-col gap-1 text-meta text-muted-foreground">
              <li>Confirmación al anotarse, con la invitación para el calendario</li>
              <li>Recordatorio 48 h antes, con «Voy ✅» y «No puedo ir» para liberar el lugar</li>
              <li>Un segundo aviso 24 h antes a quien no confirmó, si hay cupo o lista de espera</li>
              <li>Cómo llegar, 2 h antes</li>
              <li>La encuesta. {FEEDBACK_TIMING}</li>
            </ul>
          </SettingsRow>
        </SettingsCard>
      ) : null}
    </SettingsSection>
  );
}

/** Copy as formatted text when there's HTML (Meetup's editor keeps it), plain otherwise */
const copyRich = (value: string, html?: string) =>
  html
    ? navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([value], { type: "text/plain" }),
        }),
      ])
    : navigator.clipboard.writeText(value);

function CopyRow({ label, value, html }: { label: string; value: string; html?: () => string | undefined }) {
  return (
    <div className="flex items-start gap-2 border-b border-border py-2.5 last:border-0">
      <div className="min-w-0 flex-1">
        <MicroLabel>{label}</MicroLabel>
        <p className="mt-1 line-clamp-3 text-ui whitespace-pre-line text-foreground">{value || "—"}</p>
      </div>
      <Button
        aria-label={`Copiar ${label.toLowerCase()}`}
        disabled={!value}
        size="icon-sm"
        variant="ghost"
        onClick={() => void copyRich(value, html?.()).then(() => toast.success(`${label} copiado`))}
      >
        <Copy />
      </Button>
    </div>
  );
}

/** Where the event is, in words, for copying elsewhere */
const placeText = (draft: EditableEvent) =>
  draft.mode === "online"
    ? "Online"
    : draft.venue
      ? `${draft.venue.name}, ${draft.venue.neighbourhood}`
      : draft.placeName
        ? [draft.placeName, draft.placeAddress].filter(Boolean).join(", ")
        : "Lugar a confirmar";

export function StepDifusion({ draft, set, errors, community }: StepProps) {
  const rendered = useRef<HTMLDivElement>(null);
  const profile = useQuery({
    ...orpc.communities.getBySlug.queryOptions({ input: { communitySlug: community.slug } }),
    staleTime: 10 * 60_000,
  });
  const meetupGroup = profile.data?.links.meetup;
  const channels = draft.announcement.channels ?? [];
  const toggleChannel = (channel: "slack" | "telegram", on: boolean) =>
    set({
      announcement: {
        channels: on
          ? [...channels.filter((item) => item !== channel), channel]
          : channels.filter((item) => item !== channel),
      },
    });
  const when = draft.dateChosen ? shortWhen(draft.startDate) : "Fecha a confirmar";
  const share = [
    `📣 ${draft.name === UNTITLED ? "" : draft.name}`,
    draft.summary ?? "",
    `🗓 ${when} · 📍 ${placeText(draft)}`,
    `👉 owu.uy/comunidad/${community.slug}/events/${draft.slug}`,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <SettingsSection id="difusion" title="Que se enteren">
      <SettingsCard>
        <SettingsRow
          hint="Al publicar sale en la agenda de owu.uy, en el calendario para suscribirse y en el Semanario."
          label="En OWU"
        >
          <Badge variant="success">
            <CircleCheck aria-hidden />
            Automático
          </Badge>
        </SettingsRow>
        <SettingsRow
          hint={
            <>
              Si tu comunidad tiene grupo en Meetup, copiá esto al crear el evento allá (el título tiene que tener menos
              de 80 caracteres). Después pegá el link acá y el meetup-bot no lo cuenta dos veces.
            </>
          }
          label="Copiar a Meetup"
        >
          <div className="rounded-md border border-border px-3">
            <CopyRow label="Título" value={draft.name === UNTITLED ? "" : draft.name.slice(0, 80)} />
            <CopyRow
              html={() => rendered.current?.innerHTML}
              label="Descripción"
              value={[draft.summary, draft.description].filter(Boolean).join("\n\n")}
            />
            <CopyRow label="Fecha" value={when} />
            <CopyRow label="Lugar" value={placeText(draft)} />
          </div>
          {/* The description as HTML, for pasting into Meetup with its format */}
          <div ref={rendered} aria-hidden className="hidden">
            {draft.summary ? <p>{draft.summary}</p> : null}
            <RichText content={draft.description ?? ""} />
          </div>
          {draft.name.length > 80 ? (
            <p className="mt-1 text-meta text-warning-foreground">
              El nombre tiene más de 80 caracteres: Meetup lo corta.
            </p>
          ) : null}
          {meetupGroup ? (
            <Button asChild className="mt-2" size="xs" variant="outline">
              <a href={meetupGroup} rel="noreferrer" target="_blank">
                <ExternalLink />
                Abrir el grupo en Meetup
              </a>
            </Button>
          ) : null}
        </SettingsRow>
        <SettingsRow error={errors.externalLinks} htmlFor="meetup-url" label="Link del evento en Meetup">
          <Input
            id="meetup-url"
            inputMode="url"
            placeholder="https://www.meetup.com/tu-grupo/events/…"
            value={draft.externalLinks.meetup ?? ""}
            onChange={(event) => set({ externalLinks: event.target.value ? { meetup: event.target.value } : {} })}
          />
        </SettingsRow>
        <SettingsRow
          hint={
            draft.announceChannels.slack || draft.announceChannels.telegram
              ? "Owy lo publica cuando el evento sale: el texto se arma con los datos del evento."
              : "Owy todavía no puede escribir desde el sitio."
          }
          label="Que lo anuncie Owy"
        >
          <div className="flex flex-col gap-2">
            {(["slack", "telegram"] as const).map((channel) => (
              <label key={channel} className="flex items-center gap-2 text-ui text-foreground">
                <Switch
                  checked={channels.includes(channel)}
                  disabled={!draft.announceChannels[channel] || draft.status !== "draft"}
                  onCheckedChange={(on) => toggleChannel(channel, on)}
                />
                {channel === "slack" ? "En el Slack de OWU" : "En el canal de Telegram de OWU"}
              </label>
            ))}
            {channels.length > 0 ? (
              <MessagePreview
                body={announcementText({
                  name: draft.name === UNTITLED ? "Nombre del evento" : draft.name,
                  summary: draft.summary,
                  startDate: draft.startDate,
                  place: placeText(draft),
                  community: community.name,
                  url: `owu.uy/comunidad/${community.slug}/events/${draft.slug}`,
                })}
                channel={channels[0]}
              />
            ) : null}
          </div>
        </SettingsRow>
        <SettingsRow hint="Para Slack, WhatsApp o LinkedIn." label="Texto para compartir">
          <div className="rounded-md border border-border px-3">
            <CopyRow label="Mensaje" value={share} />
          </div>
        </SettingsRow>
      </SettingsCard>
    </SettingsSection>
  );
}

export function StepRevisar({
  draft,
  list,
  onGo,
  community,
  onScheduled,
}: {
  draft: EditableEvent;
  list: Issue[];
  onGo: (step: StepKey) => void;
  community: CalendarCommunity;
  onScheduled: (event: EditableEvent) => void;
}) {
  const required = list.filter((issue) => issue.level === "required");
  const suggested = list.filter((issue) => issue.level === "recommended");
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
  const [at, setAt] = useState({ day: dayKey(tomorrow), time: "10:00" });
  const schedule = useMutation(
    orpc.events.schedulePublish.mutationOptions({
      onSuccess: (event) => {
        onScheduled(event);
        toast.success(
          event.publishAt ? "Publicación programada" : "Ya no está programada",
          event.publishAt ? `Se publica sola el ${shortWhen(event.publishAt)}.` : undefined
        );
      },
      onError: (error) => toast.error("No se pudo programar", error.message),
    })
  );
  const ref = { communityId: community.id, eventId: draft.id };

  return (
    <SettingsSection id="revisar" title={draft.status === "published" ? "Publicado" : "Antes de publicar"}>
      <SettingsCard className="py-3">
        {list.length === 0 ? (
          <p className="flex items-center gap-2 py-2 text-ui text-foreground">
            <CircleCheck aria-hidden className="size-4 text-success" />
            Está todo. Listo para publicar.
          </p>
        ) : (
          <ul className="flex flex-col">
            {[...required, ...suggested].map((issue) => (
              <li
                key={`${issue.step}-${issue.text}`}
                className="flex items-center gap-2.5 border-b border-border py-2 last:border-0"
              >
                {issue.level === "required" ? (
                  <CircleAlert aria-hidden className="size-4 shrink-0 text-live" />
                ) : (
                  <Lightbulb aria-hidden className="size-4 shrink-0 text-warning" />
                )}
                <span className="min-w-0 flex-1 text-ui text-foreground">{issue.text}</span>
                <Badge variant={issue.level === "required" ? "destructive" : "secondary"}>
                  {issue.level === "required" ? "Falta" : "Sugerido"}
                </Badge>
                <Button size="xs" variant="outline" onClick={() => onGo(issue.step)}>
                  Resolver
                </Button>
              </li>
            ))}
          </ul>
        )}
      </SettingsCard>
      {draft.status === "draft" ? (
        <SettingsCard className="mt-3">
          <SettingsRow
            hint={
              draft.publishAt
                ? "Con los mismos chequeos que publicar ahora. La fecha queda reservada hasta entonces."
                : "O usá «Publicar» abajo para que salga ya."
            }
            htmlFor="publish-at"
            label="Publicar más tarde"
          >
            {draft.publishAt ? (
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="info">Se publica el {shortWhen(draft.publishAt)}</Badge>
                <Button
                  disabled={schedule.isPending}
                  size="xs"
                  variant="ghost"
                  onClick={() => schedule.mutate({ ...ref, publishAt: null })}
                >
                  Quitar
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <DateTimeInput
                  day={at.day}
                  id="publish-at"
                  time={at.time}
                  timeLabel="Hora de publicación"
                  onClockChange={(time) => time && setAt({ ...at, time })}
                  onDayChange={(day) => setAt({ ...at, day })}
                />
                <Button
                  disabled={schedule.isPending || required.length > 0}
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    schedule.mutate({
                      ...ref,
                      publishAt: new Date(montevideoIso(`${at.day}T${at.time}`)).toISOString(),
                    })
                  }
                >
                  Programar
                </Button>
              </div>
            )}
          </SettingsRow>
        </SettingsCard>
      ) : null}
      <div className="mt-4 flex items-center justify-between gap-2">
        <MicroLabel>Cómo la ve la gente</MicroLabel>
        <div className="flex items-center gap-1">
          {(["desktop", "phone"] as const).map((option) => (
            <Button
              key={option}
              aria-pressed={device === option}
              size="xs"
              variant={device === option ? "secondary" : "ghost"}
              onClick={() => setDevice(option)}
            >
              {option === "desktop" ? <Monitor /> : <Smartphone />}
              {option === "desktop" ? "Compu" : "Teléfono"}
            </Button>
          ))}
          <Button asChild size="xs" variant="ghost">
            <Link href={`/organizar/vista-previa/${draft.id}`} target="_blank">
              <ExternalLink />
              Abrir
            </Link>
          </Button>
        </div>
      </div>
      <div className="mt-2 overflow-hidden rounded-lg border border-border bg-[#0c0c0f]">
        <iframe
          // A save reloads it, so it shows what's saved
          key={draft.updatedAt}
          className={cn("mx-auto block h-[640px] border-0", device === "phone" ? "w-[390px] max-w-full" : "w-full")}
          src={`/organizar/vista-previa/${draft.id}`}
          title="Vista previa de la página del evento"
        />
      </div>
    </SettingsSection>
  );
}
