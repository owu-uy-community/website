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
import { Separator } from "components/shared/ui/separator";
import { useCountdownState } from "hooks/useCountdownState";
import { toast } from "components/shared/ui/toast-utils";

export function CountdownControls({ eventId }: { eventId: string }) {
  const { state, loading, updateState } = useCountdownState({ enableRealtime: true, eventId });
  const [isOpen, setIsOpen] = useState(false);
  const [minutes, setMinutes] = useState("5");
  const [seconds, setSeconds] = useState("0");
  const [targetTime, setTargetTime] = useState("");

  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const handlePlayPause = async () => {
    try {
      if (state.isRunning) {
        await updateState("pause");
        toast.info("Temporizador pausado");
      } else {
        await updateState("start");
        toast.info("Temporizador iniciado");
      }
    } catch {
      toast.error("Error", "No se pudo actualizar el temporizador");
    }
  };

  const handleReset = async () => {
    try {
      await updateState("reset");
      toast.info("Temporizador reiniciado");
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

      await updateState("setDuration", totalSeconds);
      toast.success("Duración establecida", `Temporizador configurado a ${formatTime(totalSeconds)}`);
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

      await updateState("setTargetTime", undefined, target.toISOString());

      const secondsUntil = Math.floor((target.getTime() - now.getTime()) / 1000);
      toast.success(
        "Hora objetivo establecida",
        `Cuenta regresiva hasta las ${targetTime} (${formatTime(secondsUntil)})`
      );
    } catch {
      toast.error("Error", "No se pudo establecer la hora objetivo");
    }
  };

  const handleToggleSound = async () => {
    // Read the target state BEFORE the update so the toast can't lie.
    const willBeEnabled = !state.soundEnabled;
    try {
      await updateState("toggleSound");
      toast.info(
        willBeEnabled ? "Sonido activado" : "Sonido desactivado",
        willBeEnabled ? "El temporizador va a sonar al terminar" : "El temporizador termina en silencio"
      );
    } catch {
      toast.error("Error", "No se pudo cambiar el sonido");
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Timer />
          Temporizador
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Temporizador</DialogTitle>
          <DialogDescription>Controla la cuenta regresiva de la pantalla del evento.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Current Timer Display */}
          <div className="rounded-lg border border-border bg-muted/40 p-6 text-center">
            <div className="font-terminal text-5xl font-bold tabular-nums text-primary">
              {formatTime(state.remainingSeconds)}
            </div>
          </div>

          {/* Controls */}
          <div className="flex gap-2">
            <Button className="flex-1" disabled={loading} onClick={handlePlayPause}>
              {state.isRunning ? (
                <>
                  <Pause />
                  Pausar
                </>
              ) : (
                <>
                  <Play />
                  Iniciar
                </>
              )}
            </Button>
            <Button disabled={loading} size="icon" title="Reiniciar" variant="outline" onClick={handleReset}>
              <RotateCcw />
            </Button>
            <Button
              disabled={loading}
              size="icon"
              title={state.soundEnabled ? "Sonido activado" : "Sonido desactivado"}
              variant={state.soundEnabled ? "secondary" : "outline"}
              onClick={handleToggleSound}
            >
              {state.soundEnabled ? <Volume2 /> : <VolumeX />}
            </Button>
          </div>

          {/* Set Timer */}
          <div className="space-y-4 rounded-lg border border-border p-4">
            <div className="space-y-3">
              <Label className="text-xs text-muted-foreground" htmlFor="countdown-minutes">
                Por duración
              </Label>
              <div className="flex gap-2">
                <Input
                  className="flex-1 tabular-nums"
                  id="countdown-minutes"
                  min="0"
                  placeholder="Min"
                  type="number"
                  value={minutes}
                  onChange={(e) => setMinutes(e.target.value)}
                />
                <Input
                  className="flex-1 tabular-nums"
                  id="countdown-seconds"
                  max="59"
                  min="0"
                  placeholder="Seg"
                  type="number"
                  value={seconds}
                  onChange={(e) => setSeconds(e.target.value)}
                />
              </div>
              <Button className="w-full" disabled={loading} variant="secondary" onClick={handleSetDuration}>
                Establecer duración
              </Button>
            </div>

            <div className="relative">
              <Separator />
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-popover px-2 text-xs uppercase text-muted-foreground">
                o
              </span>
            </div>

            <div className="space-y-3">
              <Label className="text-xs text-muted-foreground" htmlFor="countdown-target">
                Hasta una hora específica
              </Label>
              <Input
                className="font-terminal tabular-nums [&::-webkit-calendar-picker-indicator]:invert"
                id="countdown-target"
                type="time"
                value={targetTime}
                onChange={(e) => setTargetTime(e.target.value)}
              />
              <Button className="w-full" disabled={loading} variant="secondary" onClick={handleSetTargetTime}>
                Establecer hora
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
