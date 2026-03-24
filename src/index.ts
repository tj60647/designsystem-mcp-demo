/**
 * Design System MCP — Express HTTP Server
 * Author: Thomas J McLeish
 * License: MIT
 *
 * This is the main entry point for the server. It sets up a lightweight
 * Express HTTP server with two routes:
 *
 *   GET  /     — health check, confirms the server is running
 *   POST /mcp  — handles all Model Context Protocol (MCP) JSON-RPC requests
 *
 * The server is fully stateless: every POST to /mcp creates a fresh MCP
 * session, handles the request, then tears down. This makes it compatible
 * with both Heroku (long-running process) and Vercel (serverless functions).
 *
 * ── What is MCP? ──────────────────────────────────────────────────────────
 * MCP (Model Context Protocol) is an open standard that lets AI systems
 * call external "tools" — functions that return structured data. A client
 * (like Claude Desktop or GitHub Copilot) sends a JSON-RPC message to
 * this server asking to call a tool, and the server returns a result.
 *
 * All design-system tools are defined in ./mcp-server.ts.
 * ──────────────────────────────────────────────────────────────────────────
 */

import express from "express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer } from "./mcp-server.js";
import { runMcpTool } from "./toolRunner.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

const app = express();

// Parse incoming JSON bodies — required for MCP's JSON-RPC message format.
app.use(express.json());

// Serve static files from public/ (demo UI, etc.)
app.use(express.static(join(__dirname, "../public")));

// Redirect /demo → /demo.html for convenience
app.get("/demo", (_req, res) => {
  res.redirect("/demo.html");
});

// ── Root redirect ─────────────────────────────────────────────────────────
// Send visitors straight to the demo UI. MCP clients and uptime monitors
// that need a JSON health check can use GET /health instead.
// ─────────────────────────────────────────────────────────────────────────
app.get("/", (_req, res) => {
  res.redirect("/demo");
});

// ── Health check ──────────────────────────────────────────────────────────
// Lightweight JSON status endpoint for MCP clients, Heroku, Vercel, and
// uptime monitors that need to confirm the server is alive.
// ─────────────────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({
    name: "Design System MCP",
    version: "0.1.0",
    status: "running",
    mcpEndpoint: "POST /mcp",
    description:
      "A queryable context layer that makes design systems machine-readable and usable by AI.",
    availableTools: [
      "list_token_categories",
      "get_tokens",
      "get_token",
      "list_components",
      "get_component",
      "get_component_tokens",
      "validate_color",
      "get_component_constraints",
      "validate_component_usage",
      "suggest_token",
      "diff_against_system",
      "search",
    ],
    additionalEndpoints: {
      "GET /demo": "Split-panel chatbot demo UI",
      "POST /api/chat": "OpenRouter-backed agentic chat with MCP tool calling",
      "GET /prompt-templates": "Pre-built prompt templates for the demo",
    },
  });
});

