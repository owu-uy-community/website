import { redirect } from "next/navigation";

/** The event's own dashboard comes later; until then its root opens the editor. */
export default async function EventPage({ params }: { params: Promise<{ communitySlug: string; eventId: string }> }) {
  const { communitySlug, eventId } = await params;

  redirect(`/organizar/panel/${communitySlug}/eventos/${eventId}/editar`);
}
