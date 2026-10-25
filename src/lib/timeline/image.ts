import { getImageProps } from "next/image";

/*
 * Timeline photos stay where they are published; this only picks the bytes. Flickr serves good
 * JPEGs at fixed widths, so its own sizes go in the srcset. Meetup's CDN has none (its "600" is a
 * 400px PNG of ~350 KB), and GitHub, the Wayback Machine and the repo's own files have one size,
 * so those go through the image optimizer: AVIF/WebP at the width each screen needs.
 */

export type PhotoSources = { src: string; srcSet?: string; sizes?: string };

const FLICKR_WIDTHS = [
  [320, "_n"],
  [400, "_w"],
  [640, "_z"],
  [800, "_c"],
  [1024, "_b"],
] as const;

const isFlickr = (src: string) => src.includes("staticflickr.com/");
const flickrAt = (src: string, suffix: string) => src.replace(/(_[a-z])?\.jpg$/, `${suffix}.jpg`);

/**
 * A responsive photo: `sizes` says how wide it shows, the browser picks the file. `optimize` sends
 * even a Flickr photo through the optimizer (AVIF is about a third of its JPEG): for the one photo
 * that is a page's largest paint.
 */
export function photoSources(src: string, sizes: string, optimize = false): PhotoSources {
  if (isFlickr(src) && optimize) src = flickrAt(src, "_b");
  else if (isFlickr(src)) {
    return {
      src: flickrAt(src, "_z"),
      srcSet: FLICKR_WIDTHS.map(([width, suffix]) => `${flickrAt(src, suffix)} ${width}w`).join(", "),
      sizes,
    };
  }
  const { props } = getImageProps({ src, alt: "", fill: true, sizes });
  return { src: props.src, srcSet: props.srcSet, sizes: props.sizes };
}

/** A fixed-size thumbnail (CSS px), sharp on 2x screens */
export function thumbSources(src: string, px: number): PhotoSources {
  // Flickr's squares: 75px (_s) and 150px (_q)
  if (isFlickr(src)) return { src: flickrAt(src, px * 2 <= 75 ? "_s" : "_q") };
  const { props } = getImageProps({ src, alt: "", width: px, height: px });
  return { src: props.src, srcSet: props.srcSet };
}
