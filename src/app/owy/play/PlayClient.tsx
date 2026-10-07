"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  PIXEL_COLORS,
  PIXEL_SIZE,
  RACE_REVEAL,
  encodePixels,
  parseRace,
  useElapsed,
  useInputs,
  useVoterId,
} from "components/OwyStage/inputs";
import { REACTION_EMOJIS } from "components/OwyStage/scenes/interactive";
import { GROUP_EMOJIS } from "components/OwyStage/scenes/interactive2";
import { useRealtimeChannel } from "hooks/useRealtimeChannel";
import { client, type StickyNote } from "lib/orpc";
import {
  DEFAULT_STAGE_STATE,
  INTERACTIVE_SCENES,
  OWY_STAGE_CHANNEL,
  SCENES,
  parseSceneParams,
  type SceneParams,
  type StageState,
} from "lib/owy-stage/scenes";

type Mode = "single" | "multi" | "once";

const button = "w-full rounded-2xl px-5 py-4 text-left text-xl font-bold transition active:scale-[0.98]";
const idle = `${button} bg-[#FBF5E7]/10 text-[#FBF5E7]`;
const picked = `${button} bg-[#F5BB03] text-black`;
const field =
  "w-full rounded-2xl border-2 border-[#FBF5E7]/20 bg-transparent px-5 py-4 text-xl text-[#FBF5E7] outline-none focus:border-[#F5BB03]";

