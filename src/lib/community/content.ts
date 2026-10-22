import "server-only";

import { createReader } from "@keystatic/core/reader";
import { cache } from "react";

import keystaticConfig from "../../../keystatic.config";

const reader = cache(() => createReader(process.cwd(), keystaticConfig));

export type Community = {
  slug: string;
  name: string;
  logo: string | null;
  description: string;
  topics: string[];
  status: "activa" | "pausa" | "busca-organizadores";
  website: string | null;
  linkedin: string | null;
  instagram: string | null;
  meetup: string | null;
  slackChannel: string | null;
  feedNames: string[];
  confPartner: boolean;
  reviewedAt: string | null;
};

export const getCommunities = cache(async (): Promise<Community[]> => {
  const entries = await reader().collections.communities.all();

  return entries
    .map(({ slug, entry }) => ({
      slug,
      name: entry.name,
      logo: entry.picture || null,
      description: entry.description,
      topics: [...entry.topics],
      status: entry.status,
      website: entry.website || null,
      linkedin: entry.linkedin || null,
      instagram: entry.instagram || null,
      meetup: entry.meetup || null,
      slackChannel: entry.slackChannel.replace(/^#/, "") || null,
      feedNames: [...entry.feedNames],
      confPartner: entry.confPartner,
      reviewedAt: entry.reviewedAt,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
});

export type ManualEvent = {
  slug: string;
  title: string;
  communitySlug: string | null;
  organizer: string | null;
  start: string;
  end: string | null;
  venue: string | null;
  url: string;
};

export const getManualEvents = cache(async (): Promise<ManualEvent[]> => {
  const entries = await reader().collections.events.all();

  return entries.map(({ slug, entry }) => ({
    slug,
    title: entry.title,
    communitySlug: entry.community,
    organizer: entry.organizer || null,
    start: entry.start,
    end: entry.end,
    venue: entry.venue || null,
    url: entry.url,
  }));
});

export type Talk = {
  slug: string;
  title: string;
  speakers: string[];
  event: string;
  date: string;
  summary: string;
  topics: string[];
  video: string | null;
  slides: string | null;
};

export const getTalks = cache(async (): Promise<Talk[]> => {
  const entries = await reader().collections.talks.all();

  return entries
    .map(({ slug, entry }) => ({
      slug,
      title: entry.title,
      speakers: [...entry.speakers],
      event: entry.event,
      date: entry.date,
      summary: entry.summary,
      topics: [...entry.topics],
      video: entry.video || null,
      slides: entry.slides || null,
    }))
    .sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title, "es"));
});

export const getLanding = cache(() => reader().collections.landing.read("2024", { resolveLinkedFiles: true }));
