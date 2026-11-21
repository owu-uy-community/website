"use client";

import classNames from "classnames";
import Link from "next/link";
import { m, useInView } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Footprints, Lightbulb, Pause, Play } from "lucide-react";

import { INTERNAL_ROUTES } from "app/lib/constants";

import { OPEN_SPACE_TIMES } from "../talks";
import Lightbox, { openWithMorph, withViewTransition, type LightboxPhoto } from "./Lightbox";
import OpenSpaceScene, { type OpenSpaceSceneName } from "./OpenSpaceScenes";
import Reveal, { EASE_OUT } from "./Reveal";
import SectionHeader from "./SectionHeader";

/* Key phrase highlight, same device the About section uses for skim-reading. */
function Hl({ children }: { children: React.ReactNode }) {
  return <strong className="font-semibold text-[#FBF5E7]">{children}</strong>;
}

const PHOTO_BASE = "/images/conf/openspace";

const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const lasts = ({ start, end }: { start: string; end: string }) => `${minutesOf(end) - minutesOf(start)} min`;

type Step = {
  scene: OpenSpaceSceneName;
  label: string;
  /** The agenda's time (talks.ts), so the explainer can't drift from the Program again. */
  time: string;
  duration: string;
  photo: { src: string; alt: string };
  headline: string;
  /** One entry per paragraph: these are read standing up, in short bursts. */
  body: React.ReactNode[];
  /** The concrete mechanics, so nobody has to infer them from prose. */
  beats: string[];
  tip: React.ReactNode;
};

/*
 * The afternoon as the agenda runs it. The copy leans on what the room looks and sounds like,
 * because the mechanics are easy and the unfamiliar part is the vibe.
 */
const STEPS: Step[] = [
  {
    scene: "apertura",
    label: "Bienvenida",
    time: OPEN_SPACE_TIMES.bienvenida.start,
    duration: lasts(OPEN_SPACE_TIMES.bienvenida),
    photo: {
      src: `${PHOTO_BASE}/bienvenida.webp`,
      alt: "El facilitador con el micrófono frente a la pantalla del mercado de ideas, en La Meetup III",
    },
    headline: "Todos juntos, y una grilla vacía",
    body: [
      <>
        Arrancamos todos en el mismo lugar. El facilitador cuenta la mecánica, presenta los 5 espacios y muestra una
        grilla enorme que está <Hl>completamente vacía</Hl>.
      </>,
      <>
        Ese vacío es a propósito. Es el único momento de la tarde en el que todavía no pasó nada, y el único en el que
        estamos todos juntos.
      </>,
    ],
    beats: [
      "Arrancamos todos juntos",
      "Se presentan los 5 espacios y los bloques de la tarde",
      "Se abre el mercado de ideas",
    ],
    tip: "Si llegás tarde no pasa nada: le preguntás a alguien del staff y te pone al día en un minuto.",
  },
  {
    scene: "mercado",
    label: "Mercado de ideas",
    time: OPEN_SPACE_TIMES.mercado.start,
    duration: lasts(OPEN_SPACE_TIMES.mercado),
    photo: {
      src: `${PHOTO_BASE}/mercado.webp`,
      alt: "Alguien muestra su card «Monorepos: lo bueno y lo malo» mientras propone su tema con el micrófono",
    },
    headline: "Se hace fila para proponer",
    body: [
      <>
        Se hace una fila. Uno por uno agarran el micrófono: <Hl>nombre, tema, treinta segundos</Hl>.
      </>,
      <>
        Cada card entra a la grilla, que se ve en vivo en las pantallas y en el celular. En un rato esa grilla vacía{" "}
        <Hl>queda llena de temas</Hl>.
      </>,
      <>
        Nadie curó nada ni revisó propuestas: lo que quedó en la grilla es, literalmente, lo que la sala quiso hablar.
      </>,
    ],
    beats: [
      "Escribís el título y tu nombre en una card",
      "Treinta segundos de micrófono para contarlo",
      "Tu card entra a la grilla, en vivo",
    ],
    tip: (
      <span>
        No hace falta ser experto. «Quiero aprender sobre X, ¿alguien me cuenta?» es una propuesta perfectamente válida.
        De hecho, son de las que mejor funcionan.
      </span>
    ),
  },
  {
    scene: "sesiones",
    label: "Sesiones",
    time: OPEN_SPACE_TIMES.sesiones.start,
    duration: "5 bloques",
    photo: {
      src: `${PHOTO_BASE}/sesiones.webp`,
      alt: "Una sesión del open space: unas treinta personas en ronda en los sillones, pasándose el micrófono",
    },
    headline: "Cinco espacios, todos a la vez",
    body: [
      <>
        Bloques de <Hl>25 minutos</Hl> con 5 para cambiarse. Mirás la grilla, elegís, entrás.
      </>,
      <>
        Quien propuso <Hl>se hace cargo del espacio</Hl>: lo abre, cuenta de qué va y lo lleva como quiera. Puede
        exponer, moderar la conversación o las dos cosas.
      </>,
      <>Algunas salas quedan con seis personas y otras con treinta, y las dos cosas están bien.</>,
    ],
    beats: [
      "25 minutos de conversación + 5 para cambiar de sala",
      "Quien propone abre el espacio: expone, modera o ambas",
      "Podés entrar y salir en el medio de una sesión",
    ],
    tip: "Si la sala que querías está llena, la grilla en vivo te dice qué hay en las otras cuatro.",
  },
  {
    scene: "clausura",
    label: "Coffee y pasillo",
    time: OPEN_SPACE_TIMES.coffee.start,
    duration: lasts(OPEN_SPACE_TIMES.coffee),
    photo: {
      src: `${PHOTO_BASE}/pasillo.webp`,
      alt: "El café lleno de gente conversando, taza en mano, entre sesiones",
    },
    headline: "La charla sigue en el pasillo",
    body: [
      <>
        Termina el último bloque y se abre el coffee break: es el momento de <Hl>retomar lo que quedó abierto</Hl> con
        la gente que conociste en las sesiones.
      </>,
      <>
        A las {OPEN_SPACE_TIMES.coffee.end} arrancan las charlas, y de acá salen los «esto sigamos en el Slack» que
        después duran meses.
      </>,
    ],
    beats: [
      "Café y charla de pasillo",
      "Retomás lo que quedó abierto",
      `${OPEN_SPACE_TIMES.coffee.end}: arrancan las charlas`,
    ],
    tip: "La charla de pasillo no es una interrupción del evento: para mucha gente es el evento.",
  },
];

