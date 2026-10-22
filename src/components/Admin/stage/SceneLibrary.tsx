"use client";

import {
  memo,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Check,
  Copy,
  ExternalLink,
  LayoutGrid,
  List,
  ListPlus,
  ListVideo,
  Plus,
  Smartphone,
  Star,
  Zap,
} from "lucide-react";

import { cn } from "app/lib/utils";
import { TALLY } from "components/Admin/screen/tally";
import { Button } from "components/shared/ui/button";
import { ContextMenu, ContextMenuTrigger } from "components/shared/ui/context-menu";
import { Empty } from "components/shared/ui/empty";
import { ToggleGroup, ToggleGroupItem } from "components/shared/ui/toggle-group";
import {
  INTERACTIVE_SCENES,
  SCENES,
  SCENE_CATEGORIES,
  SCENE_GROUPS,
  isSceneId,
  type SceneCategory,
  type SceneId,
} from "lib/owy-stage/scenes";

import { haptic } from "./haptics";
import { ActionsContext, ActionsMenuButton, useLongPress, type MenuAction } from "./menus";
import { SceneThumb } from "./SceneThumb";
import { releaseFocus } from "./useStageHotkeys";
import { useStoredState } from "./useStoredState";

type Filter = "recent" | "all" | SceneCategory;
type View = "grid" | "list";

const PHONE = new Set<string>(INTERACTIVE_SCENES);
const isFilter = (value: unknown): value is Filter =>
  value === "recent" || value === "all" || (typeof value === "string" && value in SCENE_CATEGORIES);
const isView = (value: unknown): value is View => value === "grid" || value === "list";
const POP = { type: "spring", stiffness: 520, damping: 22 } as const;

/** Where each scene stands on the desk, for the tags on its card. */
export type LibraryTally = { live: SceneId; preview: SceneId | null; queued: ReadonlyMap<SceneId, number> };

export type LibraryActions = {
  pick: (id: SceneId) => void;
  queue: (id: SceneId) => void;
  airNow: (id: SceneId) => void;
  guion: (id: SceneId) => void;
  /** A preset of the scene with its defaults, at the end of the presets. */
  preset: (id: SceneId) => void;
  copyUrl: (id: SceneId) => void;
};

function sceneActions(id: SceneId, actions: LibraryActions): MenuAction[] {
  return [
    { label: "Al aire ya", icon: Zap, tone: "air", onSelect: () => actions.airNow(id) },
    { label: "Agregar a la cola", icon: ListPlus, onSelect: () => actions.queue(id) },
    { label: "Agregar al guion", icon: ListVideo, onSelect: () => actions.guion(id) },
    { label: "Guardar como preset", icon: Star, onSelect: () => actions.preset(id) },
    { label: "Copiar URL para OBS", icon: Copy, group: true, onSelect: () => actions.copyUrl(id) },
    { label: "Abrir en otra pestaña", icon: ExternalLink, href: `/owy/stage/${id}` },
  ];
}

export function Tag({ tone, children }: { tone: "air" | "preview" | "queue"; children: React.ReactNode }) {
  return (
    <motion.span
      animate={{ scale: 1, opacity: 1 }}
      className={cn(
        "rounded-sm px-1.5 font-terminal text-3xs leading-[18px] font-semibold tracking-[0.08em]",
        tone === "air" && TALLY.program.chip,
        tone === "preview" && TALLY.preview.chip,
        tone === "queue" && "border border-white/15 bg-black/75 text-foreground"
      )}
      exit={{ scale: 0.6, opacity: 0 }}
      initial={{ scale: 0.6, opacity: 0 }}
      transition={POP}
    >
      {children}
    </motion.span>
  );
}

/** A card's place on the desk, as plain values: a memoized card re-renders only when its own changes. */
type Status = {
  live: boolean;
  preview: boolean;
  /** Position in the queue (1-based), if queued. */
  queued: number | undefined;
};

