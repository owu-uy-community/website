import Link from "next/link";
import { notFound } from "next/navigation";
import { count, eq } from "drizzle-orm";
import { CalendarX2 } from "lucide-react";

import { BASE_URL } from "app/lib/constants";
import { requirePermission } from "app/lib/auth-helpers";
import { PageContainer, PageHeader } from "components/Admin/ui/page";
import { EmptyState } from "components/Admin/ui/states";
import { Button } from "components/shared/ui/button";
import { db } from "lib/db";
import { attendees, events } from "lib/db/schema";
import { eventbriteIdOf, hasApiKey } from "lib/orpc/eventbrite/service";

import { resolveAdminCommunityScope } from "../scope";
import AttendeesClient from "./AttendeesClient";

/** The webhook URL to paste in Eventbrite; null when the server has no secret (the webhook is off). */
function webhookUrl() {
  const secret = process.env.EVENTBRITE_WEBHOOK_SECRET;
  if (!secret) return null;
  const url = new URL("/api/eventbrite/webhook", BASE_URL);
  url.searchParams.set("secret", secret);
  return url.toString();
}

/** Asistentes: the Eventbrite mirror with every check-in at the door, and the raffles. Site staff only. */
export default async function AttendeesPage({
  params,
  searchParams,
}: {
  params: Promise<{ communitySlug: string }>;
  searchParams: Promise<{ event?: string }>;
}) {
  await requirePermission("raffle:read");

  const { communitySlug } = await params;
  const { event: eventSlug } = await searchParams;
  const scope = await resolveAdminCommunityScope(communitySlug, eventSlug, "raffle:read");
  if (!scope) notFound();

  if (!scope.selected) {
    return (
      <PageContainer size="small">
        <PageHeader title="Asistentes" />
        <EmptyState
          action={
            <Button asChild size="sm" variant="outline">
              <Link href={`/admin/communities/${scope.community.slug}`}>Crear un evento</Link>
            </Button>
          }
          description={`${scope.community.name} todavía no tiene eventos.`}
          icon={CalendarX2}
          title="Sin eventos"
        />
      </PageContainer>
    );
  }

  const selected = scope.selected;
  const [[event], [mirrored]] = await Promise.all([
    db
      .select({ timezone: events.timezone, startDate: events.startDate, eventbriteEventId: events.eventbriteEventId })
      .from(events)
      .where(eq(events.id, selected.id)),
    db.select({ value: count() }).from(attendees).where(eq(attendees.eventId, selected.id)),
  ]);
  if (!event) notFound();

  return (
    <AttendeesClient
      eventId={selected.id}
      eventName={selected.name}
      // What the sync will say about its setup, known now: the page doesn't jump when it answers.
      initialSetup={{
        missing: !eventbriteIdOf(event) ? "event_id" : !hasApiKey() ? "api_key" : null,
        mirrored: (mirrored?.value ?? 0) > 0,
      }}
      scannerHref={`/admin/${scope.community.slug}/attendees/escanear?event=${encodeURIComponent(selected.slug)}`}
      settingsHref={`/admin/communities/${scope.community.slug}/events/${selected.slug}`}
      startsAt={event.startDate.toISOString()}
      timezone={event.timezone}
      webhookUrl={webhookUrl()}
    />
  );
}
