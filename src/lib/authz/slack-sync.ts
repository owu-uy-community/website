import { and, eq, sql } from "drizzle-orm";

import { db } from "../db";
import { account, user } from "../db/schema";
import { audit } from "./audit";
import { OWU_SLACK_TEAM_ID } from "./slack";

type SlackUserInfo = { ok: boolean; error?: string; user?: { deleted?: boolean } };

/**
 * Daily: who holds a role and left the OWU Slack (deactivated there, or gone) stops counting as on
 * it, so their roles stop counting too; someone who comes back is cleared. Asks Slack's
 * `users.info` with Owy's bot token (OWY_SLACK_BOT_TOKEN); without it, it does nothing.
 */
export async function syncOwuSlack(token = process.env.OWY_SLACK_BOT_TOKEN) {
  if (!token) return { skipped: "sin OWY_SLACK_BOT_TOKEN" };
  const holders = await db
    .select({ id: user.id, slackId: account.accountId, deactivatedAt: user.slackDeactivatedAt })
    .from(user)
    .innerJoin(
      account,
      and(eq(account.userId, user.id), eq(account.providerId, "slack"), eq(account.slackTeamId, OWU_SLACK_TEAM_ID))
    )
    .where(
      sql`(${user.role} not in ('user', 'service') or exists (select 1 from "community_members" m where m."userId" = "user"."id"))`
    );

  let left = 0;
  let back = 0;
  for (const holder of holders) {
    const response = await fetch(`https://slack.com/api/users.info?user=${encodeURIComponent(holder.slackId)}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const info = (await response.json().catch(() => ({ ok: false }))) as SlackUserInfo;
    // A failure that says nothing about the person (rate limit, a bad token) changes nothing
    const gone = info.ok ? Boolean(info.user?.deleted) : info.error === "user_not_found" ? true : null;
    if (gone === null) continue;

    if (gone && !holder.deactivatedAt) {
      await db.update(user).set({ slackDeactivatedAt: new Date() }).where(eq(user.id, holder.id));
      await audit(db, {
        actorId: null,
        via: "system",
        action: "user.left_owu_slack",
        targetType: "user",
        targetId: holder.id,
      });
      left++;
    } else if (!gone && holder.deactivatedAt) {
      await db.update(user).set({ slackDeactivatedAt: null }).where(eq(user.id, holder.id));
      await audit(db, {
        actorId: null,
        via: "system",
        action: "user.back_on_owu_slack",
        targetType: "user",
        targetId: holder.id,
      });
      back++;
    }
  }

  return { checked: holders.length, left, back };
}
