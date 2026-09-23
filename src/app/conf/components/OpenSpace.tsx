"use client";

import classNames from "classnames";
import Link from "next/link";
import { m } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { DoorOpen, Footprints, Lightbulb, Lock } from "lucide-react";

import { CONF_DATES, INTERNAL_ROUTES } from "app/lib/constants";

import Lightbox, { openWithMorph, withViewTransition, type LightboxPhoto } from "./Lightbox";
import OpenSpaceScene, { type OpenSpaceSceneName } from "./OpenSpaceScenes";
import Reveal, { EASE_OUT } from "./Reveal";
import SectionHeader from "./SectionHeader";

/* Key phrase highlight, same device the About section uses for skim-reading. */
function Hl({ children }: { children: React.ReactNode }) {
  return <strong className="font-semibold text-[#FBF5E7]">{children}</strong>;
}

type Step = {
  scene: OpenSpaceSceneName;
  label: string;
  /** Tentative times, enough to convey the shape of the morning. */
  time: string;
  duration: string;
  headline: string;
  /** One entry per paragraph: these are read standing up, in short bursts. */
  body: React.ReactNode[];
  /** The concrete mechanics, so nobody has to infer them from prose. */
  beats: string[];
  tip: React.ReactNode;
};

/*
 * The four stages as OWU has actually run them since 2023. The copy leans on
 * what the room looks and sounds like, because the mechanics are easy and the
 * unfamiliar part is the vibe.
 */
const STEPS: Step[] = [
  {
    scene: "apertura",
    label: "Apertura",
    time: "10:15",
    duration: "15 min",
    headline: "Todos en ronda, y una grilla vacía",
    body: [
      <>
        No hay escenario ni filas de sillas: <Hl>la sala se arma en círculo</Hl>.
      </>,
      <>
        El facilitador cuenta la mecánica, presenta las salas y señala una grilla enorme que está{" "}
        <Hl>completamente vacía</Hl>.
      </>,
      <>
        Ese vacío es a propósito. Es el único momento del día en el que todavía no pasó nada, y el único en el que
        estamos todos juntos.
      </>,
    ],
    beats: [
      "La sala se sienta en círculo, sin escenario",
      "Se presentan las salas y los bloques del día",
      "Se abre el mercado de ideas",
    ],
    tip: "Si llegás tarde no pasa nada: le preguntás a cualquiera del staff y te pone al día en un minuto.",
  },
  {
    scene: "mercado",
    label: "Mercado de ideas",
    time: "10:30",
    duration: "20 min",
    headline: "Se hace fila para proponer",
    body: [
      <>
        Se hace una fila. Uno por uno agarran el micrófono: <Hl>nombre, tema, treinta segundos</Hl>.
      </>,
      <>
        Después caminan hasta la grilla y cuelgan su card en la sala y el horario que quieran. En veinte minutos esa
        pared vacía <Hl>queda cubierta de papeles</Hl>.
      </>,
      <>
        Nadie curó nada ni revisó propuestas: lo que quedó colgado es, literalmente, lo que la sala quiso hablar.
      </>,
    ],
    beats: [
      "Escribís título y tu nombre en una card",
      "Treinta segundos de micrófono para contarlo",
      "Elegís vos la sala y el bloque",
    ],
    tip: (
      <span>
        No hace falta ser experto. “Quiero aprender sobre X, ¿alguien me cuenta?” es una propuesta perfectamente
        válida. De hecho son de las que mejor funcionan.
      </span>
    ),
  },
  {
    scene: "sesiones",
    label: "Sesiones",
    time: "11:00",
    duration: "4 bloques",
    headline: "Cinco espacios, todos a la vez",
    body: [
      <>
        Bloques de <Hl>25 minutos</Hl> con 5 para cambiarse. Mirás la grilla, elegís, entrás.
      </>,
      <>
        Y ojo: <Hl>no son charlas</Hl>. Quien propuso abre el tema en dos minutos y después habla el que quiera. Son
        conversaciones.
      </>,
      <>Algunas salas quedan con seis personas y otras con treinta, y las dos cosas están bien.</>,
    ],
    beats: [
      "25 minutos de conversación + 5 para cambiar de sala",
      "Quien propuso modera, no expone",
      "Entre bloques hay café y charla de pasillo",
    ],
    tip: "La charla de pasillo entre bloques no es una interrupción del evento: para mucha gente es el evento.",
  },
  {
    scene: "clausura",
    label: "Clausura",
    time: "13:00",
    duration: "15 min",
    headline: "Vuelta a la ronda",
    body: [
      <>
        Todos al círculo otra vez. Se pasa el micrófono y <Hl>cada uno dice en una frase</Hl> qué se lleva de la sala
        en la que estuvo.
      </>,
      <>
        Es la parte donde te enterás de las tres conversaciones que te perdiste, y donde aparecen los “esto sigamos en
        el Slack” que después duran meses.
      </>,
    ],
    beats: [
      "Una frase por persona: qué te llevás",
      "Te enterás de lo que pasó en las otras salas",
      "De acá salen los hilos que siguen después",
    ],
    tip: "Quedate hasta el final aunque estés cansado: la clausura es donde el open space se cierra de verdad.",
  },
];

