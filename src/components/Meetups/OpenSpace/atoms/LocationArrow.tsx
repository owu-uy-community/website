"use client";

import * as React from "react";

interface LocationArrowProps {
  color: string;
  locationName: string;
}

/**
 * Vertical location label with triangular arrow pointing to map
 */
export const LocationArrow = React.memo(({ color, locationName }: LocationArrowProps) => {
  return (
    <div
      className="absolute right-2 z-20 flex flex-col items-center gap-2 sm:right-3 sm:gap-4 md:gap-6"
      style={{
        top: "calc(120px + (100vh - 120px) / 2)",
        transform: "translateY(-50%)",
      }}
    >
      <div
        className="flex justify-center"
        style={{
          writingMode: "vertical-lr",
          textOrientation: "mixed",
          transform: "rotate(180deg)",
        }}
      >
        <span className="font-inter text-3xl font-bold uppercase tracking-tight text-white sm:text-5xl md:text-6xl lg:text-7xl xl:text-[80px]">
          {locationName}
        </span>
      </div>
      {/* Triangular Arrow */}
      <div className="flex justify-center">
        <svg
          className="h-8 w-8 transition-colors duration-500 sm:h-12 sm:w-12 md:h-16 md:w-16 lg:h-20 lg:w-20"
          viewBox="0 0 60 80"
          fill="none"
          aria-hidden="true"
        >
          <path d="M60 40L0 0L0 80L60 40Z" fill={color} />
        </svg>
      </div>
    </div>
  );
});

LocationArrow.displayName = "LocationArrow";

