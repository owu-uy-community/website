"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ORPCError } from "@orpc/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import * as z from "zod";
import {
  ArrowUpRight,
  CalendarDays,
  LayoutGrid,
  Plug,
  Settings2,
  Ticket,
  Trash2,
  TriangleAlert,
  TvMinimal,
} from "lucide-react";

import { ConfirmDialog } from "components/Admin/panel";
import { scopedAdminHref } from "components/Admin/shell/use-selected-event";
import { fromWallClock, toWallClock } from "components/Admin/settings/event-time";
import { DateTimeInput, TimezoneSelect } from "components/Admin/settings/event-fields";
import {
  countDirty,
  SaveBar,
  SettingsCard,
  SettingsLayout,
  SettingsRow,
  SettingsSection,
  UnsavedChangesGuard,
  type SettingsSectionLink,
} from "components/Admin/settings/settings";
import { PageContainer, PageHeader } from "components/Admin/ui/page";
import { StatusDot } from "components/Admin/ui/status";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Input } from "components/shared/ui/input";
import { Spinner } from "components/shared/ui/spinner";
import { Switch } from "components/shared/ui/switch";
import { Textarea } from "components/shared/ui/textarea";
import { toast } from "components/shared/ui/toast-utils";
import { orpc } from "lib/orpc";
import type { OpenSpace, UpdateOpenSpaceInput } from "lib/orpc/open-spaces/schemas";
import { eventChannel } from "lib/realtime/channels";
import { getRealtimeClient } from "lib/realtime/client";

import { IntegrationsSection } from "./IntegrationsSection";
import { RoomsSection } from "./RoomsSection";

const SECTIONS: SettingsSectionLink[] = [
  { id: "general", label: "General", icon: Settings2 },
  { id: "fecha", label: "Fecha y hora", icon: CalendarDays },
  { id: "salas", label: "Salas y horarios", icon: LayoutGrid },
  { id: "entradas", label: "Entradas", icon: Ticket },
  { id: "kiosco", label: "Kiosco y pantallas", icon: TvMinimal },
  { id: "integraciones", label: "Integraciones", icon: Plug },
  { id: "peligro", label: "Zona peligrosa", icon: TriangleAlert },
];

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const eventFormSchema = z.object({
  name: z.string().trim().min(1, "Poné un nombre"),
  slug: z
    .string()
    .min(1, "Poné una dirección")
    .regex(/^[a-z0-9-]+$/, "Solo minúsculas, números y guiones"),
  description: z.string(),
  isActive: z.boolean(),
  startDay: z.string().regex(DAY, "Elegí el día"),
  startTime: z.string().regex(HHMM, "Poné la hora"),
  endDay: z.string().regex(DAY, "Elegí el día"),
  endTime: z.string().regex(HHMM, "Poné la hora"),
  timezone: z.string().min(1),
  eventbriteEventId: z.string().trim().regex(/^\d*$/, "Son solo números: los de la dirección del evento en Eventbrite"),
  autoHighlightEnabled: z.boolean(),
  venueMapUrl: z.union([z.literal(""), z.url({ protocol: /^https?$/, error: "Pegá el link completo (https://…)" })]),
});

type EventForm = z.infer<typeof eventFormSchema>;

const toForm = (event: OpenSpace): EventForm => {
  const start = toWallClock(event.startDate, event.timezone);
  const end = toWallClock(event.endDate, event.timezone);

  return {
    name: event.name,
    slug: event.slug,
    description: event.description ?? "",
    isActive: event.isActive,
    startDay: start.day,
    startTime: start.time,
    endDay: end.day,
    endTime: end.time,
    timezone: event.timezone,
    eventbriteEventId: event.eventbriteEventId ?? "",
    autoHighlightEnabled: event.autoHighlightEnabled,
    venueMapUrl: event.venueMapUrl ?? "",
  };
};

const reason = (error: unknown) => (error instanceof Error && error.message ? error.message : "Error inesperado");

