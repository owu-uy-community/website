import { attachDatabasePool } from "@vercel/functions";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as relations from "./relations";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("POSTGRES_URL or DATABASE_URL environment variable must be set");
}

const fullSchema = { ...schema, ...relations };

// Reuse the pool and client in development to prevent too many connections
const globalForDb = globalThis as unknown as {
  pool: Pool | undefined;
  db: NodePgDatabase<typeof fullSchema> | undefined;
};

const pool =
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
