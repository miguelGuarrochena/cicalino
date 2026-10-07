import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/* Solo para `pnpm test:db` (requiere DATABASE_URL + pg). */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    fileParallelism: false,
    /* La base es remota (~250 ms por query): con los 5 s por defecto un test
     * largo vence, sigue corriendo sobre el mismo cliente y pisa el rol del
     * test siguiente. */
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
