/**
 * Agent-behavior tests.
 *
 * These tests call POST /api/chat without any mocking and assert on the real
 * LLM-driven output:
 *
 *   • Orchestrator routing — given a natural-language message, the orchestrator
 *     must route to the correct specialist agent (reader, builder, style-guide).
 *
 *   • Tool usage — the specialist must invoke the expected MCP tools so the
 *     response is grounded in actual design-system data.
 *
 *   • Response content — the final message must contain data that could only
 *     have come from the MCP layer (e.g. exact token values, component names).
 *
 * Tests skip automatically when OPENROUTER_API_KEY is absent or set to the
 * placeholder "test-key" value used by the structural/UI test suite.
 *
 * Each test uses a 120-second timeout to allow for LLM round-trips.
 */

import { test, expect } from "@playwright/test";

// ── helpers ──────────────────────────────────────────────────────────────────

const LIVE_KEY =
  process.env.OPENROUTER_API_KEY &&
  process.env.OPENROUTER_API_KEY !== "test-key";

/** Skip the enclosing test when no real API key is available. */
function skipWithoutKey() {
  if (!LIVE_KEY) {
    test.skip(true, "OPENROUTER_API_KEY not configured — skipping live agent test");
  }
}

type DonePayload = {
  type: "done";
  message: string;
  preview: string | null;
  routedAgent: string;
  toolCallsUsed: string[];
  generatedDesignSystem: Record<string, unknown> | null;
  schemaVersion?: string;
};

/**
 * POST /api/chat with a single user message and parse the SSE stream.
 * Returns the `done` event payload.
 *
 * Throws when:
 *   • the HTTP response is not 2xx
 *   • the server emits a `type:"error"` event
 *   • no `done` event is found in the stream
 */
async function chatTurn(
  apiRequest: import("@playwright/test").APIRequestContext,
  userMessage: string,
  previousAgent: string | null = null,
): Promise<DonePayload> {
  const body: Record<string, unknown> = {
    messages: [{ role: "user", content: userMessage }],
    previousAgent,
  };

  const res = await apiRequest.post("/api/chat", {
    data: body,
    headers: { "Content-Type": "application/json" },
    timeout: 120_000,
  });

  if (!res.ok()) {
    const text = await res.text();
    throw new Error(`/api/chat returned ${res.status()}: ${text}`);
  }

  const raw = await res.text();

  // Parse SSE lines looking for the terminal events.
  for (const line of raw.split("\n")) {
    if (!line.startsWith("data: ")) continue;
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(line.slice(6)) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (event.type === "error") {
      throw new Error(`Agent error: ${String(event.error)}`);
    }
    if (event.type === "done") {
      return event as unknown as DonePayload;
    }
  }

  throw new Error("No 'done' event received from /api/chat");
}

// ── 1. Orchestrator routing ───────────────────────────────────────────────────

test.describe("Orchestrator routing", () => {
  test.setTimeout(120_000);

  test("design-token question routes to 'reader'", async ({ request }) => {
    skipWithoutKey();
    const done = await chatTurn(request, "What are the primary color tokens in the design system?");
    expect(done.routedAgent, "expected routing to 'reader'").toBe("reader");
  });

  test("component build request routes to 'builder'", async ({ request }) => {
    skipWithoutKey();
    const done = await chatTurn(request, "Generate the HTML and CSS for a primary button component.");
    expect(done.routedAgent, "expected routing to 'builder'").toBe("builder");
  });

  test("style guide question routes to 'style-guide'", async ({ request }) => {
    skipWithoutKey();
    const done = await chatTurn(request, "Explain the design principles in the style guide.");
    expect(done.routedAgent, "expected routing to 'style-guide'").toBe("style-guide");
  });
});

// ── 2. Reader agent — tool usage and response content ─────────────────────────

