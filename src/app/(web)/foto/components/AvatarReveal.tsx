"use client";

import { useState } from "react";
import { motion } from "motion/react";

interface AvatarRevealProps {
  avatarBase64: string;
  mediaType: string;
  capturedImage: string | null;
  onRetake: () => void;
  onReset: () => void;
}

export default function AvatarReveal({
  avatarBase64,
  mediaType,
  capturedImage,
  onRetake,
  onReset,
}: AvatarRevealProps) {
  const [showOriginal, setShowOriginal] = useState(false);
  const avatarSrc = `data:${mediaType};base64,${avatarBase64}`;

  const handleDownload = () => {
    const link = document.createElement("a");
    link.href = avatarSrc;
    const ext = mediaType.split("/")[1] || "png";
    link.download = `owu-avatar-${Date.now()}.${ext}`;
    link.click();
  };

  const handleShare = async () => {
    if (!navigator.share) return;

    try {
      const blob = await fetch(avatarSrc).then((r) => r.blob());
      const ext = mediaType.split("/")[1] || "png";
      const file = new File([blob], `owu-avatar.${ext}`, { type: mediaType });
      await navigator.share({ files: [file], title: "Mi Avatar OWU" });
    } catch {
      // User cancelled or share failed silently
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex h-full w-full flex-col items-center justify-center px-6"
    >
      {/* Title */}
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="mb-6 text-center"
      >
        <h2 className="font-pixel text-xl tracking-wider text-[#ff6ec7] sm:text-2xl">
          TU AVATAR
        </h2>
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ delay: 0.5, duration: 0.4 }}
          className="mx-auto mt-2 h-[2px] w-20 bg-gradient-to-r from-transparent via-[#4dd0e1] to-transparent"
        />
      </motion.div>

      {/* Polaroid-style avatar display */}
      <motion.div
        initial={{ scale: 0, rotate: -8 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", damping: 15, stiffness: 200, delay: 0.3 }}
        className="relative mb-8"
      >
        {/* Glow behind polaroid */}
        <div className="absolute -inset-6 rounded-3xl bg-[#ff6ec7]/10 blur-3xl" />

        {/* Polaroid frame */}
        <div className="relative rounded-sm bg-white p-3 pb-14 shadow-[0_4px_30px_rgba(0,0,0,0.5)]">
          {/* Image area */}
          <div
            className="relative h-64 w-64 cursor-pointer overflow-hidden sm:h-72 sm:w-72"
            onClick={() => setShowOriginal(!showOriginal)}
          >
            {/* Avatar */}
            <motion.img
              src={avatarSrc}
              alt="Generated avatar"
              animate={{ opacity: showOriginal ? 0 : 1 }}
              transition={{ duration: 0.3 }}
              className="absolute inset-0 h-full w-full object-cover"
            />

            {/* Original photo */}
            {capturedImage && (
              <motion.img
                src={capturedImage}
                alt="Original photo"
                animate={{ opacity: showOriginal ? 1 : 0 }}
                transition={{ duration: 0.3 }}
                className="absolute inset-0 h-full w-full object-cover"
              />
            )}

            {/* Toggle hint */}
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2">
              <div className="rounded-full bg-black/60 px-3 py-1 font-pixel text-[6px] tracking-wider text-white/80 backdrop-blur-sm">
                {showOriginal ? "ORIGINAL" : "TOCA PARA VER ORIGINAL"}
              </div>
            </div>
          </div>

          {/* OWU UNPLUGGED title + www.owu.uy on bottom of polaroid */}
          <div className="absolute bottom-0 left-0 right-0 flex flex-col items-center justify-center gap-0.5 pb-2 pt-1">
            <span className="font-pixel text-[8px] tracking-wider text-[#ff6ec7]">
              OWU UNPLUGGED
            </span>
            <span className="font-pixel text-[6px] tracking-wider text-[#cc7aa3]">
              www.owu.uy
            </span>
          </div>
        </div>

        {/* Decorative sparkles */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.8 }}
          className="absolute -right-3 -top-3 text-[#4dd0e1]"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <path d="M10 0L12 8L20 10L12 12L10 20L8 12L0 10L8 8Z" />
          </svg>
        </motion.div>
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 1 }}
          className="absolute -bottom-2 -left-2 text-[#ff6ec7]/60"
        >
          <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
            <path d="M10 0L12 8L20 10L12 12L10 20L8 12L0 10L8 8Z" />
          </svg>
        </motion.div>
      </motion.div>

      {/* Action buttons */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="flex flex-wrap items-center justify-center gap-3"
      >
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleDownload}
          className="flex items-center justify-center gap-2.5 rounded-lg border border-[#4dd0e1]/30 bg-[#4dd0e1] px-7 py-3.5 font-pixel text-[8px] tracking-wider text-[#0a050a] transition-all hover:shadow-[0_0_30px_rgba(77,208,225,0.3)]"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          DESCARGAR
        </motion.button>

        {typeof navigator !== "undefined" && "share" in navigator && (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleShare}
            className="flex items-center justify-center gap-2.5 rounded-lg border border-[#ff6ec7]/30 bg-[#ff6ec7]/10 px-7 py-3.5 font-pixel text-[8px] tracking-wider text-[#ff6ec7] transition-all hover:border-[#ff4db8]/50 hover:text-[#ff9dd9]"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
            COMPARTIR
          </motion.button>
        )}

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onRetake}
          className="flex items-center justify-center gap-2.5 rounded-lg border border-[#cc7aa3]/20 bg-[#050205]/50 px-7 py-3.5 font-pixel text-[8px] tracking-wider text-[#cc7aa3] transition-all hover:border-[#cc7aa3]/40 hover:text-[#ff9dd9]"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          OTRA VEZ
        </motion.button>
      </motion.div>

      {/* Back to start */}
      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
        onClick={onReset}
        className="mt-8 font-pixel text-[7px] tracking-wider text-[#cc7aa3]/60 transition-colors hover:text-[#ff4db8]"
      >
        VOLVER AL INICIO
      </motion.button>
    </motion.div>
  );
}
