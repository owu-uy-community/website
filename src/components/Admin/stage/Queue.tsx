"use client";

import { memo, useRef } from "react";
import { AnimatePresence, Reorder, motion, useDragControls, useMotionValue, useTransform } from "motion/react";
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
import { ContextMenu, ContextMenuTrigger } from "components/shared/ui/context-menu";
import { DropdownMenu, DropdownMenuTrigger } from "components/shared/ui/dropdown-menu";
import { Empty } from "components/shared/ui/empty";
import { toast } from "components/shared/ui/toast-utils";
import { INTERACTIVE_SCENES, SCENES, parseSceneParams, type DeskStep, type SceneId } from "lib/owy-stage/scenes";

import { haptic } from "./haptics";
import { ActionsContext, ActionsDropdown, type MenuAction } from "./menus";
import { readParams } from "./SceneParams";
import type { DeskActions } from "./useDesk";
import { releaseFocus } from "./useStageHotkeys";

/** The desk's actions plus a direct take, which belongs to the page (it bypasses the preview). */
type QueueActions = DeskActions & { airNow: (step: DeskStep) => void };

const PHONE = new Set<string>(INTERACTIVE_SCENES);
/** The params an operator usually types, in the order worth showing. */
const SUMMARY_KEYS = ["title", "question", "text", "message", "label", "name", "venue", "eyebrow", "subtitle"];
/** How far a row slides before letting go acts (px). */
const SWIPE = 76;

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

/** Out of the queue, with a way back: a swipe is quick to do by accident. */
function removeWithUndo(step: DeskStep, index: number, actions: QueueActions) {
  actions.remove(step.id);
  toast.success({
    title: "Quitada de la cola",
    description: SCENES[step.scene].title,
    duration: 5000,
    action: { label: "Deshacer", onClick: () => actions.restore(step, index) },
  });
}

function stepActions(step: DeskStep, index: number, actions: QueueActions): MenuAction[] {
  return [
    { label: "A la preview", icon: Eye, tone: "preview", onSelect: () => actions.cueQueued(step.id) },
    { label: "Al aire ya", icon: Zap, tone: "air", onSelect: () => actions.airNow(step) },
    {
      label: "Subir al principio",
      icon: ArrowUpToLine,
      group: true,
      disabled: index === 0,
      onSelect: () => actions.moveToTop(step.id),
    },
    { label: "Duplicar", icon: Copy, onSelect: () => actions.duplicate(step.id) },
    { label: "Quitar", icon: Trash2, tone: "danger", onSelect: () => removeWithUndo(step, index, actions) },
  ];
}

/**
 * One queued step. Tap cues it into preview; on a touchscreen it also swipes
 * — right to preview, left to remove — and long-presses for the menu. The
 * grip on the left reorders.
 */