function Tags({ id, live, preview, queued }: Status & { id: SceneId }) {
  return (
    <>
      <span className="pointer-events-none absolute top-1.5 left-1.5 flex gap-1">
        <AnimatePresence>
          {live && (
            <Tag key="air" tone="air">
              AL AIRE
            </Tag>
          )}
          {preview && (
            <Tag key="preview" tone="preview">
              PREVIEW
            </Tag>
          )}
          {queued && (
            <Tag key={`queue-${queued}`} tone="queue">
              COLA #{queued}
            </Tag>
          )}
        </AnimatePresence>
      </span>
      <span className="pointer-events-none absolute top-1.5 right-1.5 flex gap-1">
        {PHONE.has(id) && (
          <span
            className="grid size-[18px] place-items-center rounded-sm bg-black/70 text-foreground"
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
  /** The icons pop in only after a first press, never when the card mounts. */
  const [pressed, setPressed] = useState(false);
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
        className,
        added && "text-primary"
      )}
      size="icon"
      title="Agregar a la cola"
      variant="ghost"
      onClick={(event) => {
        onQueue(id);
        haptic(8);
        setAdded(Date.now());
        setPressed(true);
        releaseFocus(event);
      }}
    >
      {/* A CSS pop, not a presence animation: two hundred cards each carrying one is not free. */}
      <span
        key={added ? "added" : "add"}
        className={cn(
          pressed &&
            "duration-300 ease-[cubic-bezier(0.2,0.9,0.25,1.25)] motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-50",
          pressed && added && "motion-safe:spin-in-[-45deg]"
        )}
      >
        {added ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
      </span>
    </Button>
  );
}

export function ringFor(live: boolean, preview: boolean) {
  if (live) return cn("border-transparent ring-2", TALLY.program.ring);
  if (preview) return cn("border-transparent ring-2", TALLY.preview.ring);

  return "hover:border-input";
}

type ItemProps = Status & { id: SceneId; actions: LibraryActions };

const menuLabel = (id: SceneId) => `Más acciones para ${SCENES[id].title}`;

function CardView({ id, actions, ...status }: ItemProps) {
  const scene = SCENES[id];
  const onImage = "h-7 w-7 text-white/85 hover:bg-white/15 hover:text-white pointer-coarse:h-8 pointer-coarse:w-8";

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border bg-card transition-[box-shadow,border-color] duration-300 select-none [-webkit-touch-callout:none]",
        ringFor(status.live, status.preview)
      )}
      data-scene={id}
    >
      <div className="relative">
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
          <Tags id={id} {...status} />
        </button>
        {/* The two actions ride on the picture, so the title below gets the card's whole width. */}
        <div className="absolute right-1 bottom-1 flex rounded-md bg-black/75">
          <QueueButton className={onImage} id={id} onQueue={actions.queue} />
          <ActionsMenuButton
            actions={() => sceneActions(id, actions)}
            className={onImage}
            label={menuLabel(id)}
            title={scene.title}
          />
        </div>
      </div>
      <p className="line-clamp-2 min-h-[2lh] px-2.5 py-1.5 text-xs leading-tight font-semibold">{scene.title}</p>
    </div>
  );
}

const Card = memo(CardView);