/** One phone, following the wall. Renders the input the current scene asks for. */
export default function PlayClient() {
  const voter = useVoterId();
  const [state, setState] = useState<StageState | null>(null);

  const load = useCallback(() => {
    client.owyStage
      .getState()
      .catch(() => DEFAULT_STAGE_STATE)
      .then(setState);
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  const { isConnected } = useRealtimeChannel(OWY_STAGE_CHANNEL, (event, payload) => {
    if (event === "scene") setState(payload as StageState);
  });
  useEffect(() => {
    if (isConnected) load();
  }, [isConnected, load]);

  const send = useCallback(
    async (key: string, value: string, mode: Mode = "single") => {
      if (!state?.round || !voter) return false;
      const result = await client.owyStage
        .submit({ round: state.round, key, value, voter, mode })
        .catch(() => ({ ok: false }));
      return result.ok;
    },
    [state?.round, voter]
  );

  const interactive = state && (INTERACTIVE_SCENES as readonly string[]).includes(state.scene);

  return (
    <main className="min-h-dvh bg-black px-5 pt-6 pb-16 font-display text-[#FBF5E7]">
      <header className="flex items-center justify-between">
        <img alt="OWU CONF" className="h-8" src="/images/logos/conf.webp" />
        <span className="text-xs font-semibold tracking-[0.3em] text-[#F5BB03] uppercase">Participá</span>
      </header>
      {!state ? (
        <p className="mt-16 text-center text-lg text-[#FBF5E7]/60">Conectando con la pantalla…</p>
      ) : !interactive ? (
        <div className="mt-16 text-center">
          <p className="text-6xl">👀</p>
          <p className="mt-6 text-2xl font-bold">Ahora no hay nada para hacer desde acá.</p>
          <p className="mt-3 text-[#FBF5E7]/60">
            Dejá esta página abierta: cuando la pantalla pida algo, aparece solo.
          </p>
        </div>
      ) : (
        <Activity key={state.round} send={send} state={state} voter={voter} />
      )}
    </main>
  );
}

function Activity({
  state,
  send,
  voter,
}: {
  state: StageState;
  send: (key: string, value: string, mode?: Mode) => Promise<boolean>;
  voter: string;
}) {
  const title = SCENES[state.scene].title;
  const params = parseSceneParams(state.scene, state.params) as Record<string, unknown>;
  const body = (() => {
    switch (state.scene) {
      case "live-poll":
        return (
          <Choice
            options={splitPipe(String(params.options))}
            prompt={String(params.question)}
            send={(v) => send("vote", v)}
          />
        );
      case "word-cloud":
        return (
          <Words
            prompt={String(params.prompt)}
            round={state.round}
            send={(v) => send("word", v, "multi")}
            voter={voter}
          />
        );
      case "live-questions":
        return <Questions round={state.round} send={send} voter={voter} />;
      case "reactions":
        return <ReactButtons send={(v) => send("reaction", v, "multi")} />;
      case "quiz": {
        const p = params as SceneParams<"quiz">;
        return <Choice letters options={[p.a, p.b, p.c, p.d]} prompt={p.question} send={(v) => send("answer", v)} />;
      }
      case "rating":
        return <Stars prompt={String(params.title)} send={(v) => send("rating", v)} />;
      case "guess":
        return <GuessNumber prompt={String(params.question)} send={(v) => send("guess", v)} />;
      case "buzzer":
        return <Buzz prompt={String(params.title)} send={(v) => send("buzz", v, "once")} />;
      case "session-vote": {
        const p = params as SceneParams<"session-vote">;
        return <Sessions eventId={state.eventId} max={p.max} prompt={p.title} send={(v) => send("session", v)} />;
      }
      case "pixel":
        return <PixelEditor prompt={String(params.prompt)} send={(v) => send("pixel", v, "once")} />;
      case "mood-grid": {
        const p = params as SceneParams<"mood-grid">;
        return <MoodPad prompt={p.title} send={(v) => send("mood", v)} x={p.x} y={p.y} />;
      }
      case "quiz-race": {
        const p = params as SceneParams<"quiz-race">;
        return <Race questions={p.questions} seconds={p.seconds} send={send} takenAt={state.takenAt} />;
      }
      case "open-mic":
        return <Mic prompt={String(params.title)} send={(v) => send("mic", v, "once")} />;
      case "tug": {
        const p = params as SceneParams<"tug">;
        return <TugButtons a={p.a} b={p.b} prompt={p.question} send={(side, n) => send(`tug:${side}`, String(n))} />;
      }
      case "pick-number":
        return (
          <Choice
            options={Array.from({ length: 10 }, (_, i) => String(i + 1))}
            prompt="Pensá un número del 1 al 10"
            send={(v) => send("pick", v)}
          />
        );
      case "draw": {
        const p = params as SceneParams<"draw">;
        return <Signature prompt={`${p.title} · ${p.prize}`} send={(v) => send("entry", v, "once")} />;
      }
      case "typing":
        return <TypeRace phrase={String(params.phrase)} send={(v) => send("typed", v, "once")} />;
      case "story":
        return (
          <StoryWord
            prompt={String(params.opening)}
            round={state.round}
            send={(v) => send("story", v, "multi")}
            voter={voter}
          />
        );
      case "scale": {
        const p = params as SceneParams<"scale">;
        return <Slider left={p.left} prompt={p.statement} right={p.right} send={(v) => send("scale", v)} />;
      }
      case "ranking":
        return (
          <Rank
            options={splitPipe(String(params.options))}
            prompt={String(params.question)}
            send={(v) => send("rank", v)}
          />
        );
      case "wall":
        return (
          <Message
            prompt={String(params.prompt)}
            round={state.round}
            send={(v) => send("msg", v, "multi")}
            voter={voter}
          />
        );
      case "multi-poll":
        return (
          <MultiChoice
            options={splitPipe(String(params.options))}
            prompt={String(params.question)}
            send={(v) => send("multi", v)}
          />
        );
      case "origin":
        return (
          <Choice
            options={splitPipe(String(params.options))}
            prompt={String(params.question)}
            send={(v) => send("origin", v)}
          />
        );
      case "presence":
        return <Presence prompt={String(params.title)} send={() => send("here", "1", "once")} />;
      case "signatures":
        return <Signature prompt={String(params.title)} send={(v) => send("sign", v, "once")} />;
      case "pairs": {
        const p = params as SceneParams<"pairs">;
        return <Group groups={p.groups} prompt={p.title} send={(v) => send("group", v, "once")} />;
      }
      case "tap-race": {
        const p = params as SceneParams<"tap-race">;
        return (
          <Taps left={p.left} prompt={p.title} right={p.right} send={(team, n) => send(`taps:${team}`, String(n))} />
        );
      }
      default:
        return null;
    }
  })();

  return (
    <section className="mt-8">
      <p className="text-xs font-semibold tracking-[0.3em] text-[#F5BB03] uppercase">{title}</p>
      {body}
    </section>
  );
}

const splitPipe = (value: string) =>
  value
    .split("|")
    .map((v) => v.trim())
    .filter(Boolean);

function Prompt({ children }: { children: React.ReactNode }) {
  return <h1 className="mt-2 text-3xl leading-tight font-extrabold text-balance">{children}</h1>;
}

function Sent({ shown }: { shown: boolean }) {
  return shown ? (
    <p className="mt-4 text-center text-sm font-semibold text-[#F5BB03]">✓ Enviado · podés cambiarlo</p>
  ) : null;
}

function Choice({
  prompt,
  options,
  send,
  letters = false,
}: {
  prompt: string;
  options: string[];
  send: (v: string) => Promise<boolean>;
  letters?: boolean;
}) {
  const [chosen, setChosen] = useState<string | null>(null);
  return (
    <>
      <Prompt>{prompt}</Prompt>
      <div className="mt-6 flex flex-col gap-3">
        {options.map((option, i) => {
          const value = letters ? "ABCD"[i] : option;
          return (
            <button
              key={value}
              className={chosen === value ? picked : idle}
              onClick={() => send(value).then((ok) => ok && setChosen(value))}
              type="button"
            >
              {letters && <span className="mr-3 opacity-60">{value}</span>}
              {option}
            </button>
          );
        })}
      </div>
      <Sent shown={chosen !== null} />
    </>
  );
}

function Words({
  prompt,
  round,
  voter,
  send,
}: {
  prompt: string;
  round: string;
  voter: string;
  send: (v: string) => Promise<boolean>;
}) {
  const inputs = useInputs(round);
  const mine = inputs.filter((i) => i.key === "word" && i.voter === voter).map((i) => i.value);
  const [text, setText] = useState("");
  const submit = async () => {
    const word = text.trim().slice(0, 30);
    if (!word || mine.length >= 5) return;
    if (await send(word)) setText("");
  };
  return (
    <>
      <Prompt>{prompt}</Prompt>
      <form
        className="mt-6 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          className={field}
          maxLength={30}
          onChange={(e) => setText(e.target.value)}
          placeholder="Una palabra"
          value={text}
        />
        <button
          className="rounded-2xl bg-[#F5BB03] px-5 text-xl font-extrabold text-black"
          disabled={mine.length >= 5}
          type="submit"
        >
          →
        </button>
      </form>
      <p className="mt-3 text-sm text-[#FBF5E7]/60">
        {mine.length ? `Mandaste: ${mine.join(", ")}` : "Hasta cinco palabras por persona."}
      </p>
    </>
  );
}

function Questions({
  round,
  voter,
  send,
}: {
  round: string;
  voter: string;
  send: (key: string, value: string, mode?: Mode) => Promise<boolean>;
}) {
  const inputs = useInputs(round);
  const [text, setText] = useState("");
  const votes = new Map<string, number>();
  const mine = new Set<string>();
  for (const input of inputs) {
    if (!input.key.startsWith("up:")) continue;
    const id = input.key.slice(3);
    votes.set(id, (votes.get(id) ?? 0) + 1);
    if (input.voter === voter) mine.add(id);
  }
  const questions = inputs
    .filter((i) => i.key === "question")
    .sort((a, b) => (votes.get(b.id) ?? 0) - (votes.get(a.id) ?? 0));
  return (
    <>
      <Prompt>¿Qué le preguntarías al escenario?</Prompt>
      <form
        className="mt-6 flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const q = text.trim().slice(0, 140);
          if (q && (await send("question", q, "multi"))) setText("");
        }}
      >
        <input
          className={field}
          maxLength={140}
          onChange={(e) => setText(e.target.value)}
          placeholder="Tu pregunta"
          value={text}
        />
        <button className="rounded-2xl bg-[#F5BB03] px-5 text-xl font-extrabold text-black" type="submit">
          →
        </button>
      </form>
      <ul className="mt-6 flex flex-col gap-3">
        {questions.map((q) => (
          <li key={q.id} className="flex items-center gap-3 rounded-2xl bg-[#FBF5E7]/10 p-3">
            <button
              className={`flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl text-sm font-extrabold ${mine.has(q.id) ? "bg-[#F5BB03] text-black" : "bg-[#0162C8] text-[#FBF5E7]"}`}
              onClick={() => send(`up:${q.id}`, "1")}
              type="button"
            >
              ▲<span>{votes.get(q.id) ?? 0}</span>
            </button>
            <span className="text-base leading-snug">{q.value}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

function ReactButtons({ send }: { send: (v: string) => Promise<boolean> }) {
  const last = useRef(0);
  const [burst, setBurst] = useState<string | null>(null);
  const tap = (emoji: string) => {
    if (Date.now() - last.current < 350) return;
    last.current = Date.now();
    setBurst(emoji);
    send(emoji);
  };
  return (
    <>
      <Prompt>Tocá lo que sentís. Las veces que quieras.</Prompt>
      <div className="mt-8 grid grid-cols-3 gap-3">
        {REACTION_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            className="rounded-3xl bg-[#FBF5E7]/10 py-6 text-6xl active:scale-90 active:bg-[#F5BB03]/30"
            onClick={() => tap(emoji)}
            type="button"
          >
            {emoji}
          </button>
        ))}
      </div>
      {burst && (
        <p key={last.current} className="mt-6 animate-bounce text-center text-4xl">
          {burst}
        </p>
      )}
    </>
  );
}

function Stars({ prompt, send }: { prompt: string; send: (v: string) => Promise<boolean> }) {
  const [stars, setStars] = useState(0);
  return (
    <>
      <Prompt>{prompt}</Prompt>
      <div className="mt-8 flex justify-between">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            className={`text-6xl transition ${n <= stars ? "text-[#F5BB03]" : "text-[#FBF5E7]/25"}`}
            onClick={() => send(String(n)).then((ok) => ok && setStars(n))}
            type="button"
          >
            ★
          </button>
        ))}
      </div>
      <Sent shown={stars > 0} />
    </>
  );
}

