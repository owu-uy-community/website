import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarX2 } from "lucide-react";

import { requirePermission } from "app/lib/auth-helpers";
import { CommsClient } from "components/Admin/comms/CommsClient";
import { COMMS_TABS } from "components/Admin/comms/tabs";
import { EmptyState } from "components/Admin/ui/states";
import { PageContainer, PageHeader } from "components/Admin/ui/page";
import { Button } from "components/shared/ui/button";

import { resolveAdminCommunityScope } from "../scope";

/** Comunicación: announcements to the staff, Owy's messages, the conf's cadence and the survey. Site staff. */
export default async function ComunicacionPage({
  params,
  searchParams,
}: {
  params: Promise<{ communitySlug: string }>;
  searchParams: Promise<{ event?: string; tab?: string; nuevo?: string }>;
}) {
  await requirePermission("comms:read");

  const { communitySlug } = await params;
  const { event: eventSlug, tab, nuevo } = await searchParams;
  const scope = await resolveAdminCommunityScope(communitySlug, eventSlug, "comms:read");
  if (!scope) notFound();

  if (!scope.selected) {
    return (
      <PageContainer size="small">
        <PageHeader title="Comunicación" />
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

  // ⌘K "Anunciar al staff…" lands here with ?nuevo=1: the composer, focused.
  const initialTab = nuevo ? "anuncios" : (COMMS_TABS.find((value) => value === tab) ?? "anuncios");

  return (
    <CommsClient
      communitySlug={scope.community.slug}
      composeAnnouncement={Boolean(nuevo)}
      eventId={scope.selected.id}
      eventSlug={scope.selected.slug}
      initialTab={initialTab}
    />
  );
}
