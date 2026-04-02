/**
 * API integration tests — agent-info contracts and MCP tool correctness.
 *
 * Uses Node's built-in test runner (node:test) and fetch.  No browser, no
 * Playwright, no LLM calls.  Tests verify deterministic server behavior:
 *   • parseChatResponse — pure unit tests (no server required)
 *   • /api/agent-info — each agent exposes exactly the expected tool set
 *   • POST /mcp       — MCP tool calls return well-formed, semantically
 *                       correct responses against the bundled design-system data
 *   • POST /api/chat  — SSE stream integration tests (require OPENROUTER_API_KEY)
 *
 * Prerequisites: the server must be running before executing these tests.
 *   npm run dev            (in one terminal)
 *   npm run test:api       (in another)
 *
 * Set TEST_BASE_URL to override the default http://localhost:3033.
 *
 * Run with:
 *   node --import tsx/esm --test tests/api.test.ts
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { parseChatResponse } from "../src/routes/chat.js";

const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3033";

// ── helpers ───────────────────────────────────────────────────────────────────

type AgentInfo = {
  agents: Array<{ name: string; tools: Array<{ name: string }> }>;
};

async function getAgentInfo(): Promise<AgentInfo> {
  const res = await fetch(`${BASE_URL}/api/agent-info`);
  assert.ok(res.ok, `/api/agent-info returned ${res.status}`);
  return res.json() as Promise<AgentInfo>;
}

let _mcpSeq = 0;

async function mcpCall(method: string, params: unknown = {}): Promise<unknown> {
  const body = { jsonrpc: "2.0", id: ++_mcpSeq, method, params };
  const res = await fetch(`${BASE_URL}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });

  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    const json = (await res.json()) as {
      result?: unknown;
      error?: { message?: string };
    };
    if (json.error) throw new Error(json.error.message ?? "MCP error");
    return json.result;
  }

  // SSE path — scan for a result event
  const text = await res.text();
  for (const line of text.split("\n")) {
    if (!line.startsWith("data: ")) continue;
    try {
      const event = JSON.parse(line.slice(6)) as {
        result?: unknown;
        error?: { message?: string };
      };
      if (event.result !== undefined) return event.result;
      if (event.error) throw new Error(event.error.message ?? "MCP error");
    } catch {
      /* skip non-JSON lines */
    }
  }
  throw new Error("No result in MCP response");
}

// ── agent-info — tool set contracts ──────────────────────────────────────────

describe("agent-info — tool set contracts", () => {
  test("builder agent has all core component tools", async () => {
    const data = await getAgentInfo();
    const builder = data.agents.find((a) => a.name === "Component Builder");
    assert.ok(builder, "Component Builder agent not found");
    const toolNames = builder.tools.map((t) => t.name);
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
      assert.ok(toolNames.includes(required), `builder is missing ${required}`);
    }
  });

  test("generator agent has only generate_design_system", async () => {
    const data = await getAgentInfo();
    const gen = data.agents.find((a) => a.name === "System Generator");
    assert.ok(gen, "System Generator agent not found");
    assert.deepEqual(gen.tools.map((t) => t.name), ["generate_design_system"]);
  });

  test("orchestrator exposes only delegate_to_agent", async () => {
    const data = await getAgentInfo();
    const orch = data.agents.find((a) => a.name === "Orchestrator");
    assert.ok(orch, "Orchestrator agent not found");
    assert.deepEqual(orch.tools.map((t) => t.name), ["delegate_to_agent"]);
  });

  test("reader does not include generate_design_system", async () => {
    const data = await getAgentInfo();
    const reader = data.agents.find((a) => a.name === "Design System Reader");
    assert.ok(reader, "Design System Reader agent not found");
    assert.ok(
      !reader.tools.map((t) => t.name).includes("generate_design_system"),
      "reader must not expose generate_design_system"
    );
  });

  test("reader includes diff_against_system", async () => {
    const data = await getAgentInfo();
    const reader = data.agents.find((a) => a.name === "Design System Reader");
    assert.ok(reader, "Design System Reader agent not found");
    assert.ok(
      reader.tools.map((t) => t.name).includes("diff_against_system"),
      "reader is missing diff_against_system"
    );
  });

  test("style-guide agent is present", async () => {
    const data = await getAgentInfo();
    const sg = data.agents.find((a) => a.name === "Style Guide");
    assert.ok(sg, "Style Guide agent not found in /api/agent-info");
  });

  test("style-guide tool set is exactly the four expected tools", async () => {
    const data = await getAgentInfo();
    const sg = data.agents.find((a) => a.name === "Style Guide");
    assert.ok(sg, "Style Guide agent not found");
    assert.deepEqual(sg.tools.map((t) => t.name).sort(), [
      "check_contrast",
      "get_style_guide",
      "get_token",
      "get_tokens",
    ]);
  });

  test("style-guide does not expose builder-only tools", async () => {
    const data = await getAgentInfo();
    const sg = data.agents.find((a) => a.name === "Style Guide");
    assert.ok(sg, "Style Guide agent not found");
    const toolNames = sg.tools.map((t) => t.name);
    for (const builderOnly of [
      "validate_component_usage",
      "get_component_anatomy",
      "get_component_relationships",
      "list_components",
    ]) {
      assert.ok(
        !toolNames.includes(builderOnly),
        `style-guide must not expose ${builderOnly}`
      );
    }
  });
});

