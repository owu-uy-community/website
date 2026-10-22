import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { EventsClient } from "components/organizar/events/EventsClient";

import { panelCommunity } from "../../access";

export const metadata: Metadata = { title: "Eventos · Organizá" };

export default async function EventsPage({ params }: { params: Promise<{ communitySlug: string }> }) {
  const { communitySlug } = await params;
  const access = await panelCommunity(communitySlug);
  if (!access) notFound();
  const { id, slug, name } = access.community;

  return (
    <Suspense>
      <EventsClient community={{ id, slug, name }} />
    </Suspense>
  );
}
