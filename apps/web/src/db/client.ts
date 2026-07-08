import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { schema } from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

// Supabase transaction-mode pooler は prepared statements 非対応のため prepare:false 必須。
const queryClient = postgres(connectionString, { prepare: false });

export const db = drizzle(queryClient, { schema });
