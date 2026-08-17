"use client";

import * as React from "react";
import { Map } from "lucide-react";
import OpenSpaceMap from "components/Meetups/2024/OpenSpace/Map";

interface EmptyMapStateProps {
  scene?: number;
}

// Deterministic particle field: Math.random() in render meant new positions
// on every re-render plus a hydration-mismatch risk on an always-on screen.
const PARTICLES = Array.from({ length: 12 }, (_, i) => ({
  left: `${(i * 137.5) % 100}%`,
  top: `${(i * 61.8 + 13) % 100}%`,
  delay: `${(i % 5) * 0.6}s`,
  duration: `${3 + (i % 4)}s`,
}));

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

      {/* Background particles */}
      <div className="absolute inset-0 z-0">
        {PARTICLES.map((particle, i) => (
          <div
            key={i}
            className="absolute h-1 w-1 animate-pulse rounded-full bg-yellow-500/20"
            style={{
              left: particle.left,
              top: particle.top,
              animationDelay: particle.delay,
              animationDuration: particle.duration,
            }}
          />
        ))}
      </div>

      {/* One slow ring — was two pings + a spinner + three bouncing dots */}
      <div className="absolute z-0">
        <div
          className="h-80 w-80 animate-ping rounded-full border-2 border-yellow-500/15"
          style={{ animationDuration: "3s" }}
        />
      </div>

      {/* Content */}
      <div className="relative z-10 text-center">
        <div className="mb-8 flex justify-center">
          <div className="relative h-56 w-56">
            <div className="absolute inset-0 flex items-center justify-center rounded-full border-2 border-yellow-500/40 bg-gradient-to-br from-yellow-500/20 to-yellow-600/10 shadow-2xl shadow-yellow-500/20 backdrop-blur-xs">
              <Map className="h-20 w-20 text-yellow-500 drop-shadow-[0_0_20px_rgba(234,179,8,0.6)]" strokeWidth={1.5} />
            </div>
          </div>
        </div>

        <p className="mb-4 font-display text-5xl font-bold text-yellow-500 drop-shadow-[0_0_30px_rgba(234,179,8,0.5)]">
          Esperando la grilla
        </p>
        <p className="text-2xl text-white/70">Ningún horario está resaltado</p>
        <p className="mt-6 text-base text-white/40">Marcá la estrella de un horario en el panel de administración</p>
      </div>
    </div>
  );
};

EmptyMapState.displayName = "EmptyMapState";
