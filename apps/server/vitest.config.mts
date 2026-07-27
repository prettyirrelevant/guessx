import { defineConfig } from "vitest/config";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          APP_ORIGIN: "https://guessx.test",
          AUTH_SIGNING_SECRET: "test-auth-signing-secret-at-least-32-characters",
          TMDB_API_READ_ACCESS_TOKEN: "",
        },
      },
    }),
  ],
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
