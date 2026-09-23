"use client";

import classNames from "classnames";
import {
  Beer,
  Camera,
  ChevronDown,
  Coffee,
  IdCard,
  Lightbulb,
  MessagesSquare,
  MicVocal,
  PartyPopper,
  Shuffle,
  type LucideIcon,
} from "lucide-react";
import { m } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { CONF_DATES } from "app/lib/constants";

import Reveal, { EASE_OUT } from "./Reveal";
import SectionHeader from "./SectionHeader";

type Session = {
  start: string;
  /** Omitted for the after, which has no scheduled finish */
  end?: string;
  title: string;
  /** One-line teaser shown in the collapsed row, so the agenda scans without clicking */
  blurb: string;
  description: React.ReactNode;
  Icon: LucideIcon;
  /** Hover cue matched to what the icon depicts */
  iconAnim: string;
  /** Rendered under the description when the row is open */
  extra?: React.ReactNode;
};

/*
 * Same highlight treatment as SOBRE OWU CONF: full-strength cream for the concepts
 * a first-timer should catch while skimming, yellow reserved for the single hook.
 */
function Hl({ children, yellow = false }: { children: React.ReactNode; yellow?: boolean }) {
  return (
    <strong className={yellow ? "font-semibold text-[#F5BB03]" : "font-semibold text-[#FBF5E7]"}>{children}</strong>
  );
}

/*
 * Sessions carry wall-clock times; CONF_DATES.event pins both the day and the
 * -03:00 offset, so "now" resolves to the same instant in any visitor timezone.
 */
const CONF_DAY = CONF_DATES.event.slice(0, 10);
const CONF_TZ = CONF_DATES.event.slice(-6);
const instantOf = (hhmm: string) => new Date(`${CONF_DAY}T${hhmm}:00${CONF_TZ}`).getTime();
/* The after has no end time, so give it a window rather than letting it run forever */
const AFTER_WINDOW_MS = 3 * 60 * 60 * 1000;

/*
 * Easter egg: on the day of the conference the running session marks itself and
 * opens. Every other day this resolves to null and the agenda renders as normal.
 */
function useLiveSession(sessions: Session[]) {
  const [live, setLive] = useState<number | null>(null);

  useEffect(() => {
    const read = () => {
      const now = Date.now();
      const i = sessions.findIndex(({ start, end }) => {
        const from = instantOf(start);
        return now >= from && now < (end ? instantOf(end) : from + AFTER_WINDOW_MS);
      });
      setLive(i === -1 ? null : i);
    };
    read();
    const id = setInterval(read, 30_000);
    return () => clearInterval(id);
  }, [sessions]);

  return live;
}

/* Deterministic so the burst matches between server and client render */
const CONFETTI = [
  { dx: -68, dy: 74, dr: -140, delay: 0, cls: "h-2 w-2 bg-[#F5BB03]" },
  { dx: 62, dy: 88, dr: 160, delay: 60, cls: "h-2.5 w-2.5 rounded-full bg-[#FBF5E7]" },
  { dx: -96, dy: 44, dr: 90, delay: 120, cls: "h-2 w-2 bg-[#FBF5E7]" },
  { dx: 104, dy: 52, dr: -110, delay: 40, cls: "h-2 w-2 rounded-full bg-[#F5BB03]" },
  { dx: -34, dy: 104, dr: 200, delay: 150, cls: "h-2.5 w-2.5 bg-[#F5BB03]" },
  { dx: 30, dy: 112, dr: -180, delay: 90, cls: "h-2 w-2 rounded-full bg-[#FBF5E7]" },
  { dx: -118, dy: 18, dr: 120, delay: 190, cls: "h-1.5 w-1.5 bg-[#FBF5E7]" },
  { dx: 122, dy: 24, dr: -95, delay: 30, cls: "h-2 w-2 bg-[#F5BB03]" },
  { dx: -12, dy: 126, dr: 150, delay: 220, cls: "h-2 w-2 rounded-full bg-[#F5BB03]" },
  { dx: 78, dy: 96, dr: -160, delay: 170, cls: "h-1.5 w-1.5 bg-[#FBF5E7]" },
];

