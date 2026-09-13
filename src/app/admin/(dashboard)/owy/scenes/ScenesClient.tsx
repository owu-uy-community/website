"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink, PartyPopper, Radio, Smile, Sparkles, Subtitles, Zap } from "lucide-react";

import { useSelectedEvent } from "components/Admin/shell/use-selected-event";
import { ScaledFrame } from "components/Admin/stage/ScaledFrame";
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
  SCENE_IDS,
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
  const [caption, setCaption] = useState("");
  const [transcript, setTranscript] = useState("");
  const [who, setWho] = useState<"input" | "output">("output");

  useEffect(() => setOrigin(window.location.origin), []);

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

  const take = (scene: SceneId, params?: Record<string, unknown>) =>
    setScene.mutate({
      scene,
      params: params ?? (live.scene === scene ? live.params : {}),
      eventId: live.eventId ?? selected?.id ?? null,
    });

  const liveParams = parseSceneParams(live.scene, live.params) as Record<string, string | boolean | number>;
  const paramKeys = Object.keys(liveParams);
  const stageUrl = (path: string) => `${origin}${path}${transparent ? "?bg=transparent" : ""}`;

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-foreground text-2xl font-bold tracking-tight">Escenas Owy</h1>
          <p className="text-muted-foreground mt-1 text-sm">
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
            <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-3 text-xs">
              <label className="flex items-center gap-2">
                <Switch checked={transparent} onCheckedChange={setTransparent} />
                Fondo transparente en las URLs (overlay sobre cámara)
              </label>
              <span>
                OBS: 1920×1080 · 60 fps · &quot;Shutdown source when not visible&quot; OFF · &quot;Refresh when scene
                becomes active&quot; OFF
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
            <CardContent>
              {paramKeys.length === 0 ? (
                <p className="text-muted-foreground text-sm">Esta escena no tiene parámetros.</p>
              ) : (
                <form
                  key={live.scene}
                  className="space-y-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = new FormData(event.currentTarget);
                    const params = Object.fromEntries(
                      paramKeys.map((key) =>
                        typeof liveParams[key] === "boolean"
                          ? [key, form.get(key) === "on"]
                          : [key, form.get(key) ?? ""]
                      )
                    );
                    take(live.scene, params);
                  }}
                >
                  {paramKeys.map((key) => (
                    <div key={key} className="flex items-center gap-3">
                      <Label className="w-24 capitalize" htmlFor={`param-${key}`}>
                        {key}
                      </Label>
                      {typeof liveParams[key] === "boolean" ? (
                        <Switch defaultChecked={liveParams[key]} id={`param-${key}`} name={key} />
                      ) : (
                        <Input
                          defaultValue={String(liveParams[key])}
                          id={`param-${key}`}
                          name={key}
                          type={typeof liveParams[key] === "number" ? "number" : "text"}
                        />
                      )}
                    </div>
                  ))}
                  <Button disabled={setScene.isPending} size="sm" type="submit">
                    Aplicar en vivo
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Efectos</CardTitle>
              <CardDescription>Se superponen a la escena actual y desaparecen solos.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Simulador de Owy</CardTitle>
              <CardDescription>
                Lo que el bridge del companion manda solo cuando alguien habla con Owy — para probar sin el dispositivo.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
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
            </CardContent>
          </Card>
        </div>
      </div>

      <div>
        <h2 className="font-display text-lg font-semibold">Escenas</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
          {SCENE_IDS.map((id) => {
            const onAir = live.scene === id;

            return (
              <Card key={id} className={`flex flex-col ${onAir ? "ring-2 ring-[#F5BB03]" : ""}`}>
                <CardContent className="flex flex-1 flex-col gap-3 p-3">
                  <div className="relative">
                    <ScaledFrame src={`/owy/stage/${id}?preview=1`} title={SCENES[id].title} />
                    {onAir && (
                      <Badge className="absolute top-2 left-2 bg-red-600 text-white hover:bg-red-600">AL AIRE</Badge>
                    )}
                  </div>
                  <div>
                    <p className="font-medium">{SCENES[id].title}</p>
                    <p className="text-muted-foreground line-clamp-2 text-xs" title={SCENES[id].description}>
                      {SCENES[id].description}
                    </p>
                  </div>
                  <div className="mt-auto flex items-center gap-2">
                    <Button
                      className="flex-1"
                      disabled={setScene.isPending}
                      size="sm"
                      variant={onAir ? "secondary" : "default"}
                      onClick={() => take(id)}
                    >
                      {onAir ? "Al aire" : "Poner en pantalla"}
                    </Button>
                    <Button
                      size="icon"
                      title="Copiar URL de esta escena (fuente fija para OBS)"
                      variant="ghost"
                      onClick={() => copy(stageUrl(`/owy/stage/${id}`))}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
