"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ListVideo, Lock, Trash2 } from "lucide-react";
import * as z from "zod";

import { ConfirmDialog, EditorPanel, FieldError, Notice, PanelSection, SwitchRow } from "components/Admin/panel";
import { PersonAvatar } from "components/Admin/ui/person";
import { formatClock } from "components/Admin/ui/time";
import { Button } from "components/shared/ui/button";
import { Input } from "components/shared/ui/input";
import { Label } from "components/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "components/shared/ui/select";
import { Textarea } from "components/shared/ui/textarea";
import { toast } from "components/shared/ui/toast-utils";
import { orpc } from "lib/orpc";
import type { Moment } from "lib/orpc/run-of-show/schemas";
import { toClock, toMinutes } from "lib/orpc/run-of-show/timing";

import { CueChips } from "./MomentTable";

const NONE = "__none__";
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const FormSchema = z.object({
  title: z.string().trim().min(1, "Poné un título").max(200, "Hasta 200 caracteres"),
  plannedStart: z.string().regex(HHMM, "Formato inválido (HH:MM)"),
  durationMin: z
    .number({ error: "Poné cuántos minutos dura" })
    .int("En minutos enteros")
    .min(0, "No puede ser negativo")
    .max(720, "Hasta 12 horas"),
  fixed: z.boolean(),
  ownerId: z.string(),
  location: z.string().trim().max(120, "Hasta 120 caracteres"),
  cueId: z.string(),
  owyMessage: z.string().trim().max(1000, "Hasta 1000 caracteres"),
  notes: z.string().trim().max(2000, "Hasta 2000 caracteres"),
});
type FormValues = z.infer<typeof FormSchema>;

/** A new moment starts where the last one ends (or when the event opens). */
const blank = (moments: Moment[], opensAt: string): FormValues => {
  const last = moments.at(-1);

  return {
    title: "",
    plannedStart: last ? toClock(toMinutes(last.plannedStart) + last.durationMin) : opensAt,
    durationMin: 10,
    fixed: false,
    ownerId: NONE,
    location: "",
    cueId: NONE,
    owyMessage: "",
    notes: "",
  };
};

const valuesOf = (moment: Moment): FormValues => ({
  title: moment.title,
  plannedStart: moment.plannedStart,
  durationMin: moment.durationMin,
  fixed: moment.fixed,
  ownerId: moment.owner?.id ?? NONE,
  location: moment.location ?? "",
  cueId: moment.cue?.id ?? NONE,
  owyMessage: moment.owyMessage ?? "",
  notes: moment.notes ?? "",
});

const payloadOf = (values: FormValues) => ({
  title: values.title,
  plannedStart: values.plannedStart,
  durationMin: values.durationMin,
  fixed: values.fixed,
  ownerId: values.ownerId === NONE ? null : values.ownerId,
  location: values.location || null,
  cueId: values.cueId === NONE ? null : values.cueId,
  owyMessage: values.owyMessage || null,
  notes: values.notes || null,
});

/**
 * Create or edit a moment: its plan (title, start, length, fixed), who runs it and where, and
 * what its GO sets off (the OBS cue and Owy's message).
 */
