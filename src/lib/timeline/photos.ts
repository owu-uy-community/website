import "server-only";

import { cache } from "react";

import { getTimeline } from "./data";
import { formatDate, photoCredit } from "./format";
import type { TimelineCommunity } from "./types";

/*
 * Every photo of a community in one place (/timeline/fotos/<slug>). The pages get the photos as
 * published (src, credit, source page); the client picks sizes as it renders each event's group,
 * so a community with hundreds of photos doesn't ship hundreds of srcsets up front.
 */

/** A photo with what the grid and the lightbox show about it */
export type CommunityPhoto = { src: string; alt?: string; credit?: string; page?: string; license?: string };

export type PhotoGroup = {
  slug: string;
  title: string;
  /** "14–15 mar 2014" */
  when: string;
  year: string;
  photos: CommunityPhoto[];
};

/** Each community's events that have photos, oldest first */
const getGroups = cache(() => {
  const groups = new Map<string, PhotoGroup[]>();
  for (const event of getTimeline().events) {
    if (!event.photos?.length || event.kind === "hito") continue;
    const group: PhotoGroup = {
      slug: event.slug,
      title: event.title,
      when: formatDate(event),
      year: event.start.slice(0, 4),
      photos: event.photos.map((photo) => ({
        src: photo.src,
        alt: photo.alt ?? `Foto de ${event.title}`,
        credit: photoCredit(photo),
        page: photo.page,
        license: photo.license,
      })),
    };
    groups.set(event.community, [...(groups.get(event.community) ?? []), group]);
  }
  return groups;
});

export type PhotoCommunity = {
  slug: string;
  name: string;
  logo?: string;
  photos: number;
  events: number;
  from: string;
  to: string;
  /** Up to four photos from different events, spread over its history */
  covers: string[];
};

/** Communities with photos, the most photographed first */
export const getPhotoCommunities = cache((): PhotoCommunity[] => {
  const { community } = getTimeline();
  return [...getGroups()]
    .flatMap(([slug, groups]) => {
      const record = community.get(slug);
      if (!record) return [];
      const step = Math.max(1, Math.floor(groups.length / 4));
      return [
        {
          slug,
          name: record.name,
          logo: record.logo,
          photos: groups.reduce((sum, group) => sum + group.photos.length, 0),
          events: groups.length,
          from: groups[0].year,
          to: groups.at(-1)!.year,
          covers: groups
            .filter((_, i) => i % step === 0)
            .slice(0, 4)
            .map((group) => group.photos[0].src),
        },
      ];
    })
    .sort((a, b) => b.photos - a.photos);
});

export function getCommunityPhotos(slug: string): { community: TimelineCommunity; groups: PhotoGroup[] } | null {
  const community = getTimeline().community.get(slug);
  const groups = getGroups().get(slug);
  return community && groups ? { community, groups } : null;
}
