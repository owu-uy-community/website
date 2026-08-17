import * as React from "react";
import { Skeleton } from "components/shared/ui/skeleton";

/**
 * Fallback while the kiosk fetches client-side. Normally unreachable: the
 * kiosk page passes server-fetched initial data, so this never flashes.
 */
export function TimeGridKioskSkeleton() {
  const skeletonRooms = 4;
  const skeletonTimeSlots = 5;

  return (
    <div className="h-full w-full">
      {/* Desktop Grid Skeleton */}
      <div
        className="hidden h-full min-w-full gap-0 lg:grid"
        style={{
          gridTemplateColumns: `minmax(100px, 130px) repeat(${skeletonRooms}, 1fr)`,
          gridTemplateRows: `56px repeat(${skeletonTimeSlots}, minmax(0, 1fr))`,
        }}
      >
        <div className="flex h-full items-center justify-center border-b border-r border-white/10 bg-white/[0.06]">
          <Skeleton className="h-6 w-14 bg-white/10" />
        </div>

        {Array.from({ length: skeletonRooms }).map((_, index) => (
          <div
            key={`skeleton-room-${index}`}
            className="flex h-full items-center justify-center gap-3 border-b border-r border-white/10 bg-white/[0.06] px-3 last:border-r-0"
          >
            <Skeleton className="h-7 w-7 rounded-full bg-white/10" />
            <Skeleton className="h-6 w-24 bg-white/10" />
          </div>
        ))}

        {Array.from({ length: skeletonTimeSlots }).map((_, timeIndex) => (
          <React.Fragment key={`skeleton-timeslot-${timeIndex}`}>
            <div className="flex h-full flex-col items-center justify-center gap-1.5 border-b border-r border-white/10 bg-white/[0.04] px-2">
              <Skeleton className="h-5 w-16 bg-white/10" />
              <Skeleton className="h-4 w-14 bg-white/10" />
            </div>

            {Array.from({ length: skeletonRooms }).map((_, roomIndex) => (
              <div
                key={`skeleton-cell-${timeIndex}-${roomIndex}`}
                className="relative h-full border-b border-r border-white/10 bg-white/[0.02] p-2 last:border-r-0"
              >
                {(timeIndex + roomIndex) % 3 === 0 && <Skeleton className="h-full w-full rounded-lg bg-white/[0.06]" />}
              </div>
            ))}
          </React.Fragment>
        ))}
      </div>

      {/* Mobile Layout Skeleton */}
      <div className="flex flex-col gap-6 lg:hidden">
        {Array.from({ length: skeletonTimeSlots }).map((_, index) => (
          <div key={`skeleton-mobile-${index}`} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <Skeleton className="mb-2 h-3 w-16 bg-white/10" />
                <Skeleton className="mb-1 h-8 w-32 bg-white/10" />
                <Skeleton className="h-3 w-40 bg-white/10" />
              </div>
              <Skeleton className="h-6 w-6 rounded bg-white/10" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
