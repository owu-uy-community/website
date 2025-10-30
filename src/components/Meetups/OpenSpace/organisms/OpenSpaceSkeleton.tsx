import * as React from "react";
import { Skeleton } from "components/shared/ui/skeleton";

export function OpenSpaceSkeleton() {
  // Match the default number of rooms and time slots
  const skeletonRooms = 5;
  const skeletonTimeSlots = 5;

  return (
    <div className="openspace-board w-full p-6">
      {/* Page Title Section */}
      <div className="mb-6">
        <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <Skeleton className="mb-2 h-9 w-80 bg-zinc-800" />
            <Skeleton className="h-5 w-96 bg-zinc-800" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-6 w-32 bg-zinc-800" />
          </div>
        </div>

        {/* Controls Section */}
        <div className="flex flex-col items-stretch gap-3 border-t border-zinc-800 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <Skeleton className="h-10 w-full bg-zinc-800 sm:w-64" />

          <div className="flex gap-2">
            <Skeleton className="h-10 w-32 bg-zinc-800" />
            <Skeleton className="h-10 w-36 bg-zinc-800" />
          </div>
        </div>
      </div>

      {/* Board Section */}
      <div className="flex-1 overflow-auto">
        <div className="relative overflow-hidden rounded-lg border-2 border-zinc-600 shadow-xl">
          <div
            className="grid min-w-[600px] md:min-w-[800px]"
            style={{
              gridTemplateColumns: `120px repeat(${skeletonRooms}, 1fr)`,
            }}
          >
            {/* Header Row - "Horario" cell */}
            <div className="flex h-16 items-center justify-center border-b border-zinc-600 bg-zinc-800 md:h-20">
              <Skeleton className="h-4 w-16 bg-zinc-700" />
            </div>

            {/* Room Headers */}
            {Array.from({ length: skeletonRooms }).map((_, index) => (
              <div
                key={`skeleton-room-${index}`}
                className="flex h-16 items-center justify-center border-b border-l border-zinc-600 bg-zinc-800 px-1 md:h-20"
              >
                <Skeleton className="h-4 w-20 bg-zinc-700" />
              </div>
            ))}

            {/* Time Slots and Cells */}
            {Array.from({ length: skeletonTimeSlots }).map((_, timeIndex) => (
              <React.Fragment key={`skeleton-timeslot-${timeIndex}`}>
                {/* Time Slot Label */}
                <div className="flex h-20 items-center justify-center border-b border-zinc-600 bg-zinc-800 px-1 md:h-24">
                  <Skeleton className="h-4 w-16 bg-zinc-700" />
                </div>

                {/* Room Cells */}
                {Array.from({ length: skeletonRooms }).map((_, roomIndex) => (
                  <div
                    key={`skeleton-cell-${timeIndex}-${roomIndex}`}
                    className="relative h-20 border-b border-l border-zinc-600 bg-zinc-900 p-2 md:h-24"
                  >
                    {/* Randomly show some skeleton cards to make it look more realistic */}
                    {(timeIndex + roomIndex) % 3 === 0 && <Skeleton className="h-full w-full rounded bg-zinc-800" />}
                  </div>
                ))}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
