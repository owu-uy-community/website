"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Bot, Check, ChevronDown, Megaphone, Send, Siren } from "lucide-react";

import { cn } from "app/lib/utils";
import { Notice } from "components/Admin/panel";
import { Meter, Panel } from "components/Admin/ui/page";
import { AvatarStack, PersonAvatar } from "components/Admin/ui/person";
import { EmptyState } from "components/Admin/ui/states";
import { SwipeRow } from "components/Admin/ui/swipe";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "components/shared/ui/select";
import { useIsMobile } from "components/shared/ui/sidebar";
import { Textarea } from "components/shared/ui/textarea";
import { toast } from "components/shared/ui/toast-utils";
import { orpc } from "lib/orpc";
import type { RemindResultSchema } from "lib/orpc/staff-tasks/schemas";
import { wallClock } from "lib/slot-day";
import type * as z from "zod";

import { firstName, formatDayLabel, plural, type StaffAnnouncement, type StaffTask } from "./helpers";
import { staffKeys, useAck, type Me } from "./use-staff";

type RemindResult = z.infer<typeof RemindResultSchema>;

/** A new announcement for the whole staff or one task's people; urgent ones stay on every screen until read. */
export function AnnouncementComposer({ eventId, tasks }: { eventId: string; tasks: StaffTask[] }) {
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [audience, setAudience] = useState("all");
  const taskOptions = tasks.filter((task) => task.type !== "milestone" && task.assignees.length > 0);
  const create = useMutation(
    orpc.staffTasks.announcements.create.mutationOptions({
      onSuccess: (_created, sent) => {
        setBody("");
        setUrgent(false);
        setAudience("all");
        toast.success(sent.urgent ? "Aviso urgente enviado" : "Aviso enviado", "Ya lo ven en sus pantallas.");
        void queryClient.invalidateQueries({ queryKey: staffKeys(eventId).announcements });
      },
      onError: (error) => toast.error("No se pudo enviar el aviso", error.message),
    })
  );
  const text = body.trim();
  const send = () => {
    if (!text || create.isPending) return;
    create.mutate({
      eventId,
      body: text,
      urgent,
      audience: audience === "all" ? "all" : "task",
      taskId: audience === "all" ? undefined : audience,
    });
  };

  return (
    <Panel className="p-3">
      <div className="flex items-baseline gap-2">
        <h2 className="text-ui font-semibold text-foreground">Nuevo anuncio</h2>
        <span className="ml-auto text-2xs text-muted-foreground">llega al instante al staff</span>
      </div>
      <Textarea
        aria-label="Anuncio para el staff"
        className="mt-2.5 min-h-16 resize-none"
        placeholder="Escribí un aviso para el staff…"
        rows={2}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) send();
        }}
      />
      <div className="mt-2 flex items-center gap-1.5">
        <Select value={audience} onValueChange={setAudience}>
          <SelectTrigger aria-label="Para quién" className="h-7 w-auto min-w-0 flex-1 px-2 text-meta">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todo el staff</SelectItem>
            {taskOptions.map((task) => (
              <SelectItem key={task.id} value={task.id}>
                {task.startTime ? `${task.startTime} · ` : ""}
                {task.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          aria-pressed={urgent}
          size="sm"
          variant={urgent ? "destructive" : "outline"}
          onClick={() => setUrgent((value) => !value)}
        >
          <Siren />
          Urgente
        </Button>
        <Button disabled={!text || create.isPending} size="sm" variant={text ? "default" : "outline"} onClick={send}>
          <Send />
          {create.isPending ? "Enviando…" : "Enviar"}
        </Button>
      </div>
      {urgent ? (
        <p className="mt-2 text-meta text-live-foreground">
          Queda arriba de todas las pantallas del staff hasta que lo marquen recibido.
        </p>
      ) : null}
    </Panel>
  );
}

/** "16:38", or "vie 6 nov 16:38" for another day, on the event's clock. */
const whenSent = (iso: string, timeZone: string, today: string) => {
  const clock = wallClock(new Date(iso), timeZone);
  return clock.slice(0, 10) === today ? clock.slice(11) : `${formatDayLabel(clock.slice(0, 10))} ${clock.slice(11)}`;
};

function RemindNotice({ result, error }: { result: RemindResult | null; error: string | null }) {
  if (error) return <Notice tone="danger">{error}</Notice>;
  if (!result) return null;
  if (result.sent.length === 0 && result.failed.length === 0)
    return <Notice tone="info">Ya lo recibieron todos.</Notice>;
  const failed = result.failed
    .map((person) => `${firstName(person.name)} (${person.reason.charAt(0).toLowerCase()}${person.reason.slice(1)})`)
    .join(", ");

  return (
    <Notice tone={result.failed.length > 0 ? "warning" : "info"}>
      {result.sent.length > 0
        ? `Owy le escribió por Slack a ${plural(result.sent.length, "persona", "personas")}.`
        : "Owy no le pudo escribir a nadie."}
      {result.failed.length > 0 ? ` No pudo con: ${failed}.` : null}
    </Notice>
  );
}

/** One announcement: who read it (the bar), who didn't (the faces) and, for editors, a nudge through Owy. */
export function AnnouncementCard({
  announcement,
  eventId,
  me,
  canEdit,
  timeZone,
  today,
  wide = false,
}: {
  announcement: StaffAnnouncement;
  eventId: string;
  me: Me;
  canEdit: boolean;
  timeZone: string;
  today: string;
  /** Full width (the Anuncios tab): who read it is shown from the start. */
  wide?: boolean;
}) {
  const isMobile = useIsMobile();
  // Wide, who read it shows from the start; on a phone it would make every card a long list.
  const [toggled, setOpen] = useState<boolean | null>(null);
  const open = toggled ?? (wide && !isMobile);
  const [result, setResult] = useState<RemindResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ack = useAck(eventId, me);
  const remind = useMutation(
    orpc.staffTasks.announcements.remind.mutationOptions({
      onMutate: () => {
        setResult(null);
        setError(null);
      },
      onSuccess: setResult,
      onError: (failure) => setError(failure.message || "No se pudo hablar con Owy."),
    })
  );
  const { acks, pending, urgent } = announcement;
  const total = acks.length + pending.length;
  const complete = total > 0 && pending.length === 0;
  const waitingForMe = pending.some((person) => person.userId === me.id);

  const received = () => ack.mutate({ eventId, announcementId: announcement.id });

  const card = (
    <article
      className={cn(
        "rounded-lg border p-3",
        // Solid: a swiped card slides over what the swipe does.
        urgent && !complete
          ? "border-live/30 bg-[color-mix(in_srgb,hsl(var(--live-surface))_40%,hsl(var(--background)))]"
          : "border-border bg-card shadow-edge"
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Badge variant={urgent ? "destructive" : "secondary"}>{urgent ? "urgente" : "aviso"}</Badge>
        <span className="truncate font-terminal text-2xs text-muted-foreground tabular-nums">
          {announcement.author ? firstName(announcement.author.name) : "Staff"} ·{" "}
          {whenSent(announcement.createdAt, timeZone, today)}
        </span>
      </div>
      <p className="mt-1.5 text-ui leading-snug whitespace-pre-line text-foreground">{announcement.body}</p>
      {announcement.taskTitle ? (
        <p className="mt-1 text-meta text-muted-foreground">Para quienes están en «{announcement.taskTitle}»</p>
      ) : null}

      {total > 0 ? (
        <button
          aria-expanded={open}
          className="mt-2.5 flex w-full items-center gap-2 rounded-sm focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:outline-hidden"
          type="button"
          onClick={() => setOpen(!open)}
        >
          <Meter
            className="flex-1"
            label="Recibieron"
            max={total}
            tone={complete ? "success" : "primary"}
            value={acks.length}
          />
          <span
            className={cn("font-terminal text-2xs tabular-nums", complete ? "text-success-foreground" : "text-subtle")}
          >
            {acks.length}/{total}
          </span>
          <ChevronDown
            aria-hidden
            className={cn("size-3.5 text-muted-foreground transition-transform", open && "rotate-180")}
          />
          <span className="sr-only">Ver quiénes</span>
        </button>
      ) : null}

      {pending.length > 0 ? (
        <div className="mt-2 flex items-center gap-2 text-meta text-muted-foreground">
          <span>Faltan</span>
          <AvatarStack
            max={3}
            people={pending.map((person) => ({ id: person.userId, name: person.name, image: person.image }))}
            size={20}
          />
          {canEdit ? (
            <Button
              className="ml-auto"
              disabled={remind.isPending}
              size="xs"
              variant="outline"
              onClick={() => remind.mutate({ eventId, announcementId: announcement.id })}
            >
              <Bot />
              {remind.isPending ? "Reenviando…" : "Reenviar por Owy"}
            </Button>
          ) : null}
        </div>
      ) : null}

      {open ? (
        <div
          className={cn(
            "mt-2.5 grid gap-3 rounded-md border border-border bg-background/60 p-2.5 sm:grid-cols-2",
            wide && "lg:grid-cols-[2fr_1fr]"
          )}
        >
          {/* Who is missing first: that's the half that matters while the event runs. */}
          {[
            { title: `Faltan · ${pending.length}`, people: pending },
            { title: `Recibieron · ${acks.length}`, people: acks },
          ].map((group) => (
            <div key={group.title}>
              <p className="font-terminal text-[10.5px] tracking-[0.14em] text-muted-foreground uppercase">
                {group.title}
              </p>
              {group.people.length === 0 ? (
                <p className="mt-1 text-meta text-muted-foreground">Nadie.</p>
              ) : (
                <ul
                  className={cn(
                    "mt-1 space-y-1",
                    wide && "sm:grid sm:grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] sm:space-y-0 sm:gap-x-3"
                  )}
                >
                  {group.people.map((person) => (
                    <li key={person.userId} className="flex items-center gap-1.5 text-meta text-subtle">
                      <PersonAvatar image={person.image} name={person.name} size={18} />
                      <span className="truncate">{person.name}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      ) : null}

      {waitingForMe ? (
        <Button
          className={cn("mt-2.5", wide ? "max-sm:w-full" : "w-full")}
          disabled={ack.isPending}
          size="sm"
          variant="outline"
          onClick={received}
        >
          <Check />
          Recibido
        </Button>
      ) : null}

      {result || error ? (
        <div className="mt-2.5">
          <RemindNotice error={error} result={result} />
        </div>
      ) : null}
    </article>
  );

  // A finger slides it right for «Recibido», the same as its button. Once read it stays a plain card, so a
  // sideways swipe over it still moves between tabs.
  return waitingForMe ? (
    <SwipeRow className="rounded-lg" right={{ label: "Recibido", icon: Check, tone: "ok", run: received }}>
      {card}
    </SwipeRow>
  ) : (
    card
  );
}

/** The day's announcements, newest first. */
export function AnnouncementList({
  announcements,
  ...card
}: {
  announcements: StaffAnnouncement[];
  eventId: string;
  me: Me;
  canEdit: boolean;
  timeZone: string;
  today: string;
  wide?: boolean;
}) {
  if (announcements.length === 0) {
    return (
      <EmptyState
        compact
        description="Los avisos al staff aparecen acá, con quién los leyó."
        icon={Megaphone}
        title="Sin anuncios todavía"
      />
    );
  }

  return (
    <ul className="space-y-3">
      {announcements.map((announcement) => (
        <li key={announcement.id}>
          <AnnouncementCard announcement={announcement} {...card} />
        </li>
      ))}
    </ul>
  );
}
