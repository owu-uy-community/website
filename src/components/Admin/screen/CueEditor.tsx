"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";

import { cn } from "app/lib/utils";
import { Button } from "components/shared/ui/button";
import { Input } from "components/shared/ui/input";
import { Label } from "components/shared/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "components/shared/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "components/shared/ui/sheet";
import { Switch } from "components/shared/ui/switch";
import { Textarea } from "components/shared/ui/textarea";
import { toast } from "components/shared/ui/toast-utils";
import { SOUNDS } from "lib/launchpad/sounds";
import type { ObsView } from "lib/obs/actions";
import { orpc } from "lib/orpc/client";
import { CUE_COLORS, type CreateCueInput, type CueColor } from "lib/orpc/obs-control/schemas";
import type { Cue } from "lib/orpc/obs-control/services";
import { SCENES, SCENE_GROUPS, isSceneId, parseSceneParams, type SceneId } from "lib/owy-stage/scenes";

const NONE = "__none__";

export const CUE_COLOR_CLASS: Record<CueColor, string> = {
  yellow: "bg-yellow-400",
  red: "bg-red-500",
  green: "bg-green-500",
  blue: "bg-sky-500",
  purple: "bg-purple-500",
  gray: "bg-zinc-500",
};

/** Draft of a cue being edited; `null` id = new. */
export type CueDraft = Partial<Cue> & { id?: string };

/**
 * Sheet to create/edit a cue: the OBS scene (+ transition), the wall scene
 * (+ its params, generated from the scene's schema like the director page
 * does) and a launchpad sound. Any leg can be empty.
 */
