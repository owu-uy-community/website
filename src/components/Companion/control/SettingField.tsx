"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "app/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "components/shared/ui/collapsible";
import { Input } from "components/shared/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "components/shared/ui/select";
import { Slider } from "components/shared/ui/slider";
import { Switch } from "components/shared/ui/switch";

import { describeValue, settingSpec, type SettingKey } from "../../../../owy/companion/bridge/src/web/registry";
import type { SettingView, Standing } from "./model";
import { Segmented } from "./ui";

export type SetValue = (key: SettingKey, value: unknown) => void;
/** Store settings (the panel's one write): the bridge follows. */
export type OnSet = (changes: { target: string; key: string; value: unknown }[]) => void;
/** A text setting offered as a list (the Mac's inputs/outputs); `none` names the empty value. */
export type Choices = { items: string[]; none: string };

/** Radix Select reserves "": the empty value of a nullable text is this sentinel. */
const NONE = "__none__";

const TONE: Record<Standing["tone"], string> = {
  muted: "text-muted-foreground",
  pending: "text-info-foreground",
  warn: "text-warning-foreground",
};

/**
 * One setting: its label, hint and where it stands on the left, the control for its kind on the
 * right (stacked on a phone). A switch on/off, a slider that saves on release, a few options side
 * by side (a list past four), a text saved on Enter or on leaving the field.
 */
export function SettingField({
  view,
  choices,
  onChange,
}: {
  view: SettingView;
  choices?: Choices;
  onChange: SetValue;
}) {
  const id = useId();
  const spec = settingSpec(view.key);
  const set = (value: unknown) => onChange(view.key, value);
  // A value that changes elsewhere resets a half-dragged slider or a half-typed text.
  const reset = JSON.stringify(view.value ?? null);
  const segmented = spec.type === "enum" && spec.options.length <= 4;
  // A label only names what it can (a switch, a list, a text); the slider and the options name themselves.
  const Label = spec.type === "number" || segmented ? "span" : "label";
  const items =
    choices && typeof view.value === "string" && view.value
      ? [...new Set([view.value, ...choices.items])]
      : choices?.items;

  return (
    <div
      className={cn(
        "flex gap-x-4 gap-y-2 py-2.5",
        spec.type === "boolean" ? "items-center justify-between" : "flex-col sm:flex-row sm:items-center"
      )}
      title={view.title}
    >
      <div className="min-w-0 sm:w-56 sm:shrink-0">
        <Label className="block text-ui font-medium text-foreground" htmlFor={Label === "label" ? id : undefined}>
          {spec.label}
        </Label>
        {spec.hint ? <p className="text-meta text-muted-foreground">{spec.hint}</p> : null}
        {view.standing ? <p className={cn("text-meta", TONE[view.standing.tone])}>{view.standing.text}</p> : null}
      </div>
      <div className={spec.type === "boolean" ? "shrink-0" : "min-w-0 flex-1"}>
        {spec.type === "boolean" ? (
          <Switch checked={view.value === true} id={id} onCheckedChange={set} />
        ) : spec.type === "number" ? (
          <NumberControl key={reset} keyName={view.key} value={view.value} onCommit={set} />
        ) : spec.type === "enum" ? (
          segmented ? (
            <Segmented
              label={spec.label}
              options={spec.options}
              value={typeof view.value === "string" ? view.value : undefined}
              onChange={set}
            />
          ) : (
            <Select value={typeof view.value === "string" ? view.value : ""} onValueChange={set}>
              <SelectTrigger className="sm:max-w-72" id={id}>
                <SelectValue placeholder="Elegí…" />
              </SelectTrigger>
              <SelectContent>
                {spec.options.map(([value, text]) => (
                  <SelectItem key={value} value={value}>
                    {text}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )
        ) : choices && items && items.length > 0 ? (
          <Select
            value={typeof view.value === "string" && view.value ? view.value : NONE}
            onValueChange={(value) => set(value === NONE ? null : value)}
          >
            <SelectTrigger className="sm:max-w-72" id={id}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{choices.none}</SelectItem>
              {items.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <TextControl
            key={reset}
            id={id}
            max={spec.max}
            nullable={!!spec.nullable}
            placeholder={choices?.none}
            value={view.value}
            onCommit={set}
          />
        )}
      </div>
    </div>
  );
}

function NumberControl({
  keyName,
  value,
  onCommit,
}: {
  keyName: SettingKey;
  value: unknown;
  onCommit: (value: number) => void;
}) {
  const spec = settingSpec(keyName);
  const [draft, setDraft] = useState<number | null>(null);
  if (spec.type !== "number") return null;
  const current = draft ?? (typeof value === "number" ? value : null);

  return (
    <div className="flex items-center gap-3">
      <Slider
        aria-label={spec.label}
        max={spec.max}
        min={spec.min}
        step={spec.step}
        value={[current ?? spec.min]}
        onValueChange={([next]) => setDraft(next)}
        onValueCommit={([next]) => next !== value && onCommit(next)}
      />
      <span className="w-20 shrink-0 text-right font-terminal text-meta text-foreground tabular-nums">
        {current === null ? "—" : describeValue(keyName, Number(current.toFixed(6)))}
      </span>
    </div>
  );
}

function TextControl({
  id,
  value,
  max,
  nullable,
  placeholder,
  onCommit,
}: {
  id: string;
  value: unknown;
  max: number;
  nullable: boolean;
  placeholder?: string;
  onCommit: (value: string | null) => void;
}) {
  const shown = typeof value === "string" ? value : "";
  const commit = (input: HTMLInputElement) => {
    const text = input.value.trim();
    if (text === shown) return;
    // A required text can't be emptied: back to what it was.
    if (!text && !nullable) input.value = shown;
    else onCommit(text || null);
  };

  return (
    <Input
      className="sm:max-w-96"
      defaultValue={shown}
      id={id}
      maxLength={max}
      placeholder={placeholder ?? (nullable ? "vacío = el valor por defecto" : undefined)}
      onBlur={(event) => commit(event.currentTarget)}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          event.currentTarget.value = shown;
          event.currentTarget.blur();
        }
      }}
    />
  );
}

/**
 * A titled, collapsible group of settings. Closed, its title still counts what needs a look
 * (waiting for the bridge, or refused).
 */
export function SettingGroup({
  label,
  defaultOpen,
  views,
  children,
}: {
  label: string;
  defaultOpen: boolean;
  views: SettingView[];
  children: ReactNode;
}) {
  const flagged = views.filter((view) => view.standing && view.standing.tone !== "muted");
  const tone = flagged.some((view) => view.standing?.tone === "warn") ? "warn" : "pending";

  return (
    <Collapsible className="border-t border-border first:border-t-0" defaultOpen={defaultOpen}>
      <CollapsibleTrigger className="group flex min-h-11 w-full items-center justify-between gap-2 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/70">
        <span className="font-terminal text-[10.5px] tracking-[0.14em] text-muted-foreground uppercase">{label}</span>
        <span className="flex items-center gap-2 text-meta text-muted-foreground">
          {flagged.length > 0 ? <span className={TONE[tone]}>{flagged.length} sin aplicar</span> : null}
          <ChevronDown aria-hidden className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className="divide-y divide-border/60 pb-2">{children}</CollapsibleContent>
    </Collapsible>
  );
}
