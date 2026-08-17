import { redirect } from "next/navigation";
import { ClipboardList } from "lucide-react";

import { isSiteAdmin, requireStaffSession } from "app/lib/auth-helpers";
import { Empty } from "components/shared/ui/empty";
import { listEventsForOperator } from "lib/orpc/open-spaces/services/get-all";

/** Legacy URL: tareas now live under /admin/<communitySlug>/tareas. */
export default async function TareasLegacyPage({ searchParams }: { searchParams: Promise<{ event?: string }> }) {
  const session = await requireStaffSession();
  const admin = isSiteAdmin(session);

  const { event: eventSlug } = await searchParams;
  const events = await listEventsForOperator(admin ? null : session.user.id);
  const selected = (eventSlug ? events.find((event) => event.slug === eventSlug) : events[0]) ?? events[0];

  if (!selected) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4 p-4 md:p-6">
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Tareas</h1>
        <Empty
          className="py-16"
          description="No sos parte del staff de ninguna comunidad todavía. Pedile a un organizador que te agregue como miembro."
          icon={ClipboardList}
          title="Sin eventos asignados"
        />
      </div>
    );
  }

  redirect(`/admin/${selected.communitySlug}/tareas?event=${encodeURIComponent(selected.slug)}`);
}
