"use client";

import React, { useEffect, useState } from "react";

import { cn } from "app/lib/utils";
import { Badge } from "components/shared/ui/badge";

interface RealtimeIndicatorProps {
  isConnected?: boolean;
}

/** Honest connection pill: fed by the realtime channel's actual state. */
export const RealtimeIndicator = ({ isConnected = false }: RealtimeIndicatorProps) => {
  const [activityFlash, setActivityFlash] = useState(false);

  // Flash briefly when a remote event lands (dispatched by the sync hook).
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const handleRealtimeActivity = () => {
      setActivityFlash(true);
      timeout = setTimeout(() => setActivityFlash(false), 900);
    };

    window.addEventListener("openspace:realtime-activity", handleRealtimeActivity);

    return () => {
      window.removeEventListener("openspace:realtime-activity", handleRealtimeActivity);
      if (timeout) clearTimeout(timeout);
    };
  }, []);

  return (
    <Badge className="gap-1.5 font-normal text-muted-foreground" variant="outline">
      <span
        aria-hidden
        className={cn(
          "h-1.5 w-1.5 rounded-full transition-all",
          isConnected ? "bg-emerald-500" : "bg-muted-foreground",
          activityFlash && "ring-2 ring-emerald-500/40"
        )}
      />
      {isConnected ? "En vivo" : "Sin conexión"}
    </Badge>
  );
};
