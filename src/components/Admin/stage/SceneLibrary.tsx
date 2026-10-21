"use client";

import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Check,
  Copy,
  ExternalLink,
  LayoutGrid,
  List,
  ListPlus,
  ListVideo,
  MoreHorizontal,
  Plus,
  Smartphone,
  Star,
  Zap,
} from "lucide-react";

import { cn } from "app/lib/utils";
import { Button } from "components/shared/ui/button";
import { ContextMenu, ContextMenuTrigger } from "components/shared/ui/context-menu";
import { DropdownMenu, DropdownMenuTrigger } from "components/shared/ui/dropdown-menu";
import { Empty } from "components/shared/ui/empty";
import { ToggleGroup, ToggleGroupItem } from "components/shared/ui/toggle-group";
import {
  INTERACTIVE_SCENES,
  SCENES,
  SCENE_CATEGORIES,
  SCENE_GROUPS,
  type SceneCategory,
  type SceneId,
} from "lib/owy-stage/scenes";

import { haptic } from "./haptics";
import { ActionsContext, ActionsDropdown, type MenuAction } from "./menus";
import { SceneThumb } from "./SceneThumb";
import { releaseFocus } from "./useStageHotkeys";
import { useStoredState } from "./useStoredState";

type Filter = "favorites" | "recent" | "all" | SceneCategory;
type View = "grid" | "list";

const PHONE = new Set<string>(INTERACTIVE_SCENES);
const isFilter = (value: unknown): value is Filter =>
  value === "favorites" ||
  value === "recent" ||
  value === "all" ||
  (typeof value === "string" && value in SCENE_CATEGORIES);
const isView = (value: unknown): value is View => value === "grid" || value === "list";
const POP = { type: "spring", stiffness: 520, damping: 22 } as const;

/** Where each scene stands on the desk, for the tags on its card. */
export type LibraryTally = { live: SceneId; preview: SceneId | null; queued: ReadonlyMap<SceneId, number> };

export type LibraryActions = {
  pick: (id: SceneId) => void;
  queue: (id: SceneId) => void;
  airNow: (id: SceneId) => void;
  guion: (id: SceneId) => void;
  toggleFavorite: (id: SceneId) => void;
  copyUrl: (id: SceneId) => void;
};

function sceneActions(id: SceneId, favorite: boolean, actions: LibraryActions): MenuAction[] {
  return [
    { label: "Al aire ya", icon: Zap, tone: "air", onSelect: () => actions.airNow(id) },
    { label: "Agregar a la cola", icon: ListPlus, onSelect: () => actions.queue(id) },
    { label: "Agregar al guion", icon: ListVideo, onSelect: () => actions.guion(id) },
    {
      label: favorite ? "Quitar de favoritos" : "Marcar favorito",
      icon: Star,
      onSelect: () => actions.toggleFavorite(id),
    },
    { label: "Copiar URL para OBS", icon: Copy, group: true, onSelect: () => actions.copyUrl(id) },
    { label: "Abrir en otra pestaña", icon: ExternalLink, href: `/owy/stage/${id}` },
  ];
}

function Tag({ tone, children }: { tone: "air" | "preview" | "queue"; children: React.ReactNode }) {
  return (
    <motion.span
      animate={{ scale: 1, opacity: 1 }}
      className={cn(
        "rounded px-1.5 text-[10px] leading-[18px] font-bold tracking-wide",
        tone === "air" && "bg-red-600 text-white",
        tone === "preview" && "bg-green-600 text-white",
        tone === "queue" && "bg-primary text-primary-foreground"
      )}
      exit={{ scale: 0.6, opacity: 0 }}
      initial={{ scale: 0.6, opacity: 0 }}
      transition={POP}
    >
      {children}
    </motion.span>
  );
}

