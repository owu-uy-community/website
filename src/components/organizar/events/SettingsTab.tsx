"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Ban, TriangleAlert, Users } from "lucide-react";

import { ConfirmDialog, Notice } from "components/Admin/panel";
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
import { DraftPatchSchema, type EditableEvent } from "lib/orpc/events/schemas";
import { orpc } from "lib/orpc/client";

import { StaleNotice, useEventSave, type EventInput } from "./save";

type Form = Pick<EditableEvent, "capacity" | "waitlist" | "approval" | "guestsAllowed" | "rsvpClosesAt">;
const FIELDS = ["capacity", "waitlist", "approval", "guestsAllowed", "rsvpClosesAt"] as const;

const SECTIONS = [
  { id: "inscripcion", label: "Inscripción", icon: Users },
  { id: "peligro", label: "Zona peligrosa", icon: TriangleAlert },
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
  isAdmin,
  people,
}: {
  input: EventInput;
  event: EditableEvent;
  isAdmin: boolean;
  /** Signed up now: who a cancellation tells */
  people: number;
}) {
  const queryClient = useQueryClient();
  const { save, saving, stale, reload } = useEventSave(input);
  const [edits, setEdits] = useState<Partial<Form>>({});
  const [cancelling, setCancelling] = useState(false);
  const form: Form = { ...event, ...edits };
  const dirty = FIELDS.filter((key) => key in edits && edits[key] !== event[key]);
  const set = (change: Partial<Form>) => setEdits((current) => ({ ...current, ...change }));
  const capacityError = DraftPatchSchema.shape.capacity.safeParse(form.capacity).success
    ? undefined
    : "Un número entre 1 y 5000, o vacío para no poner límite";
  const closesError =
    form.rsvpClosesAt && form.rsvpClosesAt > event.endDate ? "Tiene que ser antes de que termine el evento" : undefined;
  const cancelled = event.status === "cancelled";
  const cancel = useMutation(
    orpc.events.cancel.mutationOptions({
      onSuccess: (result) => {
        queryClient.setQueryData(orpc.events.get.queryKey({ input }), result);
        void queryClient.invalidateQueries({ queryKey: orpc.events.stats.key() });
        setCancelling(false);
        setEdits({});
        toast.success("Evento cancelado", "Sigue en la agenda como cancelado y avisamos a quienes se anotaron.");
      },
      onError: (error) => toast.error("No se pudo cancelar", error.message),
    })
  );

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
    <SettingsLayout label="Ajustes" sections={isAdmin && !cancelled ? SECTIONS : SECTIONS.slice(0, 1)}>
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

        <SettingsSection id="inscripcion" title="Inscripción">
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
                  <SettingsRow
                    dirty={dirty.includes("rsvpClosesAt")}
                    error={closesError}
                    hint="Si no, se puede anotar hasta que termina. Quien ya está anotado no cambia."
                    htmlFor="closes"
                    label="Cerrar la inscripción antes"
                  >
                    <div className="flex flex-col gap-2">
                      <Switch
                        aria-label="Cerrar la inscripción antes"
                        checked={closes !== null}
                        disabled={cancelled}
                        id="closes"
                        // A day before the start, as a starting point
                        onCheckedChange={(on) =>
                          set({
                            rsvpClosesAt: on
                              ? new Date(new Date(event.startDate).getTime() - 86_400_000).toISOString()
                              : null,
                          })
                        }
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

        {isAdmin && !cancelled ? (
          <SettingsSection id="peligro" title="Zona peligrosa">
            <div className="flex flex-col gap-3">
              <Notice tone="danger">
                Cancelar avisa por mail a {people === 1 ? "la persona anotada" : `las ${people} personas anotadas`},
                saca el evento de sus calendarios y lo deja en la agenda como cancelado. No se puede deshacer.
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
      <ConfirmDialog
        confirmLabel="Cancelar el evento"
        description="Queda en la agenda como cancelado y quienes se anotaron reciben un aviso."
        open={cancelling}
        pending={cancel.isPending}
        pendingLabel="Cancelando…"
        title={`¿Cancelar «${event.name}»?`}
        onConfirm={() => cancel.mutate({ ...input, reason: "" })}
        onOpenChange={setCancelling}
      />
    </SettingsLayout>
  );
}
