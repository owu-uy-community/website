"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import * as z from "zod";
import { ChevronsUpDown, ClipboardList, Trash2, X } from "lucide-react";

import { cn } from "app/lib/utils";
import { ConfirmDialog, EditorPanel, FieldError, Notice, PanelSection } from "components/Admin/panel";
import { PersonAvatar } from "components/Admin/ui/person";
import { Button } from "components/shared/ui/button";
import { DatePicker } from "components/shared/ui/date-picker";
import { Input } from "components/shared/ui/input";
import { Label } from "components/shared/ui/label";
import { Textarea } from "components/shared/ui/textarea";
import { toast } from "components/shared/ui/toast-utils";
import { orpc } from "lib/orpc";

import type { RosterMember, StaffTask, StaffTaskType } from "./helpers";
import { RosterPicker } from "./RosterPicker";
import { staffKeys } from "./use-staff";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const optionalTime = z.string().refine((value) => value === "" || TIME.test(value), "Usá el formato 14:30");

const taskFormSchema = z
  .object({
    title: z.string().trim().min(1, "Poné qué hay que hacer").max(200, "Hasta 200 caracteres"),
    type: z.enum(["task", "ongoing", "milestone"]),
    dayDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Elegí el día"),
    startTime: optionalTime,
    endTime: optionalTime,
    minPeople: z
      .string()
      .refine((value) => value === "" || /^\d+$/.test(value), "Poné un número")
      .refine((value) => value === "" || Number(value) >= 1, "Al menos 1 persona")
      .refine((value) => value === "" || Number(value) <= 99, "Hasta 99 personas"),
    location: z.string().max(120, "Hasta 120 caracteres"),
    notes: z.string().max(4000, "Hasta 4000 caracteres"),
    assigneeIds: z.array(z.string()),
  })
  .superRefine((values, ctx) => {
    // A milestone is a moment: its end, minimum and people are dropped on save.
    if (values.type === "milestone") return;
    if (values.endTime && !values.startTime) {
      ctx.addIssue({ code: "custom", path: ["startTime"], message: "Poné a qué hora empieza" });
    }
    if (values.startTime && values.endTime && values.endTime <= values.startTime) {
      ctx.addIssue({
        code: "custom",
        path: ["endTime"],
        message: `Tiene que terminar después de las ${values.startTime}`,
      });
    }
  });

type TaskFormValues = z.infer<typeof taskFormSchema>;

const TYPES: { value: StaffTaskType; label: string; hint: string }[] = [
  { value: "task", label: "Tarea", hint: "Con hora y gente asignada." },
  { value: "ongoing", label: "Continua", hint: "Un tramo largo o todo el día: técnica, stream, puerta." },
  { value: "milestone", label: "Hito", hint: "Un momento de la agenda; se ve como marca en los turnos." },
];

const toFormValues = (task: StaffTask | null, defaultDay: string): TaskFormValues => ({
  title: task?.title ?? "",
  type: task?.type ?? "task",
  dayDate: task?.dayDate ?? defaultDay,
  startTime: task?.startTime ?? "",
  endTime: task?.endTime ?? "",
  minPeople: task?.minPeople != null ? String(task.minPeople) : "",
  location: task?.location ?? "",
  notes: task?.notes ?? "",
  assigneeIds: task?.assignees.map((assignee) => assignee.userId) ?? [],
});

/**
 * Create or edit a task. Owns its form and its saves; the list refreshes itself. On a phone it
 * is a bottom sheet and never grabs the keyboard on open.
 */
