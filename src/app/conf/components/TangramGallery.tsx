"use client";

import { useCallback, useState } from "react";
import { m } from "motion/react";

import Lightbox, { openWithMorph, withViewTransition } from "./Lightbox";

/**
 * Real tangram: the classic 7-piece square dissection. Photos live INSIDE the
 * pieces via clip-path; on viewport entry the pieces fly in from outside to
 * assemble the square, and each piece opens its full photo in the shared lightbox.
 */
type TangramPiece = {
  clip: string;
  photo: string;
  alt: string;
  /** Box the photo lives in (the piece's bounding box) */
  box: React.CSSProperties;
  /** object-position calibrated so the subject lands inside the visible wedge */
  focus: string;
  /** Where the piece flies in from (direction matches its position) */
  from: { x: number; y: number; rotate: number };
};

const TANGRAM_PIECES: TangramPiece[] = [
  {
    clip: "polygon(0% 0%, 100% 0%, 50% 50%)",
    photo: "/images/conf/gallery/tangram-1.webp",
    alt: "Foto grupal de los asistentes a La Meetup III",
    box: { left: 0, top: 0, width: "100%", height: "50%" },
    focus: "50% 55%",
    from: { x: 0, y: -140, rotate: -6 },
  },
  {
    clip: "polygon(0% 0%, 0% 100%, 50% 50%)",
    photo: "/images/conf/gallery/tangram-2.webp",
    alt: "Una asistente sacando una selfie con el celular en alto",
    box: { left: 0, top: 0, width: "50%", height: "100%" },
    focus: "30% 45%",
    from: { x: -150, y: 0, rotate: 5 },
  },
  {
    clip: "polygon(100% 50%, 100% 100%, 50% 100%)",
    photo: "/images/conf/gallery/tangram-3.webp",
    alt: "Un speaker dando su charla frente al público",
    box: { left: "50%", top: "50%", width: "50%", height: "50%" },
    focus: "80% 45%",
    from: { x: 110, y: 110, rotate: -7 },
  },
  {
    clip: "polygon(50% 50%, 75% 25%, 100% 50%, 75% 75%)",
    photo: "/images/conf/gallery/tangram-4.webp",
    alt: "Asistentes sonriendo durante el evento",
    box: { left: "50%", top: "25%", width: "50%", height: "50%" },
    focus: "45% 40%",
    from: { x: 130, y: 0, rotate: 10 },
  },
  {
    clip: "polygon(100% 0%, 100% 50%, 75% 25%)",
    photo: "/images/conf/gallery/tangram-5.webp",
    alt: "Una speaker dando su charla con micrófono de vincha",
    box: { left: "75%", top: 0, width: "25%", height: "50%" },
    focus: "40% 30%",
    from: { x: 110, y: -110, rotate: 8 },
  },
  {
    clip: "polygon(50% 50%, 75% 75%, 25% 75%)",
    photo: "/images/conf/gallery/tangram-6.webp",
    alt: "Mesa de acreditación repleta de stickers de la comunidad",
    box: { left: "25%", top: "50%", width: "50%", height: "25%" },
    focus: "50% 60%",
    from: { x: 0, y: 120, rotate: -9 },
  },
  // Asset pre-cropped 12% on the right: the box is wider than the photo, so the
  // image is width-locked and object-position cannot pan it horizontally
  {
    clip: "polygon(0% 100%, 25% 75%, 75% 75%, 50% 100%)",
    photo: "/images/conf/gallery/tangram-7.webp",
    alt: "El equipo organizador celebrando sobre el escenario",
    box: { left: 0, top: "75%", width: "75%", height: "25%" },
    focus: "50% 32%",
    from: { x: -120, y: 100, rotate: 6 },
  },
];

const PHOTOS = TANGRAM_PIECES.map(({ photo, alt }) => ({ src: photo, alt }));

/* Converts each piece's clip-path into points for the SVG seam strokes */
const clipToPoints = (clip: string) =>
  clip
    .replace(/^polygon\(|\)$/g, "")
    .split(",")
    .map((pair) => pair.trim().split(/\s+/).map((v) => parseFloat(v)).join(","))
    .join(" ");

export default function TangramGallery() {
  const [active, setActive] = useState<number | null>(null);

  const closeLightbox = useCallback(() => {
    withViewTransition(() => setActive(null));
  }, []);

  const step = useCallback((delta: number) => {
    withViewTransition(() => {
      setActive((current) => (current === null ? current : (current + delta + PHOTOS.length) % PHOTOS.length));
    });
  }, []);

  return (
    <>
    <m.div
      aria-label="Fotos de La Meetup dentro de un tangram"
      className="relative mx-auto aspect-square w-full max-w-[620px] self-start lg:mx-0 lg:ml-auto"
      initial="scattered"
      role="group"
      viewport={{ amount: 0.35, once: true }}
      whileInView="assembled"
    >
      {TANGRAM_PIECES.map(({ clip, photo, alt, box, focus, from }, i) => (
        <m.div
          key={i}
          className="group absolute inset-0"
          style={{ clipPath: clip }}
          transition={{ type: "spring", stiffness: 90, damping: 17, mass: 0.9, delay: i * 0.09 }}
          variants={{
            scattered: { opacity: 0, scale: 0.82, x: from.x, y: from.y, rotate: from.rotate },
            assembled: { opacity: 1, scale: 1, x: 0, y: 0, rotate: 0 },
          }}
        >
          <img
            alt=""
            className="absolute object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            loading="lazy"
            src={photo}
            style={{ ...box, objectPosition: focus }}
          />
          {/* The parent clip-path also clips hit-testing: clicks only count inside the piece */}
          <button
            aria-label={`Ampliar foto: ${alt}`}
            className="absolute inset-0 cursor-zoom-in focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-[#F5BB03]"
            type="button"
            onClick={(event) => {
              const thumb = event.currentTarget.parentElement?.querySelector("img") ?? null;

              openWithMorph(thumb, () => setActive(i));
            }}
          />
        </m.div>
      ))}

      {/* Tangram seams: fade in once the pieces have settled */}
      <m.svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full"
        preserveAspectRatio="none"
        transition={{ duration: 0.5, delay: 0.85 }}
        variants={{ scattered: { opacity: 0 }, assembled: { opacity: 1 } }}
        viewBox="0 0 100 100"
      >
        {TANGRAM_PIECES.map(({ clip }, i) => (
          <polygon
            key={i}
            fill="none"
            points={clipToPoints(clip)}
            stroke="#0B0B0B"
            strokeLinejoin="round"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </m.svg>
    </m.div>

    {/* Outside the animated container: a transformed ancestor would break the dialog's position:fixed */}
    <Lightbox downloadPrefix="la-meetup-iii" index={active} photos={PHOTOS} onClose={closeLightbox} onStep={step} />
    </>
  );
}
