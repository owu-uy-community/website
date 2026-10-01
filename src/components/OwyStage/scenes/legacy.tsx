"use client";

import { useContext, useEffect, useMemo, useState } from "react";
import { m } from "motion/react";

import { EASE_OUT } from "app/conf/components/Reveal";
import { SPONSORS_2026 } from "app/conf/components/Sponsors";
import type { SceneProps } from "lib/owy-stage/scenes";

import { Ambient, BRAND, StageContext } from "../Stage";
import { QrCode, Rise, nowHHMM } from "./parts";
import { parseProgram } from "./useful";

/**
 * The 2025 La Meetup III deck, rebuilt: block cards, chroma-key camera
 * layouts, the community card, SILENCIO, sponsor coupons, the photo-upload
 * QR, the after and the frame overlay.
 */

// ---------------------------------------------------------------------------
// Block — the big card for the block running now (or a manual one)
// ---------------------------------------------------------------------------

export function Block({ params }: SceneProps<"block">) {
  const program = useMemo(() => parseProgram(params.items), [params.items]);
  const [now, setNow] = useState(nowHHMM);
  useEffect(() => {
    const id = setInterval(() => setNow(nowHHMM()), 15_000);
    return () => clearInterval(id);
  }, []);

  let title = params.title;
  let time = params.time;
  let next: string | null = null;
  if (!title) {
    let index = -1;
    program.forEach((item, i) => {
      if (item.time <= now) index = i;
    });
    const current = program[index];
    const following = program[index + 1];
    title = current?.title ?? program[0]?.title ?? "OWU CONF 2026";
    time = current ? `${current.time}${following ? ` – ${following.time}` : ""}` : (program[0]?.time ?? "");
    next = following ? `${following.time} · ${following.title}` : null;
  }

  return (
    <>
      <Ambient />
      <div key={`${title}|${time}`} className="absolute inset-x-[160px] top-1/2 -translate-y-1/2 text-center">
        <Rise className="text-[36px] font-semibold tracking-[0.3em] text-[#F5BB03] uppercase" delay={0.05}>
          {params.title ? "OWU CONF 2026" : "Ahora"}
        </Rise>
        <Rise
          className={`mt-6 leading-[0.95] font-extrabold tracking-[-0.02em] text-balance uppercase ${title.length > 22 ? "text-[120px]" : "text-[160px]"}`}
          delay={0.15}
        >
          {title}
        </Rise>
        {time && (
          <Rise
            className="mt-8 text-[64px] font-extrabold tracking-[0.02em] text-[#FBF5E7]/85 tabular-nums"
            delay={0.4}
          >
            {time}
          </Rise>
        )}
        {next && (
          <Rise className="mt-6 text-[34px] font-medium tracking-[0.15em] text-[#FBF5E7]/50 uppercase" delay={0.55}>
            Después · {next}
          </Rise>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Cams — camera holes with room labels (transparent, or chroma green on black)
// ---------------------------------------------------------------------------

const CHROMA = "#00FF00";
const LAYOUTS: Record<number, { x: number; y: number; w: number; h: number }[]> = {
  1: [{ x: 160, y: 120, w: 1600, h: 900 }],
  2: [
    { x: 80, y: 250, w: 860, h: 484 },
    { x: 980, y: 250, w: 860, h: 484 },
  ],
  3: [
    { x: 80, y: 90, w: 860, h: 484 },
    { x: 980, y: 90, w: 860, h: 484 },
    { x: 530, y: 590, w: 860, h: 484 },
  ],
};

/** Yellow chamfered frame around a hole, in the 2025 style. */
function CamFrame({
  x,
  y,
  w,
  h,
  label,
  fill,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  fill: string;
}) {
  const c = 34;
  const clip = `polygon(${c}px 0, 100% 0, 100% calc(100% - ${c}px), calc(100% - ${c}px) 100%, 0 100%, 0 ${c}px)`;
  return (
    <div className="absolute" style={{ left: x, top: y, width: w, height: h }}>
      <div className="absolute -inset-[10px] bg-[#F5BB03]" style={{ clipPath: clip }} />
      <div className="absolute inset-0" style={{ background: fill, clipPath: clip }} />
      {label && (
        <div className="absolute -bottom-[2px] left-[40px] bg-black px-6 py-2 text-[34px] font-extrabold tracking-[0.12em] text-[#FBF5E7] uppercase">
          {label}
        </div>
      )}
    </div>
  );
}

export function Cams({ params }: SceneProps<"cams">) {
  const { bg } = useContext(StageContext);
  const boxes = LAYOUTS[params.layout] ?? LAYOUTS[2];
  const labels = [params.label1, params.label2, params.label3];
  // Transparent stage → real holes for OBS layers; black stage → chroma key like the 2025 deck.
  const fill = bg === "transparent" ? "transparent" : CHROMA;

  return (
    <>
      {boxes.map((box, i) => (
        <CamFrame key={i} {...box} fill={fill} label={labels[i] ?? ""} />
      ))}
      <img alt="OWU CONF" className="absolute right-[80px] bottom-[24px] w-[220px]" src="/images/logos/conf.webp" />
    </>
  );
}

// ---------------------------------------------------------------------------
// Community — the OWU card
// ---------------------------------------------------------------------------

export function Community({ params }: SceneProps<"community">) {
  return (
    <>
      <Ambient />
      <m.img
        alt="OWU"
        animate={{ opacity: 1, scale: 1 }}
        className="absolute top-[210px] left-[560px] w-[800px] brightness-0 invert"
        initial={{ opacity: 0, scale: 0.9 }}
        src="/images/logos/owu.webp"
        transition={{ duration: 0.9, ease: EASE_OUT }}
      />
      <Rise
        className="absolute inset-x-[300px] top-[620px] text-center text-[52px] leading-[1.3] font-medium text-[#FBF5E7]/90"
        delay={0.5}
      >
        {params.tagline}
      </Rise>
      <Rise
        className="absolute inset-x-0 top-[860px] text-center text-[34px] font-semibold tracking-[0.3em] text-[#F5BB03] uppercase"
        delay={0.8}
      >
        owu.uy
      </Rise>
    </>
  );
}

// ---------------------------------------------------------------------------
// Silence
// ---------------------------------------------------------------------------

export function Silence({ params }: SceneProps<"silence">) {
  return (
    <div className="absolute inset-0 bg-black">
      <m.div
        animate={{ scale: [1, 1.04, 1], x: [0, -6, 6, -4, 0] }}
        className="countdown-font absolute inset-0 flex items-center justify-center text-[340px] leading-none tracking-wider text-[#E11D2E]"
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
      >
        {params.text}
      </m.div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Promo — a sponsor coupon
// ---------------------------------------------------------------------------

export function Promo({ params }: SceneProps<"promo">) {
  return (
    <>
      <Ambient />
      <m.div
        key={`${params.sponsor}|${params.offer}|${params.code}`}
        animate={{ rotate: -2, opacity: 1, y: 0 }}
        className="absolute top-[170px] left-[360px] w-[1200px] bg-[#FBF5E7] text-black"
        initial={{ rotate: -8, opacity: 0, y: 60 }}
        style={{
          clipPath: "polygon(0 0, 100% 0, 100% 42%, 97% 45%, 100% 48%, 100% 100%, 0 100%, 0 48%, 3% 45%, 0 42%)",
        }}
        transition={{ duration: 0.8, ease: EASE_OUT }}
      >
        <div className="flex items-center justify-between border-b-[6px] border-dashed border-black/20 px-[70px] py-[34px]">
          <span className="text-[34px] font-semibold tracking-[0.3em] text-black/60 uppercase">Promo</span>
          <span className="bg-black px-6 py-2 text-[34px] font-extrabold tracking-[0.1em] text-[#F5BB03] uppercase">
            {params.sponsor}
          </span>
        </div>
        <div className="px-[70px] py-[50px]">
          <p className="text-[120px] leading-[0.95] font-extrabold tracking-[-0.02em] text-balance uppercase">
            {params.offer}
          </p>
          {params.detail && <p className="mt-6 text-[38px] font-medium text-black/70">{params.detail}</p>}
          {params.code && (
            <div className="mt-10 inline-flex items-center gap-6 border-[5px] border-dashed border-black px-8 py-4">
              <span className="text-[30px] font-semibold tracking-[0.2em] text-black/60 uppercase">Código</span>
              <span className="font-terminal text-[54px] tracking-[0.12em]">{params.code}</span>
            </div>
          )}
        </div>
      </m.div>
    </>
  );
}

// ---------------------------------------------------------------------------
// QR — share your photos, join, whatever the link is
// ---------------------------------------------------------------------------

export function Qr({ params }: SceneProps<"qr">) {
  const url = /^https?:\/\//i.test(params.url) ? params.url : `https://${params.url}`;

  return (
    <>
      <Ambient />
      <div className="absolute top-[220px] left-[160px] w-[900px]">
        <Rise className="text-[36px] font-semibold tracking-[0.3em] text-[#F5BB03] uppercase" delay={0.05}>
          Escaneá
        </Rise>
        <Rise
          className="mt-6 text-[120px] leading-[0.95] font-extrabold tracking-[-0.02em] text-balance uppercase"
          delay={0.15}
        >
          {params.title}
        </Rise>
        {params.caption && (
          <Rise className="mt-8 text-[44px] font-medium text-[#FBF5E7]/80" delay={0.4}>
            {params.caption}
          </Rise>
        )}
        <Rise className="font-terminal mt-10 text-[36px] text-[#FBF5E7]/60" delay={0.5}>
          {params.url}
        </Rise>
      </div>
      <m.div
        animate={{ opacity: 1, scale: 1 }}
        className="absolute top-[250px] right-[200px]"
        initial={{ opacity: 0, scale: 0.85 }}
        transition={{ duration: 0.7, delay: 0.3, ease: EASE_OUT }}
      >
        <QrCode size={520} value={url} />
      </m.div>
    </>
  );
}

// ---------------------------------------------------------------------------
// After — where the night continues
// ---------------------------------------------------------------------------

export function After({ params }: SceneProps<"after">) {
  return (
    <>
      <Ambient />
      <div className="absolute inset-x-[160px] top-[200px] text-center">
        <Rise className="text-[40px] font-semibold tracking-[0.3em] text-[#FBF5E7]/60 uppercase" delay={0.05}>
          Los esperamos en
        </Rise>
        <Rise
          className="mt-6 text-[190px] leading-[0.95] font-extrabold tracking-[-0.03em] text-balance text-[#F5BB03] uppercase"
          delay={0.15}
        >
          {params.venue}
        </Rise>
        <Rise className="mt-6 text-[52px] font-medium tracking-[0.12em] text-[#FBF5E7]/85 uppercase" delay={0.4}>
          {params.detail}
        </Rise>
      </div>
      {params.offer && (
        <m.div
          animate={{ rotate: -12, scale: 1, opacity: 1 }}
          className="absolute right-[200px] bottom-[120px] flex h-[260px] w-[260px] items-center justify-center rounded-full bg-[#0162C8] text-center text-[64px] leading-none font-extrabold text-[#FBF5E7] uppercase"
          initial={{ rotate: 20, scale: 0.4, opacity: 0 }}
          transition={{ duration: 0.7, delay: 0.7, ease: EASE_OUT }}
        >
          {params.offer}
        </m.div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Frame — the persistent overlay: yellow frame, logo, sponsor strip
// ---------------------------------------------------------------------------

/** Closed chamfered rectangle (cuts on the top-left and bottom-right corners). */
function chamfer(x: number, y: number, w: number, h: number, c: number) {
  return `M${x + c} ${y} H${x + w} V${y + h - c} L${x + w - c} ${y + h} H${x} V${y + c} Z`;
}

export function Frame({ params }: SceneProps<"frame">) {
  return (
    <>
      <svg className="absolute inset-0" viewBox="0 0 1920 1080">
        <path
          d={`${chamfer(18, 18, 1884, 1044, 60)} ${chamfer(34, 34, 1852, 1012, 48)}`}
          fill={BRAND.yellow}
          fillRule="evenodd"
        />
      </svg>
      <img alt="OWU CONF" className="absolute top-[52px] left-[70px] w-[260px]" src="/images/logos/conf.webp" />
      {params.label && (
        <div className="absolute top-[52px] right-[70px] bg-[#F5BB03] px-5 py-2 text-[26px] font-extrabold tracking-[0.15em] text-black uppercase">
          {params.label}
        </div>
      )}
      <div className="absolute inset-x-[70px] bottom-[42px] flex h-[52px] items-center justify-center gap-[26px] bg-black/70 px-8">
        {SPONSORS_2026.map(({ name, logo }) => (
          <img
            key={name}
            alt={name}
            className="h-[24px] w-auto max-w-[94px] object-contain brightness-0 invert"
            src={logo}
          />
        ))}
      </div>
    </>
  );
}
