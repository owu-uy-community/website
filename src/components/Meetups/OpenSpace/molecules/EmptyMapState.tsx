"use client";

import * as React from "react";
import { Map } from "lucide-react";
import OpenSpaceMap from "components/Meetups/2024/OpenSpace/Map";

interface EmptyMapStateProps {
  scene?: number;
}

/**
 * Empty state displayed when no time slots are highlighted
 * Shows blurred map background with animated icon and message
 */
export const EmptyMapState: React.FC<EmptyMapStateProps> = ({ scene = 1 }) => {
  return (
    <div className="relative flex h-screen w-full items-center justify-center overflow-hidden bg-black">
      {/* Blurred OpenSpace Map Background */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative flex h-full w-full items-center justify-center p-8">
          <div className="h-[900px] max-h-full w-[1200px] max-w-full">
            <OpenSpaceMap event={null} scene={scene} />
          </div>
        </div>
      </div>

      {/* Dark overlay with blur */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-2xl" />

      {/* Animated background particles */}
      <div className="absolute inset-0 z-0">
        {[...Array(30)].map((_, i) => (
          <div
            key={i}
            className="absolute h-1 w-1 animate-pulse rounded-full bg-yellow-500/20"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 3}s`,
              animationDuration: `${3 + Math.random() * 4}s`,
            }}
          />
        ))}
      </div>

      {/* Animated rings */}
      <div className="absolute z-0">
        <div
          className="h-64 w-64 animate-ping rounded-full border-2 border-yellow-500/20"
          style={{ animationDuration: "2s" }}
        />
      </div>
      <div className="absolute z-0" style={{ animationDelay: "1s" }}>
        <div
          className="h-96 w-96 animate-ping rounded-full border-2 border-yellow-500/10"
          style={{ animationDuration: "3s" }}
        />
      </div>

      {/* Content */}
      <div className="relative z-10 text-center">
        {/* Animated Map Icon */}
        <div className="mb-8 flex justify-center">
          <div className="relative h-64 w-64">
            {/* Spinning ring */}
            <div
              className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-r-yellow-500/50 border-t-yellow-500"
              style={{ animationDuration: "4s" }}
            />

            {/* Icon circle with pulse */}
            <div className="absolute inset-0 flex animate-pulse items-center justify-center rounded-full border-2 border-yellow-500/40 bg-gradient-to-br from-yellow-500/20 to-yellow-600/10 shadow-2xl shadow-yellow-500/20 backdrop-blur-sm">
              <Map className="h-24 w-24 text-yellow-500 drop-shadow-[0_0_20px_rgba(234,179,8,0.6)]" strokeWidth={1.5} />
            </div>
          </div>
        </div>

        {/* Text with fade animation */}
        <div className="animate-pulse">
          <p className="mb-4 text-5xl font-bold text-yellow-500 drop-shadow-[0_0_30px_rgba(234,179,8,0.5)]">
            Waiting for Schedule
          </p>
          <p className="text-2xl text-gray-300">No time slot highlighted</p>
          <p className="mt-6 text-base text-gray-500">Click the star icon on a time slot row in the admin panel</p>
        </div>

        {/* Animated dots */}
        <div className="mt-10 flex justify-center gap-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-4 w-4 animate-bounce rounded-full bg-yellow-500 shadow-lg shadow-yellow-500/50"
              style={{
                animationDelay: `${i * 0.2}s`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

EmptyMapState.displayName = "EmptyMapState";
