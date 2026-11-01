"use client";

import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Laptop, Mic, Speaker } from "lucide-react";

import { Notice } from "components/Admin/panel";
import { Badge, type BadgeProps } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "components/shared/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "components/shared/ui/select";
import { orpc } from "lib/orpc/client";
import type { AudioRoutingSnapshot } from "lib/orpc/companion/schemas";

import { Row, Segmented } from "./control/ui";

const MIC = [
  ["device", "Owy"],
  ["host", "Mac"],
  ["laptop", "navegador"],
] as const;
const OUTPUT = [
  ["device", "Owy"],
  ["laptop", "navegador"],
] as const;
const MODE = [
  ["off", "no"],
  ["on", "sí"],
] as const;
const VOICE = [
  ["silent", "callado"],
  ["confirm", "confirma"],
  ["react", "confirma y comenta"],
] as const;
const CHANNEL = [
  ["L", "L"],
  ["R", "R"],
  ["mix", "mezcla"],
] as const;
const HEALTH: Record<string, [NonNullable<BadgeProps["variant"]>, string]> = {
  open: ["success", "abierto"],
  starting: ["secondary", "abriendo…"],
  off: ["outline", "apagado"],
  "no-signal": ["warning", "sin señal"],
  gone: ["destructive", "no está"],
  unavailable: ["outline", "no disponible"],
};
/** Radix Select reserves "": the built-in mic is this sentinel. */
const BUILT_IN = "__built-in__";

/**
 * Each physical Owy's audio and modo pitch, and the Mac's own mic: where the
 * microphone lives (the device, an input of the Mac running the bridge — its
 * built-in mic, a DJI receiver — or a browser attached through "Audio de
 * laptop"), where the voice plays, whether a tap records a pitch, and what Owy
 * says back. Proxies the bridge's loopback settings API, so it only works when
 * this site runs on the venue Mac (or COMPANION_BRIDGE_SETTINGS_URL reaches it);
 * otherwise the bridge's own page (127.0.0.1:3313) has the same controls.
 */
