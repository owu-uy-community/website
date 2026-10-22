import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { EventPage } from "components/community/event/EventPage";
import { RsvpCard } from "components/community/event/RsvpCard";
import { SiteChrome } from "components/community/SiteChrome";
import Footer from "components/shared/Footer";
import { SITE_URL } from "lib/community/site";
import { publicCaller } from "lib/orpc/server";

type Params = Promise<{ communitySlug: string; eventSlug: string }>;

// Seats left and who's going change; a minute old is fine
export const revalidate = 60;

const load = (communitySlug: string, eventSlug: string) =>
  publicCaller.events.public({ communitySlug, eventSlug }).catch(() => null);

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { communitySlug, eventSlug } = await params;
  const event = await load(communitySlug, eventSlug);
  if (!event) return {};

  return {
    title: `${event.name} · ${event.community.name}`,
    description: event.summary ?? undefined,
    alternates: { canonical: `/comunidad/${communitySlug}/events/${eventSlug}` },
    openGraph: { title: event.name, description: event.summary ?? undefined, type: "website" },
  };
}

/**
 * An event's page. Open-space events with a board and no sign-up keep going straight to their
 * board, as they always did; everything else gets its page.
 */
export default async function EventRootPage({ params }: { params: Params }) {
  const { communitySlug, eventSlug } = await params;
  const event = await load(communitySlug, eventSlug);
  if (!event) notFound();
  if (event.hasBoard && event.registration === "none") {
    redirect(`/comunidad/${communitySlug}/events/${eventSlug}/openspace`);
  }

  return (
    <SiteChrome>
      <EventPage
        event={event}
        rsvp={<RsvpCard event={event} />}
        url={`${SITE_URL}/comunidad/${communitySlug}/events/${eventSlug}`}
      />
      <Footer />
    </SiteChrome>
  );
}
