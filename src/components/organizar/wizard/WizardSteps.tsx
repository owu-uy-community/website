"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  CircleAlert,
  CircleCheck,
  Coffee,
  Copy,
  Globe,
  Lightbulb,
  MapPin,
  MessagesSquare,
  Mic,
  Monitor,
  Plus,
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
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Input } from "components/shared/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "components/shared/ui/select";
import { Switch } from "components/shared/ui/switch";
import { Textarea } from "components/shared/ui/textarea";
import { toast } from "components/shared/ui/toast-utils";
import { RichText } from "components/shared/RichText";
import { shortWhen } from "lib/community/time";
import { TOPICS } from "lib/community/topics";
import { orpc } from "lib/orpc/client";
import type { EditableEvent } from "lib/orpc/events/schemas";
import { UNTITLED, type Issue, type StepKey } from "lib/organizar/steps";

import type { CalendarCommunity } from "../calendar/CalendarClient";
import { EventbriteStatus } from "../integrations/EventbriteStatus";
import { RequestComposer } from "../venues/VenuesClient";
import { DatePicker } from "./DatePicker";

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

export function StepTipo({ draft, set }: StepProps) {
  return (
    <SettingsSection id="tipo" title="¿Qué tipo de evento es?">
      <ChoiceCards name="Formato" options={FORMAT} value={draft.format} onChange={(format) => set({ format })} />
    </SettingsSection>
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
        <SettingsRow hint="Hasta 5. El calendario los usa para saber con quién chocás." label="Temas">
          <div className="flex flex-wrap gap-1.5">
            {TOPICS.map((topic) => {
              const on = draft.topics.includes(topic.value);

              return (
                <button
                  key={topic.value}
                  aria-pressed={on}
                  className={cn(
                    "rounded-md border px-2 py-1 text-meta transition-colors",
                    on
                      ? "border-primary/60 bg-primary-surface text-foreground"
                      : "border-input text-muted-foreground hover:text-foreground"
                  )}
                  disabled={!on && draft.topics.length >= 5}
                  type="button"
                  onClick={() =>
                    set({
                      topics: on
                        ? draft.topics.filter((value) => value !== topic.value)
                        : [...draft.topics, topic.value],
                    })
                  }
                >
                  {topic.label}
                </button>
              );
            })}
          </div>
        </SettingsRow>
        <SettingsRow
          hint="Otras comunidades que lo arman con ustedes. Si no la organizás vos, le llega una invitación y aparece en su perfil cuando acepta."
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
                    <button
                      aria-label={`Sacar a ${cohost.name}`}
                      className="grid size-5 place-items-center rounded-sm text-muted-foreground hover:bg-raised hover:text-foreground"
                      type="button"
                      onClick={() => set({ cohostIds: chosen.filter((id) => id !== cohost.id) })}
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
              onValueChange={(id) => set({ cohostIds: [...chosen, id] })}
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
  const venues = useQuery({
    ...orpc.venues.list.queryOptions({ input: { communityId: community.id } }),
    enabled: inPerson && !draft.venue,
  });
  const requests = useQuery({
    ...orpc.venues.requests.queryOptions({ input: { communityId: community.id } }),
    enabled: inPerson,
  });
  const [asking, setAsking] = useState<string | null>(null);
  const mine = (requests.data ?? []).filter((request) => request.eventId === draft.id);
  const open = mine.find((request) => request.status === "pending");
  const requestable = (venues.data ?? []).filter((venue) => venue.requestable);

  return (
    <SettingsSection id="espacio" title="Dónde">
      <ChoiceCards name="Modalidad" options={MODES} value={draft.mode} onChange={(mode) => set({ mode })} />
      {inPerson ? (
        <SettingsCard className="mt-3">
          {draft.venue ? (
            <SettingsRow hint="Aceptó el pedido: la dirección la ven quienes se anoten." label="Espacio">
              <div className="flex items-center gap-2.5 rounded-md border border-success/40 bg-success-surface px-3 py-2">
                <Building2 aria-hidden className="size-4 text-success" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-ui font-medium text-foreground">{draft.venue.name}</span>
                  <span className="block truncate text-meta text-muted-foreground">
                    {draft.venue.neighbourhood} · {draft.venue.address}
                  </span>
                </span>
              </div>
            </SettingsRow>
          ) : (
            <>
              <SettingsRow
                hint={
                  open
                    ? `Esperando la respuesta de ${open.venue.name}.`
                    : "Le llega un mail con tus fechas y responde desde un link."
                }
                label="Pedir lugar"
              >
                {open ? (
                  <Badge variant="warning">Pedido a {open.venue.name}</Badge>
                ) : (
                  <Select value="" onValueChange={setAsking}>
                    <SelectTrigger aria-label="Elegí un espacio">
                      <SelectValue
                        placeholder={requestable.length ? "Elegí un espacio…" : "Ningún espacio recibe pedidos todavía"}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {requestable.map((venue) => (
                        <SelectItem key={venue.id} value={venue.id}>
                          {venue.name}
                          {venue.capacity ? ` · hasta ${venue.capacity}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </SettingsRow>
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
        presetEventId={draft.id}
        today={today}
        venue={(venues.data ?? []).find((venue) => venue.id === asking) ?? null}
        onClose={() => setAsking(null)}
        onSent={() => {
          setAsking(null);
          void queryClient.invalidateQueries({ queryKey: orpc.venues.requests.key() });
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

const PRESETS = [
  "¿Es tu primera vez en un evento de la comunidad?",
  "Empresa o institución",
  "¿Necesitás algo para participar?",
];

export function StepInscripcion({ draft, set, errors, community }: StepProps) {
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
          <SettingsRow
            error={errors.capacity}
            hint="A los eventos gratis falta cerca de un tercio de quienes se anotan: si entran 50, abrí unos 70."
            htmlFor="capacity"
            label="Cupo"
          >
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
          <SettingsRow compact hint="Cada inscripción espera tu OK." htmlFor="approval" label="Aprobar a mano">
            <Switch checked={draft.approval} id="approval" onCheckedChange={(approval) => set({ approval })} />
          </SettingsRow>
          <SettingsRow hint="Acompañantes por persona." label="+1">
            <Select
              value={String(draft.guestsAllowed)}
              onValueChange={(value) => set({ guestsAllowed: Number(value) })}
            >
              <SelectTrigger aria-label="Acompañantes" className="w-36">
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
          <SettingsRow hint="Hasta 5, cortas. Nada sensible (salud, documento)." label="Preguntas">
            <div className="flex flex-col gap-2">
              {draft.questions.map((item, index) => (
                <div key={item.id} className="flex items-center gap-2">
                  <Input
                    aria-label={`Pregunta ${index + 1}`}
                    maxLength={200}
                    value={item.label}
                    onChange={(event) => question(index, { label: event.target.value })}
                  />
                  <label className="flex shrink-0 items-center gap-1.5 text-meta text-muted-foreground">
                    <Switch checked={item.required} onCheckedChange={(required) => question(index, { required })} />
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
              ))}
              {draft.questions.length < 5 ? (
                <div className="flex flex-wrap gap-1.5">
                  <Button size="xs" variant="outline" onClick={() => add()}>
                    <Plus />
                    Pregunta
                  </Button>
                  {PRESETS.filter((preset) => !draft.questions.some((item) => item.label === preset)).map((preset) => (
                    <Button key={preset} size="xs" variant="ghost" onClick={() => add(preset)}>
                      {preset}
                    </Button>
                  ))}
                </div>
              ) : null}
            </div>
          </SettingsRow>
          <SettingsRow hint="Lo mandamos solos; no hace falta hacer nada." label="Mails">
            <ul className="flex flex-col gap-1 text-meta text-muted-foreground">
              <li>Confirmación al anotarse, con la invitación para el calendario</li>
              <li>Recordatorio 48 h antes, con «No puedo ir» para liberar el lugar</li>
              <li>Cómo llegar, 2 h antes</li>
              <li>Feedback, al día siguiente</li>
            </ul>
          </SettingsRow>
        </SettingsCard>
      ) : null}
    </SettingsSection>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
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
        onClick={() => void navigator.clipboard.writeText(value).then(() => toast.success(`${label} copiado`))}
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
            <CopyRow label="Descripción" value={[draft.summary, draft.description].filter(Boolean).join("\n\n")} />
            <CopyRow label="Fecha" value={when} />
            <CopyRow label="Lugar" value={placeText(draft)} />
          </div>
          {draft.name.length > 80 ? (
            <p className="mt-1 text-meta text-warning-foreground">
              El nombre tiene más de 80 caracteres: Meetup lo corta.
            </p>
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
}: {
  draft: EditableEvent;
  list: Issue[];
  onGo: (step: StepKey) => void;
}) {
  const required = list.filter((issue) => issue.level === "required");
  const suggested = list.filter((issue) => issue.level === "recommended");

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
      <p className="mt-3 text-meta text-muted-foreground">
        ¿Cómo queda?{" "}
        <Link className="underline underline-offset-2" href={`/organizar/vista-previa/${draft.id}`} target="_blank">
          Ver la página como la ve la gente
        </Link>
      </p>
    </SettingsSection>
  );
}
