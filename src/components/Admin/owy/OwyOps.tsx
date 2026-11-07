"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AudioLines,
  Bot,
  Cast,
  ChevronRight,
  Clapperboard,
  Hand,
  Megaphone,
  Mic,
  SlidersHorizontal,
  Speaker,
  Store,
  Timer,
  TvMinimal,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";

import { cn } from "app/lib/utils";
import { Notice } from "components/Admin/panel";
import { useSelectedEvent } from "components/Admin/shell/use-selected-event";
import { MicroLabel, PageContainer, PageHeader, Panel, PanelHead } from "components/Admin/ui/page";
import { StatusDot } from "components/Admin/ui/status";
import { useNow } from "components/Admin/ui/time";
import { CommandButton, CommandNote, useCommand, type SendCommand } from "components/Companion/control/commands";
import { BrowserAudioRow } from "components/Companion/control/DeviceCard";
import { KnobTwin } from "components/Companion/control/KnobTwin";
import { LineForm } from "components/Companion/control/LineForm";
import { ModeSwitch } from "components/Companion/control/ModeSwitch";
import {
  ago,
  deviceIds,
  macAudioChoices,
  modeView,
  phaseText,
  probeText,
  settingView,
  tierText,
  turnsView,
} from "components/Companion/control/model";
import { SettingField, type OnSet } from "components/Companion/control/SettingField";
import { Health } from "components/Companion/control/ui";
import { useBrowserAudio, type BrowserAudio } from "components/Companion/control/useBrowserAudio";
import { useCompanionState } from "components/Companion/control/useCompanionState";
import { useFaceEvents } from "components/OwyStage/Face";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Skeleton } from "components/shared/ui/skeleton";
import { Textarea } from "components/shared/ui/textarea";
import { toast } from "components/shared/ui/toast-utils";
import { useRealtimeChannel } from "hooks/useRealtimeChannel";
import { orpc } from "lib/orpc";
import type { CompanionState } from "lib/orpc/companion/schemas";
import { CountdownStateSchema } from "lib/orpc/countdown/schemas";
import {
  OWY_STAGE_CHANNEL,
  SCENES,
  StageStateSchema,
  presetLabel,
  type FaceState,
  type SceneId,
} from "lib/owy-stage/scenes";
import { eventChannel } from "lib/realtime/channels";

import { BRIDGE_TARGET } from "../../../../owy/companion/bridge/src/web/registry";

import { COUNTDOWN_PRESETS, clockText, countdownLeft, knobAction, latestNote, phaseOfFace, tail } from "./ops";
import { Autopilot, Puppet } from "./OwyPanel";

/** The scenes worth one tap from the table: Owy's face, Owy beside the board, the board, the agenda. */
const QUICK_SCENES: SceneId[] = ["owy-face", "owy-board", "grid", "agenda"];

/**
 * /admin/owy, the one page for the day: Owy (its knob, live — tap its screen —, its mode and its
 * words), the Mac it speaks through, the room (mercado, countdown, cast, an aviso) and the wall
 * (presets, quick scenes). Everything here is a procedure that already exists; the page just puts
 * the buttons within thumb's reach.
 */
