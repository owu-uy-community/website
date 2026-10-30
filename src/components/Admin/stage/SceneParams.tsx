"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Reorder, useDragControls } from "motion/react";
import { Check, EyeOff, GripVertical, Loader2, Plus, RotateCcw, X } from "lucide-react";
import type { z } from "zod";

import { cn } from "app/lib/utils";
import { Button } from "components/shared/ui/button";
import { Field, FieldError, FieldLabel } from "components/shared/ui/field";
import { Input } from "components/shared/ui/input";
import { Label } from "components/shared/ui/label";
import { Switch } from "components/shared/ui/switch";
import { Textarea } from "components/shared/ui/textarea";
import { SCENES, parseSceneParams, type SceneId } from "lib/owy-stage/scenes";

/** Live edits: long enough that typing is not interrupted, short enough to feel live. */
const LIVE_MS = 350;
const SEP = " | ";
/** `HH:MM[-HH:MM] Título :: Detalle` — the shape the programme scenes parse. */
const TIME = /^(\d{1,2}:\d{2}(?:\s*[-–]\s*\d{1,2}:\d{2})?)(?:\s+(.*))?$/;
const newId = () => Math.random().toString(36).slice(2, 9);

/** Every scene param, in the operator's language (a test keeps it complete as scenes are added). */
export const PARAM_LABELS: Record<string, string> = {
  title: "Título",
  subtitle: "Subtítulo",
  eyebrow: "Antetítulo",
  items: "Ítems",
  seconds: "Segundos",
  minutes: "Minutos",
  question: "Pregunta",
  questions: "Preguntas",
  text: "Texto",
  lines: "Líneas",
  line: "Línea",
  hashtag: "Hashtag",
  url: "URL",
  rounds: "Rondas",
  options: "Opciones",
  time: "Hora",
  end: "Fin",
  until: "Hasta",
  date: "Fecha",
  label: "Etiqueta",
  name: "Nombre",
  names: "Nombres",
  answer: "Respuesta",
  prompt: "Consigna",
  prompts: "Consignas",
  venue: "Lugar",
  room: "Sala",
  detail: "Detalle",
  offer: "Promo",
  message: "Mensaje",
  note: "Nota",
  network: "Red",
  password: "Contraseña",
  wifi: "Wi-Fi",
  contact: "Contacto",
  code: "Código",
  address: "Dirección",
  talk: "Charla",
  talks: "Charlas",
  speaker: "Speaker",
  company: "Empresa",
  role: "Rol",
  bio: "Bio",
  left: "Izquierda",
  right: "Derecha",
  song: "Tema",
  artist: "Artista",
  playlist: "Playlist",
  spotify: "Tomar el tema de Spotify",
  a: "Opción A",
  b: "Opción B",
  c: "Opción C",
  d: "Opción D",
  winner: "Ganador",
  hold: "Segundos por aviso",
  warn: "Aviso (min antes del final)",
  state: "Luz (verde, amarillo o rojo)",
  green: "Texto en verde",
  yellow: "Texto en amarillo",
  red: "Texto en rojo",
  layout: "Cámaras",
  label1: "Cámara 1",
  label2: "Cámara 2",
  label3: "Cámara 3",
  captions: "Subtítulos",
  caption: "Leyenda",
  body: "Texto",
  step1: "Paso 1",
  step2: "Paso 2",
  step3: "Paso 3",
  step4: "Paso 4",
  steps: "Pasos",
  photoNote: "Aviso de fotos",
  exits: "Salidas",
  meetingPoint: "Punto de encuentro",
  phone: "Teléfono",
  bus: "Ómnibus",
  taxi: "Taxi",
  bike: "Bici",
  mapUrl: "URL del mapa",
  where: "Dónde",
  h1: "Hora 1",
  t1: "Charla 1",
  s1: "Speaker 1",
  h2: "Hora 2",
  t2: "Charla 2",
  s2: "Speaker 2",
  h3: "Hora 3",
  t3: "Charla 3",
  s3: "Speaker 3",
  l1: "Texto 1",
  l2: "Texto 2",
  l3: "Texto 3",
  n1: "Número 1",
  n2: "Número 2",
  n3: "Número 3",
  secondsPerSponsor: "Segundos por sponsor",
  secondsPerPhoto: "Segundos por foto",
  author: "Autor",
  tagline: "Bajada",
  sponsor: "Sponsor",
  statement: "Afirmación",
  statements: "Afirmaciones",
  max: "Votos por persona",
  opening: "Frase de arranque",
  x: "Eje horizontal",
  y: "Eje vertical",
  groups: "Grupos",
  instruction: "Instrucción",
  prize: "Premio",
  phrase: "Frase",
  phrases: "Frases",
  pairs: "Pares",
  north: "Norte",
  south: "Sur",
  traits: "Casilleros",
  bpm: "Pulsos por minuto",
  step: "Aceleración por ronda",
  beats: "Tiempos por ronda",
  moves: "Movimientos",
  word: "Palabra",
  words: "Palabras",
  guesses: "Intentos",
  loop: "Repetir",
  heads: "Cara",
  tails: "Cruz",
  scoreA: "Puntos A",
  scoreB: "Puntos B",
  votes: "Votos",
  rule: "Regla",
  seed: "Arranque (azar o centro)",
  photo: "Foto",
  accounts: "Cuentas",
  law: "Ley",
};

