"use client";

import { memo, useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { AnimatePresence, Reorder, useDragControls } from "motion/react";
import {
  ArrowUpDown,
  Check,
  Copy,
  Eye,
  GripVertical,
  Link2,
  ListPlus,
  ListVideo,
  Pencil,
  RefreshCw,
  Smartphone,
  Star,
  Trash2,
  Zap,
} from "lucide-react";

import { cn } from "app/lib/utils";
import { Button, type ButtonProps } from "components/shared/ui/button";
import { ContextMenu, ContextMenuTrigger } from "components/shared/ui/context-menu";
import { Empty } from "components/shared/ui/empty";
import { Input } from "components/shared/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "components/shared/ui/popover";
import { toast } from "components/shared/ui/toast-utils";
import { showsPreset } from "lib/owy-stage/desk";
import {
  INTERACTIVE_SCENES,
  SCENES,
  presetLabel,
  type DeskStep,
  type Preset,
  type SceneId,
  type StageState,
} from "lib/owy-stage/scenes";

import { haptic } from "./haptics";
import { ActionsContext, ActionsMenuButton, useLongPress, type MenuAction } from "./menus";
import { paramText, stepSummary } from "./Queue";
import { Tag, ringFor } from "./SceneLibrary";
import { SceneThumb } from "./SceneThumb";
import { holdTake, releaseFocus } from "./useStageHotkeys";

type Params = Record<string, unknown>;

const PHONE = new Set<string>(INTERACTIVE_SCENES);

/** What the presets can do; the page wires them to the desk, the wall and the guion. */
export type PresetActions = {
  /** Into preview: a tap, keys 1–9. */
  pick: (preset: Preset) => void;
  /** Straight on air: ⇧, «Al aire ya». */
  air: (preset: Preset) => void;
  queue: (preset: Preset) => void;
  guion: (preset: Preset) => void;
  rename: (id: string, name: string) => void;
  /** What is in preview, as a new preset at the end. */
  saveFromPreview: (name: string) => void;
  /** What is on air, as a new preset at the end. */
  saveFromLive: (name: string) => void;
  /** Overwrite a preset with what is in preview (keeping its name, unless one is given). */
  updateFromPreview: (id: string, name?: string) => void;
  duplicate: (id: string) => void;
  remove: (id: string) => void;
  restore: (preset: Preset, index: number) => void;
  /** While dragging: local only. */
  reorder: (presets: Preset[]) => void;
  persistOrder: () => void;
  copyUrl: (preset: Preset) => void;
};

/** Out of the presets, with a way back: the menu is quick to hit by accident on a phone. */
function removeWithUndo(preset: Preset, index: number, actions: PresetActions) {
  actions.remove(preset.id);
  toast.success({
    title: "Preset quitado",
    description: presetLabel(preset),
    duration: 5000,
    action: { label: "Deshacer", onClick: () => actions.restore(preset, index) },
  });
}

function presetMenu(
  preset: Preset,
  index: number,
  actions: PresetActions,
  { canReplace, onRename }: { canReplace: boolean; onRename: (id: string) => void }
): MenuAction[] {
  return [
    { label: "A la preview", icon: Eye, tone: "preview", onSelect: () => actions.pick(preset) },
    { label: "Al aire ya", icon: Zap, tone: "air", onSelect: () => actions.air(preset) },
    { label: "Agregar a la cola", icon: ListPlus, group: true, onSelect: () => actions.queue(preset) },
    { label: "Agregar al guion", icon: ListVideo, onSelect: () => actions.guion(preset) },
    { label: "Renombrar", icon: Pencil, group: true, onSelect: () => onRename(preset.id) },
    {
      label: "Reemplazar con la preview",
      icon: RefreshCw,
      disabled: !canReplace,
      onSelect: () => actions.updateFromPreview(preset.id),
    },
    { label: "Duplicar", icon: Copy, onSelect: () => actions.duplicate(preset.id) },
    { label: "Copiar URL Stream Deck", icon: Link2, group: true, onSelect: () => actions.copyUrl(preset) },
    { label: "Quitar", icon: Trash2, tone: "danger", onSelect: () => removeWithUndo(preset, index, actions) },
  ];
}

type CardProps = {
  preset: Preset;
  index: number;
  live: boolean;
  preview: boolean;
  canReplace: boolean;
  actions: PresetActions;
  onRename: (id: string) => void;
};

/**
 * One preset as a big key, Stream Deck style: its picture, its name on it,
 * its number (keys 1–9) and the tally. A tap stages it in preview, ⇧ +
 * click puts it on air.
 */
function PresetCardView({ preset, index, live, preview, canReplace, actions, onRename }: CardProps) {
  const label = presetLabel(preset);
  const number = index + 1;
  const keyed = number <= 9;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border bg-card transition-[box-shadow,border-color] duration-300 select-none [-webkit-touch-callout:none]",
        ringFor(live, preview)
      )}
      data-preset={preset.id}
    >
      <div className="relative">
        <button
          aria-keyshortcuts={keyed ? String(number) : undefined}
          aria-label={`${label}: a la preview`}
          className="relative block w-full touch-manipulation text-left transition-transform duration-100 active:scale-[0.97]"
          title={keyed ? `Tecla ${number} a la preview · ⇧${number} al aire` : "⇧ + clic: al aire"}
          type="button"
          onClick={(event) => {
            if (event.shiftKey) actions.air(preset);
            else actions.pick(preset);
            releaseFocus(event);
          }}
        >
          <SceneThumb className="rounded-none" id={preset.scene} title={label} />
          <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-2.5 pt-8 pb-2">
            <span className="line-clamp-2 text-sm leading-tight font-bold text-white [text-shadow:0_1px_2px_rgb(0_0_0/0.6)]">
              {label}
            </span>
          </span>
          <span className="pointer-events-none absolute top-1.5 left-1.5 flex items-center gap-1">
            <span
              className={cn(
                "grid h-[18px] min-w-[18px] place-items-center rounded-sm px-1 font-terminal text-3xs font-semibold",
                keyed ? "bg-primary text-primary-foreground" : "bg-black/75 text-foreground"
              )}
            >
              {number}
            </span>
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
            </AnimatePresence>
          </span>
        </button>
        <div className="absolute top-1 right-1 rounded-md bg-black/75">
          <ActionsMenuButton
            actions={() => presetMenu(preset, index, actions, { canReplace, onRename })}
            className="h-7 w-7 text-white/85 hover:bg-white/15 hover:text-white pointer-coarse:h-8 pointer-coarse:w-8"
            label={`Más acciones para ${label}`}
            title={label}
          />
        </div>
      </div>
      <p className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted-foreground">
        <span className="truncate">{SCENES[preset.scene].title}</span>
        {PHONE.has(preset.scene) && <Smartphone className="h-3 w-3 shrink-0" />}
      </p>
    </div>
  );
}

