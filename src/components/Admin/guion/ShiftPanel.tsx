"use client";

import { useState } from "react";
import { ArrowRight, Lock, TimerReset } from "lucide-react";

import { EditorPanel, Notice, PanelSection } from "components/Admin/panel";
import { Button } from "components/shared/ui/button";
import { Input } from "components/shared/ui/input";
import { Label } from "components/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "components/shared/ui/select";
import type { Moment } from "lib/orpc/run-of-show/schemas";
import { plannedCollisions, shiftPlan, signed } from "lib/orpc/run-of-show/timing";

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
const STEPS = [-5, 5, 10, 15];

/**
 * "Correr horarios": pick where the delay starts and by how much, see what moves (and what now
 * runs into a fixed start) before it does.
 */
export function ShiftPanel({
  open,
  onOpenChange,
  moments,
  defaultFromId,
  defaultMinutes,
  pending,
  onShift,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  moments: Moment[];
  defaultFromId: string | undefined;
  defaultMinutes: number;
  pending: boolean;
  onShift: (fromItemId: string, minutes: number) => void;
}) {
  const [fromId, setFromId] = useState(defaultFromId);
  const [minutes, setMinutes] = useState(defaultMinutes);
  // Start from the defaults each time it opens.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setFromId(defaultFromId);
      setMinutes(defaultMinutes);
    }
  }

  const candidates = moments.filter((moment) => !moment.actualStart);
  const from = candidates.find((moment) => moment.id === fromId) ?? candidates[0];
  const valid = Number.isInteger(minutes) && minutes !== 0 && Math.abs(minutes) <= 180;
  const { moved, until } = from && valid ? shiftPlan(moments, from.id, minutes) : { moved: [], until: null };
  const starts = new Map(moved.map((change) => [change.moment.id, change.plannedStart]));
  const collisions = plannedCollisions(
    moments.map((moment) => ({ ...moment, plannedStart: starts.get(moment.id) ?? moment.plannedStart }))
  ).filter((collision) => starts.has(collision.momentId));

  return (
    <EditorPanel
      actions={
        <>
          <Button disabled={pending} type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={pending || !from || moved.length === 0}
            type="button"
            onClick={() => from && onShift(from.id, minutes)}
          >
            {pending
              ? "Corriendo…"
              : moved.length > 0
                ? `Correr ${plural(moved.length, "momento", "momentos")}`
                : "Correr"}
          </Button>
        </>
      }
      busy={pending}
      description="Mueve los momentos flexibles desde el que elijas hasta el próximo inicio fijo. Los fijos y lo que ya arrancó quedan donde están."
      icon={TimerReset}
      open={open}
      title="Correr horarios"
      onOpenChange={onOpenChange}
    >
      <div className="space-y-7">
        <PanelSection title="Desde">
          <div className="space-y-2">
            <Label htmlFor="shift-from">Primer momento que se corre</Label>
            <Select value={from?.id} onValueChange={setFromId}>
              <SelectTrigger data-autofocus id="shift-from">
                <SelectValue placeholder="No quedan momentos por arrancar" />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((moment) => (
                  <SelectItem key={moment.id} value={moment.id}>
                    <span className="font-terminal tabular-nums">{moment.plannedStart}</span> · {moment.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </PanelSection>

        <PanelSection title="Cuánto">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2">
              <Input
                aria-label="Minutos"
                className="w-20 font-terminal tabular-nums"
                inputMode="numeric"
                max={180}
                min={-180}
                type="number"
                value={Number.isNaN(minutes) ? "" : minutes}
                onChange={(event) => setMinutes(event.target.valueAsNumber)}
              />
              <span className="text-ui text-muted-foreground">min</span>
            </div>
            <div className="flex gap-1.5">
              {STEPS.map((step) => (
                <Button key={step} size="sm" type="button" variant="outline" onClick={() => setMinutes(step)}>
                  <span className="font-terminal tabular-nums">{signed(step)}</span>
                </Button>
              ))}
            </div>
          </div>
          {!valid ? <p className="text-meta text-muted-foreground">Entre −180 y +180 minutos, sin el 0.</p> : null}
        </PanelSection>

        <PanelSection title="Así queda">
          {moved.length > 0 || until ? (
            <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
              {moved.map(({ moment, plannedStart }) => (
                <li key={moment.id} className="flex h-9 items-center gap-3 px-3 text-ui">
                  <span className="min-w-0 flex-1 truncate text-foreground">{moment.title}</span>
                  <span className="font-terminal text-meta text-muted-foreground tabular-nums">
                    {moment.plannedStart}
                  </span>
                  <ArrowRight aria-label="pasa a" className="size-3.5 text-muted-foreground" />
                  <span className="font-terminal text-meta text-foreground tabular-nums">{plannedStart}</span>
                </li>
              ))}
              {until ? (
                <li className="flex h-9 items-center gap-3 px-3 text-meta text-muted-foreground">
                  <Lock aria-hidden className="size-3.5 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{until.title}</span>
                  <span className="font-terminal tabular-nums">{until.plannedStart} · no se mueve</span>
                </li>
              ) : null}
            </ul>
          ) : (
            <p className="text-meta text-muted-foreground">Nada para correr desde ahí.</p>
          )}
          <Notice show={collisions.length > 0} tone="warning">
            {collisions.map((collision) => (
              <p key={collision.momentId}>
                {`«${collision.title}» terminaría ${collision.overMin} min después de las ${collision.fixed.plannedStart} («${collision.fixed.title}»).`}
              </p>
            ))}
          </Notice>
        </PanelSection>
      </div>
    </EditorPanel>
  );
}
