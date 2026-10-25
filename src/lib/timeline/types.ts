/** The /timeline dataset (content/timeline/), written by scripts/timeline/build.ts */

export type TimelineKind = "meetup" | "conferencia" | "hackaton" | "taller" | "jam" | "hito";

/** "community" is community-run; "ecosystem" is vendor, academic, institutional or startup-scene */
export type TimelineLayer = "community" | "ecosystem";

/**
 * A photo served from where it lives (Meetup's or Flickr's CDN, GitHub, the Wayback Machine):
 * nothing is copied. `page` is where the credit links back to.
 */
export type TimelinePhoto = {
  src: string;
  w?: number;
  h?: number;
  page?: string;
  by?: string;
  source?: string;
  license?: string;
  alt?: string;
};

export type TimelineLink = { label: string; url: string };

export type TimelineTalk = { title: string; speakers?: string[]; slides?: string; video?: string };

export type TimelineEvent = {
  /** Stable source id: meetup:<id>, conf:<series>:<date>, github:<repo>:…, hito:… */
  id: string;
  slug: string;
  title: string;
  /** ISO date or date-time with the Montevideo offset; YYYY or YYYY-MM when only that is known */
  start: string;
  end?: string;
  precision?: "month" | "year";
  kind: TimelineKind;
  layer: TimelineLayer;
  online?: boolean;
  community: string;
  venue?: string;
  city?: string;
  /** RSVPs on Meetup, or attendance when the source states it */
  rsvps?: number;
  /** Attendance as the source put it, when it isn't a single number */
  attendance?: string;
  /** The event page at its source, while it exists */
  url?: string;
  /** An archived copy, for groups and sites that are gone */
  wayback?: string;
  description?: string;
  talks?: TimelineTalk[];
  talkCount?: number;
  organizers?: string[];
  photos?: TimelinePhoto[];
  /** How many photos the source album holds, when more than the ones listed */
  photoCount?: number;
  links?: TimelineLink[];
  /** Where each fact came from */
  sources: TimelineLink[];
  /** Omitted when high */
  confidence?: "medium" | "low";
  upcoming?: boolean;
  /** Milestones that happened at this event: "Primera RubyConf Uruguay" */
  highlights?: string[];
  milestoneType?: "first" | "founding" | "other" | "ended" | "rename";
  /** Ids of the same event in other sources, merged into this one */
  mergedIds?: string[];
};

export type TimelineCommunity = {
  slug: string;
  name: string;
  /** A group that meets, or a series of editions (a conference, a jam) */
  kind: "grupo" | "serie";
  layer: TimelineLayer;
  status: "activa" | "en-pausa" | "cerrada";
  topics: string[];
  aliases?: string[];
  /** In OWU's community directory (/comunidad/<slug>) */
  directory?: boolean;
  logo?: string;
  website?: string;
  meetup?: string;
  first?: string;
  last?: string;
  events?: number;
  photos?: number;
};
