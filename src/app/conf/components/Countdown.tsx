"use client";

import classNames from "classnames";
import { useEffect, useState } from "react";

type Remaining = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  expired: boolean;
};

/* Sized so a row of four cells fits a 360px viewport inside the page's px-8 gutters */
const SIZES = {
  sm: {
    row: "gap-1.5 sm:gap-2",
    height: "h-14 sm:h-16",
    width: "w-14 sm:w-16",
    number: "text-xl sm:text-2xl",
    expired: "text-lg",
  },
  lg: {
    row: "gap-1.5 sm:gap-3",
    height: "h-14 sm:h-24",
    width: "w-14 sm:w-24",
    number: "text-xl sm:text-4xl",
    expired: "text-lg sm:text-2xl",
  },
} as const;

function getRemaining(targetMs: number): Remaining {
  const diff = targetMs - Date.now();
  const left = Math.max(0, diff);

  return {
    days: Math.floor(left / 86_400_000),
    hours: Math.floor(left / 3_600_000) % 24,
    minutes: Math.floor(left / 60_000) % 60,
    seconds: Math.floor(left / 1_000) % 60,
    expired: diff <= 0,
  };
}

type CountdownProps = {
  /** ISO 8601 with an explicit UTC offset (e.g. "2026-09-15T23:59:59-03:00"): an absolute instant, so every timezone sees the same remaining time */
  target: string;
  /** Replaces the cells once the target passes */
  expiredLabel: string;
  size?: keyof typeof SIZES;
  /** Cells stretch to fill the container instead of keeping their fixed square width */
  fullWidth?: boolean;
  className?: string;
};

/*
 * The conf pages are statically rendered, so the remaining time only exists on the
 * client: zeros on the server pass, real values from the mount effect onwards. The
 * surrounding <Reveal> fade masks the swap.
 */
export default function Countdown({
  target,
  expiredLabel,
  size = "sm",
  fullWidth = false,
  className,
}: CountdownProps) {
  const [remaining, setRemaining] = useState<Remaining | null>(null);
  const sizes = SIZES[size];

  useEffect(() => {
    const targetMs = new Date(target).getTime();
    const update = () => setRemaining(getRemaining(targetMs));

    update();
    const id = setInterval(update, 1000);

    return () => clearInterval(id);
  }, [target]);

  if (remaining?.expired) {
    return (
      <p
        className={classNames(
          "font-display font-bold uppercase leading-none text-[#F5BB03]",
          sizes.expired,
          className
        )}
      >
        {expiredLabel}
      </p>
    );
  }

  const units = [
    { key: "days", value: remaining?.days, label: remaining?.days === 1 ? "DÍA" : "DÍAS", solid: true },
    { key: "hours", value: remaining?.hours, label: remaining?.hours === 1 ? "HORA" : "HORAS", solid: false },
    { key: "minutes", value: remaining?.minutes, label: "MIN", solid: false },
    { key: "seconds", value: remaining?.seconds, label: "SEG", solid: false },
  ];

  return (
    /* Hidden from screen readers: the copy beside each placement carries the date, and a timer re-announcing itself every second is pure noise */
    <div aria-hidden="true" className={classNames("flex", sizes.row, fullWidth && "w-full", className)}>
      {units.map(({ key, value, label, solid }) => (
        <div
          key={key}
          className={classNames(
            "flex flex-col items-center justify-center",
            sizes.height,
            fullWidth ? "flex-1" : `shrink-0 ${sizes.width}`,
            solid ? "bg-[#F5BB03] text-black" : "border-2 border-[#FBF5E7]/15 text-[#FBF5E7]"
          )}
        >
          <span className={classNames("font-display font-extrabold leading-none tabular-nums", sizes.number)}>
            {String(value ?? 0).padStart(2, "0")}
          </span>
          <span
            className={classNames(
              "mt-1 font-display text-[10px] font-bold uppercase tracking-[0.14em]",
              !solid && "text-[#FBF5E7]/50"
            )}
          >
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}
