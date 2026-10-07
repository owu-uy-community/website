import * as React from "react";
import { Skeleton } from "components/shared/ui/skeleton";

/**
 * Mirrors the real board's dimensions (h-14 header row, h-32 cells)
 * so the layout doesn't jump when data lands.
 */
export function OpenSpaceSkeleton() {
  const skeletonRooms = 4;
  const skeletonTimeSlots = 4;

  return (
    <div className="min-w-0 space-y-4 p-4 md:p-6">
      {/* Page header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <Skeleton className="h-8 w-44" />
          <Skeleton className="mt-2 h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="h-6 w-24" />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <Skeleton className="h-11 w-full md:h-9 xl:w-64" />
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-9 w-24" />
        </div>
      </div>

      {/* Board */}
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="grid" style={{ gridTemplateColumns: `88px repeat(${skeletonRooms}, minmax(170px, 1fr))` }}>
          {/* Corner */}
          <div className="flex h-14 items-center justify-center border-r border-b border-border/60">
            <Skeleton className="h-3 w-10" />
          </div>

          {/* Room headers */}
          {Array.from({ length: skeletonRooms }).map((_, index) => (
            <div
              key={`skeleton-room-${index}`}
              className="flex h-14 items-center justify-center border-r border-b border-border/60"
            >
              <Skeleton className="h-4 w-20" />
            </div>
          ))}

          {/* Time slots and cells */}
          {Array.from({ length: skeletonTimeSlots }).map((_, timeIndex) => (
            <React.Fragment key={`skeleton-timeslot-${timeIndex}`}>
              <div className="flex h-32 flex-col items-center justify-center gap-1.5 border-r border-b border-border/60">
                <Skeleton className="h-3.5 w-12" />
                <Skeleton className="h-3 w-10" />
              </div>

              {Array.from({ length: skeletonRooms }).map((_, roomIndex) => (
                <div
                  key={`skeleton-cell-${timeIndex}-${roomIndex}`}
                  className="relative h-32 border-r border-b border-border/60 p-1.5"
                >
                  {(timeIndex + roomIndex) % 3 === 0 && <Skeleton className="h-full w-full rounded-lg" />}
                </div>
              ))}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
