"use client";

import { memo, useDeferredValue, useMemo, useRef, useState } from "react";
import { Smartphone } from "lucide-react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "components/shared/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "components/shared/ui/dialog";
import { Kbd } from "components/shared/ui/kbd";
import { INTERACTIVE_SCENES, SCENES, SCENE_GROUPS, type SceneId } from "lib/owy-stage/scenes";

const PHONE = new Set<string>(INTERACTIVE_SCENES);
/** Accent- and case-insensitive: "cancion" finds "Canción". */
const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

type Intent = "preview" | "queue" | "air";
type Section = { key: string; heading: string; scenes: readonly SceneId[] };

/** What an item answers to: its group, id and title (a full hit), or its id and description (half). */
const itemValue = (group: string, id: SceneId) => `${group}:${id} ${SCENES[id].title}`;
const folded = new Map<string, [string, string]>();
function score(group: string, id: SceneId, query: string) {
  const value = itemValue(group, id);
  let keys = folded.get(value);
  if (!keys) {
    keys = [fold(value), fold(`${id} ${SCENES[id].description}`)];
    folded.set(value, keys);
  }
  if (keys[0].includes(query)) return 1;

  return keys[1].includes(query) ? 0.5 : 0;
}

/** A hit in the title (or id) ranks above one only in the description; groups follow their best hit. */
function rank(sections: Section[], query: string) {
  if (!query) return sections;

  return sections
    .map((section) => {
      const hits = section.scenes
        .map((id) => [id, score(section.key, id, query)] as const)
        .filter(([, points]) => points > 0)
        .sort((a, b) => b[1] - a[1]);

      return { ...section, scenes: hits.map(([id]) => id), best: hits[0]?.[1] ?? 0 };
    })
    .filter((section) => section.scenes.length > 0)
    .sort((a, b) => b.best - a.best);
}

function SceneItem({ id, group, onPick }: { id: SceneId; group: string; onPick: (id: SceneId) => void }) {
  const scene = SCENES[id];

  return (
    <CommandItem className="gap-3 py-2" value={itemValue(group, id)} onSelect={() => onPick(id)}>
      <img
        alt=""
        className="aspect-video w-16 shrink-0 rounded bg-black object-cover"
        decoding="async"
        draggable={false}
        loading="lazy"
        src={`/owy-stage/thumbs/${id}.jpg`}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{scene.title}</p>
        <p className="truncate text-xs text-muted-foreground">{scene.description}</p>
      </div>
      {PHONE.has(id) && <Smartphone className="h-4 w-4 shrink-0 text-muted-foreground" />}
    </CommandItem>
  );
}

/**
 * The palette itself, mounted with the dialog (so every opening starts empty).
 * The field answers each key at once and the list catches up right after, so
 * typing never waits for two hundred items; the whole catalogue also follows
 * a frame after the favorites and recents, which show at once.
 */
function PaletteBody({
  favorites,
  recent,
  onChoose,
}: {
  favorites: SceneId[];
  recent: SceneId[];
  onChoose: (id: SceneId, intent: Intent) => void;
}) {
  // cmdk's onSelect carries no modifiers: read them off the key or the pointer that triggered it.
  const intent = useRef<Intent>("preview");
  const read = (event: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean }) => {
    intent.current = event.metaKey || event.ctrlKey ? "queue" : event.shiftKey ? "air" : "preview";
  };
  const pick = (id: SceneId) => onChoose(id, intent.current);

  const [search, setSearch] = useState("");
  const query = useDeferredValue(fold(search.trim()));
  const everything = useDeferredValue(true, false);
  const results = useMemo(() => {
    const sections: Section[] = [];
    if (favorites.length) sections.push({ key: "fav", heading: "Favoritos", scenes: favorites });
    if (recent.length) sections.push({ key: "recent", heading: "Recientes", scenes: recent });
    if (everything)
      for (const group of SCENE_GROUPS)
        sections.push({ key: group.category, heading: group.title, scenes: group.scenes });

    return rank(sections, query);
  }, [favorites, recent, everything, query]);

  // Enter takes the first hit, as soon as the list it belongs to shows.
  const first = results[0] ? itemValue(results[0].key, results[0].scenes[0]) : "";
  const [selected, setSelected] = useState(first);
  const [selectedFor, setSelectedFor] = useState(results);
  if (selectedFor !== results) {
    setSelectedFor(results);
    setSelected(first);
  }

  return (
    <Command
      className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-input]]:h-12"
      shouldFilter={false}
      value={selected}
      onKeyDown={(event) => event.key === "Enter" && read(event)}
      onPointerDown={read}
      onValueChange={setSelected}
    >
      <CommandInput
        className="text-base sm:text-sm pointer-coarse:sm:text-base"
        placeholder="Buscar escena… (encuesta, countdown, sponsors)"
        value={search}
        onValueChange={setSearch}
      />
      <CommandList className="max-h-[min(60vh,520px)]">
        {everything && <CommandEmpty>Ninguna escena coincide.</CommandEmpty>}
        {results.map((section) => (
          // Out of view, a group of rows costs no style or layout until it scrolls in.
          <CommandGroup
            key={section.key}
            className="[contain-intrinsic-size:auto_320px] [content-visibility:auto]"
            heading={section.heading}
          >
            {section.scenes.map((id) => (
              <SceneItem key={id} group={section.key} id={id} onPick={pick} />
            ))}
          </CommandGroup>
        ))}
      </CommandList>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-3 py-2 text-xs text-muted-foreground pointer-coarse:hidden">
        <span>
          <Kbd>↵</Kbd> preview
        </span>
        <span>
          <Kbd>⌘↵</Kbd> a la cola
        </span>
        <span>
          <Kbd>⇧↵</Kbd> al aire ya
        </span>
      </div>
    </Command>
  );
}

/**
 * Every scene, searchable from the keyboard (`/`): Enter stages it in
 * preview, ⌘↵ queues it, ⇧↵ puts it on air at once. A tap stages it.
 */
function ScenePaletteView({
  open,
  onOpenChange,
  favorites,
  recent,
  onChoose,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  favorites: SceneId[];
  recent: SceneId[];
  onChoose: (id: SceneId, intent: Intent) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl overflow-hidden p-0 shadow-lg">
        <DialogTitle className="sr-only">Buscar escena</DialogTitle>
        <DialogDescription className="sr-only">
          Enter la pone en preview, Comando más Enter la manda a la cola y Mayúsculas más Enter la pone al aire.
        </DialogDescription>
        <PaletteBody
          favorites={favorites}
          recent={recent}
          onChoose={(id, intent) => {
            onChoose(id, intent);
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

export const ScenePalette = memo(ScenePaletteView);
