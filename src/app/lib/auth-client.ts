import { inferAdditionalFields } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

import type { auth } from "./auth";

export const authClient = createAuthClient({
  // `role` and `status` come straight from the server config, literal types included.
  plugins: [inferAdditionalFields<typeof auth>()],
});

export const { signIn, signOut, signUp, useSession, getSession } = authClient;
