"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  Copy,
  ExternalLink,
  Music,
  PartyPopper,
  Radio,
  Smile,
  Sparkles,
  Subtitles,
  Zap,
} from "lucide-react";

import { cn } from "app/lib/utils";
import { useSelectedEvent } from "components/Admin/shell/use-selected-event";
import { RundownCard, useRundown } from "components/Admin/stage/Rundown";
import { ScaledFrame } from "components/Admin/stage/ScaledFrame";
import { SceneParams } from "components/Admin/stage/SceneParams";

import { SceneLibrary } from "./SceneLibrary";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "components/shared/ui/card";
import { Input } from "components/shared/ui/input";
import { Label } from "components/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "components/shared/ui/select";
import { Switch } from "components/shared/ui/switch";
import { toast } from "components/shared/ui/toast-utils";
import { useRealtimeChannel } from "hooks/useRealtimeChannel";
import { orpc } from "lib/orpc";
import {
  DEFAULT_STAGE_STATE,
  FACE_STATES,
  OWY_STAGE_CHANNEL,
  SCENES,
  parseSceneParams,
  type FaceState,
  type SceneId,
  type StageState,
} from "lib/owy-stage/scenes";

const FACE_LABELS: Record<FaceState, string> = {
  idle: "Idle",
  listening: "Escuchando",
  thinking: "Pensando",
  speaking: "Hablando",
  happy: "Feliz",
  error: "Error",
  offline: "Offline",
};

/**
 * A card whose body folds away: the panels you only touch while setting up
 * (el simulador, Spotify) stay out of the way of the ones used on air. Closed
 * by default and remembered, so the page opens the way the operator left it.
 */
function FoldCard({
  id,
  icon,
  title,
  description,
  children,
}: {
  id: string;
  icon?: ReactNode;
  title: string;
  description: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(window.localStorage.getItem(`owy-stage-fold-${id}`) === "1");
  }, [id]);

  const toggle = () =>
    setOpen((current) => {
      window.localStorage.setItem(`owy-stage-fold-${id}`, current ? "0" : "1");

      return !current;
    });

  return (
    <Card>
      <CardHeader className={open ? "" : "py-4"}>
        {/* heading > button: the accordion pattern, so it is reachable by keyboard and screen readers */}
        <CardTitle>
          <button
            aria-expanded={open}
            className="flex w-full items-center gap-2 text-left"
            onClick={toggle}
            type="button"
          >
            {icon}
            <span className="flex-1">{title}</span>
            <ChevronDown className={cn("h-5 w-5 shrink-0 transition-transform", open && "rotate-180")} />
          </button>
        </CardTitle>
        {open && <CardDescription className="mt-1.5">{description}</CardDescription>}
      </CardHeader>
      {open && <CardContent className="space-y-3">{children}</CardContent>}
    </Card>
  );
}

function copy(text: string) {
  navigator.clipboard
    .writeText(text)
    .then(() => toast.success("URL copiada", text))
    .catch(() => toast.error("No se pudo copiar", text));
}