/* The three principles, in the words the facilitator actually uses. */
const RULES = [
  { title: "Quienes están son las personas correctas", body: "No falta nadie. La conversación se arma con quien apareció." },
  { title: "Lo que pase es lo único que podía pasar", body: "No hay una versión ideal de la sesión que te estés perdiendo." },
  { title: "Empieza cuando empieza, termina cuando termina", body: "La conversación manda, no el reloj." },
];

const PHOTO_BASE = "/images/2024/openspace/la-meetup/openspaceGallery";

const PHOTOS: LightboxPhoto[] = [
  { src: `${PHOTO_BASE}/0/image.webp`, alt: "Una sesión del open space con la card del tema apoyada sobre la mesa del centro" },
  { src: `${PHOTO_BASE}/9/image.webp`, alt: "Alguien proponiendo su tema con el micrófono mientras otra persona escribe la card" },
  { src: `${PHOTO_BASE}/2/image.webp`, alt: "La facilitación del open space frente a la sala, con el temporizador del bloque en pantalla" },
  { src: `${PHOTO_BASE}/3/image.webp`, alt: "Una ronda de veinte personas conversando junto a los ventanales" },
  { src: `${PHOTO_BASE}/1/image.webp`, alt: "Una sesión con demo en pantalla y el público sentado alrededor" },
  { src: `${PHOTO_BASE}/4/image.webp`, alt: "Una ronda de sillas en plena conversación, con el bloque corriendo en la pantalla del fondo" },
  { src: `${PHOTO_BASE}/7/image.webp`, alt: "Una sesión frente al mural geométrico, con alguien pidiendo la palabra" },
  { src: `${PHOTO_BASE}/5/image.webp`, alt: "Una sala llena escuchando a quien propuso el tema" },
  { src: `${PHOTO_BASE}/8/image.webp`, alt: "Una sesión con TV, presentada de pie frente a la gente sentada en sillones" },
  { src: `${PHOTO_BASE}/6/image.webp`, alt: "La apertura del open space, con la sala de pie escuchando la consigna" },
];

/** The day the live board opens, spelled out for the disabled CTA. */
const OPENS_LABEL = new Intl.DateTimeFormat("es-UY", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "America/Montevideo",
}).format(new Date(CONF_DATES.liveBoardOpens));

/** Seconds a step stays up before the walkthrough moves on by itself. */
const AUTOPLAY_MS = 9000;

