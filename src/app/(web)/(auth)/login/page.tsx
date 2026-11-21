import { safeNext } from "lib/safe-next";

import { LoginClient } from "./LoginClient";

// Where to go after signing in comes from the URL: rendered per request, allowed to block (Cache Components)
export const instant = false;

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const { next } = await searchParams;

  return <LoginClient next={safeNext(typeof next === "string" ? next : null)} />;
}
