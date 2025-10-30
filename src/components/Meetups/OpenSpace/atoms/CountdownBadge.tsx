"use client";

import * as React from "react";

interface CountdownBadgeProps {
  seconds: number;
  color: string;
}

/**
 * Displays remaining time in MM:SS format with colored border
 */
export const CountdownBadge = React.memo(({ seconds, color }: CountdownBadgeProps) => {
  const formatTime = (totalSeconds: number): string => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div
      className="flex w-full items-center justify-center rounded-md border-2 bg-gray-900/50 px-3 py-1 transition-colors duration-500 sm:border-4 sm:px-4 sm:py-2 md:px-6"
      style={{ borderColor: color }}
    >
      <span
        className="text-center font-mono text-3xl font-bold transition-colors duration-500 sm:text-4xl md:text-5xl lg:text-6xl xl:text-[64px]"
        style={{ color }}
      >
        {formatTime(seconds)}
      </span>
    </div>
  );
});

CountdownBadge.displayName = "CountdownBadge";