/** The site's host, for the public address ("owu.uy"). */
const host = (process.env.NEXT_PUBLIC_BASE_URL ?? "").replace(/^https?:\/\//, "").replace(/\/$/, "");

function useSettled<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);

  return settled;
}

const count = new Intl.NumberFormat("es-UY");

/** The Eventbrite id, looked up on Eventbrite as it is typed. */
function EventbriteCheck({ value }: { value: string }) {
  const id = value.trim();
  const settled = useSettled(id, 500);
  const lookable = /^\d{5,20}$/.test(settled);
  const check = useQuery(
    orpc.eventbrite.verify.queryOptions({
      input: { eventbriteEventId: settled },
      enabled: lookable,
      retry: false,
      staleTime: 5 * 60_000,
    })
  );
  const line = "mt-1.5 flex items-start gap-1.5 text-meta";

  if (!id) return <p className={`${line} text-muted-foreground`}>Sin evento, Asistentes no va a tener entradas.</p>;
  // Anything but digits already shows the field's own error.
  if (!/^\d+$/.test(id)) return null;
  if (id !== settled || (lookable && check.isPending)) {
    return (
      <p className={`${line} text-muted-foreground`}>
        <Spinner className="mt-px size-3.5" />
        Buscando en Eventbrite…
      </p>
    );
  }
  if (!lookable)
    return <p className={`${line} text-muted-foreground`}>Es muy corto para ser un evento de Eventbrite.</p>;
  if (check.data) {
    return (
      <p className={`${line} text-success-foreground`} role="status">
        <StatusDot className="mt-[5px]" tone="ok" />
        <span>
          Encontramos «{check.data.name}» ·{" "}
          <span className="font-terminal tabular-nums">{count.format(check.data.tickets)}</span> entradas
        </span>
      </p>
    );
  }

  return (
    <p className={`${line} text-warning-foreground`} role="alert">
      <TriangleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
      {reason(check.error)}
    </p>
  );
}

