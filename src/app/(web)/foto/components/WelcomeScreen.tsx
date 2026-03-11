"use client";

import { motion } from "motion/react";
import type { RpgClass } from "../../../../lib/orpc/foto/schemas";

const CLASSES: { value: RpgClass; label: string; icon: string }[] = [
  { value: "warrior", label: "Guerrero", icon: "⚔️" },
  { value: "witch", label: "Bruja", icon: "🔮" },
  { value: "warlock", label: "Hechicero", icon: "🪄" },
  { value: "ranger", label: "Ranger", icon: "🏹" },
  { value: "paladin", label: "Paladín", icon: "🛡️" },
  { value: "druid", label: "Druida", icon: "🌿" },
  { value: "rogue", label: "Pícaro", icon: "🗡️" },
];

interface WelcomeScreenProps {
  onStart: () => void;
  rpgClass: RpgClass;
  onClassChange: (rpgClass: RpgClass) => void;
}

export default function WelcomeScreen({ onStart, rpgClass, onClassChange }: WelcomeScreenProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: -40 }}
      transition={{ duration: 0.5 }}
      className="flex h-full w-full flex-col items-center justify-center px-6"
    >
      {/* Decorative rings */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 0.08 }}
          transition={{ duration: 1.2, ease: "easeOut" }}
          className="absolute h-[500px] w-[500px] rounded-full border border-[#ff6ec7]"
        />
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 0.04 }}
          transition={{ duration: 1.4, delay: 0.1, ease: "easeOut" }}
          className="absolute h-[700px] w-[700px] rounded-full border border-[#4dd0e1]"
        />
      </div>

      {/* Title */}
      <motion.div
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.7, delay: 0.2 }}
        className="relative mb-2 text-center"
      >
        <h1 className="font-pixel text-4xl tracking-wider text-[#ff6ec7] sm:text-5xl">
          FOTO
        </h1>
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="mx-auto mt-3 h-[2px] w-32 bg-gradient-to-r from-transparent via-[#4dd0e1] to-transparent"
        />
      </motion.div>

      <motion.p
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.5 }}
        className="mb-8 text-center font-pixel text-[8px] leading-relaxed tracking-wider text-[#4dd0e1]/70"
      >
        CONVERTITE EN UN PERSONAJE RPG
      </motion.p>

      {/* RPG class selector */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.7 }}
        className="mb-8 flex max-w-lg flex-wrap justify-center gap-2"
      >
        {CLASSES.map((c, i) => (
          <motion.button
            key={c.value}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.7 + i * 0.05 }}
            onClick={() => onClassChange(c.value)}
            className={`rounded-lg border px-4 py-2 font-pixel text-[8px] tracking-wider transition-all duration-200 ${
              rpgClass === c.value
                ? "border-[#ffd54f]/60 bg-[#ffd54f]/10 text-[#ffd54f] shadow-[0_0_15px_rgba(255,213,79,0.15)]"
                : "border-[#cc7aa3]/20 bg-[#050205]/50 text-[#cc7aa3] hover:border-[#cc7aa3]/40 hover:text-[#ff9dd9]"
            }`}
          >
            <span className="mr-1.5 text-sm">{c.icon}</span>
            {c.label}
          </motion.button>
        ))}
      </motion.div>

      {/* Start button */}
      <motion.button
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, delay: 1, type: "spring", stiffness: 200 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={onStart}
        className="group relative overflow-hidden rounded-xl border border-[#4dd0e1]/40 bg-[#4dd0e1] px-12 py-4 font-pixel text-[10px] tracking-wider text-[#0a050a] transition-all hover:shadow-[0_0_40px_rgba(77,208,225,0.3)]"
      >
        <span className="relative z-10">EMPEZAR</span>
        <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
      </motion.button>

      {/* Footer */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.3 }}
        className="mt-12 font-pixel text-[7px] tracking-wider text-[#cc7aa3]/60"
      >
        PIXEL ART RPG AVATAR GENERATOR
      </motion.p>
    </motion.div>
  );
}