export default function AudioRoutingCard({ onDevices }: { onDevices?: (ids: string[]) => void }) {
  const queryClient = useQueryClient();
  const query = useQuery({ ...orpc.companion.getAudioRouting.queryOptions(), refetchInterval: 5000 });
  const store = (snapshot: AudioRoutingSnapshot) =>
    queryClient.setQueryData(orpc.companion.getAudioRouting.queryKey(), snapshot);
  const routing = useMutation(orpc.companion.setAudioRouting.mutationOptions({ onSuccess: store }));
  const pitch = useMutation(orpc.companion.setPitch.mutationOptions({ onSuccess: store }));
  const hostMic = useMutation(orpc.companion.setHostMic.mutationOptions({ onSuccess: store }));
  const probe = useMutation(orpc.companion.probeHostMic.mutationOptions());
  const pending = routing.isPending || pitch.isPending || hostMic.isPending;

  const snapshot: AudioRoutingSnapshot | undefined = query.data;
  const reachable = !!snapshot?.reachable;
  const key = snapshot?.devices.map((d) => d.id).join(",") ?? "";
  useEffect(() => {
    if (reachable) onDevices?.(key ? key.split(",") : []);
  }, [reachable, key, onDevices]);

  const mac = snapshot?.hostMic;
  const [healthVariant, healthLabel] = (mac && HEALTH[mac.health]) ?? ["outline", mac?.health ?? ""];
  const inputs = mac ? [...new Set([...(mac.name ? [mac.name] : []), ...mac.available])] : [];
  const level = (value: number) => `${Math.round(value * 100)}%`;
  const result = probe.data;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Speaker aria-hidden className="h-4 w-4 text-muted-foreground" />
              Owy físico: audio y modo pitch
            </CardTitle>
            <CardDescription>
              Micrófono, salida y modo pitch de cada Owy, y el micrófono de la Mac donde corre el bridge.
            </CardDescription>
          </div>
          <Badge className="shrink-0" variant={reachable ? "success" : "outline"}>
            {reachable ? "Bridge en línea" : "Bridge sin conexión"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-ui">
        <Notice show={!reachable} tone="info">
          No se llega a la API de ajustes del bridge ({snapshot?.error ?? "cargando"}). Funciona con el sitio corriendo
          en la Mac del bridge (o con COMPANION_BRIDGE_SETTINGS_URL); si no, la página del bridge en esa Mac
          (127.0.0.1:3313) tiene estos mismos ajustes.
        </Notice>

        {mac && (
          <div className="space-y-2 rounded-md border p-3">
            <div className="flex flex-wrap items-center gap-2 text-meta">
              <Mic aria-hidden className="h-3.5 w-3.5 text-muted-foreground" />
              <strong className="text-foreground">Micrófono de la Mac</strong>
              <Badge variant={healthVariant}>{healthLabel}</Badge>
            </div>
            {mac.detail && <p className="text-meta text-muted-foreground">{mac.detail}</p>}
            {mac.health !== "unavailable" && (
              <>
                <Row label="Entrada">
                  <Select
                    disabled={pending}
                    value={mac.name ?? BUILT_IN}
                    onValueChange={(name) => hostMic.mutate({ name: name === BUILT_IN ? null : name })}
                  >
                    <SelectTrigger aria-label="Entrada de la Mac" className="w-64">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={BUILT_IN}>integrado</SelectItem>
                      {inputs.map((input) => (
                        <SelectItem key={input} value={input}>
                          {input}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Row>
                <Row label="Canal">
                  <Segmented
                    disabled={pending}
                    label="Canal"
                    options={CHANNEL}
                    value={mac.channel}
                    onChange={(channel) => hostMic.mutate({ channel })}
                  />
                </Row>
                <Row label="Prueba">
                  <Button
                    disabled={probe.isPending}
                    size="sm"
                    variant="secondary"
                    onClick={() => probe.mutate({ ms: 4000 })}
                  >
                    {probe.isPending ? "Grabando 4 s… hablá" : "Grabar 4 s"}
                  </Button>
                  {result && !probe.isPending && (
                    <span className="text-meta text-muted-foreground">
                      {!result.reachable
                        ? result.error
                        : `pico ${level(result.peak)} · promedio ${level(result.rms)}${
                            result.peak < 0.02 ? " — casi nada: ¿es esta entrada? ¿el transmisor está prendido?" : ""
                          }`}
                    </span>
                  )}
                </Row>
              </>
            )}
          </div>
        )}

        {snapshot?.devices.map((device) => (
          <div key={device.id} className="space-y-2 rounded-md border p-3">
            <p className="flex flex-wrap items-center gap-1 text-meta text-muted-foreground">
              <strong className="text-foreground">{device.id}</strong> ·{" "}
              {device.connected ? "en línea" : "sin conexión"} ·{" "}
              {device.peer ? (
                <>
                  <Laptop className="h-3.5 w-3.5" /> navegador conectado
                </>
              ) : (
                "sin navegador"
              )}{" "}
              ·{" "}
              {device.source === "device"
                ? "guardado en el dispositivo"
                : device.source === "override"
                  ? "elegido acá"
                  : "valor por defecto"}
            </p>
            <Row label="Micrófono">
              <Segmented
                disabled={pending}
                label="Micrófono"
                options={MIC}
                value={device.mic}
                onChange={(mic) => routing.mutate({ deviceId: device.id, mic })}
              />
            </Row>
            <Row label="Salida">
              <Segmented
                disabled={pending}
                label="Salida"
                options={OUTPUT}
                value={device.output}
                onChange={(output) => routing.mutate({ deviceId: device.id, output })}
              />
            </Row>
            <Row label="Modo pitch">
              <Segmented
                disabled={pending}
                label="Modo pitch"
                options={MODE}
                value={device.pitch.mode ? "on" : "off"}
                onChange={(mode) => pitch.mutate({ deviceId: device.id, mode: mode === "on" })}
              />
            </Row>
            <Row label="Owy responde">
              <Segmented
                disabled={pending}
                label="Owy responde"
                options={VOICE}
                value={device.pitch.voice}
                onChange={(voice) => pitch.mutate({ deviceId: device.id, voice })}
              />
            </Row>
          </div>
        ))}
        {reachable && (
          <p className="text-meta text-muted-foreground">
            “Mac” graba la entrada elegida arriba (un receptor DJI aparece como «Wireless Microphone RX»); “navegador”,
            uno conectado como audio de ese Owy en <em>Hablá con Owy</em>. Si el elegido no responde, ese turno usa el
            del dispositivo. Modo pitch: cada toque graba una propuesta; «Owy responde» decide si Owy confirma (y
            comenta) en voz alta o sólo muestra la card.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
