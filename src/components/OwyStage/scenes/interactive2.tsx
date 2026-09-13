"use client";

import { useContext, useMemo, useRef, useState } from "react";
import { AnimatePresence, m } from "motion/react";

import { EASE_OUT } from "app/conf/components/Reveal";
import type { SceneProps } from "lib/owy-stage/scenes";

import { tally, useInputs, usePlayUrl } from "../inputs";
import { Ambient, BRAND, StageContext, useStageFrame } from "../Stage";
import { QrCode } from "./parts";
import { Header, splitList } from "./service";

const COLORS = [BRAND.yellow, BRAND.blue, BRAND.cream];
export const GROUP_EMOJIS = ["🦁", "🐙", "🦜", "🐸", "🦋", "🐢", "🐺", "🦈", "🐝", "🦩"];

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

function useCountdown(seconds: number, preview: boolean) {
  const start = useRef(0);
  const [left, setLeft] = useState(seconds);
  useStageFrame((t) => {
    if (preview) return;
    if (!start.current) start.current = t;
    const remaining = Math.max(0, Math.ceil(seconds - (t - start.current) / 1000));
    setLeft((v) => (v === remaining ? v : remaining));
  });
  return left;
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

// ---------------------------------------------------------------------------
// Scale — 0 to 100, how much do you agree
// ---------------------------------------------------------------------------

export function Scale({ params, round }: SceneProps<"scale">) {
  const { preview } = useContext(StageContext);
  const inputs = useInputs(round, !preview);
  const values = inputs
    .filter((i) => i.key === "scale")
    .map((i) => Number(i.value))
    .filter((n) => n >= 0 && n <= 100);
  const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 50;
  const buckets = Array.from(
    { length: 10 },
    (_, b) => values.filter((v) => Math.min(9, Math.floor(v / 10)) === b).length
  );
  const max = Math.max(1, ...buckets);

  return (
    <>
      <Ambient />
      <Header eyebrow={`${values.length} respuestas`} title={params.statement} />
      <JoinCard label="Deslizá" />
      <div className="absolute top-[400px] left-[340px] w-[1060px]">
        <div className="flex h-[200px] items-end gap-[8px]">
          {buckets.map((n, b) => (
            <m.div
              key={b}
              animate={{ height: `${(n / max) * 100}%` }}
              className="flex-1 bg-[#0162C8]"
              initial={{ height: 0 }}
              style={{ minHeight: 6 }}
              transition={{ duration: 0.5 }}
            />
          ))}
        </div>
        <div className="relative mt-4 h-[36px] bg-[#FBF5E7]/[0.1]">
          <m.div
            animate={{ left: `${avg}%` }}
            className="absolute top-1/2 h-[80px] w-[14px] -translate-x-1/2 -translate-y-1/2 bg-[#F5BB03]"
            initial={{ left: "50%" }}
            transition={{ duration: 0.6, ease: EASE_OUT }}
          />
        </div>
        <div className="mt-6 flex items-start justify-between text-[34px] font-bold text-[#FBF5E7]/70">
          <span>{params.left}</span>
          <span className="text-[120px] leading-none font-extrabold text-[#F5BB03] tabular-nums">
            {values.length ? Math.round(avg) : "–"}
          </span>
          <span className="text-right">{params.right}</span>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Ranking — everyone orders the options; Borda count on the wall
// ---------------------------------------------------------------------------

export function Ranking({ params, round }: SceneProps<"ranking">) {
  const { preview } = useContext(StageContext);
  const inputs = useInputs(round, !preview);
  const options = splitList(params.options);
  const points = options.map(() => 0);
  let ballots = 0;
  for (const input of inputs) {
    if (input.key !== "rank") continue;
    const order = input.value.split(",").map(Number);
    if (order.length !== options.length) continue;
    ballots++;
    order.forEach((optionIndex, position) => {
      if (points[optionIndex] !== undefined) points[optionIndex] += options.length - position;
    });
  }
  const ranked = options.map((option, i) => ({ option, pts: points[i] })).sort((a, b) => b.pts - a.pts);
  const max = Math.max(1, ranked[0]?.pts ?? 1);

  return (
    <>
      <Ambient />
      <Header eyebrow={`Ranking · ${ballots} ${ballots === 1 ? "persona" : "personas"}`} title={params.question} />
      <JoinCard label="Ordená" />
      <ol className="absolute top-[380px] left-[340px] flex w-[1060px] flex-col gap-[14px]">
        {ranked.map(({ option, pts }, i) => (
          <m.li key={option} className="flex items-center gap-6" layout transition={{ duration: 0.5, ease: EASE_OUT }}>
            <span
              className={`w-[70px] text-[44px] font-extrabold tabular-nums ${i === 0 ? "text-[#F5BB03]" : "text-[#FBF5E7]/50"}`}
            >
              {i + 1}.
            </span>
            <span className="relative h-[70px] flex-1 overflow-hidden bg-[#FBF5E7]/[0.08]">
              <m.span
                animate={{ width: `${(pts / max) * 100}%` }}
                className={`absolute inset-y-0 left-0 ${i === 0 ? "bg-[#F5BB03]" : "bg-[#0162C8]"}`}
                initial={{ width: 0 }}
                transition={{ duration: 0.6 }}
              />
              <span
                className={`relative flex h-full items-center justify-between px-6 text-[36px] font-bold ${i === 0 ? "text-black" : ""}`}
              >
                {option}
                <span className="text-[26px] opacity-70">{pts} pts</span>
              </span>
            </span>
          </m.li>
        ))}
      </ol>
    </>
  );
}

// ---------------------------------------------------------------------------
// Wall — short messages as sticky notes
// ---------------------------------------------------------------------------

export function MessageWall({ params, round }: SceneProps<"wall">) {
  const { preview } = useContext(StageContext);
  const inputs = useInputs(round, !preview);
  const tilts = useMemo(() => Array.from({ length: 30 }, () => (Math.random() - 0.5) * 8), []);
  const messages = inputs
    .filter((i) => i.key === "msg")
    .slice(-12)
    .reverse();

  return (
    <>
      <Ambient />
      <Header eyebrow={`${inputs.filter((i) => i.key === "msg").length} mensajes`} title={params.prompt} />
      <JoinCard label="Dejá el tuyo" />
      <div className="absolute top-[340px] right-[500px] bottom-[60px] left-[340px] flex flex-wrap content-start gap-[18px]">
        {messages.length === 0 && (
          <p className="text-[44px] font-semibold text-[#FBF5E7]/40">El muro está vacío. Escribí algo.</p>
        )}
        <AnimatePresence>
          {messages.map((msg, i) => (
            <m.div
              key={msg.id}
              animate={{ opacity: 1, scale: 1, rotate: tilts[i % tilts.length] }}
              className="flex h-[190px] w-[250px] items-center p-5 text-center text-[24px] leading-[1.2] font-bold text-balance text-black shadow-[0_14px_30px_rgba(0,0,0,0.45)]"
              exit={{ opacity: 0, scale: 0.7 }}
              initial={{ opacity: 0, scale: 0.6, rotate: 0 }}
              layout
              style={{ background: COLORS[i % 3], color: i % 3 === 1 ? BRAND.cream : "#000" }}
              transition={{ duration: 0.45, ease: EASE_OUT }}
            >
              <span className="w-full">{msg.value}</span>
            </m.div>
          ))}
        </AnimatePresence>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Multi poll — pick everything that applies
// ---------------------------------------------------------------------------

export function MultiPoll({ params, round }: SceneProps<"multi-poll">) {
  const { preview } = useContext(StageContext);
  const inputs = useInputs(round, !preview);
  const options = splitList(params.options);
  const ballots = inputs.filter((i) => i.key === "multi");
  const counts = new Map<string, number>();
  for (const ballot of ballots)
    for (const pick of ballot.value.split("|")) counts.set(pick, (counts.get(pick) ?? 0) + 1);
  const max = Math.max(0, ...options.map((o) => counts.get(o) ?? 0));

  return (
    <>
      <Ambient />
      <Header eyebrow={`Elegí todas las que apliquen · ${ballots.length} personas`} title={params.question} />
      <JoinCard label="Marcá" />
      <div className="absolute top-[380px] left-[340px] flex w-[1060px] flex-col gap-[14px]">
        {options.map((option, i) => {
          const n = counts.get(option) ?? 0;
          const pct = ballots.length ? Math.round((n / ballots.length) * 100) : 0;
          return (
            <div key={option} className="flex items-center gap-6">
              <span
                className={`w-[420px] truncate text-[34px] font-bold ${n === max && n > 0 ? "text-[#F5BB03]" : ""}`}
              >
                {option}
              </span>
              <span className="h-[34px] flex-1 bg-[#FBF5E7]/[0.08]">
                <m.span
                  animate={{ width: `${pct}%` }}
                  className={`block h-full ${n === max && n > 0 ? "bg-[#F5BB03]" : "bg-[#0162C8]"}`}
                  initial={{ width: 0 }}
                  transition={{ duration: 0.6, delay: i * 0.04 }}
                />
              </span>
              <span className="w-[150px] text-right text-[32px] font-extrabold tabular-nums">
                {pct}% <span className="text-[22px] opacity-60">({n})</span>
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Origin — where people came from, as bubbles
// ---------------------------------------------------------------------------

export function Origin({ params, round }: SceneProps<"origin">) {
  const { preview } = useContext(StageContext);
  const inputs = useInputs(round, !preview);
  const counts = tally(inputs, "origin");
  const total = counts.reduce((sum, [, n]) => sum + n, 0);
  const max = counts[0]?.[1] ?? 1;

  return (
    <>
      <Ambient />
      <Header eyebrow={`${total} personas`} title={params.question} />
      <JoinCard label="Contá de dónde sos" />
      <div className="absolute top-[340px] right-[500px] bottom-[60px] left-[340px] flex flex-wrap content-center items-center justify-center gap-[18px]">
        {counts.length === 0 && <p className="text-[44px] font-semibold text-[#FBF5E7]/40">Esperando al primero…</p>}
        <AnimatePresence>
          {counts.map(([place, n], i) => {
            const size = 120 + (n / max) * 220;
            return (
              <m.div
                key={place}
                animate={{ opacity: 1, scale: 1, width: size, height: size }}
                className="flex flex-col items-center justify-center rounded-full text-center"
                exit={{ opacity: 0, scale: 0 }}
                initial={{ opacity: 0, scale: 0 }}
                layout
                style={{ background: COLORS[i % 3], color: i % 3 === 1 ? BRAND.cream : "#000" }}
                transition={{ duration: 0.5, ease: EASE_OUT }}
              >
                <span className="px-3 leading-[1.05] font-extrabold" style={{ fontSize: 16 + (n / max) * 22 }}>
                  {place}
                </span>
                <span className="font-bold tabular-nums" style={{ fontSize: 18 + (n / max) * 30 }}>
                  {n}
                </span>
              </m.div>
            );
          })}
        </AnimatePresence>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Presence — one tap per phone, one dot per person
// ---------------------------------------------------------------------------

export function Presence({ params, round }: SceneProps<"presence">) {
  const { preview } = useContext(StageContext);
  const inputs = useInputs(round, !preview);
  const here = inputs.filter((i) => i.key === "here");

  return (
    <>
      <Ambient />
      <Header eyebrow="Tocá ¡presente! en el celular" title={params.title} />
      <JoinCard label="¡Presente!" />
      <p className="absolute top-[300px] left-[340px] text-[300px] leading-none font-extrabold text-[#F5BB03] tabular-nums">
        {here.length}
      </p>
      <div className="absolute right-[500px] bottom-[70px] left-[340px] flex flex-wrap content-end gap-[8px]">
        <AnimatePresence>
          {here.map((person, i) => (
            <m.span
              key={person.id}
              animate={{ scale: 1, opacity: 1 }}
              className="h-[26px] w-[26px] rounded-full"
              initial={{ scale: 0, opacity: 0 }}
              style={{ background: COLORS[i % 3] }}
              transition={{ duration: 0.35, ease: EASE_OUT }}
            />
          ))}
        </AnimatePresence>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Signatures — everyone leaves their name
// ---------------------------------------------------------------------------

export function Signatures({ params, round }: SceneProps<"signatures">) {
  const { preview } = useContext(StageContext);
  const inputs = useInputs(round, !preview);
  const tilts = useMemo(() => Array.from({ length: 80 }, () => (Math.random() - 0.5) * 10), []);
  const names = inputs.filter((i) => i.key === "sign").slice(-70);

  return (
    <>
      <Ambient />
      <Header eyebrow={`${names.length} firmas`} title={params.title} />
      <JoinCard label="Firmá" />
      <div className="absolute top-[330px] right-[500px] bottom-[60px] left-[340px] flex flex-wrap content-start items-center gap-x-[26px] gap-y-[6px]">
        <AnimatePresence>
          {names.map((n, i) => (
            <m.span
              key={n.id}
              animate={{ opacity: 1, y: 0, rotate: tilts[i % tilts.length] }}
              className="text-[40px] leading-[1.1] font-extrabold italic"
              initial={{ opacity: 0, y: 20 }}
              style={{ color: COLORS[i % 3] }}
              transition={{ duration: 0.4, ease: EASE_OUT }}
            >
              {n.value}
            </m.span>
          ))}
        </AnimatePresence>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Pairs — random groups handed out by the phones
// ---------------------------------------------------------------------------

export function Pairs({ params, round }: SceneProps<"pairs">) {
  const { preview } = useContext(StageContext);
  const inputs = useInputs(round, !preview);
  const groups = GROUP_EMOJIS.slice(0, params.groups);
  const counts = new Map(tally(inputs, "group"));

  return (
    <>
      <Ambient />
      <Header eyebrow={`${params.groups} grupos al azar`} title={params.title} />
      <JoinCard label="Dame mi grupo" />
      <div className="absolute top-[360px] left-[340px] grid w-[1060px] grid-cols-5 gap-[14px]">
        {groups.map((emoji) => (
          <div key={emoji} className="flex flex-col items-center bg-[#FBF5E7]/[0.07] py-5">
            <span className="text-[80px] leading-none">{emoji}</span>
            <span className="mt-2 text-[34px] font-extrabold tabular-nums">{counts.get(emoji) ?? 0}</span>
          </div>
        ))}
      </div>
      <p className="absolute bottom-[90px] left-[340px] w-[1060px] text-[38px] leading-[1.25] font-semibold text-balance text-[#FBF5E7]/70">
        {params.instruction}
      </p>
    </>
  );
}

// ---------------------------------------------------------------------------
// Tap race — two halves of the room, who taps more
// ---------------------------------------------------------------------------

export function TapRace({ params, round }: SceneProps<"tap-race">) {
  const { preview } = useContext(StageContext);
  const inputs = useInputs(round, !preview);
  const left = useCountdown(params.seconds, preview);
  const sum = (team: string) =>
    inputs.filter((i) => i.key === `taps:${team}`).reduce((acc, i) => acc + (Number(i.value) || 0), 0);
  const a = sum("a");
  const b = sum("b");
  const total = Math.max(1, a + b);
  const done = !preview && left === 0;

  return (
    <>
      <Ambient />
      <Header eyebrow={done ? "Fin" : `Tocá lo más rápido que puedas · ${left}s`} title={params.title} />
      <JoinCard label="Tocá" />
      <div className="absolute top-[380px] left-[340px] w-[1060px]">
        <div className="flex justify-between text-[44px] font-extrabold">
          <span className="text-[#F5BB03]">
            {params.left} · {a}
          </span>
          <span className="text-[#0162C8]">
            {b} · {params.right}
          </span>
        </div>
        <div className="mt-4 flex h-[90px] overflow-hidden bg-[#FBF5E7]/[0.08]">
          <m.div animate={{ width: `${(a / total) * 100}%` }} className="bg-[#F5BB03]" transition={{ duration: 0.3 }} />
          <m.div
            animate={{ width: `${(b / total) * 100}%` }}
            className="ml-auto bg-[#0162C8]"
            transition={{ duration: 0.3 }}
          />
        </div>
        {done && (
          <p className="mt-10 text-[110px] leading-none font-extrabold uppercase">
            {a === b ? "¡Empate!" : `¡Ganó ${a > b ? params.left : params.right}!`}
          </p>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// In person
// ---------------------------------------------------------------------------

export function Stretch({ params }: SceneProps<"stretch">) {
  const { preview } = useContext(StageContext);
  const moves = splitList(params.moves);
  const { index, left } = useRotation(moves.length, params.seconds, preview);
  const move = moves[index] ?? "";
  const emoji = move.match(/^\p{Extended_Pictographic}/u)?.[0] ?? "🙆";

  return (
    <>
      <Ambient />
      <Header eyebrow={`Pausa activa · ${index + 1} / ${moves.length}`} title="Estirá un poco" />
      <div className="absolute top-[360px] left-[340px] flex w-[1100px] items-center gap-[60px]">
        <AnimatePresence mode="wait">
          <m.span
            key={index}
            animate={{ scale: [0.8, 1.1, 1], opacity: 1 }}
            className="text-[260px] leading-none"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          >
            {emoji}
          </m.span>
        </AnimatePresence>
        <AnimatePresence mode="wait">
          <m.p
            key={index}
            animate={{ opacity: 1, x: 0 }}
            className="text-[72px] leading-[1.1] font-extrabold text-balance"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0, x: 30 }}
          >
            {move.replace(/^\p{Extended_Pictographic}\s*/u, "")}
          </m.p>
        </AnimatePresence>
      </div>
      <div className="absolute right-[140px] bottom-[90px] flex items-center gap-6">
        {moves.map((_, i) => (
          <span
            key={i}
            className={`h-[18px] w-[18px] rounded-full ${i === index ? "bg-[#F5BB03]" : i < index ? "bg-[#FBF5E7]/60" : "bg-[#FBF5E7]/20"}`}
          />
        ))}
        <span className="countdown-font ml-6 text-[160px] leading-none text-[#F5BB03]">{left}</span>
      </div>
    </>
  );
}

export function Clap({ params }: SceneProps<"clap">) {
  const { preview } = useContext(StageContext);
  const start = useRef(0);
  const [state, setState] = useState({ beat: 0, round: 0, done: false });
  useStageFrame((t) => {
    if (preview) return;
    if (!start.current) start.current = t;
    const elapsed = (t - start.current) / 1000;
    let acc = 0;
    let round = 0;
    let beat = 0;
    while (round < params.rounds) {
      const bpm = params.bpm + round * params.step;
      const roundLength = (params.beats * 60) / bpm;
      if (elapsed < acc + roundLength) {
        beat = Math.floor(((elapsed - acc) / roundLength) * params.beats);
        break;
      }
      acc += roundLength;
      round++;
    }
    const done = round >= params.rounds;
    setState((s) => (s.beat === beat && s.round === round && s.done === done ? s : { beat, round, done }));
  });
  const bpm = params.bpm + Math.min(state.round, params.rounds - 1) * params.step;

  return (
    <div className="absolute inset-0 bg-black">
      <p className="absolute inset-x-0 top-[80px] text-center text-[34px] font-semibold tracking-[0.3em] text-[#F5BB03] uppercase">
        {state.done
          ? "¡Eso fue un aplauso!"
          : `Aplauso sincronizado · ${bpm} bpm · vuelta ${state.round + 1} de ${params.rounds}`}
      </p>
      <div className="absolute inset-0 flex items-center justify-center gap-[40px]">
        {Array.from({ length: params.beats }, (_, i) => (
          <m.div
            key={i}
            animate={{
              scale: !state.done && i === state.beat ? 1.35 : 1,
              background:
                !state.done && i === state.beat ? BRAND.yellow : i === 0 ? BRAND.blue : "rgba(251,245,231,0.18)",
            }}
            className="h-[140px] w-[140px] rounded-full"
            transition={{ duration: 0.08 }}
          />
        ))}
      </div>
      <p className="absolute inset-x-0 bottom-[110px] text-center text-[64px] font-extrabold text-balance uppercase">
        {state.done ? "Aplausos para ustedes" : "Aplaudí cuando se prende el círculo · el azul marca el uno"}
      </p>
    </div>
  );
}

export function Columns({ params }: SceneProps<"columns">) {
  const { preview } = useContext(StageContext);
  const prompts = splitList(params.prompts)
    .map((line) => {
      const at = line.indexOf(":");
      if (at < 0) return null;
      return {
        question: line.slice(0, at).trim(),
        options: line
          .slice(at + 1)
          .split(",")
          .map((o) => o.trim())
          .filter(Boolean),
      };
    })
    .filter((p): p is { question: string; options: string[] } => p !== null && p.options.length > 1);
  const { index, left } = useRotation(prompts.length, params.seconds, preview);
  const prompt = prompts[index];

  return (
    <div className="absolute inset-0 bg-black">
      <div className="absolute inset-x-0 top-[70px] text-center">
        <p className="text-[30px] font-semibold tracking-[0.3em] text-[#F5BB03] uppercase">
          Gráfico humano · pará en tu columna
        </p>
        <AnimatePresence mode="wait">
          <m.p
            key={index}
            animate={{ opacity: 1 }}
            className="mt-4 text-[80px] leading-[1.05] font-extrabold text-balance"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
          >
            {prompt?.question}
          </m.p>
        </AnimatePresence>
      </div>
      <div className="absolute inset-x-[80px] top-[330px] bottom-[200px] flex gap-[16px]">
        {prompt?.options.map((option, i) => (
          <m.div
            key={`${index}-${option}`}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-1 flex-col items-center justify-end pb-8"
            initial={{ opacity: 0, y: 30 }}
            style={{ background: COLORS[i % 3], color: i % 3 === 1 ? BRAND.cream : "#000" }}
            transition={{ duration: 0.4, delay: i * 0.08 }}
          >
            <span className="text-[30px] font-bold opacity-60">columna {i + 1}</span>
            <span className="px-4 text-center text-[54px] leading-[1.05] font-extrabold text-balance">{option}</span>
          </m.div>
        ))}
      </div>
      <p className="absolute bottom-[60px] left-[80px] text-[34px] font-semibold text-[#FBF5E7]/60">
        Izquierda de la pantalla = izquierda de la sala. Después miren la forma del gráfico.
      </p>
      <span className="countdown-font absolute right-[80px] bottom-[40px] text-[150px] leading-none text-[#F5BB03]">
        {left}
      </span>
    </div>
  );
}
