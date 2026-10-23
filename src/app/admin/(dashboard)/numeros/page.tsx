import type { Metadata } from "next";

import { requirePermission } from "app/lib/auth-helpers";

import { OwuNumbersClient } from "./OwuNumbersClient";

export const metadata: Metadata = { title: "Números de OWU" };

export default async function OwuNumbersPage() {
  await requirePermission("insight:read");

  return <OwuNumbersClient />;
}
