"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Check, Megaphone, Send, Siren } from "lucide-react";

import { useSession } from "app/lib/auth-client";
import { cn } from "app/lib/utils";
import { AnnouncementActions } from "components/Admin/tareas/AnnouncementEditor";
import { Meter, Panel, PanelHead } from "components/Admin/ui/page";
import { AvatarStack, PersonAvatar } from "components/Admin/ui/person";
import { EmptyState, ErrorState } from "components/Admin/ui/states";
import { SwipeRow } from "components/Admin/ui/swipe";
import { RelativeTime } from "components/Admin/ui/time";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Kbd } from "components/shared/ui/kbd";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "components/shared/ui/select";
import { Skeleton } from "components/shared/ui/skeleton";
import { Switch } from "components/shared/ui/switch";
import { Textarea } from "components/shared/ui/textarea";
import { toast } from "components/shared/ui/toast-utils";
import { orpc } from "lib/orpc";
import type { Channels } from "lib/orpc/comms/schemas";
import type { StaffAnnouncement } from "lib/orpc/staff-tasks/schemas";

const BODY_MAX = 2000;

function Composer({ eventId, focus }: { eventId: string; focus: boolean }) {
  const queryClient = useQueryClient();
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [body, setBody] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [audience, setAudience] = useState("all");
  const tasks = useQuery(orpc.staffTasks.list.queryOptions({ input: { eventId }, staleTime: 60_000 }));
  const withPeople = (tasks.data ?? []).filter((task) => task.type !== "milestone" && task.assignees.length > 0);

  useEffect(() => {
    if (focus) textarea.current?.focus();
  }, [focus]);

  const create = useMutation(
    orpc.staffTasks.announcements.create.mutationOptions({
      onSuccess: (_data, sent) => {
        setBody("");
        setUrgent(false);
        setAudience("all");
        toast.success(
          "Anuncio enviado",
          sent.urgent ? "Le aparece a cada uno hasta que lo marque como recibido." : undefined
        );
        void queryClient.invalidateQueries({
          queryKey: orpc.staffTasks.announcements.list.key({ input: { eventId } }),
        });
      },
      onError: (error) => toast.error("No se pudo enviar", error.message),
    })
  );

  const text = body.trim();
  const submit = () => {
    if (!text || create.isPending) return;
    create.mutate(
      audience === "all"
        ? { eventId, body: text, urgent, audience: "all" }
        : { eventId, body: text, urgent, audience: "task", taskId: audience }
    );
  };

  return (
    <Panel className="lg:sticky lg:top-4">
      <PanelHead icon={Megaphone} meta="llega al admin de cada uno" title="Nuevo anuncio" />
      <div className="space-y-3 p-3.5">
        <div>
          <label className="sr-only" htmlFor="announcement-body">
            Anuncio para el staff
          </label>
          <Textarea
            ref={textarea}
            className="min-h-24 resize-none"
            id="announcement-body"
            maxLength={BODY_MAX}
            placeholder="Escribí un aviso para el staff…"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                submit();
              }
            }}
          />
          <p className="mt-1 text-right font-terminal text-2xs text-muted-foreground tabular-nums">
            {body.length} / {BODY_MAX}
          </p>
        </div>
        <div className="space-y-1.5">
          <label className="text-meta text-muted-foreground" htmlFor="announcement-audience">
            Para
          </label>
          <Select value={audience} onValueChange={setAudience}>
            <SelectTrigger id="announcement-audience">
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
        <label
          className={cn(
            "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 transition-colors",
            urgent ? "border-live/30 bg-live-surface/50" : "border-border hover:bg-white/[0.02]"
          )}
          htmlFor="announcement-urgent"
        >
          <Siren
            aria-hidden
            className={cn("size-4 shrink-0", urgent ? "text-live-foreground" : "text-muted-foreground")}
          />
          <span className="min-w-0 flex-1">
            <span className="block text-ui font-medium text-foreground">Urgente</span>
            <span className="block text-meta text-muted-foreground">
              Queda arriba en todas las pantallas hasta el «Recibido».
            </span>
          </span>
          <Switch checked={urgent} id="announcement-urgent" onCheckedChange={setUrgent} />
        </label>
        <Button className="w-full" disabled={!text || create.isPending} onClick={submit}>
          <Send />
          {create.isPending ? "Enviando…" : "Enviar al staff"}
          <Kbd className="ml-auto max-sm:hidden">⌘↵</Kbd>
        </Button>
      </div>
    </Panel>
  );
}

