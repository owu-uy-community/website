import classNames from "classnames";

import { SPONSORS_2026 } from "./Sponsors";

type MarqueeProps = {
  className?: string;
};

/* Per-logo height overrides for extreme aspect ratios (empty today; all current lockups are horizontal) */
const LOGO_HEIGHTS: Record<string, string> = {};

/* With 6 sponsors one lap is narrower than the viewport; repeat the set so the loop never shows gaps */
const LOOP = [...SPONSORS_2026, ...SPONSORS_2026];

export default function Marquee({ className }: MarqueeProps) {
  return (
    <div
      className={classNames(
        "group/marquee flex h-[89px] w-full items-center overflow-hidden bg-black",
        className
      )}
    >
      <div
        className="animate-marquee flex w-max items-center group-hover/marquee:[animation-play-state:paused] [&:has(a:focus-visible)]:[animation-play-state:paused]"
        style={{ animationDuration: "40s" }}
      >
        {[0, 1].map((half) => (
          <div key={half} aria-hidden={half === 1} className="flex items-center gap-[56px] pr-[56px]">
            {LOOP.map(({ name, logo, website }, i) => {
              const isClone = half === 1 || i >= SPONSORS_2026.length;

              return (
                <a
                  key={`${name}-${i}`}
                  aria-label={isClone ? undefined : `Sitio de ${name}`}
                  className="shrink-0 opacity-80 transition-[opacity,transform] duration-300 hover:scale-110 hover:!opacity-100 focus-visible:scale-110 focus-visible:!opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-8 focus-visible:outline-[#F5BB03] group-hover/marquee:opacity-40"
                  href={website}
                  rel="noopener"
                  tabIndex={isClone ? -1 : undefined}
                  target="_blank"
                  title={name}
                >
                  <img
                    alt=""
                    className={classNames(
                      "w-auto max-w-none brightness-0 invert",
                      LOGO_HEIGHTS[name] ?? "h-[32px]"
                    )}
                    src={logo}
                  />
                </a>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
