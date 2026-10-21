"use client";

import { memo, useMemo } from "react";
import {
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "components/shared/ui/dropdown-menu";
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

function Tags({ id, tally, favorite }: { id: SceneId; tally: LibraryTally; favorite: boolean }) {
  const position = tally.queued.get(id);

  return (
    <>
      <span className="pointer-events-none absolute top-1.5 left-1.5 flex gap-1">
        {tally.live === id && (
          <span className="rounded bg-red-600 px-1.5 text-[10px] leading-[18px] font-bold tracking-wide text-white">
            AL AIRE
          </span>
        )}
        {tally.preview === id && (
          <span className="rounded bg-green-600 px-1.5 text-[10px] leading-[18px] font-bold tracking-wide text-white">
            PREVIEW
          </span>
        )}
        {position && (
          <span className="rounded bg-primary px-1.5 text-[10px] leading-[18px] font-bold tracking-wide text-primary-foreground">
            COLA #{position}
          </span>
        )}
      </span>
      <span className="pointer-events-none absolute top-1.5 right-1.5 flex gap-1">
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

function SceneMenu({ id, favorite, actions }: { id: SceneId; favorite: boolean; actions: LibraryActions }) {
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
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onSelect={() => actions.airNow(id)}>
          <Zap className="mr-2 h-4 w-4 text-red-400" /> Al aire ya
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => actions.queue(id)}>
          <ListPlus className="mr-2 h-4 w-4" /> Agregar a la cola
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => actions.guion(id)}>
          <ListVideo className="mr-2 h-4 w-4" /> Agregar al guion
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => actions.toggleFavorite(id)}>
          <Star className="mr-2 h-4 w-4" fill={favorite ? "currentColor" : "none"} />
          {favorite ? "Quitar de favoritos" : "Marcar favorito"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => actions.copyUrl(id)}>
          <Copy className="mr-2 h-4 w-4" /> Copiar URL para OBS
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={`/owy/stage/${id}`} rel="noopener" target="_blank">
            <ExternalLink className="mr-2 h-4 w-4" /> Abrir en otra pestaña
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ringFor(id: SceneId, tally: LibraryTally) {
  if (tally.live === id) return "border-transparent ring-2 ring-red-500";
  if (tally.preview === id) return "border-transparent ring-2 ring-green-500";

  return "hover:border-muted-foreground/40";
}

function Card({
  id,
  tally,
  favorite,
  actions,
}: {
  id: SceneId;
  tally: LibraryTally;
  favorite: boolean;
  actions: LibraryActions;
}) {
  const scene = SCENES[id];

  return (
    <div className={cn("overflow-hidden rounded-lg border bg-card transition-colors", ringFor(id, tally))}>
      <button
        aria-label={`${scene.title}: a la preview`}
        className="relative block w-full touch-manipulation text-left select-none [-webkit-touch-callout:none]"
        title={scene.description}
        type="button"
        onClick={(event) => {
          actions.pick(id);
          releaseFocus(event);
        }}
      >
        <SceneThumb className="rounded-none" id={id} title={scene.title} />
        <Tags favorite={favorite} id={id} tally={tally} />
      </button>
      <div className="flex items-center gap-0.5 py-1 pr-1 pl-2.5">
        <span className="min-w-0 flex-1 truncate text-xs font-semibold">{scene.title}</span>
        <Button
          aria-label={`Agregar ${scene.title} a la cola`}
          className="h-8 w-8 shrink-0 text-muted-foreground pointer-coarse:h-10 pointer-coarse:w-10"
          size="icon"
          title="Agregar a la cola"
          variant="ghost"
          onClick={(event) => {
            actions.queue(id);
            releaseFocus(event);
          }}
        >
          <Plus className="h-4 w-4" />
        </Button>
        <SceneMenu actions={actions} favorite={favorite} id={id} />
      </div>
    </div>
  );
}

function Row({
  id,
  tally,
  favorite,
  actions,
}: {
  id: SceneId;
  tally: LibraryTally;
  favorite: boolean;
  actions: LibraryActions;
}) {
  const scene = SCENES[id];

  return (
    <div className={cn("relative flex items-center gap-3 rounded-lg border bg-card p-1.5 pr-1", ringFor(id, tally))}>
      {/* The whole row picks; the buttons on top keep their own action. */}
      <button
        aria-label={`${scene.title}: a la preview`}
        className="absolute inset-0 touch-manipulation rounded-lg"
        type="button"
        onClick={(event) => {
          actions.pick(id);
          releaseFocus(event);
        }}
      />
      <div className="pointer-events-none relative w-24 shrink-0">
        <SceneThumb className="rounded" id={id} title={scene.title} />
        <Tags favorite={favorite} id={id} tally={{ ...tally, queued: new Map() }} />
      </div>
      <div className="pointer-events-none min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">
          {scene.title}
          {tally.queued.get(id) && (
            <span className="ml-2 text-xs font-medium text-primary">cola #{tally.queued.get(id)}</span>
          )}
        </p>
        <p className="truncate text-xs text-muted-foreground">{scene.description}</p>
      </div>
      <div className="relative flex items-center">
        <Button
          aria-label={`Agregar ${scene.title} a la cola`}
          className="h-9 w-9 text-muted-foreground pointer-coarse:h-10 pointer-coarse:w-10"
          size="icon"
          variant="ghost"
          onClick={(event) => {
            actions.queue(id);
            releaseFocus(event);
          }}
        >
          <Plus className="h-4 w-4" />
        </Button>
        <SceneMenu actions={actions} favorite={favorite} id={id} />
      </div>
    </div>
  );
}

/**
 * Every scene the wall can show, by category, in the day's order. Tapping a
 * card stages it in preview — nothing goes on air from here except through
 * «⋯ → Al aire ya». The filter and the grid/list view are per device.
 */
function SceneLibraryView({
  tally,
  favorites,
  recent,
  actions,
}: {
  tally: LibraryTally;
  favorites: SceneId[];
  recent: SceneId[];
  actions: LibraryActions;
}) {
  const [filter, setFilter] = useStoredState<Filter>("owy-stage-library-filter", "all", isFilter);
  const [view, setView] = useStoredState<View>("owy-stage-library-view", "grid", isView);
  const starred = useMemo(() => new Set(favorites), [favorites]);

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
        <div className="min-w-0 flex-1 [scrollbar-width:none] overflow-x-auto [mask-image:linear-gradient(90deg,#000_92%,transparent)] [&::-webkit-scrollbar]:hidden">
          <ToggleGroup
            className="w-max justify-start gap-1.5"
            type="single"
            value={filter}
            onValueChange={(value) => value && setFilter(value as Filter)}
          >
            {chips.map(([id, label, count]) => (
              <ToggleGroupItem
                key={id}
                className="h-8 rounded-full border border-input px-3 text-xs whitespace-nowrap data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground pointer-coarse:h-10"
                value={id}
              >
                {label}
                {count !== null && <span className="opacity-60">{count}</span>}
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

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
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
                    {filter === "favorites" && <span className="ml-2 tracking-normal normal-case">teclas 1–9</span>}
                  </h3>
                )}
                <div
                  className={cn(
                    "pb-3",
                    view === "grid" ? "grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2.5" : "space-y-1.5"
                  )}
                >
                  {group.scenes.map((id) =>
                    view === "grid" ? (
                      <Card key={id} actions={actions} favorite={starred.has(id)} id={id} tally={tally} />
                    ) : (
                      <Row key={id} actions={actions} favorite={starred.has(id)} id={id} tally={tally} />
                    )
                  )}
                </div>
              </section>
            )
        )}
      </div>
    </div>
  );
}

export const SceneLibrary = memo(SceneLibraryView);
