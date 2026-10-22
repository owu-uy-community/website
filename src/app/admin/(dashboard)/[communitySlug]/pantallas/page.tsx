import { notFound } from "next/navigation";

import { requireAdmin } from "app/lib/auth-helpers";
import ScreensClient from "components/Admin/screens/ScreensClient";

import { resolveAdminCommunityScope } from "../scope";

/** Pantallas: every screen at the venue, by name, with what it shows and whether it's alive. */
export default async function ScreensPage({
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

  return (
    <ScreensClient
      event={
        scope.selected
          ? {
              id: scope.selected.id,
              name: scope.selected.name,
              slug: scope.selected.slug,
              communitySlug: scope.community.slug,
            }
          : null
      }
      communityName={scope.community.name}
    />
  );
}
