import { SPONSORS_2026 } from "app/conf/components/Sponsors";
import { TEAM_2026 } from "app/conf/components/Team";
import { TALKS } from "app/conf/talks";
import { INTRO_DOODLES, doodleSrc } from "lib/owy-stage/openspace-intro";
import { MOMENT_PHOTOS } from "lib/owy-stage/photos";
import { TALK_SLIDES } from "lib/owy-stage/talk/deck";

/** Pictures scenes show outright: the logos and the one-off photos. */
const FIXED = [
  "/images/logos/conf.webp",
  "/images/logos/owu.webp",
  "/images/logos/carpincho.png",
  "/images/conf/hero-crowd.webp",
  "/images/conf/mbc.png",
  "/images/2025/government/mec.webp",
  "/images/conf/apoyan/anii.webp",
];

/** Every picture the OWU CONF scenes can put on the wall, from the same lists the scenes read. */
export const STAGE_IMAGES: string[] = [
  ...new Set([
    ...FIXED,
    ...TALKS.flatMap((talk) => talk.speakers.flatMap(({ picture, reveal, cutout }) => [picture, reveal, cutout])),
    ...SPONSORS_2026.map((sponsor) => sponsor.logo),
    ...TEAM_2026.map((member) => member.picture),
    ...MOMENT_PHOTOS,
    ...INTRO_DOODLES.map(doodleSrc),
    ...TALK_SLIDES.flatMap((slide) =>
      slide.layout === "photos"
        ? slide.photos.map((photo) => photo.src)
        : slide.layout === "screen"
          ? [slide.shot]
          : slide.layout === "phones"
            ? slide.phones.map((phone) => phone.shot)
            : []
    ),
  ]),
].filter((src): src is string => Boolean(src));

/** Held for the page's life, so the browser keeps each picture at hand. */
const kept: HTMLImageElement[] = [];

/**
 * Every scene picture, one at a time while the wall idles (after the scenes' code): the first time
 * a scene shows a photo or a logo it is already here, instead of popping in over the venue's Wi-Fi.
 */
export function preloadImages() {
  const idle = (next: () => void) =>
    typeof window.requestIdleCallback === "function" ? window.requestIdleCallback(next) : window.setTimeout(next, 50);
  const queue = STAGE_IMAGES.filter((src) => !kept.some((image) => image.getAttribute("src") === src));
  const step = () => {
    const src = queue.shift();
    if (!src) return;
    const image = new Image();
    image.decoding = "async";
    image.onload = image.onerror = () => idle(step);
    image.src = src;
    kept.push(image);
  };
  idle(step);
}
