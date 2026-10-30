/** Postgres the integration suite recreates on every run. Its name must end in `_test`. */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5433/owu_test";

/** Postgres the e2e suite recreates on every run. Its name must end in `_e2e`. */
export const E2E_DATABASE_URL = process.env.E2E_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5433/owu_e2e";