export function OwyOps() {
  const panel = useCompanionState();
  const audio = useBrowserAudio();
  const live = useLiveFace();
  const { selected: event } = useSelectedEvent();
  const { state, query, online, onSet, error, setError } = panel;
  const ids = state ? deviceIds(state) : [];

  return (
    <PageContainer className="space-y-4" size="default">
      <PageHeader
        actions={
          <Button asChild size="sm" variant="ghost">
            <Link href="/admin/companion">
              <SlidersHorizontal aria-hidden /> Ajustes
            </Link>
          </Button>
        }
        description="El knob en vivo, la Mac por la que habla y la sala, desde el celular."
        meta={state ? <BridgeLine online={online} state={state} /> : null}
        title="Owy"
      />

      <div className="sticky top-[calc(46px+env(safe-area-inset-top)+0.5rem)] z-30 empty:hidden md:top-2">
        <Notice show={!!error} tone="danger">
          <span className="flex items-start justify-between gap-3">
            <span>No se guardó: {error}</span>
            <Button
              aria-label="Cerrar el aviso"
              className="-my-1"
              size="icon-xs"
              variant="ghost"
              onClick={() => setError(null)}
            >
              <X />
            </Button>
          </span>
        </Notice>
      </div>
      <Notice show={query.isError} tone="danger">
        No se pudo leer el estado de Owy: {query.error?.message}
      </Notice>

      {!state ? (
        <div className="space-y-4">
          <Skeleton className="h-80 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <>
          {ids.length === 0 ? (
            <p className="text-ui text-muted-foreground">
              Todavía no hay ningún Owy: aparece cuando el bridge reporta (corre en la Mac con COMPANION_DEVICES).
            </p>
          ) : null}
          {ids.map((id) => (
            <KnobCard
              key={id}
              audio={audio}
              id={id}
              live={live}
              online={online}
              send={panel.send}
              state={state}
              onSet={onSet}
            />
          ))}
          <MacAudio online={online} send={panel.send} state={state} onSet={onSet} />
          {online ? null : (
            <Panel>
              <PanelHead icon={Hand} title="Owy a mano" />
              <div className="p-3.5">
                <Puppet />
              </div>
            </Panel>
          )}
        </>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <SalaCard
          eventId={event?.id ?? null}
          eventName={event?.name ?? null}
          online={online}
          state={state ?? null}
          onSet={onSet}
        />
        <PantallaCard />
      </div>
    </PageContainer>
  );
}

type LiveFace = { state: FaceState; input: string; output: string };

/** Owy's face and words as the wall gets them: the live turn, whoever is running it. */
function useLiveFace(): LiveFace | null {
  const [live, setLive] = useState<LiveFace | null>(null);
  useFaceEvents({
    face: (event) =>
      setLive((previous) => {
        // A new listening window is a new conversation turn: the last one's words go.
        const fresh = event.state === "listening" && previous?.state !== "listening";
        const words = fresh || !previous ? { input: "", output: "" } : previous;
        return {
          state: event.state,
          input: event.transcript?.who === "input" ? event.transcript.text : words.input,
          output: event.transcript?.who === "output" ? event.transcript.text : words.output,
        };
      }),
  });
  return live;
}

/** The bridge next to the title: there or not, since when, its code, the Mac, the voice tier. */
function BridgeLine({ state, online }: { state: CompanionState; online: boolean }) {
  const now = useNow(1000);
  const status = state.status;
  const tier = tierText(status?.devices[0]?.voice.tier);
  // On a phone only when it was last seen: the code and the voice tier wrap badly and live in Ajustes too.
  const more = [status?.version, tier ? `voz ${tier}` : null].filter(Boolean);

  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-meta text-foreground">
        <StatusDot ring tone={online ? "ok" : "live"} />
        {online ? "Bridge en línea" : "Bridge sin conexión"}
      </span>
      <span className="font-terminal text-meta text-muted-foreground tabular-nums">
        {state.seenAt ? `visto ${ago(state.seenAt, now)}` : "todavía no reportó"}
        {more.length > 0 ? <span className="hidden sm:inline"> · {more.join(" · ")}</span> : null}
      </span>
    </span>
  );
}

/**
 * One Owy: its knob as it is right now (tap the screen: that's the knob's tap), what a tap does,
 * its mode, the other things Owy can be asked, what it heard and said, this browser as its audio.
 */
function KnobCard({
  id,
  state,
  online,
  onSet,
  send,
  audio,
  live,
}: {
  id: string;
  state: CompanionState;
  online: boolean;
  onSet: OnSet;
  send: SendCommand;
  audio: BrowserAudio;
  live: LiveFace | null;
}) {
  const device = state.status?.devices.find((item) => item.id === id);
  const connected = online && !!device?.connected;
  const mode = modeView(state, id, online).mode;
  // The face events arrive as they happen; the report every 15 s catches up when they don't.
  const phase = live ? phaseOfFace(live.state) : (device?.phase ?? "idle");
  const [pitching, setPitching] = useState(false);
  const pitch = mode === "pitch" || (pitching && phase !== "idle");
  const action = knobAction(id, phase, pitch);
  const tap = useCommand(send);
  const start = useCommand(send);
  const turn = turnsView(device?.turns ?? [])[0];
  const values = device?.values ?? {};

  return (
    <Panel>
      <PanelHead
        actions={
          <span className="flex items-center gap-1.5 text-meta text-muted-foreground">
            <StatusDot ring tone={connected ? "ok" : "idle"} />
            {connected ? "knob en línea" : "knob sin conexión"}
          </span>
        }
        icon={Bot}
        meta={device?.host}
        title={id}
      />
      <div className="grid gap-x-8 gap-y-5 p-4 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] md:p-5">
        <div className="flex flex-col items-center gap-3">
          <KnobTwin
            className="max-w-[18rem]"
            disabled={tap.running || !online}
            id={id}
            label={`${action.label}: ${action.hint}`}
            online={online}
            privacy={values.privacy === true}
            reduced={values.reduced_motion === true}
            onTap={() => {
              if (action.command.type === "tap" && phase === "idle") setPitching(false);
              void tap.run(action.command);
            }}
          />
          <div className="flex min-h-11 flex-col items-center gap-0.5 text-center">
            <p className="flex items-center gap-1.5 text-ui text-foreground">
              <Hand aria-hidden className="size-4 text-muted-foreground" />
              <span>
                <span className="font-medium">{online ? tapText(action.label) : "Sin bridge"}</span>
                <span className="text-muted-foreground"> · {online ? action.hint : "el knob lo está buscando"}</span>
              </span>
            </p>
            <CommandNote done="listo" running="enviando…" state={tap} />
          </div>
        </div>

        <div className="min-w-0 space-y-5">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant={phase === "idle" ? "outline" : "info"}>{phaseText(phase)}</Badge>
            {device?.firmware ? <Badge variant="outline">firmware {device.firmware}</Badge> : null}
            {device?.peer ? <Badge variant="info">navegador enchufado</Badge> : null}
            {online && !connected ? (
              <span className="text-meta text-muted-foreground">
                El knob real no está conectado: tocar acá igual hace que Owy escuche por la Mac.
              </span>
            ) : null}
          </div>

          <ModeSwitch id={id} online={online} size="touch" state={state} onSet={onSet} />

          <section aria-label="Pedirle algo a Owy" className="space-y-2">
            <MicroLabel>Pedirle algo</MicroLabel>
            <div className="flex flex-wrap items-center gap-2">
              {phase === "idle" && mode !== "pitch" ? (
                <Button
                  disabled={start.running || !online}
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setPitching(true);
                    void start.run({ type: "pitch", deviceId: id, action: "start" });
                  }}
                >
                  <Mic aria-hidden /> Grabar un pitch
                </Button>
              ) : null}
              <CommandNote done="grabando" state={start} />
              <CommandButton command={{ type: "hush", deviceId: id }} send={send}>
                <VolumeX aria-hidden /> Callar
              </CommandButton>
              <LineForm id={id} kind="say" send={send} />
              <LineForm id={id} kind="ask" send={send} />
            </div>
          </section>

          <LiveWords live={live} />
          {turn ? (
            <p className="font-terminal text-meta text-muted-foreground">
              último turno · {turn.path} · {turn.firstAudio ? `primer audio ${turn.firstAudio}` : "sin audio"}
            </p>
          ) : null}

          <BrowserAudioRow audio={audio} id={id} />
        </div>
      </div>
    </Panel>
  );
}

