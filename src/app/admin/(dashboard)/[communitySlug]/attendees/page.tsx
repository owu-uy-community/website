import { notFound } from "next/navigation";

import { requireAdmin } from "app/lib/auth-helpers";

import { resolveAdminCommunityScope } from "../scope";
import AttendeesClient from "./AttendeesClient";

export default async function AttendeesPage({ params }: { params: Promise<{ communitySlug: string }> }) {
  await requireAdmin();

  const { communitySlug } = await params;
  const scope = await resolveAdminCommunityScope(communitySlug, undefined, null);
  if (!scope) notFound();

  return <AttendeesClient />;
}
