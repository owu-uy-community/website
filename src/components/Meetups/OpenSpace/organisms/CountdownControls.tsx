"use client";

import * as React from "react";
import { useState } from "react";
import { Button } from "../../../shared/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../../../shared/ui/dialog";
import { Input } from "../../../shared/ui/input";
import { Label } from "../../../shared/ui/label";
import { Timer, Play, Pause, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { useCountdownState } from "../../../../hooks/useCountdownState";
import { toast } from "../../../shared/ui/toast-utils";

export function CountdownControls() {
  const { state, loading, updateState } = useCountdownState({ enableRealtime: true });
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
        toast.info("Temporizador Pausado");
      } else {
        await updateState("start");
        toast.info("Temporizador Iniciado");
      }
    } catch (error) {
      toast.error("Error", "No se pudo actualizar el temporizador");
    }
  };

  const handleReset = async () => {
    try {
      await updateState("reset");
      toast.info("Temporizador Reiniciado");
    } catch (error) {
      toast.error("Error", "No se pudo reiniciar el temporizador");
    }
  };

  const handleSetDuration = async () => {
    try {
      const totalSeconds = parseInt(minutes) * 60 + parseInt(seconds);

      if (isNaN(totalSeconds) || totalSeconds <= 0) {
        toast.error("Tiempo Inválido", "Por favor ingresá un tiempo válido");
        return;
      }

      await updateState("setDuration", totalSeconds);
      toast.success("Duración Establecida", `Temporizador configurado a ${formatTime(totalSeconds)}`);
    } catch (error) {
      toast.error("Error", "No se pudo establecer la duración");
    }
  };

  const handleSetTargetTime = async () => {
    try {
      if (!targetTime) {
        toast.error("Tiempo Inválido", "Por favor ingresá una hora objetivo");
        return;
      }

      // Combine today's date with the input time
      const now = new Date();
      const [hours, minutes] = targetTime.split(":");
      const target = new Date(now);
      target.setHours(parseInt(hours), parseInt(minutes), 0, 0);

      // If the time has already passed today, set it for tomorrow
      if (target <= now) {
        target.setDate(target.getDate() + 1);
      }

      await updateState("setTargetTime", undefined, target.toISOString());

      const secondsUntil = Math.floor((target.getTime() - now.getTime()) / 1000);
      toast.success("Hora Objetivo Establecida", `Temporizador configurado hasta las ${targetTime} (${formatTime(secondsUntil)})`);
    } catch (error) {
      toast.error("Error", "No se pudo establecer la hora objetivo");
    }
  };

  const handleToggleSound = async () => {
    try {
      await updateState("toggleSound");
      toast.info(
        state.soundEnabled ? "Sonido Desactivado" : "Sonido Activado",
        state.soundEnabled
          ? "El temporizador será silencioso al terminar"
          : "El temporizador reproducirá sonido al terminar"
      );
    } catch (error) {
      toast.error("Error", "No se pudo cambiar el sonido");
    }
  };

  const openCountdownDisplay = () => {
    window.open("/openspace/countdown", "_blank", "width=1920,height=1080");
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Timer className="h-4 w-4" />
          Temporizador
        </Button>
      </DialogTrigger>
      <DialogContent className="border-zinc-700 bg-zinc-900 text-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl">Control del Temporizador</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Current Timer Display */}
          <div className="rounded-lg bg-zinc-800 p-6 text-center">
            <div className="font-mono text-5xl font-bold text-yellow-400">{formatTime(state.remainingSeconds)}</div>
          </div>

          {/* Controls */}
          <div className="flex gap-2">
            <Button
              onClick={handlePlayPause}
              disabled={loading}
              className="flex-1 bg-green-600 text-white hover:bg-green-700"
            >
              {state.isRunning ? (
                <>
                  <Pause className="mr-2 h-4 w-4" />
                  Pausar
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  Iniciar
                </>
              )}
            </Button>
            <Button
              onClick={handleReset}
              disabled={loading}
              variant="outline"
              size="icon"
              className="h-10 w-10"
              title="Reiniciar"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
            <Button
              onClick={handleToggleSound}
              disabled={loading}
              variant={state.soundEnabled ? "default" : "outline"}
              size="icon"
              className={`h-10 w-10 ${state.soundEnabled ? "text-black" : ""}`}
              title={state.soundEnabled ? "Sonido Activado" : "Sonido Desactivado"}
            >
              {state.soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </Button>
          </div>

          {/* Set Timer */}
          <div className="space-y-4 rounded-lg border border-zinc-700 p-4">
            <Label className="text-sm font-semibold text-white">Configurar Temporizador</Label>

            {/* Duration Inputs */}
            <div className="space-y-3">
              <Label className="text-xs text-zinc-400">Por Duración</Label>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input
                    id="minutes"
                    type="number"
                    min="0"
                    placeholder="Min"
                    value={minutes}
                    onChange={(e) => setMinutes(e.target.value)}
                    className="border-zinc-600 bg-zinc-800 text-white placeholder:text-zinc-500"
                  />
                </div>
                <div className="flex-1">
                  <Input
                    id="seconds"
                    type="number"
                    min="0"
                    max="59"
                    placeholder="Seg"
                    value={seconds}
                    onChange={(e) => setSeconds(e.target.value)}
                    className="border-zinc-600 bg-zinc-800 text-white placeholder:text-zinc-500"
                  />
                </div>
              </div>
              <Button onClick={handleSetDuration} disabled={loading} className="w-full" variant="secondary">
                Establecer Duración
              </Button>
            </div>

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-zinc-700" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-zinc-900 px-2 text-zinc-500">O</span>
              </div>
            </div>

            {/* Target Time Input */}
            <div className="space-y-3">
              <Label className="text-xs text-zinc-400">Hasta Hora Específica</Label>
              <Input
                id="targetTime"
                type="time"
                value={targetTime}
                onChange={(e) => setTargetTime(e.target.value)}
                className="border-zinc-600 bg-zinc-800 text-white [&::-webkit-calendar-picker-indicator]:invert"
              />
              <Button onClick={handleSetTargetTime} disabled={loading} className="w-full" variant="secondary">
                Establecer Hora
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