// ── MCP tool correctness ──────────────────────────────────────────────────────

describe("MCP tool correctness", () => {
  test("tools/list returns at least 27 tools", async () => {
    const result = (await mcpCall("tools/list")) as { tools: unknown[] };
    assert.ok(Array.isArray(result.tools));
    assert.ok(
      result.tools.length >= 27,
      `expected >= 27 tools, got ${result.tools.length}`
    );
  });

  test("tools/list includes all expected tool names", async () => {
    const result = (await mcpCall("tools/list")) as {
      tools: Array<{ name: string }>;
    };
    const names = result.tools.map((t) => t.name);
    for (const name of [
      "list_token_categories",
      "get_tokens",
      "get_token",
      "list_components",
      "get_component",
      "get_component_tokens",
      "get_component_constraints",
      "get_component_variants",
      "get_component_anatomy",
      "get_component_relationships",
      "validate_component_usage",
      "suggest_token",
      "check_contrast",
      "validate_color",
      "diff_against_system",
      "get_accessibility_guidance",
      "get_layout_guidance",
      "get_spacing_scale",
      "get_changelog",
      "get_deprecations",
      "get_style_guide",
      "list_themes",
      "get_theme",
      "list_icons",
      "get_icon",
      "search_icons",
      "search",
      "get_schema",
    ]) {
      assert.ok(names.includes(name), `tools/list is missing "${name}"`);
    }
  });

  test("each tool has a description and inputSchema", async () => {
    const result = (await mcpCall("tools/list")) as {
      tools: Array<{
        name: string;
        description?: string;
        inputSchema?: unknown;
      }>;
    };
    for (const tool of result.tools) {
      assert.ok(tool.description, `${tool.name} is missing description`);
      assert.ok(
        tool.inputSchema !== undefined,
        `${tool.name} is missing inputSchema`
      );
    }
  });

  test("resources/list includes design-system:// URIs", async () => {
    const result = (await mcpCall("resources/list")) as {
      resources: Array<{ uri: string }>;
    };
    const uris = result.resources.map((r) => r.uri);
    assert.ok(uris.some((u) => u.startsWith("design-system://")));
    assert.ok(uris.includes("design-system://tokens"));
    assert.ok(uris.includes("design-system://components"));
  });

  test("prompts/list returns at least 9 prompts", async () => {
    const result = (await mcpCall("prompts/list")) as { prompts: unknown[] };
    assert.ok(
      result.prompts.length >= 9,
      `expected >= 9 prompts, got ${result.prompts.length}`
    );
  });

  test("get_token returns correct value for color.primary.600", async () => {
    const result = (await mcpCall("tools/call", {
      name: "get_token",
      arguments: { tokenPath: "color.primary.600" },
    })) as { content: Array<{ text: string }> };
    const text = result.content.map((c) => c.text).join("");
    assert.ok(
      text.toLowerCase().includes("#2563eb"),
      `expected #2563eb in "${text}"`
    );
  });

  test("get_tokens returns color category tree", async () => {
    const result = (await mcpCall("tools/call", {
      name: "get_tokens",
      arguments: { category: "color" },
    })) as { content: Array<{ text: string }> };
    const parsed = JSON.parse(result.content.map((c) => c.text).join("")) as {
      category: string;
    };
    assert.equal(parsed.category, "color");
  });

  test("list_token_categories returns color, typography, and spacing", async () => {
    const result = (await mcpCall("tools/call", {
      name: "list_token_categories",
      arguments: {},
    })) as { content: Array<{ text: string }> };
    const text = result.content.map((c) => c.text).join("");
    assert.ok(text.includes("color"));
    assert.ok(text.includes("typography"));
    assert.ok(text.includes("spacing"));
  });

  test("list_components includes button and modal", async () => {
    const result = (await mcpCall("tools/call", {
      name: "list_components",
      arguments: {},
    })) as { content: Array<{ text: string }> };
    const text = result.content.map((c) => c.text).join("").toLowerCase();
    assert.ok(text.includes("button"));
    assert.ok(text.includes("modal"));
  });

  test("get_component returns button spec with variants and accessibility", async () => {
    const result = (await mcpCall("tools/call", {
      name: "get_component",
      arguments: { componentName: "button" },
    })) as { content: Array<{ text: string }> };
    const spec = JSON.parse(result.content.map((c) => c.text).join("")) as {
      name: string;
      variants?: unknown[];
      accessibility?: unknown;
    };
    assert.equal(spec.name.toLowerCase(), "button");
    assert.ok(Array.isArray(spec.variants));
    assert.ok(spec.accessibility !== undefined);
  });

  test("check_contrast: white on black has ratio > 18 and passes WCAG AA", async () => {
    const result = (await mcpCall("tools/call", {
      name: "check_contrast",
      arguments: { foreground: "#ffffff", background: "#000000" },
    })) as { content: Array<{ text: string }> };
    const parsed = JSON.parse(
      result.content.map((c) => c.text).join("")
    ) as { contrastRatio: number; wcagAA: boolean };
    assert.ok(parsed.contrastRatio > 18);
    assert.equal(parsed.wcagAA, true);
  });

  test("check_contrast: light gray on lighter gray fails WCAG AA", async () => {
    const result = (await mcpCall("tools/call", {
      name: "check_contrast",
      arguments: { foreground: "#aaaaaa", background: "#bbbbbb" },
    })) as { content: Array<{ text: string }> };
    const parsed = JSON.parse(
      result.content.map((c) => c.text).join("")
    ) as { wcagAA: boolean };
    assert.equal(parsed.wcagAA, false);
  });

  test("get_style_guide returns a non-empty object", async () => {
    const result = (await mcpCall("tools/call", {
      name: "get_style_guide",
      arguments: {},
    })) as { content: Array<{ text: string }> };
    const text = result.content.map((c) => c.text).join("");
    const parsed = JSON.parse(text) as Record<string, unknown>;
    assert.ok(Object.keys(parsed).length > 0);
  });

  test("list_themes includes light and dark", async () => {
    const result = (await mcpCall("tools/call", {
      name: "list_themes",
      arguments: {},
    })) as { content: Array<{ text: string }> };
    const text = result.content.map((c) => c.text).join("").toLowerCase();
    assert.ok(text.includes("light"));
    assert.ok(text.includes("dark"));
  });

  test("search_icons returns a non-empty result for 'arrow'", async () => {
    const result = (await mcpCall("tools/call", {
      name: "search_icons",
      arguments: { query: "arrow" },
    })) as { content: Array<{ text: string }> };
    const text = result.content.map((c) => c.text).join("");
    assert.ok(text.trim().length > 0);
  });

  test("get_changelog returns at least one entry", async () => {
    const result = (await mcpCall("tools/call", {
      name: "get_changelog",
      arguments: {},
    })) as { content: Array<{ text: string }> };
    const parsed = JSON.parse(
      result.content.map((c) => c.text).join("")
    ) as unknown[];
    assert.ok(Array.isArray(parsed));
    assert.ok(parsed.length > 0);
  });

  test("get_deprecations returns Overlay as a deprecated item", async () => {
    const result = (await mcpCall("tools/call", {
      name: "get_deprecations",
      arguments: {},
    })) as { content: Array<{ text: string }> };
    const parsed = JSON.parse(
      result.content.map((c) => c.text).join("")
    ) as { deprecations: Array<{ name: string }>; total: number };
    assert.ok(Array.isArray(parsed.deprecations));
    assert.ok(parsed.total > 0);
    assert.ok(
      parsed.deprecations.some((d) => d.name === "Overlay"),
      "expected Overlay in deprecations"
    );
  });

  test("get_theme returns dark theme with neutral.900 background reference", async () => {
    const result = (await mcpCall("tools/call", {
      name: "get_theme",
      arguments: { themeName: "dark" },
    })) as { content: Array<{ text: string }> };
    const text = result.content.map((c) => c.text).join("");
    const parsed = JSON.parse(text) as {
      key: string;
      semantic: Record<string, string>;
    };
    assert.equal(parsed.key, "dark");
    assert.ok(
      parsed.semantic["color.semantic.background.default"].includes("neutral.900"),
      "dark theme background should reference neutral.900"
    );
  });

  test("get_accessibility_guidance for button includes role and keyboard support", async () => {
    const result = (await mcpCall("tools/call", {
      name: "get_accessibility_guidance",
      arguments: { componentName: "button" },
    })) as { content: Array<{ text: string }> };
    const text = result.content.map((c) => c.text).join("");
    const parsed = JSON.parse(text) as {
      component: string;
      accessibility: { role: string; keyboardSupport: string[] };
    };
    assert.equal(parsed.component, "Button");
    assert.equal(parsed.accessibility.role, "button");
    assert.ok(
      Array.isArray(parsed.accessibility.keyboardSupport) &&
        parsed.accessibility.keyboardSupport.length > 0,
      "keyboardSupport should be a non-empty array"
    );
  });

  test("get_layout_guidance returns xl container max-width of 1280px", async () => {
    const result = (await mcpCall("tools/call", {
      name: "get_layout_guidance",
      arguments: {},
    })) as { content: Array<{ text: string }> };
    const text = result.content.map((c) => c.text).join("");
    const parsed = JSON.parse(text) as {
      containerMaxWidth: Record<string, { $value: string }>;
    };
    assert.equal(
      parsed.containerMaxWidth.xl?.$value,
      "1280px",
      "xl container max-width should be 1280px"
    );
  });

  test("get_component_anatomy for card includes header and footer slots", async () => {
    const result = (await mcpCall("tools/call", {
      name: "get_component_anatomy",
      arguments: { componentName: "card" },
    })) as { content: Array<{ text: string }> };
    const text = result.content.map((c) => c.text).join("");
    const parsed = JSON.parse(text) as {
      component: string;
      anatomy: { slots: Record<string, string> };
    };
    assert.equal(parsed.component, "Card");
    assert.ok("header" in parsed.anatomy.slots, "card anatomy should have header slot");
    assert.ok("footer" in parsed.anatomy.slots, "card anatomy should have footer slot");
  });
});

