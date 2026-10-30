import { E2E_DATABASE_URL } from "../src/test/database-url";
import { recreateDatabase } from "../src/test/database";

/** Every run starts from an empty schema; each worker seeds its own tenant (fixtures.ts). */
export default async function globalSetup() {
  await recreateDatabase(E2E_DATABASE_URL);
}