/* The principles, each as the answer to the worry it settles. */
const RULES = [
  {
    fear: "¿Y si viene poca gente?",
    title: "Quienes están son las personas correctas",
    body: "No falta nadie. Con seis personas o con treinta, la conversación se arma con quien apareció.",
  },
  {
    fear: "¿Y si no sale como lo imaginé?",
    title: "Lo que pase es lo único que podía pasar",
    body: "No hay una versión ideal de la sesión que te estés perdiendo.",
  },
  {
    fear: "¿Y si se nos acaba el tiempo?",
    title: "Empieza cuando empieza, termina cuando termina",
    body: "La conversación manda, no el reloj.",
  },
];

type GalleryPhoto = LightboxPhoto & { thumb: string; focus: string };

const gallery = (n: number, alt: string, focus = "50% 50%"): GalleryPhoto => {
  const name = `${PHOTO_BASE}/galeria-${String(n).padStart(2, "0")}`;
  return { src: `${name}.webp`, thumb: `${name}-thumb.webp`, alt, focus };
};

const PHOTOS: GalleryPhoto[] = [
  gallery(1, "Aplausos y risas mientras arranca la mañana"),
  gallery(2, "Manos escribiendo propuestas en las cards del mercado de ideas"),
  gallery(3, "Una persona propone su tema con el micrófono, con su card en la mano"),
  gallery(4, "La grilla completa en la pantalla: cinco espacios por cinco bloques, todos con charla"),
  gallery(5, "Una sesión llena, con alguien de pie hablando con el micrófono"),
  gallery(6, "En una ronda, alguien habla sosteniendo el ovillo de lana que hace de objeto para pedir la palabra"),
  gallery(7, "Una sesión frente a la pantalla gigante del temporizador del bloque"),
  gallery(8, "Mate en mano, al borde de una sesión en el Rincón"),
  gallery(9, "Todos sentados en una gran ronda al final del open space"),
  gallery(10, "La grilla de papel pegada en el ventanal, llena de cards escritas a mano, en La Meetup 2024"),
];

/** Seconds a stage stays up before the walkthrough moves on by itself. */
const AUTOPLAY_MS = 9000;

