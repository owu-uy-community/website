import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { TalksClient } from "components/organizar/talks/TalksClient";

import { holds, panelCommunity } from "../../access";

export const metadata: Metadata = { title: "Charlas · Organizá" };

// Reads who is looking: rendered per request, allowed to block (Cache Components)
export const instant = false;

export default async function TalksPage({ params }: { params: Promise<{ communitySlug: string }> }) {
  const { communitySlug } = await params;
  const access = await panelCommunity(communitySlug);
  if (!access || !holds(access.community, "talk:read")) notFound();
  const { id, slug, name } = access.community;

  return (
    <Suspense>
      <TalksClient community={{ id, slug, name }} />
    </Suspense>
  );
}
