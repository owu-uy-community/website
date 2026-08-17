import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarX2 } from "lucide-react";

import { requireAdmin } from "app/lib/auth-helpers";
import { Button } from "components/shared/ui/button";
import { Empty } from "components/shared/ui/empty";

import { resolveAdminCommunityScope } from "../scope";
import OpenSpaceClient from "./OpenSpaceClient";

/**
 * The board is community-scoped in the path (/admin/<slug>/openspace) so the
 * org is visible and switchable from the URL; `?event=` picks the event
 * within it, defaulting to the newest.
 */
export default async function OpenSpacePage({
  params,
  searchParams,
}: {
  params: Promise<{ communitySlug: string }>;
  searchParams: Promise<{ event?: string }>;
}) {
  await requireAdmin();

  const { communitySlug } = await params;
  const { event: eventSlug } = await searchParams;
  const scope = await resolveAdminCommunityScope(communitySlug, eventSlug, null);
  if (!scope) notFound();

  if (!scope.selected) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4 p-4 md:p-6">
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Open Space</h1>
        <Empty
          action={
            <Button asChild size="sm" variant="outline">
              <Link href={`/admin/communities/${scope.community.slug}`}>Crear un evento</Link>
            </Button>
          }
          className="py-16"
          description={`${scope.community.name} todavía no tiene eventos.`}
          icon={CalendarX2}
          title="Sin eventos"
        />
      </div>
    );
  }

  return (
    <OpenSpaceClient
      eventHref={`/admin/communities/${scope.community.slug}/events/${scope.selected.slug}`}
      eventId={scope.selected.id}
      eventName={scope.selected.name}
      kioskHref={`/comunidad/${scope.community.slug}/events/${scope.selected.slug}/kiosk`}
    />
  );
}
