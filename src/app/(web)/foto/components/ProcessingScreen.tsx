"use client";

import { motion } from "motion/react";

interface ProcessingScreenProps {
  capturedImage: string | null;
  statusMessage: string;
}

export default function ProcessingScreen({ capturedImage, statusMessage }: ProcessingScreenProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex h-full w-full flex-col items-center justify-center px-6"
    >
      {/* Captured image with scan effect */}
      <div className="relative mb-10 h-72 w-72 overflow-hidden rounded-2xl border border-[#ff6ec7]/30 sm:h-80 sm:w-80">
        {capturedImage && (
          <img
            src={capturedImage}
            alt="Captured"
            className="h-full w-full object-cover"
          />
        )}

        {/* Scan line */}
        <motion.div
          initial={{ top: "0%" }}
          animate={{ top: ["0%", "100%"] }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          className="absolute left-0 right-0 z-10"
        >
          <div className="h-[2px] w-full bg-[#4dd0e1] shadow-[0_0_20px_rgba(77,208,225,0.8)]" />
          <div className="h-12 w-full bg-gradient-to-b from-[#4dd0e1]/20 to-transparent" />
        </motion.div>

        {/* Overlay grid */}
        <div
          className="pointer-events-none absolute inset-0 z-10 opacity-10"
          style={{
            backgroundImage:
              "linear-gradient(rgba(77,208,225,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(77,208,225,0.3) 1px, transparent 1px)",
            backgroundSize: "20px 20px",
          }}
        />

        {/* Darkened overlay */}
        <div className="absolute inset-0 bg-black/30" />

        {/* Corner markers */}
        <div className="absolute left-3 top-3 h-6 w-6 border-l-2 border-t-2 border-[#4dd0e1]" />
        <div className="absolute right-3 top-3 h-6 w-6 border-r-2 border-t-2 border-[#4dd0e1]" />
        <div className="absolute bottom-3 left-3 h-6 w-6 border-b-2 border-l-2 border-[#4dd0e1]" />
        <div className="absolute bottom-3 right-3 h-6 w-6 border-b-2 border-r-2 border-[#4dd0e1]" />
      </div>

      {/* Processing indicator */}
      <div className="flex flex-col items-center gap-4">
        {/* Spinner */}
        <div className="relative h-10 w-10">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
            className="absolute inset-0 rounded-full border-2 border-[#cc7aa3]/20 border-t-[#ff6ec7]"
          />
        </div>

        {/* Real SSE status message */}
        <motion.p
          key={statusMessage}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="font-pixel text-[8px] leading-relaxed tracking-wider text-[#4dd0e1]"
        >
          {statusMessage || "Procesando..."}
        </motion.p>
      </div>
    </motion.div>
  );
}