function Tags({
  id,
  tally,
  favorite,
  hotkey,
  withQueue = true,
}: {
  id: SceneId;
  tally: LibraryTally;
  favorite: boolean;
  /** 1–9 for the first nine favorites: the key that stages it. */
  hotkey: number | null;
  withQueue?: boolean;
}) {
  const position = withQueue ? tally.queued.get(id) : undefined;

  return (
    <>
      <span className="pointer-events-none absolute top-1.5 left-1.5 flex gap-1">
        <AnimatePresence>
          {tally.live === id && (
            <Tag key="air" tone="air">
              AL AIRE
            </Tag>
          )}
          {tally.preview === id && (
            <Tag key="preview" tone="preview">
              PREVIEW
            </Tag>
          )}
          {position && (
            <Tag key={`queue-${position}`} tone="queue">
              COLA #{position}
            </Tag>
          )}
        </AnimatePresence>
      </span>
      <span className="pointer-events-none absolute top-1.5 right-1.5 flex gap-1">
        {hotkey && (
          <span
            className="hidden h-[18px] min-w-[18px] place-items-center rounded bg-black/70 px-1 font-terminal text-[10px] text-zinc-100 pointer-fine:grid"
            title={`Tecla ${hotkey}`}
          >
            {hotkey}
          </span>
        )}
        {favorite && (
          <span className="grid h-[18px] w-[18px] place-items-center rounded bg-black/70 text-primary">
            <Star className="h-3 w-3" fill="currentColor" />
          </span>
        )}
        {PHONE.has(id) && (
          <span
            className="grid h-[18px] w-[18px] place-items-center rounded bg-black/70 text-zinc-100"
            title="La gente participa desde el celular"
          >
            <Smartphone className="h-3 w-3" />
          </span>
        )}
      </span>
    </>
  );
}

/** «+»: to the queue, answered with a check (and a tap on phones) so it's clear it landed. */
function QueueButton({ id, onQueue, className }: { id: SceneId; onQueue: (id: SceneId) => void; className?: string }) {
  const [added, setAdded] = useState(0);
  useEffect(() => {
    if (!added) return;
    const timer = setTimeout(() => setAdded(0), 900);

    return () => clearTimeout(timer);
  }, [added]);

  return (
    <Button
      aria-label={`Agregar ${SCENES[id].title} a la cola`}
      className={cn(
        "relative shrink-0 text-muted-foreground transition-transform active:scale-90",
        added && "text-primary",
        className
      )}
      size="icon"
      title="Agregar a la cola"
      variant="ghost"
      onClick={(event) => {
        onQueue(id);
        haptic(8);
        setAdded(Date.now());
        releaseFocus(event);
      }}
    >
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={added ? "added" : "add"}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          exit={{ scale: 0.4, opacity: 0 }}
          initial={{ scale: 0.4, rotate: added ? -45 : 0, opacity: 0 }}
          transition={POP}
        >
          {added ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
        </motion.span>
      </AnimatePresence>
    </Button>
  );
}

function SceneMenu({ id, menu }: { id: SceneId; menu: MenuAction[] }) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={`Más acciones para ${SCENES[id].title}`}
          className="h-8 w-8 shrink-0 text-muted-foreground pointer-coarse:h-10 pointer-coarse:w-10"
          size="icon"
          variant="ghost"
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <ActionsDropdown actions={menu} title={SCENES[id].title} />
    </DropdownMenu>
  );
}

function ringFor(id: SceneId, tally: LibraryTally) {
  if (tally.live === id) return "border-transparent ring-2 ring-red-500";
  if (tally.preview === id) return "border-transparent ring-2 ring-green-500";

  return "hover:border-muted-foreground/40";
}

type ItemProps = {
  id: SceneId;
  tally: LibraryTally;
  favorite: boolean;
  hotkey: number | null;
  actions: LibraryActions;
};

