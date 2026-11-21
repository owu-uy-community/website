"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  ClipboardList,
  FileSpreadsheet,
  Flag,
  Megaphone,
  Plus,
  UserRoundCheck,
  type LucideIcon,
} from "lucide-react";

import { cn } from "app/lib/utils";
import { AnnouncementComposer, AnnouncementList } from "components/Admin/tareas/AnnouncementsPanel";
import {
  eventClock,
  formatDayLabel,
  isMine,
  missingPeople,
  plural,
  type OnShift,
  type RosterMember,
  type StaffAnnouncement,
  type StaffArrival,
  type StaffTask,
  TAREAS_TABS,
  type TareasTab as Tab,
} from "components/Admin/tareas/helpers";
import { ImportSheetPanel } from "components/Admin/tareas/ImportSheetPanel";
import { ScheduleTable, ShiftPopover } from "components/Admin/tareas/ScheduleTable";
import { ShiftTimeline } from "components/Admin/tareas/ShiftTimeline";
import { SwapProvider } from "components/Admin/tareas/swap";
import { TaskCard, type PeopleContext } from "components/Admin/tareas/TaskCard";
import { TaskDetailPanel } from "components/Admin/tareas/TaskDetailPanel";
import { TaskFormPanel } from "components/Admin/tareas/TaskFormPanel";
import { staffKeys, useMembership, useSetStatus, useStaffLive, type Me } from "components/Admin/tareas/use-staff";
import { useCommands } from "components/Admin/shell/commands";
import { useShortcuts } from "components/Admin/shell/shortcuts";
import { scopedAdminHref } from "components/Admin/shell/use-selected-event";
import { PageContainer, PageHeader } from "components/Admin/ui/page";
import { EmptyState, ErrorState } from "components/Admin/ui/states";
import { StatusDot } from "components/Admin/ui/status";
import { useNow } from "components/Admin/ui/time";
import { badgeVariants } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Kbd } from "components/shared/ui/kbd";
import { Switch } from "components/shared/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "components/shared/ui/tabs";
import { useSwipeTabs } from "components/Admin/ui/swipe";
import { orpc } from "lib/orpc";
import { minuteOfDay, taskPhase } from "lib/orpc/staff-tasks/shift";

const TAB_LIST = "h-auto gap-[18px] rounded-none border-0 bg-transparent p-0";
const TAB =
  "relative h-9 rounded-none px-0 text-ui text-muted-foreground after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-full hover:text-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none data-[state=active]:after:bg-primary pointer-coarse:h-11 pointer-coarse:before:min-w-11";

interface TareasClientProps {
  eventId: string;
  eventName: string;
  eventSlug: string;
  communitySlug: string;
  timeZone: string;
  /** The server's clock while rendering, so the first paint matches it. */
  serverNow: number;
  me: Me;
  canEdit: boolean;
  initialTab: Tab;
  initialTasks: StaffTask[];
  initialAnnouncements: StaffAnnouncement[];
  initialRoster: RosterMember[];
  initialArrivals: StaffArrival[];
  initialOnShift: OnShift;
}

/** A lane of the "Ahora" tab. */
function Lane({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <section aria-label={title} className={cn("space-y-2", count === 0 && "max-md:hidden")}>
      <h3 className="flex items-center gap-2 font-terminal text-[10.5px] tracking-[0.14em] text-muted-foreground uppercase">
        {title}
        <span className="text-faint tabular-nums">{count}</span>
      </h3>
      {count === 0 ? (
        <p className="rounded-lg border border-dashed border-input px-3 py-6 text-center text-meta text-muted-foreground">
          Nada
        </p>
      ) : (
        children
      )}
    </section>
  );
}

