/* eslint-disable no-console */
/**
 * One-time multi-tenant backfill (idempotent, transactional).
 *
 * Creates the OWU community, adopts every orphan `open_spaces` row under it,
 * migrates the global countdown singleton and the out-of-band
 * `highlighted_note` row into `event_live_state`, and seeds community
 * memberships (site admins become OWU owners).
 *
 * Usage:
 *   DATABASE_URL=... pnpm db:backfill-communities [--dry-run]
 *
 * Prod cutover order: apply phase-a additive SQL → run this → apply phase-c
 * SET NOT NULL SQL → deploy. Safe to re-run: every step is an upsert/no-op.
 */
import { eq, isNull, sql } from "drizzle-orm";

import { db, pool } from "./index";
import { communities, communityMembers, countdownState, eventLiveState, events, tracks, user } from "./schema";

const DRY_RUN = process.argv.includes("--dry-run");

export const OWU_COMMUNITY = { slug: "owu", name: "OWU Uruguay" } as const;
export const LEGACY_EVENT_ID = "default-openspace";
export const LEGACY_EVENT_SLUG = "la-meetup-2025";

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 48) || "evento"
  );
}

class DryRunRollback extends Error {
  constructor() {
    super("dry-run rollback");
  }
}

async function main() {
  console.log(`🔧 Backfill communities ${DRY_RUN ? "(DRY RUN — will roll back)" : ""}`);

  try {
    await db.transaction(async (tx) => {
      // 1. OWU community ------------------------------------------------------
      const [existingOwu] = await tx.select().from(communities).where(eq(communities.slug, OWU_COMMUNITY.slug));
      let owuId = existingOwu?.id;
      if (!owuId) {
        const [inserted] = await tx
          .insert(communities)
          .values({ slug: OWU_COMMUNITY.slug, name: OWU_COMMUNITY.name })
          .returning({ id: communities.id });
        owuId = inserted.id;
        console.log(`  ✓ Created community "${OWU_COMMUNITY.slug}" (${owuId})`);
      } else {
        console.log(`  = Community "${OWU_COMMUNITY.slug}" already exists (${owuId})`);
      }

      // 2. Adopt orphan events ------------------------------------------------
      const orphans = await tx.select().from(events).where(isNull(events.communityId));
      const takenSlugs = new Set(
        (await tx.select({ slug: events.slug }).from(events).where(eq(events.communityId, owuId)))
          .map((row) => row.slug)
          .filter((value): value is string => value !== null)
      );

      for (const orphan of orphans) {
        let assignedSlug = orphan.id === LEGACY_EVENT_ID ? LEGACY_EVENT_SLUG : slugify(orphan.name);
        let suffix = 2;
        while (takenSlugs.has(assignedSlug)) {
          assignedSlug = `${slugify(orphan.name)}-${suffix}`;
          suffix += 1;
        }
        takenSlugs.add(assignedSlug);

        await tx.update(events).set({ communityId: owuId, slug: assignedSlug }).where(eq(events.id, orphan.id));
        console.log(`  ✓ Event "${orphan.name}" (${orphan.id}) → owu/${assignedSlug}`);
      }
      if (orphans.length === 0) console.log("  = No orphan events");

      // 3. Countdown singleton → event_live_state -----------------------------
      const [legacyEvent] = await tx.select({ id: events.id }).from(events).where(eq(events.id, LEGACY_EVENT_ID));
      if (legacyEvent) {
        const [globalCountdown] = await tx.select().from(countdownState).where(eq(countdownState.id, "global"));
        await tx
          .insert(eventLiveState)
          .values({
            eventId: legacyEvent.id,
            countdownTargetTime: globalCountdown?.targetTime ?? null,
            countdownRemainingSeconds: globalCountdown?.remainingSeconds ?? 0,
            countdownTotalSeconds: globalCountdown?.totalSeconds ?? 0,
            countdownSoundEnabled: globalCountdown?.soundEnabled ?? false,
          })
          .onConflictDoNothing({ target: eventLiveState.eventId });
        console.log(`  ✓ event_live_state seeded for ${legacyEvent.id} (countdown ${globalCountdown ? "copied" : "defaulted"})`);

        // 4. Out-of-band highlighted_note (may not exist as a table) ----------
        const reg = await tx.execute(sql`SELECT to_regclass('public.highlighted_note') AS reg`);
        const hasTable = Boolean((reg.rows[0] as { reg: string | null } | undefined)?.reg);
        if (hasTable) {
          const noteResult = await tx.execute(sql`SELECT * FROM highlighted_note WHERE id = 1 LIMIT 1`);
          const note = noteResult.rows[0] as Record<string, unknown> | undefined;
          const trackId =
            (note?.trackId as string | undefined) ?? (note?.track_id as string | undefined) ?? undefined;
          if (trackId) {
            const [track] = await tx.select({ id: tracks.id }).from(tracks).where(eq(tracks.id, trackId));
            if (track) {
              await tx
                .update(eventLiveState)
                .set({ highlightedTrackId: track.id })
                .where(eq(eventLiveState.eventId, legacyEvent.id));
              console.log(`  ✓ highlighted_note (${track.id}) migrated`);
            }
          } else {
            console.log("  = highlighted_note has no track set");
          }
        } else {
          console.log("  = highlighted_note table not present");
        }
      }

      // 4b. Room colors: rooms without one get a distinct palette color so the
      // board is legible out of the box (admins can change them any time).
      await tx.execute(sql`
        WITH ranked AS (
          SELECT id, row_number() OVER (PARTITION BY "openSpaceId" ORDER BY "sortOrder", name) - 1 AS rn
          FROM rooms WHERE color IS NULL
        )
        UPDATE rooms
        SET color = (ARRAY['#3b82f6','#22c55e','#f59e0b','#ef4444','#a855f7','#06b6d4','#ec4899','#84cc16'])[ranked.rn % 8 + 1]
        FROM ranked WHERE rooms.id = ranked.id
      `);
      console.log("  ✓ Palette colors assigned to color-less rooms");

      // 5. Memberships --------------------------------------------------------
      const users = await tx.select({ id: user.id, role: user.role }).from(user);
      for (const row of users) {
        await tx
          .insert(communityMembers)
          .values({ communityId: owuId, userId: row.id, role: row.role === "admin" ? "owner" : "member" })
          .onConflictDoNothing({ target: [communityMembers.communityId, communityMembers.userId] });
      }
      console.log(`  ✓ Memberships ensured for ${users.length} users`);

      // 6. Eventbrite pin → event column --------------------------------------
      const eventbriteId = process.env.NEXT_PUBLIC_EVENTBRITE_EVENT_ID;
      if (eventbriteId && legacyEvent) {
        await tx
          .update(events)
          .set({ eventbriteEventId: eventbriteId })
          .where(sql`${events.id} = ${LEGACY_EVENT_ID} AND ${events.eventbriteEventId} IS NULL`);
        console.log(`  ✓ eventbriteEventId set from env`);
      }

      // Verification ----------------------------------------------------------
      const [{ orphanCount }] = (
        await tx.execute(sql`SELECT count(*)::int AS "orphanCount" FROM open_spaces WHERE "communityId" IS NULL`)
      ).rows as [{ orphanCount: number }];
      const [{ communityCount }] = (
        await tx.execute(sql`SELECT count(*)::int AS "communityCount" FROM communities`)
      ).rows as [{ communityCount: number }];
      const [{ memberCount }] = (
        await tx.execute(sql`SELECT count(*)::int AS "memberCount" FROM community_members`)
      ).rows as [{ memberCount: number }];

      console.log(`\n  Verification: communities=${communityCount} members=${memberCount} orphanEvents=${orphanCount}`);
      if (orphanCount > 0) throw new Error(`Backfill incomplete: ${orphanCount} open_spaces rows still orphaned`);

      if (DRY_RUN) throw new DryRunRollback();
    });

    console.log(DRY_RUN ? "🔄 Dry run complete — rolled back" : "✅ Backfill committed");
  } catch (error) {
    if (error instanceof DryRunRollback) {
      console.log("🔄 Dry run complete — rolled back");
    } else {
      throw error;
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("❌ Backfill failed:", error);
  process.exit(1);
});
