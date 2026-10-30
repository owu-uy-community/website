"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink, Sparkles } from "lucide-react";

import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Field, FieldDescription, FieldLabel } from "components/shared/ui/field";
import { Input } from "components/shared/ui/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "components/shared/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "components/shared/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "components/shared/ui/sheet";
import { Switch } from "components/shared/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "components/shared/ui/tabs";
import { toast } from "components/shared/ui/toast-utils";
import { orpc } from "lib/orpc";
import { EXPRESSIONS, FACE_STATES, type Expression, type FaceState, type StageState } from "lib/owy-stage/scenes";

/** Per-device output settings: they shape the URLs handed to OBS and the monitors' aspect ratio. */
export type OutputSettings = { transparent: boolean; canvas: "" | "ucu" | "fit" };

const FACE_LABELS: Record<FaceState, string> = {
  idle: "Idle",
  listening: "Escuchando",
  thinking: "Pensando",
  speaking: "Hablando",
  happy: "Feliz",
  error: "Error",
  offline: "Offline",
};

const EXPRESSION_LABELS: Record<Expression, string> = {
  neutral: "Neutral",
  happy: "Contento",
  excited: "Entusiasmado",
  curious: "Curioso",
  thinking: "Pensativo",
  empathetic: "Empático",
  playful: "Juguetón",
  surprised: "Sorprendido",
};

/** What the simulator says a visitor pitched, in the bridge's running totals. */
const SAMPLE_PITCH =
  "Hola, soy Ana. Quiero proponer una charla sobre Effect en producción: cómo lo adoptamos en el equipo, qué nos costó y qué aprendimos después de un año. Es para gente que ya programa en TypeScript y quiere ver código real, no slides.";

/** A path or a header inside a hint. */
const CODE = "rounded-sm bg-raised px-1 font-terminal";

export function copyText(text: string, what = "URL copiada") {
  navigator.clipboard
    .writeText(text)
    .then(() => toast.success(what, text))
    .catch(() => toast.error("No se pudo copiar", text));
}

/** Back from the Spotify OAuth dance: /api/spotify/callback sends ?spotify=ok|error. */
export function useSpotifyReturn() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get("spotify");
    if (!result) return;
    if (result === "ok") toast.success("Spotify conectado", "La escena Sonando ya sigue lo que se reproduce.");
    else if (result === "unconfigured")
      toast.error("Falta configurar Spotify", "SPOTIFY_CLIENT_ID y SPOTIFY_CLIENT_SECRET en el env.");
    else toast.error("No se pudo conectar Spotify");
    window.history.replaceState(null, "", window.location.pathname);
    queryClient.invalidateQueries({ queryKey: orpc.owyStage.spotifyStatus.queryKey() });
  }, [queryClient]);
}

function Spotify({ origin }: { origin: string }) {
  const queryClient = useQueryClient();
  const spotify = useQuery(orpc.owyStage.spotifyStatus.queryOptions());
  const disconnect = useMutation(
    orpc.owyStage.disconnectSpotify.mutationOptions({
      onSuccess: () => {
        toast.success("Spotify desconectado");
        queryClient.invalidateQueries({ queryKey: orpc.owyStage.spotifyStatus.queryKey() });
      },
      onError: (error) => toast.error("No se pudo desconectar", error.message),
    })
  );

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Conectá la cuenta que reproduce la música y la escena <strong>Sonando</strong> muestra el tema en vivo, con tapa
        y progreso. Sin micrófono, sin cuota.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        {spotify.data?.account ? (
          <>
            <Badge variant="secondary">Conectado · {spotify.data.account}</Badge>
            <Button size="sm" variant="outline" onClick={() => disconnect.mutate()}>
              Desconectar
            </Button>
          </>
        ) : spotify.data?.configured ? (
          <Button asChild size="sm">
            <a href="/api/spotify/connect">Conectar Spotify</a>
          </Button>
        ) : null}
        {spotify.data && !spotify.data.configured && (
          <span className="text-xs text-muted-foreground">
            Falta SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET en el env (redirect URI: {origin}/api/spotify/callback).
          </span>
        )}
      </div>
    </div>
  );
}

