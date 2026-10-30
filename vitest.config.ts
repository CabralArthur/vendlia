import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: { setupFiles: ["tests/setup-env.ts"], include: ["tests/**/*.test.ts"], testTimeout: 30000, fileParallelism: false },
});