function RowView({ id, actions, ...status }: ItemProps) {
  const scene = SCENES[id];

  return (
    <div
      className={cn(
        "relative flex items-center gap-3 rounded-lg border bg-card p-1.5 pr-1 transition-[box-shadow,border-color] duration-300 select-none [-webkit-touch-callout:none]",
        ringFor(status.live, status.preview)
      )}
      data-scene={id}
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
        <Tags id={id} {...status} queued={undefined} />
      </div>
      <div className="pointer-events-none min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">
          {scene.title}
          {status.queued && <span className="ml-2 text-xs font-medium text-primary">cola #{status.queued}</span>}
        </p>
        <p className="truncate text-xs text-muted-foreground">{scene.description}</p>
      </div>
      <div className="relative flex items-center">
        <QueueButton className="h-9 w-9 pointer-coarse:h-10 pointer-coarse:w-10" id={id} onQueue={actions.queue} />
        <ActionsMenuButton
          actions={() => sceneActions(id, actions)}
          className="h-8 w-8 shrink-0 text-muted-foreground pointer-coarse:h-10 pointer-coarse:w-10"
          label={menuLabel(id)}
          title={scene.title}
        />
      </div>
    </div>
  );
}

const Row = memo(RowView);

/** The filter chips and the grid/list toggle: on their own, so a change on the desk doesn't redraw them. */
function ToolbarView({
  lead,
  filter,
  onFilter,
  view,
  onView,
}: {
  lead?: ReactNode;
  filter: Filter;
  onFilter: (filter: Filter) => void;
  view: View;
  onView: (view: View) => void;
}) {
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

  const chips: [Filter, string, number | null][] = [
    ["recent", "Recientes", null],
    ["all", "Todas", null],
    ...SCENE_GROUPS.map((group): [Filter, string, number] => [group.category, group.title, group.scenes.length]),
  ];

  return (
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
          onValueChange={(value) => value && onFilter(value as Filter)}
        >
          {chips.map(([id, label, count]) => (
            <ToggleGroupItem
              key={id}
              className="relative h-8 rounded-full border border-input px-3 text-xs whitespace-nowrap hover:bg-accent data-[state=on]:border-primary data-[state=on]:bg-transparent data-[state=on]:text-primary-foreground pointer-coarse:h-10"
              value={id}
              onClick={releaseFocus}
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
        onValueChange={(value) => value && onView(value as View)}
      >
        <ToggleGroupItem
          aria-label="Grilla"
          className="h-8 w-8 min-w-8 px-0 pointer-coarse:h-10 pointer-coarse:w-10"
          value="grid"
          onClick={releaseFocus}
        >
          <LayoutGrid className="h-4 w-4" />
        </ToggleGroupItem>
        <ToggleGroupItem
          aria-label="Lista"
          className="h-8 w-8 min-w-8 px-0 pointer-coarse:h-10 pointer-coarse:w-10"
          value="list"
          onClick={releaseFocus}
        >
          <List className="h-4 w-4" />
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}

const Toolbar = memo(ToolbarView);

/** The scene under a right-click or a long-press, read off the card it landed on. */
const sceneAt = (event: MouseEvent | PointerEvent) => {
  const id = (event.target as HTMLElement).closest<HTMLElement>("[data-scene]")?.dataset.scene;

  return id && isSceneId(id) ? id : null;
};
/** A press inside a card's open ⋯ menu reaches the grid through React, from a portal: not the grid's. */
const fromPortal = (event: MouseEvent | PointerEvent) => !event.currentTarget.contains(event.target as Node);

/**
 * Every scene the wall can show, by category, in the day's order. Tapping a
 * card stages it in preview — nothing goes on air from here except through
 * «⋯ → Al aire ya» (also on a long-press or a right-click). The filter and the
 * grid/list view are per device.
 */
function SceneLibraryView({
  tally,
  recent,
  actions,
  lead,
}: {
  tally: LibraryTally;
  recent: SceneId[];
  actions: LibraryActions;
  /** Something to put before the chips (the phone's search button). */
  lead?: ReactNode;
}) {
  const [filter, setFilter] = useStoredState<Filter>("owy-stage-library-filter", "all", isFilter);
  const [view, setView] = useStoredState<View>("owy-stage-library-view", "grid", isView);
  // The chip and the toggle answer at once; the grid behind them follows without blocking the tap.
  const shownFilter = useDeferredValue(filter);
  const shownView = useDeferredValue(view);
  /** One right-click / long-press menu for the whole grid, filled with the scene it was opened on. */
  const [menuFor, setMenuFor] = useState<SceneId | null>(null);
  const longPress = useLongPress();

  const groups = useMemo(() => {
    if (shownFilter === "recent") return [{ category: "recent", title: "Recientes", scenes: recent }];

    return SCENE_GROUPS.filter((group) => shownFilter === "all" || group.category === shownFilter);
  }, [shownFilter, recent]);
  const empty = groups.every((group) => group.scenes.length === 0);

  const Item = shownView === "grid" ? Card : Row;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Toolbar filter={filter} lead={lead} view={view} onFilter={setFilter} onView={setView} />

      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3"
            onContextMenu={(event) => {
              if (fromPortal(event)) return;
              const id = sceneAt(event);
              // Off the cards (a gap, a heading) there is nothing to act on.
              if (!id) return event.preventDefault();
              setMenuFor(id);
            }}
            onPointerDown={(event) => {
              // A long-press opens after a hold: know the scene from the moment the finger lands.
              if (event.pointerType === "mouse" || fromPortal(event)) return;
              const id = sceneAt(event);
              if (!id) return event.preventDefault();
              setMenuFor(id);
              longPress.start(event);
            }}
            onPointerCancel={longPress.cancel}
            onPointerMove={longPress.move}
            onPointerUp={longPress.cancel}
          >
            {empty && (
              <Empty
                className="mt-2"
                description="Las escenas que salgan al aire desde este dispositivo aparecen acá."
                icon={ListVideo}
                title="Nada reciente"
              />
            )}
            {groups.map(
              (group) =>
                group.scenes.length > 0 && (
                  <section
                    key={group.category}
                    className="[contain-intrinsic-size:auto_480px] [content-visibility:auto]"
                  >
                    {(shownFilter === "all" || shownFilter === "recent") && (
                      <h3 className="sticky top-0 z-10 -mx-3 bg-card px-3 py-1.5 text-[11px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
                        {group.title} · {group.scenes.length}
                      </h3>
                    )}
                    <div
                      className={cn(
                        "pb-3",
                        shownView === "grid"
                          ? "grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2.5"
                          : "space-y-1.5"
                      )}
                    >
                      {group.scenes.map((id) => (
                        <Item
                          key={id}
                          actions={actions}
                          id={id}
                          live={tally.live === id}
                          preview={tally.preview === id}
                          queued={tally.queued.get(id)}
                        />
                      ))}
                    </div>
                  </section>
                )
            )}
          </div>
        </ContextMenuTrigger>
        {menuFor && <ActionsContext actions={sceneActions(menuFor, actions)} title={SCENES[menuFor].title} />}
      </ContextMenu>
    </div>
  );
}

export const SceneLibrary = memo(SceneLibraryView);
