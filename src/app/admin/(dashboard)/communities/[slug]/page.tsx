import { requireAdmin } from "app/lib/auth-helpers";

import CommunityDetailClient from "./CommunityDetailClient";

export default async function CommunityDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  await requireAdmin();
  const { slug } = await params;

  return <CommunityDetailClient slug={slug} />;
}
