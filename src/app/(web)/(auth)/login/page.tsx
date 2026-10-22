import { safeNext } from "lib/safe-next";

import { LoginClient } from "./LoginClient";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const { next } = await searchParams;

  return <LoginClient next={safeNext(typeof next === "string" ? next : null)} />;
}
