"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Megaphone, MoreHorizontal, Pencil, RotateCcw, Siren, Trash2 } from "lucide-react";

import { ConfirmDialog, EditorPanel, PanelSection, SwitchRow } from "components/Admin/panel";
import { Button } from "components/shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "components/shared/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "components/shared/ui/select";
import { Textarea } from "components/shared/ui/textarea";
import { toast } from "components/shared/ui/toast-utils";
import { orpc } from "lib/orpc";
import type { StaffAnnouncement } from "lib/orpc/staff-tasks/schemas";

const BODY_MAX = 2000;

function AnnouncementForm({
  announcement,
  eventId,
  open,
  onOpenChange,
  onDelete,
}: {
  announcement: StaffAnnouncement;
  eventId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: () => void;
}) {
  const queryClient = useQueryClient();
  const [body, setBody] = useState(announcement.body);
  const [urgent, setUrgent] = useState(announcement.urgent);
  const [audience, setAudience] = useState(announcement.audience === "task" ? (announcement.taskId ?? "all") : "all");
  const [reread, setReread] = useState(false);
  const tasks = useQuery(orpc.staffTasks.list.queryOptions({ input: { eventId }, staleTime: 60_000 }));
  // Its own task stays on the list even if nobody is on it anymore.
  const withPeople = (tasks.data ?? []).filter(
    (task) => task.id === announcement.taskId || (task.type !== "milestone" && task.assignees.length > 0)
  );

  const update = useMutation(
    orpc.staffTasks.announcements.update.mutationOptions({
      onSuccess: (_data, sent) => {
        onOpenChange(false);
        toast.success(
          "Anuncio editado",
          sent.reread ? "Les vuelve a aparecer a todos hasta que lo marquen como recibido." : undefined
        );
        void queryClient.invalidateQueries({
          queryKey: orpc.staffTasks.announcements.list.key({ input: { eventId } }),
        });
      },
      onError: (error) => toast.error("No se pudo guardar", error.message),
    })
  );

  const text = body.trim();
  const read = announcement.ackCount;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!text || update.isPending) return;
    const base = { eventId, announcementId: announcement.id, body: text, urgent, reread };
    update.mutate(audience === "all" ? { ...base, audience: "all" } : { ...base, audience: "task", taskId: audience });
  };

  return (
    <EditorPanel
      actions={
        <>
          <Button disabled={update.isPending} type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button disabled={!text || update.isPending} form="announcement-form" type="submit">
            {update.isPending ? "Guardando…" : "Guardar cambios"}
          </Button>
        </>
      }
      busy={update.isPending}
      danger={
        <Button
          className="text-live-foreground hover:bg-live-surface hover:text-live-foreground"
          disabled={update.isPending}
          type="button"
          variant="ghost"
          onClick={onDelete}
        >
          <Trash2 />
          <span className="max-sm:sr-only">Borrar</span>
        </Button>
      }
      description="Cambia para todos los que lo ven, en el admin y en el aviso urgente."
      icon={Megaphone}
      open={open}
      title="Editar anuncio"
      onOpenChange={onOpenChange}
    >
      <form className="space-y-7" id="announcement-form" noValidate onSubmit={submit}>
        <PanelSection title="Anuncio">
          <div>
            <label className="sr-only" htmlFor="announcement-edit-body">
              Texto del anuncio
            </label>
            <Textarea
              className="min-h-28 resize-none"
              data-autofocus
              id="announcement-edit-body"
              maxLength={BODY_MAX}
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
            <p className="mt-1 text-right font-terminal text-2xs text-muted-foreground tabular-nums">
              {body.length} / {BODY_MAX}
            </p>
          </div>
          <div className="space-y-1.5">
            <label className="text-meta text-muted-foreground" htmlFor="announcement-edit-audience">
              Para
            </label>
            <Select value={audience} onValueChange={setAudience}>
              <SelectTrigger id="announcement-edit-audience">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todo el staff</SelectItem>
                {withPeople.map((task) => (
                  <SelectItem key={task.id} value={task.id}>
                    {task.title} · {task.assignees.length} {task.assignees.length === 1 ? "persona" : "personas"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <SwitchRow
            checked={urgent}
            hint="Queda arriba en todas las pantallas hasta el «Recibido»."
            icon={Siren}
            id="announcement-edit-urgent"
            label="Urgente"
            onCheckedChange={setUrgent}
          />
        </PanelSection>
        {read > 0 ? (
          <PanelSection title="Quiénes lo leyeron">
            <SwitchRow
              checked={reread}
              hint={`${read} ya ${read === 1 ? "lo marcó" : "lo marcaron"} como recibido. Prendelo si el cambio importa (otro lugar, otra hora): les vuelve a aparecer. Para un error de tipeo, dejalo apagado.`}
              icon={RotateCcw}
              id="announcement-edit-reread"
              label="Pedir que lo vuelvan a leer"
              onCheckedChange={setReread}
            />
          </PanelSection>
        ) : null}
      </form>
    </EditorPanel>
  );
}

/**
 * ⋯ on an announcement: rewrite it (text, audience, urgency, and whether
 * everyone has to read it again) or delete it for everyone.
 */
export function AnnouncementActions({ announcement, eventId }: { announcement: StaffAnnouncement; eventId: string }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  /** Bumped on every open, so the form starts from the announcement as it is now. */
  const [session, setSession] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const remove = useMutation(
    orpc.staffTasks.announcements.delete.mutationOptions({
      onSuccess: () => {
        setConfirming(false);
        setEditing(false);
        toast.success("Anuncio borrado");
        void queryClient.invalidateQueries({
          queryKey: orpc.staffTasks.announcements.list.key({ input: { eventId } }),
        });
      },
      onError: (error) => toast.error("No se pudo borrar", error.message),
    })
  );

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label="Más acciones del anuncio"
            className="size-7 shrink-0 text-muted-foreground pointer-coarse:size-9"
            size="icon"
            variant="ghost"
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={() => {
              setSession((value) => value + 1);
              setEditing(true);
            }}
          >
            <Pencil />
            Editar
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive focus:text-destructive [&_svg]:text-destructive"
            onSelect={() => setConfirming(true)}
          >
            <Trash2 />
            Borrar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {/* Mounted from the first «Editar» on (not with every card), and kept so its close animates. */}
      {session > 0 ? (
        <AnnouncementForm
          key={session}
          announcement={announcement}
          eventId={eventId}
          open={editing}
          onDelete={() => setConfirming(true)}
          onOpenChange={setEditing}
        />
      ) : null}
      <ConfirmDialog
        confirmLabel="Borrar anuncio"
        description="Se borra para todo el staff, con quiénes lo leyeron. No se puede deshacer."
        open={confirming}
        pending={remove.isPending}
        pendingLabel="Borrando…"
        title="¿Borrar el anuncio?"
        onConfirm={() => remove.mutate({ eventId, announcementId: announcement.id })}
        onOpenChange={setConfirming}
      />
    </>
  );
}
