"use client";

import { signOut, useSession } from "app/lib/auth-client";
import { UserAvatarMenu } from "components/shared/ui/user-avatar-menu";
import { platformRolesOf } from "lib/authz/catalog";

/** The signed-in visitor's avatar menu; nothing for everyone else */
export default function SessionMenu() {
  const { data: session, isPending } = useSession();

  if (!session?.user || isPending) return null;

  return (
    <UserAvatarMenu
      showAdminSettings={platformRolesOf(session.user.role).some((role) => role !== "user")}
      user={session.user}
      onSignOut={() => signOut()}
    />
  );
}
