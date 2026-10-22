"use client";

import { memo } from "react";
import { motion } from "motion/react";
import { Copy, Eye, ListPlus, Radio, Smartphone } from "lucide-react";

import { cn } from "app/lib/utils";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { EmptyState } from "components/Admin/ui/states";
import { Kbd } from "components/shared/ui/kbd";
import { ToggleGroup, ToggleGroupItem } from "components/shared/ui/toggle-group";
import {
  INTERACTIVE_SCENES,
  SCENES,
  SCENE_CATEGORIES,
  type DeskStep,
  type Preset,
  type SceneId,
  type StageState,
} from "lib/owy-stage/scenes";

import { SavePreset, type PresetActions } from "./Presets";
import { QuestionsPanel } from "./Questions";
import { SceneParams } from "./SceneParams";

const PHONE = new Set<string>(INTERACTIVE_SCENES);
type Params = Record<string, unknown>;

/** The chosen side of the Preview / Al aire switch: one frame that slides between the two. */
function Highlight({ tone }: { tone: "preview" | "program" }) {
  return (
    <motion.span
      className={cn(
        "absolute inset-0 rounded-md border",
        tone === "preview" ? "border-success/50 bg-success-surface" : "border-live/50 bg-live-surface"
      )}
      layoutId="inspector-target"
      transition={{ type: "spring", stiffness: 500, damping: 40 }}
    />
  );
}

function Heading({ scene }: { scene: SceneId }) {
  const { title, description, category } = SCENES[scene];

  return (
    <header className="space-y-1 px-4 pt-2 pb-1.5 sm:pt-3 sm:pb-2">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display text-base leading-tight font-bold sm:text-lg">{title}</h2>
        <Badge className="font-normal text-muted-foreground" variant="outline">
          {SCENE_CATEGORIES[category].title}
        </Badge>
        {PHONE.has(scene) && (
          <Badge className="gap-1 font-normal" variant="secondary">
            <Smartphone className="h-3 w-3" /> celular
          </Badge>
        )}
      </div>
      {/* On a phone the height goes to the fields: the description waits for a bigger screen. */}
      <p className="hidden text-xs text-muted-foreground sm:block">{description}</p>
    </header>
  );
}

/**
 * The params of the scene being prepared (preview, the default) or of the one
 * on air. Editing the preview is safe: nothing changes on the wall until TAKE.
 */
function InspectorView({
  target,
  live,
  preview,
  pending,
  presets,
  presetActions,
  onTarget,
  onLiveParams,
  onPreviewParams,
  onEnqueuePreview,
  onCopyLive,
}: {
  target: "preview" | "program";
  live: StageState;
  preview: DeskStep | null;
  pending: boolean;
  presets: Preset[];
  presetActions: PresetActions;
  onTarget: (target: "preview" | "program") => void;
  onLiveParams: (params: Params) => void;
  onPreviewParams: (params: Params) => void;
  onEnqueuePreview: () => void;
  onCopyLive: () => void;
}) {
  return (
    <section aria-label="Parámetros" className="flex h-full min-h-0 flex-col">
      <ToggleGroup
        aria-label="Qué editar"
        className="grid shrink-0 grid-cols-2 gap-1 border-b p-1 sm:gap-1.5 sm:p-1.5"
        type="single"
        value={target}
        onValueChange={(value) => value && onTarget(value as "preview" | "program")}
      >
        <ToggleGroupItem
          className="relative h-auto min-w-0 flex-col items-start gap-0.5 px-2.5 py-1.5 text-left hover:bg-accent/60 data-[state=on]:bg-transparent sm:gap-1 sm:py-2"
          value="preview"
        >
          {target === "preview" && <Highlight tone="preview" />}
          <span className="relative flex items-center gap-1.5 font-terminal text-3xs font-semibold tracking-[0.12em] text-success-foreground uppercase">
            <span className="size-2 rounded-full bg-success" /> Preview
          </span>
          <span className="relative w-full truncate text-sm font-semibold text-foreground">
            {preview ? SCENES[preview.scene].title : "Vacía"}
          </span>
        </ToggleGroupItem>
        <ToggleGroupItem
          className="relative h-auto min-w-0 flex-col items-start gap-0.5 px-2.5 py-1.5 text-left hover:bg-accent/60 data-[state=on]:bg-transparent sm:gap-1 sm:py-2"
          value="program"
        >
          {target === "program" && <Highlight tone="program" />}
          <span className="relative flex items-center gap-1.5 font-terminal text-3xs font-semibold tracking-[0.12em] text-live-foreground uppercase">
            <span className="size-2 rounded-full bg-live" /> Al aire
          </span>
          <span className="relative w-full truncate text-sm font-semibold text-foreground">
            {SCENES[live.scene].title}
          </span>
        </ToggleGroupItem>
      </ToggleGroup>

      {target === "program" ? (
        <>
          <Heading scene={live.scene} />
          <div className="mx-4 mb-1 flex items-center gap-2 rounded-md border border-live/30 bg-live-surface px-3 py-2 text-meta text-live-foreground">
            <Radio className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1">En vivo: cada cambio sale al aire mientras escribís.</span>
            <Button className="shrink-0" size="sm" variant="ghost" onClick={onCopyLive}>
              <Copy /> A preview
            </Button>
          </div>
          {/* The live questions: their one field, then the moderation of what the phones sent. */}
          <div className={live.scene === "live-questions" ? "shrink-0" : "min-h-0 flex-1"}>
            <SceneParams apply={onLiveParams} mode="live" params={live.params} pending={pending} scene={live.scene} />
          </div>
          {live.scene === "live-questions" && <QuestionsPanel round={live.round} />}
          <footer className="flex shrink-0 items-center gap-2 border-t p-1.5 sm:p-2">
            <SavePreset
              className="h-10 flex-1"
              label="Guardar lo que está al aire"
              presets={presets}
              step={live}
              onSave={presetActions.saveFromLive}
            />
          </footer>
        </>
      ) : preview ? (
        <>
          <Heading scene={preview.scene} />
          <div className="mx-4 mb-1 hidden items-center gap-2 rounded-md border border-success/25 bg-success-surface px-3 py-2 text-meta text-success-foreground sm:flex">
            <Eye className="h-3.5 w-3.5 shrink-0" /> Fuera del aire · TAKE para mostrarlo
          </div>
          <div className="min-h-0 flex-1">
            <SceneParams
              key={preview.id}
              apply={onPreviewParams}
              mode="preview"
              params={preview.params}
              scene={preview.scene}
            />
          </div>
          <footer className="flex shrink-0 items-center gap-2 border-t p-1.5 sm:p-2">
            <Button className="h-10 flex-1" variant="outline" onClick={onEnqueuePreview}>
              <ListPlus className="h-4 w-4" /> A la cola
              <Kbd className="ml-1 pointer-coarse:hidden">Q</Kbd>
            </Button>
            <SavePreset
              className="h-10 flex-1"
              label="Guardar preset"
              presets={presets}
              step={preview}
              onSave={presetActions.saveFromPreview}
              onUpdate={presetActions.updateFromPreview}
            />
          </footer>
        </>
      ) : (
        <div className="flex min-h-0 flex-1 p-4">
          <EmptyState
            className="m-auto"
            compact
            description="Lo que pongas en preview se edita acá antes de salir al aire."
            icon={Eye}
            title="Nada en preview"
          />
        </div>
      )}
    </section>
  );
}

export const Inspector = memo(InspectorView);
