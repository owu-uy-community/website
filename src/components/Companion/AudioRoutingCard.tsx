"use client";

import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Laptop, Speaker } from "lucide-react";

import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "components/shared/ui/card";
import { orpc } from "lib/orpc/client";
import type { AudioRoute, AudioRoutingSnapshot } from "lib/orpc/companion/schemas";

/**
 * Where each physical companion's microphone and audio output live: the device
 * itself, or the laptop running the bridge (a browser attached through "Audio de
 * laptop" in Hablá con Owy). Proxies the bridge's loopback settings API, so it
 * only works when this site runs on the venue laptop.
 */
export default function AudioRoutingCard({ onDevices }: { onDevices?: (ids: string[]) => void }) {
  const queryClient = useQueryClient();
  const query = useQuery({ ...orpc.companion.getAudioRouting.queryOptions(), refetchInterval: 5000 });
  const mutation = useMutation(
    orpc.companion.setAudioRouting.mutationOptions({
      onSuccess: (snapshot) => queryClient.setQueryData(orpc.companion.getAudioRouting.queryKey(), snapshot),
    })
  );
  const snapshot: AudioRoutingSnapshot | undefined = query.data;
  const reachable = !!snapshot?.reachable;
  const key = snapshot?.devices.map((d) => d.id).join(",") ?? "";
  useEffect(() => {
    if (reachable) onDevices?.(key ? key.split(",") : []);
  }, [reachable, key, onDevices]);

  const seg = (deviceId: string, which: "mic" | "output", current: AudioRoute) =>
    (["device", "laptop"] as const).map((route) => (
      <Button
        key={route}
        disabled={mutation.isPending}
        size="sm"
        variant={current === route ? "default" : "outline"}
        onClick={() => mutation.mutate({ deviceId, [which]: route })}
      >
        {route === "device" ? "dispositivo" : "laptop"}
      </Button>
    ));

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Speaker className="h-4 w-4 text-yellow-400" />
              Audio de los Owy físicos
            </CardTitle>
            <CardDescription>
              Micrófono y salida de cada dispositivo: el propio gadget o la laptop del bridge.
            </CardDescription>
          </div>
          <Badge className="shrink-0" variant={reachable ? "default" : "outline"}>
            {reachable ? "Bridge" : "Bridge offline"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!reachable && (
          <p className="text-xs text-muted-foreground">
            No se llega a la API de ajustes del bridge ({snapshot?.error ?? "cargando"}). Corre en la laptop del evento:
            abrí el sitio ahí o configurá COMPANION_BRIDGE_SETTINGS_URL.
          </p>
        )}
        {snapshot?.devices.map((device) => (
          <div key={device.id} className="space-y-2 rounded-md border p-3">
            <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
              <strong className="text-foreground">{device.id}</strong> · {device.connected ? "online" : "offline"} ·{" "}
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
                  : "default del env"}
            </p>
            <div className="flex items-center gap-2">
              <span className="w-16 text-xs tracking-[0.15em] text-muted-foreground uppercase">Mic</span>
              {seg(device.id, "mic", device.mic)}
            </div>
            <div className="flex items-center gap-2">
              <span className="w-16 text-xs tracking-[0.15em] text-muted-foreground uppercase">Salida</span>
              {seg(device.id, "output", device.output)}
            </div>
          </div>
        ))}
        {reachable && (
          <p className="text-xs text-muted-foreground">
            “laptop” necesita un navegador conectado como audio de ese dispositivo. Sin uno, el bridge usa el
            dispositivo en ese turno.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