/** "14 de 18 en turno · 2 atrasadas · 3 libres ahora", each a way into Turnos. */
function ShiftChips({ shift, onOpen }: { shift: OnShift; onOpen: () => void }) {
  const chip = (variant: "success" | "destructive" | "info", children: ReactNode, label: string) => (
    <button
      aria-label={`${label}: ver los turnos`}
      className={cn(
        badgeVariants({ variant }),
        "relative cursor-pointer font-terminal tabular-nums focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:outline-hidden",
        // A chip is 20 px; a finger gets the row's height.
        "pointer-coarse:before:absolute pointer-coarse:before:inset-x-0 pointer-coarse:before:top-1/2 pointer-coarse:before:h-11 pointer-coarse:before:-translate-y-1/2"
      )}
      type="button"
      onClick={onOpen}
    >
      {children}
    </button>
  );
  const onShift = `${shift.onSite} de ${shift.expected} en turno`;

  return (
    <>
      {chip(
        "success",
        <>
          <StatusDot tone="ok" />
          {onShift}
        </>,
        onShift
      )}
      {shift.late > 0
        ? chip(
            "destructive",
            plural(shift.late, "atrasada", "atrasadas"),
            plural(shift.late, "persona atrasada", "personas atrasadas")
          )
        : null}
      {shift.free > 0
        ? chip(
            "info",
            plural(shift.free, "libre ahora", "libres ahora"),
            plural(shift.free, "persona libre", "personas libres")
          )
        : null}
    </>
  );
}