export function TaskFormPanel({
  open,
  onOpenChange,
  eventId,
  task,
  defaultDay,
  roster,
  free,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
  /** The task being edited; null creates one. */
  task: StaffTask | null;
  defaultDay: string;
  roster: RosterMember[];
  /** People on site with nothing assigned right now, offered first. */
  free?: ReadonlySet<string>;
}) {
  const queryClient = useQueryClient();
  const keys = staffKeys(eventId);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const {
    control,
    register,
    handleSubmit,
    reset,
    watch,
    setError,
    formState: { errors },
  } = useForm<TaskFormValues>({ resolver: zodResolver(taskFormSchema), defaultValues: toFormValues(task, defaultDay) });

  // Reload whenever the panel opens, so a previous edit never leaks into the next one.
  useEffect(() => {
    if (open) reset(toFormValues(task, defaultDay));
  }, [open, task, defaultDay, reset]);

  const settle = (title: string, description: string) => {
    toast.success(title, description);
    onOpenChange(false);
    void queryClient.invalidateQueries({ queryKey: keys.tasks });
    void queryClient.invalidateQueries({ queryKey: keys.onShift });
  };
  const showError = (error: Error) => setError("root", { message: error.message || "Probá de nuevo en un momento." });

  const create = useMutation(
    orpc.staffTasks.create.mutationOptions({
      onSuccess: (created) => settle("Tarea creada", `«${created.title}» ya está en el cronograma.`),
      onError: showError,
    })
  );
  const update = useMutation(
    orpc.staffTasks.update.mutationOptions({
      onSuccess: (saved) => settle("Tarea guardada", `«${saved.title}» quedó al día en todos los teléfonos.`),
      onError: showError,
    })
  );
  const remove = useMutation(
    orpc.staffTasks.delete.mutationOptions({
      onSuccess: (deleted) => {
        setConfirmDelete(false);
        settle("Tarea eliminada", `«${deleted.title}» ya no está en el cronograma.`);
      },
      onError: (error) => {
        setConfirmDelete(false);
        showError(error);
      },
    })
  );
  const busy = create.isPending || update.isPending || remove.isPending;

  const [type, assigneeIds] = watch(["type", "assigneeIds"]);
  const milestone = type === "milestone";
  const chosen = roster.filter((member) => assigneeIds.includes(member.userId));

  const submit = handleSubmit((values) => {
    const data = {
      title: values.title.trim(),
      type: values.type,
      dayDate: values.dayDate,
      startTime: values.startTime || null,
      endTime: milestone ? null : values.endTime || null,
      minPeople: milestone || !values.minPeople ? null : Number(values.minPeople),
      location: values.location.trim() || null,
      notes: values.notes.trim() || null,
      assigneeIds: milestone ? [] : values.assigneeIds,
    };
    if (task) update.mutate({ eventId, taskId: task.id, data });
    else create.mutate({ eventId, ...data, notes: data.notes ?? undefined });
  });

  return (
    <>
      <EditorPanel
        actions={
          <>
            <Button disabled={busy} type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button disabled={busy} form="staff-task-form" type="submit">
              {create.isPending || update.isPending ? "Guardando…" : task ? "Guardar cambios" : "Crear tarea"}
            </Button>
          </>
        }
        busy={busy}
        danger={
          task ? (
            <Button
              className="text-live-foreground hover:text-live-foreground"
              disabled={busy}
              type="button"
              variant="ghost"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 />
              <span className="max-sm:sr-only">Eliminar</span>
            </Button>
          ) : undefined
        }
        description={
          task ? "Los cambios llegan al instante a los teléfonos del staff." : "Sumala al cronograma del staff."
        }
        icon={ClipboardList}
        open={open}
        title={task ? `Editar «${task.title}»` : "Nueva tarea"}
        onOpenChange={onOpenChange}
      >
        <form className="space-y-7" id="staff-task-form" noValidate onSubmit={submit}>
          <PanelSection title="Tarea">
            <div className="space-y-2">
              <Label htmlFor="task-title">Qué hay que hacer</Label>
              <Input
                aria-invalid={Boolean(errors.title)}
                data-autofocus
                id="task-title"
                placeholder="Acreditación · turno 1"
                {...register("title")}
              />
              <FieldError message={errors.title?.message} />
            </div>
            <Controller
              control={control}
              name="type"
              render={({ field }) => (
                <div className="space-y-2">
                  <Label id="task-type-label">Tipo</Label>
                  <div
                    aria-labelledby="task-type-label"
                    className="flex w-fit rounded-lg border border-input bg-background p-0.5"
                    role="radiogroup"
                  >
                    {TYPES.map((option) => (
                      <button
                        key={option.value}
                        aria-checked={field.value === option.value}
                        className={cn(
                          "h-7 rounded-md px-3 text-meta font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:outline-hidden pointer-coarse:h-10",
                          field.value === option.value &&
                            "bg-raised text-foreground shadow-[inset_0_0_0_1px_hsl(var(--input)),0_1px_2px_rgb(0_0_0/0.5)]"
                        )}
                        role="radio"
                        type="button"
                        onClick={() => field.onChange(option.value)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-meta text-muted-foreground">
                    {TYPES.find((option) => option.value === field.value)?.hint}
                  </p>
                </div>
              )}
            />
          </PanelSection>

          <PanelSection title="Cuándo">
            <div className="space-y-2">
              <Label htmlFor="task-day">Día</Label>
              <Controller
                control={control}
                name="dayDate"
                render={({ field }) => (
                  <DatePicker
                    dateFormat="EEEE d 'de' MMMM"
                    id="task-day"
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
              <FieldError message={errors.dayDate?.message} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="task-start">{milestone ? "Hora" : "Empieza"}</Label>
                <Input
                  aria-invalid={Boolean(errors.startTime)}
                  className="font-terminal tabular-nums [&::-webkit-calendar-picker-indicator]:invert"
                  id="task-start"
                  type="time"
                  {...register("startTime")}
                />
                <FieldError message={errors.startTime?.message} />
              </div>
              {milestone ? null : (
                <div className="space-y-2">
                  <Label htmlFor="task-end">Termina</Label>
                  <Input
                    aria-invalid={Boolean(errors.endTime)}
                    className="font-terminal tabular-nums [&::-webkit-calendar-picker-indicator]:invert"
                    id="task-end"
                    type="time"
                    {...register("endTime")}
                  />
                  <FieldError message={errors.endTime?.message} />
                </div>
              )}
            </div>
            <p className="text-meta text-muted-foreground">
              Sin hora queda al final del día. Sin fin, se calcula de 45 minutos.
            </p>
          </PanelSection>

          <PanelSection title={milestone ? "Dónde" : "Dónde y quiénes"}>
            <div className={cn("grid gap-4", !milestone && "grid-cols-[1fr_8rem]")}>
              <div className="space-y-2">
                <Label htmlFor="task-location">Lugar</Label>
                <Input id="task-location" placeholder="Entrada, Cueva, Patio…" {...register("location")} />
                <FieldError message={errors.location?.message} />
              </div>
              {milestone ? null : (
                <div className="space-y-2">
                  <Label htmlFor="task-min">Mínimo</Label>
                  <Input
                    aria-invalid={Boolean(errors.minPeople)}
                    className="font-terminal tabular-nums"
                    id="task-min"
                    inputMode="numeric"
                    placeholder="—"
                    {...register("minPeople")}
                  />
                  <FieldError message={errors.minPeople?.message} />
                </div>
              )}
            </div>
            {milestone ? null : (
              <Controller
                control={control}
                name="assigneeIds"
                render={({ field }) => {
                  const toggle = (userId: string) =>
                    field.onChange(
                      field.value.includes(userId)
                        ? field.value.filter((id) => id !== userId)
                        : [...field.value, userId]
                    );
                  return (
                    <div className="space-y-2">
                      <Label>Personas</Label>
                      <RosterPicker free={free} roster={roster} selected={field.value} onToggle={toggle}>
                        <Button className="w-full justify-between font-normal" type="button" variant="outline">
                          {chosen.length > 0
                            ? `${chosen.length} ${chosen.length === 1 ? "persona" : "personas"}`
                            : "Elegir del staff"}
                          <ChevronsUpDown className="text-muted-foreground" />
                        </Button>
                      </RosterPicker>
                      {chosen.length > 0 ? (
                        <ul className="flex flex-wrap gap-1.5">
                          {chosen.map((member) => (
                            <li
                              key={member.userId}
                              className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-raised pr-1 pl-0.5 text-meta text-subtle"
                            >
                              <PersonAvatar image={member.image} name={member.name} size={22} />
                              {member.name}
                              <Button
                                aria-label={`Sacar a ${member.name}`}
                                className="size-5 rounded-full"
                                size="icon-xs"
                                type="button"
                                variant="ghost"
                                onClick={() => toggle(member.userId)}
                              >
                                <X />
                              </Button>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  );
                }}
              />
            )}
          </PanelSection>

          <PanelSection title="Instrucciones">
            <Textarea
              aria-label="Instrucciones"
              className="resize-none"
              placeholder="Lo que tiene que saber quien la agarre…"
              rows={3}
              {...register("notes")}
            />
            <FieldError message={errors.notes?.message} />
          </PanelSection>

          <Notice show={Boolean(errors.root)} tone="danger">
            {errors.root?.message}
          </Notice>
        </form>
      </EditorPanel>

      <ConfirmDialog
        confirmLabel="Eliminar tarea"
        description="Sale del cronograma y de los teléfonos del staff. No se puede deshacer."
        open={confirmDelete}
        pending={remove.isPending}
        title={`¿Eliminar «${task?.title ?? ""}»?`}
        onConfirm={() => task && remove.mutate({ eventId, taskId: task.id })}
        onOpenChange={setConfirmDelete}
      />
    </>
  );
}