export default function EventDetailClient({
  community,
  initialEvent,
}: {
  community: { id: string; name: string; slug: string };
  initialEvent: OpenSpace;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const eventKey = orpc.openSpaces.get.queryKey({ input: { id: initialEvent.id } });
  const { data: event } = useQuery({
    ...orpc.openSpaces.get.queryOptions({ input: { id: initialEvent.id } }),
    initialData: initialEvent,
  });

  // Follows the saved event; what is being typed stays (keepDirtyValues) if it changes underneath.
  const values = useMemo(() => toForm(event), [event]);
  const form = useForm<EventForm>({
    resolver: zodResolver(eventFormSchema),
    mode: "onChange",
    values,
    resetOptions: { keepDirtyValues: true },
  });
  const {
    control,
    register,
    watch,
    formState: { dirtyFields, errors },
  } = form;
  const dirtyCount = countDirty(dirtyFields);

  const [startDay, startTime, endDay, endTime] = watch(["startDay", "startTime", "endDay", "endTime"]);
  // Same zone on both sides, so the wall-clock strings compare as the instants do.
  const endsAfterStart = `${endDay}T${endTime}` > `${startDay}T${startTime}`;
  const endError =
    errors.endDay?.message ??
    errors.endTime?.message ??
    (endsAfterStart ? undefined : "Tiene que terminar después de empezar");

  const update = useMutation(
    orpc.openSpaces.update.mutationOptions({
      onSuccess: (updated) => {
        queryClient.setQueryData(eventKey, updated);
        form.reset(toForm(updated), { keepDirtyValues: false });
        for (const key of [
          orpc.openSpaces.listForAdmin.key(),
          orpc.openSpaces.listByCommunity.key(),
          orpc.shell.status.key(),
          // The board's own read of the event, for auto-highlight.
          ["openSpace", updated.id],
        ]) {
          void queryClient.invalidateQueries({ queryKey: key });
        }
        toast.success("Cambios guardados", "Ya se ven en el sitio, los kioscos y las pantallas.");
        if (updated.slug !== event.slug) router.replace(`/admin/communities/${community.slug}/events/${updated.slug}`);
      },
      onError: (error) => {
        if (error instanceof ORPCError && error.code === "CONFLICT") form.setError("slug", { message: error.message });
        else toast.error("No se pudo guardar", reason(error));
      },
    })
  );

  const save = form.handleSubmit((next) => {
    if (!endsAfterStart) {
      document.getElementById("event-end-time")?.focus();
      return;
    }
    // Only what changed: another admin may be editing the rest.
    const data: UpdateOpenSpaceInput = {};
    if (dirtyFields.name) data.name = next.name;
    if (dirtyFields.slug) data.slug = next.slug;
    if (dirtyFields.description) data.description = next.description.trim();
    if (dirtyFields.isActive) data.isActive = next.isActive;
    if (
      dirtyFields.startDay ||
      dirtyFields.startTime ||
      dirtyFields.endDay ||
      dirtyFields.endTime ||
      dirtyFields.timezone
    ) {
      // Both ends move together: a new zone keeps the times and changes the instants.
      data.startDate = fromWallClock(next.startDay, next.startTime, next.timezone).toISOString();
      data.endDate = fromWallClock(next.endDay, next.endTime, next.timezone).toISOString();
      data.timezone = next.timezone;
    }
    if (dirtyFields.eventbriteEventId) data.eventbriteEventId = next.eventbriteEventId || null;
    if (dirtyFields.venueMapUrl) data.venueMapUrl = next.venueMapUrl || null;
    if (dirtyFields.autoHighlightEnabled) data.autoHighlightEnabled = next.autoHighlightEnabled;

    update.mutate(
      { id: event.id, data },
      {
        onSuccess: (updated) => {
          // Open boards drive the highlight: tell them it changed.
          if (data.autoHighlightEnabled !== undefined) {
            getRealtimeClient().publish(eventChannel(updated.id, "highlights"), "auto_highlight_changed", {
              openSpaceId: updated.id,
              autoHighlightEnabled: updated.autoHighlightEnabled,
            });
          }
        },
      }
    );
  });

  const [confirmDelete, setConfirmDelete] = useState(false);
  const remove = useMutation(
    orpc.openSpaces.delete.mutationOptions({
      onSuccess: () => {
        toast.success("Evento eliminado", `«${event.name}» y todo lo que tenía ya no están.`);
        void queryClient.invalidateQueries({ queryKey: orpc.openSpaces.listForAdmin.key() });
        router.push(`/admin/communities/${community.slug}`);
      },
      onError: (error) => {
        setConfirmDelete(false);
        toast.error("No se pudo eliminar", reason(error));
      },
    })
  );

  const boardHref = scopedAdminHref(community.slug, "/admin/openspace", event.slug);

  return (
    <SettingsLayout label="Evento" sections={SECTIONS}>
      <PageContainer className="pb-6" size="small">
        <PageHeader
          description={`${event.name} · se aplica al sitio público, los kioscos, las pantallas y a Owy.`}
          meta={event.isActive ? null : <Badge variant="secondary">Oculto</Badge>}
          title="Ajustes del evento"
        />

        <div className="space-y-7">
          <SettingsSection id="general" title="General">
            <SettingsCard>
              <SettingsRow
                dirty={Boolean(dirtyFields.name)}
                error={errors.name?.message}
                hint="Así aparece en el sitio, los kioscos y los mensajes de Owy."
                htmlFor="event-name"
                label="Nombre"
              >
                <Input aria-invalid={Boolean(errors.name)} autoComplete="off" id="event-name" {...register("name")} />
              </SettingsRow>
              <SettingsRow
                dirty={Boolean(dirtyFields.slug)}
                error={errors.slug?.message}
                hint={
                  dirtyFields.slug
                    ? "Ojo: los links viejos (kioscos, pantallas, redes) dejan de andar."
                    : "La dirección del evento en el sitio. Cambiarla rompe los links ya compartidos."
                }
                htmlFor="event-slug"
                label="Dirección pública"
              >
                <div className="flex h-10 overflow-hidden rounded-md border border-input bg-background shadow-edge transition-colors focus-within:border-ring/60 focus-within:ring-2 focus-within:ring-ring/20 has-[[aria-invalid=true]]:border-live/60 sm:h-8 pointer-coarse:h-11">
                  <span
                    className="flex min-w-0 items-center border-r border-input bg-raised px-2.5 font-terminal text-meta text-muted-foreground"
                    title={`${host}/comunidad/${community.slug}/events/`}
                  >
                    <span className="truncate">
                      {host}/comunidad/{community.slug}/events/
                    </span>
                  </span>
                  <input
                    aria-invalid={Boolean(errors.slug)}
                    autoCapitalize="off"
                    autoComplete="off"
                    className="w-36 min-w-0 shrink-0 grow bg-transparent px-2.5 font-terminal text-meta text-foreground outline-hidden pointer-coarse:text-base"
                    id="event-slug"
                    spellCheck={false}
                    {...register("slug")}
                  />
                </div>
                {event.isActive ? (
                  <a
                    className="touch-target mt-1.5 inline-flex items-center gap-1 text-meta text-muted-foreground transition-colors hover:text-foreground"
                    href={`/comunidad/${community.slug}/events/${event.slug}`}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Ver en el sitio
                    <ArrowUpRight aria-hidden className="size-3.5" />
                  </a>
                ) : null}
              </SettingsRow>
              <SettingsRow
                dirty={Boolean(dirtyFields.description)}
                hint="Opcional: de qué se trata, en una o dos líneas."
                htmlFor="event-description"
                label="Descripción"
              >
                <Textarea className="min-h-[68px]" id="event-description" rows={2} {...register("description")} />
              </SettingsRow>
              <Controller
                control={control}
                name="isActive"
                render={({ field }) => (
                  <SettingsRow
                    compact
                    dirty={Boolean(dirtyFields.isActive)}
                    hint="Apagado, el sitio, los kioscos y las pantallas del evento dejan de verse. El admin sigue igual."
                    htmlFor="event-active"
                    label="Público"
                  >
                    <Switch checked={field.value} id="event-active" onCheckedChange={field.onChange} />
                  </SettingsRow>
                )}
              />
            </SettingsCard>
          </SettingsSection>

          <SettingsSection id="fecha" title="Fecha y hora">
            <SettingsCard>
              <SettingsRow
                dirty={Boolean(dirtyFields.startDay || dirtyFields.startTime)}
                error={errors.startDay?.message ?? errors.startTime?.message}
                hint="La fecha que muestra el sitio, y desde cuándo el admin pasa a en vivo."
                htmlFor="event-start"
                label="Empieza"
              >
                <Controller
                  control={control}
                  name="startDay"
                  render={({ field: day }) => (
                    <Controller
                      control={control}
                      name="startTime"
                      render={({ field: time }) => (
                        <DateTimeInput
                          day={day.value}
                          id="event-start"
                          invalid={Boolean(errors.startTime)}
                          time={time.value}
                          timeLabel="Hora de inicio"
                          onDayChange={day.onChange}
                          onClockChange={time.onChange}
                        />
                      )}
                    />
                  )}
                />
              </SettingsRow>
              <SettingsRow
                dirty={Boolean(dirtyFields.endDay || dirtyFields.endTime)}
                error={endError}
                hint="Hasta cuándo dura el día del evento."
                htmlFor="event-end"
                label="Termina"
              >
                <Controller
                  control={control}
                  name="endDay"
                  render={({ field: day }) => (
                    <Controller
                      control={control}
                      name="endTime"
                      render={({ field: time }) => (
                        <DateTimeInput
                          day={day.value}
                          id="event-end"
                          invalid={Boolean(endError)}
                          time={time.value}
                          timeLabel="Hora de fin"
                          onDayChange={day.onChange}
                          onClockChange={time.onChange}
                        />
                      )}
                    />
                  )}
                />
              </SettingsRow>
              <Controller
                control={control}
                name="timezone"
                render={({ field }) => (
                  <SettingsRow
                    dirty={Boolean(dirtyFields.timezone)}
                    hint="Todas las horas del evento se leen en esta zona."
                    htmlFor="event-timezone"
                    label="Zona horaria"
                  >
                    <TimezoneSelect id="event-timezone" value={field.value} onChange={field.onChange} />
                  </SettingsRow>
                )}
              />
            </SettingsCard>
          </SettingsSection>

          <RoomsSection boardHref={boardHref} eventId={event.id} />

          <SettingsSection id="entradas" title="Entradas">
            <SettingsCard>
              <SettingsRow
                dirty={Boolean(dirtyFields.eventbriteEventId)}
                error={errors.eventbriteEventId?.message}
                hint="El número que aparece en la dirección del evento en Eventbrite."
                htmlFor="event-eventbrite"
                label="Evento de Eventbrite"
              >
                <Input
                  aria-invalid={Boolean(errors.eventbriteEventId)}
                  autoComplete="off"
                  className="font-terminal tabular-nums"
                  id="event-eventbrite"
                  inputMode="numeric"
                  placeholder="1734092841203"
                  {...register("eventbriteEventId")}
                />
                <EventbriteCheck value={watch("eventbriteEventId")} />
              </SettingsRow>
            </SettingsCard>
          </SettingsSection>

          <SettingsSection id="kiosco" title="Kiosco y pantallas">
            <SettingsCard>
              <Controller
                control={control}
                name="autoHighlightEnabled"
                render={({ field }) => (
                  <SettingsRow
                    compact
                    dirty={Boolean(dirtyFields.autoHighlightEnabled)}
                    hint="Con la agenda abierta en el admin, el kiosco resalta solo el bloque que está ocurriendo."
                    htmlFor="event-highlight"
                    label="Resaltado automático"
                  >
                    <Switch checked={field.value} id="event-highlight" onCheckedChange={field.onChange} />
                  </SettingsRow>
                )}
              />
              <SettingsRow
                dirty={Boolean(dirtyFields.venueMapUrl)}
                error={errors.venueMapUrl?.message}
                hint="El link «Cómo llegar» de la página del evento, de Google Maps por ejemplo."
                htmlFor="event-map"
                label="Mapa del lugar"
              >
                <Input
                  aria-invalid={Boolean(errors.venueMapUrl)}
                  autoComplete="off"
                  id="event-map"
                  inputMode="url"
                  placeholder="https://maps.app.goo.gl/…"
                  type="url"
                  {...register("venueMapUrl")}
                />
              </SettingsRow>
            </SettingsCard>
          </SettingsSection>

          <IntegrationsSection communicationHref={scopedAdminHref(community.slug, "/admin/comunicacion", event.slug)} />

          <SettingsSection id="peligro" title="Zona peligrosa">
            <SettingsCard className="border-live/25">
              <SettingsRow
                compact
                hint="Se borran sus salas, horarios, charlas, tareas, asistentes y todo lo del día. No se puede deshacer."
                label="Eliminar el evento"
              >
                <Button size="sm" variant="destructive" onClick={() => setConfirmDelete(true)}>
                  <Trash2 />
                  Eliminar
                </Button>
              </SettingsRow>
            </SettingsCard>
          </SettingsSection>
        </div>

        <SaveBar
          count={dirtyCount}
          saving={update.isPending}
          onDiscard={() => form.reset(undefined, { keepDirtyValues: false })}
          onSave={() => void save()}
        />
      </PageContainer>

      <UnsavedChangesGuard count={dirtyCount} />
      <ConfirmDialog
        confirmLabel="Eliminar el evento"
        description={`Se borran «${event.name}», sus salas, horarios, charlas, tareas del staff y asistentes. No se puede deshacer.`}
        open={confirmDelete}
        pending={remove.isPending}
        title={`¿Eliminar «${event.name}»?`}
        onConfirm={() => remove.mutate({ id: event.id })}
        onOpenChange={setConfirmDelete}
      />
    </SettingsLayout>
  );
}