const PresetCard = memo(PresetCardView);

/** One preset while ordering: drag the grip, rename in place, remove. */
function PresetRowView({
  preset,
  index,
  focus,
  actions,
}: {
  preset: Preset;
  index: number;
  focus: boolean;
  actions: PresetActions;
}) {
  const controls = useDragControls();
  const [name, setName] = useState(preset.name);
  const typing = useRef(false);
  const cancelled = useRef(false);
  // A rename from another device shows up, unless this field is being typed in.
  useEffect(() => {
    if (!typing.current) setName(preset.name);
  }, [preset.name]);

  return (
    <Reorder.Item
      className="flex items-center gap-1.5 rounded-lg border bg-card py-1.5 pr-1 pl-0.5"
      data-preset={preset.id}
      dragControls={controls}
      dragListener={false}
      value={preset}
      whileDrag={{ scale: 1.02, zIndex: 20, boxShadow: "0 8px 24px rgba(0,0,0,.35)" }}
      onDragEnd={actions.persistOrder}
    >
      <Button
        aria-label={`Mover ${presetLabel(preset)}`}
        className="h-10 w-6 cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
        size="icon"
        variant="ghost"
        onPointerDown={(event) => controls.start(event)}
      >
        <GripVertical className="h-4 w-4" />
      </Button>
      <span className="w-5 shrink-0 text-right font-terminal text-xs text-muted-foreground tabular-nums">
        {index + 1}
      </span>
      <SceneThumb className="hidden w-16 shrink-0 @[26rem]:block" id={preset.scene} title={presetLabel(preset)} />
      <div className="min-w-0 flex-1">
        <Input
          aria-label={`Nombre del preset ${index + 1}`}
          autoFocus={focus}
          className="h-9 pointer-coarse:h-10 pointer-coarse:text-base"
          maxLength={60}
          placeholder={SCENES[preset.scene].title}
          value={name}
          onBlur={() => {
            typing.current = false;
            if (cancelled.current) cancelled.current = false;
            else if (name.trim() !== preset.name) actions.rename(preset.id, name);
          }}
          onChange={(event) => {
            typing.current = true;
            setName(event.target.value);
          }}
          onFocus={(event) => event.currentTarget.select()}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              cancelled.current = true;
              setName(preset.name);
            }
            if (event.key === "Enter" || event.key === "Escape") {
              holdTake();
              event.currentTarget.blur();
            }
          }}
        />
        <p className="mt-0.5 truncate px-0.5 text-xs text-muted-foreground">
          {SCENES[preset.scene].title} · {stepSummary(preset.scene, preset.params)}
        </p>
      </div>
      <Button
        aria-label={`Quitar ${presetLabel(preset)}`}
        className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
        size="icon"
        variant="ghost"
        onClick={() => removeWithUndo(preset, index, actions)}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </Reorder.Item>
  );
}

