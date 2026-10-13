import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": here("./"),
      // `import "server-only"` throws outside React Server Components; tests are server code too.
      "server-only": here("./tests/support/server-only.ts"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    // Integration tests touch the local database: run them explicitly with `npm run test:integration`.
    exclude: process.env.INTEGRATION ? ["node_modules/**"] : ["node_modules/**", "tests/**/*.integration.test.ts"],
    environment: "node",
  },
});
