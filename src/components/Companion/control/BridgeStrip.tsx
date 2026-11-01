"use client";

import { useEffect, useState } from "react";
import { RotateCcw, Search } from "lucide-react";

import { Notice } from "components/Admin/panel";
import { MicroLabel, Panel } from "components/Admin/ui/page";
import { StatusDot } from "components/Admin/ui/status";
import { Button } from "components/shared/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "components/shared/ui/select";
import type { CompanionState } from "lib/orpc/companion/schemas";

import { isSettingKey, settingSpec } from "../../../../owy/companion/bridge/src/web/registry";
import { CommandButton, type SendCommand } from "./commands";
import { ago, matchFound } from "./model";
import type { OnSet } from "./SettingField";

/** The setting a rejected row names, in words. */
const settingLabel = (key: string) => (isSettingKey(key) ? settingSpec(key).label : key);

/**
 * The bridge at a glance: whether it is there (and since when), its code, the Mac, the brain and
 * the voice; what it refused and what waits for a quiet moment; restart it, or look for boards on
 * the network and point a device at the address found.
 */
export function BridgeStrip({
  state,
  online,
  ids,
  onSet,
  send,
}: {
  state: CompanionState;
  online: boolean;
  ids: string[];
  onSet: OnSet;
  send: SendCommand;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const status = state.status;
  const tier = status?.devices[0]?.voice.tier?.replace(/^gateway:/, "");
  const facts = status
    ? [
        status.version,
        status.machine,
        `arrancó ${ago(status.startedAt, now)}`,
        typeof status.values.brain === "string" ? `cerebro ${status.values.brain}` : null,
        tier ? `voz ${tier}` : null,
      ].filter(Boolean)
    : [];
  const pending = status?.pending.length ?? 0;
  const pointAt = (target: string, host: string) => onSet([{ target, key: "host", value: host }]);

  return (
    <Panel className="space-y-3 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 space-y-0.5">
          <p className="flex items-center gap-2 text-ui font-medium text-foreground">
            <StatusDot ring tone={online ? "ok" : "live"} />
            {online ? "Bridge en línea" : "Bridge sin conexión"}
            <span className="font-normal text-muted-foreground">
              {state.seenAt ? `· visto ${ago(state.seenAt, now)}` : "· todavía no reportó"}
            </span>
          </p>
          {facts.length > 0 ? (
            <p className="truncate font-terminal text-meta text-muted-foreground">{facts.join(" · ")}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CommandButton
            command={{ type: "restart" }}
            done={() => "se reinicia en el próximo momento sin turnos"}
            send={send}
          >
            <RotateCcw aria-hidden /> Reiniciar
          </CommandButton>
          <CommandButton command={{ type: "discover" }} done={() => "búsqueda lista"} running="buscando…" send={send}>
            <Search aria-hidden /> Buscar en la red
          </CommandButton>
        </div>
      </div>

      <Notice show={(status?.rejected.length ?? 0) > 0} tone="warning">
        <p className="font-medium">El bridge no aplicó estos cambios y sigue con el valor anterior:</p>
        <ul className="mt-1 space-y-0.5 text-meta">
          {status?.rejected.map((row) => (
            <li key={`${row.target}:${row.key}`}>
              <span className="text-foreground">
                {row.target === "bridge" ? "" : `${row.target} · `}
                {settingLabel(row.key)}
              </span>
              : <span className="text-muted-foreground">{row.error}</span>
            </li>
          ))}
        </ul>
      </Notice>
      <Notice show={pending > 0} tone="info">
        {pending === 1 ? "1 cambio espera" : `${pending} cambios esperan`} un momento sin turnos para aplicarse (el
        bridge se reinicia solo).
      </Notice>

      {status?.found ? (
        <section aria-label="Encontrados en la red" className="space-y-1.5">
          <MicroLabel>En la red (última búsqueda)</MicroLabel>
          {status.found.length === 0 ? (
            <p className="text-meta text-muted-foreground">No apareció ninguno.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {status.found.map((board) => {
                const match = matchFound(board.name, ids);
                return (
                  <li
                    key={`${board.name}@${board.host}`}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-1.5"
                  >
                    <span className="text-ui text-foreground">{board.name}</span>
                    <span className="font-terminal text-meta text-muted-foreground">{board.host}</span>
                    <span className="ml-auto">
                      {match ? (
                        <Button size="sm" variant="outline" onClick={() => pointAt(match, board.host)}>
                          Usar esta IP en {match}
                        </Button>
                      ) : ids.length > 0 ? (
                        <Select value="" onValueChange={(target) => pointAt(target, board.host)}>
                          <SelectTrigger aria-label={`Usar ${board.host} en…`} className="w-52">
                            <SelectValue placeholder="Usar esta IP en…" />
                          </SelectTrigger>
                          <SelectContent>
                            {ids.map((id) => (
                              <SelectItem key={id} value={id}>
                                {id}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}
    </Panel>
  );
}
