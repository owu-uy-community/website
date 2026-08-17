"use client";

import { useState, useEffect } from "react";
import classNames from "classnames";
import "atropos/css";

import Link from "next/link";

import { Container3D } from "components/Meetups/2024/Container3D";

const CONF_URL = "https://conf.owu.uy";
const CONF_LOGO = "/images/logos/conf.webp";

const YELLOW = "#F5BB03";
const BLUE = "#0162C8";

// Headline words, colored like the OWU.CONF poster.
const WORDS = [
  { text: "IDEAS", className: "text-white" },
  { text: "TECNOLOGÍA", className: "text-[#F5BB03]" },
  { text: "COMUNIDAD", className: "text-white" },
  { text: "FUTURO", className: "text-[#0162C8]" },
] as const;

// Right-pointing triangle (the conf ">" chevron) and bottom-right corner wedge.
const TRI_RIGHT = "4,4 96,50 4,96";
const TRI_CORNER = "96,4 96,96 4,96";

const BARCODE =
  "repeating-linear-gradient(0deg, rgba(255,255,255,0.9) 0 1px, transparent 1px 3px, rgba(255,255,255,0.9) 3px 4.5px, transparent 4.5px 7px, rgba(255,255,255,0.9) 7px 8px, transparent 8px 11px)";

// Staggered entrance: invisible until the animation runs, restored for reduced-motion users.
const REVEAL = "opacity-0 motion-safe:animate-fade-up motion-reduce:opacity-100";

function Tri({ fill, points, className }: { fill: string; points: string; className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <polygon points={points} fill={fill} />
    </svg>
  );
}

export default function ConfTicket() {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(false);
  }, []);

  return (
    <Link
      href={CONF_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="OWU CONF — 7 de noviembre 2026, Montevideo. Conseguí tu entrada"
      className="group block w-full max-w-[550px]"
    >
      {/* Desktop 3D version */}
      <div className="hidden sm:block">
        <div className="flex-0 mx-auto flex max-w-[550px] items-center justify-center">
          <Container3D>
            <TicketContent isLoading={isLoading} size="desktop" />
          </Container3D>
        </div>
      </div>

      {/* Mobile flat version */}
      <div className="block w-full sm:hidden">
        <TicketContent isLoading={isLoading} size="mobile" />
      </div>
    </Link>
  );
}

function ConfGeometry({ mobile }: { mobile: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {/* Bold yellow circle, bottom-left — assembles in, then drifts */}
      <span
        data-atropos-offset="2"
        className={classNames(
          "absolute motion-safe:animate-assemble motion-reduce:animate-none [animation-delay:120ms]",
          mobile ? "-bottom-11 -left-9 h-20 w-20" : "-bottom-[4.75rem] -left-14 h-32 w-32"
        )}
      >
        <span className="block h-full w-full motion-safe:animate-drift">
          <span className="block h-full w-full rounded-full bg-[#F5BB03] transition-[filter] duration-500 group-hover:[filter:brightness(1.12)]" />
        </span>
      </span>

      {/* Blue ">" chevron — assembles in, floats, and nudges right on hover */}
      <span
        className={classNames(
          "absolute bottom-0 top-0 my-auto transition-transform duration-500 ease-out group-hover:translate-x-1.5",
          mobile ? "-right-6 h-20 w-20" : "-right-9 h-32 w-32"
        )}
      >
        <span className="block h-full w-full motion-safe:animate-assemble motion-reduce:animate-none [animation-delay:220ms]">
          <span className="block h-full w-full motion-safe:animate-float">
            <Tri fill={BLUE} points={TRI_RIGHT} className="h-full w-full" />
          </span>
        </span>
      </span>

      {/* Yellow corner wedge — assembles in */}
      <span
        className={classNames(
          "absolute right-0 top-0 motion-safe:animate-assemble motion-reduce:animate-none [animation-delay:320ms]",
          mobile ? "h-9 w-9" : "h-14 w-14"
        )}
      >
        <Tri fill={YELLOW} points={TRI_CORNER} className="h-full w-full" />
      </span>
    </div>
  );
}

