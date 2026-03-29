/**
 * UI state tests — previousAgent client-side state machine.
 *
 * These tests verify that the browser client sets the `previousAgent` field
 * correctly in successive /api/chat requests.  All /api/chat calls are
 * intercepted; the real server is started via playwright.config.ts webServer
 * and no LLM calls are made.
 *
 * Playwright is the right tool here because the behaviour under test is
 * JavaScript running inside the browser (routing state, SSE parsing, request
 * construction) — not the agent logic itself.
 */

import { test, expect, type Page } from "@playwright/test";

// ── helpers ──────────────────────────────────────────────────────────────────

/** Navigate and wait for the chat panel to be ready. */
async function openDemo(page: Page) {
  // In offline/sandboxed environments esm.sh is unreachable, which prevents
  // the JS module graph from loading.  Intercept the CDN import and return a
  // minimal stub so tests run offline.
  await page.route("https://esm.sh/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: [
        "const _esc = (t) => String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;');",
        "export const marked = { parse: (t) => '<p>' + _esc(t) + '</p>', use: () => {} };",
        "export default { parse: (t) => '<p>' + _esc(t) + '</p>', use: () => {} };",
      ].join("\n"),
    })
  );
  await page.goto("/");
  await page.waitForSelector("#send-btn");
}

/** Build an SSE `done` event body. */
function sseDone(overrides: Record<string, unknown> = {}): string {
  return `data: ${JSON.stringify({
    type: "done",
    message: "OK",
    preview: null,
    model: "test-model",
    toolCallsUsed: [],
    thinkingSteps: [],
    generatedDesignSystem: null,
    routedAgent: "unified",
    ...overrides,
  })}\n\n`;
}

/**
 * Fill the chat input, submit, and wait until the loading indicator clears.
 * Using waitForResponse avoids the race between the loading bubble appearing
 * and the route handler completing.
 */
async function sendAndWait(page: Page, text: string): Promise<void> {
  await page.fill("#user-input", text);
  const responsePromise = page.waitForResponse((r) =>
    r.url().includes("/api/chat")
  );
  await page.click("#send-btn");
  await responsePromise;
  await page
    .locator(".loading-bubble")
    .waitFor({ state: "detached", timeout: 10_000 });
}

// ── previousAgent state machine ───────────────────────────────────────────────

test.describe("previousAgent — single-turn continuation", () => {
  test("first message sends previousAgent: null", async ({ page }) => {
    const bodies: unknown[] = [];
    await page.route("/api/chat", async (route) => {
      bodies.push(JSON.parse(route.request().postData() ?? "{}"));
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: sseDone({ routedAgent: "reader" }),
      });
    });

    await openDemo(page);
    await sendAndWait(page, "What tokens are available?");

    expect(
      (bodies[0] as { previousAgent: unknown }).previousAgent
    ).toBeNull();
  });

  test("second message sends previousAgent from prior turn", async ({
    page,
  }) => {
    const bodies: unknown[] = [];
    await page.route("/api/chat", async (route) => {
      bodies.push(JSON.parse(route.request().postData() ?? "{}"));
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: sseDone({ routedAgent: "reader" }),
      });
    });

    await openDemo(page);
    await sendAndWait(page, "What are the spacing tokens?");
    await sendAndWait(page, "And the color tokens?");

    expect(
      (bodies[1] as { previousAgent: unknown }).previousAgent
    ).toBe("reader");
  });

  test("third message sends previousAgent: null (cleared after single continuation turn)", async ({
    page,
  }) => {
    const bodies: unknown[] = [];
    await page.route("/api/chat", async (route) => {
      bodies.push(JSON.parse(route.request().postData() ?? "{}"));
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: sseDone({ routedAgent: "reader" }),
      });
    });

    await openDemo(page);
    await sendAndWait(page, "What are the spacing tokens?");
    await sendAndWait(page, "And the color tokens?");
    await sendAndWait(page, "Now build me a button component");

    expect(
      (bodies[2] as { previousAgent: unknown }).previousAgent
    ).toBeNull();
  });

  test("previousAgent is not stored when routing returned 'unified'", async ({
    page,
  }) => {
    const bodies: unknown[] = [];
    await page.route("/api/chat", async (route) => {
      bodies.push(JSON.parse(route.request().postData() ?? "{}"));
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: sseDone({ routedAgent: "unified" }),
      });
    });

    await openDemo(page);
    await sendAndWait(page, "Hello");
    await sendAndWait(page, "Tell me about tokens");

    expect(
      (bodies[1] as { previousAgent: unknown }).previousAgent
    ).toBeNull();
  });

  test("second message sends previousAgent: 'style-guide' after a style-guide turn", async ({
    page,
  }) => {
    const bodies: unknown[] = [];
    await page.route("/api/chat", async (route) => {
      bodies.push(JSON.parse(route.request().postData() ?? "{}"));
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: sseDone({ routedAgent: "style-guide" }),
      });
    });

    await openDemo(page);
    await sendAndWait(page, "What are the design principles?");
    await sendAndWait(page, "Tell me more about spatial consistency");

    expect(
      (bodies[1] as { previousAgent: unknown }).previousAgent
    ).toBe("style-guide");
  });

  test("third message sends previousAgent: null after a style-guide continuation turn", async ({
    page,
  }) => {
    const bodies: unknown[] = [];
    await page.route("/api/chat", async (route) => {
      bodies.push(JSON.parse(route.request().postData() ?? "{}"));
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: sseDone({ routedAgent: "style-guide" }),
      });
    });

    await openDemo(page);
    await sendAndWait(page, "Explain the semantic color principle");
    await sendAndWait(page, "Which tokens implement that principle?");
    await sendAndWait(page, "Now show me the button component");

    expect(
      (bodies[2] as { previousAgent: unknown }).previousAgent
    ).toBeNull();
  });
});
