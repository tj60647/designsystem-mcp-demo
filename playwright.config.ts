import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
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
    // Build first so `node dist/index.js` is available, then start the server
    command: "npm run build && PORT=3033 node dist/index.js",
    url: "http://localhost:3033/health",
    timeout: 60_000,
    reuseExistingServer: !process.env.CI,
    env: {
      // Tests never hit the real LLM — all /api/chat calls are intercepted
      OPENROUTER_API_KEY: "test-key",
    },
  },
});
