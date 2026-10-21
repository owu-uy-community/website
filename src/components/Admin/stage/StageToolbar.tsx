"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Keyboard,
  Maximize,
  Minimize,
  PartyPopper,
  SlidersHorizontal,
  Smile,
  Sparkles,
  Subtitles,
  Zap,
} from "lucide-react";

import { cn } from "app/lib/utils";
import { Button } from "components/shared/ui/button";
import { ButtonGroup } from "components/shared/ui/button-group";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "components/shared/ui/input-group";
import { Popover, PopoverContent, PopoverTrigger } from "components/shared/ui/popover";
import { toast } from "components/shared/ui/toast-utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "components/shared/ui/tooltip";
import { useFullscreen } from "hooks/useFullscreen";
import { orpc } from "lib/orpc";

import { RundownMiniPlayer, type Rundown } from "./Rundown";

const EMOJIS = ["👏", "🎉", "🧉", "❤️", "🔥", "😂", "🙌", "🚀"];

function Tip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

const fxButton = "h-9 w-9 border border-input pointer-coarse:h-10 pointer-coarse:w-10";

/** One-shot overlays on whatever is on air; they clear themselves. */
function Effects() {
  const [caption, setCaption] = useState("");
  const [captionOpen, setCaptionOpen] = useState(false);
  const fire = useMutation(
    orpc.owyStage.fireEffect.mutationOptions({
      onError: (error) => toast.error("No se pudo disparar el efecto", error.message),
    })
  );

  return (
    <ButtonGroup aria-label="Efectos sobre lo que está al aire">
      <Tip label="Confetti">
        <Button
          aria-label="Confetti"
          className={fxButton}
          size="icon"
          variant="ghost"
          onClick={() => fire.mutate({ effect: "confetti" })}
        >
          <PartyPopper className="h-4 w-4" />
        </Button>
      </Tip>
      <Tip label="Flash">
        <Button
          aria-label="Flash"
          className={fxButton}
          size="icon"
          variant="ghost"
          onClick={() => fire.mutate({ effect: "flash" })}
        >
          <Zap className="h-4 w-4" />
        </Button>
      </Tip>
      <Tip label="Owy feliz">
        <Button
          aria-label="Owy feliz"
          className={fxButton}
          size="icon"
          variant="ghost"
          onClick={() => fire.mutate({ effect: "owy-happy" })}
        >
          <Smile className="h-4 w-4" />
        </Button>
      </Tip>
      <Popover>
        <Tip label="Lluvia de emojis">
          <PopoverTrigger asChild>
            <Button aria-label="Lluvia de emojis" className={cn(fxButton, "text-base")} size="icon" variant="ghost">
              👏
            </Button>
          </PopoverTrigger>
        </Tip>
        <PopoverContent align="end" className="w-auto p-1.5">
          <div className="grid grid-cols-4 gap-1">
            {EMOJIS.map((emoji) => (
              <Button
                key={emoji}
                aria-label={`Lluvia de ${emoji}`}
                className="h-11 w-11 text-xl"
                size="icon"
                variant="ghost"
                onClick={() => fire.mutate({ effect: "emoji", payload: { text: emoji } })}
              >
                {emoji}
              </Button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
      <Popover open={captionOpen} onOpenChange={setCaptionOpen}>
        <Tip label="Lower third (texto abajo)">
          <PopoverTrigger asChild>
            <Button aria-label="Lower third" className={fxButton} size="icon" variant="ghost">
              <Subtitles className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
        </Tip>
        <PopoverContent align="end" className="w-80 p-2">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!caption.trim()) return;
              fire.mutate({ effect: "caption", payload: { text: caption.trim() } });
              setCaption("");
              setCaptionOpen(false);
            }}
          >
            <InputGroup>
              <InputGroupInput
                autoFocus
                aria-label="Texto del lower third"
                maxLength={200}
                placeholder="Texto para un lower third…"
                value={caption}
                onChange={(event) => setCaption(event.target.value)}
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton size="sm" type="submit" variant="secondary">
                  Mostrar
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
          </form>
        </PopoverContent>
      </Popover>
    </ButtonGroup>
  );
}

/**
 * The desk's controls in the admin header: connection, the guion's player,
 * effects, the settings sheet, fullscreen (the tablet gains the browser's
 * bars back) and the keyboard help.
 */
export function StageToolbar({
  connected,
  rundown,
  onGuion,
  onSettings,
  onHelp,
}: {
  connected: boolean;
  rundown: Rundown;
  onGuion: () => void;
  onSettings: () => void;
  onHelp: () => void;
}) {
  const fullscreen = useFullscreen<HTMLElement>();
  // The whole page goes fullscreen, admin shell included: only the browser's bars go away.
  useEffect(() => {
    fullscreen.ref.current = document.documentElement;
  }, [fullscreen.ref]);

  return (
    <div className="flex min-w-0 items-center gap-2">
      <Tip
        label={
          connected ? "Realtime conectado: los cambios llegan a la pared al instante" : "Sin realtime: reconectando…"
        }
      >
        <span className="flex h-9 shrink-0 items-center gap-2 rounded-md border border-input px-2.5 text-xs text-muted-foreground">
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              connected ? "bg-green-500 shadow-[0_0_0_3px_rgba(34,197,94,.18)]" : "animate-pulse bg-red-500"
            )}
          />
          <span className="hidden 2xl:inline">{connected ? "Conectado" : "Sin conexión"}</span>
        </span>
      </Tip>
      <RundownMiniPlayer rundown={rundown} onOpen={onGuion} />
      <div className="hidden lg:flex">
        <Effects />
      </div>
      {/* Narrow screens: the same effects behind one button, so the header never overflows. */}
      <Popover>
        <Tip label="Efectos">
          <PopoverTrigger asChild>
            <Button aria-label="Efectos" className={cn(fxButton, "lg:hidden")} size="icon" variant="ghost">
              <Sparkles className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
        </Tip>
        <PopoverContent align="end" className="w-auto p-1.5">
          <Effects />
        </PopoverContent>
      </Popover>
      <Tip label="Salida y ajustes (OBS, evento, Spotify, simulador)">
        <Button aria-label="Salida y ajustes" className={fxButton} size="icon" variant="ghost" onClick={onSettings}>
          <SlidersHorizontal className="h-4 w-4" />
        </Button>
      </Tip>
      {fullscreen.supported && (
        <Tip label={fullscreen.isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}>
          <Button
            aria-label={fullscreen.isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
            className={fxButton}
            size="icon"
            variant="ghost"
            onClick={fullscreen.toggle}
          >
            {fullscreen.isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </Button>
        </Tip>
      )}
      <Tip label="Atajos de teclado (?)">
        <Button
          aria-label="Atajos de teclado"
          className={cn(fxButton, "hidden pointer-fine:inline-flex")}
          size="icon"
          variant="ghost"
          onClick={onHelp}
        >
          <Keyboard className="h-4 w-4" />
        </Button>
      </Tip>
    </div>
  );
}
