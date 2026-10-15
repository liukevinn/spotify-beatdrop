import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: process.env.DB_INTEGRATION === "1" ? [] : ["tests/integration/**"],
    setupFiles: ["tests/setup.ts"],
  },
});
