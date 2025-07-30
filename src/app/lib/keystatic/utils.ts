import { createReader } from "@keystatic/core/reader";
import { cache } from "react";

import keystaticConfig from "../../../../keystatic.config";

type Collections = typeof keystaticConfig.collections;
type CollectionName = keyof Collections;

export interface ImageUrl {
  url: string;
}

export interface Speaker {
  firstname: string;
  lastname: string;
  picture?: string;
  jobTitle?: string;
}

export interface Sponsor {
  name: string;
  logo: string;
  website?: string;
}

export interface StaffMember {
  firstname: string;
  lastname: string;
  picture?: string;
  jobTitle: string;
  socialNetworks: {
    linkedin?: string;
    github?: string;
    twitter?: string;
  };
}

export interface Community {
  name: string;
  picture: string;
  website?: string;
}

export interface AgendaItem {
  id: number;
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  presenter: string | null;
  location: {
    name: string;
  };
}

const reader = cache(() => createReader(process.cwd(), keystaticConfig));

// Helper to transform image URLs to the expected format
export const formatImageUrl = (image: string): ImageUrl => ({ url: image });

// Helper to safely read related content
export const readRelatedContent = async <T>(collection: CollectionName, slug: string | null): Promise<T | null> => {
  if (!slug) return null;

  return reader().collections[collection].read(slug) as Promise<T>;
};

// Helper to transform arrays of content
export async function transformArray<T, R>(
  items: readonly T[] | undefined,
  transform: (item: T) => Promise<R | null>
): Promise<R[]> {
  const transformed = await Promise.all((items ?? []).map(transform));

  return transformed.filter((item): item is NonNullable<typeof item> => item !== null);
}

// Transform functions for each content type
export async function transformAgendaItem(item: AgendaItem) {
  const presenter = item.presenter ? await readRelatedContent<Speaker>("speakers", item.presenter) : null;

  return {
    ...item,
    presenter: presenter
      ? {
          firstname: presenter.firstname,
          lastname: presenter.lastname,
          picture: presenter.picture ? formatImageUrl(presenter.picture) : undefined,
        }
      : undefined,
  };
}

export async function transformSponsor(sponsorSlug: string | null) {
  const sponsor = await readRelatedContent<Sponsor>("sponsors", sponsorSlug);

  if (!sponsor) return null;

  return {
    name: sponsor.name,
    logo: formatImageUrl(sponsor.logo),
    image: sponsor.logo, // For Hero component
    website: sponsor.website,
  };
}

export async function transformStaffMember(staffSlug: string | null) {
  const member = await readRelatedContent<StaffMember>("staff", staffSlug);

  if (!member) return null;

  return {
    firstname: member.firstname,
    lastname: member.lastname,
    picture: member.picture ? formatImageUrl(member.picture) : undefined,
    jobtitle: member.jobTitle,
    linkedin: member.socialNetworks.linkedin,
    github: member.socialNetworks.github,
    twitter: member.socialNetworks.twitter,
  };
}

export async function transformCommunity(communitySlug: string | null) {
  const community = await readRelatedContent<Community>("communities", communitySlug);

  if (!community) return null;

  return {
    name: community.name,
    picture: formatImageUrl(community.picture),
    website: community.website,
  };
}
