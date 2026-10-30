"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type MouseEvent,
  type PointerEvent,
} from "react";
import {
  Activity,
  AlertTriangle,
  Bath,
  Bell,
  BellRing,
  Bird,
  Bot,
  Bug,
  BusFront,
  CircleCheck,
  CircleDot,
  CircleX,
  Clapperboard,
  Clock,
  Code2,
  Coins,
  Crown,
  Disc,
  Disc3,
  Drama,
  Drum,
  Film,
  Flame,
  Frown,
  Hammer,
  Hand,
  HandMetal,
  Heart,
  Laugh,
  Layers,
  Megaphone,
  MessageSquare,
  Mic,
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
  Siren,
  Smile,
  Sparkles,
  Speaker,
  Square,
  Squirrel,
  ThumbsDown,
  ThumbsUp,
  Timer,
  TimerOff,
  ToggleLeft,
  Trophy,
  Users,
  Volume2,
  VolumeX,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { cn } from "app/lib/utils";
import { useShortcuts } from "components/Admin/shell/shortcuts";
import { Meter, PageContainer, PageHeader } from "components/Admin/ui/page";
import { EmptyState } from "components/Admin/ui/states";
import { ConnectionPill, StatusDot } from "components/Admin/ui/status";
import { useNow } from "components/Admin/ui/time";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Input } from "components/shared/ui/input";
import { Kbd } from "components/shared/ui/kbd";
import { Slider } from "components/shared/ui/slider";
import { Tabs, TabsList, TabsTrigger } from "components/shared/ui/tabs";
import { useRealtimeChannel } from "hooks/useRealtimeChannel";
import { player, type PlayerSnapshot } from "lib/launchpad/player";
import { findSound, SOUND_GROUPS, SOUNDS, type Sound, type SoundGroup } from "lib/launchpad/sounds";
import { GLOBAL_CHANNELS } from "lib/realtime/channels";
import { getRealtimeClient } from "lib/realtime/client";

/** On the launchpad channel; the server sends `play_sound` too, when an OBS cue fires a sound. */
type PlayPayload = { soundId: string; audioFile: string; volume: number; timestamp: number };
/** What an output plays. `elapsedMs` lets a controller that opens mid-sound draw its progress. */
type StatePayload = { playingId: string | null; elapsedMs?: number; timestamp: number };
/** An output tab saying it is there, and whether it will sound. */
type OutputPayload = { id: string; label: string; muted: boolean; locked?: boolean };
type Playing = { id: string; startedAt: number; seconds: number };

const OUTPUT_KEY = "launchpad-output-mode";
const VOLUME_KEY = "launchpad-output-volume";
/** Outputs say hello this often; one not heard from for OUTPUT_TTL_MS is gone. */
const HELLO_MS = 15_000;
const OUTPUT_TTL_MS = 40_000;
/** How long a pad shows it was sent, while no output has answered that it plays it. */
const SENT_MS = 1_500;
const KEYED_PADS = 9;

const ICONS: Record<string, LucideIcon> = {
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
  "43": Hand,
  "44": Users,
  "45": Bug,
  "46": Frown,
  "47": Siren,
  "48": CircleCheck,
  "49": CircleX,
  "50": TimerOff,
  "51": Sparkles,
  "52": Drama,
  "53": Disc3,
  "54": Coins,
  "55": Clock,
  "56": BellRing,
  "57": Flame,
  "58": Heart,
  "59": Mic,
  "60": Timer,
  "61": Hammer,
  "62": Trophy,
};

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

const secondsFormat = new Intl.NumberFormat("es-UY", { maximumFractionDigits: 1 });
const duration = (seconds: number) => `${secondsFormat.format(seconds < 10 ? seconds : Math.round(seconds))} s`;

const SERVER_SNAPSHOT: PlayerSnapshot = { unlocked: false, ready: 0, failed: 0, playing: null };

/**
 * Sonidos: the sound pads. A tab is either a controller (its pads play on every output) or an
 * output (it plays what controllers and OBS cues send, at its own volume). Outputs say hello on
 * the channel, so every tab shows which devices will actually sound.
 */
