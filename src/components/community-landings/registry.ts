import type { ComponentType } from "react";

import type { CommunityRow } from "lib/db/schema";
import type { EventRow } from "lib/db/schema";

/**
 * Per-community landing pages, written as React components in this repo.
 * A community without an entry falls back to the generic profile page, so
 * adding a landing is one file plus one line here.
 */
export type CommunityLandingProps = {
  community: CommunityRow;
  events: EventRow[];
};

export type CommunityLanding = ComponentType<CommunityLandingProps>;

export const COMMUNITY_LANDINGS: Record<string, CommunityLanding> = {};

export function landingFor(slug: string): CommunityLanding | null {
  return COMMUNITY_LANDINGS[slug] ?? null;
}
