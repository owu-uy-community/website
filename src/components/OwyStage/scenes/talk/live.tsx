"use client";

import { useContext, useEffect, useRef, useState } from "react";
import { AnimatePresence, m } from "motion/react";

import { EASE_OUT } from "app/conf/components/Reveal";
import { visibleQuestions } from "lib/owy-stage/questions";
import type { Expression, FaceState, SceneParams } from "lib/owy-stage/scenes";
import {
  DIAGRAM_NODES,
  inputKey,
  slideInput,
  slideSteps,
  vsRevealed,
  vsRound,
  type DiagramNode,
  type TalkLayout,
} from "lib/owy-stage/talk/deck";

import { OwyFace, type FaceApi } from "../../Face";
import { tally, useInputs, useInputsWithStatus, usePlayUrl } from "../../inputs";
import { BRAND, StageContext } from "../../Stage";
import OwyFaceScene from "../OwyFace";
import { QrCode, Rise } from "../parts";
import { MiniFace, seconds, useFeed } from "./feed";
import { Build, COL_W, COL_X, Frame, ROW, useSinceMount, type LayoutProps } from "./layouts";
import { CAPTION_TOP, OwyMark, PeopleMark, SEAT_W, SEAT_X, SKY, Said, Seat } from "./seat";

/** The slides where Owy (or the room) is live: faces, phone votes, the Q&A. */

export type LiveProps<L extends TalkLayout> = LayoutProps<L> & {
  round: string;
  eventId: string | null;
  params: SceneParams<"owy-charla">;
};

/** The phones' inputs for the talk's round; thumbnails (`preview`) never read them. */
function useRound(round: string) {
  const { preview } = useContext(StageContext);
  return useInputs(preview ? "" : round, !preview);
}

const votes = (n: number) => `${n} ${n === 1 ? "voto" : "votos"}`;

/** Owy on his chair, on the right: the lobby and the photo. His caption stops before it (`CHAIR_LEFT`). */
export const CHAIR_LEFT = 1200;

