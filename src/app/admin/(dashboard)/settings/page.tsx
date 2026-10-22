import { requireDashboardAccess } from "app/lib/auth-helpers";
import { roleLabel } from "lib/authz/labels";

import SettingsClient from "./SettingsClient";

export default async function SettingsPage() {
  const { session, principal } = await requireDashboardAccess();
  const { name, email, image } = session.user;
  // Site roles that count; community staff without one see where they help instead
  const roles = principal.roles.filter((role) => role !== "user").map((role) => roleLabel(role));

  // The account comes from the server's session: the page renders the same on both sides.
  return (
    <SettingsClient
      roleLabel={roles.length > 0 ? roles.join(" · ") : "Staff de una comunidad"}
      sessionId={session.session.id}
      user={{ name, email, image: image ?? null }}
    />
  );
}
