"use client";

import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";

import { cn } from "app/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "components/shared/ui/avatar";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "components/shared/ui/command";
import { DatePicker } from "components/shared/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "components/shared/ui/dialog";
import { Input } from "components/shared/ui/input";
import { Label } from "components/shared/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "components/shared/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "components/shared/ui/select";
import { Textarea } from "components/shared/ui/textarea";

import { TYPE_META, initials, type RosterMember, type StaffTask, type StaffTaskType } from "./helpers";

export interface TaskFormValues {
  title: string;
  type: StaffTaskType;
  dayDate: string;
  startTime: string | null;
  endTime: string | null;
  minPeople: number | null;
  location: string | null;
  notes: string | null;
  assigneeIds: string[];
}

interface TaskFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = create */
  task: StaffTask | null;
  defaultDay: string;
  roster: RosterMember[];
  isSaving: boolean;
  onSave: (values: TaskFormValues) => Promise<void>;
}

export function TaskFormDialog({
  open,
  onOpenChange,
  task,
  defaultDay,
  roster,
  isSaving,
  onSave,
}: TaskFormDialogProps) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<StaffTaskType>("task");
  const [dayDate, setDayDate] = useState(defaultDay);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [minPeople, setMinPeople] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(task?.title ?? "");
    setType(task?.type ?? "task");
    setDayDate(task?.dayDate ?? defaultDay);
    setStartTime(task?.startTime ?? "");
    setEndTime(task?.endTime ?? "");
    setMinPeople(task?.minPeople != null ? String(task.minPeople) : "");
    setLocation(task?.location ?? "");
    setNotes(task?.notes ?? "");
    setAssigneeIds(task?.assignees.map((assignee) => assignee.userId) ?? []);
  }, [open, task, defaultDay]);

  const selectedMembers = useMemo(
    () => roster.filter((member) => assigneeIds.includes(member.userId)),
    [roster, assigneeIds]
  );

  const toggleAssignee = (userId: string) => {
    setAssigneeIds((current) =>
      current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    await onSave({
      title: title.trim(),
      type,
      dayDate,
      startTime: startTime || null,
      endTime: endTime || null,
      minPeople: minPeople ? Number(minPeople) : null,
      location: location.trim() || null,
      notes: notes.trim() || null,
      assigneeIds,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isSaving && onOpenChange(isOpen)}>
      <DialogContent className="flex max-h-[85dvh] flex-col gap-0 p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle>{task ? "Editar tarea" : "Nueva tarea"}</DialogTitle>
          <DialogDescription>
            {task ? "Actualizá la tarea del cronograma." : "Sumá una tarea al cronograma del staff."}
          </DialogDescription>
        </DialogHeader>

        <form className="flex min-h-0 flex-1 flex-col" id="staff-task-form" onSubmit={handleSubmit}>
          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
            <div className="space-y-2">
              <Label htmlFor="task-title">Título</Label>
              <Input
                autoFocus
                id="task-title"
                placeholder="¿Qué hay que hacer?"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={type} onValueChange={(value) => setType(value as StaffTaskType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="task">{TYPE_META.task.label}</SelectItem>
                    <SelectItem value="ongoing">{TYPE_META.ongoing.label} (todo el día)</SelectItem>
                    <SelectItem value="milestone">{TYPE_META.milestone.label} (hito)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Día</Label>
                <DatePicker dateFormat="d MMM yyyy" value={dayDate} onChange={setDayDate} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="task-start">Inicio (opcional)</Label>
                <Input
                  className="font-terminal tabular-nums [&::-webkit-calendar-picker-indicator]:invert"
                  id="task-start"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="task-end">Fin (opcional)</Label>
                <Input
                  className="font-terminal tabular-nums [&::-webkit-calendar-picker-indicator]:invert"
                  id="task-end"
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </div>
            </div>

            {type !== "milestone" && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="task-min">Mín. personas</Label>
                    <Input
                      id="task-min"
                      min={1}
                      placeholder="—"
                      type="number"
                      value={minPeople}
                      onChange={(e) => setMinPeople(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="task-location">Lugar</Label>
                    <Input
                      id="task-location"
                      placeholder="Entrada, Escalera…"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Asignados</Label>
                  <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                    <PopoverTrigger asChild>
                      <Button className="w-full justify-between font-normal" type="button" variant="outline">
                        {selectedMembers.length > 0
                          ? `${selectedMembers.length} persona${selectedMembers.length > 1 ? "s" : ""}`
                          : "Elegir del roster"}
                        <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-(--radix-popover-trigger-width) p-0">
                      <Command>
                        <CommandInput placeholder="Buscar por nombre…" />
                        <CommandList>
                          <CommandEmpty>Sin resultados.</CommandEmpty>
                          <CommandGroup>
                            {roster.map((member) => {
                              const selected = assigneeIds.includes(member.userId);
                              return (
                                <CommandItem
                                  key={member.userId}
                                  value={member.name}
                                  onSelect={() => toggleAssignee(member.userId)}
                                >
                                  <Avatar className="mr-2 h-5 w-5">
                                    {member.image ? <AvatarImage alt={member.name} src={member.image} /> : null}
                                    <AvatarFallback className="text-[8px]">{initials(member.name)}</AvatarFallback>
                                  </Avatar>
                                  <span className="flex-1 truncate">{member.name}</span>
                                  <Check className={cn("h-4 w-4", selected ? "opacity-100" : "opacity-0")} />
                                </CommandItem>
                              );
                            })}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  {selectedMembers.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {selectedMembers.map((member) => (
                        <Badge key={member.userId} className="gap-1 font-normal" variant="secondary">
                          {member.name}
                          <button
                            aria-label={`Quitar a ${member.name}`}
                            type="button"
                            onClick={() => toggleAssignee(member.userId)}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="task-notes">Notas / instrucciones</Label>
              <Textarea
                className="resize-none"
                id="task-notes"
                placeholder="Instrucciones para quien la agarre…"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter className="border-t border-border px-6 py-4">
            <Button disabled={isSaving} type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button disabled={isSaving || !title.trim()} form="staff-task-form" type="submit">
              {isSaving ? "Guardando…" : task ? "Guardar cambios" : "Crear tarea"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