function QueueRow({ step, index, actions }: { step: DeskStep; index: number; actions: QueueActions }) {
  const controls = useDragControls();
  const scene = SCENES[step.scene];
  const x = useMotionValue(0);
  const cueOpacity = useTransform(x, [0, SWIPE], [0, 1]);
  const removeOpacity = useTransform(x, [-SWIPE, 0], [1, 0]);
  /** Set while a swipe is on, so the tap that ends it doesn't also cue the step. */
  const swiped = useRef(false);
  const armed = useRef(false);
  const menu = stepActions(step, index, actions);
  const next = index === 0;

  return (
    <Reorder.Item
      animate={{ opacity: 1, y: 0 }}
      className="relative"
      dragControls={controls}
      dragListener={false}
      exit={{ opacity: 0, height: 0, marginTop: 0, transition: { duration: 0.2 } }}
      initial={{ opacity: 0, y: -8 }}
      value={step}
      whileDrag={{ scale: 1.02, zIndex: 20, boxShadow: "0 8px 24px rgba(0,0,0,.35)" }}
      onDragEnd={actions.persistOrder}
    >
      <div className="relative overflow-hidden rounded-lg">
        {/* What a swipe will do, revealed under the row as it slides. */}
        <motion.div
          aria-hidden
          className="absolute inset-0 flex items-center bg-green-600/90 pl-4 text-sm font-semibold text-white"
          style={{ opacity: cueOpacity }}
        >
          <Eye className="mr-2 h-4 w-4" /> A la preview
        </motion.div>
        <motion.div
          aria-hidden
          className="absolute inset-0 flex items-center justify-end bg-red-600/90 pr-4 text-sm font-semibold text-white"
          style={{ opacity: removeOpacity }}
        >
          Quitar <Trash2 className="ml-2 h-4 w-4" />
        </motion.div>

        <ContextMenu>
          <ContextMenuTrigger asChild>
            <motion.div
              className={cn(
                "relative flex items-center gap-1.5 rounded-lg border bg-card py-1.5 pr-0.5 pl-0.5 select-none [-webkit-touch-callout:none] hover:border-muted-foreground/40 @[18rem]:gap-2",
                next && "border-primary/50 bg-primary/[0.06]"
              )}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragDirectionLock
              dragElastic={0.55}
              style={{ x }}
              onDrag={(_, info) => {
                const past = Math.abs(info.offset.x) > SWIPE;
                if (past !== armed.current) {
                  armed.current = past;
                  if (past) haptic(8);
                }
              }}
              onDragEnd={(_, info) => {
                armed.current = false;
                if (info.offset.x > SWIPE) actions.cueQueued(step.id);
                else if (info.offset.x < -SWIPE) removeWithUndo(step, index, actions);
              }}
              onDragStart={() => {
                swiped.current = true;
              }}
            >
              {/* The row cues the step into preview; the handle and the menu sit above it. */}
              <button
                aria-label={`${scene.title}: a la preview`}
                className="absolute inset-0 touch-manipulation rounded-lg"
                type="button"
                onClick={(event) => {
                  if (swiped.current) return;
                  actions.cueQueued(step.id);
                  releaseFocus(event);
                }}
                onPointerDown={() => {
                  swiped.current = false;
                }}
              />
              <button
                aria-label={`Mover ${scene.title}`}
                className="relative cursor-grab touch-none px-1 py-3 text-muted-foreground hover:text-foreground active:cursor-grabbing"
                type="button"
                onPointerDown={(event) => {
                  // Holding the grip reorders: keep the press from arming the row's long-press menu.
                  event.stopPropagation();
                  controls.start(event);
                }}
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
                  {next && (
                    <span className="shrink-0 rounded bg-primary px-1 text-[9px] leading-4 font-extrabold tracking-wider text-primary-foreground">
                      SIGUE
                    </span>
                  )}
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
                    onPointerDown={(event) => event.stopPropagation()}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <ActionsDropdown actions={menu} title={scene.title} />
              </DropdownMenu>
            </motion.div>
          </ContextMenuTrigger>
          <ActionsContext actions={menu} title={scene.title} />
        </ContextMenu>
      </div>
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
          Cola{" "}
          <motion.span
            key={queue.length}
            animate={{ scale: 1 }}
            className="inline-block font-normal text-muted-foreground tabular-nums"
            initial={{ scale: 1.4 }}
            transition={{ type: "spring", stiffness: 600, damping: 20 }}
          >
            · {queue.length}
          </motion.span>
        </h2>
        <span className="ml-auto hidden text-[11px] text-muted-foreground @[22rem]:pointer-coarse:inline">
          deslizá → preview · ← quitar
        </span>
        {queue.length > 0 && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                className="ml-auto h-8 text-xs text-muted-foreground @[22rem]:pointer-coarse:ml-0"
                size="sm"
                variant="ghost"
              >
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
      <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain p-2", queue.length === 0 && "flex")}>
        {queue.length === 0 ? (
          <Empty
            className="m-auto border-0 px-3 py-6"
            description="Sumá escenas con «+» en la biblioteca o mandá la preview con «A la cola». Cada TAKE trae la próxima."
            icon={ListOrdered}
            title="Nada en espera"
          />
        ) : (
          <Reorder.Group axis="y" className="space-y-1.5" values={queue} onReorder={actions.reorder}>
            <AnimatePresence initial={false}>
              {queue.map((step, index) => (
                <QueueRow key={step.id} actions={actions} index={index} step={step} />
              ))}
            </AnimatePresence>
          </Reorder.Group>
        )}
      </div>
    </section>
  );
}

export const Queue = memo(QueueView);
