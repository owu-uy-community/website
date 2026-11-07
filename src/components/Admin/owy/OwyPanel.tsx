"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Hand, LayoutGrid, MessageSquareText, Search, Sparkles, UserRound, VolumeX, Wand } from "lucide-react";

import { MicroLabel } from "components/Admin/ui/page";
import { StatusDot } from "components/Admin/ui/status";
import { CommandButton, CommandNote, useCommand } from "components/Companion/control/commands";
import { LineForm } from "components/Companion/control/LineForm";
import { deviceIds, modeView } from "components/Companion/control/model";
import { useCompanionState } from "components/Companion/control/useCompanionState";
import { useFaceEvents } from "components/OwyStage/Face";
import { Button } from "components/shared/ui/button";
import { Input } from "components/shared/ui/input";
import { Switch } from "components/shared/ui/switch";
import { toast } from "components/shared/ui/toast-utils";
import { useRealtimeChannel } from "hooks/useRealtimeChannel";
import { orpc } from "lib/orpc";
import { OWY_DESK_CHANNEL, type FaceState, type SceneId } from "lib/owy-stage/scenes";
import { eventChannel } from "lib/realtime/channels";
import { RoomMark } from "lib/rooms/icons";
import { roomColorFor } from "lib/rooms/palette";

import { knobAction, phaseOfFace } from "./ops";

/**
 * The desk's «Owy» tab: the wall's two Owy scenes and the autopilot, Owy herself (the knob's tap,
 * hush and lines through the Mac, or by hand when the Mac is gone) and any talk put up big.
 */
export function OwyPanel({ eventId }: { eventId: string | null }) {
  return (
    <div className="h-full space-y-6 overflow-y-auto p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <OwyScenes eventId={eventId} />
      <OwyControl />
      {eventId ? (
        <Highlights eventId={eventId} />
      ) : (
        <p className="text-ui text-muted-foreground">Elegí el evento de la pared para destacar charlas.</p>
      )}
    </div>
  );
}

const OWY_SCENES: [SceneId, string, typeof UserRound][] = [
  ["owy-face", "Owy grande", UserRound],
  ["owy-board", "Owy + grilla", LayoutGrid],
];

/** Straight to air, without a wipe between the two (the wall morphs); the subtitles setting goes along. */
function OwyScenes({ eventId }: { eventId: string | null }) {
  const queryClient = useQueryClient();
  const stateOptions = orpc.owyStage.getState.queryOptions();
  const { data: live } = useQuery(stateOptions);
  const put = useMutation(
    orpc.owyStage.setScene.mutationOptions({
      onSuccess: (next) => queryClient.setQueryData(stateOptions.queryKey, next),
      onError: (failure) => toast.error("Owy", failure.message),
    })
  );
  const owyOnAir = live?.scene === "owy-face" || live?.scene === "owy-board";
  const captions = owyOnAir ? (live.params as { captions?: unknown }).captions : undefined;

  return (
    <section aria-label="Owy en la pantalla" className="space-y-2">
      <MicroLabel>En la pantalla</MicroLabel>
      <div className="grid grid-cols-2 gap-1.5">
        {OWY_SCENES.map(([scene, label, Icon]) => (
          <Button
            key={scene}
            className="h-11"
            disabled={put.isPending}
            variant={live?.scene === scene ? "default" : "outline"}
            onClick={() =>
              put.mutate({
                scene,
                ...(typeof captions === "boolean" ? { params: { captions } } : {}),
                // The wall's event stays; with none yet, the one this desk works on.
                ...(live?.eventId || !eventId ? {} : { eventId }),
              })
            }
          >
            <Icon aria-hidden /> {label}
          </Button>
        ))}
      </div>
      <Autopilot />
    </section>
  );
}

