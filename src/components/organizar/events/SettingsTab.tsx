"use client";

import { useState } from "react";
import Link from "next/link";
import { Ban, Presentation, ShieldCheck, TriangleAlert, Users } from "lucide-react";

import { Notice } from "components/Admin/panel";
import { DateTimeInput } from "components/Admin/settings/event-fields";
import {
  SaveBar,
  SettingsCard,
  SettingsLayout,
  SettingsRow,
  SettingsSection,
  UnsavedChangesGuard,
} from "components/Admin/settings/settings";
import { Button } from "components/shared/ui/button";
import { Input } from "components/shared/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "components/shared/ui/select";
import { Switch } from "components/shared/ui/switch";
import { toast } from "components/shared/ui/toast-utils";
import { dateParts, dayKey, montevideoIso } from "lib/community/time";
import { suggestedCloseAt } from "lib/organizar/rsvp-state";
import { RSVP_CLOSE_HINT } from "lib/organizar/rules";
import { headcount, plural } from "lib/organizar/words";
import { DraftPatchSchema, type EditableEvent, type EventStats } from "lib/orpc/events/schemas";

import { ConductSection } from "./ConductSection";
import { CancelEventDialog } from "./NotifyDialog";
import { StaleNotice, useEventSave, type EventInput } from "./save";

type Form = Pick<EditableEvent, "capacity" | "waitlist" | "approval" | "guestsAllowed" | "rsvpClosesAt" | "slideNotes">;
const FIELDS = ["capacity", "waitlist", "approval", "guestsAllowed", "rsvpClosesAt", "slideNotes"] as const;

const SECTIONS = [
  { id: "inscripcion", label: "Inscripción", icon: Users },
  { id: "conducta", label: "Conducta", icon: ShieldCheck },
  { id: "presentacion", label: "Presentación", icon: Presentation },
  { id: "peligro", label: "Zona peligrosa", icon: TriangleAlert },
];
const NOTES: { key: keyof EditableEvent["slideNotes"]; label: string; placeholder: string }[] = [
  { key: "wifiName", label: "Nombre del wifi", placeholder: "Invitados" },
  { key: "wifiPassword", label: "Contraseña del wifi", placeholder: "bienvenidos2026" },
  {
    key: "access",
    label: "Cómo entrar y moverse",
    placeholder: "Baños al fondo a la izquierda; la terraza cierra a las 21",
  },
];

/** A Montevideo day and time as the ISO instant the API keeps */
const instant = (day: string, time: string) => new Date(montevideoIso(`${day}T${time}`)).toISOString();

/**
 * The sign-up settings of a published event (cupo, waitlist, +1, approval, when sign-ups close),
 * saved together from the bar, and cancelling the event.
 */
