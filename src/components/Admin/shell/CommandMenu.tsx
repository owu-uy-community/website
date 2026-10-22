"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Command as CommandPrimitive } from "cmdk";
import {
  Bot,
  CalendarDays,
  DoorClosed,
  Cast,
  Clapperboard,
  LoaderCircle,
  Megaphone,
  Search,
  Siren,
  StickyNote,
  Timer,
  UserRound,
  UserSearch,
  X,
} from "lucide-react";

import { cn } from "app/lib/utils";
import { Button } from "components/shared/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "components/shared/ui/dialog";
import { Kbd } from "components/shared/ui/kbd";
import { toast } from "components/shared/ui/toast-utils";
import { orpc } from "lib/orpc";
import { SCENE_IDS, SCENES } from "lib/owy-stage/scenes";

import { onOpenCommandMenu } from "./command-bus";
import { CommandGroup as Group, CommandRow as Row, ID_MARK, matchEntry } from "./command-items";
import { guardedPush } from "./navigation-guard";
import { useRegisteredCommands, type CommandEntry, type CommandScope } from "./commands";
import { ADMIN_NAV, adminTools, navItemVisible } from "./nav-config";
import { useShortcuts } from "./shortcuts";
import { useNavViewer } from "./use-access-me";
import { useShell } from "./use-shell-status";
import { eventHref } from "./use-selected-event";

type Frame = { scope: CommandScope; entries: CommandEntry[] | null };

type Answer = { question: string; text: string | null; error: string | null };

const COUNTDOWN_PRESETS = [5, 10, 15, 25, 30];

/**
 * ⌘K: every page and action of the admin, plus the event's talks, people and scenes. Entries
 * run here (put a scene on air, cast a talk, start a countdown) instead of only navigating;
 * a "…" entry opens a sub-list, and Backspace on an empty search goes back.
 */