/* Triangles and circles in the page's two papers, thrown from the after icon */
function OrigamiConfetti({ burst }: { burst: number }) {
  if (burst === 0) return null;

  return (
    <span
      key={burst}
      aria-hidden="true"
      className="pointer-events-none absolute top-1/2 left-1/2 z-10 block h-0 w-0 motion-reduce:hidden"
    >
      {CONFETTI.map((piece, i) => (
        <span
          key={i}
          className={`animate-agenda-confetti absolute block ${piece.cls}`}
          style={
            {
              "--dx": `${piece.dx}px`,
              "--dy": `${piece.dy}px`,
              "--dr": `${piece.dr}deg`,
              animationDelay: `${piece.delay}ms`,
            } as React.CSSProperties
          }
        />
      ))}
    </span>
  );
}

/*
 * Real proposals from the last edition's open space, at
 * /comunidad/owu/events/la-meetup-2025/openspace. Verbatim apart from normalising
 * the ALL-CAPS ones and trimming the impostor-syndrome title, which ran long for
 * the card. The spread is the point: tooling, carrera, open source, soft skills.
 */
const TOPICS = [
  "Monorepos: lo bueno y lo malo",
  "Probar IA con prompts es un dolor",
  "Síndrome del impostor: contame tu experiencia",
  "Marca personal para devs (no influencers)",
  "Contribuyendo a open source",
  "Local-first software",
  "¿Cómo venimos con el remotismo?",
  "El péndulo del mercado laboral",
  "¿Cómo organizar meetups y conferencias?",
  "Manejar un equipo que usa IA",
];

/* Easter egg: a post-it you can shuffle, exactly like proposing at the marketplace */
function TopicNote() {
  const [i, setI] = useState(0);

  return (
    <button
      className="group/note mt-5 block w-full max-w-[320px] -rotate-[1.5deg] rounded-[3px] bg-[#F5BB03] px-5 pt-3.5 pb-3 text-left shadow-lg shadow-[#F5BB03]/25 transition-transform duration-300 hover:-translate-y-0.5 hover:rotate-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#F5BB03] motion-reduce:transition-none"
      type="button"
      onClick={() => setI((n) => (n + 1) % TOPICS.length)}
    >
      <span className="font-display block text-[10px] font-bold tracking-[0.12em] text-black/45 uppercase">
        Se propusieron en la edición pasada
      </span>
      <span
        key={i}
        className="animate-agenda-note font-display mt-1.5 block min-h-[2.75rem] text-[15px] leading-snug font-semibold text-black motion-reduce:animate-none"
      >
        {TOPICS[i]}
      </span>
      <span className="mt-2 flex items-center gap-1.5 border-t border-black/15 pt-2 text-[11px] font-semibold text-black/55 transition-colors group-hover/note:text-black/80">
        <Shuffle aria-hidden="true" className="h-3 w-3 transition-transform duration-300 group-hover/note:rotate-180" />
        Otra idea
      </span>
    </button>
  );
}

/*
 * The 19:40–19:45 speaker changeover is deliberately absent: it is internal
 * logistics, and the gap between the two talks already shows it.
 */
