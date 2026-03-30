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
    // Build and start the app via a cross-platform Node launcher.
    command: "node scripts/playwright-webserver.mjs",
    url: "http://localhost:3033/health",
    timeout: 60_000,
    reuseExistingServer: !process.env.CI,
    env: {
      PORT: "3033",
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY ?? "test-key",
    },
  },
});
