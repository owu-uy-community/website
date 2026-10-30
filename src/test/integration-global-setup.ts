import { TEST_DATABASE_URL } from "./database-url";
import { recreateDatabase } from "./database";

export async function setup() {
  await recreateDatabase(TEST_DATABASE_URL);
}