function GuessNumber({ prompt, send }: { prompt: string; send: (v: string) => Promise<boolean> }) {
  const [value, setValue] = useState("");
  const [sent, setSent] = useState(false);
  return (
    <>
      <Prompt>{prompt}</Prompt>
      <form
        className="mt-6 flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const n = Number(value);
          if (Number.isFinite(n) && (await send(String(Math.round(n))))) setSent(true);
        }}
      >
        <input
          className={field}
          inputMode="numeric"
          onChange={(e) => setValue(e.target.value)}
          placeholder="Tu número"
          type="number"
          value={value}
        />
        <button className="rounded-2xl bg-[#F5BB03] px-5 text-xl font-extrabold text-black" type="submit">
          →
        </button>
      </form>
      <Sent shown={sent} />
    </>
  );
}

function Buzz({ prompt, send }: { prompt: string; send: (v: string) => Promise<boolean> }) {
  const [name, setName] = useState("");
  const [pressed, setPressed] = useState(false);
  useEffect(() => {
    setName(window.localStorage.getItem("owy-name") ?? "");
  }, []);
  return (
    <>
      <Prompt>{prompt}</Prompt>
      <input
        className={`${field} mt-6`}
        maxLength={30}
        onChange={(e) => {
          setName(e.target.value);
          window.localStorage.setItem("owy-name", e.target.value);
        }}
        placeholder="Tu nombre"
        value={name}
      />
      <button
        className={`mt-6 aspect-square w-full rounded-full text-5xl font-extrabold uppercase shadow-[0_20px_60px_rgba(245,187,3,0.35)] transition active:scale-95 ${
          pressed ? "bg-[#0162C8] text-[#FBF5E7]" : "bg-[#F5BB03] text-black"
        }`}
        disabled={!name.trim() || pressed}
        onClick={() => send(name.trim()).then((ok) => ok && setPressed(true))}
        type="button"
      >
        {pressed ? "¡Listo!" : "¡Ya!"}
      </button>
      <p className="mt-4 text-center text-sm text-[#FBF5E7]/60">
        {pressed ? "Mirá la pantalla." : "Esperá el ¡ya! de la pantalla y apretá."}
      </p>
    </>
  );
}