export function MomentEditor({
  eventId,
  moment,
  moments,
  opensAt,
  timezone,
  open,
  onOpenChange,
}: {
  eventId: string;
  /** null creates a new one. */
  moment: Moment | null;
  moments: Moment[];
  /** "HH:MM": where the first moment of an empty guion starts. */
  opensAt: string;
  timezone: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: orpc.runOfShow.list.key({ input: { eventId } }) });
  const roster = useQuery(
    orpc.staffTasks.roster.queryOptions({ input: { eventId }, enabled: open, staleTime: 60_000 })
  );
  const cues = useQuery(orpc.obsCue.list.queryOptions({ input: { instanceId: 1 }, enabled: open, staleTime: 60_000 }));
  const [confirming, setConfirming] = useState(false);

  const {
    control,
    register,
    handleSubmit,
    reset,
    setError,
    watch,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(FormSchema), defaultValues: blank([], opensAt) });

  // Fresh values each time the panel opens; a refetch of the guion while typing must not wipe them.
  const latest = useRef({ moments, opensAt });
  useEffect(() => {
    latest.current = { moments, opensAt };
  }, [moments, opensAt]);
  useEffect(() => {
    if (open) reset(moment ? valuesOf(moment) : blank(latest.current.moments, latest.current.opensAt));
  }, [open, moment, reset]);

  const saved = (title: string) => () => {
    toast.success(title);
    void refresh();
    onOpenChange(false);
  };
  const failed = (error: Error) => setError("root", { message: error.message });
  const create = useMutation(
    orpc.runOfShow.create.mutationOptions({ onSuccess: saved("Momento agregado"), onError: failed })
  );
  const update = useMutation(
    orpc.runOfShow.update.mutationOptions({ onSuccess: saved("Momento guardado"), onError: failed })
  );
  const remove = useMutation(
    orpc.runOfShow.remove.mutationOptions({
      onSuccess: () => {
        toast.success("Momento eliminado");
        setConfirming(false);
        onOpenChange(false);
        void refresh();
      },
      onError: (error) => toast.error("No se pudo eliminar", error.message),
    })
  );
  const busy = create.isPending || update.isPending;

  const onSubmit = (values: FormValues) => {
    const data = payloadOf(values);
    if (moment) update.mutate({ eventId, itemId: moment.id, data });
    else create.mutate({ eventId, ...data });
  };

  const [plannedStart, durationMin, cueId] = watch(["plannedStart", "durationMin", "cueId"]);
  const endsAt =
    HHMM.test(plannedStart) && Number.isFinite(durationMin) ? toClock(toMinutes(plannedStart) + durationMin) : null;
  // The moment's own cue stays listed even if it lives on the other rig.
  const cueOptions = [
    ...(cues.data ?? []),
    ...(moment?.cue && !cues.data?.some((cue) => cue.id === moment.cue?.id) ? [moment.cue] : []),
  ];
  const chosenCue = cueOptions.find((cue) => cue.id === cueId) ?? null;

  return (
    <>
      <EditorPanel
        actions={
          <>
            <Button disabled={busy} type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button disabled={busy} form="moment-form" type="submit">
              {busy ? "Guardando…" : moment ? "Guardar cambios" : "Agregar al guion"}
            </Button>
          </>
        }
        busy={busy}
        danger={
          moment ? (
            <Button
              className="text-live-foreground hover:bg-live-surface hover:text-live-foreground"
              disabled={busy}
              type="button"
              variant="ghost"
              onClick={() => setConfirming(true)}
            >
              <Trash2 />
              <span className="max-sm:sr-only">Eliminar</span>
            </Button>
          ) : undefined
        }
        description={moment ? "Cambiá el plan; lo que ya pasó queda como pasó." : "Se ubica en el guion según su hora."}
        icon={ListVideo}
        open={open}
        title={moment ? "Editar momento" : "Nuevo momento"}
        onOpenChange={onOpenChange}
      >
        <form className="space-y-7" id="moment-form" noValidate onSubmit={handleSubmit(onSubmit)}>
          <PanelSection
            action={
              endsAt ? (
                <span className="font-terminal text-meta text-muted-foreground tabular-nums">termina {endsAt}</span>
              ) : null
            }
            title="Momento"
          >
            <div className="space-y-2">
              <Label htmlFor="moment-title">Título</Label>
              <Input
                aria-invalid={Boolean(errors.title)}
                data-autofocus
                id="moment-title"
                placeholder="Coffee break"
                {...register("title")}
              />
              <FieldError message={errors.title?.message} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="min-w-0 space-y-2">
                <Label htmlFor="moment-start">Inicio</Label>
                <Input
                  aria-invalid={Boolean(errors.plannedStart)}
                  className="font-terminal tabular-nums [&::-webkit-calendar-picker-indicator]:invert"
                  id="moment-start"
                  type="time"
                  {...register("plannedStart")}
                />
                <FieldError message={errors.plannedStart?.message} />
              </div>
              <div className="min-w-0 space-y-2">
                <Label htmlFor="moment-duration">Duración (min)</Label>
                <Input
                  aria-invalid={Boolean(errors.durationMin)}
                  className="font-terminal tabular-nums"
                  id="moment-duration"
                  inputMode="numeric"
                  max={720}
                  min={0}
                  type="number"
                  {...register("durationMin", { valueAsNumber: true })}
                />
                <FieldError message={errors.durationMin?.message} />
              </div>
            </div>
            <Controller
              control={control}
              name="fixed"
              render={({ field }) => (
                <SwitchRow
                  checked={field.value}
                  hint="Arranca a su hora pase lo que pase: «Correr horarios» no lo mueve."
                  icon={Lock}
                  id="moment-fixed"
                  label="Inicio fijo"
                  onCheckedChange={field.onChange}
                />
              )}
            />
          </PanelSection>

          <PanelSection title="Quién y dónde">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="min-w-0 space-y-2">
                <Label htmlFor="moment-owner">Responsable</Label>
                <Controller
                  control={control}
                  name="ownerId"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="moment-owner">
                        <SelectValue placeholder="Nadie todavía" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Nadie todavía</SelectItem>
                        {(roster.data ?? []).map((person) => (
                          <SelectItem key={person.userId} value={person.userId}>
                            <span className="flex items-center gap-2">
                              <PersonAvatar image={person.image} name={person.name} size={18} />
                              {person.name}
                            </span>
                          </SelectItem>
                        ))}
                        {moment?.owner && !roster.data?.some((person) => person.userId === moment.owner?.id) ? (
                          <SelectItem value={moment.owner.id}>{moment.owner.name}</SelectItem>
                        ) : null}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="min-w-0 space-y-2">
                <Label htmlFor="moment-location">Lugar</Label>
                <Input id="moment-location" placeholder="Centro, Patio, 5 salas…" {...register("location")} />
                <FieldError message={errors.location?.message} />
              </div>
            </div>
          </PanelSection>

          <PanelSection
            action={
              <Link
                className="text-meta text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                href="/admin/screen"
              >
                Armar cues en OBS
              </Link>
            }
            title="Al dar GO"
          >
            <div className="space-y-2">
              <Label htmlFor="moment-cue">Cue</Label>
              <Controller
                control={control}
                name="cueId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="moment-cue">
                      <SelectValue placeholder="Sin cue" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Sin cue</SelectItem>
                      {cueOptions.map((cue) => (
                        <SelectItem key={cue.id} value={cue.id}>
                          {cue.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {chosenCue ? (
                <CueChips className="flex-wrap pt-1" cue={chosenCue} owyMessage={null} />
              ) : (
                <p className="text-meta text-muted-foreground">
                  Un cue junta la escena de OBS, la de la pantalla y un sonido, en un solo GO.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="moment-owy">Mensaje de Owy</Label>
              <Textarea
                aria-invalid={Boolean(errors.owyMessage)}
                className="min-h-[72px]"
                id="moment-owy"
                placeholder="☕ Coffee break en el patio: 35 minutos."
                {...register("owyMessage")}
              />
              <p className="text-meta text-muted-foreground">Owy lo publica en el canal de Telegram de asistentes.</p>
              <FieldError message={errors.owyMessage?.message} />
            </div>
          </PanelSection>

          <PanelSection title="Notas">
            <Textarea
              aria-label="Notas"
              className="min-h-[72px]"
              placeholder="Lo que tiene que saber quien lo corre"
              {...register("notes")}
            />
            <FieldError message={errors.notes?.message} />
          </PanelSection>

          {moment?.actualStart ? (
            <Notice tone="info">
              Arrancó a las {formatClock(new Date(moment.actualStart), timezone)}. Cambiar el plan no cambia lo que ya
              pasó.
            </Notice>
          ) : null}
          <Notice show={Boolean(errors.root)} tone="danger">
            {errors.root?.message}
          </Notice>
        </form>
      </EditorPanel>

      <ConfirmDialog
        confirmLabel="Eliminar momento"
        description="Sale del guion y de lo que muestra el día. No se puede deshacer."
        open={confirming}
        pending={remove.isPending}
        title={`¿Eliminar «${moment?.title ?? ""}»?`}
        onConfirm={() => moment && remove.mutate({ eventId, itemId: moment.id })}
        onOpenChange={setConfirming}
      />
    </>
  );
}
