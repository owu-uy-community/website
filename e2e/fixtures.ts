import { test as base, expect, type BrowserContext, type Cookie, type Page } from "@playwright/test";

import { baseURL, E2E_AUTH_SECRET } from "../playwright.config";
import { makeBoard, makeMember, makeSiteAdmin, makeUser, type UserRow } from "../src/test/factories";
import { mintSession } from "../src/test/session";

export type Role = "admin" | "editor" | "member" | "outsider";

type Tenant = Awaited<ReturnType<typeof makeBoard>> & { users: Record<Role, UserRow> };

/** Slack is the only sign-in method, so tests mint sessions straight into the database. */
async function sessionCookie(user: UserRow): Promise<Cookie> {
  const { name, value } = await mintSession(user.id, E2E_AUTH_SECRET);

  return { name, value, domain: "127.0.0.1", path: "/", expires: -1, httpOnly: true, secure: false, sameSite: "Lax" };
}

// Contexts created inside a test inherit the project's `use` options, storageState
// included, so every extra context starts explicitly signed out.
export const signedOut = { cookies: [], origins: [] };
const contextOptions = { baseURL, locale: "es-UY", timezoneId: "America/Montevideo", storageState: signedOut };

export const test = base.extend<{ pageAs: (role: Role | "anonymous") => Promise<Page> }, { tenant: Tenant }>({
  /** Each worker gets its own community, event, rooms, slots and people — no shared seed. */
  tenant: [
    async ({}, use) => {
      const board = await makeBoard();
      const [admin, editor, member, outsider] = await Promise.all([
        makeSiteAdmin(),
        makeMember(board.community.id, "editor"),
        makeMember(board.community.id, "member"),
        makeUser({ name: "Outsider" }),
      ]);
      await use({ ...board, users: { admin, editor, member, outsider } });
    },
    { scope: "worker" },
  ],

  /** The default `page` is signed in as the site admin. */
  storageState: async ({ tenant }, use) => {
    await use({ cookies: [await sessionCookie(tenant.users.admin)], origins: [] });
  },

  /** A fresh page signed in as someone else (or nobody). */
  pageAs: async ({ browser, tenant }, use) => {
    const contexts: BrowserContext[] = [];
    await use(async (role) => {
      const context = await browser.newContext(contextOptions);
      contexts.push(context);
      if (role !== "anonymous") await context.addCookies([await sessionCookie(tenant.users[role])]);

      return context.newPage();
    });
    await Promise.all(contexts.map((context) => context.close()));
  },
});

export { expect };
