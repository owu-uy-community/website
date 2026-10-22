import type { Metadata } from "next";

import { requireSignedIn } from "app/lib/auth-helpers";

import { AccessClient } from "./AccessClient";

export const metadata: Metadata = { title: "Acceso | OWU Uruguay" };

/**
 * Where people without access to the dashboard land (requireDashboardAccess sends them here): their
 * OWU Slack, a request for access, their Telegram for the Owy bot.
 */
export default async function AccessPage({ searchParams }: { searchParams: Promise<{ error?: string | string[] }> }) {
  await requireSignedIn("/acceso");
  // Linking the Slack comes back here with ?error= when Better Auth refuses it.
  const { error } = await searchParams;

  return (
    <AccessClient
      bot={process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, "") || "owy_bot"}
      linkError={typeof error === "string" ? error : null}
    />
  );
}
