import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  // Only UI/browser tests live here.  API integration tests use node:test
  // (tests/api.test.ts) and agent evals use promptfoo (evals/).
  testDir: "./tests",
  testIgnore: ["**/api.test.ts"],
  timeout: 15_000,
  retries: 0,
  use: {
    baseURL: "http://localhost:3033",
    headless: true,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // Build first so `node dist/index.js` is available, then start the server.
    command: "npm run build && PORT=3033 node dist/index.js",
    url: "http://localhost:3033/health",
    timeout: 60_000,
    reuseExistingServer: !process.env.CI,
    env: {
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY ?? "test-key",
    },
  },
});