test.describe("Reader agent", () => {
  test.setTimeout(120_000);

  test("calls at least one token tool when answering a color token query", async ({ request }) => {
    skipWithoutKey();
    const done = await chatTurn(request, "What is the value of the color.primary.600 token?");
    expect(done.routedAgent).toBe("reader");
    const tokenTools = ["get_token", "get_tokens", "list_token_categories"];
    const usedTokenTool = done.toolCallsUsed.some((t) => tokenTools.includes(t));
    expect(usedTokenTool, `expected one of ${tokenTools.join(", ")} in toolCallsUsed (got: ${done.toolCallsUsed.join(", ")})`).toBe(true);
  });

  test("response contains the actual hex value for color.primary.600", async ({ request }) => {
    skipWithoutKey();
    const done = await chatTurn(request, "What is the exact hex value of the color.primary.600 token?");
    expect(done.routedAgent).toBe("reader");
    // The MCP get_token tool returns #2563eb for color.primary.600.
    // The agent must ground its answer in the tool result.
    expect(done.message.toLowerCase(), "response should contain the actual token value").toContain("#2563eb");
  });

  test("calls list_components when asked to enumerate components", async ({ request }) => {
    skipWithoutKey();
    const done = await chatTurn(request, "List all the components available in the design system.");
    expect(done.routedAgent).toBe("reader");
    expect(done.toolCallsUsed, "expected list_components to be called").toContain("list_components");
  });

  test("response contains 'button' when listing components", async ({ request }) => {
    skipWithoutKey();
    const done = await chatTurn(request, "What components are available?");
    expect(done.routedAgent).toBe("reader");
    expect(done.message.toLowerCase(), "response should mention 'button'").toContain("button");
  });

  test("response JSON carries schemaVersion 1.0", async ({ request }) => {
    skipWithoutKey();
    const done = await chatTurn(request, "What spacing tokens are available?");
    expect(done.schemaVersion, "schemaVersion must be '1.0'").toBe("1.0");
  });
});

// ── 3. Builder agent — tool usage and response content ────────────────────────

test.describe("Builder agent", () => {
  test.setTimeout(120_000);

  test("calls get_component when generating a button", async ({ request }) => {
    skipWithoutKey();
    const done = await chatTurn(request, "Build a primary button component using the design system tokens.");
    expect(done.routedAgent).toBe("builder");
    expect(done.toolCallsUsed, "expected get_component to be called").toContain("get_component");
  });

  test("calls get_component_tokens for a button build", async ({ request }) => {
    skipWithoutKey();
    const done = await chatTurn(request, "Generate HTML for a primary button, using exact token values.");
    expect(done.routedAgent).toBe("builder");
    expect(done.toolCallsUsed, "expected get_component_tokens to be called").toContain("get_component_tokens");
  });

  test("returns a preview with HTML for a button build", async ({ request }) => {
    skipWithoutKey();
    const done = await chatTurn(request, "Generate the HTML markup for a primary button.");
    expect(done.routedAgent).toBe("builder");
    expect(done.preview, "expected non-null HTML preview").not.toBeNull();
    expect(done.preview!.toLowerCase(), "preview should contain a <button> element").toContain("<button");
  });
});

// ── 4. Style Guide agent — tool usage and response content ────────────────────

test.describe("Style Guide agent", () => {
  test.setTimeout(120_000);

  test("calls get_style_guide when answering a principles question", async ({ request }) => {
    skipWithoutKey();
    const done = await chatTurn(request, "What are the core design principles in the style guide?");
    expect(done.routedAgent).toBe("style-guide");
    expect(done.toolCallsUsed, "expected get_style_guide to be called").toContain("get_style_guide");
  });

  test("response is grounded in style guide content (non-empty message)", async ({ request }) => {
    skipWithoutKey();
    const done = await chatTurn(request, "Explain the color usage rules from the style guide.");
    expect(done.routedAgent).toBe("style-guide");
    expect(done.message.trim().length, "message should not be empty").toBeGreaterThan(0);
  });
});

// ── 5. previousAgent continuation — skips re-routing ─────────────────────────

test.describe("previousAgent continuation", () => {
  test.setTimeout(120_000);

  test("follow-up with previousAgent='reader' skips orchestrator and uses reader tools", async ({ request }) => {
    skipWithoutKey();
    // Turn 2 with a known previousAgent: the orchestrator must be bypassed and
    // the reader specialist must respond using its tool set.
    const done = await chatTurn(
      request,
      "And what is the value of the spacing.4 token?",
      "reader",
    );
    expect(done.routedAgent, "should stay with 'reader'").toBe("reader");
    const tokenTools = ["get_token", "get_tokens", "get_spacing_scale"];
    const usedTokenTool = done.toolCallsUsed.some((t) => tokenTools.includes(t));
    expect(usedTokenTool, "expected a token tool to be called").toBe(true);
  });
});
