/**
 * Point QStash at the dispatcher: every 5 minutes, POST /api/cron/tick, no retries (the next tick
 * is the retry). Run once per environment; re-running replaces the schedule. Use the exact URL the
 * site answers on (www.owu.uy, no redirect): QStash signs it and the route checks it.
 *
 *   QSTASH_TOKEN=… TICK_URL=https://www.owu.uy/api/cron/tick pnpm jobs:schedule
 */
import { Client } from "@upstash/qstash";

const token = process.env.QSTASH_TOKEN;
const destination = process.env.TICK_URL ?? "https://www.owu.uy/api/cron/tick";
if (!token) throw new Error("Set QSTASH_TOKEN (Upstash console → QStash)");

const client = new Client({ token });
const scheduleId = `owu-tick-${new URL(destination).host}`;
await client.schedules.create({ scheduleId, destination, cron: "*/5 * * * *", retries: 0, method: "POST" });

console.log(`QStash calls ${destination} every 5 minutes (schedule ${scheduleId}).`);
