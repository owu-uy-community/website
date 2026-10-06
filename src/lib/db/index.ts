import { attachDatabasePool } from "@vercel/functions";
import { drizzle, type NodePgDatabase, type NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { Pool } from "pg";
import * as relations from "./relations";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL environment variable must be set");
}

const fullSchema = { ...schema, ...relations };

/** The app database or a transaction on it: anything a query can run against. */
export type Db = PgDatabase<NodePgQueryResultHKT, typeof fullSchema>;

// Reuse the pool and client in development to prevent too many connections
const globalForDb = globalThis as unknown as {
  pool: Pool | undefined;
  db: NodePgDatabase<typeof fullSchema> | undefined;
};

export const pool =
  globalForDb.pool ??
  new Pool({
    connectionString,
    // Best practices for Vercel Functions with Fluid Compute
    min: 1, // Keep minimum pool size to 1
    max: 10, // Reasonable max (avoid 1 as it harms concurrency)
    idleTimeoutMillis: 5000, // Close idle connections after 5 seconds
    connectionTimeoutMillis: 10000, // Timeout if connection takes too long
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.pool = pool;
}

// Attach the pool to Vercel Fluid for proper lifecycle management
attachDatabasePool(pool);

export const db = globalForDb.db ?? drizzle({ client: pool, schema: fullSchema });

if (process.env.NODE_ENV !== "production") {
  globalForDb.db = db;
}