const PresetRow = memo(PresetRowView);

/**
 * The presets: scenes with their params, saved under a name, one press away.
 * A tap stages one in preview (TAKE sends it), ⇧ + click or «Al aire ya»
 * puts it on air; the first nine are keys 1–9 and every one is a Stream Deck
 * URL. «Ordenar» turns the keys into a list to drag, rename and remove, so a
 * tap mid-show never moves one by accident. Shared by every admin device.
 */
function PresetsPanelView({
  presets,
  live,
  preview,
  actions,
}: {
  presets: Preset[];
  live: StageState;
  preview: DeskStep | null;
  actions: PresetActions;
}) {
  const [ordering, setOrdering] = useState(false);
  // With the last one removed there is nothing to order: the next one shows up as a key again.
  if (ordering && presets.length === 0) setOrdering(false);
  const [focus, setFocus] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const longPress = useLongPress();
  const onRename = useCallback((id: string) => {
    setFocus(id);
    setOrdering(true);
  }, []);
  const menuIndex = menuFor ? presets.findIndex((preset) => preset.id === menuFor) : -1;
  const presetAt = (event: React.MouseEvent | React.PointerEvent) =>
    (event.target as HTMLElement).closest<HTMLElement>("[data-preset]")?.dataset.preset ?? null;
  /** A press inside a card's open ⋯ menu reaches the grid through React, from a portal: not the grid's. */
  const fromPortal = (event: React.MouseEvent | React.PointerEvent) =>
    !event.currentTarget.contains(event.target as Node);

  // A handful of comparisons per change of what is on air or in preview.
  const tally = useMemo(
    () =>
      new Map(
        presets.map((preset) => [
          preset.id,
          {
            live: showsPreset(preset, live),
            preview: preview?.preset === preset.id || showsPreset(preset, preview),
          },
        ])
      ),
    [presets, live, preview]
  );

  return (
    <div className="@container flex h-full min-h-0 flex-col">
      <div className="flex min-h-12 shrink-0 items-center gap-2 border-b px-3 py-1.5">
        <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {ordering
            ? "Arrastrá para ordenar: los primeros nueve son las teclas 1 a 9."
            : `${presets.length} preset${presets.length === 1 ? "" : "s"}`}
          {!ordering && presets.length > 0 && (
            <span className="pointer-coarse:hidden"> · tecla 1–9 a la preview, ⇧ al aire</span>
          )}
        </p>
        {/* Always a new one from here: updating is the editor's (and the card menu's), which show which preset it is. */}
        {!ordering && (
          <SavePreset
            className="h-9"
            label="Guardar la preview"
            presets={presets}
            size="sm"
            step={preview}
            variant="outline"
            onSave={actions.saveFromPreview}
          />
        )}
        {presets.length > 0 && (
          <Button
            className="h-9"
            size="sm"
            variant={ordering ? "default" : "ghost"}
            onClick={(event) => {
              setOrdering((value) => !value);
              setFocus(null);
              releaseFocus(event);
            }}
          >
            {ordering ? <Check className="h-4 w-4" /> : <ArrowUpDown className="h-4 w-4" />}
            {ordering ? "Listo" : "Ordenar"}
          </Button>
        )}
      </div>

      {presets.length === 0 ? (
        <div className="flex min-h-0 flex-1 overflow-y-auto p-3">
          <Empty
            className="m-auto border-0 px-3 py-6"
            description="Guardá lo que está en preview con «Guardar preset», o una escena con «⋯ → Guardar como preset» en la biblioteca. Los primeros nueve salen con las teclas 1 a 9."
            icon={Star}
            title="Sin presets todavía"
          />
        </div>
      ) : ordering ? (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
          <Reorder.Group axis="y" className="space-y-1.5" values={presets} onReorder={actions.reorder}>
            {presets.map((preset, index) => (
              <PresetRow key={preset.id} actions={actions} focus={preset.id === focus} index={index} preset={preset} />
            ))}
          </Reorder.Group>
        </div>
      ) : (
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3"
              onContextMenu={(event) => {
                if (fromPortal(event)) return;
                const id = presetAt(event);
                if (!id) return event.preventDefault();
                setMenuFor(id);
              }}
              onPointerDown={(event) => {
                if (event.pointerType === "mouse" || fromPortal(event)) return;
                const id = presetAt(event);
                if (!id) return event.preventDefault();
                setMenuFor(id);
                longPress.start(event);
              }}
              onPointerCancel={longPress.cancel}
              onPointerMove={longPress.move}
              onPointerUp={longPress.cancel}
            >
              <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2.5">
                {presets.map((preset, index) => (
                  <PresetCard
                    key={preset.id}
                    actions={actions}
                    canReplace={Boolean(preview)}
                    index={index}
                    live={tally.get(preset.id)?.live ?? false}
                    preset={preset}
                    preview={tally.get(preset.id)?.preview ?? false}
                    onRename={onRename}
                  />
                ))}
              </div>
            </div>
          </ContextMenuTrigger>
          {menuIndex >= 0 && (
            <ActionsContext
              actions={presetMenu(presets[menuIndex], menuIndex, actions, { canReplace: Boolean(preview), onRename })}
              title={presetLabel(presets[menuIndex])}
            />
          )}
        </ContextMenu>
      )}
    </div>
  );
}