/** The label of a scene param; a key nobody named yet is spelled out from itself. */
export const labelFor = (key: string) =>
  PARAM_LABELS[key] ?? key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, " $1");

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

/** The bounds a field's schema declares (zod v4 exposes them on the unwrapped type). */
function boundsOf(schema: z.ZodType | undefined): { maxLength?: number; min?: number; max?: number } {
  const inner = (schema as { unwrap?: () => unknown } | undefined)?.unwrap?.() ?? schema;
  const bag = inner as { maxLength?: number | null; minValue?: number | null; maxValue?: number | null } | undefined;

  return {
    maxLength: bag?.maxLength ?? undefined,
    min: bag?.minValue ?? undefined,
    max: bag?.maxValue ?? undefined,
  };
}

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
        <Button className="h-7 px-2 text-xs" size="sm" variant="ghost" onClick={() => insert(rows.length)}>
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
      <Button
        aria-label="Arrastrar para reordenar"
        className="h-8 w-5 cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
        size="icon"
        variant="ghost"
        onPointerDown={(event) => controls.start(event)}
      >
        <GripVertical className="h-4 w-4" />
      </Button>
      {timed && (
        <Input
          className="h-10 w-[112px] px-2 text-base tabular-nums sm:h-8 sm:text-xs pointer-coarse:sm:h-10 pointer-coarse:sm:text-base"
          placeholder="17:00"
          value={row.time}
          onChange={(event) => onChange("time", event.target.value)}
        />
      )}
      <Input
        autoFocus={autoFocus}
        className="h-10 min-w-0 flex-1 text-base sm:h-8 sm:text-xs pointer-coarse:sm:h-10 pointer-coarse:sm:text-base"
        placeholder="Texto del ítem"
        value={row.title}
        onChange={(event) => onChange("title", event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          onEnter();
        }}
      />
      <Button
        aria-label="Quitar ítem"
        className="h-8 w-6 text-muted-foreground hover:text-destructive"
        size="icon"
        variant="ghost"
        onClick={onRemove}
      >
        <X className="h-4 w-4" />
      </Button>
      {detailed && (
        <Input
          className="h-10 w-full text-base text-muted-foreground sm:h-8 sm:text-xs pointer-coarse:sm:h-10 pointer-coarse:sm:text-base"
          placeholder="Detalle (segunda línea)"
          value={row.detail}
          onChange={(event) => onChange("detail", event.target.value)}
        />
      )}
    </Reorder.Item>
  );
}

/**
 * Params as the editor shows them: validated with the scene's defaults filled
 * in. A desk step is stored JSON, so one saved before a schema got stricter
 * falls back to the defaults instead of breaking the page.
 */
export function readParams(scene: SceneId, params: unknown): Params {
  const parsed = SCENES[scene].params.safeParse(params ?? {});

  return (parsed.success ? parsed.data : parseSceneParams(scene, {})) as Params;
}

/** zod speaks English and in schema terms; the operator only needs the rule. */
function hint(issue: { code: string; maximum?: unknown; minimum?: unknown }) {
  if (issue.code === "too_big") return `Máximo ${String(issue.maximum)}`;
  if (issue.code === "too_small") return `Mínimo ${String(issue.minimum)}`;
  if (issue.code === "invalid_format") return "Formato inválido (mirá el ejemplo del valor por defecto)";

  return "Valor inválido";
}

/** A field that scrolls itself into view, so the tablet's keyboard never covers what is being typed. */
const reveal = (event: React.FocusEvent<HTMLElement>) => event.currentTarget.scrollIntoView({ block: "nearest" });