const SESSIONS: Session[] = [
  {
    start: "14:30",
    end: "15:00",
    title: "Recepción y acreditación",
    blurb: "Registro, credenciales y café de bienvenida",
    description: (
      <>
        Llegás a <Hl>Sinergia Faro</Hl>, retirás tu credencial y arrancás con un café. Media hora pensada para que{" "}
        <Hl yellow>nadie entre solo</Hl>: si es tu primera vez, este es el mejor momento para romper el hielo antes de
        que empiece todo.
      </>
    ),
    Icon: IdCard,
    iconAnim: "group-hover:animate-agenda-pop",
  },
  {
    start: "15:00",
    end: "15:15",
    title: "Bienvenida",
    blurb: "Apertura oficial de la primera edición",
    description: (
      <>
        Quince minutos para ubicarte: <Hl>cómo funciona la tarde, qué es un open space y cómo participar</Hl>. No
        necesitás saber nada de antemano. La organiza la misma comunidad que viene haciendo{" "}
        <Hl yellow>La Meetup desde 2023</Hl>, ahora en formato conferencia.
      </>
    ),
    Icon: PartyPopper,
    iconAnim: "group-hover:animate-agenda-pop",
  },
  {
    start: "15:15",
    end: "16:00",
    title: "Open Space · Mercado de ideas",
    blurb: "Proponé tu tema frente a todos",
    description: (
      <>
        Acá se arma la agenda de la tarde, <Hl yellow>en vivo y entre todos</Hl>.{" "}
        <Hl>Cualquiera puede proponer un tema</Hl> y presentarlo en voz alta frente a todos. Con esas propuestas armamos
        la grilla, acomodando horarios y espacios según lo que necesite cada sesión.{" "}
        <Hl>No hace falta preparar nada ni ser experto</Hl>: alcanza con una pregunta que te dé curiosidad o algo que te
        esté costando en el trabajo.
      </>
    ),
    Icon: Lightbulb,
    iconAnim: "group-hover:animate-agenda-glow",
    extra: <TopicNote />,
  },
  {
    start: "16:00",
    end: "18:25",
    title: "Open Space · Sesiones",
    blurb: "Cinco bloques de conversaciones en simultáneo",
    description: (
      <>
        <Hl>Cinco bloques</Hl> de conversaciones en simultáneo, sobre los temas que propuso la gente. Vos elegís a cuál
        entrar y, si una no te está aportando, te movés a otro espacio: es la <Hl>regla de los dos pies</Hl>. Casi dos
        horas y media en las que <Hl yellow>la conversación la llevás vos</Hl>.
      </>
    ),
    Icon: MessagesSquare,
    iconAnim: "group-hover:animate-agenda-pop",
  },
  {
    start: "18:25",
    end: "19:00",
    title: "Coffee break",
    blurb: "Café, algo rico y networking",
    description: (
      <>
        Treinta y cinco minutos de café, té y algo rico. Suele ser donde pasan{" "}
        <Hl yellow>las mejores conversaciones del día</Hl>: retomás lo que quedó abierto en el open space y conocés
        gente de <Hl>las otras comunidades tech del país</Hl>.
      </>
    ),
    Icon: Coffee,
    iconAnim: "group-hover:animate-agenda-steam",
  },
  {
    start: "19:00",
    end: "19:40",
    title: "Charla 1",
    blurb: "Speaker y título por anunciar",
    description: (
      <>
        Arranca el bloque de cierre con <Hl>cuarenta minutos</Hl> de charla sobre tecnología, comunidad y open source.
        Las dos charlas de la tarde salieron del <Hl>call for speakers abierto a toda la comunidad</Hl>.{" "}
        <Hl yellow>Speaker y título se anuncian muy pronto.</Hl>
      </>
    ),
    Icon: MicVocal,
    iconAnim: "group-hover:animate-agenda-tap",
  },
  {
    start: "19:45",
    end: "20:25",
    title: "Charla 2",
    blurb: "Speaker y título por anunciar",
    description: (
      <>
        La última charla de la tarde, también de <Hl>cuarenta minutos</Hl>, para cerrar a pura tecnología. Historias de
        gente que trabaja <Hl yellow>en el mismo ecosistema que vos</Hl>, con problemas y aprendizajes que vas a
        reconocer.
      </>
    ),
    Icon: MicVocal,
    iconAnim: "group-hover:animate-agenda-tap",
  },
  {
    start: "20:25",
    end: "20:40",
    title: "Despedida y foto",
    blurb: "Agradecimientos y foto de toda la comunidad",
    description: (
      <>
        Cerramos agradeciendo a speakers, sponsors y al equipo de voluntarios que hace posible OWU CONF, y nos sacamos{" "}
        <Hl yellow>la foto de toda la comunidad</Hl>: la misma que venimos repitiendo en cada edición desde 2023.
      </>
    ),
    Icon: Camera,
    iconAnim: "group-hover:animate-agenda-flash",
  },
  {
    start: "20:40",
    title: "After",
    blurb: "Te invitamos a seguirla un rato más",
    description: (
      <>
        Cuando termina la parte formal seguimos cerca, sin agenda y sin horarios. <Hl>Es totalmente opcional</Hl>, pero
        es donde las conversaciones que quedaron por la mitad siguen sin reloj y donde{" "}
        <Hl yellow>se conoce a la gente sin apuro</Hl>. El lugar se anuncia el mismo día.
      </>
    ),
    Icon: Beer,
    iconAnim: "group-hover:animate-agenda-tilt",
  },
];

