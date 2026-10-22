/* eslint-disable no-console */
/**
 * One-time data migration to the permission model (src/lib/authz). Idempotent; a dry run unless
 * --apply. Run it right after deploying the release, once its schema changes are in.
 *
 *   DATABASE_URL=... pnpm auth:migrate-rbac                                  # what would change
 *   DATABASE_URL=... pnpm auth:migrate-rbac -- --apply --superadmin a@b.uy   # do it
 *
 * 1. Slack accounts: the workspace each signed in from, read from the ID token Better Auth kept
 *    (accounts created from now on get it at sign-in).
 * 2. Platform roles: "admin" (site staff) becomes "staff"; the Owy bot becomes a service account;
 *    --superadmin (emails, comma-separated) adds superadmin.
 * 3. API keys: the bot's get the "owy" preset and expire in 90 days (rotate them from /admin/acceso);
 *    keys of people (anyone signed in could mint one before) are deleted.
 * 4. Prints who holds a role without the OWU Slack: they have until OWU_SLACK_REQUIRED_FROM.
 */
import "dotenv/config";
import { and, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";

import { audit } from "../authz/audit";
import { platformRolesOf } from "../authz/catalog";
import { KEY_PRESETS } from "../authz/keys";
import { roleHoldersWithoutOwuSlack, withPlatformRoles } from "../authz/people";
import { OWU_SLACK_REQUIRED_FROM, slackTeamOf } from "../authz/slack";
import { db, pool } from ".";
import { account, apikey, user } from "./schema";

const APPLY = process.argv.includes("--apply");
const superadmins = (process.argv[process.argv.indexOf("--superadmin") + 1] ?? "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter((email) => process.argv.includes("--superadmin") && email.includes("@"));

const BOT_ID = "owy-bot";

async function main() {
  console.log(`🔐 RBAC migration ${APPLY ? "(APPLYING)" : "(dry run — nothing is written; add --apply)"}\n`);

  // 1. Slack workspaces
  const slack = await db
    .select({ id: account.id, idToken: account.idToken })
    .from(account)
    .where(and(eq(account.providerId, "slack"), isNotNull(account.idToken), sql`${account.slackTeamId} is null`));
  let teams = 0;
  for (const row of slack) {
    const team = slackTeamOf(row.idToken);
    if (!team) continue;
    teams++;
    if (APPLY) await db.update(account).set({ slackTeamId: team }).where(eq(account.id, row.id));
  }
  console.log(`1. Slack accounts with their workspace read from the ID token: ${teams} of ${slack.length}`);

  // 2. Platform roles
  const legacy = await db
    .select({ id: user.id, email: user.email, role: user.role })
    .from(user)
    .where(sql`'admin' = any(string_to_array(${user.role}, ','))`);
  for (const person of legacy) {
    const next = person.id === BOT_ID ? "service" : withPlatformRoles(person.role, platformRolesOf(person.role));
    console.log(`2. ${person.email}: ${person.role} → ${next}`);
    if (APPLY) {
      await db.update(user).set({ role: next }).where(eq(user.id, person.id));
      await audit(db, {
        actorId: null,
        via: "system",
        action: "user.set_role",
        targetType: "user",
        targetId: person.id,
        data: { before: person.role, after: next, migration: "rbac" },
      });
    }
  }
  const [bot] = await db.select({ role: user.role }).from(user).where(eq(user.id, BOT_ID));
  if (bot && bot.role !== "service" && !legacy.some((person) => person.id === BOT_ID)) {
    console.log(`2. ${BOT_ID}: ${bot.role} → service`);
    if (APPLY) await db.update(user).set({ role: "service" }).where(eq(user.id, BOT_ID));
  }
  if (superadmins.length > 0) {
    const found = await db
      .select({ id: user.id, email: user.email, role: user.role })
      .from(user)
      .where(inArray(sql`lower(${user.email})`, superadmins));
    for (const email of superadmins.filter(
      (wanted) => !found.some((person) => person.email.toLowerCase() === wanted)
    )) {
      console.log(`2. ⚠️  ${email}: no account with that email (they must sign in once first)`);
    }
    for (const person of found) {
      const current = legacy.some((row) => row.id === person.id)
        ? withPlatformRoles(person.role, platformRolesOf(person.role))
        : person.role;
      const next = withPlatformRoles(current, ["superadmin"]);
      console.log(`2. ${person.email}: + superadmin → ${next}`);
      if (APPLY) await db.update(user).set({ role: next }).where(eq(user.id, person.id));
    }
  }

  // 3. API keys
  const keys = await db
    .select({
      id: apikey.id,
      name: apikey.name,
      owner: apikey.referenceId,
      permissions: apikey.permissions,
      ownerRole: user.role,
    })
    .from(apikey)
    .leftJoin(user, eq(user.id, apikey.referenceId));
  for (const key of keys) {
    if (key.owner === BOT_ID) {
      if (key.permissions) continue;
      console.log(`3. key ${key.name ?? key.id} (Owy): preset "owy", expires in 90 days`);
      if (APPLY) {
        await db
          .update(apikey)
          .set({ permissions: JSON.stringify(KEY_PRESETS.owy), expiresAt: new Date(Date.now() + 90 * 86_400_000) })
          .where(eq(apikey.id, key.id));
      }
    } else if (!platformRolesOf(key.ownerRole).includes("service")) {
      console.log(`3. key ${key.name ?? key.id} of a person (${key.owner}): deleted`);
      if (APPLY) {
        await db.delete(apikey).where(and(eq(apikey.id, key.id), ne(apikey.referenceId, BOT_ID)));
        await audit(db, {
          actorId: null,
          via: "system",
          action: "api_key.revoke",
          targetType: "api_key",
          targetId: key.id,
          data: { owner: key.owner, migration: "rbac" },
        });
      }
    }
  }

  // 4. Report
  const unlinked = APPLY ? await roleHoldersWithoutOwuSlack() : [];
  console.log(
    APPLY
      ? `\n4. ${unlinked.length} people hold a role without the OWU Slack; it stops counting on ${OWU_SLACK_REQUIRED_FROM.toISOString().slice(0, 10)} unless they sign in with it once:`
      : "\n4. (run with --apply to list who holds a role without the OWU Slack)"
  );
  for (const person of unlinked) console.log(`   - ${person.name} <${person.email}> (${person.role})`);
  console.log("\nRemember: `pnpm db:triggers` (the last-owner rule) with the same DATABASE_URL.");
}

main()
  .then(() => pool.end())
  .catch(async (error: unknown) => {
    console.error("❌ RBAC migration failed:", error);
    await pool.end();
    process.exit(1);
  });
