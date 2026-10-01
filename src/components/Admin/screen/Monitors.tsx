"use client";

import { useEffect, useState } from "react";
import { MonitorOff } from "lucide-react";

import { cn } from "app/lib/utils";
import type { ObsView } from "lib/obs/actions";
import { getObsClient } from "lib/obs/client";

/**
 * Preview | Program, refreshed from OBS at 1 fps (0.5 fps on narrow screens,
 * paused while the tab is hidden) when this tab has the socket; name-only
 * when it mirrors the executor's report. PENDIENTE shows while a change
 * waits for OBS.
 */
function Monitor({
  label,
  scene,
  image,
  pending,
  tone,
}: {
  label: string;
  scene: string;
  image: string | null;
  pending: boolean;
  tone: "program" | "preview";
}) {
  return (
    <div
      className={cn(
        "relative aspect-video w-full overflow-hidden rounded-lg border-2 bg-black",
        tone === "program" ? "border-red-500/80" : "border-green-500/70",
        pending && "animate-pulse border-amber-400"
      )}
    >
      {image ? (
        <img alt={scene} className="h-full w-full object-contain" src={image} />
      ) : (
        <div className="text-muted-foreground flex h-full w-full items-center justify-center">
          {scene ? (
            <span className="line-clamp-2 px-4 pt-4 text-center text-lg font-bold text-white/80">{scene}</span>
          ) : (
            <MonitorOff className="h-8 w-8 opacity-40" />
          )}
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between p-2">
        <span
          className={cn(
            "rounded px-2 py-0.5 text-[11px] font-bold tracking-wider uppercase",
            tone === "program" ? "bg-red-600 text-white" : "bg-green-600 text-white"
          )}
        >
          {label}
        </span>
        {pending && (
          <span className="rounded bg-amber-400 px-2 py-0.5 text-[11px] font-bold tracking-wider text-black uppercase">
            Pendiente…
          </span>
        )}
      </div>
      {(image || !scene) && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 pt-6">
          <p className="truncate text-sm font-semibold text-white">{scene || "—"}</p>
        </div>
      )}
    </div>
  );
}

export function Monitors({ view }: { view: ObsView }) {
  const local = view.source === "local";
  const [images, setImages] = useState<{ preview: string | null; program: string | null }>({
    preview: null,
    program: null,
  });
  const showPreview = view.studioMode;
  const previewName = view.preview;
  const programName = view.program;

  useEffect(() => {
    if (!local || !programName) {
      setImages({ preview: null, program: null });

      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const period = window.matchMedia("(max-width: 1023px)").matches ? 2_000 : 1_000;
    const tick = async () => {
      if (cancelled) return;
      if (document.visibilityState === "visible") {
        const sources = showPreview && previewName ? [previewName, programName] : [programName];
        const shots = await getObsClient()
          .screenshots(sources, 640)
          .catch(() => sources.map(() => null));
        if (cancelled) return;
        setImages(
          shots.length === 2
            ? { preview: shots[0] ?? null, program: shots[1] ?? null }
            : { preview: null, program: shots[0] ?? null }
        );
      }
      timer = setTimeout(tick, period);
    };
    void tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [local, programName, previewName, showPreview]);

  const previewPending = Object.keys(view.pending).some((key) => key.startsWith("preview:"));
  const programPending = Object.keys(view.pending).some((key) => key.startsWith("program:"));

  return (
    <div className={cn("grid gap-3", showPreview ? "grid-cols-2" : "grid-cols-1")}>
      {showPreview && (
        <Monitor image={images.preview} label="Preview" pending={previewPending} scene={view.preview} tone="preview" />
      )}
      <Monitor
        image={images.program}
        label="Program · al aire"
        pending={programPending}
        scene={view.program}
        tone="program"
      />
    </div>
  );
}
