"use client";

import { useCountdownState } from "../../../../hooks/useCountdownState";
import { useCountdownAudio } from "../../../../hooks/useCountdownAudio";
import { formatTime } from "../../../../lib/utils";
import "./countdown.css";

export default function CountdownDisplayClient() {
  const { state, loading } = useCountdownState({ enableRealtime: true });

  // Handle audio playback when countdown reaches zero
  useCountdownAudio({
    remainingSeconds: state.remainingSeconds,
    soundEnabled: state.soundEnabled,
  });

  return (
    <div className="flex min-h-screen w-screen flex-col items-center justify-center overflow-hidden bg-[#00FF00] p-8">
      <div
        className={`countdown-font select-none text-center leading-none tracking-wider transition-all ${
          state.remainingSeconds === 0
            ? "text-red-500"
            : `text-yellow-400 ${state.isRunning ? "animate-timer-pulse" : "opacity-80"}`
        }`}
        style={{ fontSize: "clamp(10rem, 25vw, 30rem)" }}
      >
        {loading ? "00:00" : formatTime(state.remainingSeconds)}
      </div>
    </div>
  );
}
