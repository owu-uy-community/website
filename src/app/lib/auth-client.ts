import { adminClient, emailOTPClient, inferAdditionalFields } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

import { platformAc, platformRoles } from "lib/authz/catalog";

import type { auth } from "./auth";

export const authClient = createAuthClient({
  // `role`, `banned` and the account's Slack workspace come straight from the server config.
  plugins: [
    inferAdditionalFields<typeof auth>(),
    emailOTPClient(),
    adminClient({ ac: platformAc, roles: platformRoles }),
  ],
});

export const { signIn, signOut, signUp, useSession, getSession } = authClient;
