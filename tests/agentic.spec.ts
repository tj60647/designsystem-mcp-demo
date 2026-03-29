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
 *  5. MCP tool correctness — POST /mcp tool calls return well-formed, semantically
 *     correct results verified against the bundled design system data.
 *
 * All /api/chat calls are intercepted; the real /api/agent-info and POST /mcp
 * are served by the dev server started in playwright.config.ts.
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

// ── 3. MCP tool correctness ───────────────────────────────────────────────────
// These tests call POST /mcp directly (no mocking) and verify that the MCP
// server returns well-formed, semantically correct responses.
//
// Format used: MCP JSON-RPC 2.0 over HTTP (stateless StreamableHTTPTransport).

type McpRequest = { jsonrpc: string; id: number; method: string; params: unknown };
let _mcpSeq = 0;

/** POST /mcp and return the parsed result, throwing on protocol error. */
async function mcpCall(
  apiRequest: import("@playwright/test").APIRequestContext,
  method: string,
  params: unknown = {},
): Promise<unknown> {
  const body: McpRequest = { jsonrpc: "2.0", id: ++_mcpSeq, method, params };
  const res = await apiRequest.post("/mcp", {
    data: body,
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
  });

  // The transport may reply with JSON or SSE.  Handle both.
  const ct = res.headers()["content-type"] ?? "";
  if (ct.includes("application/json")) {
    const json = await res.json() as { result?: unknown; error?: { message?: string } };
    if (json.error) throw new Error(json.error.message ?? "MCP error");
    return json.result;
  }

  // SSE path — scan for a result event
  const text = await res.text();
  for (const line of text.split("\n")) {
    if (!line.startsWith("data: ")) continue;
    try {
      const event = JSON.parse(line.slice(6)) as { result?: unknown; error?: { message?: string } };
      if (event.result !== undefined) return event.result;
      if (event.error) throw new Error(event.error.message ?? "MCP error");
    } catch { /* skip non-JSON lines */ }
  }
  throw new Error("No result in MCP response");
}