/** What tapping the knob's screen does, as the caption under it says it. */
const tapText = (label: string) => (label === "Tocar" ? "Tocá la pantalla" : `Tocá: ${label.toLowerCase()}`);

/** What Owy heard and said this turn: the newest words of each. */
function LiveWords({ live }: { live: LiveFace | null }) {
  if (!live || (!live.input && !live.output)) return null;

  return (
    <section aria-label="Lo último" className="space-y-2 rounded-md border border-border bg-white/[0.02] p-3 text-ui">
      {live.input ? (
        <p className="text-muted-foreground">
          <MicroLabel className="mr-2">oyó</MicroLabel>
          {tail(live.input, 280)}
        </p>
      ) : null}
      {live.output ? (
        <p className="text-foreground">
          <MicroLabel className="mr-2">dijo</MicroLabel>
          {tail(live.output, 280)}
        </p>
      ) : null}
    </section>
  );
}

/**
 * The Mac's ears and mouth: which input Owy hears and which output he speaks from, picked from what
 * the bridge found on the Mac (the choice applies at once), with a 4 s level test and a tone.
 */
function MacAudio({
  state,
  online,
  onSet,
  send,
}: {
  state: CompanionState;
  online: boolean;
  onSet: OnSet;
  send: SendCommand;
}) {
  const status = state.status;
  if (!status?.hostMic && !status?.hostSpeaker) return null;
  const choices = macAudioChoices(status);

  return (
    <Panel>
      <PanelHead icon={AudioLines} meta={status.machine} title="Audio de la Mac" />
      <div className="space-y-2 p-3.5">
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          <Health detail={status.hostMic?.detail} health={status.hostMic?.health} icon={Mic} label="Entrada" />
          <Health
            detail={status.hostSpeaker?.detail}
            health={status.hostSpeaker?.health}
            icon={Speaker}
            label="Salida"
          />
        </div>
        <div className="grid gap-x-6 md:grid-cols-2">
          {(["host_mic", "host_speaker"] as const).map((key) => (
            <SettingField
              key={key}
              choices={choices[key]}
              view={settingView(state, BRIDGE_TARGET, key, online)}
              onChange={(setting, value) => onSet([{ target: BRIDGE_TARGET, key: setting, value }])}
            />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CommandButton
            command={{ type: "probe-mic", ms: 4000 }}
            done={(result) => probeText(result.data)}
            running="grabando 4 s… hablá"
            send={send}
          >
            <Mic aria-hidden /> Grabar 4 s
          </CommandButton>
          <CommandButton command={{ type: "tone", target: "mac" }} send={send}>
            <Volume2 aria-hidden /> Tono en la Mac
          </CommandButton>
        </div>
      </div>
    </Panel>
  );
}

/** The room: mercado abierto, the countdown, what the screens cast, an aviso through Owy. */
function SalaCard({
  eventId,
  eventName,
  state,
  online,
  onSet,
}: {
  eventId: string | null;
  eventName: string | null;
  state: CompanionState | null;
  online: boolean;
  onSet: OnSet;
}) {
  return (
    <Panel>
      <PanelHead icon={Store} meta={eventName ?? undefined} title="Sala" />
      <div className="space-y-4 p-3.5">
        {state ? (
          <SettingField
            view={settingView(state, "bridge", "marketplace_open", online)}
            onChange={(key, value) => onSet([{ target: "bridge", key, value }])}
          />
        ) : null}
        {eventId ? (
          <>
            <Countdown eventId={eventId} />
            <CastRow eventId={eventId} />
            <Aviso eventId={eventId} />
          </>
        ) : (
          <p className="text-ui text-muted-foreground">
            Elegí un evento en la{" "}
            <Link className="underline" href="/admin/openspace">
              Agenda
            </Link>{" "}
            para manejar su countdown, sus pantallas y sus avisos.
          </p>
        )}
      </div>
    </Panel>
  );
}

/** The event's countdown, as the screens tick it: presets, pause, resume, reset. */
function Countdown({ eventId }: { eventId: string }) {
  const queryClient = useQueryClient();
  const options = orpc.countdown.getState.queryOptions({ input: { eventId } });
  const query = useQuery(options);
  const now = useNow(1000);
  useRealtimeChannel(eventChannel(eventId, "countdown"), (event, payload) => {
    if (event !== "countdown_state_change") return;
    const parsed = CountdownStateSchema.safeParse(payload);
    if (parsed.success) queryClient.setQueryData(options.queryKey, parsed.data);
  });
  const update = useMutation(
    orpc.countdown.updateState.mutationOptions({
      onSuccess: (next) => queryClient.setQueryData(options.queryKey, next),
      onError: (failure) => toast.error("Countdown", failure.message),
    })
  );
  const run = async (minutes: number) => {
    await update.mutateAsync({ eventId, action: "setDuration", durationSeconds: minutes * 60 });
    await update.mutateAsync({ eventId, action: "start" });
  };
  const countdown = query.data;
  const left = countdown ? countdownLeft(countdown, now) : null;

  return (
    <section aria-label="Countdown" className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <MicroLabel>Countdown</MicroLabel>
        {left !== null ? (
          <span
            className={cn(
              "font-terminal text-lg tabular-nums",
              countdown?.isRunning ? "text-foreground" : "text-muted-foreground"
            )}
          >
            <Timer aria-hidden className="mr-1 inline size-4 align-[-2px]" />
            {clockText(left)}
            {countdown?.isRunning ? "" : " · pausado"}
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {COUNTDOWN_PRESETS.map((minutes) => (
          <Button
            key={minutes}
            disabled={update.isPending}
            size="sm"
            variant="outline"
            onClick={() => void run(minutes)}
          >
            {minutes} min
          </Button>
        ))}
        {countdown?.isRunning ? (
          <Button
            disabled={update.isPending}
            size="sm"
            variant="outline"
            onClick={() => update.mutate({ eventId, action: "pause" })}
          >
            Pausar
          </Button>
        ) : (
          <Button
            disabled={update.isPending || !countdown || countdown.remainingSeconds <= 0}
            size="sm"
            variant="outline"
            onClick={() => update.mutate({ eventId, action: "start" })}
          >
            Seguir
          </Button>
        )}
        <Button
          disabled={update.isPending}
          size="sm"
          variant="ghost"
          onClick={() => update.mutate({ eventId, action: "reset" })}
        >
          Reiniciar
        </Button>
      </div>
    </section>
  );
}

/** What the event's screens show: the card on them now, and the newest card on the board to put there. */
function CastRow({ eventId }: { eventId: string }) {
  const queryClient = useQueryClient();
  const castOptions = orpc.cast.getState.queryOptions({ input: { eventId } });
  const cast = useQuery(castOptions);
  const notes = useQuery(orpc.tracks.list.queryOptions({ input: { openSpaceId: eventId }, staleTime: 15_000 }));
  useRealtimeChannel(
    eventChannel(eventId, "cast"),
    () => void queryClient.invalidateQueries({ queryKey: castOptions.queryKey })
  );
  useRealtimeChannel(
    eventChannel(eventId, "sync"),
    () => void queryClient.invalidateQueries({ queryKey: orpc.tracks.list.key({ input: { openSpaceId: eventId } }) })
  );
  const set = useMutation(
    orpc.cast.setHighlightedNote.mutationOptions({
      onSuccess: (next) => queryClient.setQueryData(castOptions.queryKey, next),
      onError: (failure) => toast.error("Pantallas", failure.message),
    })
  );
  const latest = latestNote(notes.data ?? []);
  const showing = cast.data?.note ?? null;

  return (
    <section aria-label="Pantallas de la sala" className="space-y-2">
      <MicroLabel>En las pantallas</MicroLabel>
      <p className="text-ui text-foreground">
        <Cast aria-hidden className="mr-1.5 inline size-4 align-[-2px] text-muted-foreground" />
        {showing ? `«${showing.title}» · ${showing.room} ${showing.timeSlot}` : "Nada casteado"}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {latest && latest.id !== showing?.id ? (
          <Button
            disabled={set.isPending}
            size="sm"
            variant="outline"
            onClick={() => set.mutate({ eventId, trackId: latest.id })}
          >
            Mostrar la última: «{latest.title}»
          </Button>
        ) : null}
        {showing ? (
          <Button
            disabled={set.isPending}
            size="sm"
            variant="ghost"
            onClick={() => set.mutate({ eventId, trackId: null })}
          >
            Sacar
          </Button>
        ) : null}
      </div>
    </section>
  );
}

/** A line through Owy to the attendees (Telegram, the live board's feed), now. */
function Aviso({ eventId }: { eventId: string }) {
  const [text, setText] = useState("");
  const send = useMutation(
    orpc.comms.send.mutationOptions({
      onSuccess: (message) => {
        setText("");
        if (message.status === "failed") toast.error("Aviso", message.error ?? "No salió.");
        else toast.success("Aviso", "Owy lo publicó.");
      },
      onError: (failure) => toast.error("Aviso", failure.message),
    })
  );

  return (
    <form
      aria-label="Aviso"
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        const body = text.trim();
        if (body) send.mutate({ eventId, channel: "telegram", body });
      }}
    >
      <MicroLabel>Aviso por Owy</MicroLabel>
      <Textarea
        aria-label="El aviso"
        className="min-h-16"
        maxLength={4000}
        placeholder="Arranca el mercado de ideas en la sala grande…"
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={send.isPending || !text.trim()} size="sm" type="submit">
          <Megaphone aria-hidden /> Publicar en Telegram
        </Button>
        <Link className="text-meta text-muted-foreground underline" href="/admin/comunicacion">
          Más canales y programados
        </Link>
      </div>
    </form>
  );
}

/** The wall: what is on air, the desk's presets (keys 1–9) straight to air, and the three quick scenes. */
function PantallaCard() {
  const queryClient = useQueryClient();
  const stateOptions = orpc.owyStage.getState.queryOptions();
  const stage = useQuery(stateOptions);
  const desk = useQuery(orpc.owyStage.getDesk.queryOptions({ staleTime: 30_000 }));
  useRealtimeChannel(OWY_STAGE_CHANNEL, (event, payload) => {
    if (event !== "scene") return;
    const parsed = StageStateSchema.safeParse(payload);
    if (parsed.success) queryClient.setQueryData(stateOptions.queryKey, parsed.data);
  });
  const fire = useMutation(
    orpc.owyStage.firePreset.mutationOptions({ onError: (failure) => toast.error("Pantalla", failure.message) })
  );
  const put = useMutation(
    orpc.owyStage.setScene.mutationOptions({
      onSuccess: (next) => queryClient.setQueryData(stateOptions.queryKey, next),
      onError: (failure) => toast.error("Pantalla", failure.message),
    })
  );
  const onAir = stage.data?.scene;
  const presets = (desk.data?.presets ?? []).slice(0, 9);

  return (
    <Panel>
      <PanelHead icon={TvMinimal} meta={onAir ? `al aire: ${SCENES[onAir].title}` : undefined} title="Pantalla" />
      <div className="space-y-4 p-3.5">
        {presets.length > 0 ? (
          <section aria-label="Presets" className="space-y-2">
            <MicroLabel>Presets · al aire</MicroLabel>
            <div className="grid grid-cols-3 gap-1.5">
              {presets.map((preset, index) => (
                <Button
                  key={preset.id}
                  className="h-auto min-h-11 flex-col gap-0 py-1.5 whitespace-normal"
                  disabled={fire.isPending}
                  variant={onAir === preset.scene ? "default" : "outline"}
                  onClick={() => fire.mutate({ preset: preset.id, to: "air" })}
                >
                  <span className="font-terminal text-meta tabular-nums">{index + 1}</span>
                  <span className="text-meta leading-tight">{presetLabel(preset)}</span>
                </Button>
              ))}
            </div>
          </section>
        ) : null}
        <section aria-label="Escenas" className="space-y-2">
          <MicroLabel>Escenas</MicroLabel>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_SCENES.map((scene) => (
              <Button
                key={scene}
                disabled={put.isPending}
                size="sm"
                variant={onAir === scene ? "default" : "outline"}
                onClick={() => put.mutate({ scene })}
              >
                <Clapperboard aria-hidden /> {SCENES[scene].title}
              </Button>
            ))}
          </div>
          <Autopilot />
        </section>
        <nav aria-label="Más de Owy" className="flex flex-col divide-y divide-border/60 text-ui">
          {[
            ["/admin/owy/scenes", "Escenas: la mesa, con preview y TAKE"],
            ["/admin/owy/charla", "Charla Owy: la consola de la charla"],
            ["/admin/owy/intro", "Intro open space: las slides de la bienvenida, con clicker"],
            ["/admin/companion", "Ajustes de Owy: audio, modelos, cerebro"],
          ].map(([href, label]) => (
            <Link key={href} className="flex items-center justify-between gap-2 py-2 text-foreground" href={href}>
              {label}
              <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
            </Link>
          ))}
        </nav>
      </div>
    </Panel>
  );
}