export function CueEditor({
  instanceId,
  draft,
  view,
  onClose,
}: {
  instanceId: number;
  draft: CueDraft | null;
  view: ObsView;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const cuesKey = orpc.obsCue.list.queryKey({ input: { instanceId } });
  const [color, setColor] = useState<CueColor | null>(draft?.color ?? null);
  const [obsScene, setObsScene] = useState(draft?.obsScene ?? "");
  const [transition, setTransition] = useState(draft?.transition ?? "");
  const [stageScene, setStageScene] = useState<SceneId | "">(
    draft?.stageScene && isSceneId(draft.stageScene) ? draft.stageScene : ""
  );
  const [sound, setSound] = useState(draft?.sound ?? "");

  const done = (message: string) => () => {
    toast.success(message);
    queryClient.invalidateQueries({ queryKey: cuesKey });
    onClose();
  };
  const fail = (title: string) => (error: Error) => toast.error(title, error.message);
  const create = useMutation(
    orpc.obsCue.create.mutationOptions({ onSuccess: done("Cue creado"), onError: fail("No se pudo crear") })
  );
  const update = useMutation(
    orpc.obsCue.update.mutationOptions({ onSuccess: done("Cue guardado"), onError: fail("No se pudo guardar") })
  );
  const remove = useMutation(
    orpc.obsCue.remove.mutationOptions({ onSuccess: done("Cue eliminado"), onError: fail("No se pudo eliminar") })
  );
  const saving = create.isPending || update.isPending;

  const stageDefaults = stageScene
    ? (parseSceneParams(stageScene, stageScene === draft?.stageScene ? (draft?.stageParams ?? {}) : {}) as Record<
        string,
        string | number | boolean
      >)
    : {};
  const paramKeys = Object.keys(stageDefaults);
  const obsOptions = obsScene && !view.scenes.includes(obsScene) ? [obsScene, ...view.scenes] : view.scenes;

  return (
    <Sheet open={draft !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{draft?.id ? "Editar cue" : "Nuevo cue"}</SheetTitle>
          <SheetDescription>
            Una tecla: escena de OBS + escena de la pantalla + sonido. Dejá vacío lo que no aplique.
          </SheetDescription>
        </SheetHeader>
        <form
          className="mt-4 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const hotkey = String(form.get("hotkey") ?? "")
              .trim()
              .toUpperCase();
            const transitionMs = String(form.get("transitionMs") ?? "").trim();
            const stageParams = stageScene
              ? Object.fromEntries(
                  paramKeys.map((key) =>
                    typeof stageDefaults[key] === "boolean"
                      ? [key, form.get(`p:${key}`) === "on"]
                      : typeof stageDefaults[key] === "number"
                        ? [key, Number(form.get(`p:${key}`) ?? stageDefaults[key])]
                        : [key, String(form.get(`p:${key}`) ?? "")]
                  )
                )
              : null;
            const fields: Omit<CreateCueInput, "instanceId"> = {
              name: String(form.get("name") ?? "").trim(),
              color,
              obsScene: obsScene || null,
              transition: transition || null,
              transitionMs: transitionMs ? Number(transitionMs) : null,
              stageScene: stageScene || null,
              stageParams,
              sound: sound || null,
              notes: String(form.get("notes") ?? "").trim() || null,
              hotkey: /^[A-Z]$/.test(hotkey) ? hotkey : null,
            };
            if (!fields.name) return;
            if (draft?.id) update.mutate({ id: draft.id, ...fields });
            else create.mutate({ instanceId, ...fields });
          }}
        >
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cue-name">Nombre</Label>
              <Input autoFocus defaultValue={draft?.name ?? ""} id="cue-name" name="name" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cue-hotkey">Tecla</Label>
              <Input
                className="w-16 text-center uppercase"
                defaultValue={draft?.hotkey ?? ""}
                id="cue-hotkey"
                maxLength={1}
                name="hotkey"
                placeholder="A–Z"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Color</Label>
            <div className="flex gap-2">
              {CUE_COLORS.map((option) => (
                <button
                  key={option}
                  aria-label={option}
                  className={cn(
                    "h-7 w-7 rounded-full ring-offset-background transition-transform",
                    CUE_COLOR_CLASS[option],
                    color === option ? "scale-110 ring-2 ring-foreground ring-offset-2" : "opacity-60 hover:opacity-100"
                  )}
                  type="button"
                  onClick={() => setColor(color === option ? null : option)}
                />
              ))}
            </div>
          </div>

          <fieldset className="space-y-3 rounded-lg border border-border p-3">
            <legend className="px-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">OBS</legend>
            <div className="space-y-1.5">
              <Label>Escena</Label>
              <Select value={obsScene || NONE} onValueChange={(value) => setObsScene(value === NONE ? "" : value)}>
                <SelectTrigger>
                  <SelectValue placeholder="(ninguna)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>(ninguna)</SelectItem>
                  {obsOptions.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!view.connected && (
                <p className="text-xs text-muted-foreground">Conectate a OBS para elegir de la lista.</p>
              )}
            </div>
            <div className="grid grid-cols-[1fr_7rem] gap-3">
              <div className="space-y-1.5">
                <Label>Transición</Label>
                <Select
                  value={transition || NONE}
                  onValueChange={(value) => setTransition(value === NONE ? "" : value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="(la actual)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>(la actual)</SelectItem>
                    {(transition && !view.transitions.includes(transition)
                      ? [transition, ...view.transitions]
                      : view.transitions
                    ).map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cue-ms">Duración ms</Label>
                <Input
                  defaultValue={draft?.transitionMs ?? ""}
                  id="cue-ms"
                  min={0}
                  name="transitionMs"
                  step={50}
                  type="number"
                />
              </div>
            </div>
          </fieldset>

          <fieldset className="space-y-3 rounded-lg border border-border p-3">
            <legend className="px-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Pantalla Owy
            </legend>
            <Select
              value={stageScene || NONE}
              onValueChange={(value) => setStageScene(value === NONE ? "" : (value as SceneId))}
            >
              <SelectTrigger>
                <SelectValue placeholder="(sin cambio)" />
              </SelectTrigger>
              <SelectContent className="max-h-80">
                <SelectItem value={NONE}>(sin cambio)</SelectItem>
                {SCENE_GROUPS.map((group) => (
                  <SelectGroup key={group.category}>
                    <SelectLabel>{group.title}</SelectLabel>
                    {group.scenes.map((id) => (
                      <SelectItem key={id} value={id}>
                        {SCENES[id].title}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
            {stageScene && (
              <div className="flex items-start gap-3">
                <img
                  alt=""
                  className="w-32 shrink-0 rounded border border-border bg-black object-cover"
                  src={`/owy-stage/thumbs/${stageScene}.jpg`}
                />
                <p className="text-xs text-muted-foreground">{SCENES[stageScene].description}</p>
              </div>
            )}
            {paramKeys.map((key) => (
              <div key={`${stageScene}:${key}`} className="flex items-center gap-3">
                <Label className="w-24 shrink-0 capitalize" htmlFor={`cue-p-${key}`}>
                  {key}
                </Label>
                {typeof stageDefaults[key] === "boolean" ? (
                  <Switch defaultChecked={stageDefaults[key]} id={`cue-p-${key}`} name={`p:${key}`} />
                ) : (
                  <Input
                    defaultValue={String(stageDefaults[key])}
                    id={`cue-p-${key}`}
                    name={`p:${key}`}
                    type={typeof stageDefaults[key] === "number" ? "number" : "text"}
                  />
                )}
              </div>
            ))}
          </fieldset>

          <div className="space-y-1.5">
            <Label>Sonido (launchpad)</Label>
            <Select value={sound || NONE} onValueChange={(value) => setSound(value === NONE ? "" : value)}>
              <SelectTrigger>
                <SelectValue placeholder="(ninguno)" />
              </SelectTrigger>
              <SelectContent className="max-h-80">
                <SelectItem value={NONE}>(ninguno)</SelectItem>
                {SOUNDS.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cue-notes">Notas</Label>
            <Textarea
              defaultValue={draft?.notes ?? ""}
              id="cue-notes"
              name="notes"
              placeholder="Qué pasa en este momento, quién habla…"
              rows={2}
            />
          </div>

          <div className="flex items-center justify-between gap-2 pt-2">
            {draft?.id ? (
              <Button
                disabled={remove.isPending}
                size="sm"
                type="button"
                variant="ghost"
                onClick={() => window.confirm(`¿Eliminar el cue "${draft.name}"?`) && remove.mutate({ id: draft.id! })}
              >
                <Trash2 className="h-4 w-4" /> Eliminar
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button size="sm" type="button" variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button disabled={saving} size="sm" type="submit">
                Guardar
              </Button>
            </div>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