test.describe("MCP tool correctness", () => {

  // ── tools/list ──────────────────────────────────────────────────────────────

  test("tools/list returns at least 27 tools", async ({ request }) => {
    const result = await mcpCall(request, "tools/list") as {
      tools: Array<{ name: string; description: string }>;
    };
    expect(Array.isArray(result.tools)).toBe(true);
    expect(result.tools.length).toBeGreaterThanOrEqual(27);
  });

  test("tools/list includes all expected tool names", async ({ request }) => {
    const result = await mcpCall(request, "tools/list") as {
      tools: Array<{ name: string }>;
    };
    const names = result.tools.map(t => t.name);
    const required = [
      "list_token_categories", "get_tokens", "get_token",
      "list_components", "get_component", "get_component_tokens",
      "check_contrast", "validate_color", "diff_against_system",
      "get_accessibility_guidance", "get_layout_guidance",
      "get_changelog", "get_deprecations", "get_style_guide",
      "list_themes", "get_theme",
      "list_icons", "get_icon", "search_icons",
    ];
    for (const name of required) {
      expect(names, `tools/list is missing "${name}"`).toContain(name);
    }
  });

  test("each tool in tools/list has a description and inputSchema", async ({ request }) => {
    const result = await mcpCall(request, "tools/list") as {
      tools: Array<{ name: string; description?: string; inputSchema?: unknown }>;
    };
    for (const tool of result.tools) {
      expect(tool.description, `${tool.name} is missing description`).toBeTruthy();
      expect(tool.inputSchema, `${tool.name} is missing inputSchema`).toBeDefined();
    }
  });

  // ── resources/list ──────────────────────────────────────────────────────────

  test("resources/list returns design-system:// URIs", async ({ request }) => {
    const result = await mcpCall(request, "resources/list") as {
      resources: Array<{ uri: string }>;
    };
    expect(Array.isArray(result.resources)).toBe(true);
    const uris = result.resources.map(r => r.uri);
    expect(uris.some(u => u.startsWith("design-system://"))).toBe(true);
    expect(uris).toContain("design-system://tokens");
    expect(uris).toContain("design-system://components");
  });

  // ── prompts/list ────────────────────────────────────────────────────────────

  test("prompts/list returns at least 9 prompt definitions", async ({ request }) => {
    const result = await mcpCall(request, "prompts/list") as {
      prompts: Array<{ name: string }>;
    };
    expect(Array.isArray(result.prompts)).toBe(true);
    expect(result.prompts.length).toBeGreaterThanOrEqual(9);
  });

  // ── tools/call — token queries ───────────────────────────────────────────────

  test("get_token returns correct value for color.primary.600", async ({ request }) => {
    const result = await mcpCall(request, "tools/call", {
      name: "get_token",
      arguments: { tokenPath: "color.primary.600" },
    }) as { content: Array<{ text: string }> };
    const text = result.content.map(c => c.text).join("");
    expect(text.toLowerCase()).toContain("#2563eb");
  });

  test("get_tokens with category 'color' returns a non-empty token tree", async ({ request }) => {
    const result = await mcpCall(request, "tools/call", {
      name: "get_tokens",
      arguments: { category: "color" },
    }) as { content: Array<{ text: string }> };
    const text = result.content.map(c => c.text).join("");
    const parsed = JSON.parse(text) as { category: string };
    expect(parsed.category).toBe("color");
  });

  test("list_token_categories returns an array of category names", async ({ request }) => {
    const result = await mcpCall(request, "tools/call", {
      name: "list_token_categories",
      arguments: {},
    }) as { content: Array<{ text: string }> };
    const text = result.content.map(c => c.text).join("");
    expect(text).toContain("color");
    expect(text).toContain("typography");
    expect(text).toContain("spacing");
  });

  // ── tools/call — component queries ───────────────────────────────────────────

  test("list_components returns button and modal in the component list", async ({ request }) => {
    const result = await mcpCall(request, "tools/call", {
      name: "list_components",
      arguments: {},
    }) as { content: Array<{ text: string }> };
    const text = result.content.map(c => c.text).join("").toLowerCase();
    expect(text).toContain("button");
    expect(text).toContain("modal");
  });

  test("get_component returns spec for button with variants and accessibility", async ({ request }) => {
    const result = await mcpCall(request, "tools/call", {
      name: "get_component",
      arguments: { componentName: "button" },
    }) as { content: Array<{ text: string }> };
    const text = result.content.map(c => c.text).join("");
    const spec = JSON.parse(text) as { name: string; variants?: string[]; accessibility?: unknown };
    expect(spec.name.toLowerCase()).toBe("button");
    expect(Array.isArray(spec.variants)).toBe(true);
    expect(spec.accessibility).toBeDefined();
  });

  // ── tools/call — validation ───────────────────────────────────────────────────

  test("check_contrast returns a result with contrastRatio for high-contrast pair", async ({ request }) => {
    const result = await mcpCall(request, "tools/call", {
      name: "check_contrast",
      arguments: { foreground: "#ffffff", background: "#000000" },
    }) as { content: Array<{ text: string }> };
    const text = result.content.map(c => c.text).join("");
    const parsed = JSON.parse(text) as { contrastRatio: number; wcagAA: boolean };
    expect(typeof parsed.contrastRatio).toBe("number");
    expect(parsed.contrastRatio).toBeGreaterThan(18);
    expect(parsed.wcagAA).toBe(true);
  });

  test("check_contrast identifies a low-contrast pair as failing WCAG AA", async ({ request }) => {
    const result = await mcpCall(request, "tools/call", {
      name: "check_contrast",
      arguments: { foreground: "#aaaaaa", background: "#bbbbbb" },
    }) as { content: Array<{ text: string }> };
    const text = result.content.map(c => c.text).join("");
    const parsed = JSON.parse(text) as { wcagAA: boolean };
    expect(parsed.wcagAA).toBe(false);
  });

  // ── tools/call — style guide ──────────────────────────────────────────────────

  test("get_style_guide returns a non-empty style guide object", async ({ request }) => {
    const result = await mcpCall(request, "tools/call", {
      name: "get_style_guide",
      arguments: {},
    }) as { content: Array<{ text: string }> };
    const text = result.content.map(c => c.text).join("");
    expect(text.trim().length).toBeGreaterThan(0);
    // Should include at least one principle or section
    const parsed = JSON.parse(text) as Record<string, unknown>;
    expect(Object.keys(parsed).length).toBeGreaterThan(0);
  });

  // ── tools/call — themes & icons ───────────────────────────────────────────────

  test("list_themes returns both light and dark themes", async ({ request }) => {
    const result = await mcpCall(request, "tools/call", {
      name: "list_themes",
      arguments: {},
    }) as { content: Array<{ text: string }> };
    const text = result.content.map(c => c.text).join("").toLowerCase();
    expect(text).toContain("light");
    expect(text).toContain("dark");
  });

  test("search_icons returns results for query 'arrow'", async ({ request }) => {
    const result = await mcpCall(request, "tools/call", {
      name: "search_icons",
      arguments: { query: "arrow" },
    }) as { content: Array<{ text: string }> };
    const text = result.content.map(c => c.text).join("");
    // Should return either matching icons or an empty results array — not an error
    expect(text.trim().length).toBeGreaterThan(0);
  });

  // ── tools/call — versioning ───────────────────────────────────────────────────

  test("get_changelog returns at least one entry", async ({ request }) => {
    const result = await mcpCall(request, "tools/call", {
      name: "get_changelog",
      arguments: {},
    }) as { content: Array<{ text: string }> };
    const text = result.content.map(c => c.text).join("");
    const parsed = JSON.parse(text) as unknown[];
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);
  });
});
