import { and, asc, desc, eq, inArray, isNotNull, lt } from "drizzle-orm";
import { notFound } from "next/navigation";

import { landingFor } from "components/community-landings/registry";
import { CommunityProfile } from "components/community/profile/CommunityProfile";
import { SiteChrome } from "components/community/SiteChrome";
import Footer from "components/shared/Footer";
import { getUpcomingEvents } from "lib/community/events";
import { ORGANIZAR_ON } from "lib/community/flags";
import { db } from "lib/db";
import { communities, communityMembers, eventHosts, events, user, venues } from "lib/db/schema";
import { getCommunityBySlug, listCommunityEvents } from "lib/tenant-server";

// What's next and the counts change; an hour is fresh enough (publishing refreshes event pages)
export const revalidate = 3600;

/**
 * A community's page: a bespoke landing from the registry when it has one, otherwise its profile
 * with what's next (OWU's events and its Meetup ones), what it did and who hosted it.
 */
export default async function CommunityHomePage({ params }: { params: Promise<{ communitySlug: string }> }) {
  const { communitySlug } = await params;
  const community = await getCommunityBySlug(communitySlug);
  if (!community) notFound();

  const all = await listCommunityEvents(community.id);
  const Landing = landingFor(community.slug);
  if (Landing) return <Landing community={community} events={all} />;

  const [upcoming, hosted, cohosted, organizers] = await Promise.all([
    getUpcomingEvents(),
    db
      .selectDistinct({ name: venues.name, logoUrl: venues.logoUrl })
      .from(events)
      .innerJoin(venues, eq(venues.id, events.venueId))
      .where(
        and(
          eq(events.communityId, community.id),
          eq(events.status, "published"),
          eq(events.isActive, true),
          isNotNull(events.venueId),
          lt(events.startDate, new Date())
        )
      )
      .orderBy(desc(venues.name)),
    // Events another community organized with this one (once it accepted)
    db
      .select({ event: events, hostSlug: communities.slug })
      .from(eventHosts)
      .innerJoin(events, eq(events.id, eventHosts.eventId))
      .innerJoin(communities, eq(communities.id, events.communityId))
      .where(
        and(eq(eventHosts.communityId, community.id), eq(eventHosts.status, "accepted"), eq(events.isActive, true))
      ),
    // «Organizan»: those on the team who chose to show; name and photo only, never the email
    db
      .select({ name: user.name, image: user.image })
      .from(communityMembers)
      .innerJoin(user, eq(user.id, communityMembers.userId))
      .where(
        and(
          eq(communityMembers.communityId, community.id),
          eq(communityMembers.showOnProfile, true),
          inArray(communityMembers.role, ["owner", "admin", "editor"])
        )
      )
      .orderBy(asc(communityMembers.createdAt)),
  ]);
  const now = Date.now();
  const cohostedIds = new Set(cohosted.map((row) => `owu-${row.event.id}`));
  const past = [
    ...all.map((event) => ({ ...event, hostSlug: community.slug })),
    ...cohosted.map((row) => ({ ...row.event, hostSlug: row.hostSlug })),
  ]
    .filter((event) => event.status === "published" && event.endDate.getTime() < now)
    .toSorted((a, b) => b.startDate.getTime() - a.startDate.getTime());

  return (
    <SiteChrome>
      <CommunityProfile
        canFollow={ORGANIZAR_ON}
        claimHref={ORGANIZAR_ON ? "/organizar/panel/reclamar" : null}
        community={community}
        hosts={hosted.toSorted((a, b) => a.name.localeCompare(b.name, "es"))}
        organizers={organizers}
        past={past}
        upcoming={upcoming.filter((event) => event.communitySlug === community.slug || cohostedIds.has(event.id))}
      />
      <Footer />
    </SiteChrome>
  );
}
