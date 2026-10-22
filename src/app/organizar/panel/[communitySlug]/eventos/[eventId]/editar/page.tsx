import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { EventWizard } from "components/organizar/wizard/EventWizard";
import { dayKey } from "lib/community/time";

import { panelCommunity } from "../../../../access";

export const metadata: Metadata = { title: "Evento · Organizá" };

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ communitySlug: string; eventId: string }>;
}) {
  const { communitySlug, eventId } = await params;
  const access = await panelCommunity(communitySlug);
  if (!access) notFound();
  const { id, slug, name } = access.community;

  return (
    <Suspense>
      <EventWizard community={{ id, slug, name }} eventId={eventId} today={dayKey(new Date())} />
    </Suspense>
  );
}