export const PresetsPanel = memo(PresetsPanelView);

/**
 * «Guardar preset»: a scene with its params under a name, proposed from what
 * sets it apart (its title, its question…). A preview recalled from a preset
 * shows which one, and offers to update it or to keep the change as a new one.
 * No toast (they'd sit on the desk mid-show): the button answers with a check.
 */
export function SavePreset({
  step,
  presets,
  onSave,
  onUpdate,
  label,
  className,
  size,
  variant = "outline",
}: {
  step: { scene: SceneId; params: Params; preset?: string } | null;
  presets: Preset[];
  onSave: (name: string) => void;
  onUpdate?: (id: string, name: string) => void;
  /** For a step that isn't a preset yet. */
  label: string;
  className?: string;
  size?: ButtonProps["size"];
  variant?: ButtonProps["variant"];
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saved, setSaved] = useState(0);
  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(0), 1200);

    return () => clearTimeout(timer);
  }, [saved]);

  const origin = step?.preset && onUpdate ? presets.find((preset) => preset.id === step.preset) : undefined;
  const changed = Boolean(origin && step && !showsPreset(origin, step));
  const next = presets.length + 1;

  const submit = (event: FormEvent, update: boolean) => {
    event.preventDefault();
    if (update && origin && onUpdate) onUpdate(origin.id, name);
    else onSave(name);
    holdTake();
    haptic(8);
    setSaved(Date.now());
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(value) => {
        if (value && step) setName(origin ? origin.name : (paramText(step.scene, step.params) ?? "").slice(0, 60));
        setOpen(value && Boolean(step));
      }}
    >
      <PopoverTrigger asChild>
        <Button
          className={cn("min-w-0", className, saved && "text-success-foreground")}
          disabled={!step}
          size={size}
          title={origin ? `Es el preset «${presetLabel(origin)}»` : undefined}
          variant={variant}
        >
          {saved ? (
            <Check className="h-4 w-4 duration-300 motion-safe:animate-in motion-safe:zoom-in-50" />
          ) : origin && !changed ? (
            <Star className="h-4 w-4 !text-primary" fill="currentColor" />
          ) : (
            <Star className="h-4 w-4" />
          )}
          <span className="truncate">
            {saved ? "Guardado" : origin ? (changed ? "Actualizar preset" : presetLabel(origin)) : label}
          </span>
        </Button>
      </PopoverTrigger>
      {/* Focus goes nowhere on close: kept on the button, the next Space would open it again instead of TAKE. */}
      <PopoverContent align="end" className="w-72 p-3" onCloseAutoFocus={(event) => event.preventDefault()}>
        {step && (
          <form className="space-y-3" onSubmit={(event) => submit(event, Boolean(origin))}>
            <div className="space-y-1.5">
              <label
                className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase"
                htmlFor={`${id}-name`}
              >
                Nombre del preset
              </label>
              <Input
                autoFocus
                className="pointer-coarse:h-11 pointer-coarse:text-base"
                id={`${id}-name`}
                maxLength={60}
                placeholder={SCENES[step.scene].title}
                value={name}
                onChange={(event) => setName(event.target.value)}
                onFocus={(event) => event.currentTarget.select()}
              />
              <p className="text-xs text-muted-foreground">
                {origin
                  ? `Es el preset ${presets.indexOf(origin) + 1}${changed ? ", con cambios sin guardar" : ""}.`
                  : next <= 9
                    ? `Va a ser el ${next}: tecla ${next}, y ⇧${next} al aire.`
                    : `Va a ser el ${next}.`}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {origin && (
                <Button className="flex-1" type="submit">
                  <RefreshCw className="h-4 w-4" /> Actualizar
                </Button>
              )}
              <Button
                className="flex-1"
                type={origin ? "button" : "submit"}
                variant={origin ? "outline" : "default"}
                onClick={origin ? (event) => submit(event, false) : undefined}
              >
                <Star className="h-4 w-4" /> {origin ? "Guardar como nuevo" : "Guardar"}
              </Button>
            </div>
          </form>
        )}
      </PopoverContent>
    </Popover>
  );
}
