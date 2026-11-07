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
  /** The event's image (a flyer, a banner, a logo, a stream capture), not a photo of the event */
  banner?: true;
};

export type TimelineLink = { label: string; url: string };

/** Someone who gave a talk, as the event names them, and their profile when the name is a person's */
export type TimelineSpeaker = { name: string; person?: string };

export type TimelineTalk = { title: string; speakers?: TimelineSpeaker[]; slides?: string; video?: string };

/** Someone who organized an event, as that event names them, and their profile (people.json) */
export type TimelineOrganizer = { name: string; person: string };

/** A profile at /timeline/personas/<slug>: someone who organized events or gave talks (a person, or an organization) */
export type TimelinePerson = {
  slug: string;
  name: string;
  /** Their Meetup photo, as published */
  photo?: string;
  /** Their Meetup profile */
  meetup?: string;
  /** Events they organized; a group's team today, or a speaker, may not have organized any */
  events: number;
  /** Talks they gave */
  talks?: number;
  first?: string;
  last?: string;
  /** Community slugs, most events first */
  communities: string[];
  /** Their role in a group's team on Meetup today */
  roles?: { community: string; role: "organizer" | "coorganizer" | "assistant" | "events" }[];
};

/** Someone as a link shows them: an event's name for them, their profile and their photo */
export type TimelinePersonChip = Pick<TimelinePerson, "slug" | "name" | "photo">;

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
  /** Where the venue is, [lat, lon], when Meetup has it */
  geo?: [number, number];
  /** RSVPs on Meetup, or attendance when the source states it */
  rsvps?: number;
  /** Attendance as the source put it, when it isn't a single number */
  attendance?: string;
  /** The event page at its source, while it exists */
  url?: string;
  /** An archived copy, for groups and sites that are gone */
  wayback?: string;
  /** As its source announced it (Meetup's are Markdown) */
  description?: string;
  /** What it was, written for the timeline from the sources listed (Markdown) */
  summary?: string;
  talks?: TimelineTalk[];
  talkCount?: number;
  organizers?: TimelineOrganizer[];
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
  /** Its Meetup group today: members, and the average of its events' ratings (1–5) over how many */
  members?: number;
  rating?: number;
  ratings?: number;
};
