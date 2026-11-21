"use client";

import { Lock } from "lucide-react";

import { cn } from "app/lib/utils";
import { KeyHint } from "components/Admin/shell/shortcuts";
import { SceneThumb } from "components/Admin/stage/SceneThumb";
import { Meter, MicroLabel, Panel } from "components/Admin/ui/page";
import { PersonAvatar } from "components/Admin/ui/person";
import { EmptyState } from "components/Admin/ui/states";
import { LiveLabel } from "components/Admin/ui/status";
import { formatClock, useNow } from "components/Admin/ui/time";
import { Button } from "components/shared/ui/button";
import type { Moment } from "lib/orpc/run-of-show/schemas";
import { clockMinutes, signed, toClock, toMinutes } from "lib/orpc/run-of-show/timing";
import { wallClock } from "lib/slot-day";

import { CueChips, firstName, sceneTitle } from "./MomentTable";

/** "15:42", "1:05:12": a countdown that reads at a glance (whole seconds, counting down). */
function countdown(ms: number) {
  const total = ms >= 0 ? Math.ceil(ms / 1000) : Math.floor(-ms / 1000);
  const hours = Math.floor(total / 3600);
  const clock = `${String(Math.floor((total % 3600) / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;

  return hours > 0 ? `${hours}:${clock}` : clock;
}

const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

export type NextFixed = { moment: Moment; marginMin: number } | null;

/** The next fixed start and the room left before it, as the day is going. */
function FixedLine({ nextFixed }: { nextFixed: NextFixed }) {
  if (!nextFixed) return <p className="mt-2.5 text-meta text-muted-foreground">Sin inicios fijos por delante.</p>;
  const { moment, marginMin } = nextFixed;

  return (
    <p className="mt-2.5 flex min-w-0 items-center gap-2 text-meta text-muted-foreground">
      <Lock aria-hidden className="size-3.5 shrink-0" />
      <span className="min-w-0 truncate">
        Próximo inicio fijo <span className="font-terminal text-subtle tabular-nums">{moment.plannedStart}</span> ·{" "}
        {moment.title}
      </span>
      {Number.isFinite(marginMin) ? (
        <span
          className={cn(
            "ml-auto shrink-0 font-terminal tabular-nums",
            marginMin < 5 ? "text-warning-foreground" : "text-success-foreground"
          )}
        >
          margen {signed(marginMin)} min
        </span>
      ) : null}
    </p>
  );
}

function BigClock({
  value,
  caption,
  tone,
  className,
}: {
  value: string;
  caption: string;
  tone?: "live" | "warning";
  className?: string;
}) {
  return (
    <div className={cn("shrink-0 text-right", className)} role="timer">
      <div
        className={cn(
          "font-terminal text-[34px] leading-none font-medium tracking-tight tabular-nums max-sm:text-[28px]",
          tone === "live" ? "text-live-foreground" : tone === "warning" ? "text-warning-foreground" : "text-foreground"
        )}
      >
        {value}
      </div>
      <div className="mt-1 font-terminal text-2xs text-muted-foreground">{caption}</div>
    </div>
  );
}

/** The running moment: how long it has left, where it's at, and the room before the next fixed start. */
function LiveCard({ moment, timezone, nextFixed }: { moment: Moment; timezone: string; nextFixed: NextFixed }) {
  const now = useNow(1000);
  const startedAt = Date.parse(moment.actualStart ?? "");
  const length = moment.durationMin * 60_000;
  const endsAt = startedAt + length;
  const left = now ? endsAt - now : null;
  // A 0-minute moment (an announcement, a scene change) just counts how long it's been on.
  const clock =
    left === null
      ? { value: "--:--", caption: "restan" }
      : length === 0
        ? { value: countdown(now - startedAt), caption: "en curso" }
        : left >= 0
          ? { value: countdown(left), caption: "restan" }
          : { value: `+${countdown(left)}`, caption: "de más", tone: "live" as const };
  const wall = moment.cue?.stageScene ? sceneTitle(moment.cue.stageScene) : null;
  const meta = [moment.owner ? firstName(moment.owner.name) : null, moment.location, wall ? `pantalla: ${wall}` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <Panel className="relative p-4">
      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-live" />
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <LiveLabel>En curso · desde {formatClock(startedAt, timezone)}</LiveLabel>
        {moment.driftMin ? (
          <span
            className={cn(
              "font-terminal text-2xs tabular-nums",
              moment.driftMin > 0 ? "text-warning-foreground" : "text-success-foreground"
            )}
          >
            {signed(moment.driftMin)} min
          </span>
        ) : null}
        <span className="ml-auto font-terminal text-2xs text-muted-foreground tabular-nums">
          termina {formatClock(endsAt, timezone)} (plan {toClock(toMinutes(moment.plannedStart) + moment.durationMin)})
        </span>
      </div>
      <div className="mt-2 flex items-end justify-between gap-6">
        <div className="min-w-0">
          <h2 className="truncate font-display text-xl leading-7 font-semibold tracking-[-0.01em] text-foreground">
            {moment.title}
          </h2>
          {meta ? (
            <p className="mt-1 flex min-w-0 items-center gap-2 text-meta text-muted-foreground">
              {moment.owner ? <PersonAvatar image={moment.owner.image} name={moment.owner.name} size={16} /> : null}
              <span className="truncate">{meta}</span>
            </p>
          ) : null}
        </div>
        <BigClock {...clock} />
      </div>
      <Meter
        className="mt-3 h-1.5"
        label="Avance del momento"
        max={Math.max(length, 1)}
        tone="live"
        value={now && length ? Math.min(now - startedAt, length) : 0}
      />
      <FixedLine nextFixed={nextFixed} />
    </Panel>
  );
}

/** Nothing on air: before the first GO, between moments, or once the day is over. */
function IdleCard({
  moments,
  next,
  timezone,
  day,
  nextFixed,
}: {
  moments: Moment[];
  next: Moment | null;
  timezone: string;
  day: string;
  nextFixed: NextFixed;
}) {
  const now = useNow(1000);
  const started = moments.filter((moment) => moment.actualStart);
  const lastEnd = Math.max(0, ...started.map((moment) => Date.parse(moment.actualEnd ?? "") || 0));
  const today = now ? wallClock(new Date(now), timezone).slice(0, 10) : null;

  if (!next) {
    return (
      <Panel className="p-4">
        <MicroLabel>Terminó</MicroLabel>
        <div className="mt-2 flex items-end justify-between gap-6">
          <div className="min-w-0">
            <h2 className="font-display text-xl leading-7 font-semibold tracking-[-0.01em] text-foreground">
              Terminó el guion
            </h2>
            <p className="mt-1 text-meta text-muted-foreground">
              {started.length} de {moments.length} momentos al aire
            </p>
          </div>
          {lastEnd ? <BigClock caption="cerró" value={formatClock(lastEnd, timezone)} /> : null}
        </div>
      </Panel>
    );
  }

  const untilStart =
    today === day && now ? (toMinutes(next.plannedStart) - clockMinutes(now, timezone)) * 60_000 : null;
  const daysLeft = today && today < day ? daysBetween(today, day) : 0;
  const clock =
    daysLeft > 0
      ? { value: daysLeft === 1 ? "1 día" : `${daysLeft} días`, caption: "faltan" }
      : untilStart !== null && untilStart >= 0
        ? { value: countdown(untilStart), caption: "para arrancar" }
        : untilStart !== null
          ? { value: `+${countdown(untilStart)}`, caption: "de atraso", tone: "warning" as const }
          : null;
  const lastDone = started.at(-1);

  return (
    <Panel className="p-4">
      <MicroLabel>{started.length === 0 ? "Todavía no arrancó" : "Sin momento en curso"}</MicroLabel>
      <div className="mt-2 flex items-end justify-between gap-6 max-sm:flex-col max-sm:items-start max-sm:gap-3">
        <div className="min-w-0">
          <h2 className="truncate font-display text-xl leading-7 font-semibold tracking-[-0.01em] text-foreground">
            {started.length === 0 ? `Arranca a las ${next.plannedStart}` : `Sigue «${next.title}»`}
          </h2>
          <p className="mt-1 truncate text-meta text-muted-foreground">
            {started.length === 0 || !lastDone
              ? `El primer GO pone «${next.title}» en curso.`
              : `«${lastDone.title}» terminó${lastEnd ? ` a las ${formatClock(lastEnd, timezone)}` : ""}.`}
          </p>
        </div>
        {clock ? <BigClock className="max-sm:text-left" {...clock} /> : null}
      </div>
      <FixedLine nextFixed={nextFixed} />
    </Panel>
  );
}

/** What GO starts, with everything it sets off, and the GO itself. */
function NextCard({
  next,
  live,
  going,
  onGo,
  onClose,
}: {
  next: Moment | null;
  live: Moment | null;
  going: boolean;
  onGo: () => void;
  onClose: () => void;
}) {
  if (!next) {
    return live ? (
      <Panel className="flex items-center gap-4 p-4">
        <div className="min-w-0 flex-1">
          <MicroLabel>Sigue</MicroLabel>
          <p className="mt-1 text-[15px] font-semibold text-foreground">Es el último momento</p>
          <p className="mt-0.5 text-meta text-muted-foreground">Cuando termine, cerrá el guion.</p>
        </div>
        <Button disabled={going} variant="outline" onClick={onClose}>
          Cerrar el guion
        </Button>
      </Panel>
    ) : (
      <Panel className="flex items-center justify-center p-4">
        <EmptyState compact owy description="Todo lo del guion ya salió." title="No quedan momentos" />
      </Panel>
    );
  }

  const wall = next.cue?.stageScene;
  const where = [
    next.location,
    next.owner ? firstName(next.owner.name) : null,
    next.durationMin ? `${next.durationMin} min` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Panel className="flex items-center gap-4 p-4 max-sm:flex-col max-sm:items-stretch">
      {wall ? (
        <SceneThumb
          className="h-[82px] w-[146px] shrink-0 ring-1 ring-input max-sm:hidden"
          id={wall}
          title={sceneTitle(wall)}
        />
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="font-terminal text-2xs tracking-[0.14em] text-primary uppercase">Sigue · {next.plannedStart}</p>
        <p className="mt-1 line-clamp-2 text-[15px] leading-5 font-semibold text-foreground">{next.title}</p>
        {where ? <p className="mt-0.5 truncate text-meta text-muted-foreground">{where}</p> : null}
        <CueChips className="mt-2 flex-wrap" cue={next.cue} owyMessage={next.owyMessage} />
      </div>
      <div className="flex shrink-0 flex-col items-center gap-1.5">
        <Button
          aria-label={`GO: arrancar «${next.title}»`}
          className="h-[62px] w-[78px] rounded-[10px] font-display text-xl font-bold shadow-[inset_0_1px_0_rgb(255_255_255/0.35),0_0_0_4px_hsl(var(--primary)/0.12)] max-sm:h-14 max-sm:w-full"
          disabled={going}
          onClick={onGo}
        >
          GO
        </Button>
        <span className="flex items-center gap-1 text-2xs text-muted-foreground pointer-coarse:hidden">
          <KeyHint keys="enter" /> o <KeyHint keys="space" />
        </span>
      </div>
    </Panel>
  );
}

/** The two cards on top: what's on now, and what GO starts. */
export function NowNext({
  moments,
  live,
  next,
  timezone,
  day,
  nextFixed,
  going,
  onGo,
  onClose,
}: {
  moments: Moment[];
  live: Moment | null;
  next: Moment | null;
  timezone: string;
  day: string;
  nextFixed: NextFixed;
  going: boolean;
  onGo: () => void;
  onClose: () => void;
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-[1.35fr_1fr]">
      {live ? (
        <LiveCard moment={live} nextFixed={nextFixed} timezone={timezone} />
      ) : (
        <IdleCard day={day} moments={moments} next={next} nextFixed={nextFixed} timezone={timezone} />
      )}
      <NextCard going={going} live={live} next={next} onClose={onClose} onGo={onGo} />
    </div>
  );
}
