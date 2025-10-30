import { useEffect, useRef } from "react";

interface UseCountdownAudioOptions {
  remainingSeconds: number;
  soundEnabled: boolean;
  soundPath?: string;
}

/**
 * Custom hook to manage countdown audio playback
 * Plays sound when countdown reaches zero and ensures it only plays once
 */
export function useCountdownAudio({
  remainingSeconds,
  soundEnabled,
  soundPath = "/sounds/developers.mp3",
}: UseCountdownAudioOptions) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hasPlayedRef = useRef(false);

  useEffect(() => {
    // Play sound when countdown reaches zero and sound is enabled
    if (remainingSeconds === 0 && soundEnabled && !hasPlayedRef.current) {
      if (!audioRef.current) {
        audioRef.current = new Audio(soundPath);
      }

      audioRef.current.play().catch((err) => {
        console.error("Failed to play countdown sound:", err);
      });

      hasPlayedRef.current = true;
    }

    // Reset flag when countdown is reset or started again
    if (remainingSeconds > 0) {
      hasPlayedRef.current = false;
    }
  }, [remainingSeconds, soundEnabled, soundPath]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  return {
    audioRef,
    hasPlayed: hasPlayedRef.current,
  };
}