function Sessions({
  eventId,
  prompt,
  max,
  send,
}: {
  eventId: string | null;
  prompt: string;
  max: number;
  send: (v: string) => Promise<boolean>;
}) {
  const [tracks, setTracks] = useState<StickyNote[] | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  useEffect(() => {
    if (!eventId) return;
    client.tracks
      .list({ openSpaceId: eventId })
      .then(setTracks)
      .catch(() => setTracks([]));
  }, [eventId]);
  return (
    <>
      <Prompt>{prompt}</Prompt>
      <div className="mt-6 flex flex-col gap-3">
        {tracks?.map((track) => (
          <button
            key={track.id}
            className={chosen.includes(track.id) ? picked : idle}
            onClick={() => {
              const next = chosen.includes(track.id)
                ? chosen.filter((id) => id !== track.id)
                : max === 1
                  ? [track.id]
                  : chosen.length < max
                    ? [...chosen, track.id]
                    : chosen;
              if (next === chosen) return;
              setChosen(next);
              // One row per person holds every pick; the wall splits it.
              if (next.length) send(next.join("|"));
            }}
            type="button"
          >
            <span className="block">{track.title}</span>
            <span className="block text-sm font-medium opacity-70">
              {track.timeSlot.split(" - ")[0]} · {track.room}
              {track.speaker ? ` · ${track.speaker}` : ""}
            </span>
          </button>
        ))}
        {tracks && !tracks.length && <p className="text-[#FBF5E7]/60">Todavía no hay sesiones en el muro.</p>}
      </div>
      <Sent shown={chosen.length > 0} />
      {max > 1 && <p className="mt-2 text-center text-sm text-[#FBF5E7]/60">Hasta {max} sesiones.</p>}
    </>
  );
}

function Slider({
  prompt,
  left,
  right,
  send,
}: {
  prompt: string;
  left: string;
  right: string;
  send: (v: string) => Promise<boolean>;
}) {
  const [value, setValue] = useState(50);
  const [sent, setSent] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const change = (n: number) => {
    setValue(n);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => send(String(n)).then((ok) => ok && setSent(true)), 400);
  };
  return (
    <>
      <Prompt>{prompt}</Prompt>
      <p className="mt-10 text-center text-7xl font-extrabold text-[#F5BB03] tabular-nums">{value}</p>
      <input
        className="mt-6 w-full accent-[#F5BB03]"
        max={100}
        min={0}
        onChange={(e) => change(Number(e.target.value))}
        type="range"
        value={value}
      />
      <div className="mt-2 flex justify-between text-sm font-semibold text-[#FBF5E7]/60">
        <span>{left}</span>
        <span>{right}</span>
      </div>
      <Sent shown={sent} />
    </>
  );
}

