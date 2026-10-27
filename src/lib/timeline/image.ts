import { getImageProps } from "next/image";

/*
 * Timeline photos are served straight from where they are published: the reader's browser gets
 * them from Meetup, Flickr or GitHub, and nothing is copied or resized on our side. Meetup (asked
 * for .webp) and Flickr publish each photo at several sizes, so the srcset lets every screen take
 * the one it needs; GitHub's come in one size. Only the site's own files (community logos under
 * /public) go through the image optimizer.
 */

export type PhotoSources = { src: string; srcSet?: string; sizes?: string };

type Ladder = (readonly [width: number, url: string])[];

// By their longest side. Flickr's _s/_q are squares, for thumbnails
const FLICKR = [
  [320, "_n"],
  [400, "_w"],
  [640, "_z"],
  [800, "_c"],
  [1024, "_b"],
] as const;
// highres_ is the original upload, usually 1,200–1,600px
const MEETUP = [
  [80, "thumb_"],
  [180, "global_"],
  [360, "event_"],
  [600, "600_"],
  [1200, "highres_"],
] as const;

const isFlickr = (src: string) => src.includes("staticflickr.com/");
const flickrAt = (src: string, suffix: string) => src.replace(/(_[a-z])?\.jpg$/, `${suffix}.jpg`);
// Asked for .jpeg, some sizes come back as heavy PNGs; .webp is a real WebP at every size
const meetupAt = (src: string, prefix: string) => src.replace(/\/[a-z0-9]+_(\d+)\.\w+$/, `/${prefix}$1.webp`);

function ladder(src: string): Ladder | null {
  if (isFlickr(src)) return FLICKR.map(([width, suffix]) => [width, flickrAt(src, suffix)]);
  if (src.includes("meetupstatic.com/")) return MEETUP.map(([width, prefix]) => [width, meetupAt(src, prefix)]);
  return null;
}

/** The smallest size at least `px` wide, or the largest there is */
const atLeast = (sizes: Ladder, px: number) => (sizes.find(([width]) => width >= px) ?? sizes.at(-1)!)[1];

/** A responsive photo: `sizes` says how wide it shows, the browser picks the file */
export function photoSources(src: string, sizes: string): PhotoSources {
  if (src.startsWith("/")) {
    const { props } = getImageProps({ src, alt: "", fill: true, sizes });
    return { src: props.src, srcSet: props.srcSet, sizes: props.sizes };
  }
  const steps = ladder(src);
  if (!steps) return { src };
  return { src: atLeast(steps, 640), srcSet: steps.map(([width, url]) => `${url} ${width}w`).join(", "), sizes };
}

/** A Meetup member photo as a round avatar `px` wide: its 80px square, or its 240px one when that's blurry */
export function avatarSources(src: string, px: number): PhotoSources {
  const thumb = meetupAt(src, "thumb_");
  const member = meetupAt(src, "member_");
  if (px * 2 <= 80) return { src: thumb };
  return px <= 80 ? { src: thumb, srcSet: `${thumb} 1x, ${member} 2x` } : { src: member };
}

/** A thumbnail that covers a `px` square (CSS px), sharp on 2x screens */
export function thumbSources(src: string, px: number): PhotoSources {
  if (src.startsWith("/")) {
    const { props } = getImageProps({ src, alt: "", width: px, height: px });
    return { src: props.src, srcSet: props.srcSet };
  }
  // Flickr's squares: 75px (_s) and 150px (_q)
  if (isFlickr(src)) return { src: flickrAt(src, px * 2 <= 75 ? "_s" : "_q") };
  const steps = ladder(src);
  if (!steps) return { src };
  // Most photos are 16:9, so covering the square takes a width of 16/9 of its side
  const one = atLeast(steps, (px * 16) / 9);
  const two = atLeast(steps, (px * 32) / 9);
  return one === two ? { src: one } : { src: one, srcSet: `${one} 1x, ${two} 2x` };
}
