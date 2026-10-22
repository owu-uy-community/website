import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarX2 } from "lucide-react";

import { requireAdmin } from "app/lib/auth-helpers";
import { GuionClient } from "components/Admin/guion/GuionClient";
import { PageContainer, PageHeader } from "components/Admin/ui/page";
import { EmptyState } from "components/Admin/ui/states";
import { Button } from "components/shared/ui/button";

import { resolveAdminCommunityScope } from "../scope";

/** Guion del día: the selected event's run of show, run from here with GO. Site staff only. */
export default async function GuionPage({
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
        <PageHeader title="Guion del día" />
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

  return <GuionClient eventId={scope.selected.id} />;
}