function AnnouncementCard({
  announcement,
  eventId,
  staffDm,
  mine,
  onAck,
}: {
  announcement: StaffAnnouncement;
  eventId: string;
  staffDm: boolean;
  /** It's waiting for my «Recibido». */
  mine: boolean;
  onAck: () => void;
}) {
  const total = announcement.ackCount + announcement.pending.length;
  const done = announcement.pending.length === 0;
  const remind = useMutation(
    orpc.comms.remind.mutationOptions({
      onSuccess: ({ sent, withoutSlack }) =>
        toast.success(
          `Owy le escribió a ${sent} ${sent === 1 ? "persona" : "personas"}`,
          withoutSlack ? `${withoutSlack} no tienen Slack vinculado: avisales en persona.` : undefined
        ),
      onError: (error) => toast.error("No se pudo reenviar", error.message),
    })
  );

  return (
    // On a touchscreen, sliding it right is the same «Recibido» as the button.
    <SwipeRow right={mine ? { label: "Recibido", icon: Check, tone: "ok", run: onAck } : null}>
      <article
        className={cn(
          "rounded-lg border p-3.5 shadow-edge",
          // Opaque, so what the swipe uncovers doesn't show through the card.
          announcement.urgent && !done
            ? "border-live/30 bg-card bg-gradient-to-b from-live-surface/40 to-live-surface/40"
            : "border-border bg-card"
        )}
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Badge variant={announcement.urgent ? "destructive" : "secondary"}>
            {announcement.urgent ? "urgente" : "aviso"}
          </Badge>
          {announcement.taskTitle ? (
            <span className="truncate text-meta text-muted-foreground">Para: {announcement.taskTitle}</span>
          ) : null}
          <span className="ml-auto flex items-center gap-1.5 text-meta text-muted-foreground">
            <PersonAvatar image={announcement.author?.image} name={announcement.author?.name ?? "Staff"} size={16} />
            {announcement.author?.name ?? "Staff"} · <RelativeTime date={announcement.createdAt} />
            {announcement.editedAt ? " · editado" : null}
          </span>
          <AnnouncementActions announcement={announcement} eventId={eventId} />
        </div>
        <p className="mt-2 text-ui whitespace-pre-line text-foreground">{announcement.body}</p>
        <div className="mt-3 flex items-center gap-2.5">
          <Meter
            className="flex-1"
            label="Recibido"
            max={Math.max(total, 1)}
            tone={done ? "success" : announcement.urgent ? "warning" : "info"}
            value={done ? Math.max(total, 1) : announcement.ackCount}
          />
          <span className={cn("font-terminal text-2xs tabular-nums", done ? "text-success-foreground" : "text-subtle")}>
            {announcement.ackCount}/{total}
          </span>
        </div>
        {done ? (
          <p className="mt-2 text-meta text-success-foreground">
            {total > 0 ? "Lo vieron todos" : "No hay a quién avisarle"}
          </p>
        ) : (
          <div className="mt-2.5 flex flex-wrap items-center gap-2 text-meta text-muted-foreground">
            <span>Faltan</span>
            <AvatarStack
              details="Faltan"
              max={6}
              people={announcement.pending.map((person) => ({
                id: person.userId,
                name: person.name,
                image: person.image,
              }))}
              size={20}
            />
            <span className="ml-auto flex flex-wrap justify-end gap-2">
              {mine ? (
                <Button size="xs" variant="outline" onClick={onAck}>
                  <Check />
                  Recibido
                </Button>
              ) : null}
              <Button
                disabled={!staffDm || remind.isPending}
                size="xs"
                title={staffDm ? "Owy les escribe por Slack a los que faltan" : undefined}
                variant="outline"
                onClick={() => remind.mutate({ eventId, announcementId: announcement.id })}
              >
                <Bot />
                {remind.isPending ? "Reenviando…" : "Reenviar por Owy"}
              </Button>
            </span>
          </div>
        )}
      </article>
    </SwipeRow>
  );
}

