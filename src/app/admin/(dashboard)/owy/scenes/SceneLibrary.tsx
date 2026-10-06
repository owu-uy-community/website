"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, ListPlus, Search, Smartphone, Star, X } from "lucide-react";

import { SceneThumb } from "components/Admin/stage/SceneThumb";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Card, CardContent } from "components/shared/ui/card";
import { Input } from "components/shared/ui/input";
import {
  INTERACTIVE_SCENES,
  SCENES,
  SCENE_CATEGORIES,
  SCENE_GROUPS,
  isSceneId,
  type SceneCategory,
  type SceneId,
} from "lib/owy-stage/scenes";

type Filter = "all" | "favorites" | "recent" | SceneCategory;

const PHONE = new Set<string>(INTERACTIVE_SCENES);
const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** A list of scene ids kept in localStorage (favorites, recents, the rundown). */
function useStoredIds(key: string) {
  const [ids, setIds] = useState<SceneId[]>([]);
  useEffect(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem(key) ?? "[]") as unknown;
      if (Array.isArray(stored)) setIds(stored.filter((id): id is SceneId => typeof id === "string" && isSceneId(id)));
    } catch {
      // Corrupt or missing: start empty.
    }
  }, [key]);
  const update = (next: SceneId[] | ((prev: SceneId[]) => SceneId[])) =>
    setIds((prev) => {
      const value = typeof next === "function" ? next(prev) : next;
      window.localStorage.setItem(key, JSON.stringify(value));
      return value;
    });
  return [ids, update] as const;
}

export function SceneLibrary({
  liveScene,
  pending,
  take,
  queue,
  copyUrl,
}: {
  liveScene: SceneId;
  pending: boolean;
  take: (id: SceneId) => void;
  /** Append to the guion (the player above owns the order and the timing). */
  queue: (id: SceneId) => void;
  copyUrl: (id: SceneId) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [favorites, setFavorites] = useStoredIds("owy-stage-favorites");
  const [recent, setRecent] = useStoredIds("owy-stage-recent");

  // `/` jumps to the search box, Escape clears it.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (event.key === "/" && !typing) {
        event.preventDefault();
        document.getElementById("scene-search")?.focus();
      }
      if (event.key === "Escape" && target?.id === "scene-search") setQuery("");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const put = (id: SceneId) => {
    take(id);
    setRecent((prev) => [id, ...prev.filter((r) => r !== id)].slice(0, 12));
  };
  const toggleFavorite = (id: SceneId) =>
    setFavorites((prev) => (prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]));
  const q = fold(query.trim());
  const matches = (id: SceneId) => !q || fold(`${id} ${SCENES[id].title} ${SCENES[id].description}`).includes(q);
  const groups = useMemo(() => {
    if (filter === "favorites")
      return [{ category: "favorites", title: "Favoritos", scenes: favorites.filter(matches) }];
    if (filter === "recent") return [{ category: "recent", title: "Recientes", scenes: recent.filter(matches) }];
    return SCENE_GROUPS.filter((g) => filter === "all" || g.category === filter)
      .map((g) => ({ ...g, scenes: g.scenes.filter(matches) }))
      .filter((g) => g.scenes.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, favorites, recent, q]);
  const shown = groups.reduce((n, g) => n + g.scenes.length, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <h2 className="font-display text-lg font-semibold">
          Escenas{" "}
          <span className="text-sm font-normal text-muted-foreground">
            · {shown} de {Object.keys(SCENES).length}
          </span>
        </h2>
        <div className="relative w-full lg:w-[360px]">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pr-9 pl-9"
            id="scene-search"
            placeholder="Buscar escena…  ( / )"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              aria-label="Limpiar"
              className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setQuery("")}
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(
          [
            ["all", "Todas"],
            ["favorites", `★ Favoritos${favorites.length ? ` · ${favorites.length}` : ""}`],
            ["recent", "Recientes"],
            ...SCENE_GROUPS.map((g) => [g.category, `${g.title} · ${g.scenes.length}`] as const),
          ] as const
        ).map(([id, label]) => (
          <Button
            key={id}
            className="h-8 rounded-full"
            size="sm"
            variant={filter === id ? "default" : "outline"}
            onClick={() => setFilter(id)}
          >
            {label}
          </Button>
        ))}
      </div>

      {groups.length === 0 && (
        <p className="py-10 text-center text-sm text-muted-foreground">
          {filter === "favorites"
            ? "Marcá escenas con ★ para tenerlas acá."
            : filter === "recent"
              ? "Las escenas que pongas en pantalla aparecen acá."
              : "Nada coincide con la búsqueda."}
        </p>
      )}
      {groups.map((group) => (
        <section key={group.category}>
          {(filter === "all" || groups.length > 1) && (
            <h3 className="mb-2 text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase">
              {group.title} · {group.scenes.length}
            </h3>
          )}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
            {group.scenes.map((id) => {
              const onAir = liveScene === id;
              const starred = favorites.includes(id);
              return (
                <Card key={id} className={`flex flex-col ${onAir ? "ring-2 ring-[#F5BB03]" : ""}`}>
                  <CardContent className="flex flex-1 flex-col gap-3 p-3">
                    <div className="relative">
                      <SceneThumb id={id} title={SCENES[id].title} />
                      {onAir && (
                        <Badge className="absolute top-2 left-2 bg-red-600 text-white hover:bg-red-600">AL AIRE</Badge>
                      )}
                      {PHONE.has(id) && (
                        <Badge
                          className="absolute top-2 right-2 gap-1"
                          title="La gente participa desde el celular"
                          variant="secondary"
                        >
                          <Smartphone className="h-3 w-3" /> celular
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{SCENES[id].title}</p>
                        <p className="line-clamp-2 text-xs text-muted-foreground" title={SCENES[id].description}>
                          {SCENES[id].description}
                        </p>
                      </div>
                      <button
                        aria-label={starred ? "Quitar de favoritos" : "Marcar favorito"}
                        className={`shrink-0 ${starred ? "text-[#F5BB03]" : "text-muted-foreground hover:text-foreground"}`}
                        onClick={() => toggleFavorite(id)}
                        type="button"
                      >
                        <Star className="h-4 w-4" fill={starred ? "currentColor" : "none"} />
                      </button>
                    </div>
                    <div className="mt-auto flex items-center gap-1.5">
                      <Button
                        className="flex-1"
                        disabled={pending}
                        size="sm"
                        variant={onAir ? "secondary" : "default"}
                        onClick={() => put(id)}
                      >
                        {onAir ? "Al aire" : "Poner en pantalla"}
                      </Button>
                      <Button size="icon" title="Agregar al guion" variant="ghost" onClick={() => queue(id)}>
                        <ListPlus className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        title="Copiar URL de esta escena (fuente fija para OBS)"
                        variant="ghost"
                        onClick={() => copyUrl(id)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      ))}
      {filter !== "all" && (
        <p className="text-xs text-muted-foreground">
          Categoría: {filter in SCENE_CATEGORIES ? SCENE_CATEGORIES[filter as SceneCategory].title : filter}.
        </p>
      )}
    </div>
  );
}
