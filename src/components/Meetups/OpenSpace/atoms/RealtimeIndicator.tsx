"use client";

import React, { useState, useEffect } from "react";
import { Wifi, WifiOff, Zap } from "lucide-react";

interface RealtimeIndicatorProps {
  isConnected?: boolean;
  onActivity?: () => void;
}

export const RealtimeIndicator = ({ isConnected = true }: RealtimeIndicatorProps) => {
  const [activityFlash, setActivityFlash] = useState(false);

  // Listen for realtime activity (you can call this from the sync hook)
  useEffect(() => {
    const handleRealtimeActivity = () => {
      setActivityFlash(true);
      setTimeout(() => setActivityFlash(false), 1000);
    };

    // Listen for custom realtime events
    window.addEventListener("openspace:realtime-activity", handleRealtimeActivity);

    return () => {
      window.removeEventListener("openspace:realtime-activity", handleRealtimeActivity);
    };
  }, []);

  return (
    <div className="flex items-center space-x-2 text-sm">
      {isConnected ? (
        <>
          <div className="flex items-center space-x-1 text-green-400">
            <div className="relative">
              {activityFlash && <Zap size={15} className="absolute -right-1 -top-1 animate-pulse text-blue-400" />}
            </div>
            <span className="hidden sm:inline">En vivo</span>
          </div>
          <div className="h-2 w-2 animate-pulse rounded-full bg-green-400" />
        </>
      ) : (
        <>
          <WifiOff size={16} className="text-zinc-400" />
          <span className="hidden text-zinc-400 sm:inline">Offline</span>
          <div className="h-2 w-2 rounded-full bg-zinc-400" />
        </>
      )}
    </div>
  );
};

// Helper function to trigger activity flash from anywhere in the app
export const triggerRealtimeActivity = () => {
  window.dispatchEvent(new CustomEvent("openspace:realtime-activity"));
};