export default function Program() {
  /* Collapsed by default: the blurbs carry the scan, the caret hints there is more */
  const [openSession, setOpenSession] = useState(-1);
  const [burst, setBurst] = useState(0);
  const live = useLiveSession(SESSIONS);
  const lastLive = useRef<number | null>(null);

  /* Follow the day: when the running session changes, open it. No scroll — that would hijack the page. */
  useEffect(() => {
    if (live !== null && live !== lastLive.current) setOpenSession(live);
    lastLive.current = live;
  }, [live]);

  return (
    <section className="mx-auto mt-[29px] w-full max-w-[1440px] scroll-mt-24 px-8 pt-[37px] pb-8" id="programa">
      <SectionHeader eyebrow="PROGRAMA" title="AGENDA" />

      <Reveal delay={0.15} y={20}>
        <p className="mt-6 max-w-[620px] text-base leading-relaxed text-[#FBF5E7]/80 min-[1440px]:text-lg">
          De 14:30 a 20:40 en Sinergia Faro: open space construido por la comunidad, charlas para cerrar y after.
        </p>
      </Reveal>

      {/* -mx-3 widens the list so the hairlines line up with each row's padded hover surface */}
      <ol className="-mx-3 mt-10 border-t border-[#FBF5E7]/12">
        {SESSIONS.map(({ start, end, title, blurb, description, Icon, iconAnim, extra }, i) => {
          const isOpen = openSession === i;
          const isLive = live === i;

          return (
            <m.li
              key={`${start}-${title}`}
              className="border-b border-[#FBF5E7]/12"
              initial={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.55, delay: i * 0.05, ease: EASE_OUT }}
              viewport={{ amount: 0.4, once: true }}
              whileInView={{ opacity: 1, x: 0 }}
            >
              <button
                aria-expanded={isOpen}
                /*
                 * Mobile stacks the time onto its own row above the title, which buys the title
                 * ~50px of extra column and evens out row heights. From sm up it is one row of
                 * four columns, with the time back in its own gutter.
                 */
                className="group grid w-full grid-cols-[44px_1fr_18px] items-center gap-x-4 gap-y-1.5 rounded-xl px-3 py-4 text-left transition-colors hover:bg-[#FBF5E7]/[0.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-[#F5BB03] min-[1440px]:grid-cols-[48px_150px_1fr_18px] sm:grid-cols-[44px_132px_1fr_18px] sm:gap-x-6 sm:gap-y-0 sm:py-5"
                type="button"
                onClick={() => {
                  if (!isOpen && !end) setBurst((n) => n + 1);
                  setOpenSession(isOpen ? -1 : i);
                }}
              >
                {/* Circles echo the page's shape vocabulary; a rounded square read generic here */}
                <span
                  className={classNames(
                    "relative row-span-2 flex h-11 w-11 items-center justify-center rounded-full border transition-colors duration-300 min-[1440px]:h-12 min-[1440px]:w-12 sm:row-span-1",
                    isOpen
                      ? "border-[#F5BB03] bg-[#F5BB03] text-black"
                      : "border-[#F5BB03]/25 bg-[#F5BB03]/[0.06] text-[#F5BB03] group-hover:border-[#F5BB03]/60 group-hover:bg-[#F5BB03]/15",
                    isLive && "ring-2 ring-[#F5BB03]/40 ring-offset-2 ring-offset-black"
                  )}
                >
                  <Icon
                    aria-hidden="true"
                    className={classNames("h-[21px] w-[21px] motion-reduce:animate-none", iconAnim)}
                    strokeWidth={1.75}
                  />
                  {!end && <OrigamiConfetti burst={burst} />}
                </span>

                <span className="font-display col-start-2 row-start-1 text-[13px] leading-none font-bold text-[#F5BB03] tabular-nums min-[1440px]:text-lg sm:text-base">
                  {start}
                  {end ? (
                    <>
                      <span className="sr-only"> a </span>
                      <span aria-hidden="true" className="mx-1">
                        –
                      </span>
                      {end}
                    </>
                  ) : (
                    <span className="ml-1.5 font-normal text-[#F5BB03]/60">en adelante</span>
                  )}
                </span>

                <span className="col-start-2 row-start-2 min-w-0 sm:col-start-3 sm:row-start-1">
                  <span
                    className={classNames(
                      "block text-[17px] leading-snug font-medium tracking-[-0.01em] transition-colors min-[1440px]:text-[22px] sm:text-xl",
                      isOpen ? "text-[#F5BB03]" : "text-[#FBF5E7] group-hover:text-[#F5BB03]"
                    )}
                  >
                    {title}
                    {isLive && (
                      <span className="font-display ml-2.5 inline-flex items-center gap-1.5 align-middle text-[11px] font-bold tracking-[0.12em] text-[#F5BB03] uppercase">
                        <span className="animate-agenda-now block h-1.5 w-1.5 rounded-full bg-[#F5BB03] motion-reduce:animate-none" />
                        Ahora
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-[13px] leading-snug text-[#FBF5E7]/45 sm:mt-1 sm:text-sm">
                    {blurb}
                  </span>
                </span>

                {/* Points right when collapsed, down when open — the standard disclosure cue */}
                {/* Collapsed carets drift on a staggered loop, so the rows read as openable at rest */}
                <span
                  className={classNames(
                    "col-start-3 row-span-2 row-start-1 flex justify-end min-[1440px]:col-start-4 sm:col-start-4 sm:row-span-1",
                    !isOpen && "animate-agenda-nudge group-hover:animate-none motion-reduce:animate-none"
                  )}
                  style={!isOpen ? { animationDelay: `${i * 0.18}s` } : undefined}
                >
                  <ChevronDown
                    aria-hidden="true"
                    className={classNames(
                      "h-[18px] w-[18px] text-[#F5BB03] transition-transform duration-300",
                      isOpen ? "rotate-0" : "-rotate-90 group-hover:translate-x-0.5"
                    )}
                    strokeWidth={2.25}
                  />
                </span>
              </button>

              <div
                className={classNames(
                  "grid transition-[grid-template-rows] duration-300 ease-out",
                  isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                )}
              >
                <div className="overflow-hidden px-3">
                  {/*
                   * Indents line up with the start of the title column (icon + gap + time + gap).
                   * Mobile keeps a shallower indent: the stacked time column pushes the title to
                   * 134px there, which would leave the copy about 25 characters wide.
                   */}
                  {/* Indent lives on the wrapper so max-w caps the measure, not the padded box */}
                  <div className="pr-1 pb-6 pl-[60px] min-[1440px]:pl-[246px] sm:pr-6 sm:pb-7 sm:pl-[224px]">
                    <p className="max-w-[760px] text-[15px] leading-7 text-pretty text-[#FBF5E7]/70">{description}</p>
                    {extra}
                  </div>
                </div>
              </div>
            </m.li>
          );
        })}
      </ol>
    </section>
  );
}
