"use client";

import { useEffect } from "react";

import { EXTERNAL_SERVICES } from "app/lib/constants";

export default function SponsorForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const url = EXTERNAL_SERVICES.googleForms.sponsorsConf;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <div className={`w-full max-w-2xl ${open ? "block" : "hidden"}`}>
      <div className="overflow-hidden rounded-lg border-2 border-[#F5BB03] bg-[#0a0a0a] text-left shadow-[0_10px_40px_rgba(0,0,0,0.5)] [view-transition-name:conf-window]">
        <div className="flex items-center gap-1.5 border-b border-white/10 px-3 py-2">
          <button
            type="button"
            onClick={onClose}
            aria-label="Volver"
            className="group/dot relative flex h-2.5 w-2.5 items-center justify-center rounded-full bg-[#FF5F56] outline-none transition-transform hover:scale-110 focus-visible:scale-110"
          >
            <span className="font-terminal text-[7px] leading-none text-black/0 transition-colors group-hover/dot:text-black/60">
              ✕
            </span>
          </button>
          <span className="h-2.5 w-2.5 rounded-full bg-[#FFBD2E]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#27C93F]" />
          <span className="ml-2 font-terminal text-[0.65rem] tracking-tight text-white/35">owu@conf: ~/sponsor</span>
        </div>

        <div className="bg-white" style={{ filter: "invert(1)" }}>
          <div style={{ filter: "hue-rotate(189.73deg) saturate(18.61%)" }}>
            <iframe
              className="block h-[calc(100svh-23rem)] max-h-[1532px] min-h-[360px] w-full"
              src={url}
              title="Formulario para ser sponsor de OWU Conf"
            >
              Cargando…
            </iframe>
          </div>
        </div>
      </div>
    </div>
  );
}
