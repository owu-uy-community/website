"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { MotionConfig } from "motion/react";
import {
  CaptionsOff,
  ChevronLeft,
  ChevronRight,
  Eye,
  MessageCircleQuestion,
  Mic,
  MonitorOff,
  PartyPopper,
  Plug,
  QrCode,
  SquareStop,
  Timer,
  Unplug,
  type LucideIcon,
} from "lucide-react";

import { cn } from "app/lib/utils";
import { haptic } from "components/Admin/stage/haptics";
import { QuestionsPanel } from "components/Admin/stage/Questions";
import { ScaledFrame } from "components/Admin/stage/ScaledFrame";
import { useStoredState } from "components/Admin/stage/useStoredState";
import { MicroLabel, Panel, PanelHead } from "components/Admin/ui/page";
import type { ListenChannel } from "components/Companion/web-voice";
import { useInputs } from "components/OwyStage/inputs";
import { Button } from "components/shared/ui/button";
import { Input } from "components/shared/ui/input";
import { Kbd } from "components/shared/ui/kbd";
import { Skeleton } from "components/shared/ui/skeleton";
import { Switch } from "components/shared/ui/switch";
import { Textarea } from "components/shared/ui/textarea";
import { toast } from "components/shared/ui/toast-utils";
import { useMounted } from "hooks/useMounted";
import { useWakeLock } from "hooks/useWakeLock";
import { rankQuestions, type RankedQuestion } from "lib/owy-stage/questions";
import { MONITOR_READY, MONITOR_SHOW, SCENES, type StageState } from "lib/owy-stage/scenes";
import {
  TALK_SECTIONS,
  TALK_SLIDES,
  cueText,
  plannedStart,
  sectionBudgets,
  slideIndex,
  slideSteps,
  stepAfter,
  talkSlide,
  type TalkCue,
  type TalkSlide,
} from "lib/owy-stage/talk/deck";
import { TALK_NOTES } from "lib/owy-stage/talk/notes";

import { LISTEN_LABELS, askerFor, playLocalClip, useMicMeters, useSeat, type SeatCommand } from "./useSeat";
import { clock, useTalkClock, useTalkStage, type Overlay, type TalkParams } from "./useTalk";

const WIDE = "(min-width: 1024px)";
const useWide = () =>
  useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(WIDE);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia(WIDE).matches,
    () => true
  );

/** When the Q&A starts and when the talk ends, on the plan (seconds from the first slide). */
const QA_AT = plannedStart("qa");
const QA_END = plannedStart("end");
const TOTAL = TALK_SLIDES.reduce((sum, slide) => sum + slide.seconds, 0);
const BUDGETS = sectionBudgets();

/** «Owy, en vivo»: the presenter's console (the Mac) and, under 1024 px, their phone remote. */
export function TalkConsole() {
  const mounted = useMounted();
  if (!mounted)
    return (
      <div className="h-(--admin-content-h) p-2">
        <Skeleton className="h-full w-full rounded-xl" />
      </div>
    );

  return (
    <MotionConfig reducedMotion="user">
      <Console />
    </MotionConfig>
  );
}

type Talk = ReturnType<typeof useTalkStage>;
type Seat = ReturnType<typeof useSeat>;
type Clock = ReturnType<typeof useTalkClock>;

/** Typing, or inside a dialog or menu: the keys belong to it. */
const busy = (el: Element | null) =>
  el instanceof HTMLElement &&
  (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) ||
    el.isContentEditable ||
    el.closest("[role=dialog],[role=alertdialog],[role=menu],[role=listbox]") !== null);
const ownsSpace = (el: Element | null) =>
  Boolean(el?.closest("button,a,[role=button],[role=tab],[role=switch],[role=checkbox],[role=radio]"));
/** After a click, give the focus back so Space keeps meaning "next". */
const release = (event: React.MouseEvent<HTMLElement>) => {
  if (event.detail > 0) event.currentTarget.blur();
};
const press = (action: () => void) => (event: React.MouseEvent<HTMLElement>) => {
  release(event);
  action();
};

const LISTENS: ListenChannel[] = ["L", "R", "mix"];
/** What a USB clicker sends for next and back (PageDown/PageUp), plus the keyboard's. */
const NAV_KEYS = new Set(["ArrowRight", "ArrowLeft", "PageDown", "PageUp", " "]);

/**
 * Whether this window has the keyboard: a clicker types into whatever has focus, so the console
 * says when it doesn't (another app or the wall's window was clicked last).
 */
