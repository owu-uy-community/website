import { Pool } from "pg";
import { attachDatabasePool } from "@vercel/functions";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("POSTGRES_URL or DATABASE_URL environment variable must be set");
}

// Create a global pool instance
const globalForPrisma = globalThis as unknown as {
  pool: Pool | undefined;
  prisma: PrismaClient | undefined;
};

// Reuse pool in development to prevent too many connections
const pool =
  globalForPrisma.pool ??
  new Pool({
    connectionString,
    // Best practices for Vercel Functions with Fluid Compute
    min: 1, // Keep minimum pool size to 1
    max: 10, // Reasonable max (avoid 1 as it harms concurrency)
    idleTimeoutMillis: 5000, // Close idle connections after 5 seconds
    connectionTimeoutMillis: 10000, // Timeout if connection takes too long
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.pool = pool;
}

// Attach the pool to Vercel Fluid for proper lifecycle management
attachDatabasePool(pool);

// Create Prisma Client with the pg adapter
const adapter = new PrismaPg(pool);

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
