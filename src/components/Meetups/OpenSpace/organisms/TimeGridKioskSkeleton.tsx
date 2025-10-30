import * as React from "react";
import { Skeleton } from "components/shared/ui/skeleton";
import { Clock } from "lucide-react";

export function TimeGridKioskSkeleton() {
  const skeletonRooms = 5;
  const skeletonTimeSlots = 5;

  return (
    <div className="h-full w-full">
      {/* Desktop Grid Skeleton */}
      <div
        className="openspace-time-grid-kiosk hidden h-full min-w-full gap-0 lg:grid"
        style={{
          gridTemplateColumns: `minmax(100px, 120px) repeat(${skeletonRooms}, 1fr)`,
          gridTemplateRows: `64px repeat(${skeletonTimeSlots}, 1fr)`,
        }}
      >
        {/* Header Row - Clock Icon */}
        <div className="flex h-full items-center justify-center border-b border-r border-gray-700/50 bg-gray-800/80">
          <Clock className="h-6 w-6 animate-pulse text-white lg:h-8 lg:w-8" strokeWidth={2.5} />
        </div>

        {/* Room Headers */}
        {Array.from({ length: skeletonRooms }).map((_, index) => {
          return (
            <div
              key={`skeleton-room-${index}`}
              className="flex h-full items-center justify-center gap-2 border-b border-r border-gray-700/50 bg-gray-800/80 px-2 last:border-r-0 lg:gap-3 lg:px-3"
            >
              <Skeleton className="h-7 w-7 rounded-full bg-white/20 lg:h-10 lg:w-10" />
              <Skeleton className="h-6 w-16 bg-white/20 lg:h-8 lg:w-24" />
            </div>
          );
        })}

        {/* Time Slots and Cells */}
        {Array.from({ length: skeletonTimeSlots }).map((_, timeIndex) => (
          <React.Fragment key={`skeleton-timeslot-${timeIndex}`}>
            {/* Time Label */}
            <div className="flex h-full flex-col items-center justify-center gap-1.5 border-b border-r border-gray-700/50 bg-gray-800/80 px-2">
              <Skeleton className="h-6 w-16 bg-gray-700 lg:h-7 lg:w-20" />
              <Skeleton className="h-6 w-16 bg-gray-700 lg:h-7 lg:w-20" />
            </div>

            {/* Room Cells */}
            {Array.from({ length: skeletonRooms }).map((_, roomIndex) => (
              <div
                key={`skeleton-cell-${timeIndex}-${roomIndex}`}
                className="relative h-full border-b border-r border-gray-700/50 bg-gray-900/40 p-2 last:border-r-0"
              >
                {/* Show skeleton cards in some cells */}
                {(timeIndex + roomIndex) % 3 === 0 && <Skeleton className="h-full w-full rounded-lg bg-gray-800/60" />}
              </div>
            ))}
          </React.Fragment>
        ))}
      </div>

      {/* Mobile Layout Skeleton */}
      <div className="flex flex-col gap-6 lg:hidden">
        {Array.from({ length: skeletonTimeSlots }).map((_, index) => (
          <div key={`skeleton-mobile-${index}`} className="rounded-2xl border border-gray-800 bg-gray-900/50 p-5">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <Skeleton className="mb-2 h-3 w-16 bg-gray-800" />
                <Skeleton className="mb-1 h-8 w-32 bg-gray-800" />
                <Skeleton className="h-3 w-40 bg-gray-800" />
              </div>
              <Skeleton className="h-6 w-6 rounded bg-gray-800" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