function ClickerFocus() {
  const [focused, setFocused] = useState(true);
  useEffect(() => {
    const update = () => setFocused(document.hasFocus());
    update();
    window.addEventListener("focus", update);
    window.addEventListener("blur", update);
    return () => {
      window.removeEventListener("focus", update);
      window.removeEventListener("blur", update);
    };
  }, []);

  return (
    <span
      className={cn(
        "flex items-center gap-1.5 text-meta whitespace-nowrap",
        focused ? "text-muted-foreground" : "font-semibold text-warning"
      )}
      title="El clicker manda teclas a la ventana que tiene el foco"
    >
      <span className={cn("size-2 rounded-full", focused ? "bg-success" : "animate-pulse bg-warning")} />
      {focused ? "Clicker" : "Sin foco: hacé click acá"}
    </span>
  );
}

function Console() {
  const talk = useTalkStage();
  const seat = useSeat(talk.position);
  const wide = useWide();
  const time = useTalkClock(talk.round, talk.position?.slide ?? null);
  const inputs = useInputs(talk.round);
  const questions = useMemo(() => rankQuestions(inputs), [inputs]);
  const top =
    questions.find((question) => question.moderation === "pinned" || question.moderation === "")?.value ?? null;
  useWakeLock(true);

  const slide = talk.position ? talkSlide(talk.position.slide) : null;

  /** A cue: the seat speaks it; with no Owy, the Mac plays the recorded take if there is one. */
  const fire = useCallback(
    (cue: TalkCue) => {
      const text = cueText(cue, top);
      if (!text) return toast.info("Todavía no hay preguntas", "Este cue lee la pregunta más votada.");
      const message: SeatCommand =
        cue.mode === "say"
          ? { type: "say", text, ...(cue.clip ? { clip: cue.clip } : {}) }
          : { type: "ask", text, asker: "presenter" };
      if (seat.command(message)) return haptic(8);
      if (cue.mode === "say" && cue.clip && (seat.tried || wide)) return void playLocalClip(cue.clip);
      toast.error("Owy no está conectado", wide ? "Conectalo en la pestaña Owy." : "La Mac no está conectada a Owy.");
    },
    [seat, top, wide]
  );
  const fireRef = useRef(fire);
  fireRef.current = fire;

  // Auto cues fire once per round and slide, from the seat only (two consoles never say it twice).
  const stage = seat.status.stage;
  useEffect(() => {
    if (!slide || !talk.round || !(seat.attached || stage === "error")) return;
    const autos = (slide.cues ?? []).filter((cue) => cue.auto);
    const key = `owy-charla-auto:${talk.round}:${slide.id}`;
    if (!autos.length || window.sessionStorage.getItem(key)) return;
    window.sessionStorage.setItem(key, "1");
    for (const cue of autos) fireRef.current(cue);
  }, [slide, talk.round, seat.attached, stage]);

  const hush = useCallback(() => {
    if (!seat.command({ type: "hush" })) toast.info("Owy no está conectado");
    else haptic([8, 40, 8]);
  }, [seat]);

  const keys = useRef({ talk, seat, slide, fire, hush });
  keys.current = { talk, seat, slide, fire, hush };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // A presenter's slideshow button sends F5: it must never reload the console mid-talk.
      if (event.key === "F5") return event.preventDefault();
      if (event.metaKey || event.ctrlKey || event.altKey || busy(event.target as Element)) return;
      const { talk: t, seat: s, slide: current, fire: cue, hush: quiet } = keys.current;
      const key = event.key;
      const run = (action: () => void) => {
        event.preventDefault();
        action();
      };
      if (key === "Escape") return run(quiet);
      if (!t.onTalk) return;
      // A held clicker button repeats its key: one press is one build.
      if (event.repeat && NAV_KEYS.has(key)) return event.preventDefault();
      if (key === "ArrowRight" || key === "PageDown" || (key === " " && !ownsSpace(document.activeElement)))
        return run(t.next);
      if (key === "ArrowLeft" || key === "PageUp") return run(t.prev);
      const lower = key.toLowerCase();
      // B, or "." (what Logitech presenters send for black screen).
      if (lower === "b" || key === ".") return run(() => t.toggle("blank"));
      if (lower === "o") return run(() => t.toggle("owy"));
      if (lower === "q") return run(() => t.toggle("qr"));
      if (lower === "s") return run(() => t.toggle("captions"));
      if (lower === "c") return run(t.confetti);
      if (lower === "m") return run(() => s.setListen(LISTENS[(LISTENS.indexOf(s.listen) + 1) % LISTENS.length]));
      const n = Number(key);
      const cues = current?.cues ?? [];
      if (n >= 1 && n <= 9 && cues[n - 1]) return run(() => cue(cues[n - 1]));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const view = { talk, seat, time, slide, questions, top, fire, hush };

  return wide ? <Desk {...view} /> : <Remote {...view} />;
}