export default function ScenesClient() {
  const queryClient = useQueryClient();
  const { events, selected } = useSelectedEvent();
  const stateKey = orpc.owyStage.getState.queryKey();
  const { data } = useQuery(orpc.owyStage.getState.queryOptions());
  const live: StageState = data ?? DEFAULT_STAGE_STATE;
  const [origin, setOrigin] = useState("");
  const [transparent, setTransparent] = useState(false);
  // The wall is not always 16:9 — UCU's screen is a 3584×960 strip.
  const [canvas, setCanvas] = useState("");
  const [caption, setCaption] = useState("");
  const [transcript, setTranscript] = useState("");
  const [who, setWho] = useState<"input" | "output">("output");

  useEffect(() => setOrigin(window.location.origin), []);

  const spotify = useQuery(orpc.owyStage.spotifyStatus.queryOptions());
  const disconnectSpotify = useMutation(
    orpc.owyStage.disconnectSpotify.mutationOptions({
      onSuccess: () => {
        toast.success("Spotify desconectado");
        queryClient.invalidateQueries({ queryKey: orpc.owyStage.spotifyStatus.queryKey() });
      },
      onError: (error) => toast.error("No se pudo desconectar", error.message),
    })
  );
  // Back from the OAuth dance: /api/spotify/callback sends ?spotify=ok|error.
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

  // Server publishes carry no sender id, so our own takes echo back too: the cache is the truth.
  const { isConnected } = useRealtimeChannel(OWY_STAGE_CHANNEL, (event, payload) => {
    if (event === "scene") queryClient.setQueryData(stateKey, payload as StageState);
  });

  const setScene = useMutation(
    orpc.owyStage.setScene.mutationOptions({
      onSuccess: (state) => queryClient.setQueryData(stateKey, state),
      onError: (error) => toast.error("No se pudo cambiar la escena", error.message),
    })
  );
  const fireEffect = useMutation(
    orpc.owyStage.fireEffect.mutationOptions({
      onError: (error) => toast.error("No se pudo disparar el efecto", error.message),
    })
  );
  const setFace = useMutation(
    orpc.owyStage.setFace.mutationOptions({
      onError: (error) => toast.error("No se pudo actualizar la cara", error.message),
    })
  );

  /** `restart` is for putting a scene on air from scratch; a param edit keeps the round. */
  const take = (scene: SceneId, params?: Record<string, unknown>, restart?: boolean) =>
    setScene.mutate({
      scene,
      // An empty object means "the scene's own defaults"; the guion stores params only when pinned.
      params: params && Object.keys(params).length ? params : live.scene === scene ? live.params : {},
      eventId: live.eventId ?? selected?.id ?? null,
      restart,
    });
  const rundown = useRundown(take, live.scene);

  // The guion's pin copies whatever is on air into a step.
  const liveParams = parseSceneParams(live.scene, live.params) as Record<string, unknown>;
  const stageUrl = (path: string) => {
    const query = new URLSearchParams();
    if (transparent) query.set("bg", "transparent");
    if (canvas) query.set("canvas", canvas);
    const search = query.toString();

    return `${origin}${path}${search ? `?${search}` : ""}`;
  };

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Escenas Owy</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Lo que muestra la pantalla grande. Cada escena es una página que OBS embebe como browser source (1920×1080).
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={isConnected ? "default" : "destructive"}>
            <Radio className="mr-1 h-3 w-3" />
            {isConnected ? "Realtime conectado" : "Sin realtime"}
          </Badge>
          <Select
            value={live.eventId ?? ""}
            onValueChange={(eventId) => setScene.mutate({ scene: live.scene, params: live.params, eventId })}
          >
            <SelectTrigger className="w-[320px]">
              <SelectValue placeholder="Evento para countdown / cast" />
            </SelectTrigger>
            <SelectContent>
              {events.map((event) => (
                <SelectItem key={event.id} value={event.id}>
                  {event.name} · {event.communityName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
                Al aire · {SCENES[live.scene].title}
              </CardTitle>
              <CardDescription>La URL que va en OBS: sigue lo que elijas acá.</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => copy(stageUrl("/owy/stage"))}>
                <Copy className="mr-1 h-4 w-4" /> Copiar URL
              </Button>
              <Button asChild size="sm" variant="ghost">
                <a href="/owy/stage" rel="noopener" target="_blank">
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <ScaledFrame src="/owy/stage" title="Al aire" />
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
              <label className="flex items-center gap-2">
                <Switch checked={transparent} onCheckedChange={setTransparent} />
                Fondo transparente en las URLs (overlay sobre cámara)
              </label>
              <label className="flex items-center gap-2">
                Pantalla
                <Select
                  value={canvas || "default"}
                  onValueChange={(value) => setCanvas(value === "default" ? "" : value)}
                >
                  <SelectTrigger className="h-8 w-[230px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">16:9 · 1920×1080</SelectItem>
                    <SelectItem value="ucu">UCU · 3584×960 (56:15)</SelectItem>
                    <SelectItem value="fit">Ajustar a la pantalla</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <span>
                {canvas === "ucu"
                  ? "OBS / navegador: 3584×960 · las escenas de Ágiles se reacomodan solas a la tira"
                  : canvas === "fit"
                    ? "Toma la forma de la pantalla donde se abra (pantalla completa)"
                    : 'OBS: 1920×1080 · 60 fps · "Shutdown source when not visible" OFF · "Refresh when scene becomes active" OFF'}
              </span>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Parámetros · {SCENES[live.scene].title}</CardTitle>
              <CardDescription>{SCENES[live.scene].description}</CardDescription>
            </CardHeader>
            <CardContent className="pb-3">
              <SceneParams
                apply={(params) => take(live.scene, params)}
                params={live.params}
                pending={setScene.isPending}
                scene={live.scene}
              />
            </CardContent>
          </Card>

          <FoldCard
            description="Se superponen a la escena actual y desaparecen solos."
            icon={<Sparkles className="h-5 w-5" />}
            id="efectos"
            title="Efectos"
          >
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => fireEffect.mutate({ effect: "confetti" })}>
                <PartyPopper className="mr-1 h-4 w-4" /> Confetti
              </Button>
              <Button size="sm" variant="outline" onClick={() => fireEffect.mutate({ effect: "flash" })}>
                <Zap className="mr-1 h-4 w-4" /> Flash
              </Button>
              <Button size="sm" variant="outline" onClick={() => fireEffect.mutate({ effect: "owy-happy" })}>
                <Smile className="mr-1 h-4 w-4" /> Owy feliz
              </Button>
              {["👏", "🎉", "🧉", "❤️", "🔥"].map((emoji) => (
                <Button
                  key={emoji}
                  size="sm"
                  title={`Lluvia de ${emoji}`}
                  variant="outline"
                  onClick={() => fireEffect.mutate({ effect: "emoji", payload: { text: emoji } })}
                >
                  {emoji}
                </Button>
              ))}
            </div>
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (!caption.trim()) return;
                fireEffect.mutate({ effect: "caption", payload: { text: caption.trim() } });
                setCaption("");
              }}
            >
              <Input
                placeholder="Texto para un lower third…"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
              />
              <Button size="sm" type="submit" variant="secondary">
                <Subtitles className="mr-1 h-4 w-4" /> Mostrar
              </Button>
            </form>
          </FoldCard>

          <FoldCard
            description="Lo que el bridge del companion manda solo cuando alguien habla con Owy — para probar sin el dispositivo."
            id="owy-sim"
            title="Simulador de Owy"
          >
            <div className="flex flex-wrap gap-2">
              {FACE_STATES.map((state) => (
                <Button
                  key={state}
                  size="sm"
                  variant="outline"
                  onClick={() => setFace.mutate({ state, source: "admin" })}
                >
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
                <SelectTrigger className="w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="input">Visitante</SelectItem>
                  <SelectItem value="output">Owy</SelectItem>
                </SelectContent>
              </Select>
              <Input placeholder="Subtítulo…" value={transcript} onChange={(e) => setTranscript(e.target.value)} />
              <Button size="sm" type="submit" variant="secondary">
                <Sparkles className="mr-1 h-4 w-4" /> Enviar
              </Button>
            </form>
          </FoldCard>

          <FoldCard
            description={
              <>
                Conectá la cuenta que reproduce la música y la escena <strong>Sonando</strong> muestra el tema en vivo,
                con tapa y progreso. Sin micrófono, sin cuota.
              </>
            }
            icon={<Music className="h-5 w-5" />}
            id="spotify"
            title="Spotify"
          >
            <div className="flex flex-wrap items-center gap-3">
              {spotify.data?.account ? (
                <>
                  <Badge variant="secondary">Conectado · {spotify.data.account}</Badge>
                  <Button size="sm" variant="outline" onClick={() => disconnectSpotify.mutate()}>
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
                  Falta SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET en el env (redirect URI: {origin}
                  /api/spotify/callback).
                </span>
              )}
            </div>
          </FoldCard>
        </div>
      </div>

      <RundownCard liveParams={liveParams} liveScene={live.scene} rundown={rundown} />

      <SceneLibrary
        copyUrl={(id) => copy(stageUrl(`/owy/stage/${id}`))}
        liveScene={live.scene}
        pending={setScene.isPending}
        queue={rundown.add}
        take={(id) => take(id, undefined, true)}
      />
    </div>
  );
}