/** What the companion bridge sends when someone talks to Owy — to test the wall without the device. */
function OwySimulator({ eventId }: { eventId: string | null }) {
  const [transcript, setTranscript] = useState("");
  const [who, setWho] = useState<"input" | "output">("output");
  const setFace = useMutation(
    orpc.owyStage.setFace.mutationOptions({
      onError: (error) => toast.error("No se pudo actualizar la cara", error.message),
    })
  );
  const createPlaced = useMutation(
    orpc.tracks.createPlaced.mutationOptions({
      onSuccess: (placed) => toast.success("Charla creada", `${placed.placement.room} · ${placed.placement.timeSlot}`),
      onError: (error) => toast.error("No se pudo ubicar la charla", error.message),
    })
  );
  // The wall's event, so the sample card names a real room and block (the mini board lights it up).
  const wallRooms = useQuery(
    orpc.rooms.getByOpenSpace.queryOptions({ input: { openSpaceId: eventId ?? "" }, enabled: Boolean(eventId) })
  );
  const wallSlots = useQuery(
    orpc.schedules.getByOpenSpace.queryOptions({ input: { openSpaceId: eventId ?? "" }, enabled: Boolean(eventId) })
  );
  const sampleSlot = wallSlots.data?.find((slot) => slot.isActive);
  const sampleCard = {
    title: "Effect en producción: lo que aprendimos",
    speaker: "Ana",
    room: wallRooms.data?.find((room) => room.isActive)?.name ?? "Cueva",
    timeSlot: sampleSlot ? `${sampleSlot.startTime} - ${sampleSlot.endTime}` : "15:00 - 15:45",
    reasoning: "El bloque está vacío.",
  };
  // A scripted pitch for the wall, timed like the bridge: listening, the transcript growing, thinking, the card.
  const simulation = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => simulation.current.forEach(clearTimeout), []);
  const simulatePitch = () => {
    simulation.current.forEach(clearTimeout);
    const source = "admin";
    const said = (text: string) => ({
      state: "listening" as const,
      transcript: { who: "input" as const, text },
      source,
    });
    const steps: [number, Parameters<typeof setFace.mutate>[0]][] = [
      [0, { state: "listening", source }],
      [600, said(SAMPLE_PITCH.slice(0, 60))],
      [1500, said(SAMPLE_PITCH.slice(0, 140))],
      [2400, said(SAMPLE_PITCH)],
      [3200, { state: "thinking", source }],
      [5200, { state: "happy", card: sampleCard, expression: { name: "excited", strength: 90 }, source }],
      [
        6000,
        {
          state: "speaking",
          transcript: {
            who: "output",
            text: `Tu charla «${sampleCard.title}» queda en ${sampleCard.room} a las ${sampleCard.timeSlot.split(" - ")[0]}.`,
          },
          source,
        },
      ],
      [18_000, { state: "idle", source }],
    ];
    simulation.current = steps.map(([delay, input]) => setTimeout(() => setFace.mutate(input), delay));
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Lo que el bridge del companion manda solo cuando alguien habla con Owy — para probar sin el dispositivo.
      </p>
      <div className="flex flex-wrap gap-2">
        {FACE_STATES.map((state) => (
          <Button key={state} size="sm" variant="outline" onClick={() => setFace.mutate({ state, source: "admin" })}>
            {FACE_LABELS[state]}
          </Button>
        ))}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!transcript.trim()) return;
          setFace.mutate({
            state: who === "input" ? "listening" : "speaking",
            transcript: { who, text: transcript.trim() },
            source: "admin",
          });
          setTranscript("");
        }}
      >
        <Select value={who} onValueChange={(value) => setWho(value as "input" | "output")}>
          <SelectTrigger className="w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="input">Visitante</SelectItem>
            <SelectItem value="output">Owy</SelectItem>
          </SelectContent>
        </Select>
        <Input placeholder="Subtítulo…" value={transcript} onChange={(e) => setTranscript(e.target.value)} />
        <Button size="icon" type="submit" variant="secondary">
          <Sparkles className="h-4 w-4" />
        </Button>
      </form>
      <div className="flex flex-wrap gap-2">
        {EXPRESSIONS.map((name) => (
          <Button
            key={name}
            size="sm"
            variant="ghost"
            onClick={() => setFace.mutate({ state: "speaking", expression: { name, strength: 100 }, source: "admin" })}
          >
            {EXPRESSION_LABELS[name]}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setFace.mutate({ state: "happy", card: sampleCard, source: "admin" })}
        >
          Card de ejemplo
        </Button>
        <Button size="sm" variant="secondary" onClick={simulatePitch}>
          Simular pitch
        </Button>
        <Button
          disabled={!eventId || createPlaced.isPending}
          size="sm"
          variant="outline"
          onClick={() =>
            eventId &&
            createPlaced.mutate({
              openSpaceId: eventId,
              title: sampleCard.title,
              speaker: sampleCard.speaker,
              description: "Una charla de prueba creada desde el simulador de la pared.",
              needsTV: false,
              needsWhiteboard: false,
              source: "admin",
            })
          }
        >
          Ubicar y crear (de verdad)
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        «Ubicar y crear» pone una charla real en la grilla del evento de la pared, como hace el companion con un pitch;
        la card y la mini grilla aparecen en la escena Owy.
      </p>
    </div>
  );
}

/**
 * Everything set once rather than during the show: the OBS URL and how it is
 * shaped, the wall's event, Spotify and the Owy simulator.
 */
