"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import {
  AlertTriangle,
  Bath,
  Bell,
  Bird,
  Bot,
  BusFront,
  CircleDot,
  Clapperboard,
  Code2,
  Crown,
  Disc,
  Drum,
  Film,
  HandMetal,
  Laugh,
  Layers,
  Megaphone,
  MessageSquare,
  MonitorPlay,
  MousePointer,
  MoveUp,
  Music,
  Music4,
  PartyPopper,
  Pause,
  PlaySquare,
  Radio,
  Rocket,
  Sandwich,
  Search,
  ShieldAlert,
  Smile,
  Sparkles,
  Speaker,
  Square,
  Squirrel,
  ThumbsDown,
  ThumbsUp,
  ToggleLeft,
  Volume2,
  VolumeX,
  Zap,
} from "lucide-react";

import { cn } from "app/lib/utils";
import { useShortcuts } from "components/Admin/shell/shortcuts";
import { PageContainer, PageHeader } from "components/Admin/ui/page";
import { EmptyState } from "components/Admin/ui/states";
import { StatusDot } from "components/Admin/ui/status";
import { useNow } from "components/Admin/ui/time";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Input } from "components/shared/ui/input";
import { Kbd } from "components/shared/ui/kbd";
import { Slider } from "components/shared/ui/slider";
import { Tabs, TabsList, TabsTrigger } from "components/shared/ui/tabs";
import { toast } from "components/shared/ui/toast-utils";
import { useRealtimeChannel } from "hooks/useRealtimeChannel";
import { SOUNDS } from "lib/launchpad/sounds";
import { GLOBAL_CHANNELS } from "lib/realtime/channels";
import { getRealtimeClient } from "lib/realtime/client";

type Sound = (typeof SOUNDS)[number] & { icon: ComponentType<{ className?: string }> };

/** On the launchpad channel; the server sends `play_sound` too, when an OBS cue fires a sound. */
type PlayPayload = { soundId: string; audioFile: string; volume: number; timestamp: number };
type StatePayload = { playingId: string | null; timestamp: number };
/** An output tab saying it is there, and whether it will sound. */
type OutputPayload = { id: string; label: string; muted: boolean };

const OUTPUT_KEY = "launchpad-output-mode";
/** Outputs say hello this often; one not heard from for OUTPUT_TTL_MS is gone. */
const HELLO_MS = 15_000;
const OUTPUT_TTL_MS = 40_000;
/** How long a pad shows it was sent, before an output answers that it is playing. */
const SENT_MS = 700;
const KEYED_PADS = 9;

const ICONS: Record<string, ComponentType<{ className?: string }>> = {
  "1": Layers,
  "2": Bird,
  "3": Sparkles,
  "4": Sparkles,
  "5": PartyPopper,
  "6": MousePointer,
  "7": Drum,
  "8": HandMetal,
  "9": Laugh,
  "10": ThumbsDown,
  "11": Bell,
  "12": Music,
  "13": Disc,
  "14": CircleDot,
  "15": Bot,
  "16": ToggleLeft,
  "17": MoveUp,
  "18": Zap,
  "19": Music,
  "20": Radio,
  "21": MonitorPlay,
  "22": Smile,
  "23": Sparkles,
  "24": ThumbsUp,
  "25": Squirrel,
  "26": Clapperboard,
  "27": MessageSquare,
  "28": BusFront,
  "29": Code2,
  "30": Pause,
  "31": Sandwich,
  "32": AlertTriangle,
  "33": PlaySquare,
  "34": Crown,
  "35": Film,
  "36": ShieldAlert,
  "37": Rocket,
  "38": Music4,
  "39": AlertTriangle,
  "40": Megaphone,
  "41": Bath,
  "42": Bell,
};

// The bank itself lives in lib/launchpad/sounds so OBS cues can fire it too.
const BANK: Sound[] = SOUNDS.map((sound) => ({ ...sound, icon: ICONS[sound.id] ?? Music }));

const send = (event: string, payload: unknown) =>
  getRealtimeClient().publish(GLOBAL_CHANNELS.launchpad, event, payload);

