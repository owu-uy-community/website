"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Reorder, useDragControls } from "motion/react";
import { Check, GripVertical, Loader2, Plus, RotateCcw, X } from "lucide-react";

import { cn } from "app/lib/utils";
import { Button } from "components/shared/ui/button";
import { Input } from "components/shared/ui/input";
import { Label } from "components/shared/ui/label";
import { Switch } from "components/shared/ui/switch";
import { Textarea } from "components/shared/ui/textarea";
import { SCENES, parseSceneParams, type SceneId } from "lib/owy-stage/scenes";

/** Long enough that typing is not interrupted, short enough to feel live. */
const APPLY_MS = 350;
const SEP = " | ";
/** `HH:MM[-HH:MM] Título :: Detalle` — the shape the programme scenes parse. */
const TIME = /^(\d{1,2}:\d{2}(?:\s*[-–]\s*\d{1,2}:\d{2})?)(?:\s+(.*))?$/;
const newId = () => Math.random().toString(36).slice(2, 9);

type Row = { id: string; time: string; title: string; detail: string };
type Params = Record<string, unknown>;

/** An item is kept split while it is edited; joining back only happens on the way out. */
function toRow(text: string, timed: boolean, detailed: boolean): Row {
  const [head, ...rest] = detailed ? text.split("::") : [text];
  const match = timed ? TIME.exec(head.trim()) : null;

  return {
    id: newId(),
    time: match?.[1] ?? "",
    title: (match ? (match[2] ?? "") : head).trim(),
    detail: rest.join("::").trim(),
  };
}
const format = (row: Row) =>
  [[row.time, row.title].filter(Boolean).join(" "), row.detail].filter(Boolean).join(" :: ").trim();
const join = (rows: Row[]) => rows.map(format).filter(Boolean).join(SEP);

/**
 * A pipe-separated param (the agenda, the sponsors, the open-space principles…)
 * edited as what it really is: a list. Rows drag to reorder, Enter adds the next
 * one. The shape of the fields comes from the scene's own default, so an agenda
 * gets its time column and a plain list does not.
 */
function ListField({
  label,
  value,
  shape,
  onChange,
}: {
  label: string;
  value: string;
  shape: string;
  onChange: (value: string, now?: boolean) => void;
}) {
  // The shape comes from the scene's default, so the fields do not change under
  // the operator's hands while they clear a time or a detail.
  const timed = shape.split("|").every((item) => !item.trim() || TIME.test(item.trim()));
  const detailed = shape.includes("::");
  const [rows, setRows] = useState(() =>
    value
      .split("|")
      .map((text) => text.trim())
      .filter(Boolean)
      .map((text) => toRow(text, timed, detailed))
  );
  const [focus, setFocus] = useState<string | null>(null);

  const push = (next: Row[], now?: boolean) => {
    setRows(next);
    onChange(join(next), now);
  };
  const edit = (id: string, part: "time" | "title" | "detail", text: string) =>
    push(rows.map((row) => (row.id === id ? { ...row, [part]: text } : row)));
  const insert = (index: number) => {
    const row: Row = { id: newId(), time: "", title: "", detail: "" };
    setFocus(row.id);
    setRows([...rows.slice(0, index), row, ...rows.slice(index)]);
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          {label} <span className="font-normal">· {rows.length}</span>
        </Label>
        <Button className="h-6 px-2 text-xs" size="sm" variant="ghost" onClick={() => insert(rows.length)}>
          <Plus className="mr-1 h-3 w-3" /> Agregar
        </Button>
      </div>
      <Reorder.Group axis="y" className="space-y-1" values={rows} onReorder={setRows}>
        {rows.map((row, index) => (
          <ItemRow
            key={row.id}
            autoFocus={focus === row.id}
            detailed={detailed}
            row={row}
            timed={timed}
            onChange={(part, text) => edit(row.id, part, text)}
            onEnter={() => insert(index + 1)}
            onRemove={() =>
              push(
                rows.filter((other) => other.id !== row.id),
                true
              )
            }
            onSettle={() => onChange(join(rows), true)}
          />
        ))}
      </Reorder.Group>
      {rows.length === 0 && (
        <p className="rounded-md border border-dashed border-border p-2 text-center text-xs text-muted-foreground">
          Sin ítems. «Agregar» suma el primero.
        </p>
      )}
    </div>
  );
}

function ItemRow({
  row,
  timed,
  detailed,
  autoFocus,
  onChange,
  onEnter,
  onRemove,
  onSettle,
}: {
  row: Row;
  timed: boolean;
  detailed: boolean;
  autoFocus: boolean;
  onChange: (part: "time" | "title" | "detail", text: string) => void;
  onEnter: () => void;
  onRemove: () => void;
  onSettle: () => void;
}) {
  const controls = useDragControls();

  return (
    <Reorder.Item
      className="flex flex-wrap items-center gap-1 rounded-md border bg-muted/40 px-1 py-1 transition-colors hover:bg-muted/70"
      dragControls={controls}
      dragListener={false}
      value={row}
      whileDrag={{ scale: 1.01, zIndex: 20 }}
      onDragEnd={onSettle}
    >
      <button
        aria-label="Arrastrar para reordenar"
        className="cursor-grab touch-none px-0.5 text-muted-foreground hover:text-foreground active:cursor-grabbing"
        type="button"
        onPointerDown={(event) => controls.start(event)}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      {timed && (
        <Input
          className="h-7 w-[112px] px-2 text-xs tabular-nums"
          placeholder="17:00"
          value={row.time}
          onChange={(event) => onChange("time", event.target.value)}
        />
      )}
      <Input
        autoFocus={autoFocus}
        className="h-7 min-w-0 flex-1 text-xs"
        placeholder="Texto del ítem"
        value={row.title}
        onChange={(event) => onChange("title", event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          onEnter();
        }}
      />
      <button
        aria-label="Quitar ítem"
        className="px-0.5 text-muted-foreground hover:text-destructive"
        type="button"
        onClick={onRemove}
      >
        <X className="h-3.5 w-3.5" />
      </button>
      {detailed && (
        <Input
          className="h-7 w-full text-xs text-muted-foreground"
          placeholder="Detalle (segunda línea)"
          value={row.detail}
          onChange={(event) => onChange("detail", event.target.value)}
        />
      )}
    </Reorder.Item>
  );
}