export default function TareasClient({
  eventId,
  eventName,
  eventSlug,
  communitySlug,
  timeZone,
  serverNow,
  me,
  canEdit,
  initialTab,
  initialTasks,
  initialAnnouncements,
  initialRoster,
  initialArrivals,
  initialOnShift,
}: TareasClientProps) {
  const queryClient = useQueryClient();
  const keys = staffKeys(eventId);
  const input = { eventId };
  useStaffLive(eventId);

  const tasksQuery = useQuery(
    orpc.staffTasks.list.queryOptions({ input, initialData: initialTasks, staleTime: 30_000 })
  );
  const announcementsQuery = useQuery(
    orpc.staffTasks.announcements.list.queryOptions({ input, initialData: initialAnnouncements, staleTime: 30_000 })
  );
  const arrivalsQuery = useQuery(
    orpc.staffTasks.arrivals.list.queryOptions({ input, initialData: initialArrivals, staleTime: 30_000 })
  );
  const { data: roster } = useQuery(
    orpc.staffTasks.roster.queryOptions({ input, initialData: initialRoster, staleTime: 5 * 60_000 })
  );
  // Who is late changes with the clock, not only with pings.
  const { data: shift } = useQuery(
    orpc.staffTasks.onShift.queryOptions({
      input,
      initialData: initialOnShift,
      staleTime: 30_000,
      refetchInterval: 60_000,
    })
  );
  const tasks = tasksQuery.data;
  const announcements = announcementsQuery.data;
  const arrivals = arrivalsQuery.data;
  const failed = [tasksQuery, announcementsQuery, arrivalsQuery].filter((query) => query.isError);

  const setStatus = useSetStatus(eventId);
  const { join, leave } = useMembership(eventId, me);
  const onSetStatus = (taskId: string, status: StaffTask["status"]) => setStatus.mutate({ eventId, taskId, status });
  const onJoin = (taskId: string) => join.mutate({ eventId, taskId });
  const onLeave = (taskId: string) => leave.mutate({ eventId, taskId });

  // ------------------------------------------------------------------ UI state
  const now = useNow(30_000);
  const clock = eventClock(now || serverNow, timeZone);
  const days = [...new Set(tasks.map((task) => task.dayDate))].sort();
  if (days.length === 0) days.push(clock.today);
  const [dayChoice, setDayChoice] = useState<string | null>(null);
  const day =
    dayChoice && days.includes(dayChoice)
      ? dayChoice
      : days.includes(clock.today)
        ? clock.today
        : (days.find((candidate) => candidate >= clock.today) ?? days[days.length - 1]);
  const isToday = day === clock.today;
  const at = minuteOfDay(day, clock.today, clock.nowMin);
  const people: PeopleContext = { arrivals, at, isToday, timeZone };
  const free = new Set(shift.people.filter((person) => person.state === "free").map((person) => person.userId));

  const [tab, setTabState] = useState<Tab>(initialTab);
  const setTab = (value: Tab) => {
    setTabState(value);
    const url = new URL(window.location.href);
    if (value === "ahora") url.searchParams.delete("tab");
    else url.searchParams.set("tab", value);
    window.history.replaceState(null, "", url);
  };
  // A sideways swipe over the tabs or their content moves to the next one, on touchscreens.
  const swipeTabs = useSwipeTabs(TAREAS_TABS, tab, setTab);
  const [myOnly, setMyOnly] = useState(!canEdit);
  const [form, setForm] = useState<{ open: boolean; task: StaffTask | null }>({ open: false, task: null });
  const [detailId, setDetailId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const openCreate = () => setForm({ open: true, task: null });
  const openEdit = (task: StaffTask) => {
    setDetailId(null);
    setForm({ open: true, task });
  };

  const dayTasks = tasks.filter((task) => task.dayDate === day);
  const visible = myOnly ? dayTasks.filter((task) => task.type === "milestone" || isMine(task, me.id)) : dayTasks;
  const milestones = dayTasks.filter((task) => task.type === "milestone" && task.startTime);
  const currentMilestone = milestones.filter((task) => (task.startTime ?? "") <= clock.time && isToday).at(-1);

  const myNext = dayTasks
    .filter((task) => task.type !== "milestone" && isMine(task, me.id))
    .map((task) => ({ task, phase: taskPhase(task, at) }))
    .find(({ phase }) => phase === "now" || phase === "blocked" || phase === "upcoming" || phase === "ongoing");
  // Your next task leads the tab on its own card, so the lanes skip it.
  const lanes = { active: [] as StaffTask[], upcoming: [] as StaffTask[], ongoing: [] as StaffTask[] };
  for (const task of visible) {
    if (task.type === "milestone" || task.id === myNext?.task.id) continue;
    const phase = taskPhase(task, at);
    if (phase === "done") continue;
    if (phase === "ongoing") lanes.ongoing.push(task);
    else if (phase === "upcoming") lanes.upcoming.push(task);
    else lanes.active.push(task);
  }
  const detail = tasks.find((task) => task.id === detailId) ?? null;
  const waitingForMe = announcements.filter((item) => item.pending.some((person) => person.userId === me.id)).length;
  const understaffed = dayTasks.filter((task) => missingPeople(task) > 0).length;
  const workCount = dayTasks.filter((task) => task.type !== "milestone").length;
  const liveShift = shift.expected > 0 && days.includes(shift.day);

  // ------------------------------------------------------------ keyboard, ⌘K
  useShortcuts(
    canEdit ? [{ id: "tareas.new", keys: "n", label: "Nueva tarea", group: "Staff y tareas", run: openCreate }] : []
  );
  const goTo = (value: Tab, title: string, icon: LucideIcon) => ({
    id: `tareas.tab.${value}`,
    title,
    icon,
    keywords: ["staff", "tareas"],
    perform: { type: "run" as const, run: () => setTab(value) },
  });
  useCommands(
    "tareas",
    "page",
    [
      ...(canEdit
        ? [
            {
              id: "tareas.new",
              title: "Nueva tarea",
              icon: Plus,
              shortcut: "n",
              keywords: ["crear", "turno"],
              // The palette is closing; the panel opens once it's gone.
              perform: { type: "run" as const, run: () => setTimeout(openCreate, 0) },
            },
            {
              id: "tareas.import",
              title: "Importar planilla",
              icon: FileSpreadsheet,
              keywords: ["google sheets", "excel", "pegar", "csv"],
              perform: { type: "run" as const, run: () => setTimeout(() => setImportOpen(true), 0) },
            },
          ]
        : []),
      goTo("turnos", "Ver los turnos", CalendarClock),
      goTo("anuncios", "Ver los anuncios", Megaphone),
      {
        id: "tareas.mi-turno",
        title: "Abrir Mi turno",
        icon: UserRoundCheck,
        perform: { type: "navigate", href: scopedAdminHref(communitySlug, "/admin/mi-turno", eventSlug) },
      },
    ],
    "Staff y tareas"
  );

  // ------------------------------------------------------------------- render
  const rail = (
    <>
      {canEdit ? <AnnouncementComposer eventId={eventId} tasks={dayTasks} /> : null}
      <AnnouncementList
        announcements={announcements}
        canEdit={canEdit}
        eventId={eventId}
        me={me}
        timeZone={timeZone}
        today={clock.today}
      />
    </>
  );
  const withRail = tab === "ahora" || tab === "cronograma";
  const newTask = canEdit ? (
    <Button onClick={openCreate}>
      <Plus />
      Tarea
      <Kbd className="pointer-coarse:hidden">N</Kbd>
    </Button>
  ) : null;

  return (
    <PageContainer size="large">
      <PageHeader
        actions={
          canEdit ? (
            <>
              <Button aria-label="Importar planilla" variant="outline" onClick={() => setImportOpen(true)}>
                <FileSpreadsheet />
                <span className="max-sm:hidden">Importar planilla</span>
              </Button>
              <ShiftPopover dayDate={day} eventId={eventId} now={clock.time} />
              {newTask}
            </>
          ) : (
            <Button asChild variant="outline">
              <Link href={scopedAdminHref(communitySlug, "/admin/mi-turno", eventSlug)}>
                <UserRoundCheck />
                Mi turno
              </Link>
            </Button>
          )
        }
        description="Quién hace qué y cuándo. Los cambios llegan al instante a los teléfonos del staff."
        meta={
          liveShift ? (
            <ShiftChips shift={shift} onOpen={() => setTab("turnos")} />
          ) : (
            <span className="font-terminal text-meta text-muted-foreground tabular-nums">
              {[eventName, plural(workCount, "tarea", "tareas"), understaffed > 0 ? `${understaffed} sin cubrir` : null]
                .filter(Boolean)
                .join(" · ")}
            </span>
          )
        }
        title="Staff y tareas"
      />

      {failed.length > 0 ? (
        <ErrorState
          className="mb-4"
          description="Lo que ves puede estar desactualizado."
          title="No se pudo actualizar"
          onRetry={() => {
            for (const key of [keys.tasks, keys.announcements, keys.arrivals])
              void queryClient.invalidateQueries({ queryKey: key });
          }}
        />
      ) : null}

      <SwapProvider enabled={canEdit} eventId={eventId} tasks={tasks}>
        <div ref={swipeTabs}>
          <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border">
              <div className="-mb-px max-w-full overflow-x-auto">
                <TabsList className={TAB_LIST}>
                  <TabsTrigger className={TAB} value="ahora">
                    Ahora
                  </TabsTrigger>
                  <TabsTrigger className={TAB} value="cronograma">
                    Cronograma
                  </TabsTrigger>
                  <TabsTrigger className={TAB} value="turnos">
                    Turnos
                  </TabsTrigger>
                  <TabsTrigger className={TAB} value="anuncios">
                    Anuncios
                    {waitingForMe > 0 ? (
                      <span className="font-terminal text-[10.5px] text-primary tabular-nums">
                        {waitingForMe}
                        <span className="sr-only"> sin leer</span>
                      </span>
                    ) : null}
                  </TabsTrigger>
                </TabsList>
              </div>
              <div className="ml-auto flex items-center gap-3 pb-1.5">
                {days.length > 1 ? (
                  <div
                    aria-label="Día"
                    className="inline-flex rounded-lg border border-input bg-background p-0.5"
                    role="radiogroup"
                  >
                    {days.map((candidate) => (
                      <button
                        key={candidate}
                        aria-checked={candidate === day}
                        className={cn(
                          "inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-meta font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:outline-hidden pointer-coarse:h-10",
                          candidate === day &&
                            "bg-raised text-foreground shadow-[inset_0_0_0_1px_hsl(var(--input)),0_1px_2px_rgb(0_0_0/0.5)]"
                        )}
                        role="radio"
                        type="button"
                        onClick={() => setDayChoice(candidate)}
                      >
                        {formatDayLabel(candidate)}
                        {candidate === clock.today ? <StatusDot tone="ok" /> : null}
                      </button>
                    ))}
                  </div>
                ) : (
                  <span className="font-terminal text-meta text-muted-foreground">{formatDayLabel(day)}</span>
                )}
                <label
                  className="flex cursor-pointer items-center gap-2 text-meta text-subtle pointer-coarse:min-h-11"
                  htmlFor="tareas-mine"
                >
                  <Switch checked={myOnly} id="tareas-mine" onCheckedChange={setMyOnly} />
                  Solo mis tareas
                </label>
              </div>
            </div>

            <div
              className={cn("mt-4", withRail && "lg:grid lg:grid-cols-[minmax(0,1fr)_336px] lg:items-start lg:gap-4")}
            >
              <div className="min-w-0">
                <TabsContent className="mt-0 space-y-4" value="ahora">
                  {milestones.length > 0 ? (
                    <ol aria-label="Hitos del día" className="flex flex-wrap items-center gap-1.5">
                      <Flag aria-hidden className="mr-0.5 size-3.5 text-muted-foreground" />
                      {milestones.map((milestone) => {
                        const passed = isToday ? (milestone.startTime ?? "") <= clock.time : day < clock.today;
                        return (
                          <li
                            key={milestone.id}
                            aria-current={milestone.id === currentMilestone?.id ? "step" : undefined}
                            className={cn(
                              "inline-flex h-6 items-center gap-1.5 rounded-full border border-border px-2 text-meta text-subtle",
                              passed && "text-muted-foreground",
                              milestone.id === currentMilestone?.id &&
                                "border-info/40 bg-info-surface text-info-foreground"
                            )}
                          >
                            <span className="font-terminal tabular-nums">{milestone.startTime}</span>
                            {milestone.title}
                          </li>
                        );
                      })}
                    </ol>
                  ) : null}

                  {myNext ? (
                    <section
                      aria-label="Tu próxima tarea"
                      className="rounded-xl border border-primary/30 bg-primary-surface/40 p-2"
                    >
                      <p className="px-1.5 pt-0.5 pb-2 font-terminal text-[10.5px] tracking-[0.14em] text-primary uppercase">
                        Tu próxima tarea
                      </p>
                      <TaskCard
                        meId={me.id}
                        people={people}
                        phase={myNext.phase}
                        task={myNext.task}
                        onJoin={onJoin}
                        onLeave={onLeave}
                        onOpen={setDetailId}
                        onSetStatus={onSetStatus}
                      />
                    </section>
                  ) : null}

                  {lanes.active.length + lanes.upcoming.length + lanes.ongoing.length === 0 ? (
                    myNext ? null : (
                      <EmptyState
                        action={workCount === 0 ? newTask : undefined}
                        description={
                          workCount === 0
                            ? canEdit
                              ? "Cargá la primera con «Tarea» o traelas de la planilla."
                              : "Todavía no hay tareas cargadas para este día."
                            : myOnly
                              ? "No te queda nada pendiente este día."
                              : "Todo lo de este día está listo."
                        }
                        owy={workCount > 0}
                        title={workCount === 0 ? "Sin tareas para este día" : "Nada pendiente"}
                      />
                    )
                  ) : (
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {(
                        [
                          ["En curso", lanes.active],
                          ["Próximas", lanes.upcoming],
                          ["Continuas", lanes.ongoing],
                        ] as const
                      ).map(([title, items]) => (
                        <Lane key={title} count={items.length} title={title}>
                          {items.slice(0, 10).map((task) => (
                            <TaskCard
                              key={task.id}
                              meId={me.id}
                              people={people}
                              phase={taskPhase(task, at)}
                              task={task}
                              onJoin={onJoin}
                              onLeave={onLeave}
                              onOpen={setDetailId}
                              onSetStatus={onSetStatus}
                            />
                          ))}
                          {items.length > 10 ? (
                            <button
                              className="w-full rounded-md py-1.5 text-meta text-muted-foreground hover:text-foreground"
                              type="button"
                              onClick={() => setTab("cronograma")}
                            >
                              {items.length - 10} más en el cronograma
                            </button>
                          ) : null}
                        </Lane>
                      ))}
                    </div>
                  )}
                </TabsContent>

                <TabsContent className="mt-0" value="cronograma">
                  {visible.length === 0 ? (
                    <EmptyState
                      action={newTask}
                      description={
                        canEdit
                          ? "Cargá la primera con «Tarea» o traelas de la planilla."
                          : "Todavía no hay tareas cargadas para este día."
                      }
                      icon={ClipboardList}
                      title="El cronograma está vacío"
                    />
                  ) : (
                    <ScheduleTable
                      canEdit={canEdit}
                      people={people}
                      tasks={visible}
                      onEdit={openEdit}
                      onOpen={setDetailId}
                    />
                  )}
                </TabsContent>

                <TabsContent className="mt-0" value="turnos">
                  <ShiftTimeline
                    arrivals={arrivals}
                    at={at}
                    emptyAction={newTask}
                    isToday={isToday}
                    tasks={visible}
                    timeZone={timeZone}
                    onOpen={setDetailId}
                  />
                </TabsContent>

                <TabsContent className="mt-0" value="anuncios">
                  <div
                    className={cn(
                      "grid gap-4",
                      canEdit ? "lg:grid-cols-[360px_minmax(0,1fr)] lg:items-start" : "max-w-2xl"
                    )}
                  >
                    {canEdit ? (
                      <div className="lg:sticky lg:top-4">
                        <AnnouncementComposer eventId={eventId} tasks={dayTasks} />
                      </div>
                    ) : null}
                    <AnnouncementList
                      announcements={announcements}
                      canEdit={canEdit}
                      eventId={eventId}
                      me={me}
                      timeZone={timeZone}
                      today={clock.today}
                      wide
                    />
                  </div>
                </TabsContent>
              </div>

              {withRail ? (
                <aside aria-label="Anuncios" className="hidden space-y-3 lg:block">
                  {rail}
                </aside>
              ) : null}
            </div>
          </Tabs>
        </div>

        {canEdit ? (
          <>
            <TaskFormPanel
              defaultDay={day}
              eventId={eventId}
              free={free}
              open={form.open}
              roster={roster}
              task={form.task}
              onOpenChange={(open) => setForm((current) => ({ ...current, open }))}
            />
            <ImportSheetPanel eventId={eventId} open={importOpen} onOpenChange={setImportOpen} />
          </>
        ) : null}
        <TaskDetailPanel
          canEdit={canEdit}
          eventId={eventId}
          free={free}
          me={me}
          open={detail !== null}
          people={{
            ...people,
            at: minuteOfDay(detail?.dayDate ?? day, clock.today, clock.nowMin),
            isToday: detail?.dayDate === clock.today,
          }}
          phase={detail ? taskPhase(detail, minuteOfDay(detail.dayDate, clock.today, clock.nowMin)) : "upcoming"}
          roster={roster}
          task={detail}
          today={clock.today}
          onEdit={openEdit}
          onJoin={onJoin}
          onLeave={onLeave}
          onOpenChange={(open) => !open && setDetailId(null)}
          onSetStatus={onSetStatus}
        />
      </SwapProvider>
    </PageContainer>
  );
}