export function StageSettingsSheet({
  open,
  onOpenChange,
  live,
  events,
  onEvent,
  output,
  onOutput,
  stageUrl,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  live: StageState;
  events: { id: string; name: string; communityName: string }[];
  onEvent: (eventId: string) => void;
  output: OutputSettings;
  onOutput: (output: OutputSettings) => void;
  stageUrl: (path: string) => string;
}) {
  const url = stageUrl("/owy/stage");
  const deckUrl = typeof window === "undefined" ? "" : `${window.location.origin}/api/owy-stage/preset/`;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md" side="right">
        <SheetHeader>
          <SheetTitle>Salida y ajustes</SheetTitle>
          <SheetDescription>Lo que se configura una vez, no durante el show.</SheetDescription>
        </SheetHeader>
        <Tabs className="mt-4" defaultValue="output">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="output">Salida</TabsTrigger>
            <TabsTrigger value="event">Evento</TabsTrigger>
            <TabsTrigger value="spotify">Spotify</TabsTrigger>
            <TabsTrigger value="owy">Owy</TabsTrigger>
          </TabsList>

          <TabsContent className="space-y-5 pt-2" value="output">
            <Field>
              <FieldLabel htmlFor="stage-url">URL para OBS (browser source)</FieldLabel>
              <InputGroup className="pointer-coarse:h-11">
                <InputGroupInput
                  readOnly
                  className="font-terminal text-xs pointer-coarse:text-base"
                  id="stage-url"
                  value={url}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton aria-label="Copiar la URL" size="icon-xs" onClick={() => copyText(url)}>
                    <Copy />
                  </InputGroupButton>
                  <InputGroupButton aria-label="Abrir la pared" asChild size="icon-xs">
                    <a href={url} rel="noopener" target="_blank">
                      <ExternalLink />
                    </a>
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
              <FieldDescription className="text-xs">
                Sigue lo que pongas al aire. Cada escena tiene además su URL fija (⋯ en la biblioteca).
              </FieldDescription>
            </Field>
            <Field orientation="horizontal">
              <Switch
                checked={output.transparent}
                id="stage-transparent"
                onCheckedChange={(transparent) => onOutput({ ...output, transparent })}
              />
              <FieldLabel htmlFor="stage-transparent">Fondo transparente (overlay sobre cámara)</FieldLabel>
            </Field>
            <Field>
              <FieldLabel>Pantalla</FieldLabel>
              <Select
                value={output.canvas || "default"}
                onValueChange={(value) =>
                  onOutput({ ...output, canvas: value === "default" ? "" : (value as OutputSettings["canvas"]) })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">16:9 · 1920×1080</SelectItem>
                  <SelectItem value="ucu">UCU · 3584×960 (56:15)</SelectItem>
                  <SelectItem value="fit">Ajustar a la pantalla</SelectItem>
                </SelectContent>
              </Select>
              <FieldDescription className="text-xs">
                {output.canvas === "ucu"
                  ? "OBS / navegador: 3584×960. Los monitores de acá toman la misma forma."
                  : output.canvas === "fit"
                    ? "Toma la forma de la pantalla donde se abra (pantalla completa)."
                    : 'OBS: 1920×1080 · 60 fps · "Shutdown source when not visible" OFF · "Refresh when scene becomes active" OFF'}
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="stage-deck-url">Stream Deck: presets</FieldLabel>
              <InputGroup className="pointer-coarse:h-11">
                <InputGroupInput
                  readOnly
                  className="font-terminal text-xs pointer-coarse:text-base"
                  id="stage-deck-url"
                  value={deckUrl}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    aria-label="Copiar la URL para Stream Deck"
                    size="icon-xs"
                    onClick={() => copyText(deckUrl)}
                  >
                    <Copy />
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
              <FieldDescription className="text-xs">
                Un POST a <code className={CODE}>…/preset/3</code> pone el preset 3 en preview y{" "}
                <code className={CODE}>…/preset/3/air</code>, al aire. Va con el header{" "}
                <code className={CODE}>x-api-key</code> (una llave con el preset «Stream Deck» de Acceso → Llaves API,
                la misma que en Pantalla OBS). El número cambia si reordenás; la URL de «⋯ → Copiar URL Stream Deck» usa
                el id del preset, que no cambia.
              </FieldDescription>
            </Field>
          </TabsContent>

          <TabsContent className="space-y-3 pt-2" value="event">
            <Field>
              <FieldLabel>Evento de la pared</FieldLabel>
              <Select value={live.eventId ?? ""} onValueChange={onEvent}>
                <SelectTrigger>
                  <SelectValue placeholder="Elegí un evento" />
                </SelectTrigger>
                <SelectContent>
                  {events.map((event) => (
                    <SelectItem key={event.id} value={event.id}>
                      {event.name} · {event.communityName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription className="text-xs">
                Lo leen las escenas que muestran datos del evento: countdown, agenda, cast, la grilla del open space.
              </FieldDescription>
            </Field>
          </TabsContent>

          <TabsContent className="pt-2" value="spotify">
            <Spotify origin={typeof window === "undefined" ? "" : window.location.origin} />
          </TabsContent>

          <TabsContent className="pt-2" value="owy">
            <OwySimulator eventId={live.eventId} />
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