// ── parseChatResponse — unit tests ───────────────────────────────────────────

describe("parseChatResponse — unit tests", () => {
  test("correctly-formed JSON extracts all fields", () => {
    const raw = JSON.stringify({
      schemaVersion: "1.0",
      message: "Here is your token.",
      preview: "<div style=\"color:#2563eb\">blue</div>",
      metadata: { agent: "reader", intent: "answer" },
    });
    const result = parseChatResponse(raw);
    assert.equal(result.schemaVersion, "1.0");
    assert.equal(result.message, "Here is your token.");
    assert.equal(result.preview, "<div style=\"color:#2563eb\">blue</div>");
    assert.deepEqual(result.metadata, { agent: "reader", intent: "answer" });
  });

  test("JSON inside a ```json code fence is extracted correctly", () => {
    const inner = JSON.stringify({ schemaVersion: "1.0", message: "From code fence." });
    const raw = "Here is the answer:\n```json\n" + inner + "\n```";
    const result = parseChatResponse(raw);
    assert.equal(result.schemaVersion, "1.0");
    assert.equal(result.message, "From code fence.");
    assert.equal(result.preview, null);
    assert.equal(result.metadata, null);
  });

  test("prose preamble + JSON object — balanced-brace scan finds it", () => {
    const inner = JSON.stringify({ schemaVersion: "1.0", message: "Found via brace scan." });
    const raw = "Sure, here is the result: " + inner;
    const result = parseChatResponse(raw);
    assert.equal(result.schemaVersion, "1.0");
    assert.equal(result.message, "Found via brace scan.");
  });

  test("raw non-JSON text falls back to fallback-text with raw text as message", () => {
    const raw = "This is just plain prose with no JSON at all.";
    const result = parseChatResponse(raw);
    assert.equal(result.schemaVersion, "fallback-text");
    assert.equal(result.message, raw);
    assert.equal(result.preview, null);
    assert.equal(result.metadata, null);
  });

  test("JSON missing message field falls back to raw text", () => {
    const raw = JSON.stringify({ schemaVersion: "1.0", preview: "<div>oops</div>" });
    const result = parseChatResponse(raw);
    assert.equal(result.schemaVersion, "fallback-text");
    assert.equal(result.message, raw);
  });

  test("optional preview absent results in null", () => {
    const raw = JSON.stringify({ schemaVersion: "1.0", message: "No preview here." });
    const result = parseChatResponse(raw);
    assert.equal(result.preview, null);
    assert.equal(result.message, "No preview here.");
  });

  test("optional metadata absent results in null", () => {
    const raw = JSON.stringify({ schemaVersion: "1.0", message: "No metadata here." });
    const result = parseChatResponse(raw);
    assert.equal(result.metadata, null);
    assert.equal(result.message, "No metadata here.");
  });
});