/** «Piloto automático»: every new talk takes the wall to «Owy y la grilla» and shows it big. */
export function Autopilot() {
  const queryClient = useQueryClient();
  const options = orpc.owyStage.getAutopilot.queryOptions();
  const { data } = useQuery(options);
  useRealtimeChannel(OWY_DESK_CHANNEL, (event, payload) => {
    if (event === "autopilot") queryClient.setQueryData(options.queryKey, payload as { on: boolean });
  });
  const set = useMutation(
    orpc.owyStage.setAutopilot.mutationOptions({
      onMutate: (next) => queryClient.setQueryData(options.queryKey, next),
      onSuccess: (next) => queryClient.setQueryData(options.queryKey, next),
      onError: (failure) => {
        toast.error("Piloto automático", failure.message);
        void queryClient.invalidateQueries({ queryKey: options.queryKey });
      },
    })
  );

  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 rounded-lg border p-3">
      <span className="min-w-0">
        <span className="block text-ui font-medium text-foreground">Piloto automático</span>
        <span className="block text-meta text-muted-foreground">
          Cada charla nueva lleva la pantalla a «Owy y la grilla» y la muestra en grande. Se queda ahí hasta que pongas
          otra escena.
        </span>
      </span>
      <Switch
        aria-label="Piloto automático"
        checked={data?.on ?? false}
        className="mt-0.5"
        disabled={!data}
        onCheckedChange={(on) => set.mutate({ on })}
      />
    </label>
  );
}

/**
 * Owy through the Mac (the knob's tap, «Callar», «Decir…»: they work with the knob off), and by
 * hand when the Mac doesn't answer: her face on the wall and her lines as subtitles, no voice.
 */
function OwyControl() {
  const { state, online, send } = useCompanionState();
  const [face, setFace] = useState<FaceState | null>(null);
  useFaceEvents({ face: (event) => setFace(event.state) });
  const [byHand, setByHand] = useState(false);
  const tap = useCommand(send);
  const id = state ? deviceIds(state)[0] : undefined;
  const device = state?.status?.devices.find((item) => item.id === id);
  // The face events arrive as they happen; the report every 15 s catches up when they don't.
  const phase = face ? phaseOfFace(face) : (device?.phase ?? "idle");
  const pitch = state && id ? modeView(state, id, online).mode === "pitch" : false;
  const action = id ? knobAction(id, phase, pitch) : null;
  const reachable = online && action !== null;

  return (
    <section aria-label="Owy" className="space-y-2">
      <MicroLabel>Owy</MicroLabel>
      <p className="flex items-center gap-1.5 text-meta text-muted-foreground">
        <StatusDot ring tone={!online ? "live" : device?.connected ? "ok" : "idle"} />
        {!state
          ? "Buscando el bridge…"
          : !online
            ? "La Mac no responde: Owy va a mano"
            : device?.connected
              ? "Knob y Mac en línea"
              : "Mac en línea, knob sin conexión: tocar acá igual hace que Owy escuche por la Mac"}
      </p>
      {reachable && id ? (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button className="h-11 min-w-32" disabled={tap.running} onClick={() => void tap.run(action.command)}>
              <Hand aria-hidden /> {action.label}
            </Button>
            <CommandButton command={{ type: "hush", deviceId: id }} send={send}>
              <VolumeX aria-hidden /> Callar
            </CommandButton>
            <LineForm id={id} kind="say" send={send} />
          </div>
          <p className="flex items-center gap-2 text-meta text-muted-foreground">
            {action.hint}
            <CommandNote done="listo" running="enviando…" state={tap} />
          </p>
        </>
      ) : null}
      {state && (!reachable || byHand) ? (
        <Puppet />
      ) : state ? (
        <Button size="sm" variant="ghost" onClick={() => setByHand(true)}>
          <Wand aria-hidden /> Manejar la cara a mano
        </Button>
      ) : null}
    </section>
  );
}

const PUPPET_FACES: [FaceState, string][] = [
  ["idle", "Quieta"],
  ["listening", "Escucha"],
  ["thinking", "Piensa"],
  ["speaking", "Habla"],
  ["happy", "Contenta"],
];

/** How long a typed line keeps her mouth moving: about as long as saying it. */
const speakMs = (line: string) => Math.min(15_000, Math.max(3_000, 1_500 + line.length * 70));

/**
 * Owy by hand: the face the wall shows (the same calls as the settings' face test, so the wall
 * follows it like any Owy that's doing something) and «Owy dice», a line typed as her subtitle
 * while her mouth moves, then quiet again.
 */
