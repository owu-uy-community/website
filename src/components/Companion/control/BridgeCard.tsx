"use client";

import { Mic, Server, Speaker, Volume2 } from "lucide-react";

import { Panel, PanelHead } from "components/Admin/ui/page";
import type { CompanionState } from "lib/orpc/companion/schemas";

import { BRIDGE_TARGET, type SettingKey } from "../../../../owy/companion/bridge/src/web/registry";
import { CommandButton, type SendCommand } from "./commands";
import { probeText, settingGroups, settingView } from "./model";
import { SettingField, SettingGroup, type Choices, type OnSet, type SetValue } from "./SettingField";
import { Health } from "./ui";

/**
 * The bridge and the Mac it runs on: the mode's bridge-wide switch (mercado abierto), the Mac's
 * input and output (with a level test and a tone), the voice and models, the brain, modo pitch's
 * knobs and the one advanced timing (closed).
 */
export function BridgeCard({
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
  const setValue: SetValue = (key, value) => onSet([{ target: BRIDGE_TARGET, key, value }]);
  const choices: Partial<Record<SettingKey, Choices>> = {
    host_mic: { items: status?.hostMic?.available ?? [], none: "el micrófono integrado" },
    host_speaker: { items: status?.hostSpeaker?.available ?? [], none: "la salida del sistema" },
  };

  return (
    <Panel>
      <PanelHead icon={Server} meta={status?.machine} title="Bridge y Mac" />
      <div className="p-3.5">
        {settingGroups("bridge").map(({ group, label, keys }) => {
          const views = keys.map((key) => settingView(state, BRIDGE_TARGET, key, online));
          return (
            <SettingGroup key={group} defaultOpen={group !== "avanzado"} label={label} views={views}>
              {group === "mac" ? (
                <div className="space-y-2 py-2.5">
                  <Health
                    detail={status?.hostMic?.detail}
                    health={status?.hostMic?.health}
                    icon={Mic}
                    label="Entrada"
                  />
                  <Health
                    detail={status?.hostSpeaker?.detail}
                    health={status?.hostSpeaker?.health}
                    icon={Speaker}
                    label="Salida"
                  />
                  <div className="flex flex-wrap items-center gap-2 pt-1">
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
              ) : null}
              {views.map((view) => (
                <SettingField key={view.key} choices={choices[view.key]} view={view} onChange={setValue} />
              ))}
            </SettingGroup>
          );
        })}
      </div>
    </Panel>
  );
}