/** zod speaks English and in schema terms; the operator only needs the rule. */
function hint(issue: { code: string; maximum?: unknown; minimum?: unknown }) {
  if (issue.code === "too_big") return `Máximo ${String(issue.maximum)} caracteres`;
  if (issue.code === "too_small") return `Mínimo ${String(issue.minimum)}`;
  if (issue.code === "invalid_format") return "Formato inválido (mirá el ejemplo del valor por defecto)";

  return "Valor inválido";
}

/**
 * The live editor for the scene on air: every change goes to the wall on its
 * own (debounced), lists are edited as lists, and nothing invalid is ever sent
 * — the scene's own schema validates the draft before it travels.
 */
export function SceneParams({
  scene,
  params,
  apply,
  pending,
}: {
  scene: SceneId;
  params: Params;
  apply: (params: Params) => void;
  pending: boolean;
}) {
  const defaults = useMemo(() => parseSceneParams(scene, {}) as Params, [scene]);
  const [draft, setDraft] = useState<Params>(() => parseSceneParams(scene, params) as Params);
  /** Bumped when the draft is replaced from the outside, to re-seed the list rows. */
  const [stamp, setStamp] = useState(0);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  useEffect(() => {
    dirty.current = false;
  }, [scene]);

  // Follow what is on air (a take, another device, the bot) unless the operator
  // is mid-edit; identical params change nothing, so our own echo never steals focus.
  useEffect(() => {
    if (dirty.current) return;
    const next = parseSceneParams(scene, params) as Params;
    if (JSON.stringify(next) === JSON.stringify(draftRef.current)) return;
    setDraft(next);
    setStamp((value) => value + 1);
  }, [scene, params]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const issues = useMemo(() => {
    const result = SCENES[scene].params.safeParse(draft);
    if (result.success) return {} as Record<string, string>;

    return Object.fromEntries(result.error.issues.map((issue) => [String(issue.path[0]), hint(issue)]));
  }, [scene, draft]);

  const push = (next: Params, now?: boolean) => {
    dirty.current = true;
    setDraft(next);
    if (timer.current) clearTimeout(timer.current);
    const result = SCENES[scene].params.safeParse(next);
    if (!result.success) return;
    const send = () => {
      dirty.current = false;
      apply(result.data as Params);
    };
    if (now) send();
    else timer.current = setTimeout(send, APPLY_MS);
  };
  const set = (key: string, value: unknown, now?: boolean) => push({ ...draft, [key]: value }, now);

  const keys = Object.keys(defaults);
  const changed = keys.some((key) => JSON.stringify(draft[key]) !== JSON.stringify(defaults[key]));

  return (
    // A fixed box: scenes have between zero and twenty fields and the page
    // below must not jump every time the wall changes.
    <div className="flex h-[22rem] flex-col">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-2">
        {keys.length === 0 && (
          <p className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
            Esta escena no tiene parámetros.
          </p>
        )}
        {keys.map((key) => {
          const value = draft[key];
          const fallback = defaults[key];
          const error = issues[key];
          const label = key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, " $1");

          if (typeof fallback === "boolean")
            return (
              <label key={key} className="flex items-center gap-3 rounded-md bg-muted/40 px-2 py-1.5 text-sm">
                <Switch checked={Boolean(value)} onCheckedChange={(next) => set(key, next, true)} />
                {label}
              </label>
            );

          if (typeof fallback === "string" && fallback.includes("|"))
            return (
              <ListField
                key={`${key}:${scene}:${stamp}`}
                label={label}
                shape={fallback}
                value={String(value ?? "")}
                onChange={(next, now) => set(key, next, now)}
              />
            );

          const long = typeof fallback === "string" && fallback.length > 70;

          return (
            <div key={key} className="space-y-1">
              <Label
                className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase"
                htmlFor={`param-${key}`}
              >
                {label}
              </Label>
              {long ? (
                <Textarea
                  className={cn("min-h-[72px] text-sm", error && "border-destructive")}
                  id={`param-${key}`}
                  value={String(value ?? "")}
                  onChange={(event) => set(key, event.target.value)}
                />
              ) : (
                <Input
                  className={cn("h-8", error && "border-destructive")}
                  id={`param-${key}`}
                  type={typeof fallback === "number" ? "number" : "text"}
                  value={String(value ?? "")}
                  onChange={(event) =>
                    set(key, typeof fallback === "number" ? Number(event.target.value) : event.target.value)
                  }
                />
              )}
              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex items-center gap-2 border-t pt-2 text-xs text-muted-foreground">
        {pending ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Aplicando…
          </>
        ) : (
          <>
            <Check className="h-3.5 w-3.5 text-green-500" /> Lo que escribís sale al aire solo
          </>
        )}
        {changed && (
          <Button
            className="ml-auto h-7 px-2 text-xs"
            size="sm"
            variant="ghost"
            onClick={() => push({ ...defaults }, true)}
          >
            <RotateCcw className="mr-1 h-3 w-3" /> Restaurar
          </Button>
        )}
      </div>
    </div>
  );
}
