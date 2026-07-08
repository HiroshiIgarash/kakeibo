import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { fileURLToPath } from "node:url";
import { schema } from "../db/schema";

const MIGRATIONS_DIR = fileURLToPath(new URL("../../drizzle", import.meta.url));

export type TestDatabase = ReturnType<typeof drizzle<typeof schema>>;

/** テスト毎に新規インメモリ PostgreSQL を構築し、生成済みマイグレーションを適用する。 */
export async function createTestDb(): Promise<{
  db: TestDatabase;
  client: PGlite;
  teardown: () => Promise<void>;
}> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  const teardown = () => client.close();
  return { db, client, teardown };
}
