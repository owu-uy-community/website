"use client";

import { useState } from "react";
import { MotionConfig, Reorder, useDragControls } from "motion/react";
import {
  AudioLines,
  Bot,
  CircleCheck,
  Clapperboard,
  GripVertical,
  Lock,
  MonitorPlay,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

import { cn } from "app/lib/utils";
import { Panel } from "components/Admin/ui/page";
import { PersonAvatar } from "components/Admin/ui/person";
import { StatusDot } from "components/Admin/ui/status";
import { formatClock } from "components/Admin/ui/time";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Table, TableHead, TableHeader } from "components/shared/ui/table";
import { findSound } from "lib/launchpad/sounds";
import type { Moment } from "lib/orpc/run-of-show/schemas";
import { signed, type MomentStatus, type Overrun } from "lib/orpc/run-of-show/timing";
import { isSceneId, SCENES } from "lib/owy-stage/scenes";

export const sceneTitle = (id: string) => (isSceneId(id) ? SCENES[id].title : id);
export const firstName = (name: string) => name.split(" ")[0];

type Chip = { key: string; icon: LucideIcon; label: string; title: string; info?: boolean };

/** What a GO sets off: Owy's message, then the cue's OBS scene, wall scene and sound. */
export function CueChips({
  cue,
  owyMessage,
  className,
}: {
  cue: Moment["cue"];
  owyMessage: string | null;
  className?: string;
}) {
  const sound = cue?.sound ? findSound(cue.sound)?.name : undefined;
  const chips: Chip[] = [
    // The message's first words, not "Mensaje": a touchscreen never shows the title, and GO sends it.
    ...(owyMessage ? [{ key: "owy", icon: Bot, label: owyMessage, title: `Owy: ${owyMessage}`, info: true }] : []),
    ...(cue?.obsScene ? [{ key: "obs", icon: MonitorPlay, label: cue.obsScene, title: `OBS: ${cue.obsScene}` }] : []),
    ...(cue?.stageScene
      ? [
          {
            key: "wall",
            icon: Clapperboard,
            label: sceneTitle(cue.stageScene),
            title: `Pantalla: ${sceneTitle(cue.stageScene)}`,
          },
        ]
      : []),
    ...(sound ? [{ key: "sound", icon: AudioLines, label: sound, title: `Sonido: ${sound}` }] : []),
  ];
  if (chips.length === 0) return null;

  return (
    <div className={cn("flex min-w-0 gap-1.5", className)}>
      {chips.map((chip) => (
        <Badge key={chip.key} className="max-w-44" title={chip.title} variant={chip.info ? "info" : "secondary"}>
          <chip.icon aria-hidden />
          <span className="truncate">{chip.label}</span>
        </Badge>
      ))}
    </div>
  );
}

function StatusCell({ status }: { status: MomentStatus }) {
  if (status === "done") {
    return (
      <span className="inline-flex items-center gap-1.5 text-meta text-muted-foreground">
        <CircleCheck aria-hidden className="size-3.5 text-success" />
        hecho
      </span>
    );
  }
  if (status === "live") {
    return (
      <Badge variant="destructive">
        <StatusDot tone="live" />
        en curso
      </Badge>
    );
  }
  if (status === "next") return <Badge>siguiente</Badge>;
  if (status === "skipped") return <span className="text-meta text-muted-foreground">salteado</span>;

  return (
    <span className="text-meta text-faint">
      <span aria-hidden>—</span>
      <span className="sr-only">pendiente</span>
    </span>
  );
}

function Drift({ minutes }: { minutes: number | null }) {
  if (!minutes) return null;

  return (
    <span className={cn("ml-1 text-2xs", minutes > 0 ? "text-warning-foreground" : "text-success-foreground")}>
      {signed(minutes)}
    </span>
  );
}

/** Where a stretch runs into a fixed start, and the one-click way to make it fit. */
function OverrunHint({
  overrun,
  moments,
  onTrim,
}: {
  overrun: Overrun;
  moments: Moment[];
  onTrim: (moment: Moment, durationMin: number) => void;
}) {
  const fixed = moments[overrun.fixedIndex];
  const giver = overrun.trim ? moments[overrun.trim.index] : null;

  const trim = overrun.trim;

  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-warning-foreground">
      {/* The icon stays with its line when a phone's narrow column wraps it. */}
      <span
        className="flex items-center gap-1.5"
        title={`Así como viene el día, termina ${overrun.overMin} min después del inicio fijo de «${fixed.title}»`}
      >
        <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
        Se pasa {overrun.overMin} min de las {fixed.plannedStart}
      </span>
      {giver && trim ? (
        <Button
          size="xs"
          variant="outline"
          onClick={(event) => {
            // The row behind it opens the editor.
            event.stopPropagation();
            onTrim(giver, trim.durationMin);
          }}
        >
          Recortar {overrun.overMin} min{giver === moments[overrun.index] ? "" : ` de «${giver.title}»`}
        </Button>
      ) : null}
    </div>
  );
}

