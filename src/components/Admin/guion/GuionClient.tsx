"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock3, ClockAlert, Download, ListVideo, Play, Plus, TimerReset, Undo2 } from "lucide-react";

import { useCommands } from "components/Admin/shell/commands";
import { useShortcuts } from "components/Admin/shell/shortcuts";
import { useShell } from "components/Admin/shell/use-shell-status";
import { PageContainer, PageHeader, Panel } from "components/Admin/ui/page";
import { EmptyState, ErrorState } from "components/Admin/ui/states";
import { useNow } from "components/Admin/ui/time";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Kbd } from "components/shared/ui/kbd";
import { Skeleton } from "components/shared/ui/skeleton";
import { toast } from "components/shared/ui/toast-utils";

import { useGo } from "./use-go";
import { useRealtimeChannel } from "hooks/useRealtimeChannel";
import { orpc } from "lib/orpc";
import type { Moment, RunOfShow } from "lib/orpc/run-of-show/schemas";
import { clockMinutes, projectDay, rundownStatus, signed } from "lib/orpc/run-of-show/timing";
import { eventChannel } from "lib/realtime/channels";
import { wallClock } from "lib/slot-day";

import { MomentEditor } from "./MomentEditor";
import { MomentTable } from "./MomentTable";
import { NowNext } from "./NowNext";
import { ShiftPanel } from "./ShiftPanel";

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/**
 * Enter and space are GO only where they wouldn't press something else: never in a field, on a
 * focused control, or inside a dialog, a menu or the palette.
 */
const KEEPS_KEYS =
  "input, textarea, select, button, a[href], [contenteditable], [role=button], [role=menuitem], [role=option], [role=checkbox], [role=switch], [role=tab], [role=slider], [role=dialog], [role=alertdialog], [role=menu], [role=listbox], [cmdk-root]";
const keysAreFree = (target: EventTarget | null) => !(target instanceof Element) || !target.closest(KEEPS_KEYS);

function DriftChip({ minutes }: { minutes: number }) {
  if (minutes > 0) {
    return (
      <Badge variant="warning">
        <ClockAlert aria-hidden />
        {signed(minutes)} min de atraso
      </Badge>
    );
  }

  return (
    <Badge variant={minutes < 0 ? "info" : "success"}>
      <Clock3 aria-hidden />
      {minutes < 0 ? `${-minutes} min adelantados` : "En hora"}
    </Badge>
  );
}

function GuionSkeleton() {
  return (
    <div aria-busy className="flex min-h-0 flex-col md:flex-1">
      <span className="sr-only">Cargando el guion…</span>
      <div className="grid gap-3 lg:grid-cols-[1.35fr_1fr]">
        <Skeleton className="h-[172px] rounded-lg" />
        <Skeleton className="h-[172px] rounded-lg" />
      </div>
      <Panel className="mt-4 md:flex-1">
        {Array.from({ length: 7 }, (_, index) => (
          <div key={index} className="flex h-14 items-center gap-4 border-b border-border px-4 last:border-0">
            <Skeleton className="h-4 w-10" />
            <Skeleton className="h-4 w-12 max-lg:hidden" />
            <Skeleton className="h-4 max-w-72 flex-1" />
            <Skeleton className="ml-auto h-5 w-16" />
          </div>
        ))}
      </Panel>
    </div>
  );
}

/**
 * Guion del día: the event's moments in order, what's on now with its clock, and GO for what's
 * next (also Enter / space, ⌘K and the Stream Deck). Every screen follows along over the ops
 * channel; each GO can be undone for a moment after.
 */
