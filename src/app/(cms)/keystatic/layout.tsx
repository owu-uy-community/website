import { notFound } from "next/navigation";

import { requireAdmin } from "app/lib/auth-helpers";

import KeystaticApp from "./cms";

export default async function Layout() {
  // Keystatic runs with local-filesystem storage, so it is dev-only; in prod it
  // must not be reachable at all.
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  await requireAdmin();

  return <KeystaticApp />;
}