export function Puppet() {
  const [text, setText] = useState("");
  const back = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const face = useMutation(
    orpc.owyStage.setFace.mutationOptions({ onError: (failure) => toast.error("Owy a mano", failure.message) })
  );
  // Not cleared on unmount: a line said by hand still ends, wherever the operator went.
  const put = (state: FaceState, line?: string) => {
    clearTimeout(back.current);
    face.mutate({ state, source: "admin", ...(line ? { transcript: { who: "output" as const, text: line } } : {}) });
  };

  return (
    <div className="space-y-2 rounded-lg border border-dashed p-3">
      <p className="text-meta text-muted-foreground">
        A mano: la cara de Owy en la pantalla y lo que escribas como subtítulo, sin voz.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {PUPPET_FACES.map(([state, label]) => (
          <Button key={state} disabled={face.isPending} size="sm" variant="outline" onClick={() => put(state)}>
            {label}
          </Button>
        ))}
      </div>
      <form
        className="flex gap-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          const line = text.trim();
          if (!line) return;
          put("speaking", line);
          back.current = setTimeout(() => face.mutate({ state: "idle", source: "admin" }), speakMs(line));
          setText("");
        }}
      >
        <Input
          aria-label="Lo que dice Owy"
          className="min-w-0 flex-1"
          maxLength={600}
          placeholder="Owy dice…"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <Button disabled={!text.trim()} type="submit">
          <MessageSquareText aria-hidden /> Decir
        </Button>
      </form>
    </div>
  );
}

/** The event's talks, newest first: «Destacar» puts one up big on «Owy y la grilla» (it comes up if needed). */
function Highlights({ eventId }: { eventId: string }) {
  const queryClient = useQueryClient();
  const input = { openSpaceId: eventId };
  const notes = useQuery(orpc.tracks.list.queryOptions({ input, staleTime: 15_000 }));
  useRealtimeChannel(
    eventChannel(eventId, "sync"),
    () => void queryClient.invalidateQueries({ queryKey: orpc.tracks.list.key({ input }) })
  );
  const [find, setFind] = useState("");
  const [shown, setShown] = useState<string | null>(null);
  const clear = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const shine = useMutation(
    orpc.owyStage.spotlight.mutationOptions({
      onSuccess: (spot) => {
        clearTimeout(clear.current);
        setShown(spot.track.id);
        clear.current = setTimeout(() => setShown(null), 10_000);
      },
      onError: (failure) => toast.error("Destacar", failure.message),
    })
  );
  const wanted = find.trim().toLowerCase();
  const list = (notes.data ?? []).filter(
    (note) => !wanted || `${note.title} ${note.speaker ?? ""} ${note.room}`.toLowerCase().includes(wanted)
  );

  return (
    <section aria-label="Destacar una charla" className="space-y-2">
      <MicroLabel>Destacar en la grilla</MicroLabel>
      {(notes.data?.length ?? 0) > 6 ? (
        <div className="relative">
          <Search aria-hidden className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Buscar una charla"
            className="pl-8"
            placeholder="Buscar charla, persona o sala"
            value={find}
            onChange={(event) => setFind(event.target.value)}
          />
        </div>
      ) : null}
      {notes.data && list.length === 0 ? (
        <p className="text-ui text-muted-foreground">
          {notes.data.length ? "Ninguna charla coincide." : "Todavía no hay charlas en la grilla."}
        </p>
      ) : null}
      <ul className="divide-y divide-border/60">
        {list.map((note) => {
          const lit = shown === note.id;

          return (
            <li key={note.id} className="flex items-center gap-3 py-2">
              <RoomMark className="size-2.5" color={roomColorFor(note.roomId, note.roomColor)} icon={note.roomIcon} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-ui font-medium text-foreground">{note.title}</span>
                <span className="block truncate text-meta text-muted-foreground">
                  {[note.room, note.timeSlot.split(" - ")[0], note.speaker].filter(Boolean).join(" · ")}
                </span>
              </span>
              <Button
                className="shrink-0"
                disabled={shine.isPending}
                size="sm"
                variant={lit ? "secondary" : "outline"}
                onClick={() => shine.mutate({ trackId: note.id })}
              >
                {lit ? <Check aria-hidden /> : <Sparkles aria-hidden />} {lit ? "En pantalla" : "Destacar"}
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
