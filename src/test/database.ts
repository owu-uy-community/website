import { execFileSync } from "node:child_process";

import { Client } from "pg";

/**
 * Drops and recreates a throwaway database, then pushes the Drizzle schema
 * into it (the repo has no migration history — production is `db:push`-driven
 * too). Used by the integration suite and the e2e suite. Refuses any database
 * whose name doesn't end in `_test`/`_e2e`, so a mistyped URL can never wipe a
 * real one. Fails loudly when Postgres is down: a suite that silently skips is
 * a green light for nothing.
 */
export async function recreateDatabase(databaseUrl: string): Promise<void> {
  const url = new URL(databaseUrl);
  const name = decodeURIComponent(url.pathname.slice(1));
  if (!/_(test|e2e)$/.test(name)) {
    throw new Error(`Refusing to recreate "${name}": throwaway database names must end in "_test" or "_e2e".`);
  }

  const server = new URL(url);
  server.pathname = "/postgres";
  const client = new Client({ connectionString: server.toString() });
  try {
    await client.connect();
  } catch (error) {
    throw new Error(
      `No Postgres at ${url.host} (${error instanceof Error ? error.message : String(error)}). ` +
        "Start it with `docker compose up -d` or point the URL at one.",
      { cause: error }
    );
  }
  try {
    await client.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await client.query(`CREATE DATABASE "${name}"`);
  } finally {
    await client.end();
  }

  try {
    execFileSync("node_modules/.bin/drizzle-kit", ["push", "--force"], {
      env: { ...process.env, DATABASE_URL: url.toString() },
      stdio: "pipe",
    });
  } catch (error) {
    const { stdout = "", stderr = "" } = error as { stdout?: Buffer | string; stderr?: Buffer | string };
    const output = String(stdout) + String(stderr);
    throw new Error(`drizzle-kit push failed against ${name}:\n${output}`, { cause: error });
  }
}