function Rank({ prompt, options, send }: { prompt: string; options: string[]; send: (v: string) => Promise<boolean> }) {
  const [order, setOrder] = useState<number[]>([]);
  const [sent, setSent] = useState(false);
  const pick = (i: number) => {
    if (order.includes(i) || sent) return;
    const next = [...order, i];
    setOrder(next);
    if (next.length === options.length) send(next.join(",")).then((ok) => ok && setSent(true));
  };
  return (
    <>
      <Prompt>{prompt}</Prompt>
      <p className="mt-3 text-sm text-[#FBF5E7]/60">Tocá en orden: primero la más importante.</p>
      <div className="mt-6 flex flex-col gap-3">
        {options.map((option, i) => {
          const position = order.indexOf(i);
          return (
            <button key={option} className={position >= 0 ? picked : idle} onClick={() => pick(i)} type="button">
              {position >= 0 && <span className="mr-3 opacity-60">{position + 1}º</span>}
              {option}
            </button>
          );
        })}
      </div>
      {sent ? (
        <p className="mt-4 text-center text-sm font-semibold text-[#F5BB03]">✓ Enviado</p>
      ) : (
        order.length > 0 && (
          <button
            className="mt-4 w-full text-center text-sm font-semibold text-[#FBF5E7]/60"
            onClick={() => setOrder([])}
            type="button"
          >
            Empezar de nuevo
          </button>
        )
      )}
    </>
  );
}

function Message({
  prompt,
  round,
  voter,
  send,
}: {
  prompt: string;
  round: string;
  voter: string;
  send: (v: string) => Promise<boolean>;
}) {
  const inputs = useInputs(round);
  const mine = inputs.filter((i) => i.key === "msg" && i.voter === voter).length;
  const [text, setText] = useState("");
  return (
    <>
      <Prompt>{prompt}</Prompt>
      <form
        className="mt-6 flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const msg = text.trim().slice(0, 80);
          if (msg && mine < 3 && (await send(msg))) setText("");
        }}
      >
        <textarea
          className={`${field} min-h-28`}
          maxLength={80}
          onChange={(e) => setText(e.target.value)}
          placeholder="Hasta 80 caracteres"
          value={text}
        />
        <button
          className="rounded-2xl bg-[#F5BB03] py-4 text-xl font-extrabold text-black disabled:opacity-40"
          disabled={mine >= 3}
          type="submit"
        >
          Pegar en el muro
        </button>
      </form>
      <p className="mt-3 text-sm text-[#FBF5E7]/60">
        {mine >= 3 ? "Ya pegaste tres. Gracias." : `${3 - mine} mensajes disponibles.`}
      </p>
    </>
  );
}

function MultiChoice({
  prompt,
  options,
  send,
}: {
  prompt: string;
  options: string[];
  send: (v: string) => Promise<boolean>;
}) {
  const [chosen, setChosen] = useState<string[]>([]);
  const [sent, setSent] = useState(false);
  const toggle = (option: string) => {
    const next = chosen.includes(option) ? chosen.filter((o) => o !== option) : [...chosen, option];
    setChosen(next);
    setSent(false);
    if (next.length) send(next.join("|")).then((ok) => ok && setSent(true));
  };
  return (
    <>
      <Prompt>{prompt}</Prompt>
      <p className="mt-3 text-sm text-[#FBF5E7]/60">Marcá todas las que apliquen.</p>
      <div className="mt-6 flex flex-col gap-3">
        {options.map((option) => (
          <button
            key={option}
            className={chosen.includes(option) ? picked : idle}
            onClick={() => toggle(option)}
            type="button"
          >
            {chosen.includes(option) ? "☑" : "☐"} <span className="ml-2">{option}</span>
          </button>
        ))}
      </div>
      <Sent shown={sent} />
    </>
  );
}

function Presence({ prompt, send }: { prompt: string; send: () => Promise<boolean> }) {
  const [done, setDone] = useState(false);
  return (
    <>
      <Prompt>{prompt}</Prompt>
      <button
        className={`mt-10 aspect-square w-full rounded-full text-5xl font-extrabold uppercase transition active:scale-95 ${done ? "bg-[#0162C8] text-[#FBF5E7]" : "bg-[#F5BB03] text-black"}`}
        disabled={done}
        onClick={() => send().then((ok) => ok && setDone(true))}
        type="button"
      >
        {done ? "¡Contado!" : "¡Presente!"}
      </button>
    </>
  );
}

function Signature({ prompt, send }: { prompt: string; send: (v: string) => Promise<boolean> }) {
  const [name, setName] = useState("");
  const [done, setDone] = useState(false);
  useEffect(() => {
    setName(window.localStorage.getItem("owy-name") ?? "");
  }, []);
  return (
    <>
      <Prompt>{prompt}</Prompt>
      <form
        className="mt-6 flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const value = name.trim().slice(0, 30);
          if (!value) return;
          window.localStorage.setItem("owy-name", value);
          if (await send(value)) setDone(true);
        }}
      >
        <input
          className={field}
          disabled={done}
          maxLength={30}
          onChange={(e) => setName(e.target.value)}
          placeholder="Tu nombre"
          value={name}
        />
        <button
          className="rounded-2xl bg-[#F5BB03] px-5 text-xl font-extrabold text-black disabled:opacity-40"
          disabled={done}
          type="submit"
        >
          ✍️
        </button>
      </form>
      {done && <p className="mt-4 text-center text-sm font-semibold text-[#F5BB03]">✓ Firmaste. Mirá la pantalla.</p>}
    </>
  );
}