// ── MCP endpoint ──────────────────────────────────────────────────────────
// AI clients send their JSON-RPC "tool call" requests here as HTTP POST.
//
// Each request goes through three steps:
//   1. A fresh McpServer is created (with all tools registered).
//   2. A StreamableHTTPServerTransport is created in stateless mode
//      (sessionIdGenerator: undefined means no persistent sessions).
//   3. The incoming request body is handed to the transport, which routes
//      it to the correct tool and writes the JSON result back to the client.
//
// The transport is closed when the HTTP response finishes, ensuring
// no memory leaks between requests.
// ─────────────────────────────────────────────────────────────────────────
app.post("/mcp", async (req, res) => {
  try {
    // Fresh server instance per request (stateless pattern)
    const server = createMcpServer();

    // Stateless transport — no session IDs, no persistent connections.
    // This is the simplest mode and works well for serverless deployments.
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    // Ensure the transport is cleaned up after the response is sent.
    res.on("finish", () => {
      transport.close().catch((err: unknown) => {
        console.error("Transport close error:", err);
      });
    });

    // Wire the MCP server to the transport, then process the request.
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("MCP request error:", err);
    // Only send an error response if the headers haven't already been sent.
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

// ── Prompt templates ──────────────────────────────────────────────────────
// Returns pre-built prompt templates for the demo UI's quick-start chips.
// ─────────────────────────────────────────────────────────────────────────
app.get("/prompt-templates", (_req, res) => {
  res.json({
    templates: [
      {
        id: "login-form",
        title: "Create a login form",
        description: "Generate a login form using design system components and tokens",
        prompt: "Create a login form with email, password fields and a primary submit button",
      },
      {
        id: "primary-colors",
        title: "List primary colors",
        description: "Discover primary color tokens in the design system",
        prompt: "What primary color tokens are available in the design system?",
      },
      {
        id: "button-variants",
        title: "Button variants",
        description: "Explore button variants and their token usage",
        prompt: "Show me all the button variants and their token usage",
      },
      {
        id: "dark-mode",
        title: "Dark mode tokens",
        description: "Find token overrides for implementing dark mode",
        prompt: "What token overrides are needed to implement dark mode?",
      },
      {
        id: "accessible-input",
        title: "Accessible input",
        description: "Build an accessible input field with error state",
        prompt: "Create an accessible input field with error state and helper text",
      },
      {
        id: "card-badge",
        title: "Card with badge",
        description: "Combine a card component with a badge overlay",
        prompt: "Create a card component with a success badge in the top right corner",
      },
      {
        id: "spacing-scale",
        title: "Spacing scale",
        description: "Find the right spacing tokens for a comfortable form",
        prompt: "What spacing tokens should I use for a form with comfortable padding?",
      },
      {
        id: "navigation-bar",
        title: "Navigation bar",
        description: "Design a navigation bar using design system tokens",
        prompt: "Design a navigation bar using only design system tokens",
      },
    ],
  });
});

// ── OpenRouter tool definitions ───────────────────────────────────────────
// These mirror the MCP tools but are expressed in the OpenAI function-calling
// format that OpenRouter understands.
// ─────────────────────────────────────────────────────────────────────────
const OPENROUTER_TOOLS = [
  {
    type: "function",
    function: {
      name: "list_token_categories",
      description: "List all top-level token categories available in the design system (e.g. color, typography, spacing, borderRadius, shadow). Use this first to discover what token data is available before calling get_tokens.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_tokens",
      description: "Get design tokens by category (color, typography, spacing, borderRadius, shadow, motion, layout). Returns the full nested token tree for that category. Omit category to get all tokens at once.",
      parameters: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: ["color", "typography", "spacing", "borderRadius", "shadow", "motion", "layout"],
            description: "Optional token category. If omitted, all tokens are returned.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_token",
      description: 'Get a single token by its dot-notation path. Examples: "color.primary.600", "spacing.4", "typography.fontFamily.sans". Returns the token entry including value, type, and description if available.',
      parameters: {
        type: "object",
        properties: {
          tokenPath: { type: "string", description: 'Dot-notation path to the token. Example: "color.primary.600"' },
        },
        required: ["tokenPath"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_components",
      description: "List all components in the design system with their names, descriptions, available variants, and sizes.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_component",
      description: 'Get the complete specification for a design system component. Returns props, variants, sizes, token references, usage constraints, and accessibility requirements. Example componentName values: "button", "input", "card", "badge".',
      parameters: {
        type: "object",
        properties: {
          componentName: { type: "string", description: 'The component key or name (case-insensitive). Examples: "button", "input", "card", "badge".' },
        },
        required: ["componentName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_component_tokens",
      description: "Get all design token references used by a specific component. Returns a deduplicated, sorted list of token paths the component depends on.",
      parameters: {
        type: "object",
        properties: {
          componentName: { type: "string", description: 'The component key (e.g. "button", "input", "card").' },
        },
        required: ["componentName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "validate_color",
      description: 'Check whether a CSS color value (like "#2563eb" or "rgb(37,99,235)") maps to a named token in the design system.',
      parameters: {
        type: "object",
        properties: {
          colorValue: { type: "string", description: 'A CSS color value to look up. Examples: "#2563eb", "#ffffff".' },
        },
        required: ["colorValue"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_component_constraints",
      description: "Get the usage constraints and accessibility requirements for a design system component.",
      parameters: {
        type: "object",
        properties: {
          componentName: { type: "string", description: 'The component key (e.g. "button", "input", "card", "badge").' },
        },
        required: ["componentName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "validate_component_usage",
      description: "Validate whether a component configuration is valid according to the design system rules. Pass the component name and a props/config object to check.",
      parameters: {
        type: "object",
        properties: {
          componentName: { type: "string", description: 'Component key, e.g. "button", "input".' },
          config: {
            type: "object",
            description: 'Props/config object to validate, e.g. { "variant": "primary", "size": "xl" }.',
            additionalProperties: true,
          },
        },
        required: ["componentName", "config"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "suggest_token",
      description: "Suggest the most appropriate design token for a described intent (e.g. 'primary button background', 'error text color'). Returns a ranked list of matching tokens.",
      parameters: {
        type: "object",
        properties: {
          intent: { type: "string", description: "Natural-language description of what the token should be used for." },
          category: {
            type: "string",
            enum: ["color", "typography", "spacing", "borderRadius", "shadow", "motion", "layout"],
            description: "Optionally restrict the search to a single token category.",
          },
        },
        required: ["intent"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "diff_against_system",
      description: "Compare a set of CSS properties or component props against the design system definitions. Flags values that don't match any token.",
      parameters: {
        type: "object",
        properties: {
          properties: {
            type: "object",
            description: 'Map of CSS property names to values, e.g. { "background-color": "#2563eb", "font-size": "14px" }.',
            additionalProperties: { type: "string" },
          },
        },
        required: ["properties"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search",
      description: "Search across all design system tokens, components, and icons by keyword. Returns matching results ranked by relevance.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: 'Search term, e.g. "primary blue" or "modal overlay".' },
          limit: { type: "number", description: "Maximum number of results to return (default 10, max 50)." },
        },
        required: ["query"],
      },
    },
  },
] as const;

const CHAT_SYSTEM_PROMPT =
  "You are a design system expert assistant. You have access to a design system MCP server with tokens and components. " +
  "When the user asks about UI components, colors, spacing, typography, or design tokens, call the appropriate tools to get accurate data from the design system before answering. " +
  "Always use the actual token values and component specs from the tools — never guess or invent values. " +
  "When the user asks you to create, build, design, or show a UI element or component, always include a complete, self-contained HTML snippet " +
  "in a fenced html code block (opening fence: three backticks followed by html) that can be rendered directly in a browser. " +
  "The HTML snippet must use inline styles only (no external stylesheets) and apply the exact token values (colors, spacing, font sizes, etc.) " +
  "returned by the MCP tools. Include only the component markup — no html, head, or body wrappers.";

// ── Chat endpoint ──────────────────────────────────────────────────────────
// OpenRouter-backed agentic loop. Calls OpenRouter with the conversation and
// all 12 design-system tools. Tool calls are executed locally via runMcpTool,
// and results are fed back into the loop until the model returns a final answer.
// ─────────────────────────────────────────────────────────────────────────
app.post("/api/chat", async (req, res) => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    res.status(503).json({
      error: "OpenRouter not configured. Set OPENROUTER_API_KEY environment variable.",
    });
    return;
  }

  const { messages, model: requestedModel } = req.body as {
    messages: Array<{ role: "user" | "assistant"; content: string }>;
    model?: string;
  };

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages array is required and must not be empty." });
    return;
  }

  const model = requestedModel ?? process.env.OPENROUTER_MODEL ?? "google/gemini-flash-1.5";

  // Build the message list for OpenRouter: system + conversation
  type OpenRouterMessage = {
    role: string;
    content: string | null;
    tool_calls?: unknown[];
    tool_call_id?: string;
    name?: string;
  };
  const loopMessages: OpenRouterMessage[] = [
    { role: "system", content: CHAT_SYSTEM_PROMPT },
    ...messages,
  ];

  const toolCallsUsed: string[] = [];
  const MAX_ITERATIONS = 5;

  try {
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const orResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://github.com/designsystem-mcp-demo",
          "X-Title": "Design System MCP Demo",
        },
        body: JSON.stringify({
          model,
          messages: loopMessages,
          tools: OPENROUTER_TOOLS,
          tool_choice: "auto",
        }),
      });

      if (!orResponse.ok) {
        const errText = await orResponse.text();
        res.status(502).json({ error: "OpenRouter API error", details: errText });
        return;
      }

      const orData = await orResponse.json() as {
        choices: Array<{
          message: {
            role: string;
            content: string | null;
            tool_calls?: Array<{
              id: string;
              type: string;
              function: { name: string; arguments: string };
            }>;
          };
          finish_reason: string;
        }>;
      };

      const choice = orData.choices[0];
      if (!choice) {
        res.status(502).json({ error: "OpenRouter returned no choices." });
        return;
      }

      const assistantMessage = choice.message;
      loopMessages.push(assistantMessage as OpenRouterMessage);

      // If the model requested tool calls, execute them and continue the loop
      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        for (const toolCall of assistantMessage.tool_calls) {
          const toolName = toolCall.function.name;
          let toolArgs: Record<string, unknown> = {};
          try {
            toolArgs = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
          } catch {
            toolArgs = {};
          }

          if (!toolCallsUsed.includes(toolName)) toolCallsUsed.push(toolName);

          let toolResult: string;
          try {
            toolResult = await runMcpTool(toolName, toolArgs);
          } catch (toolErr) {
            toolResult = JSON.stringify({ error: String(toolErr) });
          }

          loopMessages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            name: toolName,
            content: toolResult,
          });
        }
        // Continue loop to let the model process tool results
        continue;
      }

      // No tool calls — return the final answer
      const responseText = assistantMessage.content ?? "";
      res.json({ response: responseText, model, toolCallsUsed });
      return;
    }

    // Reached max iterations without a final text response — return whatever is in the last assistant message
    const lastAssistant = [...loopMessages].reverse().find((m: OpenRouterMessage) => m.role === "assistant" && m.content);
    const lastContent = lastAssistant?.content ?? "";
    res.json({ response: String(lastContent), model, toolCallsUsed });
  } catch (err) {
    console.error("Chat error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error during chat." });
    }
  }
});

// ── Server startup ────────────────────────────────────────────────────────
// On Heroku, the PORT environment variable is set automatically by the
// platform — you don't need to configure it.
//
// On Vercel, the express app is exported as the default export below and
// Vercel wraps it as a serverless function. Vercel sets VERCEL=1
// automatically, so listen() is skipped.
// ─────────────────────────────────────────────────────────────────────────
const isVercel = process.env.VERCEL === "1";

if (!isVercel) {
  const PORT = process.env.PORT ?? "3000";
  app.listen(Number(PORT), () => {
    console.log(`\nDesign System MCP server running on http://localhost:${PORT}`);
    console.log(`  Health check : GET  /`);
    console.log(`  MCP endpoint : POST /mcp\n`);
  });
}

// Exported for Vercel's serverless runtime and for testing.
export default app;