function StagePhoto({ step, className }: { step: Step; className?: string }) {
  return (
    <div className={classNames("relative", className)}>
      <img
        alt={step.photo.alt}
        className="aspect-[4/3] w-full object-cover"
        height={900}
        loading="lazy"
        src={step.photo.src}
        width={1200}
      />
      {/* The origami scene rides on the photo: real people, and the same story in paper */}
      <span className="absolute -bottom-4 -left-3 bg-black p-2 shadow-[0_0_0_1px_rgba(251,245,231,0.12)]">
        <OpenSpaceScene className="h-14 w-[70px]" name={step.scene} />
      </span>
    </div>
  );
}

function Beats({ step, className }: { step: Step; className?: string }) {
  return (
    <ul
      className={classNames(
        "grid gap-3 border-t border-[#FBF5E7]/12 pt-5 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-[#FBF5E7]/12",
        className
      )}
    >
      {step.beats.map((beat) => (
        <li
          key={beat}
          className="text-sm leading-snug text-balance text-[#FBF5E7]/85 sm:px-5 sm:first:pl-0 sm:last:pr-0"
        >
          {beat}
        </li>
      ))}
    </ul>
  );
}

function Tip({ step }: { step: Step }) {
  return (
    <p className="flex items-start gap-2.5 text-sm leading-relaxed text-[#FBF5E7]/80">
      <Lightbulb aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[#F5BB03]" strokeWidth={2} />
      {step.tip}
    </p>
  );
}

export default function OpenSpace() {
  const [step, setStep] = useState(0);
  const [photo, setPhoto] = useState<number | null>(null);
  /**
   * Autoplay is a hint, not a carousel: desktop only, only while the walkthrough is on screen,
   * one pass from the first stage, and the first deliberate interaction (or the pause) ends it.
   */
  const [autoplay, setAutoplay] = useState(true);
  const [canAutoplay, setCanAutoplay] = useState(false);
  const walkthrough = useRef<HTMLDivElement>(null);
  const inView = useInView(walkthrough, { amount: 0.5 });
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    // Desktop only (on a phone the stages are stacked), and never for anyone who asked for less motion
    const desktop = window.matchMedia("(min-width: 1024px)");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setCanAutoplay(desktop.matches && !reduced.matches);
    update();
    desktop.addEventListener("change", update);

    return () => desktop.removeEventListener("change", update);
  }, []);

  const playing = autoplay && canAutoplay && inView;

  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(() => {
      if (step === STEPS.length - 1) setAutoplay(false);
      else setStep(step + 1);
    }, AUTOPLAY_MS);

    return () => clearTimeout(timer);
  }, [playing, step]);

  const takeOver = useCallback(() => setAutoplay(false), []);

  /** Arrow keys walk the stages and carry focus with them, per the tabs pattern. */
  const moveTab = useCallback(
    (event: React.KeyboardEvent, index: number) => {
      const delta = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key];
      const target =
        delta !== undefined
          ? (index + delta + STEPS.length) % STEPS.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? STEPS.length - 1
              : null;
      if (target === null) return;

      event.preventDefault();
      takeOver();
      setStep(target);
      tabs.current[target]?.focus();
    },
    [takeOver]
  );

  const openLightbox = useCallback((index: number, thumb: HTMLImageElement | null) => {
    openWithMorph(thumb, () => setPhoto(index));
  }, []);

  const closeLightbox = useCallback(() => {
    withViewTransition(() => setPhoto(null));
  }, []);

  const stepPhoto = useCallback((delta: number) => {
    withViewTransition(() => {
      setPhoto((current) => (current === null ? current : (current + delta + PHOTOS.length) % PHOTOS.length));
    });
  }, []);

  return (
    <section className="mt-16 w-full scroll-mt-24 sm:mt-24" id="open-space">
      <div className="mx-auto w-full max-w-[1440px] px-8">
        <SectionHeader
          eyebrow="EL CORAZÓN DE LA CONF"
          title={
            <>
              LA AGENDA <span className="text-[#F5BB03]">LA ARMÁS VOS</span>
            </>
          }
        />

        <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,680px)_1fr] lg:gap-14">
          <Reveal delay={0.12} y={22}>
            <p className="text-lg leading-relaxed text-pretty text-[#FBF5E7]/90">
              Media tarde de OWU CONF no tiene agenda hasta que llegás. Se llama{" "}
              <strong className="font-semibold text-[#FBF5E7]">open space</strong> y funciona así: las charlas las
              proponen las personas que están en la sala, el mismo día, y la grilla se arma en vivo. Suena a caos y es
              lo contrario: tiene una mecánica muy simple.
            </p>
          </Reveal>
          {/* Most people won't propose: saying so up front removes the biggest worry */}
          <Reveal delay={0.18} y={22}>
            <ul className="grid gap-px border border-[#FBF5E7]/12 bg-[#FBF5E7]/12 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <li className="bg-black p-5">
                <p className="font-display text-base leading-tight font-extrabold text-[#F5BB03] uppercase">
                  ¿Querés proponer?
                </p>
                <p className="mt-2 text-sm leading-relaxed text-[#FBF5E7]/85">
                  Un título que entre en una card y treinta segundos de micrófono. No hace falta preparar nada.
                </p>
              </li>
              <li className="bg-black p-5">
                <p className="font-display text-base leading-tight font-extrabold text-[#FBF5E7] uppercase">
                  ¿Solo querés participar?
                </p>
                <p className="mt-2 text-sm leading-relaxed text-[#FBF5E7]/85">
                  Mirás la grilla, entrás a la sesión que te interese y salís cuando quieras. Nada más.
                </p>
              </li>
            </ul>
          </Reveal>
        </div>

        {/* Phone: the four stages one after the other, nothing to tap or wait for */}
        <ol className="mt-10 flex flex-col gap-12 lg:hidden">
          {STEPS.map((entry) => (
            <li key={entry.scene}>
              <p className="flex items-baseline gap-3">
                <span className="font-display text-lg font-bold text-[#F5BB03] tabular-nums">{entry.time}</span>
                <span className="font-display text-lg leading-none font-extrabold tracking-[-0.01em] text-[#FBF5E7] uppercase">
                  {entry.label}
                </span>
                <span className="text-xs text-[#FBF5E7]/70">{entry.duration}</span>
              </p>
              <StagePhoto className="mt-4" step={entry} />
              <p className="mt-8 font-display text-2xl leading-[1.05] font-extrabold tracking-[-0.02em] text-[#FBF5E7] uppercase">
                {entry.headline}
              </p>
              {entry.body.map((paragraph, index) => (
                <p key={index} className="mt-3.5 text-base leading-relaxed text-pretty text-[#FBF5E7]/90">
                  {paragraph}
                </p>
              ))}
              <Beats className="mt-6" step={entry} />
              <div className="mt-5">
                <Tip step={entry} />
              </div>
            </li>
          ))}
        </ol>

        {/* Desktop: a timeline to walk on the left, the stage on the right */}
        <div ref={walkthrough} className="mt-12 hidden gap-14 lg:grid lg:grid-cols-[minmax(0,320px)_1fr]">
          <Reveal className="h-full" y={24}>
            <div className="flex h-full flex-col">
              {/* A tablist: it announces «3 de 4» and takes arrow keys, as anyone on a keyboard expects */}
              <div
                aria-label="Etapas del open space"
                aria-orientation="vertical"
                className="relative flex flex-1 flex-col"
                role="tablist"
                onFocusCapture={takeOver}
                onPointerDown={takeOver}
              >
                {/* Spine behind the nodes: 52px time column + 16px gap + half the 22px node */}
                <span
                  aria-hidden="true"
                  className="absolute left-[79px] w-px bg-[#FBF5E7]/15"
                  style={{ top: `${50 / STEPS.length}%`, bottom: `${50 / STEPS.length}%` }}
                />

                {STEPS.map((entry, index) => {
                  const isActive = index === step;

                  return (
                    <button
                      key={entry.scene}
                      ref={(node) => {
                        tabs.current[index] = node;
                      }}
                      aria-controls={`open-space-panel-${index}`}
                      aria-selected={isActive}
                      className="group relative flex w-full flex-1 items-center gap-4 py-3.5 pr-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5BB03]"
                      id={`open-space-tab-${index}`}
                      role="tab"
                      // Roving tabindex: Tab reaches the list once, arrows move within it
                      tabIndex={isActive ? 0 : -1}
                      type="button"
                      onClick={() => setStep(index)}
                      onKeyDown={(event) => moveTab(event, index)}
                    >
                      <span
                        className={classNames(
                          "w-[52px] shrink-0 text-right font-display text-base font-bold tabular-nums transition-colors",
                          isActive ? "text-[#F5BB03]" : "text-[#FBF5E7]/70"
                        )}
                      >
                        {entry.time}
                      </span>
                      {/* Sized against the ink of the label beside it: 22px × √2 ≈ 31px. bg-black masks the spine. */}
                      <span
                        aria-hidden="true"
                        className={classNames(
                          "relative z-10 block h-[22px] w-[22px] shrink-0 rotate-45 bg-black outline outline-2 transition-colors",
                          isActive ? "outline-[#F5BB03]" : "outline-[#FBF5E7]/30 group-hover:outline-[#FBF5E7]/60"
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span
                          className={classNames(
                            "block font-display text-base leading-none font-extrabold tracking-[-0.01em] uppercase transition-colors",
                            isActive ? "text-[#FBF5E7]" : "text-[#FBF5E7]/80 group-hover:text-[#FBF5E7]"
                          )}
                        >
                          {entry.label}
                        </span>
                        <span className="mt-1.5 block text-xs text-[#FBF5E7]/70">{entry.duration}</span>
                        {/* Autoplay progress: also the only hint that it moves on by itself */}
                        {isActive && playing ? (
                          <m.span
                            key={step}
                            animate={{ scaleX: 1 }}
                            aria-hidden="true"
                            className="mt-2 block h-px origin-left bg-[#F5BB03]/70"
                            initial={{ scaleX: 0 }}
                            transition={{ duration: AUTOPLAY_MS / 1000, ease: "linear" }}
                          />
                        ) : null}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* A visible pause for anything that moves on its own (WCAG 2.2.2) */}
              {canAutoplay ? (
                <button
                  className="mt-4 ml-[68px] inline-flex min-h-9 items-center gap-2 self-start text-xs text-[#FBF5E7]/75 transition-colors hover:text-[#FBF5E7] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5BB03]"
                  type="button"
                  onClick={() => {
                    if (autoplay) return setAutoplay(false);
                    if (step === STEPS.length - 1) setStep(0);
                    setAutoplay(true);
                  }}
                >
                  {autoplay ? (
                    <Pause aria-hidden="true" className="h-3.5 w-3.5" />
                  ) : (
                    <Play aria-hidden="true" className="h-3.5 w-3.5" />
                  )}
                  {autoplay ? "Pausar el recorrido" : "Ver el recorrido"}
                </button>
              ) : null}
            </div>
          </Reveal>

          <Reveal className="h-full" delay={0.1} y={24}>
            {/*
             * All four panels share one grid cell, so the card is always as tall as the longest stage
             * and never jumps. Only the active one is visible; the rest reserve height.
             */}
            <div className="grid h-full">
              {STEPS.map((entry, index) => {
                const isActive = index === step;

                return (
                  <div
                    key={entry.scene}
                    aria-hidden={isActive ? undefined : true}
                    aria-labelledby={`open-space-tab-${index}`}
                    className={classNames(
                      "flex flex-col gap-6 border border-[#FBF5E7]/12 bg-[#FBF5E7]/[0.03] p-8 [grid-area:1/1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5BB03]",
                      !isActive && "pointer-events-none invisible"
                    )}
                    id={`open-space-panel-${index}`}
                    role="tabpanel"
                    tabIndex={isActive ? 0 : -1}
                  >
                    <div className="grid grid-cols-[minmax(0,44%)_1fr] items-start gap-8">
                      <m.div
                        animate={isActive ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.98 }}
                        initial={false}
                        transition={{ duration: 0.5, ease: EASE_OUT }}
                      >
                        <StagePhoto step={entry} />
                      </m.div>
                      <m.div
                        animate={isActive ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
                        initial={false}
                        transition={{ duration: 0.45, ease: EASE_OUT, delay: isActive ? 0.1 : 0 }}
                      >
                        <p className="font-display text-[28px] leading-[1.05] font-extrabold tracking-[-0.02em] text-[#FBF5E7] uppercase">
                          {entry.headline}
                        </p>
                        {entry.body.map((paragraph, paragraphIndex) => (
                          <p
                            key={paragraphIndex}
                            className="mt-3.5 text-base leading-relaxed text-pretty text-[#FBF5E7]/90"
                          >
                            {paragraph}
                          </p>
                        ))}
                      </m.div>
                    </div>
                    <Beats className="mt-2" step={entry} />
                    <Tip step={entry} />
                  </div>
                );
              })}
            </div>
          </Reveal>
        </div>

        {/* One eyebrow over the whole row: the two-feet law is a golden rule too, just emphasised */}
        <div className="mt-14">
          <Reveal y={24}>
            <p className="font-display text-sm leading-none font-semibold tracking-[0.18em] text-[#FBF5E7]/75 uppercase">
              Las reglas de oro
            </p>
          </Reveal>

          <Reveal y={24}>
            <ul className="mt-6 grid gap-px border border-[#FBF5E7]/12 bg-[#FBF5E7]/12 sm:grid-cols-3">
              {RULES.map(({ fear, title, body }) => (
                <li key={title} className="flex flex-col bg-black p-5">
                  <p className="text-sm text-[#F5BB03] italic">{fear}</p>
                  <p className="mt-2 font-display text-base leading-tight font-extrabold tracking-[-0.01em] text-[#FBF5E7] uppercase">
                    {title}
                  </p>
                  <p className="mt-2.5 text-sm leading-relaxed text-[#FBF5E7]/80">{body}</p>
                </li>
              ))}
            </ul>
          </Reveal>

          {/* The one nobody expects gets a yellow edge (not a fill: on solid yellow the copy had to be black) */}
          <Reveal delay={0.1} y={24}>
            <div className="mt-4 flex border border-l-4 border-[#FBF5E7]/12 border-l-[#F5BB03] bg-[#F5BB03]/[0.07]">
              <img
                alt="Alguien con su mochila al borde de una sesión, mirando si se suma"
                className="hidden w-40 shrink-0 object-cover sm:block"
                height={600}
                loading="lazy"
                src={`${PHOTO_BASE}/dos-pies.webp`}
                width={900}
              />
              <div className="flex items-start gap-3 px-5 py-4">
                <Footprints aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-[#F5BB03]" strokeWidth={1.8} />
                <div>
                  <p className="font-display text-base leading-tight font-extrabold tracking-[-0.01em] text-[#F5BB03] uppercase">
                    La ley de los dos pies
                  </p>
                  <p className="mt-1.5 max-w-[760px] text-sm leading-relaxed text-[#FBF5E7]/85">
                    Si donde estás no estás aportando ni aprendiendo, usá los dos pies y andá a otro espacio. Se entra y
                    se sale en el medio de una sesión sin pedir permiso: no es mala educación, es el sistema
                    funcionando.
                  </p>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </div>

      {/* Proof: this is what it actually looks like. A swipe strip on phones, the whole set on a desktop. */}
      <Reveal amount={0.15} className="mt-14" delay={0.1} duration={0.9} y={26}>
        <div className="mx-auto w-full max-w-[1440px] lg:px-8">
          <ul className="flex snap-x snap-mandatory [scrollbar-width:none] gap-1 overflow-x-auto px-8 pb-2 lg:grid lg:snap-none lg:grid-cols-5 lg:overflow-visible lg:px-0 lg:pb-0 [&::-webkit-scrollbar]:hidden">
            {PHOTOS.map(({ thumb, alt, focus }, index) => (
              <li key={thumb} className="shrink-0 snap-start">
                <button
                  aria-label={`Ampliar foto: ${alt}`}
                  className="group/item relative block w-[260px] cursor-zoom-in overflow-hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#F5BB03] sm:w-[300px] lg:w-full"
                  type="button"
                  onClick={(event) => openLightbox(index, event.currentTarget.querySelector("img"))}
                >
                  <img
                    alt={alt}
                    className="aspect-[4/3] w-full object-cover transition-transform duration-500 ease-out group-hover/item:scale-105"
                    height={480}
                    loading="lazy"
                    src={thumb}
                    style={{ objectPosition: focus }}
                    width={640}
                  />
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover/item:opacity-100"
                  />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </Reveal>

      <Reveal delay={0.1} y={20}>
        <div className="mx-auto mt-10 flex w-full max-w-[1440px] flex-col items-center gap-4 px-8 text-center">
          <Link
            className="inline-flex items-center gap-2 bg-[#FBF5E7] px-7 py-3.5 font-display text-sm leading-none font-bold text-black uppercase transition-colors hover:bg-[#F5BB03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#F5BB03]"
            href={INTERNAL_ROUTES.conf.openspace}
          >
            La grilla en vivo
            <span aria-hidden="true">→</span>
          </Link>
          <p className="max-w-[460px] text-sm leading-relaxed text-balance text-[#FBF5E7]/75">
            Se llena el sábado 7 desde las {OPEN_SPACE_TIMES.mercado.start}: qué se habla en cada sala, en tiempo real.
            Antes de eso, te cuenta cómo va a ser la tarde.
          </p>
        </div>
      </Reveal>

      <Lightbox
        downloadPrefix="owu-open-space"
        index={photo}
        photos={PHOTOS}
        onClose={closeLightbox}
        onStep={stepPhoto}
      />
    </section>
  );
}