/**
 * The editor for a scene's params, generated from its schema. `live` edits
 * what is on air (debounced, every change goes out on its own); `preview`
 * edits the staged scene, applied at once since nothing is on air yet. Lists
 * are edited as lists, and nothing invalid ever leaves: the scene's own
 * schema validates the draft first.
 */
export function SceneParams({
  scene,
  params,
  apply,
  pending = false,
  mode,
}: {
  scene: SceneId;
  params: Params;
  apply: (params: Params) => void;
  pending?: boolean;
  mode: "live" | "preview";
}) {
  const defaults = useMemo(() => parseSceneParams(scene, {}) as Params, [scene]);
  const shape = (SCENES[scene].params as unknown as { shape?: Record<string, z.ZodType> }).shape ?? {};
  const [draft, setDraft] = useState<Params>(() => readParams(scene, params));
  /** Bumped when the draft is replaced from the outside, to re-seed the list rows. */
  const [stamp, setStamp] = useState(0);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  useEffect(() => {
    dirty.current = false;
  }, [scene]);

  // Follow what is on air / in preview (a take, another device, the bot)
  // unless the operator is mid-edit; identical params change nothing, so our
  // own echo never steals focus. The echo comes back validated (trimmed), so
  // it is compared with the draft validated too: «Hola » keeps its space while
  // the next word is typed.
  useEffect(() => {
    if (dirty.current) return;
    const next = readParams(scene, params);
    const incoming = JSON.stringify(next);
    if (incoming === JSON.stringify(draftRef.current)) return;
    const sent = SCENES[scene].params.safeParse(draftRef.current);
    if (sent.success && incoming === JSON.stringify(sent.data)) return;
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
    if (now || mode === "preview") send();
    else timer.current = setTimeout(send, LIVE_MS);
  };
  const set = (key: string, value: unknown, now?: boolean) => push({ ...draft, [key]: value }, now);

  const keys = Object.keys(defaults);
  const changed = keys.some((key) => JSON.stringify(draft[key]) !== JSON.stringify(defaults[key]));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
        {keys.length === 0 && (
          <p className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
            Esta escena no tiene parámetros.
          </p>
        )}
        {keys.map((key) => {
          const value = draft[key];
          const fallback = defaults[key];
          const error = issues[key];
          const label = labelFor(key);
          const bounds = boundsOf(shape[key]);
          const id = `param-${mode}-${key}`;

          if (typeof fallback === "boolean")
            return (
              <label key={key} className="flex min-h-10 items-center gap-3 rounded-md bg-muted/40 px-3 py-2 text-sm">
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
          const text = String(value ?? "");

          return (
            <Field key={key} className="gap-1.5" data-invalid={Boolean(error)}>
              <div className="flex items-baseline justify-between gap-2">
                <FieldLabel
                  className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase"
                  htmlFor={id}
                >
                  {label}
                </FieldLabel>
                {bounds.maxLength && typeof fallback === "string" && (
                  <span
                    className={cn(
                      "font-terminal text-[11px] text-muted-foreground tabular-nums",
                      text.length > bounds.maxLength && "text-destructive"
                    )}
                  >
                    {text.length}/{bounds.maxLength}
                  </span>
                )}
              </div>
              {long ? (
                <Textarea
                  aria-invalid={Boolean(error)}
                  className="min-h-[72px] text-base sm:text-sm pointer-coarse:sm:text-base"
                  id={id}
                  value={text}
                  onChange={(event) => set(key, event.target.value)}
                  onFocus={reveal}
                />
              ) : (
                <Input
                  aria-invalid={Boolean(error)}
                  className="h-10 sm:h-9 pointer-coarse:sm:h-10 pointer-coarse:sm:text-base"
                  id={id}
                  max={bounds.max}
                  min={bounds.min}
                  type={typeof fallback === "number" ? "number" : "text"}
                  value={text}
                  onChange={(event) =>
                    set(key, typeof fallback === "number" ? Number(event.target.value) : event.target.value)
                  }
                  onFocus={reveal}
                />
              )}
              <FieldError className="text-xs">{error}</FieldError>
            </Field>
          );
        })}
      </div>

      <div className="flex min-h-11 items-center gap-2 border-t px-4 py-1.5 text-xs text-muted-foreground">
        {mode === "preview" ? (
          <>
            <EyeOff className="h-3.5 w-3.5" /> Fuera del aire · se guarda solo
          </>
        ) : pending ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Aplicando…
          </>
        ) : (
          <>
            <Check className="h-3.5 w-3.5 text-success" /> Lo que escribís sale al aire solo
          </>
        )}
        {changed && (
          <Button
            className="ml-auto h-8 px-2 text-xs"
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
