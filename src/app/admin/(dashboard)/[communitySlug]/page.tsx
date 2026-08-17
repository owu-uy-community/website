import { redirect } from "next/navigation";

/** The community's admin home is its board. */
export default async function CommunityAdminPage({ params }: { params: Promise<{ communitySlug: string }> }) {
  const { communitySlug } = await params;
  redirect(`/admin/${communitySlug}/openspace`);
}
