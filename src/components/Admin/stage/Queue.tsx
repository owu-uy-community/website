"use client";

import { memo } from "react";
import { Reorder, useDragControls } from "motion/react";
import {
  ArrowUpToLine,
  Copy,
  Eye,
  GripVertical,
  ListOrdered,
  MoreHorizontal,
  Smartphone,
  Trash2,
  Zap,
} from "lucide-react";

import { cn } from "app/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "components/shared/ui/alert-dialog";
import { Button } from "components/shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "components/shared/ui/dropdown-menu";
import { Empty } from "components/shared/ui/empty";
import { INTERACTIVE_SCENES, SCENES, parseSceneParams, type DeskStep, type SceneId } from "lib/owy-stage/scenes";

import { readParams } from "./SceneParams";

import type { DeskActions } from "./useDesk";
import { releaseFocus } from "./useStageHotkeys";

/** The desk's actions plus a direct take, which belongs to the page (it bypasses the preview). */
type QueueActions = DeskActions & { airNow: (step: DeskStep) => void };

const PHONE = new Set<string>(INTERACTIVE_SCENES);
/** The params an operator usually types, in the order worth showing. */
const SUMMARY_KEYS = ["title", "question", "text", "message", "label", "name", "venue", "eyebrow", "subtitle"];

/** What makes this step different from the scene's defaults, in a few words; else the scene's description. */
export function stepSummary(scene: SceneId, params: Record<string, unknown>) {
  if (!Object.keys(params).length) return SCENES[scene].description;
  const parsed = readParams(scene, params);
  const defaults = parseSceneParams(scene, {}) as Record<string, unknown>;
  const changed = Object.keys(parsed).filter((key) => JSON.stringify(parsed[key]) !== JSON.stringify(defaults[key]));
  const key = SUMMARY_KEYS.find((name) => changed.includes(name)) ?? changed[0];
  const value = key ? parsed[key] : undefined;

  return typeof value === "string" && value.trim() ? `«${value.split("|")[0].trim()}»` : SCENES[scene].description;
}

function QueueRow({ step, index, actions }: { step: DeskStep; index: number; actions: QueueActions }) {
  const controls = useDragControls();
  const scene = SCENES[step.scene];

  return (
    <Reorder.Item
      className="relative flex items-center gap-1.5 rounded-lg border bg-card py-1.5 pr-0.5 pl-0.5 hover:border-muted-foreground/40 @[18rem]:gap-2"
      dragControls={controls}
      dragListener={false}
      value={step}
      whileDrag={{ scale: 1.02, zIndex: 20, boxShadow: "0 8px 24px rgba(0,0,0,.35)" }}
      onDragEnd={actions.persistOrder}
    >
      {/* The row cues the step into preview; the handle and the menu sit above it. */}
      <button
        aria-label={`${scene.title}: a la preview`}
        className="absolute inset-0 touch-manipulation rounded-lg"
        type="button"
        onClick={(event) => {
          actions.cueQueued(step.id);
          releaseFocus(event);
        }}
      />
      <button
        aria-label={`Mover ${scene.title}`}
        className="relative cursor-grab touch-none px-1 py-3 text-muted-foreground hover:text-foreground active:cursor-grabbing"
        type="button"
        onPointerDown={(event) => controls.start(event)}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="pointer-events-none hidden w-4 shrink-0 text-right font-terminal text-xs text-muted-foreground tabular-nums @[18rem]:inline">
        {index + 1}
      </span>
      <img
        alt=""
        className="pointer-events-none aspect-video w-12 shrink-0 rounded bg-black object-cover @[20rem]:w-16"
        decoding="async"
        draggable={false}
        loading="lazy"
        src={`/owy-stage/thumbs/${step.scene}.jpg`}
      />
      <div className="pointer-events-none min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
          <span className="truncate">{scene.title}</span>
          {PHONE.has(step.scene) && <Smartphone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
        </p>
        <p className="truncate text-xs text-muted-foreground">{stepSummary(step.scene, step.params)}</p>
      </div>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={`Más acciones para ${scene.title}`}
            className="relative h-9 w-9 shrink-0 text-muted-foreground pointer-coarse:h-10 pointer-coarse:w-10"
            size="icon"
            variant="ghost"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onSelect={() => actions.cueQueued(step.id)}>
            <Eye className="mr-2 h-4 w-4 text-green-400" /> A la preview
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => actions.airNow(step)}>
            <Zap className="mr-2 h-4 w-4 text-red-400" /> Al aire ya
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={index === 0} onSelect={() => actions.moveToTop(step.id)}>
            <ArrowUpToLine className="mr-2 h-4 w-4" /> Subir al principio
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => actions.duplicate(step.id)}>
            <Copy className="mr-2 h-4 w-4" /> Duplicar
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={() => actions.remove(step.id)}
          >
            <Trash2 className="mr-2 h-4 w-4" /> Quitar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </Reorder.Item>
  );
}

/**
 * "A continuación": what TAKE will bring into preview next, one per TAKE.
 * Shared by every admin device; drag to reorder, tap to cue one now.
 */
function QueueView({ queue, actions }: { queue: DeskStep[]; actions: QueueActions }) {
  return (
    <section aria-label="Cola" className="@container flex h-full min-h-0 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b pr-1.5 pl-3">
        <ListOrdered className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">
          Cola <span className="font-normal text-muted-foreground">· {queue.length}</span>
        </h2>
        {queue.length > 0 && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button className="ml-auto h-8 text-xs text-muted-foreground" size="sm" variant="ghost">
                Vaciar
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Vaciar la cola?</AlertDialogTitle>
                <AlertDialogDescription>
                  Se quitan las {queue.length} escenas en espera, en todos los dispositivos. Lo que está en preview y al
                  aire no cambia.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={actions.clearQueue}>
                  Vaciar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </header>
      <div className={cn("min-h-0 flex-1 overflow-y-auto p-2", queue.length === 0 && "flex")}>
        {queue.length === 0 ? (
          <Empty
            className="m-auto border-0 px-3 py-6"
            description="Sumá escenas con «+» en la biblioteca o mandá la preview con «A la cola». Cada TAKE trae la próxima."
            icon={ListOrdered}
            title="Nada en espera"
          />
        ) : (
          <Reorder.Group axis="y" className="space-y-1.5" values={queue} onReorder={actions.reorder}>
            {queue.map((step, index) => (
              <QueueRow key={step.id} actions={actions} index={index} step={step} />
            ))}
          </Reorder.Group>
        )}
      </div>
    </section>
  );
}

export const Queue = memo(QueueView);
