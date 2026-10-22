import { notFound } from "next/navigation";
import { CalendarX2 } from "lucide-react";

import { isSiteAdmin, requireStaffSession } from "app/lib/auth-helpers";
import { HostDeSala } from "components/Admin/sala/HostDeSala";
import { PageContainer } from "components/Admin/ui/page";
import { EmptyState } from "components/Admin/ui/states";

import { resolveAdminCommunityScope } from "../scope";

/** Host de sala: the room host's phone. Open to any member of the event's community. */
export default async function SalaPage({
  params,
  searchParams,
}: {
  params: Promise<{ communitySlug: string }>;
  searchParams: Promise<{ event?: string }>;
}) {
  const session = await requireStaffSession();

  const { communitySlug } = await params;
  const { event: eventSlug } = await searchParams;
  const scope = await resolveAdminCommunityScope(
    communitySlug,
    eventSlug,
    isSiteAdmin(session) ? null : session.user.id
  );
  if (!scope) notFound();

  if (!scope.selected) {
    return (
      <PageContainer className="max-w-[480px]" size="small">
        <EmptyState
          description={`${scope.community.name} todavía no tiene eventos.`}
          icon={CalendarX2}
          title="Sin eventos"
        />
      </PageContainer>
    );
  }

  return <HostDeSala eventId={scope.selected.id} meId={session.user.id} />;
}
