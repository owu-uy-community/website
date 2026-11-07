"use client";

import * as React from "react";
import { useState } from "react";
import { Pause, Play, RotateCcw, Timer, Volume2, VolumeX } from "lucide-react";

import { Button } from "components/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "components/shared/ui/dialog";
import { Input } from "components/shared/ui/input";
import { Label } from "components/shared/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "components/shared/ui/tooltip";
import { useCountdownState } from "hooks/useCountdownState";
import { toast } from "components/shared/ui/toast-utils";
import { formatCountdown } from "lib/utils";

/**
 * An event's countdown controls: play/pause, reset, sound, a duration or a time to count to. The
 * countdown is one per event, so every screen showing it (/countdown, the open space header, the
 * wall's Countdown scene) follows. `quiet` drops the success toasts (the desk keeps its inspector clear).
 */
export function CountdownPanel({ eventId, quiet = false }: { eventId: string; quiet?: boolean }) {
  const { state, loading, updateState } = useCountdownState({ enableRealtime: true, eventId });
  const notify = quiet ? () => undefined : toast.info;
  const confirm = quiet ? () => undefined : toast.success;
  const [minutes, setMinutes] = useState("5");
  const [seconds, setSeconds] = useState("0");
  const [targetTime, setTargetTime] = useState("");

  const handlePlayPause = async () => {
    try {
      if (state.isRunning) {
        await updateState({ action: "pause" });
        notify("Temporizador pausado");
      } else {
        await updateState({ action: "start" });
        notify("Temporizador iniciado");
      }
    } catch {
      toast.error("Error", "No se pudo actualizar el temporizador");
    }
  };

  const handleReset = async () => {
    try {
      await updateState({ action: "reset" });
      notify("Temporizador reiniciado");
    } catch {
      toast.error("Error", "No se pudo reiniciar el temporizador");
    }
  };

  const handleSetDuration = async () => {
    try {
      const totalSeconds = parseInt(minutes) * 60 + parseInt(seconds);

      if (isNaN(totalSeconds) || totalSeconds <= 0) {
        toast.error("Tiempo inválido", "Ingresá una duración mayor a cero");
        return;
      }

      await updateState({ action: "setDuration", durationSeconds: totalSeconds });
      confirm("Duración establecida", `Temporizador configurado a ${formatCountdown(totalSeconds)}`);
    } catch {
      toast.error("Error", "No se pudo establecer la duración");
    }
  };

  const handleSetTargetTime = async () => {
    try {
      if (!targetTime) {
        toast.error("Hora inválida", "Ingresá una hora objetivo");
        return;
      }

      // Combine today's date with the input time
      const now = new Date();
      const [hours, mins] = targetTime.split(":");
      const target = new Date(now);
      target.setHours(parseInt(hours), parseInt(mins), 0, 0);

      // If the time has already passed today, set it for tomorrow
      if (target <= now) {
        target.setDate(target.getDate() + 1);
      }

      await updateState({ action: "setTargetTime", targetTime: target.toISOString() });

      const secondsUntil = Math.floor((target.getTime() - now.getTime()) / 1000);
      confirm(
        "Hora objetivo establecida",
        `Cuenta regresiva hasta las ${targetTime} (${formatCountdown(secondsUntil)})`
      );
    } catch {
      toast.error("Error", "No se pudo establecer la hora objetivo");
    }
  };

  const handleToggleSound = async () => {
    // Read the target state BEFORE the update so the toast can't lie.
    const willBeEnabled = !state.soundEnabled;
    try {
      await updateState({ action: "toggleSound" });
      notify(
        willBeEnabled ? "Sonido activado" : "Sonido desactivado",
        willBeEnabled ? "El temporizador va a sonar al terminar" : "El temporizador termina en silencio"
      );
    } catch {
      toast.error("Error", "No se pudo cambiar el sonido");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-raised px-4 py-3">
        <span className="font-terminal text-4xl font-bold text-primary tabular-nums">
          {formatCountdown(state.remainingSeconds)}
        </span>
        <span className="text-meta text-muted-foreground">
          {state.isRunning ? "Corriendo" : state.remainingSeconds > 0 ? "En pausa" : "Detenido"}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Button disabled={loading} onClick={handlePlayPause}>
          {state.isRunning ? <Pause /> : <Play />}
          {state.isRunning ? "Pausar" : "Iniciar"}
        </Button>
        {/* Words, not titles: a touchscreen never shows a title. */}
        <Button disabled={loading} variant="outline" onClick={handleReset}>
          <RotateCcw />
          Reiniciar
        </Button>
        <Button
          aria-pressed={state.soundEnabled}
          disabled={loading}
          variant={state.soundEnabled ? "secondary" : "outline"}
          onClick={handleToggleSound}
        >
          {state.soundEnabled ? <Volume2 /> : <VolumeX />}
          Sonido
        </Button>
      </div>

      <div className="space-y-1.5">
        <Label className="text-meta text-muted-foreground" htmlFor={`countdown-minutes-${eventId}`}>
          Por duración
        </Label>
        <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
          <Input
            className="tabular-nums"
            aria-label="Minutos"
            id={`countdown-minutes-${eventId}`}
            inputMode="numeric"
            min="0"
            placeholder="Min"
            type="number"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
          />
          <Input
            className="tabular-nums"
            aria-label="Segundos"
            inputMode="numeric"
            max="59"
            min="0"
            placeholder="Seg"
            type="number"
            value={seconds}
            onChange={(e) => setSeconds(e.target.value)}
          />
          <Button disabled={loading} variant="secondary" onClick={handleSetDuration}>
            Establecer
          </Button>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-meta text-muted-foreground" htmlFor={`countdown-target-${eventId}`}>
          Hasta una hora
        </Label>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Input
            className="font-terminal tabular-nums [&::-webkit-calendar-picker-indicator]:invert"
            id={`countdown-target-${eventId}`}
            type="time"
            value={targetTime}
            onChange={(e) => setTargetTime(e.target.value)}
          />
          <Button disabled={loading} variant="secondary" onClick={handleSetTargetTime}>
            Establecer
          </Button>
        </div>
      </div>
    </div>
  );
}

/** The event screen's countdown: an icon in the board's header (showing the time while it runs) that opens its controls. */
export function CountdownControls({ eventId }: { eventId: string }) {
  const { state } = useCountdownState({ enableRealtime: true, eventId });
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button aria-label="Temporizador" size={state.isRunning ? "default" : "icon"} variant="outline">
              <Timer />
              {state.isRunning ? (
                <span className="font-terminal tabular-nums">{formatCountdown(state.remainingSeconds)}</span>
              ) : null}
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent>Temporizador</TooltipContent>
      </Tooltip>
      <DialogContent className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-md sm:p-0">
        <DialogHeader className="shrink-0 border-b border-border px-4 py-4 pr-14 sm:px-6 sm:pr-14">
          <DialogTitle>Temporizador</DialogTitle>
          <DialogDescription>Controlá la cuenta regresiva de la pantalla del evento.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
          <CountdownPanel eventId={eventId} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