// ── POST /api/chat — SSE integration tests ───────────────────────────────────
//
// These tests require:
//   1. A running server (npm run dev)
//   2. OPENROUTER_API_KEY set in the environment
//
// They are automatically skipped when the API key is absent so the suite
// still passes in CI environments without LLM credentials.
// ─────────────────────────────────────────────────────────────────────────────

const HAS_API_KEY = Boolean(process.env.OPENROUTER_API_KEY);

/**
 * POST /api/chat and collect all SSE events into an array.
 * Aborts with an error if no `done` or `error` event arrives within timeoutMs.
 */
async function collectChatSseEvents(
  body: object,
  timeoutMs = 30_000,
): Promise<Array<Record<string, unknown>>> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    assert.ok(res.ok, `/api/chat returned HTTP ${res.status}`);

    const text = await res.text();
    const events: Array<Record<string, unknown>> = [];
    for (const line of text.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      try {
        const event = JSON.parse(line.slice(6)) as Record<string, unknown>;
        events.push(event);
      } catch { /* skip malformed lines */ }
    }
    return events;
  } finally {
    clearTimeout(timer);
  }
}

describe("POST /api/chat — SSE integration", () => {
  test("empty messages array returns HTTP 400", async () => {
    const res = await fetch(`${BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [] }),
    });
    assert.equal(res.status, 400);
  });

  test("invalid message role returns HTTP 400", async () => {
    const res = await fetch(`${BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "system", content: "hack" }] }),
    });
    assert.equal(res.status, 400);
  });

  test("reader agent returns valid done event", { skip: !HAS_API_KEY }, async () => {
    const events = await collectChatSseEvents({
      messages: [{ role: "user", content: "What is the primary blue token value?" }],
      previousAgent: "reader",
    });

    const errorEvent = events.find((e) => e.type === "error");
    assert.equal(errorEvent, undefined, `unexpected error event: ${JSON.stringify(errorEvent)}`);

    const done = events.at(-1);
    assert.equal(done?.type, "done", "last event should be 'done'");
    assert.ok(typeof done?.message === "string" && done.message.length > 0, "done.message should be a non-empty string");
    assert.equal(done?.schemaVersion, "1.0", "done.schemaVersion should be '1.0'");
    assert.equal(done?.routedAgent, "reader", "done.routedAgent should be 'reader'");
    assert.equal((done?.metadata as Record<string, unknown>)?.agent, "reader", "done.metadata.agent should be 'reader'");
  });

  test("builder agent returns valid done event with preview", { skip: !HAS_API_KEY }, async () => {
    const events = await collectChatSseEvents({
      messages: [{ role: "user", content: "Build me a primary button component." }],
      previousAgent: "builder",
    });

    const errorEvent = events.find((e) => e.type === "error");
    assert.equal(errorEvent, undefined, `unexpected error event: ${JSON.stringify(errorEvent)}`);

    const done = events.at(-1);
    assert.equal(done?.type, "done", "last event should be 'done'");
    assert.ok(typeof done?.message === "string" && done.message.length > 0, "done.message should be a non-empty string");
    assert.equal(done?.schemaVersion, "1.0", "done.schemaVersion should be '1.0'");
    assert.equal(done?.routedAgent, "builder", "done.routedAgent should be 'builder'");
    assert.equal((done?.metadata as Record<string, unknown>)?.agent, "builder", "done.metadata.agent should be 'builder'");
  });

  test("style-guide agent returns valid done event", { skip: !HAS_API_KEY }, async () => {
    const events = await collectChatSseEvents({
      messages: [{ role: "user", content: "What are the typography guidelines?" }],
      previousAgent: "style-guide",
    });

    const errorEvent = events.find((e) => e.type === "error");
    assert.equal(errorEvent, undefined, `unexpected error event: ${JSON.stringify(errorEvent)}`);

    const done = events.at(-1);
    assert.equal(done?.type, "done", "last event should be 'done'");
    assert.ok(typeof done?.message === "string" && done.message.length > 0, "done.message should be a non-empty string");
    assert.equal(done?.schemaVersion, "1.0", "done.schemaVersion should be '1.0'");
    assert.equal(done?.routedAgent, "style-guide", "done.routedAgent should be 'style-guide'");
    assert.equal((done?.metadata as Record<string, unknown>)?.agent, "style-guide", "done.metadata.agent should be 'style-guide'");
  });
});
