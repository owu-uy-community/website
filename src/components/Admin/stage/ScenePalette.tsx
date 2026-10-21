"use client";

import { memo, useRef } from "react";
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

function SceneItem({ id, group, onPick }: { id: SceneId; group: string; onPick: (id: SceneId) => void }) {
  const scene = SCENES[id];

  return (
    <CommandItem
      className="gap-3 py-2"
      keywords={[id, scene.description]}
      value={`${group}:${id} ${scene.title}`}
      onSelect={() => onPick(id)}
    >
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
  // cmdk's onSelect carries no modifiers: read them off the key or the pointer that triggered it.
  const intent = useRef<Intent>("preview");
  const read = (event: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean }) => {
    intent.current = event.metaKey || event.ctrlKey ? "queue" : event.shiftKey ? "air" : "preview";
  };
  const pick = (id: SceneId) => {
    onChoose(id, intent.current);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl overflow-hidden p-0 shadow-lg">
        <DialogTitle className="sr-only">Buscar escena</DialogTitle>
        <DialogDescription className="sr-only">
          Enter la pone en preview, Comando más Enter la manda a la cola y Mayúsculas más Enter la pone al aire.
        </DialogDescription>
        <Command
          className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-input]]:h-12"
          // A hit in the title (or id) ranks above one only in the description.
          filter={(value, search, keywords) => {
            const query = fold(search.trim());
            if (fold(value).includes(query)) return 1;

            return fold((keywords ?? []).join(" ")).includes(query) ? 0.5 : 0;
          }}
          onKeyDown={(event) => event.key === "Enter" && read(event)}
          onPointerDown={read}
        >
          <CommandInput placeholder="Buscar escena… (encuesta, countdown, sponsors)" />
          <CommandList className="max-h-[min(60vh,520px)]">
            <CommandEmpty>Ninguna escena coincide.</CommandEmpty>
            {favorites.length > 0 && (
              <CommandGroup heading="Favoritos">
                {favorites.map((id) => (
                  <SceneItem key={`fav-${id}`} group="fav" id={id} onPick={pick} />
                ))}
              </CommandGroup>
            )}
            {recent.length > 0 && (
              <CommandGroup heading="Recientes">
                {recent.map((id) => (
                  <SceneItem key={`recent-${id}`} group="recent" id={id} onPick={pick} />
                ))}
              </CommandGroup>
            )}
            {SCENE_GROUPS.map((group) => (
              <CommandGroup key={group.category} heading={group.title}>
                {group.scenes.map((id) => (
                  <SceneItem key={id} group={group.category} id={id} onPick={pick} />
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
      </DialogContent>
    </Dialog>
  );
}

export const ScenePalette = memo(ScenePaletteView);
