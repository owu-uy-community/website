import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { CalendarClient } from "components/organizar/calendar/CalendarClient";
import { dayKey } from "lib/community/time";

import { panelCommunity } from "../../access";

export const metadata: Metadata = { title: "Calendario · Organizá" };

export default async function CalendarPage({ params }: { params: Promise<{ communitySlug: string }> }) {
  const { communitySlug } = await params;
  const access = await panelCommunity(communitySlug);
  if (!access) notFound();
  const { id, slug, name } = access.community;

  return (
    <Suspense>
      <CalendarClient community={{ id, slug, name }} today={dayKey(new Date())} />
    </Suspense>
  );
}
