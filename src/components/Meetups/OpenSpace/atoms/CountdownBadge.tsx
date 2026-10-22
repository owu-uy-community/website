"use client";

import * as React from "react";

import { formatCountdown } from "lib/utils";

interface CountdownBadgeProps {
  seconds: number;
  color: string;
}

/**
 * Displays the remaining time ("04:59", "1:30:00" past an hour) with a colored border
 */
export const CountdownBadge = React.memo(({ seconds, color }: CountdownBadgeProps) => {
  return (
    <div
      className="flex w-full items-center justify-center rounded-md border-2 bg-black/50 px-3 py-1 transition-colors duration-300 sm:border-4 sm:px-4 sm:py-2 md:px-6"
      style={{ borderColor: color }}
    >
      <span
        className="text-center font-terminal text-3xl font-bold tabular-nums transition-colors duration-300 sm:text-4xl md:text-5xl lg:text-6xl xl:text-[64px]"
        style={{ color }}
      >
        {formatCountdown(seconds)}
      </span>
    </div>
  );
});

CountdownBadge.displayName = "CountdownBadge";