function Card({ id, tally, favorite, hotkey, actions }: ItemProps) {
  const scene = SCENES[id];
  const menu = sceneActions(id, favorite, actions);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={cn(
            "overflow-hidden rounded-lg border bg-card transition-[box-shadow,border-color] duration-300 select-none [-webkit-touch-callout:none]",
            ringFor(id, tally)
          )}
        >
          <button
            aria-label={`${scene.title}: a la preview`}
            className="relative block w-full touch-manipulation text-left transition-transform duration-100 active:scale-[0.97]"
            title={scene.description}
            type="button"
            onClick={(event) => {
              actions.pick(id);
              releaseFocus(event);
            }}
          >
            <SceneThumb className="rounded-none" id={id} title={scene.title} />
            <Tags favorite={favorite} hotkey={hotkey} id={id} tally={tally} />
          </button>
          <div className="flex items-center gap-0.5 py-1 pr-1 pl-2.5">
            <span className="min-w-0 flex-1 truncate text-xs font-semibold">{scene.title}</span>
            <QueueButton className="h-8 w-8 pointer-coarse:h-10 pointer-coarse:w-10" id={id} onQueue={actions.queue} />
            <SceneMenu id={id} menu={menu} />
          </div>
        </div>
      </ContextMenuTrigger>
      <ActionsContext actions={menu} title={scene.title} />
    </ContextMenu>
  );
}

function Row({ id, tally, favorite, hotkey, actions }: ItemProps) {
  const scene = SCENES[id];
  const menu = sceneActions(id, favorite, actions);
  const position = tally.queued.get(id);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={cn(
            "relative flex items-center gap-3 rounded-lg border bg-card p-1.5 pr-1 transition-[box-shadow,border-color] duration-300 select-none [-webkit-touch-callout:none]",
            ringFor(id, tally)
          )}
        >
          {/* The whole row picks; the buttons on top keep their own action. */}
          <button
            aria-label={`${scene.title}: a la preview`}
            className="absolute inset-0 touch-manipulation rounded-lg active:bg-accent/40"
            type="button"
            onClick={(event) => {
              actions.pick(id);
              releaseFocus(event);
            }}
          />
          <div className="pointer-events-none relative w-24 shrink-0">
            <SceneThumb className="rounded" id={id} title={scene.title} />
            <Tags favorite={favorite} hotkey={hotkey} id={id} tally={tally} withQueue={false} />
          </div>
          <div className="pointer-events-none min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">
              {scene.title}
              {position && <span className="ml-2 text-xs font-medium text-primary">cola #{position}</span>}
            </p>
            <p className="truncate text-xs text-muted-foreground">{scene.description}</p>
          </div>
          <div className="relative flex items-center">
            <QueueButton className="h-9 w-9 pointer-coarse:h-10 pointer-coarse:w-10" id={id} onQueue={actions.queue} />
            <SceneMenu id={id} menu={menu} />
          </div>
        </div>
      </ContextMenuTrigger>
      <ActionsContext actions={menu} title={scene.title} />
    </ContextMenu>
  );
}

/**
 * Every scene the wall can show, by category, in the day's order. Tapping a
 * card stages it in preview — nothing goes on air from here except through
 * «⋯ → Al aire ya» (also on a long-press or a right-click). The filter and the
 * grid/list view are per device.
 */
