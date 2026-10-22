import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarX2 } from "lucide-react";

import { requireAdmin } from "app/lib/auth-helpers";
import { HoyClient } from "components/Admin/hoy/HoyClient";
import { PageContainer, PageHeader } from "components/Admin/ui/page";
import { EmptyState } from "components/Admin/ui/states";
import { Button } from "components/shared/ui/button";

import { resolveAdminCommunityScope } from "./scope";

/** Hoy: the event's preparation before the day, mission control on it, the report after. */
export default async function EventTodayPage({
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
      <PageContainer size="small">
        <PageHeader title="Hoy" />
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

  return <HoyClient communitySlug={scope.community.slug} eventId={scope.selected.id} eventSlug={scope.selected.slug} />;
}
