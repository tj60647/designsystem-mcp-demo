/**
 * Agentic-setup tests.
 *
 * These tests verify the correctness of the multi-agent setup:
 *
 *  1. Builder tool set — `list_components`, `get_component_constraints`, and
 *     `get_component_relationships` must all be present so the builder can
 *     discover components, look up validation rules, and compose composite UIs.
 *
 *  2. previousAgent single-turn clearing — `lastRoutedAgent` must be used
 *     for exactly one continuation turn and cleared afterwards, so a topic
 *     change on the third message is re-routed by the orchestrator.
 *
 *  3. Orchestrator last-message scoping — the server must expose only one
 *     specialist agent for routing (verified via /api/agent-info shape).
 *
 * All /api/chat calls are intercepted; the real /api/agent-info is served by
 * the dev server started in playwright.config.ts.
 */
import { test, expect, Page } from "@playwright/test";

// ── helpers ─────────────────────────────────────────────────────────────────

/** Navigate and wait for the chat panel to be ready. */
async function openDemo(page: Page) {
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

// ── 1. /api/agent-info — builder tool set ────────────────────────────────────

test.describe("/api/agent-info — builder tool set", () => {
  test("builder agent exposes get_component_constraints", async ({ request }) => {
    const res = await request.get("/api/agent-info");
    expect(res.ok()).toBe(true);
    const data = await res.json() as { agents: Array<{ name: string; tools: Array<{ name: string }> }> };
    const builder = data.agents.find((a) => a.name === "Component Builder");
    expect(builder).toBeDefined();
    const toolNames = builder!.tools.map((t) => t.name);
    expect(toolNames).toContain("get_component_constraints");
  });

  test("builder agent has all core component tools", async ({ request }) => {
    const res = await request.get("/api/agent-info");
    const data = await res.json() as { agents: Array<{ name: string; tools: Array<{ name: string }> }> };
    const builder = data.agents.find((a) => a.name === "Component Builder");
    const toolNames = builder!.tools.map((t) => t.name);
    for (const required of [
      "list_components",
      "get_component",
      "get_component_tokens",
      "get_component_variants",
      "get_component_anatomy",
      "get_component_constraints",
      "get_component_relationships",
      "get_accessibility_guidance",
      "validate_component_usage",
    ]) {
      expect(toolNames, `builder is missing ${required}`).toContain(required);
    }
  });

  test("generator agent has only generate_design_system", async ({ request }) => {
    const res = await request.get("/api/agent-info");
    const data = await res.json() as { agents: Array<{ name: string; tools: Array<{ name: string }> }> };
    const gen = data.agents.find((a) => a.name === "System Generator");
    expect(gen).toBeDefined();
    expect(gen!.tools.map((t) => t.name)).toEqual(["generate_design_system"]);
  });

  test("orchestrator agent exposes only delegate_to_agent", async ({ request }) => {
    const res = await request.get("/api/agent-info");
    const data = await res.json() as { agents: Array<{ name: string; tools: Array<{ name: string }> }> };
    const orch = data.agents.find((a) => a.name === "Orchestrator");
    expect(orch).toBeDefined();
    expect(orch!.tools.map((t) => t.name)).toEqual(["delegate_to_agent"]);
  });

  test("reader agent does NOT include generate_design_system", async ({ request }) => {
    const res = await request.get("/api/agent-info");
    const data = await res.json() as { agents: Array<{ name: string; tools: Array<{ name: string }> }> };
    const reader = data.agents.find((a) => a.name === "Design System Reader");
    expect(reader).toBeDefined();
    const toolNames = reader!.tools.map((t) => t.name);
    expect(toolNames).not.toContain("generate_design_system");
  });

  test("reader agent includes diff_against_system for CSS compliance queries", async ({ request }) => {
    const res = await request.get("/api/agent-info");
    const data = await res.json() as { agents: Array<{ name: string; tools: Array<{ name: string }> }> };
    const reader = data.agents.find((a) => a.name === "Design System Reader");
    expect(reader).toBeDefined();
    expect(reader!.tools.map((t) => t.name)).toContain("diff_against_system");
  });
});

// ── 2. previousAgent single-turn clearing ────────────────────────────────────

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
    await page.fill("#user-input", "What tokens are available?");
    await page.click("#send-btn");
    await page.waitForSelector(".msg.assistant");

    expect((bodies[0] as { previousAgent: unknown }).previousAgent).toBeNull();
  });

  test("second message sends previousAgent from prior turn", async ({ page }) => {
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

    // Turn 1
    await page.fill("#user-input", "What are the spacing tokens?");
    await page.click("#send-btn");
    await page.waitForSelector(".msg.assistant");

    // Turn 2
    await page.fill("#user-input", "And the color tokens?");
    await page.click("#send-btn");
    await page.waitForSelector(".msg.assistant >> nth=1");

    expect((bodies[1] as { previousAgent: unknown }).previousAgent).toBe("reader");
  });

  test("third message sends previousAgent: null (cleared after turn 2)", async ({ page }) => {
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

    // Turn 1
    await page.fill("#user-input", "What are the spacing tokens?");
    await page.click("#send-btn");
    await page.waitForSelector(".msg.assistant");

    // Turn 2 (continuation)
    await page.fill("#user-input", "And the color tokens?");
    await page.click("#send-btn");
    await page.waitForSelector(".msg.assistant >> nth=1");

    // Turn 3 (new topic — previousAgent must be null so orchestrator re-routes)
    await page.fill("#user-input", "Now build me a button component");
    await page.click("#send-btn");
    await page.waitForSelector(".msg.assistant >> nth=2");

    expect((bodies[2] as { previousAgent: unknown }).previousAgent).toBeNull();
  });

  test("previousAgent is not sent when routing returned unified", async ({ page }) => {
    const bodies: unknown[] = [];
    await page.route("/api/chat", async (route) => {
      bodies.push(JSON.parse(route.request().postData() ?? "{}"));
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        // routedAgent: "unified" — client must NOT store this
        body: sseDone({ routedAgent: "unified" }),
      });
    });

    await openDemo(page);

    // Turn 1 — routed as "unified"
    await page.fill("#user-input", "Hello");
    await page.click("#send-btn");
    await page.waitForSelector(".msg.assistant");

    // Turn 2 — must not carry a previousAgent
    await page.fill("#user-input", "Tell me about tokens");
    await page.click("#send-btn");
    await page.waitForSelector(".msg.assistant >> nth=1");

    expect((bodies[1] as { previousAgent: unknown }).previousAgent).toBeNull();
  });
});