function OwyOnChair() {
  return (
    <>
      <OwyMark className="absolute bottom-0 h-[300px] w-[600px]" style={{ left: CHAIR_LEFT }} />
      <div className="absolute top-[180px] left-[1240px]">
        <MiniFace size={520} />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Lobby: Owy on his chair, the title, how to ask, the questions coming in
// ---------------------------------------------------------------------------

export function LobbySlide({ slide, round }: LiveProps<"lobby">) {
  const url = usePlayUrl();
  const inputs = useRound(round);
  const questions = visibleQuestions(inputs);
  // A copy sorted, not toSorted: OBS 30's Chromium 103 doesn't have it.
  const latest = [...questions].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((n) => n + 1), 5000);
    return () => clearInterval(id);
  }, []);
  const shown = latest.length ? latest[i % latest.length] : null;

  return (
    <>
      <div
        className="absolute top-[120px] flex flex-col"
        style={{ left: COL_X, width: 1040, height: CAPTION_TOP - 20 - 120 }}
      >
        <Rise className="text-[176px] leading-[0.94] font-bold tracking-[-0.05em]" delay={0.1}>
          {slide.title}
        </Rise>
        <Rise className="mt-6 text-[48px] leading-[1.15] font-medium text-[#FBF5E7]/75" delay={0.25}>
          {slide.subtitle}
        </Rise>
        <Build className="mt-[72px] flex min-h-0 items-start gap-12" delay={0.45}>
          <QrCode size={250} value={url} />
          <div className="min-w-0 flex-1 pt-2">
            <p className="text-[52px] leading-[1.08] font-semibold tracking-[-0.02em] text-balance">
              Mandale tu pregunta a Owy
            </p>
            <p className="mt-3 text-[34px] font-medium text-[#FBF5E7]/60">{url.replace(/^https?:\/\//, "")}</p>
            <AnimatePresence mode="wait">
              {shown && (
                <m.p
                  key={shown.id}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-8 flex gap-4 text-[34px] leading-[1.2] font-semibold"
                  exit={{ opacity: 0, y: -12 }}
                  initial={{ opacity: 0, y: 12 }}
                  style={{ color: SKY }}
                  transition={{ duration: 0.4, ease: EASE_OUT }}
                >
                  <PeopleMark className="mt-2 h-[26px] w-[26px] shrink-0" />
                  <span className="line-clamp-2">{shown.value}</span>
                </m.p>
              )}
            </AnimatePresence>
          </div>
        </Build>
      </div>
      <OwyOnChair />
    </>
  );
}

// ---------------------------------------------------------------------------
// Owy full screen: the owy-face scene itself (transcript, feelings, landed card)
// ---------------------------------------------------------------------------

export function FaceSlide({ eventId, round, params }: LiveProps<"face">) {
  return (
    <OwyFaceScene ambient={false} eventId={eventId} params={{ captions: params.captions }} round={round} takenAt="" />
  );
}

/**
 * The pitch is a sequence, so its steps are numbered. They sit top left, above Owy's brows and
 * clear of where the face scene shows the pitch and the card that lands (top right).
 */
export function PitchSlide({ slide, eventId, round, params }: LiveProps<"pitch">) {
  return (
    <>
      <OwyFaceScene ambient={false} eventId={eventId} params={{ captions: params.captions }} round={round} takenAt="" />
      <div className="absolute top-[44px] grid grid-cols-[auto_auto] gap-x-[56px] gap-y-[14px]" style={{ left: COL_X }}>
        {slide.how.map((text, i) => (
          <Build key={text} className="flex items-baseline gap-4" delay={0.1 + i * 0.1}>
            <span className="text-[32px] font-semibold text-[#F5BB03] tabular-nums">{i + 1}</span>
            <span className="text-[32px] leading-[1.1] font-medium">{text}</span>
          </Build>
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Votes: the room is blue
// ---------------------------------------------------------------------------

function Bars({ options, counts, reveal }: { options: string[]; counts: Map<string, number>; reveal: boolean }) {
  const total = options.reduce((sum, option) => sum + (counts.get(option) ?? 0), 0);
  const max = Math.max(0, ...options.map((option) => counts.get(option) ?? 0));
  return (
    <div className="flex flex-col gap-[30px]">
      {options.map((option) => {
        const n = counts.get(option) ?? 0;
        const pct = total ? Math.round((n / total) * 100) : 0;
        const lead = n === max && n > 0;
        return (
          <m.div key={option} animate={{ opacity: reveal && !lead ? 0.4 : 1 }}>
            <div className="flex items-baseline justify-between gap-6">
              <span className="text-[44px] leading-none font-semibold tracking-[-0.015em]">{option}</span>
              <span className="text-[44px] leading-none font-semibold tabular-nums">
                {pct}
                <span className="ml-1 text-[28px] text-[#FBF5E7]/55">%</span>
              </span>
            </div>
            <div className="mt-4 h-[14px] bg-[#FBF5E7]/[0.1]">
              <m.div
                animate={{ width: `${pct}%` }}
                className="h-full"
                initial={{ width: 0 }}
                style={{ background: reveal && lead ? BRAND.cream : BRAND.blue }}
                transition={{ duration: 0.8, ease: EASE_OUT }}
              />
            </div>
          </m.div>
        );
      })}
    </div>
  );
}

export function PollSlide({ slide, step, round }: LiveProps<"poll">) {
  const inputs = useRound(round);
  const input = slideInput(slide);
  const options = input.kind === "vote" ? input.options : [];
  const counts = new Map(tally(inputs, inputKey(slide, step)));
  const total = options.reduce((sum, option) => sum + (counts.get(option) ?? 0), 0);
  const reveal = step >= 1;

  return (
    <>
      <Frame
        className="flex flex-col"
        size={66}
        sub={votes(total)}
        title={input.kind === "vote" ? input.prompt : slide.title}
      >
        <div style={{ width: COL_W - 60 }}>
          <Bars counts={counts} options={options} reveal={reveal} />
        </div>
        {reveal && (
          <Build className="mt-[44px] flex items-center gap-6">
            <OwyMark className="h-[30px] w-[60px]" />
            <p className="text-[56px] leading-none font-semibold tracking-[-0.025em]">{slide.reveal}</p>
          </Build>
        )}
      </Frame>
      <Seat label="Votá desde el celular" />
    </>
  );
}

export function VsSlide({ slide, step, round }: LiveProps<"vs">) {
  const inputs = useRound(round);
  const r = Math.min(vsRound(step), slide.rounds.length - 1);
  const current = slide.rounds[r];
  const revealed = vsRevealed(step);
  const counts = new Map(tally(inputs, inputKey(slide, step)));
  const human = counts.get("Humano") ?? 0;
  const owy = counts.get("Owy") ?? 0;
  const total = human + owy;
  const humanShare = total ? human / total : 0.5;
  const byOwy = current.author === "owy";

  return (
    <>
      <Frame
        className="flex flex-col"
        sub={`Ronda ${r + 1} de ${slide.rounds.length}, ${votes(total)}`}
        title={slide.title}
      >
        <Build key={r} style={{ width: COL_W - 40 }}>
          <p className="text-[62px] leading-[1.15] font-semibold tracking-[-0.025em] text-balance">
            <span className="text-[#FBF5E7]/40">«</span>
            {current.text}
            <span className="text-[#FBF5E7]/40">»</span>
          </p>
        </Build>
        <div className="mt-[56px]" style={{ width: COL_W - 40 }}>
          <div className="flex justify-between text-[40px] leading-none font-semibold tabular-nums">
            <span style={{ color: SKY }}>Humano {human}</span>
            <span className="text-[#F5BB03]">{owy} Owy</span>
          </div>
          <div className="mt-4 flex h-[14px] gap-[6px]">
            <m.div animate={{ flexGrow: humanShare }} className="h-full bg-[#0162C8]" style={{ flexBasis: 0 }} />
            <m.div animate={{ flexGrow: 1 - humanShare }} className="h-full bg-[#F5BB03]" style={{ flexBasis: 0 }} />
          </div>
        </div>
        <AnimatePresence>
          {revealed && (
            <m.p
              key={`reveal-${r}`}
              animate={{ opacity: 1, y: 0 }}
              className="mt-[48px] text-[76px] leading-none font-bold tracking-[-0.035em]"
              exit={{ opacity: 0 }}
              initial={{ opacity: 0, y: 20 }}
              style={{ color: byOwy ? BRAND.yellow : SKY }}
              transition={{ duration: 0.5, ease: EASE_OUT }}
            >
              {byOwy ? "Lo escribió Owy." : "Lo escribió Agustín."}
            </m.p>
          )}
        </AnimatePresence>
      </Frame>
      <Seat label="Votá desde el celular" />
    </>
  );
}

export function RatingSlide({ slide, round }: LiveProps<"rating">) {
  const inputs = useRound(round);
  const key = inputKey(slide, 0);
  const ratings = inputs
    .filter((i) => i.key === key)
    .map((i) => Number(i.value))
    .filter((n) => n >= 1 && n <= 5);
  const avg = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;
  const hist = [5, 4, 3, 2, 1].map((star) => ({ star, n: ratings.filter((r) => r === star).length }));
  const max = Math.max(1, ...hist.map((h) => h.n));

  return (
    <>
      <Frame className="flex items-start gap-[100px]" sub={votes(ratings.length)} title={slide.title}>
        <div className="shrink-0">
          <p
            className={`text-[240px] leading-[0.9] font-bold tracking-[-0.05em] tabular-nums ${ratings.length ? "" : "text-[#FBF5E7]/20"}`}
          >
            {avg.toLocaleString("es-UY", { maximumFractionDigits: 1, minimumFractionDigits: 1 })}
          </p>
          <p className="mt-[52px] flex gap-3 text-[64px] leading-none">
            {[1, 2, 3, 4, 5].map((s) => (
              <span key={s} className={s <= Math.round(avg) ? "text-[#FBF5E7]" : "text-[#FBF5E7]/15"}>
                ★
              </span>
            ))}
          </p>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-[26px] pt-6">
          {hist.map((h) => (
            <div key={h.star} className="flex items-center gap-6">
              <span className="w-[40px] text-[34px] font-semibold tabular-nums">{h.star}</span>
              <div className="h-[14px] flex-1 bg-[#FBF5E7]/[0.1]">
                <m.div
                  animate={{ width: `${(h.n / max) * 100}%` }}
                  className="h-full bg-[#0162C8]"
                  initial={{ width: 0 }}
                  transition={{ duration: 0.6 }}
                />
              </div>
              <span className="w-[56px] text-right text-[30px] font-medium text-[#FBF5E7]/60 tabular-nums">{h.n}</span>
            </div>
          ))}
        </div>
      </Frame>
      <Seat label="Puntuá desde el celular" />
    </>
  );
}

// ---------------------------------------------------------------------------
// Owy live: the question in blue, his answer in yellow, the tools he reaches for
// ---------------------------------------------------------------------------

const TOOL_LABEL: Record<string, string> = { event_now: "qué pasa ahora", get_openspace_board: "la grilla" };

const STATE_LABEL: Record<FaceState, string> = {
  idle: "Esperando",
  listening: "Escuchando",
  thinking: "Pensando",
  speaking: "Hablando",
  happy: "Contento",
  error: "Error",
  offline: "Sin conexión",
};

export function LiveSlide({ slide, params }: LiveProps<"live">) {
  const { state, tool, tools, flow } = useFeed();
  const chips = [...slide.tools, ...tools.filter((name) => !slide.tools.includes(name))];

  return (
    <>
      <Frame className="flex flex-col" sub={slide.kicker} title={<span style={{ color: SKY }}>{slide.ask}</span>}>
        <div className="min-h-0 flex-1 overflow-hidden" style={{ width: 1080 }}>
          {flow.transcript ? (
            params.captions && <Said lines={6} size={48} />
          ) : (
            <p className="text-[42px] leading-[1.2] font-medium text-[#FBF5E7]/45">
              Agustín toca la perilla y le pregunta en voz alta.
            </p>
          )}
        </div>
        <div className="mt-8 flex shrink-0 flex-wrap gap-x-[48px] gap-y-3">
          {chips.map((name) => {
            const on = tool === name;
            const used = tools.includes(name);
            return (
              <span
                key={name}
                className={`flex items-baseline gap-4 transition-opacity duration-300 ${on || used ? "opacity-100" : "opacity-40"}`}
              >
                <span
                  className="h-[16px] w-[16px] shrink-0 rounded-full"
                  style={{
                    background: on ? BRAND.yellow : used ? BRAND.cream : "transparent",
                    boxShadow: "inset 0 0 0 2px #FBF5E7",
                  }}
                />
                <span className="font-terminal text-[32px]" style={{ color: on ? BRAND.yellow : undefined }}>
                  {name}
                </span>
                {TOOL_LABEL[name] && (
                  <span className="text-[30px] font-medium text-[#FBF5E7]/55">{TOOL_LABEL[name]}</span>
                )}
              </span>
            );
          })}
        </div>
      </Frame>
      <div
        className="absolute top-[200px] flex flex-col items-center"
        style={{ left: SEAT_X - 40, width: SEAT_W + 80 }}
      >
        <MiniFace size={480} />
        <p className="mt-4 text-[34px] font-medium text-[#FBF5E7]/60">{STATE_LABEL[state]}</p>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// «Por dentro»: the diagram, lighting up as a turn crosses it
// ---------------------------------------------------------------------------

const NODE_W = 268;
const NODE_H = 196;
const NODE_GAP = (COL_W - NODE_W * 4) / 3;
const col = (i: number) => i * (NODE_W + NODE_GAP);
const ROW_1 = 40;
const ROW_2 = ROW_1 + NODE_H + 110;
/** In content coordinates. A snake: right along the top to the brain, down into the API, back left to the screens. */
const NODE_AT: Record<DiagramNode, [number, number]> = {
  knob: [col(0), ROW_1],
  mac: [col(1), ROW_1],
  voice: [col(2), ROW_1],
  brain: [col(3), ROW_1],
  api: [col(3), ROW_2],
  bus: [col(2), ROW_2],
  wall: [col(1), ROW_2],
};
/** Listening: the tap, the Mac's mic, the model. Speaking: the Mac's speakers, the knob's lips, and the face on the wall (through the API and the bus). */
const LIGHTS: Partial<Record<FaceState, DiagramNode[]>> = {
  listening: ["knob", "mac", "voice"],
  thinking: ["voice", "brain"],
  speaking: ["voice", "mac", "knob", "api", "bus", "wall"],
};

/** The last turn's timings, measured on the wall, under Owy's face. */
function Timings() {
  const { timing } = useFeed();
  return (
    <div className="flex flex-col gap-6">
      {(
        [
          ["Primera palabra", timing.ttfa],
          ["Respuesta completa", timing.total],
        ] as const
      ).map(([label, ms]) => (
        <div key={label} className={`${ROW} pt-4`}>
          <p className="text-[28px] font-medium text-[#FBF5E7]/55">{label}</p>
          <p className="mt-1 text-[56px] leading-none font-semibold tracking-[-0.02em] tabular-nums">{seconds(ms)}</p>
        </div>
      ))}
    </div>
  );
}

export function DiagramSlide({ slide, step }: LiveProps<"diagram">) {
  const { state, tool } = useFeed();
  // With builds, one box per click (the newest bright); without, the whole diagram at once.
  const shown = slideSteps(slide) > 1 ? Math.min(step + 1, DIAGRAM_NODES.length) : DIAGRAM_NODES.length;
  const building = shown < DIAGRAM_NODES.length;
  const visible = new Set(DIAGRAM_NODES.slice(0, shown));
  const lit = new Set<DiagramNode>(slide.live ? (LIGHTS[state] ?? []) : []);
  if (slide.live && state === "thinking" && tool) lit.add("api");
  const center = (id: DiagramNode) => [NODE_AT[id][0] + NODE_W / 2, NODE_AT[id][1] + NODE_H / 2] as const;
  const newest = DIAGRAM_NODES[shown - 1];

  return (
    <>
      <Frame title={slide.title}>
        <svg aria-hidden className="absolute top-0 left-0 overflow-visible" height={1} width={1}>
          {DIAGRAM_NODES.slice(1).map((id, i) => {
            const from = DIAGRAM_NODES[i];
            if (!visible.has(id)) return null;
            const on = lit.has(id) && lit.has(from);
            const [x1, y1] = center(from);
            const [x2, y2] = center(id);
            return (
              <m.line
                key={id}
                animate={{ pathLength: 1, stroke: on ? BRAND.yellow : "rgba(251,245,231,0.25)" }}
                initial={{ pathLength: 0 }}
                strokeWidth={on ? 5 : 3}
                transition={{ duration: 0.45, ease: EASE_OUT }}
                x1={x1}
                x2={x2}
                y1={y1}
                y2={y2}
              />
            );
          })}
        </svg>
        {slide.nodes.map((node) => {
          if (!visible.has(node.id)) return null;
          const on = lit.has(node.id);
          const [x, y] = NODE_AT[node.id];
          const dim = building && node.id !== newest;
          return (
            <m.div
              key={node.id}
              animate={{
                opacity: dim ? 0.55 : 1,
                backgroundColor: on ? BRAND.yellow : BRAND.black,
                borderColor: on ? BRAND.yellow : "rgba(251,245,231,0.3)",
                color: on ? BRAND.black : BRAND.cream,
              }}
              className="absolute flex flex-col justify-end border-2 px-6 pb-6"
              initial={{ opacity: 0 }}
              style={{ left: x, top: y, width: NODE_W, height: NODE_H }}
              transition={{ duration: 0.35, ease: EASE_OUT }}
            >
              <p className="text-[40px] leading-[1.02] font-semibold tracking-[-0.02em]">{node.label}</p>
              <p className="mt-2 text-[26px] leading-[1.15] font-medium opacity-70">{node.detail}</p>
            </m.div>
          );
        })}
        {slide.live && tool && (
          <m.p
            animate={{ opacity: 1 }}
            className="absolute font-terminal text-[30px] text-[#F5BB03]"
            initial={{ opacity: 0 }}
            style={{ left: NODE_AT.api[0], top: NODE_AT.api[1] + NODE_H + 20 }}
          >
            {tool}
          </m.p>
        )}
      </Frame>
      <Seat below={slide.live ? <Timings /> : undefined} />
    </>
  );
}

// ---------------------------------------------------------------------------
// The bodies: the two boards side by side, round screens with each one's own face, live
// ---------------------------------------------------------------------------

export function DevicesSlide({ slide, step }: LiveProps<"devices">) {
  // One device gets the whole slide: the knob big enough to read its face from the back.
  const solo = slide.devices.length === 1;
  const k = solo ? 1.85 : 1;
  return (
    <Frame
      caption
      wide
      className={`flex items-start ${solo ? "gap-[120px] pl-[60px]" : "gap-[96px]"}`}
      title={slide.title}
    >
      {slide.devices.slice(0, step + 1).map((device, i) => {
        const d = Math.round(((280 * device.screen) / 466) * k);
        const knob = device.board ? device.board === "knob" : i === 1;
        return (
          <Build key={device.name} className={`flex items-center ${solo ? "gap-[110px]" : "gap-10"}`}>
            <div className="flex shrink-0 items-center justify-center" style={{ width: 320 * k, height: 320 * k }}>
              <div
                className="rounded-full"
                style={{
                  padding: (knob ? 24 : 14) * k,
                  background: knob
                    ? "repeating-conic-gradient(#FBF5E7 0deg 1.2deg, transparent 1.2deg 7.5deg)"
                    : BRAND.cream,
                }}
              >
                <MiniFace board={knob ? "knob" : "amoled"} className="bg-black" size={d} />
              </div>
            </div>
            <div style={{ width: solo ? 760 : 380 }}>
              <p className="leading-none font-semibold tracking-[-0.025em]" style={{ fontSize: solo ? 72 : 52 }}>
                {device.name}
              </p>
              <p className="mt-4 font-medium text-[#F5BB03]" style={{ fontSize: solo ? 40 : 32 }}>
                {device.size}
              </p>
              <ul className={`flex flex-col ${solo ? "mt-8 gap-4" : "mt-5 gap-2"}`}>
                {device.specs.map((spec) => (
                  <li
                    key={spec}
                    className="leading-[1.2] font-medium text-[#FBF5E7]/70"
                    style={{ fontSize: solo ? 40 : 32 }}
                  >
                    {spec}
                  </li>
                ))}
              </ul>
            </div>
          </Build>
        );
      })}
    </Frame>
  );
}

const EXPRESSION_LABEL: Record<Expression, string> = {
  neutral: "Neutral",
  happy: "Contento",
  curious: "Curioso",
  surprised: "Sorprendido",
  thinking: "Pensando",
  playful: "Pícaro",
  empathetic: "Empático",
  excited: "Entusiasmado",
};
const FACE_EVERY_MS = 2400;
/** 1 s of a shut mouth (open 0), in the bridge's lip-shape codec. */
const SHUT = "A".repeat(25);

/** The face big, going through its feelings; its name under it, both above Owy's caption. */
export function FacesSlide({ slide }: LiveProps<"faces">) {
  const { state } = useFeed();
  const face = useRef<FaceApi>(null);
  const [index, setIndex] = useState(0);
  const list = slide.expressions;
  const name = list[index % list.length];

  // The device keeps a feeling for the sentence it is saying, so this face is always mid-sentence.
  useEffect(() => {
    face.current?.state("speaking");
    const id = setInterval(() => setIndex((i) => i + 1), FACE_EVERY_MS);
    return () => clearInterval(id);
  }, []);
  useEffect(() => face.current?.express(name, 100), [name]);
  // Between Owy's lines the mouth stays shut, so each face reads; while he talks, it moves.
  useEffect(() => {
    if (state === "speaking") return;
    const shut = () => face.current?.mouth(SHUT, Date.now());
    shut();
    const id = setInterval(shut, 500);
    return () => clearInterval(id);
  }, [state]);

  return (
    <>
      <OwyFace ref={face} className="absolute top-[40px] left-[640px]" size={640} />
      <div className="absolute top-[704px] right-0 left-0 flex justify-center">
        <AnimatePresence mode="wait">
          <m.p
            key={name}
            animate={{ opacity: 1, y: 0 }}
            className="text-[76px] leading-none font-semibold tracking-[-0.03em] text-[#F5BB03]"
            exit={{ opacity: 0, y: -16 }}
            initial={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.3 }}
          >
            {EXPRESSION_LABEL[name]}
          </m.p>
        </AnimatePresence>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Q&A: the room's questions in blue, who answers, and Owy in his seat
// ---------------------------------------------------------------------------

const WHO = {
  agustin: { label: "Responde Agustín", color: SKY },
  owy: { label: "Responde Owy", color: BRAND.yellow },
  both: { label: "Respondemos los dos", color: BRAND.cream },
} as const;

/** How many questions fit: the one in focus takes two lines, the others one each. */
const QA_ROWS = 6;

export function QaSlide({ slide, round, params }: LiveProps<"qa">) {
  const url = usePlayUrl();
  const inputs = useRound(round);
  const all = visibleQuestions(inputs);
  const focus = all.find((q) => q.id === params.focus) ?? null;
  const list = [...(focus ? [focus] : []), ...all.filter((q) => q.id !== focus?.id)].slice(0, QA_ROWS);

  return (
    <>
      <Frame
        className="flex flex-col"
        sub={`${all.length} ${all.length === 1 ? "pregunta" : "preguntas"}. Votá las tuyas en ${url.replace(/^https?:\/\//, "")}`}
        title={slide.title}
      >
        {list.length === 0 && (
          <p className="text-[42px] font-medium text-[#FBF5E7]/45">
            Todavía no hay preguntas. Escaneá y mandá la tuya.
          </p>
        )}
        <AnimatePresence>
          {list.map((q) => {
            const on = q.id === focus?.id;
            const answered = q.moderation === "answered" && !on;
            return (
              <m.div
                key={q.id}
                animate={{ opacity: on || !focus ? (answered ? 0.35 : 1) : 0.4 }}
                className={`${ROW} flex shrink-0 items-baseline gap-8 ${on ? "py-7" : "py-4"}`}
                exit={{ opacity: 0 }}
                initial={{ opacity: 0 }}
                layout
                transition={{ duration: 0.4, ease: EASE_OUT }}
              >
                <span
                  className="w-[72px] shrink-0 text-[40px] leading-none font-semibold tabular-nums"
                  style={{ color: q.moderation === "pinned" || on ? SKY : "rgba(251,245,231,0.55)" }}
                >
                  {answered ? "✓" : q.votes}
                </span>
                <span
                  className={`min-w-0 ${on ? "line-clamp-2 text-[52px]" : "line-clamp-1 text-[38px]"} leading-[1.18] font-semibold tracking-[-0.015em]`}
                >
                  {q.value}
                </span>
              </m.div>
            );
          })}
        </AnimatePresence>
      </Frame>
      <Seat
        label={null}
        pinned={
          params.who ? (
            <p className="text-center text-[40px] leading-tight font-semibold" style={{ color: WHO[params.who].color }}>
              {WHO[params.who].label}
            </p>
          ) : undefined
        }
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Photo with Owy: on his chair, then 3-2-1 and a flash; reactions float up
// ---------------------------------------------------------------------------

function Countdown() {
  const elapsed = useSinceMount();
  const n = 3 - Math.floor(elapsed);
  return (
    <>
      <div className="absolute top-[150px]" style={{ left: COL_X }}>
        <AnimatePresence mode="wait">
          <m.p
            key={n > 0 ? n : "mate"}
            animate={{ opacity: 1, scale: 1 }}
            className={`${n > 0 ? "text-[540px]" : "pt-[120px] text-[240px]"} origin-left leading-[0.9] font-bold tracking-[-0.05em] text-[#F5BB03] tabular-nums`}
            exit={{ opacity: 0, scale: 1.1 }}
            initial={{ opacity: 0, scale: 0.85 }}
            transition={{ duration: 0.3 }}
          >
            {n > 0 ? n : "¡Mate!"}
          </m.p>
        </AnimatePresence>
      </div>
      {n <= 0 && (
        <m.div
          animate={{ opacity: 0 }}
          className="pointer-events-none absolute inset-0 bg-white"
          initial={{ opacity: 1 }}
          transition={{ duration: 0.9 }}
        />
      )}
    </>
  );
}

type Floater = { id: string; emoji: string; x: number };

function Floaters({ round }: { round: string }) {
  const { preview } = useContext(StageContext);
  const { inputs, loaded } = useInputsWithStatus(round, !preview);
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!loaded) return;
    if (!seen.current) {
      seen.current = new Set(inputs.map((i) => i.id));
      return;
    }
    const fresh = inputs.filter((i) => i.key === "reaction" && !seen.current?.has(i.id));
    if (!fresh.length) return;
    fresh.forEach((i) => seen.current?.add(i.id));
    setFloaters((list) => [
      ...list.slice(-40),
      ...fresh.map((i) => ({ id: i.id, emoji: i.value, x: 160 + Math.random() * 1500 })),
    ]);
  }, [inputs, loaded]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <AnimatePresence>
        {floaters.map((f) => (
          <m.span
            key={f.id}
            animate={{ y: -1000, opacity: [0, 1, 1, 0], x: [0, 30, -30, 0] }}
            className="absolute bottom-[0px] text-[110px] leading-none"
            initial={{ y: 0, opacity: 0 }}
            onAnimationComplete={() => setFloaters((list) => list.filter((g) => g.id !== f.id))}
            style={{ left: f.x }}
            transition={{ duration: 3.4, ease: "easeOut", times: [0, 0.1, 0.8, 1] }}
          >
            {f.emoji}
          </m.span>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function PhotoOpSlide({ slide, step, round }: LiveProps<"photo-op">) {
  return (
    <>
      {step === 0 && (
        <div className="absolute top-[260px]" style={{ left: COL_X, width: 1040 }}>
          <Rise className="text-[176px] leading-[0.94] font-bold tracking-[-0.05em]" delay={0.1}>
            {slide.title}
          </Rise>
          <Rise className="mt-8 text-[48px] font-medium text-[#FBF5E7]/75" delay={0.25}>
            Mandá tu reacción desde el celular.
          </Rise>
        </div>
      )}
      {step >= 1 && <Countdown key={step} />}
      <OwyOnChair />
      <Floaters round={round} />
    </>
  );
}