export function SettingsTab({
  input,
  event,
  canCancel,
  stats,
}: {
  input: EventInput;
  event: EditableEvent;
  /** event:cancel: the danger zone */
  canCancel: boolean;
  stats: EventStats | undefined;
}) {
  const { save, saving, stale, reload } = useEventSave(input);
  const [edits, setEdits] = useState<Partial<Form>>({});
  const [cancelling, setCancelling] = useState(false);
  const form: Form = { ...event, ...edits };
  const dirty = FIELDS.filter((key) => key in edits && JSON.stringify(edits[key]) !== JSON.stringify(event[key]));
  const set = (change: Partial<Form>) => setEdits((current) => ({ ...current, ...change }));
  const capacityError = DraftPatchSchema.shape.capacity.safeParse(form.capacity).success
    ? undefined
    : "Un número entre 1 y 5000, o vacío para no poner límite";
  const closesError =
    form.rsvpClosesAt && form.rsvpClosesAt > event.endDate ? "Tiene que ser antes de que termine el evento" : undefined;
  const cancelled = event.status === "cancelled";
  // Everyone signed up (a seat, an offer, waiting, pending) hears about a cancellation
  const notified = stats ? stats.attending + stats.waiting + stats.pending : 0;
  const count = stats ? headcount(stats, event.capacity) : null;

  const onSave = () => {
    if (capacityError || closesError) return;
    void save(Object.fromEntries(dirty.map((key) => [key, form[key]]))).then((ok) => {
      if (!ok) return;
      setEdits({});
      toast.success("Guardado", "La página del evento ya lo muestra.");
    });
  };
  const closes = form.rsvpClosesAt ? new Date(form.rsvpClosesAt) : null;

  return (
    <SettingsLayout label="Ajustes" sections={canCancel && !cancelled ? SECTIONS : SECTIONS.slice(0, -1)}>
      <div className="max-w-3xl space-y-7 md:pl-6">
        <StaleNotice
          show={stale}
          onReload={() => {
            setEdits({});
            void reload();
          }}
        />
        <Notice show={cancelled} tone="danger">
          Este evento está cancelado: ya no se edita.
        </Notice>

        <SettingsSection
          actions={
            count && event.registration === "owu" ? (
              <span className="text-meta text-muted-foreground tabular-nums" data-testid="headcount">
                {count.seatsLabel} · {count.attendingLabel} · {count.waitlistLabel}
              </span>
            ) : undefined
          }
          id="inscripcion"
          title="Inscripción"
        >
          {event.registration === "owu" || event.registration === "eventbrite" ? (
            <SettingsCard>
              <SettingsRow
                dirty={dirty.includes("capacity")}
                error={capacityError}
                hint="A los eventos gratis falta cerca de un tercio de quienes se anotan: si entran 50, abrí unos 70. Si lo subís, la lista de espera avanza sola."
                htmlFor="capacity"
                label="Cupo"
              >
                <Input
                  className="w-28 font-terminal tabular-nums"
                  disabled={cancelled}
                  id="capacity"
                  inputMode="numeric"
                  min={1}
                  placeholder="Sin límite"
                  type="number"
                  value={form.capacity ?? ""}
                  onChange={(change) => set({ capacity: change.target.value ? Number(change.target.value) : null })}
                />
              </SettingsRow>
              {event.registration === "owu" ? (
                <>
                  <SettingsRow
                    compact
                    dirty={dirty.includes("waitlist")}
                    hint="Cuando alguien libera su lugar, se lo ofrecemos al siguiente."
                    htmlFor="waitlist"
                    label="Lista de espera"
                  >
                    <Switch
                      checked={form.waitlist}
                      disabled={cancelled}
                      id="waitlist"
                      onCheckedChange={(waitlist) => set({ waitlist })}
                    />
                  </SettingsRow>
                  <SettingsRow
                    compact
                    dirty={dirty.includes("approval")}
                    hint="Cada inscripción nueva espera tu OK en Inscriptos."
                    htmlFor="approval"
                    label="Aprobar a mano"
                  >
                    <Switch
                      checked={form.approval}
                      disabled={cancelled}
                      id="approval"
                      onCheckedChange={(approval) => set({ approval })}
                    />
                  </SettingsRow>
                  <SettingsRow dirty={dirty.includes("guestsAllowed")} hint="Acompañantes por persona." label="+1">
                    <Select
                      disabled={cancelled}
                      value={String(form.guestsAllowed)}
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
                    dirty={dirty.includes("rsvpClosesAt")}
                    error={closesError}
                    hint={
                      closes
                        ? "Después de esa hora ya no se anota nadie; quien llegue entra en la puerta. Quien ya está anotado no cambia."
                        : RSVP_CLOSE_HINT
                    }
                    htmlFor="closes"
                    label="Otro horario de cierre"
                  >
                    <div className="flex flex-col gap-2">
                      <Switch
                        aria-label="Otro horario de cierre"
                        checked={closes !== null}
                        disabled={cancelled}
                        id="closes"
                        // The same starting point as the wizard: two hours before
                        onCheckedChange={(on) => set({ rsvpClosesAt: on ? suggestedCloseAt(event.startDate) : null })}
                      />
                      {closes ? (
                        <DateTimeInput
                          day={dayKey(closes)}
                          id="closes-at"
                          invalid={Boolean(closesError)}
                          time={dateParts(closes.toISOString()).time}
                          timeLabel="Hora de cierre"
                          onClockChange={(time) => time && set({ rsvpClosesAt: instant(dayKey(closes), time) })}
                          onDayChange={(day) =>
                            set({ rsvpClosesAt: instant(day, dateParts(closes.toISOString()).time) })
                          }
                        />
                      ) : null}
                    </div>
                  </SettingsRow>
                </>
              ) : null}
            </SettingsCard>
          ) : (
            <Notice tone="info">
              {event.registration === "none"
                ? "Es de entrada libre: no hay inscripción que ajustar."
                : "La inscripción es en otro sitio."}{" "}
              Para cambiar cómo se anota la gente,{" "}
              <Link
                className="underline underline-offset-2"
                href={`/organizar/panel/${event.communitySlug}/eventos/${event.id}/editar?paso=inscripcion`}
              >
                editá el evento
              </Link>
              .
            </Notice>
          )}
        </SettingsSection>

        <ConductSection event={event} />

        <SettingsSection id="presentacion" title="Datos para la presentación">
          <SettingsCard>
            {NOTES.map((note) => (
              <SettingsRow
                key={note.key}
                dirty={
                  dirty.includes("slideNotes") &&
                  (form.slideNotes[note.key] ?? "") !== (event.slideNotes[note.key] ?? "")
                }
                hint={
                  note.key === "wifiName"
                    ? "Van en la presentación de bienvenida, que solo abren ustedes. Nunca en la página del evento."
                    : undefined
                }
                htmlFor={`slide-${note.key}`}
                label={note.label}
              >
                <Input
                  disabled={cancelled}
                  id={`slide-${note.key}`}
                  maxLength={note.key === "access" ? 200 : 80}
                  placeholder={note.placeholder}
                  value={form.slideNotes[note.key] ?? ""}
                  onChange={(change) =>
                    set({ slideNotes: { ...form.slideNotes, [note.key]: change.target.value || undefined } })
                  }
                />
              </SettingsRow>
            ))}
          </SettingsCard>
        </SettingsSection>

        {canCancel && !cancelled ? (
          <SettingsSection id="peligro" title="Zona peligrosa">
            <div className="flex flex-col gap-3">
              <Notice tone="danger">
                Cancelar avisa por mail a {plural(notified, "persona", "personas")} (con lugar, en espera o por
                aprobar), con el motivo; saca el evento de sus calendarios y lo deja en la agenda como cancelado. No se
                puede deshacer.
              </Notice>
              <SettingsCard className="border-live/25">
                <SettingsRow
                  compact
                  hint="Si solo cambia la fecha o el lugar, editalo: les avisamos el cambio."
                  label="Cancelar el evento"
                >
                  <Button size="sm" variant="destructive" onClick={() => setCancelling(true)}>
                    <Ban />
                    Cancelar evento
                  </Button>
                </SettingsRow>
              </SettingsCard>
            </div>
          </SettingsSection>
        ) : null}

        <SaveBar count={dirty.length} saving={saving} onDiscard={() => setEdits({})} onSave={onSave} />
      </div>
      <UnsavedChangesGuard count={dirty.length} />
      <CancelEventDialog
        event={event}
        input={input}
        notified={notified}
        open={cancelling}
        onCancelled={() => setEdits({})}
        onOpenChange={setCancelling}
      />
    </SettingsLayout>
  );
}
