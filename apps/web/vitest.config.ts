import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // tsconfig の "@/*" → "./src/*" と同じ解決を vitest に与える
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // pglite の WASM 初期化やマイグレーション適用に余裕を持たせる
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