function MomentRow({
  moment,
  status,
  overrun,
  moments,
  timezone,
  onEdit,
  onMove,
  onDragEnd,
  onTrim,
}: {
  moment: Moment;
  status: MomentStatus;
  overrun: Overrun | undefined;
  moments: Moment[];
  timezone: string;
  onEdit: (moment: Moment) => void;
  onMove: (direction: -1 | 1) => void;
  onDragEnd: () => void;
  onTrim: (moment: Moment, durationMin: number) => void;
}) {
  const controls = useDragControls();
  const [dragging, setDragging] = useState(false);
  const done = status === "done";
  const real = moment.actualStart ? formatClock(new Date(moment.actualStart), timezone) : null;
  const where = [moment.location, moment.owner ? firstName(moment.owner.name) : null].filter(Boolean).join(" · ");

  return (
    <Reorder.Item
      as="tr"
      className={cn(
        "group cursor-pointer transition-colors [&>td]:border-b [&>td]:border-border",
        dragging
          ? "bg-raised shadow-overlay"
          : status === "live"
            ? "bg-live/[0.06]"
            : status === "next"
              ? "bg-primary/[0.05]"
              : "hover:bg-white/[0.02]"
      )}
      dragControls={controls}
      dragListener={false}
      value={moment}
      onClick={() => onEdit(moment)}
      onDragEnd={() => {
        setDragging(false);
        onDragEnd();
      }}
      onDragStart={() => setDragging(true)}
    >
      <td className="relative h-11 w-6 pr-0 pl-1">
        {status === "live" || status === "next" ? (
          <span
            aria-hidden
            className={cn("absolute inset-y-0 left-0 w-0.5", status === "live" ? "bg-live" : "bg-primary")}
          />
        ) : null}
        <button
          aria-label={`Mover «${moment.title}» (flechas arriba y abajo)`}
          className="flex h-8 w-5 cursor-grab touch-none items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:outline-hidden active:cursor-grabbing pointer-coarse:h-11 pointer-coarse:w-7 pointer-coarse:opacity-100"
          type="button"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
            event.preventDefault();
            onMove(event.key === "ArrowUp" ? -1 : 1);
          }}
          onPointerDown={(event) => {
            event.stopPropagation();
            controls.start(event);
          }}
        >
          <GripVertical aria-hidden className="size-3.5" />
        </button>
      </td>
      <td className={cn("pr-3 pl-1 font-terminal tabular-nums", done ? "text-muted-foreground" : "text-foreground")}>
        {moment.plannedStart}
        {real ? (
          <span className="block text-2xs text-muted-foreground lg:hidden">
            {real}
            <Drift minutes={moment.driftMin} />
          </span>
        ) : null}
      </td>
      <td className="px-3 font-terminal tabular-nums max-lg:hidden">
        {real ? (
          <>
            <span className="text-subtle">{real}</span>
            <Drift minutes={moment.driftMin} />
          </>
        ) : (
          <span className="text-faint">—</span>
        )}
      </td>
      <td className="px-3 font-terminal text-meta text-muted-foreground tabular-nums max-lg:hidden">
        {moment.durationMin ? `${moment.durationMin}′` : "—"}
      </td>
      <td className="overflow-hidden px-3 py-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <button
            className={cn(
              "min-w-0 rounded-sm text-left leading-[18px] outline-hidden focus-visible:ring-2 focus-visible:ring-ring/70",
              done ? "text-muted-foreground" : "font-medium text-foreground"
            )}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onEdit(moment);
            }}
          >
            {/* Safari clamps the lines of what's inside a button, not of the button itself. */}
            <span className="max-lg:line-clamp-2 lg:block lg:truncate">{moment.title}</span>
          </button>
          {moment.fixed ? (
            <Badge
              className="h-[18px] px-1.5 font-terminal text-3xs"
              title="Inicio fijo: no se corre"
              variant="secondary"
            >
              <Lock aria-hidden className="size-2.5" />
              fijo
            </Badge>
          ) : null}
        </div>
        {where ? <p className="truncate text-meta text-muted-foreground xl:hidden">{where}</p> : null}
        {moment.notes ? <p className="truncate text-meta text-muted-foreground max-xl:hidden">{moment.notes}</p> : null}
        {overrun ? <OverrunHint moments={moments} overrun={overrun} onTrim={onTrim} /> : null}
      </td>
      <td className="truncate px-3 text-meta text-subtle max-xl:hidden">
        {moment.location ?? <span className="text-faint">—</span>}
      </td>
      <td className="px-3 max-lg:hidden">
        {moment.owner ? (
          <PersonAvatar
            className={cn(done && "opacity-60")}
            image={moment.owner.image}
            name={moment.owner.name}
            size={24}
          />
        ) : (
          <span className="text-faint">—</span>
        )}
      </td>
      <td className="overflow-hidden px-3 max-xl:hidden">
        <CueChips
          className={cn("h-5 flex-wrap overflow-hidden", done && "opacity-50")}
          cue={moment.cue}
          owyMessage={moment.owyMessage}
        />
      </td>
      <td className="pr-4 pl-3 text-right">
        <StatusCell status={status} />
      </td>
    </Reorder.Item>
  );
}

