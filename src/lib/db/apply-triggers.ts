/* eslint-disable no-console */
/**
 * Applies the SQL rules `drizzle-kit push` can't express (src/lib/db/triggers.ts). Idempotent:
 * run it after every schema push.
 *
 *   DATABASE_URL=... pnpm db:triggers
 */
import "dotenv/config";

import { pool } from "./index";
import { TRIGGERS_SQL } from "./triggers";

pool
  .query(TRIGGERS_SQL)
  .then(() => {
    console.log("✅ Triggers applied");
    return pool.end();
  })
  .catch((error: unknown) => {
    console.error("❌ Could not apply the triggers:", error);
    process.exit(1);
  });
