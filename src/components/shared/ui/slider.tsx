"use client";

import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";

import { cn } from "app/lib/utils";

/**
 * The label goes on the thumbs (`role="slider"`), which is what a screen reader lands on; on
 * the root it named nothing. On touch the slider is a 44px band and its thumbs get 44px targets.
 */
function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root>) {
  const _values = React.useMemo(
    () => (Array.isArray(value) ? value : Array.isArray(defaultValue) ? defaultValue : [min, max]),
    [value, defaultValue, min, max]
  );

  return (
    <SliderPrimitive.Root
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      className={cn(
        "relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50 data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-44 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col pointer-coarse:min-h-11",
        className
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className={
          "relative grow overflow-hidden rounded-full bg-zinc-800 data-[orientation=horizontal]:h-1.5 data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1.5"
        }
      >
        <SliderPrimitive.Range
          data-slot="slider-range"
          className={"absolute bg-yellow-500 data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full"}
        />
      </SliderPrimitive.Track>
      {Array.from({ length: _values.length }, (_, index) => (
        <SliderPrimitive.Thumb
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          data-slot="slider-thumb"
          key={index}
          className="touch-target block size-4 shrink-0 rounded-full border-2 border-yellow-500 bg-white shadow-xs transition-[color,box-shadow] hover:ring-4 hover:ring-yellow-500/50 focus-visible:ring-4 focus-visible:ring-yellow-500/50 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50 pointer-coarse:size-5"
        />
      ))}
    </SliderPrimitive.Root>
  );
}

export { Slider };
