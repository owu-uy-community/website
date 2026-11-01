"use client";

import { useState } from "react";
import { Bot, Laptop, Lock, MessageSquareText, PhoneOff, Unlock, Volume2, VolumeX } from "lucide-react";

import { cn } from "app/lib/utils";
import { MicroLabel, Panel, PanelHead } from "components/Admin/ui/page";
import { StatusDot } from "components/Admin/ui/status";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import { Input } from "components/shared/ui/input";
import type { CompanionState } from "lib/orpc/companion/schemas";

import { MODES, type ModeKey } from "../../../../owy/companion/bridge/src/web/registry";
import { CommandButton, CommandNote, useCommand, type SendCommand } from "./commands";
import { modeView, settingGroups, settingView, turnsView } from "./model";
import { SettingField, SettingGroup, type OnSet, type SetValue } from "./SettingField";
import { STAGES, type BrowserAudio } from "./useBrowserAudio";

const MODE_KEYS = Object.keys(MODES) as ModeKey[];
const OPEN_GROUPS = new Set(["modo", "audio", "sonido"]);
const TIME = new Intl.DateTimeFormat("es-UY", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

/**
 * One physical Owy: whether it is there, its mode in one tap, staff unlock, a tone, a line to
 * say, silence, this browser as its audio, its last turns and every setting it has.
 */
export function DeviceCard({
  id,
  state,
  online,
  onSet,
  send,
  audio,
}: {
  id: string;
  state: CompanionState;
  online: boolean;
  onSet: OnSet;
  send: SendCommand;
  audio: BrowserAudio;
}) {
  const device = state.status?.devices.find((item) => item.id === id);
  const connected = online && !!device?.connected;
  const mode = modeView(state, id, online);
  const setValue: SetValue = (key, value) => onSet([{ target: id, key, value }]);
  const turns = turnsView(device?.turns ?? []);

  return (
    <Panel>
      <PanelHead
        actions={
          <span className="flex items-center gap-1.5 text-meta text-muted-foreground">
            <StatusDot ring tone={connected ? "ok" : "idle"} />
            {connected ? "en línea" : "sin conexión"}
          </span>
        }
        icon={Bot}
        meta={device?.host}
        title={id}
      />
      <div className="space-y-4 p-3.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {device?.audio ? <Badge variant="secondary">audio: {device.audio}</Badge> : null}
          {device?.firmware ? <Badge variant="outline">firmware {device.firmware}</Badge> : null}
          {device?.staff ? <Badge variant="warning">staff desbloqueado</Badge> : null}
          {device?.peer ? (
            <Badge variant="info">
              <Laptop aria-hidden /> navegador enchufado
            </Badge>
          ) : null}
          {!device ? (
            <span className="text-meta text-muted-foreground">El bridge no reporta este dispositivo.</span>
          ) : null}
        </div>

        <section aria-label="Modo" className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <MicroLabel>Modo</MicroLabel>
            {mode.standing ? (
              <span
                className={cn(
                  "text-meta",
                  mode.standing.tone === "warn" ? "text-warning-foreground" : "text-info-foreground"
                )}
              >
                {mode.standing.text}
              </span>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4" role="group" aria-label="Modo">
            {MODE_KEYS.map((key) => (
              <Button
                key={key}
                aria-pressed={mode.mode === key}
                className="h-10"
                variant={mode.mode === key ? "default" : "outline"}
                onClick={() =>
                  mode.mode !== key &&
                  onSet(
                    Object.entries(MODES[key].values).map(([setting, value]) => ({ target: id, key: setting, value }))
                  )
                }
              >
                {MODES[key].label}
              </Button>
            ))}
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-2">
          <CommandButton command={{ type: "tone", target: id }} send={send}>
            <Volume2 aria-hidden /> Tono de prueba
          </CommandButton>
          <CommandButton command={{ type: "hush", deviceId: id }} send={send}>
            <VolumeX aria-hidden /> Callar
          </CommandButton>
          <CommandButton
            command={{ type: "staff", deviceId: id, on: !device?.staff }}
            done={() => (device?.staff ? "bloqueado" : "desbloqueado por 10 min")}
            send={send}
          >
            {device?.staff ? <Lock aria-hidden /> : <Unlock aria-hidden />}
            {device?.staff ? "Bloquear" : "Desbloquear 10 min"}
          </CommandButton>
        </div>
        <Say id={id} send={send} />

        <BrowserAudioRow audio={audio} id={id} />

        {turns.length > 0 ? (
          <section aria-label="Últimos turnos" className="space-y-1">
            <MicroLabel>Últimos turnos</MicroLabel>
            <ol className="divide-y divide-border/60 text-meta">
              {turns.map((turn, index) => (
                <li key={`${turn.at}-${index}`} className="flex items-center justify-between gap-3 py-1">
                  <span className="text-foreground">{turn.path}</span>
                  <span className="text-muted-foreground">
                    primer audio <span className="font-terminal text-foreground tabular-nums">{turn.firstAudio}</span>
                  </span>
                  <span className="font-terminal text-muted-foreground tabular-nums">
                    {TIME.format(new Date(turn.at))}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        <div>
          {settingGroups("device").map(({ group, label, keys }) => {
            const views = keys.map((key) => settingView(state, id, key, online));
            return (
              <SettingGroup key={group} defaultOpen={OPEN_GROUPS.has(group)} label={label} views={views}>
                {views.map((view) => (
                  <SettingField key={view.key} view={view} onChange={setValue} />
                ))}
              </SettingGroup>
            );
          })}
        </div>
      </div>
    </Panel>
  );
}

/** «Decir…»: a line Owy says out loud on this device. */
function Say({ id, send }: { id: string; send: SendCommand }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const say = useCommand(send);

  if (!open)
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <MessageSquareText aria-hidden /> Decir…
      </Button>
    );

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={async (event) => {
        event.preventDefault();
        const line = text.trim();
        if (!line) return;
        const result = await say.run({ type: "say", deviceId: id, text: line });
        if (result.ok) setText("");
      }}
    >
      <Input
        autoFocus
        aria-label={`Lo que dice ${id}`}
        className="min-w-0 flex-1 sm:max-w-96"
        maxLength={600}
        placeholder="Lo que va a decir Owy"
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <Button disabled={say.running || !text.trim()} size="sm" type="submit">
        Decir
      </Button>
      <Button size="sm" type="button" variant="ghost" onClick={() => setOpen(false)}>
        Cerrar
      </Button>
      <CommandNote done="lo dijo" state={say} />
    </form>
  );
}

/** «Usar este navegador como audio»: its mic and speakers become this device's. */
function BrowserAudioRow({ id, audio }: { id: string; audio: BrowserAudio }) {
  const mine = audio.target === id && audio.status !== null && audio.status.stage !== "off";
  const live = mine && audio.status?.stage !== "error" && audio.status?.stage !== "idle";

  return (
    <section aria-label="Audio desde este navegador" className="space-y-1.5 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-ui text-foreground">
          <Laptop aria-hidden className="size-4 text-muted-foreground" />
          {mine && audio.status ? STAGES[audio.status.stage] : "Este navegador como audio"}
        </span>
        {live ? (
          <Button size="sm" variant="destructive" onClick={audio.detach}>
            <PhoneOff aria-hidden /> Desenchufar
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={() => audio.attach(id)}>
            <Laptop aria-hidden /> Usar este navegador como audio
          </Button>
        )}
      </div>
      {mine && audio.status ? <p className="text-meta text-muted-foreground">{audio.status.message}</p> : null}
    </section>
  );
}
