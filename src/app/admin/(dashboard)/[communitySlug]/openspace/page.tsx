import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarX2 } from "lucide-react";

import { requirePermission } from "app/lib/auth-helpers";
import { PageContainer, PageHeader } from "components/Admin/ui/page";
import { EmptyState } from "components/Admin/ui/states";
import { Button } from "components/shared/ui/button";

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
  await requirePermission("program:manage");

  const { communitySlug } = await params;
  const { event: eventSlug } = await searchParams;
  const scope = await resolveAdminCommunityScope(communitySlug, eventSlug, "program:manage");
  if (!scope) notFound();

  if (!scope.selected) {
    return (
      <PageContainer size="small">
        <PageHeader title="Agenda" />
        <EmptyState
          action={
            <Button asChild variant="outline">
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

  return (
    <OpenSpaceClient
      eventHref={`/admin/communities/${scope.community.slug}/events/${scope.selected.slug}`}
      eventId={scope.selected.id}
      kioskHref={`/comunidad/${scope.community.slug}/events/${scope.selected.slug}/kiosk`}
    />
  );
}
