"use client";

import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, m } from "motion/react";

import { EASE_OUT } from "app/conf/components/Reveal";
import type { SceneProps } from "lib/owy-stage/scenes";
import { roomColorFor } from "lib/rooms/palette";
import { formatTime } from "lib/utils";

import { Confetti } from "../effects";
import { tally, useInputs, useInputsWithStatus, usePlayUrl } from "../inputs";
import { Ambient, BRAND, StageContext, useStageFrame } from "../Stage";
import { QrCode } from "./parts";
import { Header, splitList } from "./service";
import { EmptyText, useBoard } from "./useful";

export const REACTION_EMOJIS = ["👏", "🔥", "❤️", "😂", "🤯", "🧉"];

/** The "scan to play" card every phone-driven scene shows in the same corner. */
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

/** Seconds since the scene was taken, counting from the first frame. */
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

function Bar({
  label,
  n,
  total,
  i,
  lead,
  color,
  compact = false,
}: {
  label: string;
  n: number;
  total: number;
  i: number;
  lead: boolean;
  color?: string;
  compact?: boolean;
}) {
  const pct = total ? Math.round((n / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-end justify-between gap-6 px-2">
        <span
          className={`${compact ? "truncate text-[32px]" : "text-[44px]"} leading-[1.1] font-bold ${lead ? "text-[#F5BB03]" : ""}`}
        >
          {label}
        </span>
        <span className={`shrink-0 ${compact ? "text-[32px]" : "text-[44px]"} font-extrabold tabular-nums`}>
          {pct}% <span className="text-[24px] font-medium opacity-60">({n})</span>
        </span>
      </div>
      <div className={`mt-2 ${compact ? "h-[26px]" : "h-[40px]"} bg-[#FBF5E7]/[0.08]`}>
        <m.div
          animate={{ width: `${Math.max(1, pct)}%` }}
          className="h-full"
          initial={{ width: 0 }}
          style={{ background: color ?? (lead ? BRAND.yellow : BRAND.blue) }}
          transition={{ duration: 0.8, delay: i * 0.05, ease: EASE_OUT }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Live poll
// ---------------------------------------------------------------------------

export function LivePoll({ params, round }: SceneProps<"live-poll">) {
  const { preview } = useContext(StageContext);
  const inputs = useInputs(round, !preview);
  const options = splitList(params.options);
  const counts = new Map(tally(inputs, "vote"));
  const total = options.reduce((sum, option) => sum + (counts.get(option) ?? 0), 0);
  const max = Math.max(0, ...options.map((option) => counts.get(option) ?? 0));

  return (
    <>
      <Ambient />
      <Header eyebrow={`Encuesta en vivo · ${total} votos`} title={params.question} />
      <JoinCard label="Votá" />
      <div className="absolute top-[380px] left-[340px] flex w-[1060px] flex-col gap-[20px]">
        {options.map((option, i) => {
          const n = counts.get(option) ?? 0;
          return <Bar key={option} i={i} label={option} lead={n === max && n > 0} n={n} total={total} />;
        })}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Word cloud, live
// ---------------------------------------------------------------------------

const CLOUD_COLORS = [BRAND.yellow, BRAND.cream, BRAND.blue];

export function LiveWordCloud({ params, round }: SceneProps<"word-cloud">) {
  const { preview } = useContext(StageContext);
  const inputs = useInputs(round, !preview);
  const tilts = useMemo(() => Array.from({ length: 60 }, () => (Math.random() - 0.5) * 12), []);
  const words = tally(
    inputs.map((i) => ({ ...i, value: i.value.toLowerCase() })),
    "word"
  ).slice(0, 45);
  const max = words[0]?.[1] ?? 1;

  return (
    <>
      <Ambient />
      <Header eyebrow={`${inputs.length} palabras`} title={params.prompt} />
      <JoinCard label="Mandá la tuya" />
      <div className="absolute top-[330px] right-[500px] bottom-[120px] left-[340px] flex flex-wrap content-center items-center justify-center gap-x-[28px] gap-y-[4px]">
        {words.length === 0 && (
          <p className="text-[48px] font-semibold text-[#FBF5E7]/40">Esperando la primera palabra…</p>
        )}
        <AnimatePresence>
          {words.map(([word, n], i) => (
            <m.span
              key={word}
              animate={{ opacity: 1, scale: 1, rotate: tilts[i % tilts.length] }}
              className="leading-[1.1] font-extrabold"
              exit={{ opacity: 0, scale: 0.5 }}
              initial={{ opacity: 0, scale: 0.3 }}
              layout
              style={{ fontSize: 32 + (n / max) * 88, color: CLOUD_COLORS[i % 3] }}
              transition={{ duration: 0.5, ease: EASE_OUT }}
            >
              {word}
            </m.span>
          ))}
        </AnimatePresence>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Live questions with upvotes
// ---------------------------------------------------------------------------

export function LiveQuestions({ params, round }: SceneProps<"live-questions">) {
  const { preview } = useContext(StageContext);
  const inputs = useInputs(round, !preview);
  const votes = new Map<string, number>();
  for (const input of inputs)
    if (input.key.startsWith("up:")) votes.set(input.key.slice(3), (votes.get(input.key.slice(3)) ?? 0) + 1);
  const questions = inputs
    .filter((i) => i.key === "question")
    .map((q) => ({ ...q, votes: votes.get(q.id) ?? 0 }))
    .sort((a, b) => b.votes - a.votes || a.createdAt.localeCompare(b.createdAt))
    .slice(0, 6);

  return (
    <>
      <Ambient />
      <Header eyebrow={`${inputs.filter((i) => i.key === "question").length} preguntas`} title={params.title} />
      <JoinCard label="Preguntá y votá" />
      <ul className="absolute top-[380px] left-[340px] flex w-[1060px] flex-col gap-[16px]">
        {questions.length === 0 && (
          <li className="text-[44px] font-semibold text-[#FBF5E7]/40">
            Todavía no hay preguntas. Sé la primera persona.
          </li>
        )}
        <AnimatePresence>
          {questions.map((q, i) => (
            <m.li
              key={q.id}
              animate={{ opacity: 1, x: 0 }}
              className={`flex items-center gap-7 px-7 py-5 ${i === 0 && q.votes > 0 ? "bg-[#F5BB03] text-black" : "bg-[#FBF5E7]/[0.07]"}`}
              exit={{ opacity: 0 }}
              initial={{ opacity: 0, x: 30 }}
              layout
              transition={{ duration: 0.4, ease: EASE_OUT }}
            >
              <span className="flex h-[76px] w-[96px] shrink-0 flex-col items-center justify-center bg-black/20 text-[34px] leading-none font-extrabold tabular-nums">
                ▲<span className="mt-1 text-[26px]">{q.votes}</span>
              </span>
              <span className="line-clamp-2 text-[36px] leading-[1.15] font-semibold text-balance">{q.value}</span>
            </m.li>
          ))}
        </AnimatePresence>
      </ul>
    </>
  );
}

// ---------------------------------------------------------------------------
// Reactions — emojis float up as they arrive
// ---------------------------------------------------------------------------

type Floater = { id: string; emoji: string; x: number };

export function Reactions({ params, round }: SceneProps<"reactions">) {
  const { preview } = useContext(StageContext);
  const { inputs, loaded } = useInputsWithStatus(round, !preview);
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const seen = useRef<Set<string> | null>(null);

  // Animate only what arrives after the backlog loaded; the backlog just feeds the counters.
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
      ...fresh.map((i) => ({ id: i.id, emoji: i.value, x: 360 + Math.random() * 1000 })),
    ]);
  }, [inputs, loaded]);

  const counts = new Map(tally(inputs, "reaction"));

  return (
    <>
      <Ambient />
      <Header eyebrow="Reacciones en vivo" title={params.title} />
      <JoinCard label="Reaccioná" />
      <div className="absolute bottom-[90px] left-[340px] flex gap-[24px]">
        {REACTION_EMOJIS.map((emoji) => (
          <div key={emoji} className="flex w-[150px] flex-col items-center bg-[#FBF5E7]/[0.07] py-5">
            <span className="text-[64px] leading-none">{emoji}</span>
            <span className="mt-2 text-[34px] font-extrabold tabular-nums">{counts.get(emoji) ?? 0}</span>
          </div>
        ))}
      </div>
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <AnimatePresence>
          {floaters.map((f) => (
            <m.span
              key={f.id}
              animate={{ y: -900, opacity: [0, 1, 1, 0], x: [0, 30, -30, 0] }}
              className="absolute bottom-[240px] text-[110px] leading-none"
              initial={{ y: 0, opacity: 0 }}
              onAnimationComplete={() => setFloaters((list) => list.filter((g) => g.id !== f.id))}
              style={{ left: f.x }}
              transition={{ duration: 3.2, ease: "easeOut", times: [0, 0.1, 0.8, 1] }}
            >
              {f.emoji}
            </m.span>
          ))}
        </AnimatePresence>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Quiz — answer on the phone, reveal on the wall
// ---------------------------------------------------------------------------

const LETTERS = ["A", "B", "C", "D"] as const;

export function Quiz({ params, round }: SceneProps<"quiz">) {
  const { preview } = useContext(StageContext);
  const inputs = useInputs(round, !preview);
  const left = useCountdown(params.seconds, preview);
  const options = [params.a, params.b, params.c, params.d];
  const answer = LETTERS.indexOf(params.answer.trim().toUpperCase() as (typeof LETTERS)[number]);
  const counts = new Map(tally(inputs, "answer"));
  const total = LETTERS.reduce((sum, letter) => sum + (counts.get(letter) ?? 0), 0);
  const revealed = preview || left === 0;
  const right = counts.get(LETTERS[answer]) ?? 0;

  return (
    <>
      <Ambient />
      <Header
        eyebrow={revealed ? `${right} de ${total} acertaron` : `Quiz · ${total} respuestas`}
        title={params.question}
      />
      {!revealed ? (
        <JoinCard label="Respondé" />
      ) : (
        <p className="countdown-font absolute top-[110px] right-[140px] flex h-[260px] w-[260px] items-center justify-center rounded-full bg-black text-[170px] leading-none text-[#F5BB03] ring-[10px] ring-[#FBF5E7]">
          {LETTERS[answer] ?? "?"}
        </p>
      )}
      {!revealed && (
        <p className="countdown-font absolute right-[140px] bottom-[80px] text-[120px] leading-none text-[#F5BB03]">
          {left}
        </p>
      )}
      <div className="absolute top-[380px] left-[340px] grid w-[1060px] grid-cols-2 gap-[20px]">
        {options.map((option, i) => {
          const n = counts.get(LETTERS[i]) ?? 0;
          const correct = revealed && i === answer;
          const pct = total ? Math.round((n / total) * 100) : 0;
          return (
            <m.div
              key={`${i}-${option}`}
              animate={{ opacity: revealed && !correct ? 0.35 : 1 }}
              className={`relative min-h-[170px] overflow-hidden px-7 py-5 ${correct ? "bg-[#F5BB03] text-black" : "bg-[#FBF5E7]/[0.07]"}`}
            >
              {revealed && !correct && (
                <div className="absolute inset-y-0 left-0 bg-[#0162C8]/50" style={{ width: `${pct}%` }} />
              )}
              <div className="relative flex items-center gap-6">
                <span
                  className={`flex h-[80px] w-[80px] shrink-0 items-center justify-center rounded-full text-[40px] font-extrabold ${correct ? "bg-black text-[#F5BB03]" : "bg-[#0162C8]"}`}
                >
                  {LETTERS[i]}
                </span>
                <span className="text-[40px] leading-[1.1] font-bold text-balance">{option}</span>
              </div>
              {revealed && (
                <p className="relative mt-3 text-[30px] font-bold tabular-nums opacity-80">
                  {pct}% · {n}
                </p>
              )}
            </m.div>
          );
        })}
      </div>
      {revealed && !preview && right > 0 && (
        <div className="pointer-events-none absolute inset-0">
          <Confetti />
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Rating — stars from the phones
// ---------------------------------------------------------------------------

export function Rating({ params, round }: SceneProps<"rating">) {
  const { preview } = useContext(StageContext);
  const inputs = useInputs(round, !preview);
  const ratings = inputs
    .filter((i) => i.key === "rating")
    .map((i) => Number(i.value))
    .filter((n) => n >= 1 && n <= 5);
  const avg = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;
  const hist = [5, 4, 3, 2, 1].map((star) => ({ star, n: ratings.filter((r) => r === star).length }));
  const max = Math.max(1, ...hist.map((h) => h.n));

  return (
    <>
      <Ambient />
      <Header eyebrow={`${ratings.length} votos`} title={params.title} />
      <JoinCard label="Puntuá" />
      <div className="absolute top-[380px] left-[340px]">
        <p className="text-[200px] leading-none font-extrabold tabular-nums">
          {ratings.length ? avg.toFixed(1) : "–"}
          <span className="text-[60px] text-[#FBF5E7]/50"> / 5</span>
        </p>
        <p className="mt-2 text-[90px] leading-none">
          {[1, 2, 3, 4, 5].map((s) => (
            <span key={s} className={s <= Math.round(avg) ? "text-[#F5BB03]" : "text-[#FBF5E7]/20"}>
              ★
            </span>
          ))}
        </p>
      </div>
      <div className="absolute top-[410px] left-[1000px] flex w-[400px] flex-col gap-[12px]">
        {hist.map((h) => (
          <div key={h.star} className="flex items-center gap-4">
            <span className="w-[60px] text-[30px] font-bold tabular-nums">{h.star}★</span>
            <div className="h-[30px] flex-1 bg-[#FBF5E7]/[0.08]">
              <m.div
                animate={{ width: `${(h.n / max) * 100}%` }}
                className="h-full bg-[#0162C8]"
                initial={{ width: 0 }}
                transition={{ duration: 0.6 }}
              />
            </div>
            <span className="w-[60px] text-[26px] tabular-nums opacity-60">{h.n}</span>
          </div>
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Guess the number
// ---------------------------------------------------------------------------

export function Guess({ params, round }: SceneProps<"guess">) {
  const { preview } = useContext(StageContext);
  const inputs = useInputs(round, !preview);
  const left = useCountdown(params.seconds, preview);
  const guesses = inputs
    .filter((i) => i.key === "guess")
    .map((i) => Number(i.value))
    .filter((n) => Number.isFinite(n));
  const revealed = preview || left === 0;
  const sorted = [...guesses].sort((a, b) => Math.abs(a - params.answer) - Math.abs(b - params.answer));
  const best = sorted[0];
  const median = guesses.length ? [...guesses].sort((a, b) => a - b)[Math.floor(guesses.length / 2)] : null;

  return (
    <>
      <Ambient />
      <Header eyebrow={`${guesses.length} respuestas${revealed ? " · cerrado" : ""}`} title={params.question} />
      {!revealed && <JoinCard label="Mandá tu número" />}
      <div className="absolute top-[380px] left-[340px] w-[1000px]">
        {revealed ? (
          <>
            <p className="text-[30px] font-bold tracking-[0.3em] text-[#F5BB03] uppercase">La respuesta era</p>
            <p className="text-[260px] leading-none font-extrabold tabular-nums">{params.answer}</p>
            {best !== undefined && (
              <p className="mt-4 text-[44px] font-semibold">
                Más cerca: <span className="text-[#F5BB03]">{best}</span> (a {Math.abs(best - params.answer)}) ·{" "}
                {sorted.filter((g) => g === best).length}{" "}
                {sorted.filter((g) => g === best).length === 1 ? "persona" : "personas"}
              </p>
            )}
          </>
        ) : (
          <>
            <p className="text-[30px] font-bold tracking-[0.3em] text-[#F5BB03] uppercase">Se cierra en</p>
            <p className="countdown-font text-[260px] leading-none text-[#FBF5E7]">{formatTime(left)}</p>
            {median !== null && (
              <p className="text-[40px] font-semibold text-[#FBF5E7]/60">La sala va diciendo… {median}</p>
            )}
          </>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Buzzer — first press wins
// ---------------------------------------------------------------------------

export function Buzzer({ params, round }: SceneProps<"buzzer">) {
  const { preview } = useContext(StageContext);
  const inputs = useInputs(round, !preview);
  const left = useCountdown(3, preview);
  const armed = preview || left === 0;
  const presses = inputs
    .filter((i) => i.key === "buzz")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(0, 5);
  const first = presses[0] ? new Date(presses[0].createdAt).getTime() : 0;

  return (
    <>
      <Ambient />
      <Header
        eyebrow={
          armed ? `${presses.length ? inputs.filter((i) => i.key === "buzz").length : 0} apretaron` : "Preparados…"
        }
        title={params.title}
      />
      <JoinCard label="Apretá primero" />
      <div className="absolute top-[380px] left-[340px] w-[1000px]">
        {!armed ? (
          <p className="countdown-font text-[300px] leading-none text-[#F5BB03]">{left}</p>
        ) : presses.length === 0 ? (
          <p className="text-[200px] leading-none font-extrabold text-[#F5BB03] uppercase">¡Ya!</p>
        ) : (
          <ol className="flex flex-col gap-[14px]">
            <AnimatePresence>
              {presses.map((p, i) => (
                <m.li
                  key={p.id}
                  animate={{ opacity: 1, x: 0 }}
                  className={`flex items-center gap-7 px-7 py-4 ${i === 0 ? "bg-[#F5BB03] text-black" : "bg-[#FBF5E7]/[0.07]"}`}
                  initial={{ opacity: 0, x: 40 }}
                  layout
                >
                  <span className="w-[70px] text-[44px] font-extrabold tabular-nums">{i + 1}.</span>
                  <span className="flex-1 truncate text-[46px] font-bold">{p.value}</span>
                  <span className="font-terminal text-[32px] tabular-nums opacity-70">
                    {i === 0 ? "primero" : `+${((new Date(p.createdAt).getTime() - first) / 1000).toFixed(2)} s`}
                  </span>
                </m.li>
              ))}
            </AnimatePresence>
          </ol>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Session vote — the board's sessions, voted from the phones
// ---------------------------------------------------------------------------

export function SessionVote({ params, round, eventId }: SceneProps<"session-vote">) {
  const { preview } = useContext(StageContext);
  const inputs = useInputs(round, !preview);
  const data = useBoard(eventId, preview);
  if (!eventId) return <EmptyText text="Elegí un evento en el admin" />;
  if (!data) return null;
  // One row per person, holding up to `max` picks separated by |.
  const counts = new Map<string, number>();
  for (const input of inputs)
    if (input.key === "session") for (const id of input.value.split("|")) counts.set(id, (counts.get(id) ?? 0) + 1);
  const total = inputs.filter((i) => i.key === "session").length;
  const ranked = [...data.tracks]
    .map((track) => ({ track, n: counts.get(track.id) ?? 0 }))
    .sort((a, b) => b.n - a.n || a.track.title.localeCompare(b.track.title))
    .slice(0, 6);
  const max = ranked[0]?.n ?? 0;

  return (
    <>
      <Ambient />
      <Header eyebrow={`${total} personas · hasta ${params.max} por persona`} title={params.title} />
      <JoinCard label="Votá tu sesión" />
      <div className="absolute top-[380px] left-[340px] flex w-[1060px] flex-col gap-[14px]">
        {ranked.map(({ track, n }, i) => (
          <Bar
            key={track.id}
            color={roomColorFor(track.roomId, track.roomColor)}
            compact
            i={i}
            label={`${track.title}${track.speaker ? ` · ${track.speaker}` : ""}`}
            lead={n === max && n > 0}
            n={n}
            total={total}
          />
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// In person — the wall runs the dynamic, people move
// ---------------------------------------------------------------------------

/** Cycles through `items` every `seconds`, with a countdown for the current one. */
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

function BigCountdown({ left, className = "" }: { left: number; className?: string }) {
  return <p className={`countdown-font text-[200px] leading-none tracking-wider ${className}`}>{left}</p>;
}

export function StandUp({ params }: SceneProps<"stand-up">) {
  const { preview } = useContext(StageContext);
  const statements = splitList(params.statements);
  const { index, left } = useRotation(statements.length, params.seconds, preview);
  const statement = statements[index] ?? "";

  return (
    <>
      <Ambient />
      <Header eyebrow={`${index + 1} / ${statements.length}`} title="Levantate si…" />
      <div className="absolute top-[380px] right-[420px] left-[340px]">
        <AnimatePresence mode="wait">
          <m.p
            key={index}
            animate={{ opacity: 1, y: 0 }}
            className="text-[110px] leading-[1.02] font-extrabold tracking-[-0.02em] text-balance"
            exit={{ opacity: 0, y: -30, transition: { duration: 0.25 } }}
            initial={{ opacity: 0, y: 40 }}
            transition={{ duration: 0.5, ease: EASE_OUT }}
          >
            {statement}
          </m.p>
        </AnimatePresence>
        <p className="mt-10 text-[36px] font-semibold text-[#FBF5E7]/60">
          Si te describe, de pie. Mirá quién más se paró.
        </p>
      </div>
      <div className="absolute right-[140px] bottom-[90px]">
        <BigCountdown className="text-[#F5BB03]" left={left} />
      </div>
    </>
  );
}

export function Corners({ params }: SceneProps<"corners">) {
  const { preview } = useContext(StageContext);
  const pairs = splitList(params.pairs)
    .map((pair) => pair.split(/\s+vs\.?\s+/i))
    .filter((p) => p.length === 2);
  const { index, left } = useRotation(pairs.length, params.seconds, preview);
  const [a, b] = pairs[index] ?? ["", ""];

  return (
    <>
      <AnimatePresence mode="wait">
        <m.div
          key={index}
          animate={{ opacity: 1 }}
          className="absolute inset-0"
          exit={{ opacity: 0 }}
          initial={{ opacity: 0 }}
        >
          <div className="absolute inset-y-0 left-0 flex w-1/2 flex-col items-center justify-center bg-[#F5BB03] px-[80px] text-center text-black">
            <p className="text-[40px] font-bold tracking-[0.3em] uppercase opacity-70">← Este lado</p>
            <p className="mt-6 text-[140px] leading-[0.95] font-extrabold tracking-[-0.03em] text-balance uppercase">
              {a}
            </p>
          </div>
          <div className="absolute inset-y-0 right-0 flex w-1/2 flex-col items-center justify-center bg-[#0162C8] px-[80px] text-center text-[#FBF5E7]">
            <p className="text-[40px] font-bold tracking-[0.3em] uppercase opacity-70">Este lado →</p>
            <p className="mt-6 text-[140px] leading-[0.95] font-extrabold tracking-[-0.03em] text-balance uppercase">
              {b}
            </p>
          </div>
        </m.div>
      </AnimatePresence>
      <div className="absolute inset-x-0 top-[60px] text-center">
        <span className="inline-block bg-black px-10 py-4 text-[36px] font-semibold tracking-[0.2em] text-[#FBF5E7] uppercase">
          Caminá hacia tu respuesta · {index + 1} / {pairs.length}
        </span>
      </div>
      <div className="absolute inset-x-0 bottom-[50px] flex justify-center">
        <span className="countdown-font bg-black px-10 py-2 text-[150px] leading-none text-[#FBF5E7]">{left}</span>
      </div>
    </>
  );
}

export function Rps({ params }: SceneProps<"rps">) {
  const { preview } = useContext(StageContext);
  const { index, left } = useRotation(params.rounds + 1, params.seconds, preview);
  const done = index === params.rounds;
  const players = Math.max(1, Math.round(200 / Math.pow(2, index)));

  return (
    <>
      <Ambient />
      <Header eyebrow={done ? "Final" : `Ronda ${index + 1} de ${params.rounds}`} title="Piedra, papel o tijera" />
      <div className="absolute top-[380px] left-[340px] w-[1000px]">
        {done ? (
          <p className="text-[120px] leading-[1] font-extrabold text-[#F5BB03] uppercase">¡Campeón/a al escenario!</p>
        ) : (
          <>
            <p className="text-[96px] leading-none">✊ ✋ ✌️</p>
            <p className="mt-8 text-[64px] leading-[1.1] font-extrabold text-balance">
              {index === 0 ? "Buscá un rival y jueguen al mejor de uno." : "Quien ganó busca a otra persona que ganó."}
            </p>
            <p className="mt-6 text-[40px] font-semibold text-[#FBF5E7]/70">
              Si perdiste, seguí a quien te ganó y alentalo a los gritos. Quedan ~{players} en juego.
            </p>
          </>
        )}
      </div>
      {!done && (
        <div className="absolute right-[140px] bottom-[90px]">
          <BigCountdown className="text-[#F5BB03]" left={left} />
        </div>
      )}
    </>
  );
}

export function HumanBingo({ params }: SceneProps<"human-bingo">) {
  const { preview } = useContext(StageContext);
  const traits = splitList(params.traits).slice(0, 9);
  const left = useCountdown(params.minutes * 60, preview);

  return (
    <>
      <Ambient />
      <Header eyebrow="Encontrá a alguien que…" title="Bingo humano" />
      <div className="absolute top-[300px] left-[340px] grid w-[960px] grid-cols-3 gap-[12px]">
        {traits.map((trait, i) => (
          <m.div
            key={`${i}-${trait}`}
            animate={{ opacity: 1, scale: 1 }}
            className="flex h-[200px] items-center justify-center bg-[#FBF5E7]/[0.08] p-5 text-center text-[30px] leading-[1.15] font-bold text-balance"
            initial={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.4, delay: 0.2 + i * 0.06, ease: EASE_OUT }}
          >
            {trait}
          </m.div>
        ))}
      </div>
      <div className="absolute top-[320px] right-[140px] w-[420px]">
        <p className="text-[28px] font-bold tracking-[0.3em] text-[#F5BB03] uppercase">Quedan</p>
        <p
          className={`countdown-font text-[170px] leading-none ${left <= 60 ? "animate-timer-pulse text-[#F5BB03]" : "text-[#FBF5E7]"}`}
        >
          {formatTime(left)}
        </p>
        <p className="mt-6 text-[30px] leading-[1.3] text-[#FBF5E7]/70">
          Anotá un nombre por casillero. Línea completa: gritá ¡bingo!
        </p>
      </div>
    </>
  );
}

export function Wave({ params }: SceneProps<"wave">) {
  const { preview } = useContext(StageContext);
  const start = useRef(0);
  const [state, setState] = useState({ round: 0, x: 0.5, done: false });
  useStageFrame((t) => {
    if (preview) return;
    if (!start.current) start.current = t;
    const elapsed = (t - start.current) / 1000;
    let round = 0;
    let acc = 0;
    // Each sweep is a bit faster than the last.
    while (round < params.rounds && elapsed >= acc + params.seconds * Math.pow(0.8, round)) {
      acc += params.seconds * Math.pow(0.8, round);
      round++;
    }
    const done = round >= params.rounds;
    const duration = params.seconds * Math.pow(0.8, round);
    const x = done ? 1 : (elapsed - acc) / duration;
    setState((s) => (s.round === round && Math.abs(s.x - x) < 0.002 && s.done === done ? s : { round, x, done }));
  });

  return (
    <div className="absolute inset-0 bg-black">
      <div
        className="absolute inset-y-0 w-[260px] -translate-x-1/2 bg-gradient-to-r from-transparent via-[#F5BB03] to-transparent"
        style={{ left: `${state.x * 100}%` }}
      />
      <div className="absolute inset-x-0 top-[90px] text-center">
        <p className="text-[34px] font-semibold tracking-[0.3em] text-[#F5BB03] uppercase">
          {state.done ? "¡Eso fue la ola!" : `La ola · vuelta ${state.round + 1} de ${params.rounds}`}
        </p>
        <p className="mt-6 text-[110px] leading-[1] font-extrabold text-balance uppercase">
          {state.done ? "Aplausos para todos" : "Cuando la luz pase por tu lado, ¡de pie y a gritar!"}
        </p>
      </div>
      <p className="absolute inset-x-0 bottom-[90px] text-center text-[40px] font-semibold text-[#FBF5E7]/60">
        La izquierda de la pantalla es la izquierda de la sala.
      </p>
    </div>
  );
}

export function LineUp({ params }: SceneProps<"line-up">) {
  const { preview } = useContext(StageContext);
  const prompts = splitList(params.prompts);
  const { index, left } = useRotation(prompts.length, params.seconds, preview);

  return (
    <>
      <Ambient />
      <Header eyebrow={`Consigna ${index + 1} de ${prompts.length} · en silencio`} title="Fila humana" />
      <div className="absolute top-[380px] right-[420px] left-[340px]">
        <p className="text-[30px] font-bold tracking-[0.3em] text-[#F5BB03] uppercase">Ordénense en una fila por</p>
        <AnimatePresence mode="wait">
          <m.p
            key={index}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 text-[96px] leading-[1.05] font-extrabold tracking-[-0.02em] text-balance"
            exit={{ opacity: 0, y: -30, transition: { duration: 0.25 } }}
            initial={{ opacity: 0, y: 40 }}
            transition={{ duration: 0.5, ease: EASE_OUT }}
          >
            {prompts[index]}
          </m.p>
        </AnimatePresence>
        <p className="mt-10 text-[36px] font-semibold text-[#FBF5E7]/60">
          Sin hablar: señas, dedos, lo que sea. Cuando estén, revisamos la fila.
        </p>
      </div>
      <div className="absolute right-[140px] bottom-[90px]">
        <p
          className={`countdown-font text-[200px] leading-none ${left <= 10 ? "animate-timer-pulse text-[#F5BB03]" : "text-[#FBF5E7]"}`}
        >
          {formatTime(left)}
        </p>
      </div>
    </>
  );
}
