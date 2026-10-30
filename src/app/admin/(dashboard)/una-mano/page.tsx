import type { Metadata } from "next";

import { requirePermission } from "app/lib/auth-helpers";

import { OutreachClient } from "./OutreachClient";

export const metadata: Metadata = { title: "Comunidades que necesitan una mano" };

export default async function OutreachPage() {
  await requirePermission("insight:read");

  return <OutreachClient />;
}