function TicketContent({ isLoading, size }: { isLoading: boolean; size: "mobile" | "desktop" }) {
  const mobile = size === "mobile";

  return (
    <div
      className={classNames(
        "mx-auto block w-full overflow-hidden border border-[#F5BB03]/20 bg-transparent opacity-100 shadow-[inset_0_4px_30px] shadow-[#0162C8]/10 transition duration-500 ease-in-out",
        "cursor-pointer group-hover:border-[#0162C8]/50",
        mobile ? "rounded-[16px] p-1.5" : "aspect-[2/1] h-full rounded-[30px] p-4 lg:min-w-[550px] lg:max-w-[550px]"
      )}
    >
      <div
        data-atropos-offset="0"
        className={classNames(
          "relative flex h-full flex-row overflow-hidden border-2 border-[#F5BB03] bg-black transition-[box-shadow,border-color] duration-500 ease-in-out group-hover:border-[#0162C8] group-hover:shadow-[0_0_40px_-8px_rgba(1,98,200,0.55)]",
          mobile ? "min-h-[160px] rounded-[8px]" : "rounded-[10px]"
        )}
      >
        {/* Geometric brand layer */}
        <ConfGeometry mobile={mobile} />

        {/* Vignette to keep copy legible over the geometry */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_70%_at_50%_50%,rgba(0,0,0,0.72)_0%,transparent_85%)]" />

        {/* Light sheen sweeping across the ticket */}
        <div className="pointer-events-none absolute inset-y-0 left-0 z-[15] w-1/2 bg-gradient-to-r from-transparent via-white/12 to-transparent mix-blend-screen motion-safe:animate-sheen motion-reduce:hidden" />

        {/* Loading Skeleton Overlay */}
        {isLoading && (
          <div className="pointer-events-none absolute inset-0 z-20 animate-pulse rounded-[10px] bg-black/95 backdrop-blur-xs" />
        )}

        {/* Left section - Logo */}
        <div
          data-atropos-offset="5"
          className={classNames(
            "relative z-10 flex items-center justify-center",
            mobile ? "w-[33%] p-1.5" : "w-[38%] p-5"
          )}
        >
          <img
            alt="OWU CONF"
            className="h-auto w-[94%] object-contain drop-shadow-[0_6px_22px_rgba(1,98,200,0.45)] transition-[transform,filter] duration-500 ease-out group-hover:scale-[1.06] group-hover:drop-shadow-[0_8px_30px_rgba(1,98,200,0.7)]"
            src={CONF_LOGO}
          />
        </div>

        {/* Yellow divider */}
        <div className={classNames("relative z-10 flex items-center", mobile ? "py-2" : "py-4")}>
          <div className="h-[80%] w-[2px] bg-gradient-to-b from-[#F5BB03]/0 via-[#F5BB03]/50 to-[#F5BB03]/0" />
        </div>

        {/* Right section - Info */}
        <div
          data-atropos-offset="3"
          className={classNames(
            "relative z-10 flex flex-1 flex-col items-start text-left",
            mobile ? "justify-between gap-1.5 p-2.5" : "justify-between p-4 lg:p-5"
          )}
        >
          {/* Eyebrow */}
          <p
            style={{ animationDelay: "80ms" }}
            className={classNames(
              "font-terminal uppercase tracking-[0.18em] text-white/45",
              REVEAL,
              mobile ? "text-[6px]" : "text-[8px] lg:text-[9px]"
            )}
          >
            Conferencia · OWU Uruguay
          </p>

          {/* Headline */}
          <h2
            className={classNames(
              "font-display font-extrabold uppercase leading-[1.02] tracking-tight",
              mobile ? "text-[14px]" : "text-[20px] lg:text-[24px]"
            )}
          >
            {WORDS.map(({ text, className }, i) => (
              <span
                key={text}
                style={{ animationDelay: `${180 + i * 90}ms` }}
                className={classNames("block", REVEAL, className)}
              >
                {text}
              </span>
            ))}
          </h2>

          {/* Highlighted date block */}
          <div style={{ animationDelay: "540ms" }} className={classNames("w-full", REVEAL)}>
            <div className="flex items-stretch gap-2">
              <span className="w-[3px] shrink-0 rounded-full bg-[#F5BB03] transition-[box-shadow] duration-500 group-hover:shadow-[0_0_12px_2px_rgba(245,187,3,0.7)]" />
              <div className="flex flex-col justify-center">
                <span
                  className={classNames(
                    "font-terminal uppercase tracking-[0.2em] text-white/40",
                    mobile ? "text-[5px]" : "text-[7px] lg:text-[8px]"
                  )}
                >
                  Fecha
                </span>
                <span
                  className={classNames(
                    "origin-left font-display font-extrabold uppercase leading-none tracking-tight text-[#F5BB03] transition-transform duration-300 ease-out group-hover:scale-[1.05]",
                    mobile ? "text-[13px]" : "text-[17px] lg:text-[20px]"
                  )}
                >
                  7 Noviembre 2026
                </span>
                <span
                  className={classNames(
                    "font-display uppercase tracking-[0.12em] text-white/60",
                    mobile ? "mt-0.5 text-[5px]" : "mt-1 text-[7px] lg:text-[8px]"
                  )}
                >
                  Sinergia Faro — Montevideo, UY
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Tear-off stub */}
        <div
          data-atropos-offset="2"
          className={classNames(
            "relative z-10 flex flex-col items-center justify-center border-l-2 border-dashed border-[#F5BB03]/30 bg-black/80",
            mobile ? "w-[30px] gap-2 py-2.5" : "w-[50px] gap-3.5 py-4"
          )}
        >
          <span
            className={classNames(
              "font-terminal uppercase tracking-[0.25em] text-white/45 [writing-mode:vertical-lr]",
              mobile ? "text-[6px]" : "text-[9px]"
            )}
          >
            Entrada
          </span>

          {/* Barcode with a scanning line */}
          <span
            aria-hidden="true"
            style={{ backgroundImage: BARCODE }}
            className={classNames("relative overflow-hidden rounded-[1px]", mobile ? "h-9 w-3" : "h-16 w-5")}
          >
            <span className="absolute inset-x-0 top-0 h-[2px] bg-[#F5BB03]/90 shadow-[0_0_6px_1px_rgba(245,187,3,0.8)] motion-safe:animate-barcode-scan motion-reduce:hidden" />
          </span>

          <span
            className={classNames(
              "font-display font-bold uppercase tracking-[0.2em] text-[#F5BB03] [writing-mode:vertical-lr]",
              mobile ? "text-[6px]" : "text-[9px]"
            )}
          >
            OWU&nbsp;CONF
          </span>
        </div>
      </div>
    </div>
  );
}