/**
 * Every moment of the day in order. A row opens its editor; its grip drags it (or moves it with
 * the arrow keys). Hints show where the day, as it's going, runs into a fixed start.
 */
export function MomentTable({
  moments,
  status,
  overruns,
  timezone,
  onEdit,
  onReorder,
  onTrim,
}: {
  moments: Moment[];
  status: MomentStatus[];
  overruns: Overrun[];
  timezone: string;
  onEdit: (moment: Moment) => void;
  onReorder: (orderedIds: string[]) => void;
  onTrim: (moment: Moment, durationMin: number) => void;
}) {
  // The order being dragged; null follows the server's.
  const [draft, setDraft] = useState<Moment[] | null>(null);
  const rows = draft ?? moments;
  const statusOf = new Map(moments.map((moment, index) => [moment.id, status[index]]));
  const overrunOf = new Map(overruns.map((overrun) => [moments[overrun.index].id, overrun]));

  const commit = () => {
    if (draft?.some((moment, index) => moment.id !== moments[index]?.id)) onReorder(draft.map((moment) => moment.id));
    setDraft(null);
  };
  const move = (id: string, direction: -1 | 1) => {
    const order = moments.map((moment) => moment.id);
    const from = order.indexOf(id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= order.length) return;
    [order[from], order[to]] = [order[to], order[from]];
    onReorder(order);
  };

  return (
    <Panel className="mt-4 flex min-h-0 flex-col md:flex-1">
      <div className="min-h-0 flex-1 scrollbar-thin overflow-auto" role="region" aria-label="Momentos del guion">
        <MotionConfig reducedMotion="user">
          <Table className="table-fixed">
            <TableHeader>
              <tr>
                <TableHead className="w-6 px-0 pointer-coarse:w-8">
                  <span className="sr-only">Orden</span>
                </TableHead>
                <TableHead className="w-[66px] pl-1">Plan</TableHead>
                <TableHead className="w-[88px] max-lg:hidden">Real</TableHead>
                <TableHead className="w-[54px] max-lg:hidden">Dur.</TableHead>
                <TableHead>Momento</TableHead>
                <TableHead className="w-[120px] max-xl:hidden">Lugar</TableHead>
                <TableHead className="w-[56px] max-lg:hidden">Resp.</TableHead>
                <TableHead className="w-[230px] max-xl:hidden min-[1400px]:w-[300px]">Cues</TableHead>
                <TableHead className="w-[92px] pr-4 text-right lg:w-[104px]">Estado</TableHead>
              </tr>
            </TableHeader>
            <Reorder.Group
              as="tbody"
              axis="y"
              className="[&_tr:last-child_td]:border-0"
              values={rows}
              onReorder={setDraft}
            >
              {rows.map((moment) => (
                <MomentRow
                  key={moment.id}
                  moment={moment}
                  moments={moments}
                  overrun={overrunOf.get(moment.id)}
                  status={statusOf.get(moment.id) ?? "pending"}
                  timezone={timezone}
                  onDragEnd={commit}
                  onEdit={onEdit}
                  onMove={(direction) => move(moment.id, direction)}
                  onTrim={onTrim}
                />
              ))}
            </Reorder.Group>
          </Table>
        </MotionConfig>
      </div>
    </Panel>
  );
}
