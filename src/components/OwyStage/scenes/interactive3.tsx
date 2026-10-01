"use client";

import { useContext, useRef, useState } from "react";
import { AnimatePresence, m } from "motion/react";

import { EASE_OUT } from "app/conf/components/Reveal";
import type { SceneProps } from "lib/owy-stage/scenes";
import { formatTime } from "lib/utils";

import { Confetti } from "../effects";
import {
  PIXEL_COLORS,
  PIXEL_SIZE,
  RACE_REVEAL,
  decodePixels,
  parseRace,
  tally,
  useElapsed,
  useInputs,
  usePlayUrl,
} from "../inputs";
import { Ambient, BRAND, StageContext, useStageFrame } from "../Stage";
import { QrCode } from "./parts";
import { Header, splitList } from "./service";

const COLORS = [BRAND.yellow, BRAND.blue, BRAND.cream];

function JoinCard({ label = "Participá" }: { label?: string }) {
  const url = usePlayUrl();
  return (
    <div className="absolute top-[100px] right-[140px] flex flex-col items-center">
      <QrCode size={300} value={url} />
      <p className="mt-4 text-[26px] font-extrabold tracking-[0.15em] uppercase">{label}</p>
      <p className="font-terminal text-[22px] text-[#FBF5E7]/55">{url.replace(/^https?:\/\//, "")}</p>
    </div>
  );
}

function useRotation(count: number, seconds: number, preview: boolean) {
  const start = useRef(0);
  const [state, setState] = useState({ index: 0, left: seconds });
  useStageFrame((t) => {
    if (preview || !count) return;
    if (!start.current) start.current = t;
    const elapsed = (t - start.current) / 1000;
    const index = Math.floor(elapsed / seconds) % count;
    const left = Math.ceil(seconds - (elapsed % seconds));
    setState((s) => (s.index === index && s.left === left ? s : { index, left }));
  });
  return state;
}

/** Deterministic pick from a list, seeded by the round id, so every screen agrees. */
function seededIndex(seed: string, length: number) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return Math.abs(h) % Math.max(1, length);
}

// ---------------------------------------------------------------------------
// Pixel art gallery
// ---------------------------------------------------------------------------

function PixelArt({ value, size }: { value: string; size: number }) {
  const cells = decodePixels(value);
  if (!cells.length) return null;
  return (
    <div
      className="grid bg-black"
      style={{ gridTemplateColumns: `repeat(${PIXEL_SIZE}, 1fr)`, width: size, height: size }}
    >
      {cells.map((c, i) => (
        <span key={i} style={{ background: PIXEL_COLORS[c] }} />
      ))}
    </div>
  );
}

export function Pixel({ params, round }: SceneProps<"pixel">) {
  const { preview } = useContext(StageContext);
  const inputs = useInputs(round, !preview);
  const drawings = inputs
    .filter((i) => i.key === "pixel")
    .slice(-10)
    .reverse();

  return (
    <>
      <Ambient />
      <Header eyebrow={`${inputs.filter((i) => i.key === "pixel").length} dibujos`} title={params.prompt} />
      <JoinCard label="Dibujá" />
      <div className="absolute top-[340px] right-[500px] bottom-[60px] left-[340px] flex flex-wrap content-start gap-[20px]">
        {drawings.length === 0 && (
          <p className="text-[44px] font-semibold text-[#FBF5E7]/40">Esperando el primer dibujo…</p>
        )}
        <AnimatePresence>
          {drawings.map((d) => (
            <m.div
              key={d.id}
              animate={{ opacity: 1, scale: 1 }}
              className="border-[6px] border-[#FBF5E7]/20 bg-black"
              exit={{ opacity: 0, scale: 0.7 }}
              initial={{ opacity: 0, scale: 0.6 }}
              layout
              transition={{ duration: 0.45, ease: EASE_OUT }}
            >
              <PixelArt size={192} value={d.value} />
            </m.div>
          ))}
        </AnimatePresence>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Mood grid — a dot per person on two axes
// ---------------------------------------------------------------------------

export function MoodGrid({ params, round }: SceneProps<"mood-grid">) {
  const { preview } = useContext(StageContext);
  const inputs = useInputs(round, !preview);
  const points = inputs
    .filter((i) => i.key === "mood")
    .map((i) => {
      const [x, y] = i.value.split(",").map(Number);
      return { id: i.id, x: Math.min(100, Math.max(0, x || 0)), y: Math.min(100, Math.max(0, y || 0)) };
    });
  const avgX = points.length ? points.reduce((a, p) => a + p.x, 0) / points.length : 50;
  const avgY = points.length ? points.reduce((a, p) => a + p.y, 0) / points.length : 50;

  return (
    <>
      <Ambient />
      <Header eyebrow={`${points.length} personas`} title={params.title} />
      <JoinCard label="Marcá tu punto" />
      <div className="absolute top-[330px] left-[420px] h-[640px] w-[900px] border-[4px] border-[#FBF5E7]/25">
        <div className="absolute inset-y-0 left-1/2 w-[2px] bg-[#FBF5E7]/15" />
        <div className="absolute inset-x-0 top-1/2 h-[2px] bg-[#FBF5E7]/15" />
        <AnimatePresence>
          {points.map((p, i) => (
            <m.span
              key={p.id}
              animate={{ scale: 1, opacity: 0.9 }}
              className="absolute h-[34px] w-[34px] -translate-x-1/2 -translate-y-1/2 rounded-full"
              initial={{ scale: 0, opacity: 0 }}
              style={{ left: `${p.x}%`, top: `${100 - p.y}%`, background: COLORS[i % 3] }}
              transition={{ duration: 0.4, ease: EASE_OUT }}
            />
          ))}
        </AnimatePresence>
        {points.length > 1 && (
          <m.span
            animate={{ left: `${avgX}%`, top: `${100 - avgY}%` }}
            className="absolute flex h-[70px] w-[70px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[6px] border-[#F5BB03] text-[24px] font-extrabold"
            transition={{ duration: 0.6 }}
          >
            ⌀
          </m.span>
        )}
      </div>
      <p className="absolute top-[990px] left-[420px] w-[900px] text-center text-[28px] font-bold text-[#FBF5E7]/60">
        {params.x} →
      </p>
      <p className="absolute top-[640px] left-[330px] origin-center -translate-x-1/2 -rotate-90 text-[28px] font-bold whitespace-nowrap text-[#FBF5E7]/60">
        {params.y} →
      </p>
    </>
  );
}

// ---------------------------------------------------------------------------
// Quiz race — several questions, a leaderboard, phones as buzzers
// ---------------------------------------------------------------------------

export function QuizRace({ params, round, takenAt }: SceneProps<"quiz-race">) {
  const { preview } = useContext(StageContext);
  const inputs = useInputs(round, !preview);
  const elapsed = useElapsed(takenAt);
  const questions = parseRace(params.questions);
  const slot = params.seconds + RACE_REVEAL;
  const index = preview ? 0 : Math.min(questions.length, Math.floor(elapsed / slot));
  const inSlot = elapsed - index * slot;
  const revealing = !preview && index < questions.length && inSlot >= params.seconds;
  const finished = !preview && index >= questions.length;
  const current = questions[Math.min(index, questions.length - 1)];
  const left = Math.max(0, Math.ceil(params.seconds - inSlot));

  const names = new Map(inputs.filter((i) => i.key === "name").map((i) => [i.voter, i.value]));
  const scores = new Map<string, { score: number; last: string }>();
  questions.forEach((q, qi) => {
    if (qi > index || (qi === index && !revealing && !finished)) return;
    for (const input of inputs) {
      if (input.key !== `q:${qi}` || Number(input.value) !== q.answer) continue;
      const entry = scores.get(input.voter) ?? { score: 0, last: "" };
      scores.set(input.voter, { score: entry.score + 1, last: input.createdAt });
    }
  });
  const board = [...scores.entries()]
    .sort((a, b) => b[1].score - a[1].score || a[1].last.localeCompare(b[1].last))
    .slice(0, 5);
  const answers = new Map(tally(inputs, `q:${index}`));
  const answered = [...answers.values()].reduce((a, b) => a + b, 0);

  return (
    <>
      <Ambient />
      <Header
        eyebrow={finished ? "Resultado final" : `Pregunta ${index + 1} de ${questions.length} · ${answered} respuestas`}
        title={finished ? "¡Se terminó el quiz!" : (current?.question ?? "Sin preguntas")}
      />
      <JoinCard label={finished ? "Gracias" : "Respondé"} />
      {!finished && current && (
        <div className="absolute top-[380px] left-[340px] grid w-[1060px] grid-cols-2 gap-[16px]">
          {current.options.map((option, i) => {
            const n = answers.get(String(i)) ?? 0;
            const correct = revealing && i === current.answer;
            return (
              <m.div
                key={`${index}-${i}`}
                animate={{ opacity: revealing && !correct ? 0.35 : 1 }}
                className={`flex min-h-[130px] items-center gap-6 px-6 py-4 ${correct ? "bg-[#F5BB03] text-black" : "bg-[#FBF5E7]/[0.07]"}`}
              >
                <span
                  className={`flex h-[70px] w-[70px] shrink-0 items-center justify-center rounded-full text-[34px] font-extrabold ${correct ? "bg-black text-[#F5BB03]" : "bg-[#0162C8]"}`}
                >
                  {"ABCD"[i]}
                </span>
                <span className="text-[34px] leading-[1.1] font-bold text-balance">{option}</span>
                {revealing && <span className="ml-auto text-[30px] font-extrabold tabular-nums opacity-80">{n}</span>}
              </m.div>
            );
          })}
        </div>
      )}
      {!finished && !revealing && (
        <p className="countdown-font absolute right-[140px] bottom-[60px] text-[150px] leading-none text-[#F5BB03]">
          {left}
        </p>
      )}
      {(revealing || finished) && (
        <div
          className={`absolute ${finished ? "top-[380px] left-[340px] w-[1060px]" : "top-[520px] right-[140px] w-[380px]"}`}
        >
          <p className="text-[24px] font-bold tracking-[0.3em] text-[#F5BB03] uppercase">Posiciones</p>
          <ol className="mt-3 flex flex-col gap-[8px]">
            {board.map(([voter, { score }], i) => (
              <li
                key={voter}
                className={`flex items-center justify-between px-5 py-2 ${finished ? "text-[44px]" : "text-[26px]"} font-bold ${i === 0 ? "bg-[#F5BB03] text-black" : "bg-[#FBF5E7]/[0.07]"}`}
              >
                <span className="truncate">
                  {i + 1}. {names.get(voter) ?? "Anónimo"}
                </span>
                <span className="ml-4 tabular-nums">{score}</span>
              </li>
            ))}
            {!board.length && <li className="text-[26px] text-[#FBF5E7]/50">Nadie acertó todavía.</li>}
          </ol>
        </div>
      )}
      {finished && !preview && board.length > 0 && (
        <div className="pointer-events-none absolute inset-0">
          <Confetti />
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Open mic — the sign-up queue
// ---------------------------------------------------------------------------

export function OpenMic({ params, round }: SceneProps<"open-mic">) {
  const { preview } = useContext(StageContext);
  const inputs = useInputs(round, !preview);
  const queue = inputs.filter((i) => i.key === "mic").slice(0, 10);

  return (
    <>
      <Ambient />
      <Header eyebrow={`${params.minutes} min cada uno · ${queue.length} anotados`} title={params.title} />
      <JoinCard label="Anotate" />
      <ol className="absolute top-[380px] left-[340px] flex w-[1060px] flex-col gap-[10px]">
        {queue.length === 0 && <li className="text-[44px] font-semibold text-[#FBF5E7]/40">Todavía nadie. Animate.</li>}
        <AnimatePresence>
          {queue.map((entry, i) => {
            const [name, topic] = entry.value.split(" — ");
            return (
              <m.li
                key={entry.id}
                animate={{ opacity: 1, x: 0 }}
                className={`flex items-center gap-6 px-6 py-3 ${i === 0 ? "bg-[#F5BB03] text-black" : "bg-[#FBF5E7]/[0.07]"}`}
                initial={{ opacity: 0, x: 40 }}
                layout
              >
                <span className="w-[60px] text-[34px] font-extrabold tabular-nums">{i + 1}.</span>
                <span className="w-[300px] truncate text-[34px] font-extrabold">{name}</span>
                <span className="flex-1 truncate text-[30px] font-semibold opacity-80">{topic ?? ""}</span>
                {i === 0 && <span className="text-[22px] font-bold tracking-[0.2em] uppercase">Ahora</span>}
              </m.li>
            );
          })}
        </AnimatePresence>
      </ol>
    </>
  );
}

// ---------------------------------------------------------------------------
// Tug of war — every tap pulls the rope
// ---------------------------------------------------------------------------

export function Tug({ params, round }: SceneProps<"tug">) {
  const { preview } = useContext(StageContext);
  const inputs = useInputs(round, !preview);
  const sum = (side: string) =>
    inputs.filter((i) => i.key === `tug:${side}`).reduce((acc, i) => acc + (Number(i.value) || 0), 0);
  const a = sum("a");
  const b = sum("b");
  // Rope position: −1 all the way left, +1 all the way right; the ends win at ±0.9.
  const pos = a + b ? (b - a) / (a + b) : 0;
  const winner = pos <= -0.9 && a + b > 20 ? params.a : pos >= 0.9 && a + b > 20 ? params.b : null;

  return (
    <>
      <div className="absolute inset-y-0 left-0 w-1/2 bg-[#F5BB03]/10" />
      <div className="absolute inset-y-0 right-0 w-1/2 bg-[#0162C8]/15" />
      <Header eyebrow={`Cinchada · ${a + b} tirones`} title={params.question} />
      <JoinCard label="Tirá" />
      <div className="absolute top-[520px] right-[140px] left-[140px]">
        <div className="flex justify-between text-[64px] font-extrabold uppercase">
          <span className="text-[#F5BB03]">◀ {params.a}</span>
          <span className="text-[#0162C8]">{params.b} ▶</span>
        </div>
        <div className="relative mt-8 h-[40px]">
          <div className="absolute inset-x-0 inset-y-[14px] bg-[#8a6a2a]" />
          <div className="absolute inset-y-0 left-[5%] w-[6px] bg-[#FBF5E7]/40" />
          <div className="absolute inset-y-0 right-[5%] w-[6px] bg-[#FBF5E7]/40" />
          <div className="absolute inset-y-[-20px] left-1/2 w-[4px] bg-[#FBF5E7]/60" />
          <m.div
            animate={{ left: `${50 + pos * 45}%` }}
            className="absolute top-1/2 h-[110px] w-[110px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#FBF5E7] shadow-[0_10px_40px_rgba(0,0,0,0.6)]"
            transition={{ type: "spring", stiffness: 120, damping: 18 }}
          />
        </div>
        <div className="mt-10 flex justify-between text-[40px] font-bold text-[#FBF5E7]/70 tabular-nums">
          <span>{a}</span>
          <span>{b}</span>
        </div>
        {winner && (
          <p className="mt-6 text-center text-[100px] leading-none font-extrabold uppercase">¡Ganó {winner}!</p>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Pick a number — the 7 trick
// ---------------------------------------------------------------------------

export function PickNumber({ params, round, takenAt }: SceneProps<"pick-number">) {
  const { preview } = useContext(StageContext);
  const inputs = useInputs(round, !preview);
  const elapsed = useElapsed(takenAt);
  const left = preview ? params.seconds : Math.max(0, Math.ceil(params.seconds - elapsed));
  const revealed = !preview && left === 0;
  const counts = new Map(tally(inputs, "pick"));
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const max = Math.max(1, ...counts.values());
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];

  return (
    <>
      <Ambient />
      <Header
        eyebrow={revealed ? `${total} personas` : `Pensá un número del 1 al 10 · ${total} respuestas`}
        title={
          revealed ? (top ? `La mayoría eligió el ${top[0]}` : "Nadie eligió") : "No lo digas. Marcalo en el celular."
        }
      />
      {!revealed && <JoinCard label="Elegí" />}
      {!revealed && (
        <p className="countdown-font absolute right-[140px] bottom-[60px] text-[150px] leading-none text-[#F5BB03]">
          {left}
        </p>
      )}
      <div className="absolute top-[400px] left-[340px] flex h-[520px] w-[1060px] items-end gap-[14px]">
        {Array.from({ length: 10 }, (_, i) => String(i + 1)).map((n) => {
          const c = counts.get(n) ?? 0;
          return (
            <div key={n} className="flex flex-1 flex-col items-center justify-end">
              {revealed && <span className="mb-2 text-[28px] font-bold tabular-nums">{c}</span>}
              <m.div
                animate={{ height: revealed ? `${(c / max) * 380}px` : "12px" }}
                className={`w-full ${revealed && top && n === top[0] ? "bg-[#F5BB03]" : "bg-[#0162C8]"}`}
                transition={{ duration: 0.7, ease: EASE_OUT }}
              />
              <span className="mt-3 text-[40px] font-extrabold">{n}</span>
            </div>
          );
        })}
      </div>
      {revealed && top?.[0] === "7" && (
        <p className="absolute right-[140px] bottom-[80px] text-[36px] font-bold text-[#F5BB03]">
          Siempre el 7. Siempre.
        </p>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Draw — a raffle among the phones that entered
// ---------------------------------------------------------------------------

export function Draw({ params, round, takenAt }: SceneProps<"draw">) {
  const { preview } = useContext(StageContext);
  const inputs = useInputs(round, !preview);
  const elapsed = useElapsed(takenAt);
  const entries = inputs.filter((i) => i.key === "entry");
  const left = preview ? params.seconds : Math.max(0, Math.ceil(params.seconds - elapsed));
  const spinning = !preview && left === 0 && elapsed < params.seconds + 4;
  const done = !preview && elapsed >= params.seconds + 4 && entries.length > 0;
  const winner = entries[seededIndex(round, entries.length)];
  const [flicker, setFlicker] = useState(0);
  useStageFrame((t) => {
    if (spinning) setFlicker(Math.floor(t / 80));
  });

  return (
    <>
      <Ambient />
      <Header eyebrow={`${params.prize} · ${entries.length} anotados`} title={params.title} />
      {!done && !spinning && <JoinCard label="Anotate" />}
      <div className="absolute top-[380px] left-[340px] w-[1060px]">
        {done ? (
          <>
            <p className="text-[30px] font-bold tracking-[0.3em] text-[#F5BB03] uppercase">Ganó</p>
            <p className="text-[150px] leading-[1] font-extrabold text-balance">{winner?.value}</p>
            <p className="mt-6 text-[36px] font-semibold text-[#FBF5E7]/60">
              Acercate al escenario a buscar tu premio.
            </p>
          </>
        ) : spinning ? (
          <p className="text-[120px] leading-[1] font-extrabold text-[#F5BB03]">
            {entries[flicker % Math.max(1, entries.length)]?.value ?? "…"}
          </p>
        ) : (
          <>
            <p className="text-[30px] font-bold tracking-[0.3em] text-[#F5BB03] uppercase">Se sortea en</p>
            <p className="countdown-font text-[260px] leading-none">{formatTime(left)}</p>
            <p className="text-[36px] font-semibold text-[#FBF5E7]/60">
              {entries.length
                ? `Últimos anotados: ${entries
                    .slice(-4)
                    .map((e) => e.value)
                    .join(", ")}`
                : "Todavía nadie se anotó."}
            </p>
          </>
        )}
      </div>
      {done && !preview && (
        <div className="pointer-events-none absolute inset-0">
          <Confetti />
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Typing race
// ---------------------------------------------------------------------------

export function Typing({ params, round }: SceneProps<"typing">) {
  const { preview } = useContext(StageContext);
  const inputs = useInputs(round, !preview);
  const results = inputs
    .filter((i) => i.key === "typed")
    .map((i) => {
      const at = i.value.indexOf(":");
      return { id: i.id, ms: Number(i.value.slice(0, at)), name: i.value.slice(at + 1) };
    })
    .filter((r) => Number.isFinite(r.ms) && r.ms > 0)
    .sort((a, b) => a.ms - b.ms)
    .slice(0, 8);

  return (
    <>
      <Ambient />
      <Header
        eyebrow={`Carrera de tipeo · ${inputs.filter((i) => i.key === "typed").length} terminaron`}
        title="Tipeá esto sin errores"
      />
      <JoinCard label="Tipeá" />
      <p className="font-terminal absolute top-[380px] left-[340px] w-[1060px] bg-[#FBF5E7]/[0.07] px-8 py-6 text-[44px] leading-[1.3] break-all text-[#F5BB03]">
        {params.phrase}
      </p>
      <ol className="absolute top-[560px] left-[340px] grid w-[1060px] grid-cols-2 gap-x-[30px] gap-y-[10px]">
        {results.map((r, i) => (
          <m.li
            key={r.id}
            animate={{ opacity: 1, x: 0 }}
            className={`flex items-center justify-between px-5 py-3 ${i === 0 ? "bg-[#F5BB03] text-black" : "bg-[#FBF5E7]/[0.07]"}`}
            initial={{ opacity: 0, x: 30 }}
            layout
          >
            <span className="truncate text-[30px] font-bold">
              {i + 1}. {r.name || "Anónimo"}
            </span>
            <span className="font-terminal ml-4 text-[28px] tabular-nums">{(r.ms / 1000).toFixed(2)} s</span>
          </m.li>
        ))}
      </ol>
    </>
  );
}

// ---------------------------------------------------------------------------
// Story — one word per person
// ---------------------------------------------------------------------------

export function Story({ params, round }: SceneProps<"story">) {
  const { preview } = useContext(StageContext);
  const inputs = useInputs(round, !preview);
  const words = inputs.filter((i) => i.key === "story").map((i) => i.value.trim());

  return (
    <>
      <Ambient />
      <Header eyebrow={`Historia colectiva · ${words.length} palabras`} title="Una palabra cada uno" />
      <JoinCard label="Sumá una palabra" />
      <p className="absolute top-[380px] right-[500px] bottom-[60px] left-[340px] overflow-hidden text-[52px] leading-[1.3] font-semibold text-balance">
        <span className="text-[#F5BB03]">{params.opening} </span>
        {words.slice(-70).map((w, i, arr) => (
          <m.span
            key={`${i}-${w}`}
            animate={{ opacity: 1 }}
            className={i === arr.length - 1 ? "text-[#F5BB03]" : ""}
            initial={{ opacity: 0 }}
          >
            {w}{" "}
          </m.span>
        ))}
        <span className="animate-pulse text-[#0162C8]">▌</span>
      </p>
    </>
  );
}

// ---------------------------------------------------------------------------
// In person
// ---------------------------------------------------------------------------

export function Mirror({ params }: SceneProps<"mirror">) {
  const { preview } = useContext(StageContext);
  const { index, left } = useRotation(params.rounds, params.seconds, preview);
  const leaderIsA = index % 2 === 0;

  return (
    <>
      <Ambient />
      <Header eyebrow={`De a dos · ronda ${index + 1} de ${params.rounds}`} title="Espejo" />
      <div className="absolute top-[380px] left-[340px] flex w-[1100px] gap-[24px]">
        {["A", "B"].map((who, i) => {
          const leads = (i === 0) === leaderIsA;
          return (
            <m.div
              key={who}
              animate={{ scale: leads ? 1 : 0.95, opacity: leads ? 1 : 0.6 }}
              className={`flex flex-1 flex-col items-center py-10 ${leads ? "bg-[#F5BB03] text-black" : "bg-[#FBF5E7]/[0.07]"}`}
            >
              <span className="text-[120px] leading-none font-extrabold">{who}</span>
              <span className="mt-4 text-[40px] font-bold uppercase">{leads ? "Guía" : "Copia"}</span>
              <span className="mt-2 text-[26px] opacity-70">
                {leads ? "Movete despacio, cambiá de pose" : "Sé su reflejo, sin reírte"}
              </span>
            </m.div>
          );
        })}
      </div>
      <p className="absolute bottom-[90px] left-[340px] text-[32px] font-semibold text-[#FBF5E7]/60">
        Elegí quién es A y quién es B. Cuando cambia el color, cambian los roles.
      </p>
      <p className="countdown-font absolute right-[140px] bottom-[60px] text-[170px] leading-none text-[#F5BB03]">
        {left}
      </p>
    </>
  );
}

export function PaperPlanes({ params }: SceneProps<"paper-planes">) {
  const { preview } = useContext(StageContext);
  const steps = splitList(params.steps)
    .map((line) => {
      const at = line.lastIndexOf(":");
      const seconds = Number(line.slice(at + 1).trim());
      return at > 0 && seconds > 0 ? { text: line.slice(0, at).trim(), seconds } : null;
    })
    .filter((s): s is { text: string; seconds: number } => s !== null);
  const start = useRef(0);
  const [state, setState] = useState({ index: 0, left: steps[0]?.seconds ?? 0, done: false });
  useStageFrame((t) => {
    if (preview || !steps.length) return;
    if (!start.current) start.current = t;
    let elapsed = (t - start.current) / 1000;
    let index = 0;
    while (index < steps.length && elapsed >= steps[index].seconds) {
      elapsed -= steps[index].seconds;
      index++;
    }
    const done = index >= steps.length;
    const left = done ? 0 : Math.ceil(steps[index].seconds - elapsed);
    setState((s) => (s.index === index && s.left === left && s.done === done ? s : { index, left, done }));
  });
  const step = steps[Math.min(state.index, steps.length - 1)];

  return (
    <>
      <Ambient />
      <Header eyebrow={state.done ? "Listo" : `Paso ${state.index + 1} de ${steps.length}`} title="Aviones de papel" />
      <div className="absolute top-[380px] left-[340px] w-[1000px]">
        <AnimatePresence mode="wait">
          <m.p
            key={state.done ? "done" : state.index}
            animate={{ opacity: 1, y: 0 }}
            className="text-[80px] leading-[1.1] font-extrabold text-balance"
            exit={{ opacity: 0, y: -20 }}
            initial={{ opacity: 0, y: 30 }}
          >
            {state.done ? "Quien tenga un avión con una buena pregunta, que la lea." : step?.text}
          </m.p>
        </AnimatePresence>
      </div>
      {!state.done && (
        <p className="countdown-font absolute right-[140px] bottom-[60px] text-[220px] leading-none text-[#F5BB03]">
          {state.left}
        </p>
      )}
    </>
  );
}

export function HumanMap({ params }: SceneProps<"human-map">) {
  const { preview } = useContext(StageContext);
  const { left } = useRotation(1, params.seconds, preview);

  return (
    <>
      <Ambient />
      <Header eyebrow="La sala es Uruguay" title={params.prompt} />
      <div className="absolute top-[380px] left-[340px] grid w-[700px] grid-cols-3 grid-rows-3 place-items-center text-[32px] font-bold">
        <span />
        <span className="text-center">
          <span className="block text-[26px] tracking-[0.3em] text-[#F5BB03] uppercase">Norte</span>
          {params.north}
        </span>
        <span />
        <span className="text-center">
          <span className="block text-[26px] tracking-[0.3em] text-[#F5BB03] uppercase">Oeste</span>
          Río Uruguay
        </span>
        <span className="flex h-[200px] w-[200px] items-center justify-center rounded-full border-[6px] border-[#FBF5E7]/30 text-[90px]">
          🧭
        </span>
        <span className="text-center">
          <span className="block text-[26px] tracking-[0.3em] text-[#F5BB03] uppercase">Este</span>
          Rocha · Brasil
        </span>
        <span />
        <span className="text-center">
          <span className="block text-[26px] tracking-[0.3em] text-[#F5BB03] uppercase">Sur</span>
          {params.south} · Montevideo
        </span>
        <span />
      </div>
      <div className="absolute top-[400px] right-[140px] w-[560px] text-[30px] leading-[1.35] text-[#FBF5E7]/80">
        <p>1. Montevideo queda al sur, contra {params.south}.</p>
        <p className="mt-3">2. Salto y Paysandú al oeste, Rocha al este, Rivera y Artigas al norte.</p>
        <p className="mt-3">3. Quien no es de Uruguay, en la puerta: fuera del mapa.</p>
        <p className="mt-3">4. Cuando estén ubicados, miren alrededor: ahí está la comunidad.</p>
      </div>
      <p className="countdown-font absolute right-[140px] bottom-[60px] text-[170px] leading-none text-[#F5BB03]">
        {formatTime(left)}
      </p>
    </>
  );
}