function Group({ prompt, groups, send }: { prompt: string; groups: number; send: (v: string) => Promise<boolean> }) {
  const [group, setGroup] = useState<string | null>(null);
  const draw = () => {
    const emoji = GROUP_EMOJIS[Math.floor(Math.random() * Math.min(groups, GROUP_EMOJIS.length))];
    send(emoji).then((ok) => ok && setGroup(emoji));
  };
  return (
    <>
      <Prompt>{prompt}</Prompt>
      {group ? (
        <div className="mt-10 text-center">
          <p className="text-[9rem] leading-none">{group}</p>
          <p className="mt-6 text-2xl font-bold">Tu grupo es {group}. Buscá a los demás.</p>
        </div>
      ) : (
        <button
          className="mt-10 aspect-square w-full rounded-full bg-[#F5BB03] text-4xl font-extrabold text-black uppercase transition active:scale-95"
          onClick={draw}
          type="button"
        >
          Dame mi grupo
        </button>
      )}
    </>
  );
}

function Taps({
  prompt,
  left,
  right,
  send,
}: {
  prompt: string;
  left: string;
  right: string;
  send: (team: "a" | "b", n: number) => Promise<boolean>;
}) {
  const [team, setTeam] = useState<"a" | "b" | null>(null);
  const [taps, setTaps] = useState(0);
  const pending = useRef(0);
  const flushing = useRef(false);
  const tap = () => {
    if (!team) return;
    const n = pending.current + 1;
    pending.current = n;
    setTaps(n);
    if (flushing.current) return;
    flushing.current = true;
    // Batch the taps: one request every half second carries the running total.
    setTimeout(() => {
      flushing.current = false;
      send(team, pending.current);
    }, 500);
  };
  if (!team) {
    return (
      <>
        <Prompt>{prompt}</Prompt>
        <p className="mt-3 text-sm text-[#FBF5E7]/60">¿De qué lado de la sala estás?</p>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <button className={`${idle} bg-[#F5BB03]/20 text-center`} onClick={() => setTeam("a")} type="button">
            {left}
          </button>
          <button className={`${idle} bg-[#0162C8]/30 text-center`} onClick={() => setTeam("b")} type="button">
            {right}
          </button>
        </div>
      </>
    );
  }
  return (
    <>
      <Prompt>{prompt}</Prompt>
      <p className="mt-3 text-sm text-[#FBF5E7]/60">Equipo {team === "a" ? left : right} · tocá sin parar.</p>
      <button
        className={`mt-8 aspect-square w-full rounded-full text-6xl font-extrabold text-black transition active:scale-90 ${team === "a" ? "bg-[#F5BB03]" : "bg-[#0162C8] text-[#FBF5E7]"}`}
        onClick={tap}
        type="button"
      >
        {taps}
      </button>
    </>
  );
}

function PixelEditor({ prompt, send }: { prompt: string; send: (v: string) => Promise<boolean> }) {
  const [cells, setCells] = useState<number[]>(() => Array(PIXEL_SIZE * PIXEL_SIZE).fill(0));
  const [color, setColor] = useState(1);
  const [sent, setSent] = useState(false);
  const painting = useRef(false);
  const paint = (i: number) => setCells((c) => (c[i] === color ? c : c.map((v, k) => (k === i ? color : v))));
  return (
    <>
      <Prompt>{prompt}</Prompt>
      <div className="mt-4 flex gap-3">
        {PIXEL_COLORS.map((c, i) => (
          <button
            key={c}
            aria-label={i === 0 ? "borrar" : `color ${i}`}
            className={`h-12 w-12 rounded-full border-4 ${color === i ? "border-[#FBF5E7]" : "border-transparent"}`}
            onClick={() => setColor(i)}
            style={{ background: i === 0 ? "#333" : c }}
            type="button"
          />
        ))}
      </div>
      <div
        className="mt-4 grid touch-none border-2 border-[#FBF5E7]/20 bg-black select-none"
        onPointerDown={() => (painting.current = true)}
        onPointerLeave={() => (painting.current = false)}
        onPointerUp={() => (painting.current = false)}
        style={{ gridTemplateColumns: `repeat(${PIXEL_SIZE}, 1fr)`, aspectRatio: "1" }}
      >
        {cells.map((c, i) => (
          <span
            key={i}
            className="border-[0.5px] border-[#FBF5E7]/10"
            onPointerDown={() => paint(i)}
            onPointerEnter={() => painting.current && paint(i)}
            style={{ background: PIXEL_COLORS[c] }}
          />
        ))}
      </div>
      <button
        className="mt-4 w-full rounded-2xl bg-[#F5BB03] py-4 text-xl font-extrabold text-black disabled:opacity-40"
        disabled={sent}
        onClick={() => send(encodePixels(cells)).then((ok) => ok && setSent(true))}
        type="button"
      >
        {sent ? "✓ En la pared" : "Mandar a la pared"}
      </button>
    </>
  );
}

