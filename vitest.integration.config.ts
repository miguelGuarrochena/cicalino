import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/* Solo para `pnpm test:db` (requiere DATABASE_URL + pg). */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
