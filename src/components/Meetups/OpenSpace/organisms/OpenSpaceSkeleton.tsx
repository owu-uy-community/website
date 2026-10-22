import * as React from "react";
import { Skeleton } from "components/shared/ui/skeleton";

const ROOMS = 5;
const SLOTS = 5;

/**
 * Mirrors the real board (the title row, 44px room headers, 128px rows) so nothing jumps when
 * the data lands.
 */
export function OpenSpaceSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Cargando la agenda"
      className="flex h-(--admin-content-h) min-h-0 flex-col md:h-full"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5 border-b border-border px-4 py-3 md:px-5">
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-8 w-[200px] max-md:flex-1" />
        <div className="ml-auto flex gap-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="size-8" />
          <Skeleton className="size-8" />
          <Skeleton className="h-8 w-24" />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <div
          className="grid min-w-[680px] border-b border-border bg-card"
          style={{ gridTemplateColumns: `76px repeat(${ROOMS}, minmax(120px, 1fr))` }}
        >
          <div className="flex h-11 items-end px-3 pb-2">
            <Skeleton className="h-2.5 w-9" />
          </div>
          {Array.from({ length: ROOMS }, (_, index) => (
            <div key={index} className="flex h-11 items-center gap-2 border-l border-border px-3">
              <Skeleton className="size-2 rounded-full" />
              <Skeleton className="h-3.5 w-16" />
            </div>
          ))}
        </div>
        {Array.from({ length: SLOTS }, (_, slot) => (
          <div
            key={slot}
            className="grid min-w-[680px] border-b border-border"
            style={{ gridTemplateColumns: `76px repeat(${ROOMS}, minmax(120px, 1fr))` }}
          >
            <div className="flex h-32 flex-col gap-1.5 px-3 pt-3">
              <Skeleton className="h-3.5 w-10" />
              <Skeleton className="h-3 w-8" />
            </div>
            {Array.from({ length: ROOMS }, (_, room) => (
              <div key={room} className="h-32 border-l border-border p-1.5">
                {(slot + room) % 4 !== 3 ? <Skeleton className="h-full w-full rounded-lg" /> : null}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