function MoodPad({
  prompt,
  x,
  y,
  send,
}: {
  prompt: string;
  x: string;
  y: string;
  send: (v: string) => Promise<boolean>;
}) {
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);
  const tap = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = Math.round(((e.clientX - r.left) / r.width) * 100);
    const py = Math.round((1 - (e.clientY - r.top) / r.height) * 100);
    setPoint({ x: px, y: py });
    send(`${px},${py}`);
  };
  return (
    <>
      <Prompt>{prompt}</Prompt>
      <p className="mt-2 text-sm text-[#FBF5E7]/60">↑ {y}</p>
      <div
        className="relative mt-2 aspect-square w-full touch-none border-2 border-[#FBF5E7]/25 bg-[#FBF5E7]/5"
        onPointerDown={tap}
      >
        <div className="absolute inset-y-0 left-1/2 w-px bg-[#FBF5E7]/15" />
        <div className="absolute inset-x-0 top-1/2 h-px bg-[#FBF5E7]/15" />
        {point && (
          <span
            className="absolute h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#F5BB03]"
            style={{ left: `${point.x}%`, top: `${100 - point.y}%` }}
          />
        )}
      </div>
      <p className="mt-2 text-right text-sm text-[#FBF5E7]/60">{x} →</p>
      <Sent shown={point !== null} />
    </>
  );
}

function Race({
  questions,
  seconds,
  takenAt,
  send,
}: {
  questions: string;
  seconds: number;
  takenAt: string;
  send: (key: string, value: string, mode?: Mode) => Promise<boolean>;
}) {
  const list = parseRace(questions);
  const elapsed = useElapsed(takenAt, 500);
  const slot = seconds + RACE_REVEAL;
  const index = Math.min(list.length, Math.floor(elapsed / slot));
  const answering = index < list.length && elapsed - index * slot < seconds;
  const [name, setName] = useState("");
  const [named, setNamed] = useState(false);
  const [answered, setAnswered] = useState<Record<number, string>>({});
  useEffect(() => {
    setName(window.localStorage.getItem("owy-name") ?? "");
  }, []);
  if (!named) {
    return (
      <>
        <Prompt>¿Cómo te llamás?</Prompt>
        <form
          className="mt-6 flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const value = name.trim().slice(0, 24);
            if (!value) return;
            window.localStorage.setItem("owy-name", value);
            if (await send("name", value, "once")) setNamed(true);
          }}
        >
          <input
            className={field}
            maxLength={24}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tu nombre"
            value={name}
          />
          <button className="rounded-2xl bg-[#F5BB03] px-5 text-xl font-extrabold text-black" type="submit">
            →
          </button>
        </form>
      </>
    );
  }
  if (index >= list.length) return <Prompt>Se terminó. Mirá la tabla en la pantalla.</Prompt>;
  const q = list[index];
  const mine = answered[index];
  return (
    <>
      <p className="mt-2 text-sm text-[#FBF5E7]/60">
        Pregunta {index + 1} de {list.length} ·{" "}
        {answering ? `${Math.max(0, Math.ceil(seconds - (elapsed - index * slot)))} s` : "respuesta en pantalla"}
      </p>
      <Prompt>{q.question}</Prompt>
      <div className="mt-6 flex flex-col gap-3">
        {q.options.map((option, i) => (
          <button
            key={option}
            className={mine === String(i) ? picked : idle}
            disabled={!answering || mine !== undefined}
            onClick={() =>
              send(`q:${index}`, String(i)).then((ok) => ok && setAnswered((a) => ({ ...a, [index]: String(i) })))
            }
            type="button"
          >
            <span className="mr-3 opacity-60">{"ABCD"[i]}</span>
            {option}
          </button>
        ))}
      </div>
      {mine !== undefined && <p className="mt-4 text-center text-sm font-semibold text-[#F5BB03]">✓ Respondido</p>}
    </>
  );
}

function Mic({ prompt, send }: { prompt: string; send: (v: string) => Promise<boolean> }) {
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [done, setDone] = useState(false);
  useEffect(() => {
    setName(window.localStorage.getItem("owy-name") ?? "");
  }, []);
  return (
    <>
      <Prompt>{prompt}</Prompt>
      <form
        className="mt-6 flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const n = name.trim().slice(0, 24);
          const t = topic.trim().slice(0, 60);
          if (!n || !t) return;
          window.localStorage.setItem("owy-name", n);
          if (await send(`${n} — ${t}`)) setDone(true);
        }}
      >
        <input
          className={field}
          disabled={done}
          maxLength={24}
          onChange={(e) => setName(e.target.value)}
          placeholder="Tu nombre"
          value={name}
        />
        <input
          className={field}
          disabled={done}
          maxLength={60}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="¿De qué vas a hablar?"
          value={topic}
        />
        <button
          className="rounded-2xl bg-[#F5BB03] py-4 text-xl font-extrabold text-black disabled:opacity-40"
          disabled={done}
          type="submit"
        >
          {done ? "✓ Estás en la cola" : "Anotarme"}
        </button>
      </form>
    </>
  );
}