export function CommandMenu() {
  const router = useRouter();
  const { selected, scope, status } = useShell();
  const registered = useRegisteredCommands();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [stack, setStack] = useState<Frame[]>([]);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const frame = stack.at(-1) ?? null;
  const eventId = selected?.id ?? null;
  const viewer = useNavViewer();
  const siteAdmin = viewer?.siteAdmin ?? false;

  useShortcuts([
    {
      id: "shell.command-menu",
      keys: "mod+k",
      label: "Buscar o ejecutar",
      group: "General",
      allowInInputs: true,
      run: () => setOpen((value) => !value),
    },
  ]);

  useEffect(
    () =>
      onOpenCommandMenu((query) => {
        setStack([]);
        setSearch(query ?? "");
        setOpen(true);
      }),
    []
  );

  useEffect(() => {
    if (!open) {
      setStack([]);
      setSearch("");
      setAnswer(null);
    }
  }, [open]);

  const talks = useQuery(
    orpc.tracks.list.queryOptions({
      input: { openSpaceId: eventId ?? "" },
      enabled: open && Boolean(eventId),
      staleTime: 30_000,
    })
  );
  const roster = useQuery(
    orpc.staffTasks.roster.queryOptions({
      input: { eventId: eventId ?? "" },
      enabled: open && Boolean(eventId),
      staleTime: 300_000,
    })
  );

  const setScene = useMutation(orpc.owyStage.setScene.mutationOptions());
  const askOwy = useMutation(orpc.assistant.ask.mutationOptions());
  const canAsk = Boolean(eventId) && (siteAdmin || status?.me.role === "owner" || status?.me.role === "admin");

  const ask = (question: string) => {
    if (!eventId) return;
    setAnswer({ question, text: null, error: null });
    askOwy.mutate(
      { eventId, question },
      {
        onSuccess: ({ answer: text }) => setAnswer({ question, text, error: null }),
        onError: (error) => setAnswer({ question, text: null, error: error.message }),
      }
    );
  };
  const cast = useMutation(orpc.cast.setHighlightedNote.mutationOptions());
  const countdown = useMutation(orpc.countdown.updateState.mutationOptions());
  const roomStatus = useMutation(orpc.rooms.setStatus.mutationOptions());
  const queryClient = useQueryClient();

  const STATUS_LABEL = { open: "Abierta", full: "Llena", evacuate: "Evacuar" } as const;
  const roomScope = (status: "open" | "full" | "evacuate"): CommandScope => ({
    id: `rooms-${status}`,
    label: status === "full" ? "Marcar llena" : status === "evacuate" ? "Evacuar" : "Reabrir",
    placeholder: "¿Qué sala?",
    // Read when the scope opens: a host may have just marked a room from their phone, and a
    // cached list offered "Reabrir" with nothing to reopen right after marking one full.
    entries: async () =>
      (eventId
        ? await queryClient.fetchQuery(
            orpc.rooms.getByOpenSpace.queryOptions({ input: { openSpaceId: eventId }, staleTime: 0 })
          )
        : []
      )
        .filter((room) => room.isActive && room.status !== status)
        .map((room) => ({
          id: `room:${status}:${room.id}`,
          title: room.name,
          subtitle: `ahora ${STATUS_LABEL[room.status].toLowerCase()}`,
          icon: DoorClosed,
          perform: {
            type: "run" as const,
            run: async () => {
              await roomStatus.mutateAsync({ roomId: room.id, status });
              toast.success(
                `${room.name}: ${STATUS_LABEL[status].toLowerCase()}`,
                "Se ve en los kioscos, la agenda y Owy."
              );
            },
          },
        })),
  });

  const scoped = (href: string) => eventHref(scope, href);

  const sceneEntries = useMemo<CommandEntry[]>(
    () =>
      SCENE_IDS.map((id) => ({
        id: `scene:${id}`,
        title: SCENES[id].title,
        subtitle: SCENES[id].description,
        icon: Clapperboard,
        tone: "text-live-foreground",
        keywords: ["escena", "pantalla", id],
        perform: {
          type: "run",
          run: async () => {
            await setScene.mutateAsync({ scene: id, eventId });
            toast.success("Al aire", SCENES[id].title);
          },
        },
      })),
    [eventId, setScene]
  );

  const talkEntries = useMemo<CommandEntry[]>(
    () =>
      (talks.data ?? []).map((talk) => ({
        id: `talk:${talk.id}`,
        title: talk.title,
        subtitle: [talk.speaker, talk.room, talk.timeSlot].filter(Boolean).join(" · "),
        icon: StickyNote,
        keywords: [talk.speaker ?? "", talk.room],
        perform: {
          type: "run",
          run: async () => {
            if (!eventId) return;
            await cast.mutateAsync({ eventId, trackId: talk.id });
            toast.success("En las pantallas", talk.title);
          },
        },
      })),
    [talks.data, eventId, cast]
  );

  const personEntries: CommandEntry[] = (roster.data ?? []).map((person) => ({
    id: `person:${person.userId}`,
    title: person.name,
    subtitle: "Staff",
    icon: UserRound,
    keywords: ["staff", "persona", "turno"],
    perform: { type: "navigate", href: `${scoped("/admin/tareas")}&persona=${person.userId}` },
  }));

  const actions: CommandEntry[] = siteAdmin
    ? [
        {
          id: "action:announce",
          title: "Anunciar al staff…",
          icon: Megaphone,
          tone: "text-info-foreground",
          keywords: ["aviso", "anuncio", "urgente"],
          perform: { type: "navigate", href: `${scoped("/admin/comunicacion")}&nuevo=1` },
        },
        {
          id: "action:incident",
          title: "Reportar incidente",
          icon: Siren,
          tone: "text-live-foreground",
          keywords: ["problema", "emergencia", "perdido"],
          perform: { type: "navigate", href: `${scoped("/admin/incidentes")}&nuevo=1` },
        },
        {
          id: "action:room-full",
          title: "Marcar sala como llena…",
          icon: DoorClosed,
          tone: "text-warning-foreground",
          keywords: ["sala", "llena", "capacidad", "cupo"],
          perform: { type: "push", scope: roomScope("full") },
        },
        {
          id: "action:room-open",
          title: "Reabrir una sala…",
          icon: DoorClosed,
          keywords: ["sala", "abierta", "liberar"],
          perform: { type: "push", scope: roomScope("open") },
        },
        {
          id: "action:attendee",
          title: "Buscar asistente…",
          subtitle:
            status?.counts.checkedIn != null && status.counts.attendees != null
              ? `${status.counts.checkedIn} / ${status.counts.attendees} acreditados`
              : undefined,
          icon: UserSearch,
          tone: "text-success-foreground",
          keywords: ["asistente", "entrada", "check-in", "eventbrite"],
          perform: { type: "navigate", href: `${scoped("/admin/attendees")}&buscar=1` },
        },
        {
          id: "action:scene",
          title: "Poner escena al aire…",
          icon: Clapperboard,
          tone: "text-live-foreground",
          keywords: ["escena", "wall", "pantalla grande"],
          perform: {
            type: "push",
            scope: { id: "scenes", label: "Escenas", placeholder: "Buscá una escena…", entries: () => sceneEntries },
          },
        },
        {
          id: "action:cast",
          title: "Mandar charla a la pantalla…",
          icon: Cast,
          keywords: ["cast", "sticky", "charla"],
          perform: {
            type: "push",
            scope: { id: "talks", label: "Charlas", placeholder: "Buscá una charla…", entries: () => talkEntries },
          },
        },
        {
          id: "action:countdown",
          title: "Iniciar countdown…",
          icon: Timer,
          keywords: ["cuenta regresiva", "timer", "reloj"],
          perform: {
            type: "push",
            scope: {
              id: "countdown",
              label: "Countdown",
              placeholder: "¿Cuántos minutos?",
              entries: () =>
                COUNTDOWN_PRESETS.map((minutes) => ({
                  id: `countdown:${minutes}`,
                  title: `${minutes} minutos`,
                  icon: Timer,
                  perform: {
                    type: "run" as const,
                    run: async () => {
                      if (!eventId) return;
                      await countdown.mutateAsync({ eventId, action: "setDuration", durationSeconds: minutes * 60 });
                      await countdown.mutateAsync({ eventId, action: "start" });
                      toast.success("Countdown en marcha", `${minutes} minutos`);
                    },
                  },
                })),
            },
          },
        },
      ]
    : [
        {
          id: "action:incident",
          title: "Reportar incidente",
          icon: Siren,
          tone: "text-live-foreground",
          perform: { type: "navigate", href: `${scoped("/admin/incidentes")}&nuevo=1` },
        },
      ];

  const navigation: CommandEntry[] = ADMIN_NAV.flatMap((group) =>
    group.items
      .filter((item) => viewer !== null && navItemVisible(item, viewer))
      .map((item) => ({
        id: `nav:${item.key}`,
        title: item.title,
        subtitle: group.label,
        icon: item.icon,
        keywords: item.keywords,
        shortcut: item.go ? `g ${item.go}` : undefined,
        perform: { type: "navigate" as const, href: item.scoped ? scoped(item.href) : item.href },
      }))
  );

  const tools: CommandEntry[] = siteAdmin
    ? adminTools(selected).map((tool) => ({
        id: `tool:${tool.href}`,
        title: tool.title,
        icon: tool.icon,
        keywords: tool.keywords,
        perform: { type: "external", href: tool.href },
      }))
    : [];

  const run = async (entry: CommandEntry, newTab: boolean) => {
    const { perform } = entry;
    if (perform.type === "push") {
      setSearch("");
      const pending: Frame = { scope: perform.scope, entries: null };
      setStack((current) => [...current, pending]);
      try {
        const entries = await perform.scope.entries();
        setStack((current) => current.map((item) => (item === pending ? { ...item, entries } : item)));
      } catch (error) {
        // A list that failed to load must not spin forever.
        setStack((current) => current.filter((item) => item !== pending));
        toast.error("No se pudo cargar", error instanceof Error ? error.message : "Probá de nuevo.");
      }
      return;
    }

    setOpen(false);
    if (perform.type === "navigate") {
      if (newTab) window.open(perform.href, "_blank", "noopener");
      else guardedPush(router, perform.href);
    } else if (perform.type === "external") {
      window.open(perform.href, "_blank", "noopener,noreferrer");
    } else {
      // Let the dialog close first: a Radix dialog opened by the action would fight its focus trap.
      setTimeout(() => {
        Promise.resolve(perform.run()).catch((error: unknown) =>
          toast.error("No se pudo", error instanceof Error ? error.message : "Error inesperado")
        );
      }, 0);
    }
  };

  const byGroup = (group: string) => registered.filter((item) => item.group === group);
  const searching = search.trim().length >= 2;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        onEscapeKeyDown={(event) => {
          if (!answer) return;
          event.preventDefault();
          setAnswer(null);
        }}
        className="top-[calc(var(--admin-viewport-top,0px)+max(0.75rem,env(safe-area-inset-top)))] max-w-[660px] translate-y-0 gap-0 overflow-hidden p-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 sm:top-[max(4rem,12vh)] sm:p-0 [&>button:last-child]:hidden"
      >
        <DialogTitle className="sr-only">Buscar o ejecutar</DialogTitle>
        {/* No Ctrl+J/K/N/P list moves: cmdk would swallow Ctrl+K, so on Windows and Linux the palette couldn't close or reopen */}
        <CommandPrimitive
          loop
          className="flex flex-col"
          filter={matchEntry}
          vimBindings={false}
          onKeyDown={(event) => {
            if (answer && (event.key === "Backspace" || event.key === "Escape")) {
              event.preventDefault();
              setAnswer(null);
              return;
            }
            if (event.key === "Backspace" && search === "" && stack.length > 0) {
              event.preventDefault();
              setStack((current) => current.slice(0, -1));
            }
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              const value = document.querySelector<HTMLElement>("[cmdk-item][data-selected=true]")?.dataset.value;
              const entry = [...navigation, ...actions].find((item) => value?.endsWith(item.id));
              if (entry?.perform.type === "navigate") {
                event.preventDefault();
                void run(entry, true);
              }
            }
          }}
        >
          <div className="flex h-[52px] items-center gap-2.5 border-b border-border px-4">
            <Search aria-hidden className="size-[18px] shrink-0 text-muted-foreground" />
            {selected && !frame ? (
              <span className="inline-flex h-5 shrink-0 items-center gap-1 rounded-sm border border-input bg-white/[0.04] px-1.5 text-2xs text-subtle max-sm:hidden">
                <CalendarDays aria-hidden className="size-3" />
                {selected.name}
              </span>
            ) : null}
            {stack.map((item, index) => (
              <button
                key={`${item.scope.id}-${index}`}
                className="inline-flex h-5 shrink-0 items-center gap-1 rounded-sm border border-primary/25 bg-primary-surface px-1.5 text-2xs text-primary"
                title="Volver (⌫)"
                type="button"
                onClick={() => setStack((current) => current.slice(0, index))}
              >
                {item.scope.label}
                <X aria-hidden className="size-3" />
              </button>
            ))}
            <CommandPrimitive.Input
              autoCapitalize="none"
              autoComplete="off"
              autoCorrect="off"
              autoFocus
              className="h-full min-w-0 flex-1 bg-transparent text-base text-foreground outline-hidden placeholder:text-faint sm:text-[15px] pointer-coarse:text-base"
              enterKeyHint="go"
              spellCheck={false}
              placeholder={frame ? frame.scope.placeholder : "Buscá charlas, personas, escenas… o escribí un comando"}
              value={search}
              onValueChange={setSearch}
            />
            <Kbd className="shrink-0 pointer-coarse:hidden">esc</Kbd>
            {/* No Esc on a touchscreen, and the keyboard leaves little backdrop to tap. */}
            <DialogClose asChild>
              <Button className="-mr-2 hidden shrink-0 pointer-coarse:inline-flex" size="sm" variant="ghost">
                Cerrar
              </Button>
            </DialogClose>
          </div>

          {answer ? (
            <div aria-live="polite" className="flex gap-3 px-4 py-5">
              <Image
                alt=""
                className="size-10 shrink-0 rounded-[10px] bg-primary/15 object-contain p-0.5 ring-1 ring-primary/20"
                height={80}
                src="/images/logos/carpincho.png"
                width={80}
              />
              <div className="min-w-0 flex-1">
                <p className="text-meta text-muted-foreground">{answer.question}</p>
                {answer.text ? (
                  <p className="mt-1.5 text-[15px] leading-6 text-foreground">{answer.text}</p>
                ) : answer.error ? (
                  <p className="mt-1.5 text-ui text-live-foreground">{answer.error}</p>
                ) : (
                  <p className="mt-1.5 flex items-center gap-2 text-ui text-muted-foreground">
                    <LoaderCircle className="size-4 animate-spin" />
                    Owy está mirando los datos del evento…
                  </p>
                )}
                <div className="mt-3 flex items-center gap-3">
                  <Button className="-ml-2" size="xs" variant="ghost" onClick={() => setAnswer(null)}>
                    Volver
                  </Button>
                  <p className="text-2xs text-faint">
                    Responde con los datos de Hoy de este momento.
                    <span className="pointer-coarse:hidden"> ⌫ para volver.</span>
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          <CommandPrimitive.List
            className={cn(
              "max-h-[min(440px,60vh)] scroll-py-2 scrollbar-thin overflow-y-auto overscroll-contain pb-2 max-sm:max-h-[calc(var(--admin-viewport-height,100dvh)-max(0.75rem,env(safe-area-inset-top))-52px-0.75rem)]",
              answer && "hidden"
            )}
          >
            <CommandPrimitive.Empty className="py-10 text-center text-ui text-muted-foreground">
              Nada coincide con «{search}».
            </CommandPrimitive.Empty>

            {frame ? (
              frame.entries === null ? (
                <CommandPrimitive.Loading>
                  <div className="flex items-center justify-center gap-2 py-10 text-ui text-muted-foreground">
                    <LoaderCircle className="size-4 animate-spin" />
                    Cargando…
                  </div>
                </CommandPrimitive.Loading>
              ) : (
                <Group heading={frame.scope.label}>
                  {frame.entries.map((entry) => (
                    <Row key={entry.id} entry={entry} onRun={run} />
                  ))}
                </Group>
              )
            ) : (
              <>
                {/* This order is the ranking: cmdk 1.1 reorders items inside a group by score but never
                    the groups themselves (it looks them up by an id they don't carry). Going somewhere
                    and actions come first, what goes live (talks, scenes) after, asking Owy last: Enter
                    on "agenda" opens the Agenda, it doesn't put the Agenda scene on the wall. */}
                {byGroup("suggested").map((item, index) =>
                  item.entries.length ? (
                    <Group key={`suggested-${index}`} heading={item.heading ?? "Sugerido ahora"}>
                      {item.entries.map((entry) => (
                        <Row key={entry.id} entry={entry} onRun={run} />
                      ))}
                    </Group>
                  ) : null
                )}
                {byGroup("page").map((item, index) =>
                  item.entries.length ? (
                    <Group key={`page-${index}`} heading={item.heading ?? "En esta página"}>
                      {item.entries.map((entry) => (
                        <Row key={entry.id} entry={entry} onRun={run} />
                      ))}
                    </Group>
                  ) : null
                )}
                <Group heading="Acciones">
                  {[...actions, ...byGroup("actions").flatMap((item) => item.entries)].map((entry) => (
                    <Row key={entry.id} entry={entry} onRun={run} />
                  ))}
                </Group>
                <Group heading="Ir a">
                  {navigation.map((entry) => (
                    <Row key={entry.id} entry={entry} onRun={run} />
                  ))}
                </Group>
                {searching && personEntries.length > 0 ? (
                  <Group heading="Personas">
                    {personEntries.map((entry) => (
                      <Row key={entry.id} entry={entry} onRun={run} />
                    ))}
                  </Group>
                ) : null}
                {searching && talkEntries.length > 0 ? (
                  <Group heading="Charlas · mandar a la pantalla">
                    {talkEntries.map((entry) => (
                      <Row key={entry.id} entry={entry} onRun={run} />
                    ))}
                  </Group>
                ) : null}
                {searching && siteAdmin ? (
                  <Group heading="Escenas · poner al aire">
                    {sceneEntries.map((entry) => (
                      <Row key={entry.id} entry={entry} onRun={run} />
                    ))}
                  </Group>
                ) : null}
                {tools.length > 0 ? (
                  <Group heading="Pantallas y herramientas">
                    {tools.map((entry) => (
                      <Row key={entry.id} entry={entry} onRun={run} />
                    ))}
                  </Group>
                ) : null}
                {canAsk && search.trim().length >= 8 ? (
                  <Group heading="Owy">
                    <CommandPrimitive.Item
                      className="group relative flex h-9 cursor-default items-center gap-3 rounded-lg px-2.5 text-ui outline-hidden select-none data-[selected=true]:bg-raised data-[selected=true]:shadow-[inset_0_0_0_1px_hsl(var(--input))] pointer-coarse:h-11"
                      value={`${search}${ID_MARK}ask-owy`}
                      onSelect={() => ask(search.trim())}
                    >
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-[6px] bg-background ring-1 ring-border group-data-[selected=true]:bg-primary group-data-[selected=true]:ring-primary">
                        <Bot
                          aria-hidden
                          className="size-3.5 text-primary group-data-[selected=true]:text-primary-foreground"
                        />
                      </span>
                      <span className="truncate text-foreground">Preguntale a Owy: «{search.trim()}»</span>
                    </CommandPrimitive.Item>
                  </Group>
                ) : null}
              </>
            )}
          </CommandPrimitive.List>

          <div className="flex h-10 items-center gap-4 border-t border-border bg-background/60 px-4 text-meta text-faint max-sm:hidden">
            <span className="flex items-center gap-1.5">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd>
              navegar
            </span>
            <span className="flex items-center gap-1.5">
              <Kbd>⏎</Kbd>
              ejecutar
            </span>
            <span className="hidden items-center gap-1.5 sm:flex">
              <Kbd>⌘</Kbd>
              <Kbd>⏎</Kbd>
              en pestaña nueva
            </span>
            {stack.length > 0 ? (
              <span className="ml-auto flex items-center gap-1.5">
                <Kbd>⌫</Kbd>
                volver
              </span>
            ) : (
              <span className="ml-auto flex items-center gap-1.5">
                <Kbd>?</Kbd>
                atajos
              </span>
            )}
          </div>
        </CommandPrimitive>
      </DialogContent>
    </Dialog>
  );
}