export default function LaunchpadClient() {
  const [isOutput, setIsOutput] = useState(false);
  const [tabId] = useState(() => `tab-${Math.random().toString(36).slice(2, 10)}`);
  /** What the outputs report playing (a controller's view). */
  const [remote, setRemote] = useState<Playing | null>(null);
  const [sentId, setSentId] = useState<string | null>(null);
  /** Press to "it plays" and back, for this controller's last confirmed press. */
  const [roundTrip, setRoundTrip] = useState<number | null>(null);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(100);
  const [query, setQuery] = useState("");
  const [outputs, setOutputs] = useState<Record<string, OutputPayload & { at: number }>>({});
  const search = useRef<HTMLInputElement>(null);
  const pressed = useRef<{ id: string; at: number } | null>(null);
  const audio = useSyncExternalStore(player.subscribe, player.getSnapshot, () => SERVER_SNAPSHOT);
  const playing: Playing | null = isOutput ? audio.playing : remote;
  const live = useRef({ isOutput, muted, audio });
  live.current = { isOutput, muted, audio };
  const now = useNow(5_000);

  // Mode and volume are per device; read after mount so the server render never disagrees.
  useEffect(() => {
    setIsOutput(window.localStorage.getItem(OUTPUT_KEY) === "true");
    const saved = window.localStorage.getItem(VOLUME_KEY);
    if (saved !== null && Number(saved) >= 0 && Number(saved) <= 100) setVolume(Number(saved));
  }, []);
  const changeMode = (output: boolean) => {
    if (!output) player.stop();
    setIsOutput(output);
    window.localStorage.setItem(OUTPUT_KEY, String(output));
  };

  // An output loads the whole bank up front, and takes its first tap or key to unlock sound.
  useEffect(() => {
    if (isOutput) player.preload();
  }, [isOutput]);
  useEffect(() => {
    if (!isOutput || audio.unlocked) return;
    const unlock = () => player.unlock();
    document.addEventListener("pointerdown", unlock, true);
    document.addEventListener("keydown", unlock, true);
    return () => {
      document.removeEventListener("pointerdown", unlock, true);
      document.removeEventListener("keydown", unlock, true);
    };
  }, [isOutput, audio.unlocked]);

  // The volume reaches what is already playing: a sound that came in too loud can be pulled down.
  useEffect(() => {
    player.setVolume(volume / 100);
  }, [volume]);
  const changeVolume = (value: number) => {
    setVolume(value);
    window.localStorage.setItem(VOLUME_KEY, String(value));
  };

  const playHere = useCallback(({ soundId, audioFile }: { soundId: string; audioFile: string }) => {
    if (live.current.muted) return;
    // The sound already playing stops instead: the same press (or cue) twice is a stop.
    if (live.current.audio.playing?.id === soundId) return player.stop();
    // False on a tab nobody has touched yet: its banner already asks for that tap
    player.play(soundId, audioFile);
  }, []);

  const hello = useCallback(
    () =>
      send("output", {
        id: tabId,
        label: deviceLabel(navigator.userAgent),
        muted: live.current.muted,
        locked: !live.current.audio.unlocked,
      } satisfies OutputPayload),
    [tabId]
  );

  const reportState = () => {
    const current = live.current.audio.playing;
    send("sound_state", {
      playingId: current?.id ?? null,
      elapsedMs: current ? Date.now() - current.startedAt : undefined,
      timestamp: Date.now(),
    } satisfies StatePayload);
  };

  const { isConnected } = useRealtimeChannel(GLOBAL_CHANNELS.launchpad, (event, payload) => {
    if (event === "output") {
      const output = payload as OutputPayload;
      setOutputs((list) => ({ ...list, [output.id]: { ...output, at: Date.now() } }));
    } else if (event === "output_gone") {
      const { id } = payload as { id: string };
      setOutputs(({ [id]: _gone, ...rest }) => rest);
    } else if (live.current.isOutput) {
      if (event === "play_sound") playHere(payload as PlayPayload);
      if (event === "stop_all") player.stop();
      if (event === "state_request") {
        hello();
        reportState();
      }
    } else if (event === "sound_state") {
      const state = payload as StatePayload;
      const sound = state.playingId ? findSound(state.playingId) : undefined;
      setRemote(
        state.playingId
          ? { id: state.playingId, startedAt: Date.now() - (state.elapsedMs ?? 0), seconds: sound?.seconds ?? 0 }
          : null
      );
      const press = pressed.current;
      if (press && press.id === state.playingId && Date.now() - press.at < 5_000) {
        setRoundTrip(Date.now() - press.at);
        pressed.current = null;
      }
    }
  });

  // Whoever opens the page asks who's out there (and what is playing), and again after a reconnect.
  useEffect(() => {
    if (isConnected) send("state_request", { requesterId: tabId, timestamp: Date.now() });
  }, [isConnected, tabId]);

  // An output says hello (again whenever it mutes, unmutes or unlocks), keeps saying it, says
  // goodbye when it stops being one, and tells what it plays.
  useEffect(() => {
    if (isOutput) hello();
  }, [isOutput, muted, audio.unlocked, hello]);
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
  const playingId = audio.playing?.id ?? null;
  useEffect(() => {
    if (isOutput) send("sound_state", { playingId, elapsedMs: 0, timestamp: Date.now() } satisfies StatePayload);
  }, [isOutput, playingId]);

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
    pressed.current = { id: sound.id, at: Date.now() };
    setSentId(sound.id);
    navigator.vibrate?.(10);
  };
  const stopEverywhere = () => {
    if (isOutput) player.stop();
    send("stop_all", { timestamp: Date.now() });
  };
  const toggleMute = () => {
    if (!muted) player.stop();
    setMuted(!muted);
  };

  const visible = useMemo(() => {
    const term = fold(query.trim());
    return term ? SOUNDS.filter((sound) => fold(sound.name).includes(term)) : SOUNDS;
  }, [query]);
  const sections = useMemo(
    () =>
      (Object.keys(SOUND_GROUPS) as SoundGroup[])
        .map((group) => ({ group, sounds: visible.filter((sound) => sound.group === group) }))
        .filter((section) => section.sounds.length > 0),
    [visible]
  );

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

  // A mouse fires on press, not on release: a click is a press plus 80–150 ms of finger on the
  // button. Touch keeps the click, so a swipe that scrolls the pads never fires one.
  const pointer = useRef("");
  const padHandlers = (sound: Sound) => ({
    onPointerDown: (event: PointerEvent) => {
      pointer.current = event.pointerType;
      if (event.pointerType === "mouse" && event.button === 0) fire(sound);
    },
    onClick: (event: MouseEvent) => {
      // `detail` 0 is a keyboard press (Enter or Space on the focused pad).
      if (event.detail !== 0 && pointer.current === "mouse") return;
      fire(sound);
    },
  });

  const others = Object.values(outputs).filter((output) => output.id !== tabId && now - output.at < OUTPUT_TTL_MS);
  const speakers = [
    ...(isOutput ? [{ id: tabId, label: "Esta pestaña", muted, locked: !audio.unlocked }] : []),
    ...others.toSorted((a, b) => a.label.localeCompare(b.label)),
  ];
  const nowPlaying = playing ? findSound(playing.id) : undefined;
  /** Keys 1–9 go to the first nine pads on screen, across sections. */
  const keyOf = new Map(visible.map((sound, index) => [sound.id, index]));

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
          <>
            {speakers.length === 0 ? (
              <Badge variant="warning">
                <VolumeX /> Ninguna salida: no se va a escuchar
              </Badge>
            ) : (
              speakers.map((speaker) => (
                <Badge
                  key={speaker.id}
                  title={
                    speaker.muted
                      ? "Silenciada: no va a sonar"
                      : speaker.locked
                        ? "Falta activar el audio: alguien tiene que tocar esa pantalla una vez"
                        : "Suena acá"
                  }
                  variant={speaker.muted || speaker.locked ? "warning" : "secondary"}
                >
                  {speaker.muted || speaker.locked ? <VolumeX /> : <StatusDot tone="ok" />}
                  {speaker.label}
                  {speaker.locked && !speaker.muted && " · sin activar"}
                </Badge>
              ))
            )}
            {!isOutput && roundTrip !== null && (
              <span
                className="inline-flex items-center gap-1 font-terminal text-meta text-muted-foreground tabular-nums"
                title="Desde que tocaste hasta que una salida avisó que suena, ida y vuelta"
              >
                <Activity aria-hidden className="size-3" />
                {roundTrip} ms
              </span>
            )}
            <ConnectionPill />
          </>
        }
        title="Sonidos"
      />

      {isOutput && (
        <OutputPanel
          audio={audio}
          muted={muted}
          volume={volume}
          onMute={toggleMute}
          onRetry={() => player.preload()}
          onVolume={changeVolume}
        />
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
              if (event.key !== "Escape") return;
              // The first Escape clears the search, the next one leaves it (and the keys work again).
              if (query) setQuery("");
              else event.currentTarget.blur();
            }}
          />
          <Kbd className="absolute top-1/2 right-2 -translate-y-1/2 pointer-coarse:hidden">/</Kbd>
        </div>
        <span className="font-terminal text-meta whitespace-nowrap text-muted-foreground tabular-nums">
          {visible.length === SOUNDS.length ? `${SOUNDS.length} sonidos` : `${visible.length} de ${SOUNDS.length}`}
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
        sections.map(({ group, sounds }) => (
          <section key={group} aria-labelledby={`sonidos-${group}`} className="mb-5">
            <h2
              className="mb-2 text-[11px] font-semibold tracking-[0.18em] text-muted-foreground uppercase"
              id={`sonidos-${group}`}
            >
              {SOUND_GROUPS[group]} · {sounds.length}
            </h2>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
              {sounds.map((sound) => {
                const key = keyOf.get(sound.id) ?? KEYED_PADS;
                const Icon = ICONS[sound.id] ?? Music;
                const on = playing?.id === sound.id ? playing : null;

                return (
                  <button
                    key={sound.id}
                    aria-label={isOutput ? `Reproducir ${sound.name}` : `Disparar ${sound.name} en las salidas`}
                    aria-pressed={Boolean(on)}
                    className={cn(
                      "group relative flex h-20 touch-manipulation flex-col items-center justify-center gap-1.5 overflow-hidden rounded-lg border border-border bg-card px-2 text-center shadow-edge transition-colors outline-none select-none hover:border-input hover:bg-raised focus-visible:ring-2 focus-visible:ring-ring/70 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 motion-reduce:active:scale-100",
                      on && "border-primary/60 bg-primary-surface hover:border-primary/60 hover:bg-primary-surface",
                      sentId === sound.id && !on && "border-input bg-raised"
                    )}
                    disabled={isOutput && muted}
                    title={on ? "Tocalo de nuevo para cortarlo" : undefined}
                    type="button"
                    {...padHandlers(sound)}
                  >
                    {key < KEYED_PADS && (
                      <Kbd className="absolute top-1.5 left-1.5 pointer-coarse:hidden">{key + 1}</Kbd>
                    )}
                    <span className="absolute top-1.5 right-2 font-terminal text-2xs text-faint tabular-nums">
                      {duration(sound.seconds)}
                    </span>
                    {on ? (
                      <Square aria-hidden className="size-5 fill-current text-primary" />
                    ) : (
                      <Icon
                        aria-hidden
                        className="size-5 text-muted-foreground transition-colors group-hover:text-foreground"
                      />
                    )}
                    <span className={cn("line-clamp-2 text-meta leading-tight font-medium", on && "text-primary")}>
                      {sound.name}
                    </span>
                    {on && (
                      <ProgressLine
                        className="absolute inset-x-0 bottom-0 h-1 bg-primary"
                        seconds={on.seconds}
                        startedAt={on.startedAt}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        ))
      )}

      {playing && <NowPlaying name={nowPlaying?.name ?? "Sonido"} playing={playing} onStop={stopEverywhere} />}
    </PageContainer>
  );
}

/** The output's own strip: whether it can sound, the bank loading, its volume and mute. */
function OutputPanel({
  audio,
  muted,
  volume,
  onMute,
  onRetry,
  onVolume,
}: {
  audio: PlayerSnapshot;
  muted: boolean;
  volume: number;
  onMute: () => void;
  onRetry: () => void;
  onVolume: (volume: number) => void;
}) {
  const loading = audio.ready + audio.failed < SOUNDS.length;

  return (
    <div className="mb-4 overflow-hidden rounded-lg border border-border bg-card shadow-edge">
      {!audio.unlocked && (
        <div
          className="flex flex-col gap-3 border-b border-warning/25 bg-warning-surface px-3.5 py-3 sm:flex-row sm:items-center"
          role="alert"
        >
          <VolumeX aria-hidden className="size-5 shrink-0 text-warning-foreground" />
          <div className="min-w-0 flex-1">
            <p className="text-ui font-medium text-foreground">Esta pestaña todavía no puede sonar</p>
            <p className="text-meta text-muted-foreground">
              El navegador pide que alguien la toque una vez. Hasta entonces, lo que manden los controladores no se
              escucha.
            </p>
          </div>
          <Button size="sm" onClick={() => player.unlock()}>
            <Volume2 /> Activar audio
          </Button>
        </div>
      )}
      <div className="flex flex-col items-stretch gap-3 px-3.5 py-2.5 sm:flex-row sm:items-center sm:gap-4">
        <div aria-live="polite" className="flex min-w-44 items-center gap-2 text-meta text-muted-foreground">
          {audio.failed > 0 && !loading ? (
            <>
              <StatusDot tone="warn" />
              <span>
                {audio.failed} {audio.failed === 1 ? "sonido no cargó" : "sonidos no cargaron"}
              </span>
              <Button className="h-6 px-2" size="sm" variant="ghost" onClick={onRetry}>
                Reintentar
              </Button>
            </>
          ) : loading ? (
            <>
              <span className="whitespace-nowrap tabular-nums">
                Cargando {audio.ready} de {SOUNDS.length}
              </span>
              <Meter className="w-20" label="Sonidos cargados" max={SOUNDS.length} value={audio.ready} />
            </>
          ) : (
            <>
              <StatusDot tone={audio.unlocked ? "ok" : "warn"} />
              <span>{audio.ready} sonidos listos</span>
            </>
          )}
        </div>
        <div className="flex flex-1 items-center gap-3">
          <Volume2 aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <Slider
            aria-label="Volumen de esta salida"
            className="flex-1"
            max={100}
            step={1}
            value={[volume]}
            onValueChange={([value]) => onVolume(value ?? volume)}
          />
          <span className="w-10 text-right font-terminal text-meta text-muted-foreground tabular-nums">{volume}%</span>
        </div>
        <Button aria-pressed={muted} size="sm" variant={muted ? "destructive" : "outline"} onClick={onMute}>
          {muted ? <VolumeX /> : <Volume2 />}
          {muted ? "Silenciada" : "Sonando"}
        </Button>
      </div>
    </div>
  );
}

/** What is playing, with the time left and a stop, pinned above the bottom of the screen. */
function NowPlaying({ name, playing, onStop }: { name: string; playing: Playing; onStop: () => void }) {
  const now = useNow(250);
  const left = playing.seconds - (now - playing.startedAt) / 1000;

  return (
    <div className="pointer-events-none sticky bottom-[max(1rem,calc(var(--admin-tabbar-h,0px)+0.75rem),env(safe-area-inset-bottom))] z-30 mt-6 flex justify-center">
      <div
        aria-label="Ahora suena"
        className="pointer-events-auto relative flex w-full max-w-[560px] items-center gap-3 overflow-hidden rounded-xl border border-input bg-popover py-2 pr-2 pl-4 shadow-overlay motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2"
        role="region"
      >
        <StatusDot tone="brand" />
        <span className="min-w-0 truncate text-ui font-medium text-foreground">{name}</span>
        {playing.seconds > 0 && (
          <span className="ml-auto font-terminal text-meta text-muted-foreground tabular-nums">
            {duration(Math.max(0, left))}
          </span>
        )}
        <Button className={cn(playing.seconds <= 0 && "ml-auto")} size="sm" variant="outline" onClick={onStop}>
          <Square className="fill-current" /> Detener <Kbd className="pointer-coarse:hidden">0</Kbd>
        </Button>
        {playing.seconds > 0 && (
          <ProgressLine
            className="absolute inset-x-0 bottom-0 h-0.5 bg-primary"
            seconds={playing.seconds}
            startedAt={playing.startedAt}
          />
        )}
      </div>
    </div>
  );
}

/** A bar filling over the sound's length, from wherever it already is. */
function ProgressLine({ startedAt, seconds, className }: { startedAt: number; seconds: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const animation = ref.current?.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], {
      duration: seconds * 1000,
      fill: "forwards",
    });
    if (animation) animation.currentTime = Math.min(Date.now() - startedAt, seconds * 1000);
    return () => animation?.cancel();
  }, [startedAt, seconds]);

  // Resting at zero through `transform`: Tailwind's scale-x-0 sets `scale`, which multiplies the animation by 0
  return (
    <span ref={ref} aria-hidden className={cn("block origin-left", className)} style={{ transform: "scaleX(0)" }} />
  );
}
