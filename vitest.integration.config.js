import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/integration/**/*.test.js"],
    setupFiles: ["./tests/integration/setup.js"],
    fileParallelism: false,
    maxWorkers: 1,
    // next-auth imports "next/server" without the .js extension, which plain Node
    // ESM resolution rejects. Inlining lets Vite resolve it so the real Auth.js
    // session pipeline can run in gate6a-session-jwt.test.js.
    server: { deps: { inline: ["next-auth"] } },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
});
