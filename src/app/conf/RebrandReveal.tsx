"use client";

import { ArrowRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { FaInstagram, FaLinkedin, FaSlack } from "react-icons/fa";

import { SOCIAL_LINKS } from "app/lib/constants";

import ShapeGame from "./ShapeGame";
import SponsorForm from "./SponsorForm";

const MEETUP_LOGO = "/images/events/ticket_logo.webp";
const OWU_LOGO = "/images/logos/conf.webp";
const CMD = "mv la-meetup owu-conf";

const socials = [
  { href: SOCIAL_LINKS.instagram, label: "Instagram", Icon: FaInstagram },
  { href: SOCIAL_LINKS.linkedin, label: "LinkedIn", Icon: FaLinkedin },
  { href: SOCIAL_LINKS.slack, label: "Slack", Icon: FaSlack },
];

const reveal = "animate-fade-up opacity-0 motion-reduce:animate-none motion-reduce:opacity-100";

type Stage = "boot" | "swap" | "done";

function runViewTransition(update: () => void) {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  if (typeof doc.startViewTransition === "function") {
    doc.startViewTransition(() => flushSync(update));
  } else {
    update();
  }
}

export default function RebrandReveal() {
  const [stage, setStage] = useState<Stage>("boot");
  const [typed, setTyped] = useState("");
  const [gameOpen, setGameOpen] = useState(false);
  const [sponsorOpen, setSponsorOpen] = useState(false);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const prefersReduced =
      typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    if (prefersReduced) {
      setTyped(CMD);
      setStage("done");
      return;
    }

    const at = (fn: () => void, delay: number) => {
      timers.current.push(window.setTimeout(fn, delay));
    };

    const TYPE_START = 900;
    const TYPE_STEP = 55;
    for (let i = 1; i <= CMD.length; i += 1) {
      at(() => setTyped(CMD.slice(0, i)), TYPE_START + i * TYPE_STEP);
    }
    const typedDoneAt = TYPE_START + CMD.length * TYPE_STEP;
    at(() => setStage("swap"), typedDoneAt + 320);
    at(() => setStage("done"), typedDoneAt + 320 + 780);

    return () => {
      timers.current.forEach((id) => clearTimeout(id));
      timers.current = [];
    };
  }, []);

  useEffect(() => {
    const seq = [
      "arrowup",
      "arrowup",
      "arrowdown",
      "arrowdown",
      "arrowleft",
      "arrowright",
      "arrowleft",
      "arrowright",
      "b",
      "a",
    ];
    let i = 0;
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === seq[i]) {
        i += 1;
        if (i === seq.length) {
          i = 0;
          runViewTransition(() => setGameOpen(true));
        }
      } else {
        i = k === seq[0] ? 1 : 0;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const showOwu = stage !== "boot";
  const glitching = stage === "swap";
  const busy = gameOpen || sponsorOpen;

  return (
    <div className="relative z-10 flex w-full max-w-3xl flex-col items-center gap-7">
      <div
        className={`${reveal} flex w-full items-center justify-center transition-[height] duration-300 [animation-delay:0.15s] [view-transition-name:conf-logo] ${
          busy ? "h-[clamp(64px,11vw,96px)]" : "h-[clamp(104px,21vw,184px)]"
        }`}
      >
        <div className={`relative flex h-full w-full items-center justify-center ${glitching ? "animate-glitch" : ""}`}>
          <img
            src={MEETUP_LOGO}
            alt="La Meetup"
            className={`absolute inset-0 m-auto max-h-full max-w-[92%] object-contain drop-shadow-[0_10px_30px_rgba(0,0,0,0.6)] transition-opacity duration-500 motion-reduce:transition-none ${
              showOwu ? "opacity-0" : "opacity-100"
            }`}
          />
          <img
            src={OWU_LOGO}
            alt="OWU CONF"
            className={`absolute inset-0 m-auto max-h-full max-w-[92%] object-contain drop-shadow-[0_10px_34px_rgba(1,98,200,0.45)] transition-opacity duration-500 motion-reduce:transition-none ${
              showOwu ? "opacity-100" : "opacity-0"
            } ${stage === "done" ? "animate-float" : ""}`}
          />
        </div>
      </div>

      {!busy && (
        <div className={`${reveal} w-full max-w-md [animation-delay:0.3s]`}>
          <div
            className={`overflow-hidden rounded-lg border border-white/15 bg-white/[0.03] text-left shadow-[0_8px_30px_rgba(0,0,0,0.45)] [view-transition-name:conf-window] ${
              stage === "swap" ? "animate-terminal-pulse" : ""
            }`}
          >
            <div className="flex items-center gap-1.5 border-b border-white/10 px-3 py-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F56]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#FFBD2E]" />
              <button
                type="button"
                onClick={() => runViewTransition(() => setGameOpen(true))}
                aria-label="Jugar"
                className="h-2.5 w-2.5 rounded-full bg-[#27C93F] outline-none transition-transform hover:scale-125 focus-visible:scale-125"
              />
              <span className="ml-2 font-terminal text-[0.65rem] tracking-tight text-white/35">owu@conf: ~/2026</span>
            </div>
            <p className="flex items-center gap-2 px-4 py-2.5 font-terminal text-xs lowercase text-white/55 sm:text-sm">
              <span className="text-[#F5BB03]">$</span>
              <span className="tracking-wide text-white/85">{typed || " "}</span>
              <span
                className="inline-block h-[1.05em] w-[0.5em] animate-blink bg-[#F5BB03] align-middle motion-reduce:animate-none"
                aria-hidden="true"
              />
            </p>
          </div>
        </div>
      )}

      {gameOpen && <ShapeGame onClose={() => runViewTransition(() => setGameOpen(false))} />}

      <SponsorForm open={sponsorOpen} onClose={() => runViewTransition(() => setSponsorOpen(false))} />

      {!sponsorOpen && (
        <div className={`${reveal} flex flex-col items-center gap-1 [animation-delay:0.45s]`}>
          <p className="font-display text-2xl font-extrabold uppercase leading-none tracking-wide text-[#F5BB03] sm:text-3xl">
            7 Noviembre 2026
          </p>
          <p className="font-display text-sm font-medium uppercase tracking-[0.18em] text-white/75 sm:text-base">
            Sinergia Faro — Montevideo, Uruguay
          </p>
        </div>
      )}

      {!busy && (
        <>
          <p className={`${reveal} max-w-xl text-base leading-relaxed text-white/60 [animation-delay:0.55s]`}>
            Un espacio donde personas apasionadas por la tecnología se reúnen, comparten y convierten sus ideas en
            realidad.
          </p>

          <div className={`${reveal} mt-1 [animation-delay:0.65s]`}>
            <button
              type="button"
              onClick={() => runViewTransition(() => setSponsorOpen(true))}
              className="group relative inline-flex h-[54px] items-center gap-2.5 overflow-hidden rounded-full border-2 border-[#F5BB03] bg-[#F5BB03] px-8 font-display text-base font-extrabold uppercase tracking-wide text-black outline-none transition-[transform,box-shadow,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-[#0162C8] hover:shadow-[0_12px_34px_-8px_rgba(245,187,3,0.55)] focus-visible:ring-2 focus-visible:ring-[#F5BB03] focus-visible:ring-offset-2 focus-visible:ring-offset-black active:translate-y-0 sm:text-lg"
            >
              <span
                aria-hidden="true"
                className="absolute -inset-x-6 inset-y-0 z-0 -translate-x-[130%] -skew-x-12 bg-[#0162C8] transition-transform duration-300 ease-out group-hover:translate-x-0"
              />
              <span className="relative z-10 transition-colors duration-200 ease-out group-hover:text-white">
                Quiero ser sponsor
              </span>
              <ArrowRight className="relative z-10 h-4 w-4 transition-[transform,color] duration-200 ease-out group-hover:translate-x-1 group-hover:text-white" />
            </button>
          </div>

          <div className={`${reveal} flex gap-3 [animation-delay:0.75s]`}>
            {socials.map(({ href, label, Icon }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={label}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 text-white/70 transition-colors duration-200 hover:border-[#F5BB03] hover:bg-[#F5BB03] hover:text-black"
              >
                <Icon size={20} />
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