export default function OpenSpace() {
  const [step, setStep] = useState(0);
  const [photo, setPhoto] = useState<number | null>(null);
  /** Autoplay is a hint, not a carousel: the first deliberate interaction ends it. */
  const [autoplay, setAutoplay] = useState(true);
  /*
   * /conf is prerendered, so this cannot be decided at build time or the answer
   * would be frozen at whatever it was when the page was built. Starts closed
   * (the safe default, and what the server renders) and opens after mount.
   */
  const [liveBoardOpen, setLiveBoardOpen] = useState(false);

  useEffect(() => {
    setLiveBoardOpen(Date.now() >= new Date(CONF_DATES.liveBoardOpens).getTime());
  }, []);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!autoplay) return;
    // Anyone who asked for less motion gets no self-advancing anything.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const timer = setTimeout(() => setStep((current) => (current + 1) % STEPS.length), AUTOPLAY_MS);

    return () => clearTimeout(timer);
  }, [autoplay, step]);

  const takeOver = useCallback(() => setAutoplay(false), []);

  /** Arrow keys walk the steps and carry focus with them, per the tabs pattern. */
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
              LA AGENDA <span className="text-[#F5BB03]">LA HACÉS VOS</span>
            </>
          }
        />

        <Reveal delay={0.12} y={22}>
          <p className="mt-6 max-w-[680px] text-pretty text-lg leading-relaxed text-[#FBF5E7]/90">
            Media jornada de OWU CONF no tiene agenda hasta que llegás. Se llama{" "}
            <strong className="font-semibold text-[#FBF5E7]">open space</strong> y funciona así: las charlas las
            proponen las personas que están en la sala, el mismo día, y la grilla se arma en vivo. Suena a caos y es lo
            contrario: tiene una mecánica muy simple. Estas son las cuatro etapas:
          </p>
        </Reveal>

        {/* Steps: a timeline you can walk on the left, the detail on the right. */}
        <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,340px)_1fr] lg:gap-14">
          <Reveal className="h-full" y={24}>
            {/* Tablist rather than a stack of buttons: it announces "3 de 4" and
                takes arrow keys, which is how anyone on a keyboard expects to move. */}
            <div
              aria-label="Etapas del open space"
              aria-orientation="vertical"
              className="relative flex h-full flex-col"
              role="tablist"
              onFocusCapture={takeOver}
              onPointerDown={takeOver}
            >
              {/* Spine behind the nodes. The steps share the height evenly, so the
                  first and last node centres sit half a step in from each end.
                  Horizontally: 44px time column + 16px gap + half of the 22px node. */}
              <span
                aria-hidden="true"
                className="absolute left-[71px] w-px bg-[#FBF5E7]/15"
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
                    className="group relative flex w-full items-center gap-4 py-3.5 pr-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5BB03] lg:flex-1"
                    id={`open-space-tab-${index}`}
                    role="tab"
                    // Roving tabindex: Tab reaches the list once, arrows move within it.
                    tabIndex={isActive ? 0 : -1}
                    type="button"
                    onClick={() => setStep(index)}
                    onKeyDown={(event) => moveTab(event, index)}
                  >
                    <span
                      className={classNames(
                        "w-[44px] shrink-0 text-right font-display text-sm font-bold tabular-nums transition-colors",
                        isActive ? "text-[#F5BB03]" : "text-[#FBF5E7]/60"
                      )}
                    >
                      {entry.time}
                    </span>

                    {/*
                     * Timeline node, sized against the *ink* of the label and
                     * duration beside it, not their line boxes: the two spans
                     * measure 38px of layout but only 30.4px of actual glyph, and
                     * matching the box made the square overshoot the visible text.
                     * 22px × √2 ≈ 31px. Same size on every step; only the colour
                     * marks the active one. bg-black masks the spine behind it.
                     */}
                    <span
                      aria-hidden="true"
                      className={classNames(
                        "relative z-10 block h-[22px] w-[22px] shrink-0 rotate-45 bg-black outline outline-2 transition-colors",
                        isActive
                          ? "outline-[#F5BB03]"
                          : "outline-[#FBF5E7]/30 group-hover:outline-[#FBF5E7]/60"
                      )}
                    />

                    <span className="min-w-0 flex-1">
                      <span
                        className={classNames(
                          "block font-display text-base font-extrabold uppercase leading-none tracking-[-0.01em] transition-colors",
                          isActive ? "text-[#FBF5E7]" : "text-[#FBF5E7]/75 group-hover:text-[#FBF5E7]"
                        )}
                      >
                        {entry.label}
                      </span>
                      <span className="mt-1.5 block text-xs text-[#FBF5E7]/60">{entry.duration}</span>

                      {/* Autoplay progress — also the only thing that hints it advances */}
                      {isActive && autoplay ? (
                        <m.span
                          animate={{ scaleX: 1 }}
                          aria-hidden="true"
                          className="mt-2 block h-px origin-left bg-[#F5BB03]/70"
                          initial={{ scaleX: 0 }}
                          key={step}
                          transition={{ duration: AUTOPLAY_MS / 1000, ease: "linear" }}
                        />
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>
          </Reveal>

          <Reveal className="h-full" delay={0.1} y={24}>
            {/*
             * All four panels share one grid cell, so the card is always as tall
             * as the longest step and never jumps when you switch. A min-height
             * cannot do this: the content reflows with width, so the tallest
             * step is ~490px at 1280 but ~692px at 1024, and any single floor
             * either still jumps or strands 200px of empty card.
             *
             * Only the active one is visible; the rest reserve height. They stay
             * mounted, which is why the scene animates off a variant instead of
             * a remount.
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
                      "flex flex-col gap-6 border border-[#FBF5E7]/12 bg-[#FBF5E7]/[0.03] p-6 [grid-area:1/1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5BB03] sm:p-8",
                      !isActive && "pointer-events-none invisible"
                    )}
                    id={`open-space-panel-${index}`}
                    role="tabpanel"
                    tabIndex={isActive ? 0 : -1}
                  >
                    <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-8">
                      <OpenSpaceScene
                        animate
                        className="h-32 w-40 shrink-0 self-center sm:h-36 sm:w-44 sm:self-start"
                        name={entry.scene}
                        show={isActive}
                      />
                      <m.div
                        animate={isActive ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
                        initial={false}
                        transition={{ duration: 0.45, ease: EASE_OUT, delay: isActive ? 0.1 : 0 }}
                      >
                        <p className="font-display text-2xl font-extrabold uppercase leading-[1.05] tracking-[-0.02em] text-[#FBF5E7] sm:text-[28px]">
                          {entry.headline}
                        </p>
                        {entry.body.map((paragraph, paragraphIndex) => (
                          <p
                            key={paragraphIndex}
                            className="mt-3.5 text-pretty text-base leading-relaxed text-[#FBF5E7]/90"
                          >
                            {paragraph}
                          </p>
                        ))}
                      </m.div>
                    </div>

                    {/*
                     * Three columns separated by hairline rules. The entries are
                     * different lengths, and equal cells with a divider make an
                     * uneven rag read as deliberate without needing a marker on
                     * each one. On a phone it is a plain stacked list.
                     */}
                    <m.ul
                      animate={{ opacity: isActive ? 1 : 0 }}
                      className="grid gap-3 border-t border-[#FBF5E7]/12 pt-5 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-[#FBF5E7]/12"
                      initial={false}
                      transition={{ duration: 0.4, delay: isActive ? 0.35 : 0 }}
                    >
                      {entry.beats.map((beat) => (
                        <li
                          key={beat}
                          className="text-balance text-sm leading-snug text-[#FBF5E7]/80 sm:px-5 sm:first:pl-0 sm:last:pr-0"
                        >
                          {beat}
                        </li>
                      ))}
                    </m.ul>

                    <m.p
                      animate={{ opacity: isActive ? 1 : 0 }}
                      className="flex items-start gap-2.5 text-sm leading-relaxed text-[#FBF5E7]/70"
                      initial={false}
                      transition={{ duration: 0.4, delay: isActive ? 0.45 : 0 }}
                    >
                      <Lightbulb aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[#F5BB03]" strokeWidth={2} />
                      {entry.tip}
                    </m.p>
                  </div>
                );
              })}
            </div>
          </Reveal>
        </div>

        {/* One eyebrow over the whole row — the two-feet law is a golden rule too,
            it just gets the emphasis. Both columns stretch so the cards match height. */}
        <div className="mt-12">
          <Reveal y={24}>
            <p className="font-display text-sm font-semibold uppercase leading-none tracking-[0.18em] text-[#FBF5E7]/70">
              Las reglas de oro
            </p>
          </Reveal>

          <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_minmax(0,420px)] lg:gap-14">
            <Reveal className="h-full" y={24}>
              <ul className="grid h-full gap-px bg-[#FBF5E7]/12 sm:grid-cols-3">
                {RULES.map(({ title, body }) => (
                  <li key={title} className="flex flex-col bg-black p-5">
                    <p className="font-display text-base font-extrabold uppercase leading-tight tracking-[-0.01em] text-[#FBF5E7]">
                      {title}
                    </p>
                    <p className="mt-2.5 text-sm leading-relaxed text-[#FBF5E7]/75">{body}</p>
                  </li>
                ))}
              </ul>
            </Reveal>

            {/*
             * Emphasised with a yellow edge and heading rather than a yellow fill:
             * on a solid #F5BB03 a cream illustration sits at ~1.6:1 and the body
             * copy had to be black, which read as a different design system.
             */}
            <Reveal className="h-full" delay={0.1} y={24}>
              <div className="flex h-full flex-col items-start gap-4 border border-[#FBF5E7]/12 border-l-4 border-l-[#F5BB03] bg-[#F5BB03]/[0.07] p-5 sm:flex-row sm:gap-5">
                <span
                  aria-hidden="true"
                  className="flex shrink-0 items-center gap-1.5 text-[#F5BB03] [&>svg]:shrink-0"
                >
                  <Footprints className="h-9 w-9" strokeWidth={1.6} />
                  <DoorOpen className="h-6 w-6 opacity-60" strokeWidth={1.6} />
                </span>
                <div>
                  {/* Same type as the three rules beside it — the yellow carries the emphasis. */}
                  <p className="font-display text-base font-extrabold uppercase leading-tight tracking-[-0.01em] text-[#F5BB03]">
                    La ley de los dos pies
                  </p>
                  <p className="mt-2.5 text-sm leading-relaxed text-[#FBF5E7]/75">
                    Si donde estás no estás aportando ni aprendiendo, usá los dos pies y andá a otro espacio. Se entra
                    y se sale en el medio de una sesión sin pedir permiso: no es mala educación, es el sistema
                    funcionando.
                  </p>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </div>

      {/* Proof: this is what it actually looks like. */}
      <Reveal amount={0.2} className="mt-12" delay={0.1} duration={0.9} y={26}>
        <div className="flex snap-x snap-mandatory gap-1 overflow-x-auto px-8 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {PHOTOS.map(({ src, alt }, index) => (
            <button
              key={src}
              aria-label={`Ampliar foto: ${alt}`}
              className="group/item relative shrink-0 snap-start cursor-zoom-in overflow-hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#F5BB03]"
              type="button"
              onClick={(event) => openLightbox(index, event.currentTarget.querySelector("img"))}
            >
              <img
                alt={alt}
                className="h-[180px] w-auto object-cover transition-transform duration-500 ease-out group-hover/item:scale-105 sm:h-[220px] min-[1440px]:h-[260px]"
                loading="lazy"
                src={src}
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover/item:opacity-100"
              />
            </button>
          ))}
        </div>
      </Reveal>

      <Reveal delay={0.1} y={20}>
        <div className="mx-auto mt-10 flex w-full max-w-[1440px] flex-col items-center gap-4 px-8 text-center">
          <p className="max-w-[460px] text-balance text-sm leading-relaxed text-[#FBF5E7]/75">
            {liveBoardOpen
              ? "Esta misma página muestra qué se está hablando en cada sala, en tiempo real."
              : `La grilla en vivo se activa el ${OPENS_LABEL}. Ese día vas a ver acá qué se está hablando en cada sala, en tiempo real.`}
          </p>
          {liveBoardOpen ? (
            <Link
              className="inline-flex items-center gap-2 bg-[#FBF5E7] px-7 py-3.5 font-display text-sm font-bold uppercase leading-none text-black transition-colors hover:bg-[#F5BB03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#F5BB03]"
              href={INTERNAL_ROUTES.conf.openspace}
            >
              Ver la grilla en vivo
              <span aria-hidden="true">→</span>
            </Link>
          ) : (
            <button
              className="inline-flex cursor-not-allowed items-center gap-2 border border-[#FBF5E7]/20 px-7 py-3.5 font-display text-sm font-bold uppercase leading-none text-[#FBF5E7]/35"
              disabled
              type="button"
            >
              <Lock aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2.4} />
              Ver la grilla en vivo
            </button>
          )}
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
