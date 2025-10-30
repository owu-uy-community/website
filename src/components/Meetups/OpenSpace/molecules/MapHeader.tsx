"use client";

import * as React from "react";
import { CountdownBadge } from "../atoms/CountdownBadge";

interface MapHeaderProps {
  title: string;
  color: string;
  remainingSeconds: number;
}

/**
 * Header bar for map kiosk with title and countdown
 */
export const MapHeader = React.memo(({ title, color, remainingSeconds }: MapHeaderProps) => {
  return (
    <div
      className="absolute left-0 right-0 top-0 z-20 flex flex-col items-start justify-between gap-4 px-4 py-3 transition-colors duration-500 sm:flex-row sm:items-center sm:px-6 sm:py-4 md:px-4"
      style={{ backgroundColor: color }}
    >
      <h1 className="font-inter text-2xl font-bold uppercase tracking-tight text-black sm:text-4xl md:text-5xl lg:text-6xl xl:text-[72px]">
        {title}
      </h1>
      <div className="[&_>div]:flex [&_>div]:items-center [&_>div]:justify-center">
        <CountdownBadge seconds={remainingSeconds} color={color} />
      </div>
    </div>
  );
});

MapHeader.displayName = "MapHeader";