function TugButtons({
  prompt,
  a,
  b,
  send,
}: {
  prompt: string;
  a: string;
  b: string;
  send: (side: "a" | "b", n: number) => Promise<boolean>;
}) {
  const counts = useRef({ a: 0, b: 0 });
  const timers = useRef<{ a: boolean; b: boolean }>({ a: false, b: false });
  const [shown, setShown] = useState({ a: 0, b: 0 });
  const pull = (side: "a" | "b") => {
    counts.current[side] += 1;
    setShown({ ...counts.current });
    if (timers.current[side]) return;
    timers.current[side] = true;
    setTimeout(() => {
      timers.current[side] = false;
      send(side, counts.current[side]);
    }, 500);
  };
  return (
    <>
      <Prompt>{prompt}</Prompt>
      <p className="mt-2 text-sm text-[#FBF5E7]/60">Tocá tu lado, muchas veces.</p>
      <div className="mt-6 grid grid-cols-2 gap-3">
        <button
          className="rounded-3xl bg-[#F5BB03] py-16 text-2xl font-extrabold text-black active:scale-95"
          onClick={() => pull("a")}
          type="button"
        >
          {a}
          <span className="block text-4xl tabular-nums">{shown.a}</span>
        </button>
        <button
          className="rounded-3xl bg-[#0162C8] py-16 text-2xl font-extrabold text-[#FBF5E7] active:scale-95"
          onClick={() => pull("b")}
          type="button"
        >
          {b}
          <span className="block text-4xl tabular-nums">{shown.b}</span>
        </button>
      </div>
    </>
  );
}

function TypeRace({ phrase, send }: { phrase: string; send: (v: string) => Promise<boolean> }) {
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [ms, setMs] = useState<number | null>(null);
  const started = useRef(0);
  useEffect(() => {
    setName(window.localStorage.getItem("owy-name") ?? "");
  }, []);
  const change = (value: string) => {
    if (ms !== null) return;
    if (!started.current) started.current = Date.now();
    setText(value);
    if (value === phrase) {
      const time = Date.now() - started.current;
      setMs(time);
      const who = name.trim().slice(0, 24) || "Anónimo";
      window.localStorage.setItem("owy-name", who);
      send(`${time}:${who}`);
    }
  };
  return (
    <>
      <Prompt>Tipeá esto sin errores</Prompt>
      <p className="mt-4 rounded-2xl bg-[#FBF5E7]/10 p-4 font-terminal text-lg break-all text-[#F5BB03]">{phrase}</p>
      <input
        className={`${field} mt-3`}
        maxLength={24}
        onChange={(e) => setName(e.target.value)}
        placeholder="Tu nombre (opcional)"
        value={name}
      />
      <input
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        className={`${field} mt-3 font-terminal ${text && !phrase.startsWith(text) ? "border-red-500" : ""}`}
        disabled={ms !== null}
        onChange={(e) => change(e.target.value)}
        placeholder="El cronómetro arranca con la primera tecla"
        spellCheck={false}
        value={text}
      />
      {ms !== null && (
        <p className="mt-4 text-center text-2xl font-extrabold text-[#F5BB03]">
          {(ms / 1000).toFixed(2)} s · mirá la tabla
        </p>
      )}
    </>
  );
}

function StoryWord({
  prompt,
  round,
  voter,
  send,
}: {
  prompt: string;
  round: string;
  voter: string;
  send: (v: string) => Promise<boolean>;
}) {
  const inputs = useInputs(round);
  const words = inputs.filter((i) => i.key === "story");
  const mine = words.filter((i) => i.voter === voter).length;
  const [text, setText] = useState("");
  return (
    <>
      <Prompt>Una palabra para seguir la historia</Prompt>
      <p className="mt-3 text-[#FBF5E7]/70">
        <span className="text-[#F5BB03]">{prompt}</span>{" "}
        {words
          .slice(-12)
          .map((w) => w.value)
          .join(" ")}
        …
      </p>
      <form
        className="mt-6 flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const word = text.trim().split(/\s+/)[0]?.slice(0, 24) ?? "";
          if (word && mine < 3 && (await send(word))) setText("");
        }}
      >
        <input
          className={field}
          maxLength={24}
          onChange={(e) => setText(e.target.value)}
          placeholder="Una sola palabra"
          value={text}
        />
        <button
          className="rounded-2xl bg-[#F5BB03] px-5 text-xl font-extrabold text-black disabled:opacity-40"
          disabled={mine >= 3}
          type="submit"
        >
          →
        </button>
      </form>
      <p className="mt-3 text-sm text-[#FBF5E7]/60">
        {mine >= 3 ? "Ya pusiste tres. Dejá lugar a otros." : `Te quedan ${3 - mine}.`}
      </p>
    </>
  );
}