export function GuionClient({ eventId }: { eventId: string }) {
  const queryClient = useQueryClient();
  const { status: shell } = useShell();
  const listKey = orpc.runOfShow.list.queryKey({ input: { eventId } });
  const list = useQuery(orpc.runOfShow.list.queryOptions({ input: { eventId }, staleTime: 10_000 }));
  const refresh = () => queryClient.invalidateQueries({ queryKey: orpc.runOfShow.list.key({ input: { eventId } }) });
  useRealtimeChannel(eventChannel(eventId, "ops"), (topic) => {
    if (topic === "rundown") void refresh();
  });

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Moment | null>(null);
  const [shiftOpen, setShiftOpen] = useState(false);
  const edit = (moment: Moment | null) => {
    setEditing(moment);
    setEditorOpen(true);
  };

  const moments = list.data?.moments ?? [];
  const timezone = list.data?.timezone ?? shell?.event.timezone ?? "America/Montevideo";
  const { live, next, status } = rundownStatus(moments);
  const liveMoment = moments[live] ?? null;
  const nextMoment = moments[next] ?? null;
  const drift = liveMoment?.driftMin ?? 0;

  // Where the rest of the day lands, refreshed every 15 s: margins and overrun hints move by the minute.
  const now = useNow(15_000);
  const onDay = now > 0 && wallClock(new Date(now), timezone).slice(0, 10) === list.data?.day;
  const { nextFixed, overruns } = projectDay(
    moments,
    now > 0 && (onDay || liveMoment) ? clockMinutes(now, timezone) : null,
    liveMoment?.actualStart ? clockMinutes(liveMoment.actualStart, timezone) : null
  );

  const fail = (title: string) => (error: Error) => toast.error(title, error.message);
  const { go, undo } = useGo(eventId, refresh);
  const shift = useMutation(
    orpc.runOfShow.shift.mutationOptions({
      onSuccess: ({ moved, collisions }, { minutes }) => {
        setShiftOpen(false);
        const title = `Corrimos ${plural(moved, "momento", "momentos")} ${signed(minutes)} min`;
        if (moved === 0) toast.info("No había nada para correr");
        else if (collisions.length === 0) toast.success(title);
        else {
          toast.warning({
            title,
            description: collisions
              .map(
                (collision) =>
                  `«${collision.title}» se pasa ${collision.overMin} min de las ${collision.fixed.plannedStart}`
              )
              .join(" · "),
          });
        }
      },
      onError: fail("No se pudo correr el guion"),
      onSettled: refresh,
    })
  );
  const trim = useMutation(
    orpc.runOfShow.update.mutationOptions({
      onSuccess: (moment) => toast.success(`«${moment.title}» quedó en ${moment.durationMin} min`),
      onError: fail("No se pudo recortar"),
      onSettled: refresh,
    })
  );
  const importProgram = useMutation(
    orpc.runOfShow.importProgram.mutationOptions({
      onSuccess: (data) => {
        queryClient.setQueryData(listKey, data);
        toast.success(
          "Guion importado",
          `${plural(data.moments.length, "momento", "momentos")} del programa. Sumá lo que falte.`
        );
      },
      onError: fail("No se pudo importar"),
    })
  );
  const reorder = useMutation(
    orpc.runOfShow.reorder.mutationOptions({
      onMutate: async ({ orderedIds }) => {
        await queryClient.cancelQueries({ queryKey: listKey });
        const previous = queryClient.getQueryData<RunOfShow>(listKey);
        if (previous) {
          const byId = new Map(previous.moments.map((moment) => [moment.id, moment]));
          queryClient.setQueryData(listKey, {
            ...previous,
            moments: orderedIds.flatMap((id) => byId.get(id) ?? []),
          });
        }
        return { previous };
      },
      onError: (error, _input, context) => {
        if (context?.previous) queryClient.setQueryData(listKey, context.previous);
        toast.error("No se pudo reordenar", error.message);
      },
      onSuccess: (data) => queryClient.setQueryData(listKey, data),
    })
  );

  // A GO answers once Owy has posted, but it takes effect (and every screen moves on) as soon as
  // it's saved: hold the button only until the moment it targets is no longer the next one.
  const going = go.isPending && go.variables?.itemId === nextMoment?.id;

  // What the keyboard, the palette and the GO button run, always against the latest state.
  const actions = {
    goNext: () => {
      if (nextMoment && !going) go.mutate({ eventId, itemId: nextMoment.id });
    },
    shiftBy: (minutes: number) => {
      if (nextMoment) shift.mutate({ eventId, fromItemId: nextMoment.id, minutes });
    },
    undo: () => undo.mutate({ eventId }),
    canGo: Boolean(nextMoment),
  };
  const latest = useRef(actions);
  useEffect(() => {
    latest.current = actions;
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey)
        return;
      if (event.key !== "Enter" && event.key !== " ") return;
      if (!latest.current.canGo || !keysAreFree(event.target)) return;
      event.preventDefault();
      latest.current.goNext();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useShortcuts([
    // Handled above: they must not take the key from a focused button.
    {
      id: "guion.go",
      keys: "enter",
      label: "GO: arrancar lo que sigue",
      group: "Guion del día",
      run: () => {},
      displayOnly: true,
    },
    {
      id: "guion.go-space",
      keys: "space",
      label: "GO con la barra espaciadora",
      group: "Guion del día",
      run: () => {},
      displayOnly: true,
    },
    { id: "guion.new", keys: "n", label: "Nuevo momento", group: "Guion del día", run: () => edit(null) },
  ]);

  useCommands(
    "guion",
    "suggested",
    nextMoment
      ? [
          {
            id: "guion.go",
            title: `GO · ${nextMoment.title}`,
            hint: `guion ${nextMoment.plannedStart}`,
            shortcut: "enter",
            icon: Play,
            tone: "text-primary",
            keywords: ["go", "siguiente", "arrancar", "guion"],
            perform: { type: "run", run: () => latest.current.goNext() },
          },
          ...(drift > 0
            ? [
                {
                  id: "guion.shift-drift",
                  title: `Correr el guion ${signed(drift)} min`,
                  subtitle: `desde «${nextMoment.title}»`,
                  icon: TimerReset,
                  keywords: ["correr", "horarios", "atraso"],
                  perform: { type: "run" as const, run: () => latest.current.shiftBy(drift) },
                },
              ]
            : []),
        ]
      : []
  );
  useCommands("guion.page", "page", [
    {
      id: "guion.new",
      title: "Nuevo momento",
      shortcut: "n",
      icon: Plus,
      perform: { type: "run", run: () => edit(null) },
    },
    ...(moments.length > 0
      ? [
          {
            id: "guion.shift",
            title: "Correr horarios…",
            icon: TimerReset,
            perform: { type: "run" as const, run: () => setShiftOpen(true) },
          },
        ]
      : []),
    ...(moments.some((moment) => moment.actualStart)
      ? [
          {
            id: "guion.undo",
            title: "Deshacer el último GO",
            icon: Undo2,
            perform: { type: "run" as const, run: () => latest.current.undo() },
          },
        ]
      : []),
  ]);

  const fixedCount = moments.filter((moment) => moment.fixed).length;
  const opensAt = shell ? wallClock(new Date(shell.event.startDate), timezone).slice(11) : "09:00";

  return (
    <PageContainer className="md:flex md:h-(--admin-content-h) md:flex-col md:pb-6" size="large">
      <PageHeader
        actions={
          list.data ? (
            <>
              {moments.length > 0 ? (
                <Button variant="outline" onClick={() => setShiftOpen(true)}>
                  <TimerReset />
                  Correr horarios
                </Button>
              ) : null}
              <Button variant="outline" onClick={() => edit(null)}>
                <Plus />
                Momento
                <Kbd className="pointer-coarse:hidden">N</Kbd>
              </Button>
            </>
          ) : null
        }
        description="Cada momento del día con su responsable y sus cues: OBS, pantalla, sonido y mensajes de Owy."
        meta={
          moments.length > 0 ? (
            <>
              {liveMoment && liveMoment.driftMin !== null ? <DriftChip minutes={liveMoment.driftMin} /> : null}
              <span className="font-terminal text-meta text-muted-foreground tabular-nums">
                {plural(moments.length, "momento", "momentos")} · {plural(fixedCount, "fijo", "fijos")}
              </span>
            </>
          ) : null
        }
        title="Guion del día"
      />

      {list.isPending ? (
        <GuionSkeleton />
      ) : list.isError ? (
        <ErrorState
          description="No pudimos leer el guion. Revisá la conexión y probá de nuevo."
          retrying={list.isFetching}
          title="No se pudo cargar el guion"
          onRetry={() => void list.refetch()}
        />
      ) : moments.length === 0 ? (
        <EmptyState
          action={
            <>
              <Button disabled={importProgram.isPending} onClick={() => importProgram.mutate({ eventId })}>
                <Download />
                {importProgram.isPending ? "Importando…" : "Importar del programa"}
              </Button>
              <Button variant="outline" onClick={() => edit(null)}>
                <Plus />
                Nuevo momento
              </Button>
            </>
          }
          description="Importá los bloques del programa y sumá lo demás: la bienvenida, las charlas, el coffee break, los avisos."
          icon={ListVideo}
          title="Todavía no hay guion"
        />
      ) : (
        <>
          <NowNext
            day={list.data.day}
            going={going}
            live={liveMoment}
            moments={moments}
            next={nextMoment}
            nextFixed={nextFixed ? { moment: moments[nextFixed.index], marginMin: nextFixed.marginMin } : null}
            timezone={timezone}
            onClose={() => go.mutate({ eventId })}
            onGo={() => latest.current.goNext()}
          />
          <MomentTable
            moments={moments}
            overruns={overruns}
            status={status}
            timezone={timezone}
            onEdit={edit}
            onReorder={(orderedIds) => reorder.mutate({ eventId, orderedIds })}
            onTrim={(moment, durationMin) => trim.mutate({ eventId, itemId: moment.id, data: { durationMin } })}
          />
        </>
      )}

      <MomentEditor
        eventId={eventId}
        moment={editing}
        moments={moments}
        open={editorOpen}
        opensAt={opensAt}
        timezone={timezone}
        onOpenChange={setEditorOpen}
      />
      <ShiftPanel
        defaultFromId={nextMoment?.id}
        defaultMinutes={drift > 0 ? drift : 5}
        moments={moments}
        open={shiftOpen}
        pending={shift.isPending}
        onOpenChange={setShiftOpen}
        onShift={(fromItemId, minutes) => shift.mutate({ eventId, fromItemId, minutes })}
      />
    </PageContainer>
  );
}
