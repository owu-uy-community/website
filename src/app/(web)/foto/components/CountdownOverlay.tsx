"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";

interface CountdownOverlayProps {
  onComplete: (imageData: string) => void;
}

export default function CountdownOverlay({ onComplete }: CountdownOverlayProps) {
  const [count, setCount] = useState(3);

  useEffect(() => {
    if (count <= 0) {
      // Capture the frame
      const captureFrame = (window as unknown as Record<string, (() => string | null) | undefined>).__fotoCapture;
      const imageData = captureFrame?.();

      if (imageData) {
        onComplete(imageData);
      }
      return;
    }

    const timer = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [count, onComplete]);

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/30 backdrop-blur-[2px]">
      <AnimatePresence mode="wait">
        {count > 0 && (
          <motion.div
            key={count}
            initial={{ scale: 3, opacity: 0, filter: "blur(20px)" }}
            animate={{ scale: 1, opacity: 1, filter: "blur(0px)" }}
            exit={{ scale: 0.3, opacity: 0, filter: "blur(10px)" }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="relative"
          >
            {/* Glow ring behind number */}
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1.5, opacity: 0 }}
              transition={{ duration: 0.8 }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <div className="h-40 w-40 rounded-full border-2 border-[#4dd0e1]/50" />
            </motion.div>

            <span className="font-pixel text-[120px] leading-none text-[#4dd0e1] drop-shadow-[0_0_60px_rgba(77,208,225,0.5)]">
              {count}
            </span>
          </motion.div>
        )}

        {count === 0 && (
          <motion.div
            key="flash"
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="absolute inset-0 bg-white"
          />
        )}
      </AnimatePresence>
    </div>
  );
}
