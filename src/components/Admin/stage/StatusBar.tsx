"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock, ListOrdered, ListVideo, Smartphone } from "lucide-react";

import { cn } from "app/lib/utils";
import { useInputs } from "components/OwyStage/inputs";
import { Separator } from "components/shared/ui/separator";
import { INTERACTIVE_SCENES, SCENES, type StageState } from "lib/owy-stage/scenes";

import { useRundownClock, type Rundown } from "./Rundown";
import { clockText } from "./timing";

const PHONE = new Set<string>(INTERACTIVE_SCENES);

function useSecond() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);

    return () => clearInterval(timer);
  }, []);

  return now;
}

/** Time on air as a broadcast timecode, and the room's clock: the two numbers a show runs on. */
function Clocks({ takenAt }: { takenAt: string }) {
  const now = useSecond();

  return (
    <>
      <span className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
        <span className="font-semibold tracking-wider text-red-300">AL AIRE</span>
        <span className="font-terminal text-foreground tabular-nums">
          {takenAt ? clockText((now - Date.parse(takenAt)) / 1000) : "—"}
        </span>
      </span>
      <span className="ml-auto flex items-center gap-1.5" title="Hora">
        <Clock className="h-3 w-3" />
        <span className="font-terminal text-foreground tabular-nums">
          {new Date(now).toLocaleTimeString("es-UY", { hour12: false })}
        </span>
      </span>
    </>
  );
}

/** How many phones answer the scene on air (interactive scenes only). */
function Participation({ live }: { live: StageState }) {
  const inputs = useInputs(live.round);
  const people = useMemo(() => new Set(inputs.map((input) => input.voter)).size, [inputs]);

  return (
    <span className="flex items-center gap-1.5">
      <Smartphone className="h-3 w-3" />
      <span className="font-terminal text-foreground tabular-nums">{people}</span>
      {people === 1 ? "persona" : "personas"}
      <span className="text-muted-foreground/70">· {inputs.length} respuestas</span>
    </span>
  );
}

function GuionState({ rundown }: { rundown: Rundown }) {
  const { left } = useRundownClock(rundown);

  return (
    <span className="flex items-center gap-1.5">
      <ListVideo className="h-3 w-3" />
      {rundown.step ? (
        <>
          Guion{" "}
          <span className="font-terminal text-foreground tabular-nums">
            {rundown.at + 1}/{rundown.steps.length}
          </span>
          {left !== null && <span className="font-terminal tabular-nums">· {clockText(left)}</span>}
          {!rundown.playing && <span>· en pausa</span>}
        </>
      ) : (
        "Guion detenido"
      )}
    </span>
  );
}

/**
 * The desk's status line, like a switcher's: connection, time on air, who's
 * answering from their phones, what's waiting, the guion and the clock.
 */
export function StatusBar({
  live,
  connected,
  queued,
  rundown,
}: {
  live: StageState;
  connected: boolean;
  queued: number;
  rundown: Rundown;
}) {
  const divider = <Separator className="h-3" orientation="vertical" />;

  return (
    <footer className="flex h-7 shrink-0 items-center gap-3 overflow-hidden rounded-lg border bg-card/60 px-3 text-[11px] whitespace-nowrap text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <span className={cn("h-1.5 w-1.5 rounded-full", connected ? "bg-green-500" : "animate-pulse bg-amber-400")} />
        {connected ? "Conectado" : "Reconectando…"}
      </span>
      {divider}
      <span className="max-w-48 truncate text-foreground">{SCENES[live.scene].title}</span>
      {PHONE.has(live.scene) && (
        <>
          {divider}
          <Participation live={live} />
        </>
      )}
      {divider}
      <span className="flex items-center gap-1.5">
        <ListOrdered className="h-3 w-3" />
        Cola <span className="font-terminal text-foreground tabular-nums">{queued}</span>
      </span>
      {divider}
      <GuionState rundown={rundown} />
      {divider}
      <Clocks takenAt={live.takenAt} />
    </footer>
  );
}
