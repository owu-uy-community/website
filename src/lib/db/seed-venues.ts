/**
 * The spaces that hosted OWU meetups, from #organizadores-meetups' canvas: company names only.
 * The repo is public, so no people, emails or Slack ids here; they join through
 * owu.uy/empresas/espacio and consent there. Until then OWU's staff coordinate them.
 *
 *   pnpm db:seed-venues
 */
import { sql } from "drizzle-orm";

import { db } from "./index";
import { venues } from "./schema";

const HOSTS = [
  { name: "CIE · Universidad ORT", notes: "Plan B de siempre: dispuesto y gratis" },
  { name: "Ingenious", notes: "" },
  { name: "Mimiquate", notes: "" },
  { name: "WyeWorks", notes: "" },
  { name: "NeoCoast", notes: "" },
  { name: "Kaizen Softworks", notes: "" },
  { name: "Rootstrap", notes: "" },
  { name: "GoGrow", notes: "" },
  { name: "EagerWorks", notes: "" },
];

const existing = new Set((await db.select({ name: venues.name }).from(venues)).map((row) => row.name.toLowerCase()));
const missing = HOSTS.filter((host) => !existing.has(host.name.toLowerCase()));
if (missing.length > 0) {
  await db.insert(venues).values(missing.map((host) => ({ ...host, status: "active" as const, requestable: false })));
}
const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(venues);
console.log(`Added ${missing.length} spaces (${total} in total).`);
process.exit(0);