/** "Mac · Chrome", "iPhone · Safari": enough to tell the sound laptop from a phone. First match wins. */
const SYSTEMS = [
  ["iPhone", "iPhone"],
  ["iPad", "iPad"],
  ["Android", "Android"],
  ["Macintosh", "Mac"],
  ["Windows", "Windows"],
  ["Linux", "Linux"],
] as const;
const BROWSERS = [
  ["OBS/", "OBS"],
  ["Edg/", "Edge"],
  ["Firefox/", "Firefox"],
  ["Chrome/", "Chrome"],
  ["Safari/", "Safari"],
] as const;

function deviceLabel(agent: string): string {
  const system = SYSTEMS.find(([mark]) => agent.includes(mark))?.[1] ?? "Dispositivo";
  const browser = BROWSERS.find(([mark]) => agent.includes(mark))?.[1];

  return browser ? `${system} · ${browser}` : system;
}

/** Search ignores case and accents: "pajaros" finds "Pájaros". */
const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/**
 * Sonidos: the sound pads. A tab is either a controller (its pads play on every output) or an
 * output (it plays what controllers and OBS cues send, at its own volume). Outputs say hello on
 * the channel, so every tab shows which devices will actually sound.
 */
export default function LaunchpadClient() {
  const [isOutput, setIsOutput] = useState(false);
  const [tabId] = useState(() => `tab-${Math.random().toString(36).slice(2, 10)}`);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [sentId, setSentId] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(100);
  const [query, setQuery] = useState("");
  const [outputs, setOutputs] = useState<Record<string, OutputPayload & { at: number }>>({});
  const search = useRef<HTMLInputElement>(null);
  const audios = useRef(new Map<string, HTMLAudioElement>());
  const live = useRef({ isOutput, muted, volume, playingId });
  live.current = { isOutput, muted, volume, playingId };
  const now = useNow(5_000);

  // The mode is per device; read after mount so the server render never disagrees.
  useEffect(() => setIsOutput(window.localStorage.getItem(OUTPUT_KEY) === "true"), []);
  const changeMode = (output: boolean) => {
    setIsOutput(output);
    window.localStorage.setItem(OUTPUT_KEY, String(output));
  };

  const stopHere = useCallback(() => {
    for (const audio of audios.current.values()) {
      audio.pause();
      audio.currentTime = 0;
    }
    setPlayingId(null);
  }, []);

  const playHere = useCallback(
    ({ soundId, audioFile }: { soundId: string; audioFile: string }) => {
      if (live.current.muted) return;
      // The sound already playing stops instead: the same press (or cue) twice is a stop.
      if (live.current.playingId === soundId) return stopHere();
      for (const [id, audio] of audios.current) {
        if (id === soundId) continue;
        audio.pause();
        audio.currentTime = 0;
      }
      let audio = audios.current.get(soundId);
      if (!audio) {
        audio = new Audio(audioFile);
        audios.current.set(soundId, audio);
      }
      audio.volume = live.current.volume / 100;
      audio.currentTime = 0;
      audio.onended = () => setPlayingId((current) => (current === soundId ? null : current));
      setPlayingId(soundId);
      audio.play().catch(() => {
        setPlayingId(null);
        toast.error("El navegador no dejó reproducir", "Tocá esta página una vez y probá de nuevo.");
      });
    },
    [stopHere]
  );

  const hello = useCallback(
    () => send("output", { id: tabId, label: deviceLabel(navigator.userAgent), muted: live.current.muted }),
    [tabId]
  );

  const { isConnected } = useRealtimeChannel(GLOBAL_CHANNELS.launchpad, (event, payload) => {
    if (event === "output") {
      const output = payload as OutputPayload;
      setOutputs((list) => ({ ...list, [output.id]: { ...output, at: Date.now() } }));
    } else if (event === "output_gone") {
      const { id } = payload as { id: string };
      setOutputs(({ [id]: _gone, ...rest }) => rest);
    } else if (live.current.isOutput) {
      if (event === "play_sound") playHere(payload as PlayPayload);
      if (event === "stop_all") stopHere();
      if (event === "state_request") {
        hello();
        send("sound_state", { playingId: live.current.playingId, timestamp: Date.now() } satisfies StatePayload);
      }
    } else if (event === "sound_state") {
      setPlayingId((payload as StatePayload).playingId);
    }
  });

  // Whoever opens the page asks who's out there (and what is playing), and again after a reconnect.
  useEffect(() => {
    if (isConnected) send("state_request", { requesterId: tabId, timestamp: Date.now() });
  }, [isConnected, tabId]);

  // An output says hello (again whenever it mutes or unmutes), keeps saying it, says goodbye when
  // it stops being one, and tells what it plays.
  useEffect(() => {
    if (isOutput) hello();
  }, [isOutput, muted, hello]);
  useEffect(() => {
    if (!isOutput) return;
    const timer = setInterval(hello, HELLO_MS);
    const bye = () => send("output_gone", { id: tabId });
    window.addEventListener("pagehide", bye);

    return () => {
      clearInterval(timer);
      window.removeEventListener("pagehide", bye);
      bye();
    };
  }, [isOutput, hello, tabId]);
  useEffect(() => {
    if (isOutput) send("sound_state", { playingId, timestamp: Date.now() } satisfies StatePayload);
  }, [isOutput, playingId]);

  // The volume reaches what is already playing: a sound that came in too loud can be pulled down.
  useEffect(() => {
    for (const audio of audios.current.values()) audio.volume = volume / 100;
  }, [volume]);

  useEffect(() => {
    if (!sentId) return;
    const timer = setTimeout(() => setSentId(null), SENT_MS);
    return () => clearTimeout(timer);
  }, [sentId]);

  const fire = (sound: Sound) => {
    if (isOutput) return playHere({ soundId: sound.id, audioFile: sound.audioFile });
    send("play_sound", {
      soundId: sound.id,
      audioFile: sound.audioFile,
      volume: 100,
      timestamp: Date.now(),
    } satisfies PlayPayload);
    setSentId(sound.id);
  };
  const stopEverywhere = () => {
    if (isOutput) stopHere();
    send("stop_all", { timestamp: Date.now() });
  };
  const toggleMute = () => {
    if (!muted) stopHere();
    setMuted(!muted);
  };

  const visible = useMemo(() => {
    const term = fold(query.trim());
    return term ? BANK.filter((sound) => fold(sound.name).includes(term)) : BANK;
  }, [query]);

  useShortcuts([
    ...Array.from({ length: KEYED_PADS }, (_, index) => ({
      id: `sonidos.pad-${index + 1}`,
      keys: String(index + 1),
      label: visible[index] ? `Disparar «${visible[index].name}»` : `Disparar el sonido ${index + 1}`,
      group: "Sonidos",
      run: () => {
        const sound = visible[index];
        if (sound && !(isOutput && muted)) fire(sound);
      },
    })),
    { id: "sonidos.stop", keys: "0", label: "Detener todo", group: "Sonidos", run: stopEverywhere },
    {
      id: "sonidos.search",
      keys: "/",
      label: "Buscar un sonido",
      group: "Sonidos",
      run: () => search.current?.focus(),
    },
  ]);

  const others = Object.values(outputs).filter((output) => output.id !== tabId && now - output.at < OUTPUT_TTL_MS);
  const speakers = [
    ...(isOutput ? [{ id: tabId, label: "Esta pestaña", muted }] : []),
    ...others.toSorted((a, b) => a.label.localeCompare(b.label)),
  ];

  return (
    <PageContainer size="large">
      <PageHeader
        actions={
          <>
            <Tabs value={isOutput ? "output" : "controller"} onValueChange={(value) => changeMode(value === "output")}>
              <TabsList aria-label="Qué hace este dispositivo">
                <TabsTrigger value="controller">
                  <Radio /> Controlador
                </TabsTrigger>
                <TabsTrigger value="output">
                  <Speaker /> Salida de audio
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <Button variant="outline" onClick={stopEverywhere}>
              <Square className="fill-current" /> Detener todo <Kbd className="pointer-coarse:hidden">0</Kbd>
            </Button>
          </>
        }
        description={
          isOutput
            ? "Esta pestaña reproduce lo que manden los controladores y los cues de OBS, a su propio volumen."
            : speakers.length === 0
              ? "Para que se escuche, abrí Sonidos en la compu del sonido y elegí «Salida de audio»."
              : "Tocá un sonido y suena en las salidas de audio conectadas."
        }
        meta={
          speakers.length === 0 ? (
            <Badge variant="warning">
              <VolumeX /> Ninguna salida: no se va a escuchar
            </Badge>
          ) : (
            speakers.map((speaker) => (
              <Badge
                key={speaker.id}
                title={speaker.muted ? "Silenciada: no va a sonar" : "Suena acá"}
                variant={speaker.muted ? "warning" : "secondary"}
              >
                {speaker.muted ? <VolumeX /> : <StatusDot tone="ok" />}
                {speaker.label}
              </Badge>
            ))
          )
        }
        title="Sonidos"
      />

      {isOutput && (
        <div className="mb-4 flex flex-col items-stretch gap-3 rounded-lg border border-border bg-card px-3.5 py-2.5 shadow-edge sm:flex-row sm:items-center sm:gap-4">
          <div className="flex flex-1 items-center gap-3">
            <Volume2 aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            <Slider
              aria-label="Volumen de esta salida"
              className="flex-1"
              max={100}
              step={1}
              value={[volume]}
              onValueChange={([value]) => setVolume(value ?? volume)}
            />
            <span className="w-10 text-right font-terminal text-meta text-muted-foreground tabular-nums">
              {volume}%
            </span>
          </div>
          <Button aria-pressed={muted} size="sm" variant={muted ? "destructive" : "outline"} onClick={toggleMute}>
            {muted ? <VolumeX /> : <Volume2 />}
            {muted ? "Silenciada" : "Sonando"}
          </Button>
        </div>
      )}

      <div className="mb-3 flex items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            ref={search}
            aria-label="Buscar un sonido"
            className="pr-8 pl-8"
            enterKeyHint="go"
            placeholder="Buscar sonido…"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && visible[0]) fire(visible[0]);
              if (event.key === "Escape") event.currentTarget.blur();
            }}
          />
          <Kbd className="absolute top-1/2 right-2 -translate-y-1/2 pointer-coarse:hidden">/</Kbd>
        </div>
        <span className="font-terminal text-meta whitespace-nowrap text-muted-foreground tabular-nums">
          {visible.length === BANK.length ? `${BANK.length} sonidos` : `${visible.length} de ${BANK.length}`}
        </span>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          action={
            <Button size="sm" variant="outline" onClick={() => setQuery("")}>
              Ver todos
            </Button>
          }
          compact
          description="Probá con otra palabra."
          icon={Search}
          title={`Ningún sonido se llama «${query.trim()}»`}
        />
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
          {visible.map((sound, index) => {
            const Icon = sound.icon;
            const playing = playingId === sound.id;

            return (
              <button
                key={sound.id}
                aria-label={isOutput ? `Reproducir ${sound.name}` : `Disparar ${sound.name} en las salidas`}
                aria-pressed={playing}
                className={cn(
                  "group relative flex h-20 touch-manipulation flex-col items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-2 text-center shadow-edge transition-colors outline-none select-none hover:border-input hover:bg-raised focus-visible:ring-2 focus-visible:ring-ring/70 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 motion-reduce:active:scale-100",
                  playing && "border-primary/60 bg-primary-surface hover:border-primary/60 hover:bg-primary-surface",
                  sentId === sound.id && !playing && "border-input bg-raised"
                )}
                disabled={isOutput && muted}
                type="button"
                onClick={() => fire(sound)}
              >
                {index < KEYED_PADS && (
                  <Kbd className="absolute top-1.5 left-1.5 pointer-coarse:hidden">{index + 1}</Kbd>
                )}
                {playing && <StatusDot className="absolute top-2 right-2" tone="brand" />}
                <Icon
                  className={cn(
                    "size-5 text-muted-foreground transition-colors group-hover:text-foreground",
                    playing && "text-primary group-hover:text-primary"
                  )}
                />
                <span className={cn("line-clamp-2 text-meta leading-tight font-medium", playing && "text-primary")}>
                  {sound.name}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}
