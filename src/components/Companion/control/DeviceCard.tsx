"use client";

import { Bot, Laptop, Lock, PhoneOff, Unlock, VolumeX } from "lucide-react";

import { MicroLabel, Panel, PanelHead } from "components/Admin/ui/page";
import { StatusDot } from "components/Admin/ui/status";
import { Badge } from "components/shared/ui/badge";
import { Button } from "components/shared/ui/button";
import type { CompanionState } from "lib/orpc/companion/schemas";

import { CommandButton, type SendCommand } from "./commands";
import { LineForm } from "./LineForm";
import { ModeSwitch } from "./ModeSwitch";
import { faceText, phaseText, settingGroups, settingView, turnsView } from "./model";
import { SettingField, SettingGroup, type OnSet, type SetValue } from "./SettingField";
import { STAGES, type BrowserAudio } from "./useBrowserAudio";

const OPEN_GROUPS = new Set(["modo", "audio", "pantalla"]);
const TIME = new Intl.DateTimeFormat("es-UY", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/**
 * One physical Owy: whether it is there, its mode in one tap, staff unlock, a line to say,
 * silence, this browser as its audio, its last turns and every setting it has.
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
          {device ? <Badge variant="secondary">{phaseText(device.phase)}</Badge> : null}
          {device?.face ? <Badge variant="outline">cara: {faceText(device.face)}</Badge> : null}
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

        <ModeSwitch id={id} online={online} state={state} onSet={onSet} />

        <div className="flex flex-wrap items-center gap-2">
          <CommandButton command={{ type: "hush", deviceId: id }} send={send}>
            <VolumeX aria-hidden /> Callar
          </CommandButton>
          <CommandButton
            command={{ type: "staff", deviceId: id, on: !device?.staff }}
            done={(_, sent) => (sent.type === "staff" && sent.on ? "desbloqueado por 10 min" : "bloqueado")}
            send={send}
          >
            {device?.staff ? <Lock aria-hidden /> : <Unlock aria-hidden />}
            {device?.staff ? "Bloquear" : "Desbloquear 10 min"}
          </CommandButton>
          <LineForm id={id} kind="say" send={send} />
        </div>

        <BrowserAudioRow audio={audio} id={id} />

        {turns.length > 0 ? (
          <section aria-label="Últimos turnos" className="space-y-1">
            <MicroLabel>Últimos turnos</MicroLabel>
            <ol className="divide-y divide-border/60 text-meta">
              {turns.map((turn, index) => (
                <li key={`${turn.at}-${index}`} className="flex items-center justify-between gap-3 py-1">
                  <span className="text-foreground">{turn.path}</span>
                  <span className="text-muted-foreground">
                    {turn.firstAudio === null ? (
                      "sin audio"
                    ) : (
                      <>
                        primer audio{" "}
                        <span className="font-terminal text-foreground tabular-nums">{turn.firstAudio}</span>
                      </>
                    )}
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

/** «Usar este navegador como audio»: its mic and speakers become this device's (the fallback for the Mac's). */
export function BrowserAudioRow({ id, audio }: { id: string; audio: BrowserAudio }) {
  const mine = audio.target === id && audio.status !== null && audio.status.stage !== "off";
  const live = mine && audio.status?.stage !== "error" && audio.status?.stage !== "idle";

  return (
    <section aria-label="Audio desde este navegador" className="space-y-1.5 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-ui text-foreground">
          <Laptop aria-hidden className="size-4 text-muted-foreground" />
          Este navegador · {mine && audio.status ? STAGES[audio.status.stage] : STAGES.off}
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
