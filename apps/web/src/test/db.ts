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

/**
 * public スキーマの全テーブルを TRUNCATE し、シーケンスもリセットする。
 * 「テストごとに新規DB」と同じ初期状態を、PGlite を再生成せずに得るための共通リセット。
 * PGlite/WASM の起動は高コストで、テストごとの再生成はスイート並列実行時に
 * 起動が輻輳して hookTimeout を超える（flaky の原因）ため、ファイルで1回生成
 * + 本関数でのリセットに統一する。
 * テーブルは動的に列挙するため、スキーマにテーブルが増えても修正不要。
 * （drizzle のマイグレーション管理テーブルは drizzle スキーマにあるため対象外）
 */
export async function resetTestDb(client: PGlite): Promise<void> {
  const { rows } = await client.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
  );
  if (rows.length === 0) return;
  const tables = rows.map((r) => `"${r.tablename}"`).join(", ");
  await client.exec(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
}
