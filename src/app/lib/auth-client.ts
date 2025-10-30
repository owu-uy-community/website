import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [
    inferAdditionalFields({
      user: {
        role: {
          type: "string",
        },
        status: {
          type: "string",
        },
      },
    }),
  ],
});

export const { signIn, signOut, signUp, useSession, getSession } = authClient;