/** Staff announcements: write one, and see who still has to read each. */
export function StaffAnnouncements({
  eventId,
  focusComposer,
  channels,
}: {
  eventId: string;
  focusComposer: boolean;
  channels: Channels | undefined;
}) {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const meId = session?.user.id;
  const announcements = useQuery(
    orpc.staffTasks.announcements.list.queryOptions({ input: { eventId }, staleTime: 30_000 })
  );
  const listKey = orpc.staffTasks.announcements.list.queryKey({ input: { eventId } });
  // The same «Recibido» as the urgent banner's (one cache), shown at once and put back if it fails.
  const ack = useMutation(
    orpc.staffTasks.announcements.ack.mutationOptions({
      onMutate: async ({ announcementId }) => {
        await queryClient.cancelQueries({ queryKey: listKey });
        const before = queryClient.getQueryData<StaffAnnouncement[]>(listKey);
        queryClient.setQueryData<StaffAnnouncement[]>(listKey, (old) =>
          old?.map((item) =>
            item.id === announcementId
              ? {
                  ...item,
                  ackedByMe: true,
                  ackCount: item.ackCount + 1,
                  pending: item.pending.filter((person) => person.userId !== meId),
                }
              : item
          )
        );
        return { before };
      },
      onError: (error, _input, context) => {
        if (context?.before) queryClient.setQueryData(listKey, context.before);
        toast.error("No se pudo confirmar", error.message);
      },
      onSettled: () => queryClient.invalidateQueries({ queryKey: listKey }),
    })
  );
  const list = announcements.data ?? [];
  const waitingForMe = (announcement: StaffAnnouncement) =>
    Boolean(meId) && !announcement.ackedByMe && announcement.pending.some((person) => person.userId === meId);
  const waiting = list.filter((announcement) => announcement.pending.length > 0).length;
  const staffDm = channels?.staffDm ?? false;

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
      <Composer eventId={eventId} focus={focusComposer} />
      <section aria-label="Anuncios enviados" className="min-w-0 space-y-3">
        <div className="flex h-7 items-center gap-2 px-0.5">
          <h2 className="text-ui font-semibold text-foreground">Enviados</h2>
          {announcements.isSuccess ? (
            <span className="font-terminal text-meta text-muted-foreground tabular-nums">
              {list.length} · {waiting === 0 ? "todos leídos" : `${waiting} esperan «Recibido»`}
            </span>
          ) : null}
        </div>
        {/* Why «Reenviar por Owy» is off, said once and on screen: touchscreens have no hover for a tooltip. */}
        {channels && !staffDm && waiting > 0 ? (
          <p className="px-0.5 text-meta text-muted-foreground">
            «Reenviar por Owy» necesita el Slack de Owy (
            <span className="font-terminal text-2xs">OWY_SLACK_BOT_TOKEN</span>): mientras, avisales en persona.
          </p>
        ) : null}
        {announcements.isPending ? (
          Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-32 rounded-lg" />)
        ) : announcements.isError ? (
          <ErrorState onRetry={() => void announcements.refetch()} retrying={announcements.isFetching} />
        ) : list.length === 0 ? (
          <EmptyState
            description="Lo que le mandes al staff aparece acá, con quién lo vio y quién no."
            icon={Megaphone}
            title="Todavía no hay anuncios"
          />
        ) : (
          list.map((announcement) => (
            <AnnouncementCard
              key={announcement.id}
              announcement={announcement}
              eventId={eventId}
              mine={waitingForMe(announcement)}
              staffDm={staffDm}
              onAck={() => ack.mutate({ eventId, announcementId: announcement.id })}
            />
          ))
        )}
      </section>
    </div>
  );
}
