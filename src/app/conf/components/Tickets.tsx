"use client";

import { RotateCw, Share2 } from "lucide-react";
import { m, useReducedMotion } from "motion/react";
import dynamic from "next/dynamic";
import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useInView } from "react-intersection-observer";

import { CONF_DATES } from "app/lib/constants";
import { client } from "lib/orpc/client";

import { confUtm } from "../utm";

import { drawFront, H, loadBadgeArt, W } from "./badgeArt";
import Countdown from "./Countdown";
import PillLink from "./PillLink";
import Reveal, { EASE_OUT } from "./Reveal";
import SectionHeader from "./SectionHeader";
import SharePanel from "./SharePanel";

/* three.js + the physics engine: fetched only when the section nears the viewport */
const Lanyard = dynamic(() => import("./Lanyard"), { ssr: false });

const NAME_KEY = "owu-conf-badge-name";
/* Storage throws when the visitor blocks it; the name then just isn't remembered */
const stored = <T,>(access: () => T) => {
  try {
    return access();
  } catch {
    return null;
  }
};
const RELEASE_MS = Date.parse(CONF_DATES.ticketsRelease);
/* "20261014T140000Z", the calendar format */
const calendarTime = (ms: number) => new Date(ms).toISOString().replace(/[-:]|\.\d{3}/g, "");
const GOOGLE_CALENDAR = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(
  "Salen las entradas de OWU CONF"
)}&dates=${calendarTime(RELEASE_MS)}/${calendarTime(RELEASE_MS + 30 * 60_000)}&details=${encodeURIComponent("Entradas en https://conf.owu.uy/#entradas")}`;

type Release = {
  /** Null until the server says the tickets are out */
  url: string | null;
  /** The server's clock, carried forward on the visitor's monotonic one */
  clock: () => number;
};

/*
 * Asks the server for the link and its clock: once on load, again when the
 * countdown runs out (and every 10 min meanwhile), and whenever the tab comes
 * back — timers stall in background tabs and on sleeping laptops. The
 * visitor's own clock never decides anything: performance.now() can't be set.
 */
function useTicketRelease() {
  const [release, setRelease] = useState<Release | null>(null);

  useEffect(() => {
    let live = true;
    let released = false;
    let timer: number | undefined;

    const sync = async () => {
      window.clearTimeout(timer);
      const sent = performance.now();
      const answer = await client.conf.getTickets().catch(() => null);
      if (!live) return;
      if (!answer) {
        timer = window.setTimeout(sync, 5_000);
        return;
      }
      // The answer left the server about halfway through the round trip
      const offset = answer.now - (sent + performance.now()) / 2;
      const clock = () => offset + performance.now();
      released = answer.url !== null;
      setRelease({ url: answer.url, clock });
      if (!answer.url) {
        const left = Date.parse(answer.releaseAt) - clock();
        timer = window.setTimeout(sync, Math.min(Math.max(left, 250), 600_000));
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible" && !released) void sync();
    };

    void sync();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      live = false;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return release;
}

/* The release in the visitor's timezone, when it isn't Uruguay's */
function useLocalReleaseTime() {
  const [local, setLocal] = useState<string | null>(null);

  useEffect(() => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const at = (timeZone: string) =>
      new Intl.DateTimeFormat("es", {
        timeZone,
        weekday: "long",
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(RELEASE_MS);
    if (at(zone) !== at("America/Montevideo")) {
      setLocal(`${at(zone)} (${zone.split("/").pop()!.replaceAll("_", " ")})`);
    }
  }, []);

  return local;
}

/* If WebGL or the physics engine fails, the page keeps working with the flat badge */
type FallbackProps = { fallback: ReactNode; children: ReactNode };

class Fallback extends Component<FallbackProps, { failed: boolean }> {
  constructor(props: FallbackProps) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function FlatBadge({ name }: { name: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    void loadBadgeArt().then((art) => ref.current && drawFront(ref.current, art, name));
  }, [name]);

  return <canvas ref={ref} className="mx-auto mt-12 h-auto w-[min(300px,70%)]" height={H} width={W} />;
}

/* Brand shapes flung out from the CTA the moment the tickets go live */
const PIECES = Array.from({ length: 24 }, (_, i) => ({
  angle: (i / 24) * Math.PI * 2,
  distance: 110 + (i % 4) * 34,
  color: ["#F5BB03", "#0162C8", "#FBF5E7"][i % 3],
  clip: ["polygon(0 0, 100% 50%, 0 100%)", "circle(50%)", "inset(0)"][(i * 7) % 3],
}));

function Burst() {
  return (
    <span aria-hidden="true" className="pointer-events-none absolute top-1/2 left-1/2">
      {PIECES.map(({ angle, distance, color, clip }) => (
        <m.span
          key={angle}
          animate={{ x: Math.cos(angle) * distance, y: Math.sin(angle) * distance, opacity: 0, scale: 1, rotate: 200 }}
          className="absolute -mt-2 -ml-2 block h-4 w-4"
          initial={{ x: 0, y: 0, opacity: 1, scale: 0.3, rotate: 0 }}
          style={{ background: color, clipPath: clip }}
          transition={{ duration: 1.3, ease: EASE_OUT }}
        />
      ))}
    </span>
  );
}

const linkClass =
  "underline decoration-[#F5BB03] decoration-2 underline-offset-4 transition-colors hover:text-[#F5BB03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#F5BB03]";
const buttonClass =
  "inline-flex h-11 items-center justify-center gap-2 rounded-full border-2 border-[#FBF5E7]/30 px-4 sm:px-5 font-display text-sm font-bold uppercase text-[#FBF5E7] transition-colors hover:border-[#F5BB03] hover:text-[#F5BB03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#F5BB03]";

export default function Tickets() {
  const release = useTicketRelease();
  const localTime = useLocalReleaseTime();
  const reducedMotion = useReducedMotion() ?? false;
  const [name, setName] = useState("");
  const [side, setSide] = useState<"front" | "back">("front");
  const [celebrations, setCelebrations] = useState(0);
  const waited = useRef(false);
  const { ref: watch, inView } = useInView({ rootMargin: "300px 0px" });
  const column = useRef<HTMLDivElement | null>(null);
  const share = useRef<HTMLDialogElement | null>(null);
  const stage = useCallback(
    (node: HTMLDivElement | null) => {
      column.current = node;
      watch(node);
    },
    [watch]
  );
  const [mounted, setMounted] = useState(false);

  useEffect(() => setName(stored(() => localStorage.getItem(NAME_KEY)) ?? ""), []);
  useEffect(() => {
    if (inView) setMounted(true);
  }, [inView]);

  // Celebrate only a release that happens while the visitor is here, not a page opened after it
  const url = release?.url ?? null;
  useEffect(() => {
    if (release && !url) waited.current = true;
    if (url && waited.current) {
      waited.current = false;
      setCelebrations((n) => n + 1);
    }
  }, [release, url]);

  const rename = (value: string) => {
    setName(value);
    stored(() => localStorage.setItem(NAME_KEY, value));
  };

  return (
    <section className="mx-auto mt-16 w-full max-w-[1440px] scroll-mt-24 px-8 sm:mt-24" id="entradas">
      <div className="grid gap-x-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,540px)] lg:grid-rows-[auto_1fr]">
        <div className="relative z-10 lg:col-start-1 lg:row-start-1">
          <SectionHeader
            eyebrow="ENTRADAS"
            title={
              <>
                TU CREDENCIAL <span className="text-[#F5BB03]">TE ESPERA</span>
              </>
            }
          />
          <Reveal delay={0.12} y={22}>
            {/* One idea per line; bold and the yellow highlight carry the skim */}
            <div className="mt-6 max-w-[560px] space-y-2 text-lg leading-relaxed text-pretty text-[#FBF5E7]/80 [&_mark]:bg-transparent [&_mark]:font-semibold [&_mark]:text-[#F5BB03] [&_strong]:font-semibold [&_strong]:text-[#FBF5E7]">
              <p>
                <strong>OWU CONF es un evento gratuito.</strong>
              </p>
              {url ? (
                <p>
                  Las entradas <mark>ya están disponibles</mark>: reservá la tuya, toma un minuto.
                </p>
              ) : (
                <>
                  <p>
                    Las entradas se liberan el <mark>miércoles 14 de octubre a las 11:00</mark>, hora de Uruguay.
                  </p>
                  <p>
                    Mientras tanto, <strong>armá tu credencial</strong> y <strong>agendá el recordatorio</strong>.
                  </p>
                </>
              )}
            </div>
          </Reveal>
        </div>

        {/* The band hangs from the top of this column */}
        <div
          ref={stage}
          aria-label="Credencial de OWU CONF 2026 colgando de su lanyard. Arrastrala para moverla; el dorso muestra a los sponsors."
          className="relative mt-8 h-[500px] select-none sm:h-[600px] lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:mt-0 lg:h-[700px]"
          role="img"
        >
          {mounted && (
            <Fallback fallback={<FlatBadge name={name} />}>
              {/* Wider than the column (under the copy, out to the page edge) so a flung badge isn't clipped mid-swing */}
              <div className="absolute inset-y-0 right-0 left-0 lg:-right-8 lg:-left-[min(40vw,560px)]">
                <Lanyard
                  column={column}
                  name={name}
                  paused={!inView}
                  reducedMotion={reducedMotion}
                  side={side}
                  spin={celebrations}
                />
              </div>
            </Fallback>
          )}
        </div>

        <div className="relative z-10 mt-8 lg:col-start-1 lg:row-start-2">
          {url ? (
            <m.div
              animate={{ opacity: 1, y: 0 }}
              className="relative w-fit max-sm:mx-auto"
              initial={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.6, ease: EASE_OUT }}
            >
              <p className="font-display text-2xl leading-none font-extrabold tracking-[-0.01em] text-[#F5BB03] uppercase sm:text-3xl">
                ¡Ya están disponibles!
              </p>
              <div className="relative mt-6">
                {celebrations > 0 && <Burst key={celebrations} />}
                <PillLink external href={confUtm(url, "tickets")} sizeClassName="h-14 px-8 text-lg">
                  ¡QUIERO MI ENTRADA! <span aria-hidden="true">↗</span>
                </PillLink>
              </div>
            </m.div>
          ) : (
            <Reveal delay={0.18} y={20}>
              <p className="font-display text-xl leading-none font-extrabold tracking-[-0.01em] text-[#F5BB03] uppercase sm:text-2xl">
                Miércoles 14 de octubre <br className="sm:hidden" />
                11:00 hs
              </p>
              <p className="mt-1.5 text-sm text-[#FBF5E7]/60">
                Hora de Uruguay{localTime && <> · en tu zona: {localTime}</>}
              </p>
              <p className="mt-6 font-display text-xs font-semibold tracking-[0.18em] text-[#FBF5E7]/60 uppercase">
                Las entradas se liberan en
              </p>
              <Countdown
                className="mt-2"
                clock={release?.clock}
                expiredLabel="¡SALEN AHORA!"
                size="lg"
                target={CONF_DATES.ticketsRelease}
              />
              <p className="mt-6 text-base text-[#FBF5E7]/80">
                Agendalo:{" "}
                <a className={linkClass} href={GOOGLE_CALENDAR} rel="noopener" target="_blank">
                  Google Calendar
                </a>{" "}
                ·{" "}
                <a className={linkClass} download href="/owu-conf-entradas.ics">
                  Apple / Outlook (.ics)
                </a>
              </p>
            </Reveal>
          )}

          <Reveal className="mt-12 border-t-2 border-[#FBF5E7]/10 pt-8" delay={0.24} y={20}>
            <label
              className="block font-display text-xs font-semibold tracking-[0.18em] text-[#FBF5E7]/60 uppercase"
              htmlFor="badge-name"
            >
              Tu nombre en la credencial
            </label>
            <input
              autoComplete="name"
              className="mt-3 h-12 w-full max-w-[420px] rounded-none border-2 border-[#FBF5E7]/20 bg-transparent px-4 font-display text-lg font-bold text-[#FBF5E7] placeholder:text-[#FBF5E7]/30 focus:border-[#F5BB03] focus:outline-none"
              id="badge-name"
              maxLength={24}
              onChange={(event) => rename(event.target.value)}
              placeholder="Escribí tu nombre"
              value={name}
            />
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                className={buttonClass}
                onClick={() => setSide(side === "front" ? "back" : "front")}
                type="button"
              >
                <RotateCw aria-hidden="true" className="h-4 w-4" /> {side === "front" ? "Ver sponsors" : "Ver frente"}
              </button>
              {/* Share images carry the "not a ticket" notice; a bare printable badge could pass for the real one */}
              <button className={buttonClass} onClick={() => share.current?.showModal()} type="button">
                <Share2 aria-hidden="true" className="h-4 w-4" /> Compartir
              </button>
            </div>
            <p className="mt-5 flex items-start gap-2 border-l-4 border-[#F5BB03] bg-[#F5BB03]/10 px-3 py-2 text-sm text-[#FBF5E7]">
              <span aria-hidden="true" className="font-display font-extrabold text-[#F5BB03]">
                !
              </span>
              <span>
                <strong className="block font-semibold">
                  La credencial virtual es un juego para compartir online:
                </strong>
                no es una entrada ni da acceso al evento. Para ir a OWU CONF necesitás reservar tu entrada.
              </span>
            </p>
            <p className="mt-4 text-sm text-[#FBF5E7]/50">
              Arrastrá la credencial para moverla. Compartila y contale a tu equipo que vas.
            </p>
          </Reveal>
        </div>
      </div>
      <SharePanel dialog={share} name={name} />
    </section>
  );
}
