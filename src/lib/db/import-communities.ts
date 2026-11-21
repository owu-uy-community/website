/* eslint-disable no-console */
/**
 * Imports the Keystatic community directory (content/communities/*) into the `communities`
 * table, so organizers can edit their own profile from the panel.
 *
 * Usage:
 *   DATABASE_URL=... pnpm db:import-communities [--dry-run]
 *
 * Safe to re-run: rows are matched by slug, new ones are inserted listed, and an existing row
 * only gets the fields it is missing (a profile edited in the panel is never overwritten).
 */
import { existsSync } from "node:fs";
import path from "node:path";

import { createReader } from "@keystatic/core/reader";
import { eq } from "drizzle-orm";

import keystaticConfig from "../../../keystatic.config";
import { isValidCommunitySlug } from "../tenant";
import { db, pool } from "./index";
import { communities, type CommunityLinks, type CommunityRow, type CommunityStatus } from "./schema";

const DRY_RUN = process.argv.includes("--dry-run");

/** Keystatic slug → DB slug, for a directory entry that already exists under another slug. */
const SLUG_MAP: Record<string, string> = {};

class DryRunRollback extends Error {}

type Imported = {
  slug: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  status: CommunityStatus;
  topics: string[];
  links: CommunityLinks;
  slackChannel: string | null;
  feedNames: string[];
  confPartner: boolean;
  reviewedAt: string | null;
};

const compact = (links: Record<string, string | null | undefined>): CommunityLinks =>
  Object.fromEntries(Object.entries(links).filter(([, value]) => Boolean(value))) as CommunityLinks;

async function readDirectory(): Promise<Imported[]> {
  const reader = createReader(process.cwd(), keystaticConfig);
  const entries = await reader.collections.communities.all();

  return entries.map(({ slug, entry }) => {
    const target = SLUG_MAP[slug] ?? slug;
    if (!isValidCommunitySlug(target)) throw new Error(`"${target}" no es un slug válido de comunidad`);
    const logo = entry.picture || null;
    if (logo && !existsSync(path.join(process.cwd(), "public", logo))) {
      throw new Error(`Falta el logo de ${slug}: public${logo}`);
    }

    return {
      slug: target,
      name: entry.name,
      description: entry.description || null,
      logoUrl: logo,
      status: entry.status,
      topics: [...entry.topics],
      links: compact({
        website: entry.website,
        linkedin: entry.linkedin,
        instagram: entry.instagram,
        meetup: entry.meetup,
      }),
      slackChannel: entry.slackChannel.replace(/^#/, "") || null,
      feedNames: [...entry.feedNames],
      confPartner: entry.confPartner,
      reviewedAt: entry.reviewedAt,
    };
  });
}

/** Only what an existing row is missing; listing it is the one change always applied. */
function fillMissing(row: CommunityRow, item: Imported): Partial<CommunityRow> {
  const patch: Partial<CommunityRow> = {};
  if (!row.description && item.description) patch.description = item.description;
  if (!row.logoUrl && item.logoUrl) patch.logoUrl = item.logoUrl;
  if (row.topics.length === 0 && item.topics.length > 0) patch.topics = item.topics;
  if (Object.keys(row.links).length === 0 && Object.keys(item.links).length > 0) patch.links = item.links;
  if (!row.slackChannel && item.slackChannel) patch.slackChannel = item.slackChannel;
  if (row.feedNames.length === 0 && item.feedNames.length > 0) patch.feedNames = item.feedNames;
  if (!row.confPartner && item.confPartner) patch.confPartner = true;
  if (!row.reviewedAt && item.reviewedAt) patch.reviewedAt = item.reviewedAt;
  if (!row.listed) patch.listed = true;

  return patch;
}

async function main() {
  console.log(`📇 Import communities ${DRY_RUN ? "(DRY RUN — will roll back)" : ""}`);
  const directory = await readDirectory();

  try {
    await db.transaction(async (tx) => {
      for (const item of directory) {
        const [row] = await tx.select().from(communities).where(eq(communities.slug, item.slug));
        if (!row) {
          await tx.insert(communities).values({ ...item, listed: true });
          console.log(`  + ${item.slug} (${item.name})`);
          continue;
        }
        const patch = fillMissing(row, item);
        if (Object.keys(patch).length === 0) {
          console.log(`  = ${item.slug}`);
          continue;
        }
        await tx.update(communities).set(patch).where(eq(communities.id, row.id));
        console.log(`  ~ ${item.slug}: ${Object.keys(patch).join(", ")}`);
      }
      console.log(`✓ ${directory.length} communities`);
      if (DRY_RUN) throw new DryRunRollback();
    });
  } catch (error) {
    if (!(error instanceof DryRunRollback)) throw error;
    console.log("↩︎ Dry run: nothing was written");
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
