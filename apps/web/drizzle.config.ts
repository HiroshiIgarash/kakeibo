import { defineConfig } from "drizzle-kit";

// DDL（generate/migrate）は Supabase 直結（port 5432）の DIRECT_URL を使う。
// generate は DB 接続不要（schema から SQL を生成するだけ）。migrate 実行時のみ url を参照する。
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DIRECT_URL ?? "",
  },
});
