/**
 * Agentic-setup tests.
 *
 * These tests verify the correctness of the multi-agent setup:
 *
 *  1. Builder tool set — `list_components`, `get_component_constraints`, and
 *     `get_component_relationships` must all be present so the builder can
 *     discover components, look up validation rules, and compose composite UIs.
 *
 *  2. Style Guide agent — `get_style_guide`, `get_token`, `get_tokens`, and
 *     `check_contrast` must be present so the style guide agent can explain
 *     design principles, color usage rules, typography, and composition patterns.
 *
 *  3. previousAgent single-turn clearing — `lastRoutedAgent` must be used
 *     for exactly one continuation turn and cleared afterwards, so a topic
 *     change on the third message is re-routed by the orchestrator.
 *
 *  4. Orchestrator last-message scoping — the server must expose only one
 *     specialist agent for routing (verified via /api/agent-info shape).
 *
 * All /api/chat calls are intercepted; the real /api/agent-info is served by
 * the dev server started in playwright.config.ts.
 */
import { test, expect, Page } from "@playwright/test";

// ── helpers ─────────────────────────────────────────────────────────────────

/** Navigate and wait for the chat panel to be ready. */
async function openDemo(page: Page) {
  // In offline/sandboxed environments esm.sh is unreachable, which prevents
  // the JS module graph from loading and breaks all chat interactions.
  // Intercept the CDN import and return a minimal stub so tests run offline.
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
 * Send a chat message and wait until the route handler has fully processed the
 * request (bodies array populated) and the loading indicator has cleared
 * (isLoading = false, send button re-enabled).
 *
 * Using waitForResponse instead of waitForSelector(".msg.assistant") avoids the
 * race where the loading bubble — which also carries class "msg assistant" —
 * fires the selector before the route intercept has run.
 */
async function sendAndWait(page: Page, text: string): Promise<void> {
  await page.fill("#user-input", text);
  const responsePromise = page.waitForResponse((r) => r.url().includes("/api/chat"));
  await page.click("#send-btn");
  await responsePromise;
  // Wait for the loading bubble to be removed so isLoading resets to false
  // before the caller attempts a follow-up turn.  `state: "detached"` resolves
  // immediately when the element is not in the DOM, so there is no risk of
  // hanging if the SSE is processed before this line runs.
  await page.locator(".loading-bubble").waitFor({ state: "detached", timeout: 10_000 });
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

  // ── Style Guide agent ───────────────────────────────────────────────────────

  test("style-guide agent is present in the agent list", async ({ request }) => {
    const res = await request.get("/api/agent-info");
    expect(res.ok()).toBe(true);
    const data = await res.json() as { agents: Array<{ name: string }> };
    const sg = data.agents.find((a) => a.name === "Style Guide");
    expect(sg, "Style Guide agent not found in /api/agent-info").toBeDefined();
  });

  test("style-guide agent exposes get_style_guide", async ({ request }) => {
    const res = await request.get("/api/agent-info");
    const data = await res.json() as { agents: Array<{ name: string; tools: Array<{ name: string }> }> };
    const sg = data.agents.find((a) => a.name === "Style Guide");
    expect(sg).toBeDefined();
    expect(sg!.tools.map((t) => t.name)).toContain("get_style_guide");
  });

  test("style-guide agent has all four core style guide tools", async ({ request }) => {
    const res = await request.get("/api/agent-info");
    const data = await res.json() as { agents: Array<{ name: string; tools: Array<{ name: string }> }> };
    const sg = data.agents.find((a) => a.name === "Style Guide");
    expect(sg).toBeDefined();
    const toolNames = sg!.tools.map((t) => t.name);
    for (const required of ["get_style_guide", "get_token", "get_tokens", "check_contrast"]) {
      expect(toolNames, `style-guide is missing ${required}`).toContain(required);
    }
  });

  test("style-guide agent does NOT include generate_design_system", async ({ request }) => {
    const res = await request.get("/api/agent-info");
    const data = await res.json() as { agents: Array<{ name: string; tools: Array<{ name: string }> }> };
    const sg = data.agents.find((a) => a.name === "Style Guide");
    expect(sg).toBeDefined();
    expect(sg!.tools.map((t) => t.name)).not.toContain("generate_design_system");
  });

  test("style-guide agent does NOT include builder-only tools", async ({ request }) => {
    const res = await request.get("/api/agent-info");
    const data = await res.json() as { agents: Array<{ name: string; tools: Array<{ name: string }> }> };
    const sg = data.agents.find((a) => a.name === "Style Guide");
    expect(sg).toBeDefined();
    const toolNames = sg!.tools.map((t) => t.name);
    // Tools that belong only to the builder / component-authoring workflow
    for (const builderOnly of ["validate_component_usage", "get_component_anatomy", "get_component_relationships", "list_components"]) {
      expect(toolNames, `style-guide should not expose ${builderOnly}`).not.toContain(builderOnly);
    }
  });

  test("style-guide agent tool set is exactly the four expected tools", async ({ request }) => {
    const res = await request.get("/api/agent-info");
    const data = await res.json() as { agents: Array<{ name: string; tools: Array<{ name: string }> }> };
    const sg = data.agents.find((a) => a.name === "Style Guide");
    expect(sg).toBeDefined();
    expect(sg!.tools.map((t) => t.name).sort()).toEqual(
      ["check_contrast", "get_style_guide", "get_token", "get_tokens"]
    );
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
    await sendAndWait(page, "What tokens are available?");

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
    await sendAndWait(page, "What are the spacing tokens?");

    // Turn 2
    await sendAndWait(page, "And the color tokens?");

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
    await sendAndWait(page, "What are the spacing tokens?");

    // Turn 2 (continuation)
    await sendAndWait(page, "And the color tokens?");

    // Turn 3 (new topic — previousAgent must be null so orchestrator re-routes)
    await sendAndWait(page, "Now build me a button component");

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
    await sendAndWait(page, "Hello");

    // Turn 2 — must not carry a previousAgent
    await sendAndWait(page, "Tell me about tokens");

    expect((bodies[1] as { previousAgent: unknown }).previousAgent).toBeNull();
  });

  // ── Style Guide routing ─────────────────────────────────────────────────────

  test("second message sends previousAgent: 'style-guide' when prior turn was routed to style-guide", async ({ page }) => {
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

    // Turn 1 — routed as "style-guide"
    await sendAndWait(page, "What are the design principles?");

    // Turn 2 — follow-up must carry previousAgent: "style-guide"
    await sendAndWait(page, "Tell me more about spatial consistency");

    expect((bodies[1] as { previousAgent: unknown }).previousAgent).toBe("style-guide");
  });

  test("third message sends previousAgent: null after a style-guide continuation turn", async ({ page }) => {
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

    // Turn 1 — style-guide routing
    await sendAndWait(page, "Explain the semantic color principle");

    // Turn 2 — continuation (previousAgent sent)
    await sendAndWait(page, "Which tokens implement that principle?");

    // Turn 3 — new topic; previousAgent must be null (cleared after single-turn use)
    await sendAndWait(page, "Now show me the button component");

    expect((bodies[2] as { previousAgent: unknown }).previousAgent).toBeNull();
  });
});