function SceneLibraryView({
  tally,
  favorites,
  recent,
  actions,
  lead,
}: {
  tally: LibraryTally;
  favorites: SceneId[];
  recent: SceneId[];
  actions: LibraryActions;
  /** Something to put before the chips (the phone's search button). */
  lead?: ReactNode;
}) {
  const [filter, setFilter] = useStoredState<Filter>("owy-stage-library-filter", "all", isFilter);
  const [view, setView] = useStoredState<View>("owy-stage-library-view", "grid", isView);
  const hotkeys = useMemo(() => new Map(favorites.slice(0, 9).map((id, index) => [id, index + 1])), [favorites]);
  const starred = useMemo(() => new Set(favorites), [favorites]);
  const chipRow = useRef<HTMLDivElement>(null);

  // The chosen chip slides into view when the row was scrolled away from it (only the row scrolls).
  useEffect(() => {
    const row = chipRow.current;
    const chip = row?.querySelector<HTMLElement>('[data-state="on"]');
    if (!row || !chip) return;
    const box = row.getBoundingClientRect();
    const at = chip.getBoundingClientRect();
    if (at.left >= box.left && at.right <= box.right) return;
    row.scrollTo({ left: row.scrollLeft + at.left - box.left - 12, behavior: "smooth" });
  }, [filter]);

  const groups = useMemo(() => {
    if (filter === "favorites") return [{ category: "favorites", title: "Favoritos", scenes: favorites }];
    if (filter === "recent") return [{ category: "recent", title: "Recientes", scenes: recent }];

    return SCENE_GROUPS.filter((group) => filter === "all" || group.category === filter);
  }, [filter, favorites, recent]);
  const empty = groups.every((group) => group.scenes.length === 0);

  const chips: [Filter, string, number | null][] = [
    ["favorites", "★ Favoritos", favorites.length],
    ["recent", "Recientes", null],
    ["all", "Todas", null],
    ...SCENE_GROUPS.map((group): [Filter, string, number] => [group.category, group.title, group.scenes.length]),
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 px-3 py-2">
        {lead}
        <div
          ref={chipRow}
          className="min-w-0 flex-1 [scrollbar-width:none] overflow-x-auto [mask-image:linear-gradient(90deg,#000_92%,transparent)] [&::-webkit-scrollbar]:hidden"
        >
          <ToggleGroup
            className="w-max justify-start gap-1.5"
            type="single"
            value={filter}
            onValueChange={(value) => value && setFilter(value as Filter)}
          >
            {chips.map(([id, label, count]) => (
              <ToggleGroupItem
                key={id}
                className="relative h-8 rounded-full border border-input px-3 text-xs whitespace-nowrap hover:bg-accent data-[state=on]:border-primary data-[state=on]:bg-transparent data-[state=on]:text-primary-foreground pointer-coarse:h-10"
                value={id}
              >
                {filter === id && (
                  <motion.span
                    className="absolute inset-0 rounded-full bg-primary"
                    layoutId="library-chip"
                    transition={{ type: "spring", stiffness: 500, damping: 38 }}
                  />
                )}
                <span className="relative">{label}</span>
                {count !== null && <span className="relative opacity-60">{count}</span>}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <ToggleGroup
          aria-label="Vista"
          className="shrink-0 gap-0.5"
          type="single"
          value={view}
          onValueChange={(value) => value && setView(value as View)}
        >
          <ToggleGroupItem
            aria-label="Grilla"
            className="h-8 w-8 min-w-8 px-0 pointer-coarse:h-10 pointer-coarse:w-10"
            value="grid"
          >
            <LayoutGrid className="h-4 w-4" />
          </ToggleGroupItem>
          <ToggleGroupItem
            aria-label="Lista"
            className="h-8 w-8 min-w-8 px-0 pointer-coarse:h-10 pointer-coarse:w-10"
            value="list"
          >
            <List className="h-4 w-4" />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3">
        {empty && (
          <Empty
            className="mt-2"
            description={
              filter === "favorites"
                ? "Marcalas con «⋯ → Marcar favorito». Las primeras nueve salen con las teclas 1 a 9."
                : "Las escenas que salgan al aire desde este dispositivo aparecen acá."
            }
            icon={filter === "favorites" ? Star : ListVideo}
            title={filter === "favorites" ? "Sin favoritos todavía" : "Nada reciente"}
          />
        )}
        {groups.map(
          (group) =>
            group.scenes.length > 0 && (
              <section key={group.category} className="[contain-intrinsic-size:auto_480px] [content-visibility:auto]">
                {(filter === "all" || filter === "favorites" || filter === "recent") && (
                  <h3 className="sticky top-0 z-10 -mx-3 bg-card/95 px-3 py-1.5 text-[11px] font-semibold tracking-[0.18em] text-muted-foreground uppercase backdrop-blur">
                    {group.title} · {group.scenes.length}
                    {filter === "favorites" && (
                      <span className="ml-2 hidden tracking-normal normal-case pointer-fine:inline">teclas 1–9</span>
                    )}
                  </h3>
                )}
                <div
                  className={cn(
                    "pb-3",
                    view === "grid" ? "grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2.5" : "space-y-1.5"
                  )}
                >
                  {group.scenes.map((id) => {
                    const props = {
                      actions,
                      favorite: starred.has(id),
                      hotkey: hotkeys.get(id) ?? null,
                      id,
                      tally,
                    };

                    return view === "grid" ? <Card key={id} {...props} /> : <Row key={id} {...props} />;
                  })}
                </div>
              </section>
            )
        )}
      </div>
    </div>
  );
}

export const SceneLibrary = memo(SceneLibraryView);