type View = {
  talk: Talk;
  seat: Seat;
  time: Clock;
  slide: TalkSlide | null;
  questions: RankedQuestion[];
  top: string | null;
  fire: (cue: TalkCue) => void;
  hush: () => void;
};

// ---------------------------------------------------------------------------
// The Mac
// ---------------------------------------------------------------------------

type SideTab = "owy" | "preguntas" | "ensayo";
const isSideTab = (value: unknown): value is SideTab => value === "owy" || value === "preguntas" || value === "ensayo";

function Desk(view: View) {
  const { talk, seat, time, slide } = view;
  const [tab, setTab] = useStoredState<SideTab>("owy-charla-tab", "owy", isSideTab);
  const next = talk.position ? stepAfter(talk.position) : null;

  return (
    <div className="flex h-(--admin-content-h) flex-col gap-2 p-2">
      <TopBar {...view} />
      <div className="flex min-h-0 flex-1 gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {!talk.onTalk && <StartBanner talk={talk} />}
          <div className="grid shrink-0 grid-cols-2 gap-2">
            <MonitorBox label="Al aire" live>
              <ScaledFrame src="/owy/stage?monitor=program" title="Al aire" />
            </MonitorBox>
            <MonitorBox label={next ? `Siguiente · ${talkSlide(next.slide).title}` : "Siguiente"}>
              {talk.live && talk.params && next ? (
                <NextMonitor
                  live={talk.live}
                  next={{
                    ...talk.params,
                    ...next,
                    ...(next.slide !== talk.params.slide ? { who: "", focus: "" } : {}),
                  }}
                />
              ) : (
                <div className="grid aspect-video place-items-center rounded-md bg-black text-meta text-muted-foreground">
                  {talk.onTalk ? "Fin del deck" : "—"}
                </div>
              )}
            </MonitorBox>
          </div>
          <Panel className="flex min-h-0 flex-1 flex-col">
            <PanelHead
              actions={
                <>
                  <Button size="lg" variant="outline" disabled={!talk.onTalk} onClick={press(() => talk.prev())}>
                    <ChevronLeft /> Anterior <Kbd>←</Kbd>
                  </Button>
                  <Button size="lg" disabled={!talk.onTalk || !next} onClick={press(() => talk.next())}>
                    Siguiente <ChevronRight /> <Kbd>→</Kbd>
                  </Button>
                </>
              }
              meta={slide && talk.position ? stepLabel(slide, talk.position.step) : undefined}
              title={slide ? slide.title : "La charla no está al aire"}
            />
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
              {slide && (
                <p className="max-w-4xl text-[19px] leading-relaxed text-pretty text-foreground">
                  {TALK_NOTES[slide.id] ?? "Sin notas."}
                </p>
              )}
              {slide?.cues?.length ? <Cues cues={slide.cues} view={view} /> : null}
            </div>
          </Panel>
        </div>
        <Panel className="flex w-[400px] shrink-0 flex-col">
          <div className="flex h-11 shrink-0 items-center gap-1 border-b border-border px-2">
            {(
              [
                ["owy", "Owy", Mic],
                [
                  "preguntas",
                  `Preguntas${view.questions.length ? ` · ${view.questions.length}` : ""}`,
                  MessageCircleQuestion,
                ],
                ["ensayo", "Ensayo", Timer],
              ] as [SideTab, string, LucideIcon][]
            ).map(([id, label, Icon]) => (
              <Button
                key={id}
                aria-pressed={tab === id}
                className={cn(tab === id && "bg-raised text-foreground ring-1 ring-input")}
                size="sm"
                variant="ghost"
                onClick={press(() => setTab(id))}
              >
                <Icon /> {label}
              </Button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {tab === "owy" && <OwyPanel seat={seat} talk={talk} wide />}
            {tab === "preguntas" && <QuestionsTab view={view} />}
            {tab === "ensayo" && <Rehearsal time={time} />}
          </div>
        </Panel>
      </div>
      <DeckStrip talk={talk} />
    </div>
  );
}

const stepLabel = (slide: TalkSlide, step: number) =>
  `${slideIndex(slide.id) + 1}/${TALK_SLIDES.length} · ${TALK_SECTIONS[slide.section].title}${
    slideSteps(slide) > 1 ? ` · paso ${Math.min(step, slideSteps(slide) - 1) + 1}/${slideSteps(slide)}` : ""
  }`;

function StartBanner({ talk }: { talk: Talk }) {
  const showing = talk.live ? (SCENES[talk.live.scene]?.title ?? talk.live.scene) : "…";

  return (
    <Panel className="flex shrink-0 items-center gap-4 border-primary/40 p-4">
      <div className="min-w-0 flex-1">
        <p className="text-ui font-semibold">La pantalla está en «{showing}».</p>
        <p className="text-meta text-muted-foreground">
          Empezar pone el lobby al aire y abre la ronda de preguntas de la charla, que dura hasta el final.
        </p>
      </div>
      <Button disabled={talk.loading} size="lg" onClick={talk.start}>
        Empezar la charla
      </Button>
    </Panel>
  );
}

function MonitorBox({ label, live = false, children }: { label: string; live?: boolean; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-center gap-1.5 px-0.5">
        {live && <span className="size-1.5 rounded-full bg-live" />}
        <MicroLabel className="truncate">{label}</MicroLabel>
      </div>
      {children}
    </div>
  );
}

/** The next build as the wall will show it, in the same round (so a vote reveal shows the real votes). */
function NextMonitor({ live, next }: { live: StageState; next: TalkParams }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const state = useMemo<StageState>(() => ({ ...live, params: next, transition: undefined }), [live, next]);
  const stateRef = useRef(state);
  stateRef.current = state;
  const post = useCallback(
    () =>
      frame.current?.contentWindow?.postMessage(
        { type: MONITOR_SHOW, state: stateRef.current },
        window.location.origin
      ),
    []
  );
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return;
      if ((event.data as { type?: string } | null)?.type === MONITOR_READY) post();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [post]);
  const key = JSON.stringify(next);
  useEffect(post, [post, key]);

  return <ScaledFrame frameRef={frame} src="/owy/stage?monitor=preview" title="Siguiente" />;
}

/** The wall buttons' key hints only where the bar has room: on a 1280 laptop they would squeeze the clock. */
const HINT = "max-2xl:hidden";

function TopBar(view: View) {
  const { talk, seat } = view;
  /** Owy's subtitles are off on the wall: like the overlays, a state the operator should not miss. */
  const noCaptions = talk.params?.captions === false;
  const overlay = (id: Overlay, label: string, Icon: LucideIcon, key: string) => (
    <Button
      aria-pressed={Boolean(talk.params?.[id])}
      className={cn(talk.params?.[id] && "bg-warning/20 text-foreground ring-1 ring-warning/60")}
      disabled={!talk.onTalk}
      size="sm"
      title={`Tecla ${key}`}
      variant="outline"
      onClick={press(() => talk.toggle(id))}
    >
      <Icon /> {label} <Kbd className={HINT}>{key}</Kbd>
    </Button>
  );

  return (
    <Panel className="flex h-14 shrink-0 items-center gap-4 px-3">
      <ClockReadout view={view} />
      <ClickerFocus />
      <div className="ml-auto flex items-center gap-1.5">
        {overlay("blank", "Negro", MonitorOff, "B")}
        {overlay("owy", "Owy grande", Eye, "O")}
        {overlay("qr", "QR", QrCode, "Q")}
        <Button
          aria-pressed={noCaptions}
          className={cn(noCaptions && "bg-warning/20 text-foreground ring-1 ring-warning/60")}
          disabled={!talk.onTalk}
          size="sm"
          title="Tecla S"
          variant="outline"
          onClick={press(() => talk.toggle("captions"))}
        >
          <CaptionsOff /> Sin subtítulos <Kbd className={HINT}>S</Kbd>
        </Button>
        <Button
          disabled={!talk.onTalk}
          size="sm"
          title="Tecla C"
          variant="outline"
          onClick={press(() => talk.confetti())}
        >
          <PartyPopper /> Confetti <Kbd className={HINT}>C</Kbd>
        </Button>
        <span className="mx-1 h-6 w-px bg-border" />
        <SeatChip seat={seat} />
        <Button size="sm" variant="destructive" onClick={press(() => view.hush())}>
          <SquareStop /> Callar a Owy <Kbd>Esc</Kbd>
        </Button>
      </div>
    </Panel>
  );
}

/** Elapsed, ahead/behind the plan, and what is left of the section. */
function ClockReadout({ view, compact = false }: { view: View; compact?: boolean }) {
  const { time, slide } = view;
  if (!slide) return <MicroLabel>Sin charla al aire</MicroLabel>;
  if (!time.startAt)
    return (
      <div className="leading-tight">
        <p className="font-terminal text-[22px] text-muted-foreground tabular-nums">0:00</p>
        <MicroLabel>Arranca al salir del lobby</MicroLabel>
      </div>
    );
  const drift = time.elapsed - plannedStart(slide.id);
  const section = BUDGETS.find((budget) => budget.section === slide.section);
  const left = section ? plannedStart(section.first) + section.seconds - time.elapsed : 0;
  const phase =
    time.elapsed < QA_AT
      ? `charla hasta ${clock(QA_AT)}`
      : time.elapsed < QA_END
        ? `Q&A hasta ${clock(QA_END)}`
        : `fin ${clock(TOTAL)}`;
  const tone = Math.abs(drift) < 15 ? "text-success" : drift > 0 ? "text-warning" : "text-info-foreground";

  return (
    <div className={cn("flex items-center gap-4", compact && "gap-3")}>
      <div className="leading-tight">
        <p
          className={cn(
            "font-terminal font-semibold whitespace-nowrap tabular-nums",
            compact ? "text-[26px]" : "text-[28px]"
          )}
        >
          {clock(time.elapsed)}
          <span className="ml-1.5 text-meta font-normal text-muted-foreground">/ {clock(TOTAL)}</span>
        </p>
        <MicroLabel>{phase}</MicroLabel>
      </div>
      <div className="leading-tight">
        <p className={cn("font-terminal text-ui font-semibold whitespace-nowrap tabular-nums", tone)}>
          {Math.abs(drift) < 15 ? "en hora" : drift > 0 ? `+${clock(drift)} atrasado` : `${clock(-drift)} adelantado`}
        </p>
        {!compact && section && (
          <MicroLabel>
            {TALK_SECTIONS[slide.section].title} · {left >= 0 ? `quedan ${clock(left)}` : `pasada ${clock(-left)}`}
          </MicroLabel>
        )}
      </div>
    </div>
  );
}

function SeatChip({ seat }: { seat: Seat }) {
  const { text, tone } = seatLine(seat);

  return (
    <span className="flex max-w-[260px] items-center gap-1.5 truncate font-terminal text-meta text-muted-foreground">
      <span className={cn("size-2 shrink-0 rounded-full", tone)} />
      <span className="truncate">{text}</span>
    </span>
  );
}

function seatLine(seat: Seat): { text: string; tone: string } {
  if (seat.attached) return { text: `Owy conectado · ${seat.attached}`, tone: "bg-success" };
  if (seat.remoteOnline && seat.remote)
    return {
      text: `Mac conectada · hace ${Math.max(0, Math.round((seat.now - seat.remote.receivedAt) / 1000))} s`,
      tone: "bg-success",
    };
  if (seat.tried) return { text: seat.status.message || "Conectando…", tone: "bg-warning" };

  return { text: "Owy sin conectar", tone: "bg-muted-foreground/40" };
}

function Cues({ cues, view, big = false }: { cues: TalkCue[]; view: View; big?: boolean }) {
  return (
    <div className="space-y-2">
      <MicroLabel>Owy en este slide</MicroLabel>
      <div className={cn("grid gap-2", big ? "grid-cols-1" : "grid-cols-[repeat(auto-fill,minmax(260px,1fr))]")}>
        {cues.map((cue, index) => {
          const text = cueText(cue, view.top);

          return (
            <button
              key={cue.label}
              className={cn(
                "flex flex-col gap-1 rounded-lg border border-input bg-raised p-3 text-left shadow-edge transition hover:bg-accent active:scale-[0.99] disabled:opacity-50",
                big && "p-4"
              )}
              disabled={!text}
              type="button"
              onClick={press(() => view.fire(cue))}
            >
              <span className="flex items-center gap-2 text-ui font-semibold">
                {!big && <Kbd>{index + 1}</Kbd>}
                {cue.label}
                <span className="ml-auto font-terminal text-2xs tracking-wider text-muted-foreground uppercase">
                  {cue.auto ? "auto · " : ""}
                  {cue.mode === "say" ? "dice" : "responde"}
                </span>
              </span>
              <span className="line-clamp-3 text-meta text-muted-foreground">
                {text ?? "Espera una pregunta del público."}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function OwyPanel({ seat, talk, wide }: { seat: Seat; talk: Talk; wide: boolean }) {
  const meters = useMicMeters(seat.micId, wide);
  const [text, setText] = useState("");
  const pitch = seat.attached ? (seat.device?.pitch.mode ?? false) : (seat.remote?.pitch ?? false);
  const voice = seat.attached ? seat.device?.voice : seat.remote?.voice;
  const send = (message: SeatCommand) => {
    if (!seat.command(message)) toast.error("Owy no está conectado");
  };
  const words = text.trim();

  return (
    <div className="space-y-5 p-4">
      {wide && (
        <section className="space-y-2">
          <MicroLabel>Conexión</MicroLabel>
          <div className="flex gap-2">
            <Input
              aria-label="Dispositivo"
              className="font-terminal"
              disabled={seat.tried}
              value={seat.deviceId}
              onChange={(e) => seat.setDeviceId(e.target.value)}
            />
            {seat.tried ? (
              <Button variant="outline" onClick={seat.disconnect}>
                <Unplug /> Soltar
              </Button>
            ) : (
              <Button onClick={seat.connect}>
                <Plug /> Conectar
              </Button>
            )}
          </div>
          <p className="text-meta text-muted-foreground">
            {seat.status.message || "Esta pestaña pasa a ser el micrófono y los parlantes del Owy físico."}
          </p>
          <Button className="w-full" disabled={!seat.attached} variant="outline" onClick={seat.prepare}>
            Preparar: Owy escucha y habla por esta compu
          </Button>
        </section>
      )}

      {wide && (
        <section className="space-y-2">
          <MicroLabel>Micrófono</MicroLabel>
          <select
            aria-label="Micrófono"
            className="h-8 w-full rounded-md border border-input bg-raised px-2 text-ui"
            value={seat.micId}
            onChange={(e) => seat.setMicId(e.target.value)}
          >
            <option value="">El del sistema</option>
            {meters.devices.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || "Micrófono"}
              </option>
            ))}
          </select>
          {meters.error && <p className="text-meta text-live-foreground">{meters.error}</p>}
          {(["L", "R"] as const).map((side, index) => (
            <div key={side} className="flex items-center gap-2">
              <span className="w-16 text-meta text-muted-foreground">
                {side === "L" ? "L · Agustín" : "R · Público"}
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-input">
                <div
                  className={cn(
                    "h-full rounded-full transition-[width] duration-75",
                    seat.listen === side || seat.listen === "mix" ? "bg-primary" : "bg-muted-foreground/50"
                  )}
                  style={{ width: `${Math.round(meters.levels[index] * 100)}%` }}
                />
              </div>
            </div>
          ))}
          <label className="flex items-center gap-2 text-meta text-muted-foreground">
            <Switch checked={!seat.raw} onCheckedChange={(on) => seat.setRaw(!on)} />
            Procesar en el navegador (solo para el mic de la Mac)
          </label>
        </section>
      )}

      <section className="space-y-2">
        <MicroLabel>Owy escucha a {wide && <Kbd>M</Kbd>}</MicroLabel>
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-input p-1" role="radiogroup">
          {LISTENS.map((channel) => (
            <button
              key={channel}
              aria-checked={seat.listen === channel}
              className={cn(
                "h-10 rounded-md text-ui font-semibold transition",
                seat.listen === channel
                  ? "bg-primary text-primary-foreground shadow-edge-primary"
                  : "text-muted-foreground"
              )}
              disabled={!seat.attached && !seat.remoteOnline}
              role="radio"
              type="button"
              onClick={press(() => {
                haptic(5);
                seat.setListen(channel);
              })}
            >
              {LISTEN_LABELS[channel]}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <label className="flex items-center justify-between gap-3 text-ui">
          <span>
            Modo charla
            <span className="block text-meta text-muted-foreground">Owy sabe qué slide está en pantalla.</span>
          </span>
          <Switch checked={seat.talkOn} disabled={!wide} onCheckedChange={seat.setTalkOn} />
        </label>
        <label className="flex items-center justify-between gap-3 text-ui">
          <span>
            Modo pitch
            <span className="block text-meta text-muted-foreground">Cada toque graba una propuesta de charla.</span>
          </span>
          <Switch checked={pitch} disabled={!seat.ready} onCheckedChange={(mode) => send({ type: "pitch", mode })} />
        </label>
      </section>

      <section className="space-y-2">
        <MicroLabel>Que Owy diga o conteste</MicroLabel>
        <Textarea
          maxLength={600}
          placeholder="Escribí algo…"
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="grid grid-cols-2 gap-2">
          <Button
            disabled={!words || !seat.ready}
            variant="outline"
            onClick={() => {
              send({ type: "say", text: words });
              setText("");
            }}
          >
            Decir tal cual
          </Button>
          <Button
            disabled={!words || !seat.ready}
            onClick={() => {
              send({ type: "ask", text: words, asker: askerFor(seat.listen) });
              setText("");
            }}
          >
            Que conteste
          </Button>
        </div>
      </section>

      <section className="space-y-1 font-terminal text-meta text-muted-foreground">
        <MicroLabel>Estado</MicroLabel>
        <p>{seatLine(seat).text}</p>
        {voice ? (
          <>
            <p>
              voz {voice.realtime} · {voice.tier ?? "sin modelo"}
            </p>
            {voice.lastTurn && (
              <p>
                último turno {voice.lastTurn.path} · primera palabra{" "}
                {voice.lastTurn.ttfaMs === null ? "—" : `${(voice.lastTurn.ttfaMs / 1000).toFixed(1)} s`} · total{" "}
                {(voice.lastTurn.totalMs / 1000).toFixed(1)} s
              </p>
            )}
          </>
        ) : null}
        {seat.attached && seat.talk && <p className="line-clamp-2">contexto: {seat.talk.slide}</p>}
        {seat.notice && <p className="text-warning">{seat.notice}</p>}
        {!talk.onTalk && <p>La charla no está al aire: Owy no tiene slide.</p>}
      </section>
    </div>
  );
}

function QuestionsTab({ view }: { view: View }) {
  const { talk, seat } = view;
  if (!talk.round)
    return <p className="p-4 text-meta text-muted-foreground">Las preguntas aparecen cuando la charla está al aire.</p>;
  const params = talk.params;
  const who = (question: RankedQuestion, value: TalkParams["who"], label: string) => {
    const active = params?.focus === question.id && params.who === value;

    return (
      <Button
        aria-pressed={active}
        className={cn(active && "bg-primary/15 text-foreground ring-1 ring-primary/60")}
        size="xs"
        variant="outline"
        onClick={press(() => talk.put(active ? { who: "", focus: "" } : { who: value, focus: question.id }))}
      >
        {label}
      </Button>
    );
  };
  const owy = (message: SeatCommand) => {
    if (!seat.command(message)) toast.error("Owy no está conectado");
  };

  return (
    <QuestionsPanel
      extra={(question) => (
        <div className="mt-1.5 flex flex-wrap gap-1">
          <Button
            disabled={!seat.ready}
            size="xs"
            variant="outline"
            onClick={press(() => owy({ type: "say", text: `La pregunta es: «${question.value}»` }))}
          >
            Owy, leela
          </Button>
          <Button
            disabled={!seat.ready}
            size="xs"
            variant="outline"
            onClick={(e) => {
              release(e);
              owy({ type: "ask", text: `Pregunta del público: «${question.value}»`, asker: "audience" });
              talk.put({ who: "owy", focus: question.id });
            }}
          >
            Owy, respondé
          </Button>
          {who(question, "agustin", "Respondo yo")}
          {who(question, "owy", "Responde Owy")}
          {who(question, "both", "Los dos")}
        </div>
      )}
      round={talk.round}
    />
  );
}

function Rehearsal({ time }: { time: Clock }) {
  const rows = time.log.map((visit, index) => {
    const end = time.log[index + 1]?.at ?? time.now;
    const slide = talkSlide(visit.slide);

    return {
      key: `${visit.slide}-${visit.at}`,
      slide,
      real: (end - visit.at) / 1000,
      live: index === time.log.length - 1,
    };
  });

  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <MicroLabel>Tiempos reales por slide</MicroLabel>
        <Button size="xs" variant="outline" onClick={time.restart}>
          Reiniciar reloj
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className="text-meta text-muted-foreground">Se anota solo cada vez que cambia el slide.</p>
      ) : (
        <table className="w-full font-terminal text-meta tabular-nums">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-1 text-left font-normal">Slide</th>
              <th className="py-1 text-right font-normal">Plan</th>
              <th className="py-1 text-right font-normal">Real</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ key, slide, real, live }) => {
              const over = slide.seconds > 0 && real > slide.seconds * 1.2;

              return (
                <tr key={key} className="border-t border-border">
                  <td className={cn("max-w-[200px] truncate py-1", live && "text-foreground")}>{slide.title}</td>
                  <td className="py-1 text-right text-muted-foreground">{clock(slide.seconds)}</td>
                  <td className={cn("py-1 text-right", over ? "text-warning" : "text-foreground")}>{clock(real)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function DeckStrip({ talk }: { talk: Talk }) {
  const current = talk.position?.slide;
  const strip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    strip.current
      ?.querySelector("[aria-current=true]")
      ?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [current]);

  return (
    <div ref={strip} className="flex shrink-0 gap-1.5 overflow-x-auto pb-1">
      {TALK_SLIDES.map((slide, index) => (
        <button
          key={slide.id}
          aria-current={slide.id === current}
          className={cn(
            "flex w-[132px] shrink-0 flex-col gap-0.5 rounded-md border border-border bg-card px-2 pt-1.5 pb-1 text-left transition hover:bg-accent disabled:opacity-50",
            slide.id === current && "border-primary bg-raised ring-1 ring-primary"
          )}
          disabled={!talk.onTalk}
          style={{ borderTopColor: TALK_SECTIONS[slide.section].color, borderTopWidth: 3 }}
          type="button"
          onClick={press(() => talk.go({ slide: slide.id, step: 0 }))}
        >
          <span className="flex items-center justify-between font-terminal text-2xs text-muted-foreground tabular-nums">
            {index + 1}
            <span>{slide.seconds ? clock(slide.seconds) : "—"}</span>
          </span>
          <span className="truncate text-meta font-medium">{slide.title}</span>
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The presenter's phone
// ---------------------------------------------------------------------------

type RemoteTab = "control" | "owy" | "preguntas";
const isRemoteTab = (value: unknown): value is RemoteTab =>
  value === "control" || value === "owy" || value === "preguntas";

function Remote(view: View) {
  const { talk, seat, slide } = view;
  const [tab, setTab] = useStoredState<RemoteTab>("owy-charla-phone-tab", "control", isRemoteTab);
  const next = talk.position ? stepAfter(talk.position) : null;
  const tap = (action: () => void) => (event: React.MouseEvent<HTMLElement>) => {
    release(event);
    haptic(10);
    action();
  };

  return (
    <div className="flex h-(--admin-content-h) flex-col">
      <header className="shrink-0 space-y-1 border-b border-border px-4 py-2">
        <ClockReadout compact view={view} />
        <SeatChip seat={seat} />
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!talk.onTalk && (
          <div className="p-4">
            <StartBanner talk={talk} />
          </div>
        )}
        {tab === "control" && (
          <div className="space-y-4 p-4">
            {slide && talk.position && (
              <div>
                <MicroLabel>{stepLabel(slide, talk.position.step)}</MicroLabel>
                <h2 className="mt-1 text-[26px] leading-tight font-bold text-balance">{slide.title}</h2>
                <p className="mt-1 text-ui text-muted-foreground">
                  Después:{" "}
                  {next ? `${talkSlide(next.slide).title}${next.slide === slide.id ? " (siguiente paso)" : ""}` : "fin"}
                </p>
                <p className="mt-3 text-ui leading-relaxed text-pretty">{TALK_NOTES[slide.id]}</p>
              </div>
            )}
            {slide?.cues?.length ? <Cues big cues={slide.cues} view={view} /> : null}
            <div className="grid grid-cols-5 gap-2">
              {(
                [
                  ["blank", "Negro", MonitorOff],
                  ["owy", "Owy", Eye],
                  ["qr", "QR", QrCode],
                ] as [Overlay, string, LucideIcon][]
              ).map(([id, label, Icon]) => (
                <Button
                  key={id}
                  aria-pressed={Boolean(talk.params?.[id])}
                  className={cn("flex-col gap-0.5", talk.params?.[id] && "bg-warning/20 ring-1 ring-warning/60")}
                  disabled={!talk.onTalk}
                  size="touch"
                  variant="outline"
                  onClick={tap(() => talk.toggle(id))}
                >
                  <Icon /> <span className="text-2xs">{label}</span>
                </Button>
              ))}
              <Button
                aria-pressed={talk.params?.captions === false}
                className={cn(
                  "flex-col gap-0.5",
                  talk.params?.captions === false && "bg-warning/20 ring-1 ring-warning/60"
                )}
                disabled={!talk.onTalk}
                size="touch"
                variant="outline"
                onClick={tap(() => talk.toggle("captions"))}
              >
                <CaptionsOff /> <span className="text-center text-2xs leading-tight">Sin subtítulos</span>
              </Button>
              <Button
                className="flex-col gap-0.5"
                disabled={!talk.onTalk}
                size="touch"
                variant="outline"
                onClick={tap(talk.confetti)}
              >
                <PartyPopper /> <span className="text-2xs">Confetti</span>
              </Button>
            </div>
          </div>
        )}
        {tab === "owy" && <OwyPanel seat={seat} talk={talk} wide={false} />}
        {tab === "preguntas" && <QuestionsTab view={view} />}
      </div>
      {tab === "control" && (
        <div className="grid shrink-0 grid-cols-[1fr_1fr_2fr] gap-2 border-t border-border p-2">
          <Button className="h-16" size="touch" variant="destructive" onClick={tap(view.hush)}>
            <SquareStop /> Callar
          </Button>
          <Button className="h-16" disabled={!talk.onTalk} size="touch" variant="outline" onClick={tap(talk.prev)}>
            <ChevronLeft /> Atrás
          </Button>
          <Button className="h-16 text-[18px]" disabled={!talk.onTalk || !next} size="touch" onClick={tap(talk.next)}>
            Siguiente <ChevronRight />
          </Button>
        </div>
      )}
      <nav
        aria-label="Secciones de la charla"
        className="shrink-0 border-t bg-background pb-[env(safe-area-inset-bottom)]"
      >
        <div className="grid grid-cols-3">
          {(
            [
              ["control", "Control", Timer],
              ["owy", "Owy", Mic],
              [
                "preguntas",
                `Preguntas${view.questions.length ? ` · ${view.questions.length}` : ""}`,
                MessageCircleQuestion,
              ],
            ] as [RemoteTab, string, LucideIcon][]
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              aria-current={tab === id ? "page" : undefined}
              className={cn(
                "flex h-14 touch-manipulation flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
                tab === id ? "text-primary" : "text-muted-foreground"
              )}
              type="button"
              onClick={() => {
                if (tab !== id) haptic(5);
                setTab(id);
              }}
            >
              <Icon className="size-5" />
              {label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
