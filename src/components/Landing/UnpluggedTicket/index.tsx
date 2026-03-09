"use client";

import { useState, useEffect } from "react";
import classNames from "classnames";
import "atropos/css";

import Link from "next/link";

import { Container3D } from "components/Meetups/2024/Container3D";

const UNPLUGGED_URL = "https://unplugged.owu.uy/";

export default function UnpluggedTicket() {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(false);
  }, []);

  return (
    <Link href={UNPLUGGED_URL} target="_blank" rel="noopener noreferrer" className="block w-full max-w-[550px]">
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

function TicketContent({ isLoading, size }: { isLoading: boolean; size: "mobile" | "desktop" }) {
  const mobile = size === "mobile";

  return (
    <div
      className={classNames(
        "mx-auto block w-full overflow-hidden border border-yellow-400/20 bg-transparent opacity-100 shadow-[inset_0_4px_30px] shadow-yellow-900/10 transition duration-500 ease-in-out",
        "cursor-pointer hover:border-yellow-400/40",
        mobile ? "rounded-[16px] p-1.5" : "aspect-[2/1] h-full rounded-[30px] p-4 lg:min-w-[550px] lg:max-w-[550px]"
      )}
    >
      <div className={classNames(
        "relative flex h-full flex-row overflow-hidden border-2 border-yellow-400 bg-black transition duration-500 ease-in-out",
        mobile ? "min-h-[160px] rounded-[8px]" : "rounded-[10px]"
      )}>
        {/* Diagonal light sweep */}
        <div className="absolute left-1/2 top-1/2 h-[300%] w-1/2 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-gradient-to-r from-[#facc1500] via-[#facc1518] to-[#facc1500]" />
        {/* Ambient corner glow */}
        <div className="absolute -left-20 -top-20 h-[200px] w-[200px] rounded-full bg-yellow-400/[0.04] blur-3xl" />
        <div className="absolute -bottom-20 -right-20 h-[200px] w-[200px] rounded-full bg-yellow-400/[0.03] blur-3xl" />

        {/* Loading Skeleton Overlay */}
        {isLoading && (
          <div className="pointer-events-none absolute inset-0 z-20 animate-pulse rounded-[10px] bg-black/95 backdrop-blur-sm" />
        )}

        {/* Left section - Logo */}
        <div className={classNames(
          "relative flex items-center justify-center",
          mobile ? "w-[32%] p-1.5" : "w-[42%] p-6"
        )}>
          <img
            alt="OWU Unplugged"
            className="h-[90%] w-[90%] object-contain drop-shadow-[0_0_20px_rgba(250,204,21,0.1)]"
            src="/images/events/unplugged_logo.png"
          />
        </div>

        {/* Yellow divider */}
        <div className={classNames("flex items-center", mobile ? "py-2" : "py-4")}>
          <div className="h-[85%] w-[2px] bg-yellow-400/40" />
        </div>

        {/* Right section - Info */}
        <div className={classNames(
          "relative flex flex-1 flex-col items-start text-left",
          mobile ? "justify-center gap-2" : "justify-between",
          mobile ? "p-2.5" : "p-5 lg:p-6"
        )}>
          {/* Title */}
          <div>
            <h2 className={classNames(
              "font-pixel leading-relaxed",
              mobile ? "text-[9px]" : "text-[11px] lg:text-[14px]"
            )}>
              <span className="text-white">OWU </span>
              <span className="text-yellow-400">UNPLUGGED</span>
            </h2>

            {/* Tagline */}
            <p className={classNames(
              "[text-wrap:balance] font-pixel text-gray-300",
              mobile ? "mt-1 text-[6px] leading-relaxed" : "mt-3 text-[7px] leading-loose lg:text-[9px]"
            )}>
              WHERE CURIOSITY POWERS THE CODE
            </p>
          </div>

          {/* Date + Sponsor */}
          <div className="flex flex-col items-start">
            <p className={classNames(
              "font-pixel text-gray-400",
              mobile ? "text-[7px]" : "text-[9px] lg:text-[11px]"
            )}>
              <span className="text-yellow-400">APRIL 18TH</span>, 2026
            </p>

            {/* Sponsor */}
            <div className={classNames("flex items-center", mobile ? "mt-1.5" : "mt-3")}>
              <img
                alt="Rootstrap"
                className={classNames("-ml-2 object-contain mix-blend-screen", mobile ? "w-[70px]" : "w-[100px] lg:w-[120px]")}
                src="/images/archive/sponsors/rootstrap.webp"
              />
            </div>
          </div>
        </div>

        {/* Tear-off strip */}
        <div className={classNames(
          "flex flex-col items-center justify-center border-l-2 border-dashed border-yellow-400/30 bg-black",
          mobile ? "w-[28px]" : "w-[48px]"
        )}>
          <span className={classNames(
            "font-pixel tracking-widest text-white [writing-mode:vertical-lr]",
            mobile ? "text-[5px]" : "text-[8px]"
          )}>
            CLAIM IT HERE
          </span>
          <div className={classNames("h-px bg-yellow-400/30", mobile ? "my-1.5 w-2.5" : "my-3 w-4")} />
          <span className={classNames(
            "font-pixel tracking-widest text-yellow-400 [writing-mode:vertical-lr]",
            mobile ? "text-[5px]" : "text-[8px]"
          )}>
            TICKET
          </span>
        </div>
      </div>
    </div>
  );
}
