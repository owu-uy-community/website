"use client";

import { cn } from "app/lib/utils";
import { MicroLabel } from "components/Admin/ui/page";
import { Button } from "components/shared/ui/button";
import type { CompanionState } from "lib/orpc/companion/schemas";

import { MODES, type ModeKey } from "../../../../owy/companion/bridge/src/web/registry";
import { modeView } from "./model";
import type { OnSet } from "./SettingField";

/** The modes, in the registry's order. */
const MODE_LIST = Object.keys(MODES) as ModeKey[];

/** One device's mode in one tap: Conversación · Pitch · Charla · Pausa, with whether the bridge applied it. */
export function ModeSwitch({
  id,
  state,
  online,
  onSet,
  size = "default",
}: {
  id: string;
  state: CompanionState;
  online: boolean;
  onSet: OnSet;
  /** `touch`: the ops page's thumb-sized buttons. */
  size?: "default" | "touch";
}) {
  const mode = modeView(state, id, online);

  return (
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
        {MODE_LIST.map((key) => (
          <Button
            key={key}
            aria-pressed={mode.mode === key}
            className={size === "touch" ? undefined : "h-10"}
            size={size === "touch" ? "touch" : "default"}
            variant={mode.mode === key ? "default" : "outline"}
            onClick={() =>
              mode.mode !== key &&
              onSet(Object.entries(MODES[key].values).map(([setting, value]) => ({ target: id, key: setting, value })))
            }
          >
            {MODES[key].label}
          </Button>
        ))}
      </div>
    </section>
  );
}
