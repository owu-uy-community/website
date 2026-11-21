"use client";

import { memo, useEffect, useState, type ReactNode } from "react";
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
import { MicroLabel } from "components/Admin/ui/page";
import { Button } from "components/shared/ui/button";
import { ButtonGroup } from "components/shared/ui/button-group";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "components/shared/ui/input-group";
import { Popover, PopoverContent, PopoverTrigger } from "components/shared/ui/popover";
import { toast } from "components/shared/ui/toast-utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "components/shared/ui/tooltip";
import { useFullscreen } from "hooks/useFullscreen";
import { orpc } from "lib/orpc";
import type { EffectEvent } from "lib/owy-stage/scenes";

import { haptic } from "./haptics";
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

/** The three one-tap overlays; the emoji rain and the lower third take a choice first. */
const QUICK = [
  { effect: "confetti", label: "Confetti", icon: PartyPopper },
  { effect: "flash", label: "Flash", icon: Zap },
  { effect: "owy-happy", label: "Owy feliz", icon: Smile },
] as const;

const useFire = () =>
  useMutation(
    orpc.owyStage.fireEffect.mutationOptions({
      onError: (error) => toast.error("No se pudo disparar el efecto", error.message),
    })
  );

/** One-shot overlays on whatever is on air; they clear themselves. Icons with tooltips, for a mouse. */
function Effects() {
  const [caption, setCaption] = useState("");
  const [captionOpen, setCaptionOpen] = useState(false);
  const fire = useFire();

  return (
    <ButtonGroup aria-label="Efectos sobre lo que está al aire">
      {QUICK.map(({ effect, label, icon: Icon }) => (
        <Tip key={effect} label={label}>
          <Button
            aria-label={label}
            className={fxButton}
            size="icon"
            variant="ghost"
            onClick={() => fire.mutate({ effect })}
          >
            <Icon className="h-4 w-4" />
          </Button>
        </Tip>
      ))}
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
 * The same overlays for a finger (a tooltip never opens there) or a narrow
 * header: each one named, behind the «Efectos» button so a stray tap in the
 * header can't put anything on air, and saying plainly that they go on air.
 */
function EffectsPanel() {
  const [caption, setCaption] = useState("");
  const fire = useFire();
  const go = (event: EffectEvent) => {
    fire.mutate(event);
    haptic(12);
  };

  return (
    <div className="w-72 space-y-3">
      <p className="flex items-center gap-1.5 font-terminal text-3xs font-semibold tracking-[0.12em] text-live-foreground uppercase">
        <span className="size-1.5 rounded-full bg-live" /> Salen al aire al tocarlos
      </p>
      <div className="grid grid-cols-3 gap-1.5">
        {QUICK.map(({ effect, label, icon: Icon }) => (
          <Button
            key={effect}
            className="h-auto flex-col gap-1 py-2.5 text-meta"
            variant="outline"
            onClick={() => go({ effect })}
          >
            <Icon className="h-5 w-5" />
            {label}
          </Button>
        ))}
      </div>
      <div className="space-y-1.5">
        <MicroLabel>Lluvia de emojis</MicroLabel>
        <div className="grid grid-cols-4 gap-1">
          {EMOJIS.map((emoji) => (
            <Button
              key={emoji}
              aria-label={`Lluvia de ${emoji}`}
              className="h-11 w-full text-xl"
              size="icon"
              variant="ghost"
              onClick={() => go({ effect: "emoji", payload: { text: emoji } })}
            >
              {emoji}
            </Button>
          ))}
        </div>
      </div>
      <form
        className="space-y-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          if (!caption.trim()) return;
          go({ effect: "caption", payload: { text: caption.trim() } });
          setCaption("");
        }}
      >
        <MicroLabel>Lower third</MicroLabel>
        <InputGroup className="pointer-coarse:h-11">
          <InputGroupInput
            aria-label="Texto del lower third"
            className="pointer-coarse:text-base"
            enterKeyHint="send"
            maxLength={200}
            placeholder="Texto abajo, sobre lo que está al aire…"
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
    </div>
  );
}

/**
 * The desk's controls in the admin header: the guion's player, effects, the
 * settings sheet, fullscreen (the tablet gains the browser's bars back) and
 * the keyboard help. The connection is the shell's own pill, next to these.
 */
function StageToolbarView({
  rundown,
  onGuion,
  onSettings,
  onHelp,
}: {
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
      <RundownMiniPlayer rundown={rundown} onOpen={onGuion} />
      <div className="hidden lg:pointer-fine:flex">
        <Effects />
      </div>
      {/* Touch screens and narrow headers: the same effects, named, behind one button. */}
      <Popover>
        <Tip label="Efectos">
          <PopoverTrigger asChild>
            <Button aria-label="Efectos" className={cn(fxButton, "lg:pointer-fine:hidden")} size="icon" variant="ghost">
              <Sparkles className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
        </Tip>
        <PopoverContent align="end" className="w-auto p-3">
          <EffectsPanel />
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

export const StageToolbar = memo(StageToolbarView);
