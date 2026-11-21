"use client";

import { useEffect, useState } from "react";

import { Notice } from "components/Admin/panel";
import { Button } from "components/shared/ui/button";
import { Input } from "components/shared/ui/input";
import { Label } from "components/shared/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "components/shared/ui/sheet";
import { getObsClient, loadSettings, obsUrl, saveSettings, useObs, type ObsSettings } from "lib/obs/client";

/** Who runs the commands of the other devices: this tab, another one, or nobody yet. */
type Seat = { isExecutor: boolean; executorOnline: boolean; takeControl: () => void };

/**
 * Host / port / password for obs-websocket, remembered per browser, and the executor seat (the
 * header has no room for it on a phone).
 */
export function ConnectionSheet({
  open,
  onOpenChange,
  seat,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  seat: Seat;
}) {
  const obs = useObs();
  const [settings, setSettings] = useState<ObsSettings>(loadSettings);
  // Re-read on open: the page may have saved a ?connect= deep link after our first render.
  useEffect(() => {
    if (open) setSettings(loadSettings());
  }, [open]);
  const connected = obs.connection === "connected";
  const secure = typeof window !== "undefined" && window.location.protocol === "https:";
  const url = obsUrl(settings);
  const mixed = secure && url.startsWith("ws://") && !/^ws:\/\/(localhost|127\.0\.0\.1)/.test(url);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Conexión a OBS</SheetTitle>
          <SheetDescription>
            OBS → Herramientas → Configuración del servidor WebSocket (puerto 4455). Esta pestaña habla directo con OBS.
          </SheetDescription>
        </SheetHeader>
        <form
          className="mt-4 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            saveSettings(settings);
            getObsClient()
              .connect(settings)
              .then(() => onOpenChange(false))
              .catch(() => undefined);
          }}
        >
          <div className="grid grid-cols-[1fr_6rem] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="obs-host">Host</Label>
              <Input
                autoCapitalize="off"
                autoComplete="off"
                autoCorrect="off"
                id="obs-host"
                inputMode="url"
                placeholder="localhost, 192.168.1.20 o wss://obs.tu-dominio"
                spellCheck={false}
                value={settings.address}
                onChange={(event) => setSettings({ ...settings, address: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="obs-port">Puerto</Label>
              <Input
                id="obs-port"
                inputMode="numeric"
                type="number"
                value={settings.port}
                onChange={(event) => setSettings({ ...settings, port: Number(event.target.value) || 4455 })}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="obs-password">Contraseña</Label>
            <Input
              autoComplete="off"
              id="obs-password"
              type="password"
              value={settings.password}
              onChange={(event) => setSettings({ ...settings, password: event.target.value })}
            />
          </div>
          <p className="font-terminal text-meta text-muted-foreground">{url}</p>
          {connected && (
            <div className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 text-meta text-muted-foreground">
              <span className="min-w-0 flex-1">
                {seat.isExecutor
                  ? "Esta pestaña ejecuta los comandos de los demás dispositivos y del Stream Deck."
                  : seat.executorOnline
                    ? "Otra pestaña ejecuta los comandos de los demás; esta maneja OBS directo."
                    : "Tomando el control…"}
              </span>
              {!seat.isExecutor && seat.executorOnline && (
                <Button size="sm" type="button" variant="outline" onClick={seat.takeControl}>
                  Tomar el control
                </Button>
              )}
            </div>
          )}
          <Notice show={mixed} tone="warning">
            Esta página es https y el navegador bloquea <code>ws://</code> hacia la LAN. Abrí el panel en la misma
            máquina que OBS (localhost) o publicá OBS detrás de un túnel <code>wss://</code>. Los demás dispositivos y
            el Stream Deck no necesitan llegar a OBS: mandan comandos por el servidor.
          </Notice>
          <Notice show={Boolean(obs.error)} tone="danger">
            {obs.error}
          </Notice>
          <div className="flex gap-2">
            <Button className="flex-1" disabled={obs.connection === "connecting"} type="submit">
              {connected ? "Reconectar" : obs.connection === "connecting" ? "Conectando…" : "Conectar"}
            </Button>
            {(connected || obs.connection === "reconnecting") && (
              <Button type="button" variant="outline" onClick={() => getObsClient().disconnect()}>
                Desconectar
              </Button>
            )}
          </div>
          <p className="text-meta text-muted-foreground">
            Las escenas cuyo nombre empieza con <code className="font-terminal">(hidden)</code> no aparecen en el bus.
          </p>
        </form>
      </SheetContent>
    </Sheet>
  );
}
