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
import { setData, resetData, type DataType } from "./dataStore.js";
import { DATA_SCHEMAS } from "./schemas.js";

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
    version: "0.3.0",
    status: "running",
    mcpEndpoint: "POST /mcp",
    description:
      "A queryable context layer that makes design systems machine-readable and usable by AI.",
    primitives: {
      tools: 26,
      resources: "14 URIs + 4 templates",
      prompts: 9,
      logging: "4 levels, 14 events",
      sampling: "5 use cases",
      elicitation: "6 scenarios",
    },
    availableTools: [
      // v0.1.0
      "list_token_categories", "get_tokens", "get_token",
      "list_components", "get_component", "get_component_tokens",
      "validate_color", "get_component_constraints", "validate_component_usage",
      "suggest_token", "diff_against_system", "search", "get_schema",
      // v0.2.0
      "list_themes", "get_theme",
      "list_icons", "get_icon", "search_icons",
      "check_contrast", "get_accessibility_guidance",
      "get_component_variants", "get_component_anatomy", "get_component_relationships",
      "get_layout_guidance", "get_spacing_scale",
      "get_changelog", "get_deprecations",
    ],
    availableResources: [
      "design-system://tokens",
      "design-system://tokens/{category}",
      "design-system://components",
      "design-system://components/{name}/spec",
      "design-system://components/{name}/examples",
      "design-system://themes",
      "design-system://themes/{name}",
      "design-system://icons",
      "design-system://guidelines/accessibility",
      "design-system://guidelines/layout",
      "design-system://guidelines/content",
      "design-system://guidelines/motion",
      "design-system://changelog",
      "design-system://changelog/latest",
      "design-system://deprecations",
    ],
    availablePrompts: [
      "design-system/build-component",
      "design-system/compose-layout",
      "design-system/implement-theme",
      "design-system/review-markup",
      "design-system/audit-page",
      "design-system/migrate-deprecated",
      "design-system/fix-violations",
      "design-system/explain-component",
      "design-system/compare-components",
      "design-system/token-rationale",
    ],
    additionalEndpoints: {
      "GET /demo": "Split-panel chatbot demo UI",
      "POST /api/chat": "OpenRouter-backed agentic chat with MCP tool calling",
      "GET /prompt-templates": "DEPRECATED in v0.3.0 — use MCP Prompts primitive instead. Retained for backward compatibility.",
      "POST /api/data": "Load custom JSON for a data type (tokens, components, themes, icons)",
      "POST /api/data/reset": "Reset all (or one) data type back to the bundled defaults",
      "GET /api/schema/:type": "Download the JSON Schema for a data type (tokens, components, themes, icons)",
      "POST /api/validate": "Validate custom JSON against the schema for a data type without loading it",
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

// ── Data loading endpoints ────────────────────────────────────────────────
// Allow callers to replace one of the four data sets at runtime so that
// subsequent MCP tool calls and chat responses reflect the new data.
// ─────────────────────────────────────────────────────────────────────────

/**
 * POST /api/data
 * Body: { "type": "tokens"|"components"|"themes"|"icons", "data": <object> }
 * Replaces the active data for the given type with the supplied JSON.
 */
app.post("/api/data", (req, res) => {
  const VALID_TYPES: DataType[] = ["tokens", "components", "themes", "icons"];
  const { type, data } = req.body as { type?: string; data?: unknown };

  if (!type || !VALID_TYPES.includes(type as DataType)) {
    res.status(400).json({
      error: `"type" must be one of: ${VALID_TYPES.join(", ")}`,
    });
    return;
  }

  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    res.status(400).json({ error: '"data" must be a JSON object.' });
    return;
  }

  setData(type as DataType, data);
  res.json({ ok: true, type, message: `${type} data replaced. MCP tools now reflect the new data.` });
});

/**
 * POST /api/data/reset
 * Body (optional): { "type": "tokens"|"components"|"themes"|"icons" }
 * Resets the active data back to the bundled on-disk defaults.
 * If no type is supplied, all four data sets are reset.
 */
app.post("/api/data/reset", (req, res) => {
  const VALID_TYPES: DataType[] = ["tokens", "components", "themes", "icons"];
  const { type } = (req.body ?? {}) as { type?: string };

  if (type !== undefined && !VALID_TYPES.includes(type as DataType)) {
    res.status(400).json({
      error: `"type" must be one of: ${VALID_TYPES.join(", ")} (or omit to reset all)`,
    });
    return;
  }

  resetData(type as DataType | undefined);
  const resetTarget = type ?? "all data";
  res.json({ ok: true, type: type ?? "all", message: `${resetTarget} reset to bundled defaults.` });
});

// ── Schema endpoints ─────────────────────────────────────────────────────
// Expose the JSON Schema for each data type so the demo UI can display and
// download the schema, and validate custom JSON before loading it.
// ─────────────────────────────────────────────────────────────────────────

/**
 * GET /api/schema/:type
 * Returns the JSON Schema for the given data type as downloadable JSON.
 */
app.get("/api/schema/:type", (req, res) => {
  const VALID_TYPES: DataType[] = ["tokens", "components", "themes", "icons"];
  const { type } = req.params;

  if (!VALID_TYPES.includes(type as DataType)) {
    res.status(404).json({ error: `Unknown schema type "${type}". Must be one of: ${VALID_TYPES.join(", ")}` });
    return;
  }

  const schema = DATA_SCHEMAS[type];
  if (!schema) {
    res.status(500).json({ error: `Schema not found for type "${type}".` });
    return;
  }
  res.setHeader("Content-Disposition", `attachment; filename="${type}.schema.json"`);
  res.json(schema);
});

/**
 * POST /api/validate
 * Body: { "type": "tokens"|"components"|"themes"|"icons", "data": <object> }
 * Validates the supplied JSON against the schema for the given type.
 * Returns { valid, errors, recommendations } without loading the data.
 */
app.post("/api/validate", (req, res) => {
  const VALID_TYPES: DataType[] = ["tokens", "components", "themes", "icons"];
  const { type, data } = req.body as { type?: string; data?: unknown };

  if (!type || !VALID_TYPES.includes(type as DataType)) {
    res.status(400).json({ error: `"type" must be one of: ${VALID_TYPES.join(", ")}` });
    return;
  }

  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    res.status(400).json({ error: '"data" must be a JSON object.' });
    return;
  }

  const result = validateAgainstSchema(type as DataType, data as Record<string, unknown>);
  res.json(result);
});

/** Lightweight structural validator for each design-system data type. */
function validateAgainstSchema(
  type: DataType,
  data: Record<string, unknown>,
): { valid: boolean; errors: string[]; recommendations: string[] } {
  const errors: string[] = [];
  const recommendations: string[] = [];

  if (type === "tokens") {
    const KNOWN_CATEGORIES = ["color", "typography", "spacing", "borderRadius", "shadow", "motion", "layout"];
    const keys = Object.keys(data);
    if (keys.length === 0) {
      errors.push("tokens.json must have at least one token category.");
    }
    const unknown = keys.filter(k => !KNOWN_CATEGORIES.includes(k));
    if (unknown.length > 0) {
      recommendations.push(
        `Unknown token categories: ${unknown.map(k => `"${k}"`).join(", ")}. ` +
        `Standard categories are: ${KNOWN_CATEGORIES.join(", ")}.`,
      );
    }
    for (const cat of KNOWN_CATEGORIES) {
      if (!(cat in data)) {
        recommendations.push(`Standard category "${cat}" is missing. Add it if your design system uses ${cat} tokens.`);
      }
    }
    // Spot-check leaf nodes for {value, type}
    function checkLeaves(obj: unknown, path: string) {
      if (obj === null || typeof obj !== "object" || Array.isArray(obj)) return;
      const o = obj as Record<string, unknown>;
      const isLeaf = "value" in o || "type" in o;
      if (isLeaf) {
        if (!("value" in o)) errors.push(`Token at "${path}" is missing required property "value".`);
        if (!("type" in o))  errors.push(`Token at "${path}" is missing required property "type".`);
        if ("value" in o && typeof o.value !== "string") errors.push(`Token at "${path}".value must be a string.`);
        if ("type"  in o && typeof o.type  !== "string") errors.push(`Token at "${path}".type must be a string.`);
      } else {
        for (const k of Object.keys(o)) checkLeaves(o[k], `${path}.${k}`);
      }
    }
    for (const cat of keys) checkLeaves(data[cat], cat);
  }

  if (type === "components") {
    const REQUIRED_PROPS = ["name", "description"] as const;
    const keys = Object.keys(data);
    if (keys.length === 0) {
      errors.push("components.json must have at least one component entry.");
    }
    for (const key of keys) {
      const comp = data[key] as Record<string, unknown> | null;
      if (comp === null || typeof comp !== "object" || Array.isArray(comp)) {
        errors.push(`Component "${key}" must be an object.`);
        continue;
      }
      for (const prop of REQUIRED_PROPS) {
        if (!(prop in comp)) errors.push(`Component "${key}" is missing required property "${prop}".`);
        else if (typeof comp[prop] !== "string") errors.push(`Component "${key}".${prop} must be a string.`);
      }
      for (const arr of ["variants", "sizes", "states", "constraints"] as const) {
        if (arr in comp && !Array.isArray(comp[arr])) {
          errors.push(`Component "${key}".${arr} must be an array if present.`);
        }
      }
    }
    if (keys.length > 0 && !("button" in data) && !("input" in data)) {
      recommendations.push(
        'No "button" or "input" component found. Most design systems include these core interactive components.',
      );
    }
  }

  if (type === "themes") {
    const REQUIRED_PROPS = ["name", "description", "semantic"] as const;
    const keys = Object.keys(data);
    if (keys.length === 0) {
      errors.push("themes.json must have at least one theme entry.");
    }
    for (const key of keys) {
      const theme = data[key] as Record<string, unknown> | null;
      if (theme === null || typeof theme !== "object" || Array.isArray(theme)) {
        errors.push(`Theme "${key}" must be an object.`);
        continue;
      }
      for (const prop of REQUIRED_PROPS) {
        if (!(prop in theme)) errors.push(`Theme "${key}" is missing required property "${prop}".`);
      }
      if ("semantic" in theme && (typeof theme.semantic !== "object" || Array.isArray(theme.semantic) || theme.semantic === null)) {
        errors.push(`Theme "${key}".semantic must be an object.`);
      } else if (theme.semantic) {
        for (const [k, v] of Object.entries(theme.semantic as object)) {
          if (typeof v !== "string") {
            errors.push(`Theme "${key}".semantic["${k}"] must be a string value.`);
          }
        }
      }
    }
    if (keys.length > 0 && !("light" in data)) {
      recommendations.push('No "light" theme found. A "light" theme is conventional as the default theme.');
    }
  }

  if (type === "icons") {
    const REQUIRED_PROPS = ["name", "category", "keywords", "sizes", "description"] as const;
    const keys = Object.keys(data);
    if (keys.length === 0) {
      errors.push("icons.json must have at least one icon entry.");
    }
    for (const key of keys) {
      const icon = data[key] as Record<string, unknown> | null;
      if (icon === null || typeof icon !== "object" || Array.isArray(icon)) {
        errors.push(`Icon "${key}" must be an object.`);
        continue;
      }
      for (const prop of REQUIRED_PROPS) {
        if (!(prop in icon)) errors.push(`Icon "${key}" is missing required property "${prop}".`);
      }
      if ("keywords" in icon && !Array.isArray(icon.keywords)) {
        errors.push(`Icon "${key}".keywords must be an array.`);
      }
      if ("sizes" in icon && !Array.isArray(icon.sizes)) {
        errors.push(`Icon "${key}".sizes must be an array of numbers.`);
      } else if ("sizes" in icon && Array.isArray(icon.sizes)) {
        for (const s of icon.sizes as unknown[]) {
          if (typeof s !== "number") {
            errors.push(`Icon "${key}".sizes entries must be numbers (e.g. 16, 24).`);
            break;
          }
        }
      }
    }
  }

  return { valid: errors.length === 0, errors, recommendations };
}

// ── Prompt templates ──────────────────────────────────────────────────────
// DEPRECATED in v0.3.0 — use MCP Prompts primitive instead.
// This endpoint is retained for backward compatibility but will be removed
// in a future version. Use the MCP prompts/list and prompts/get methods to
// enumerate and retrieve prompt templates via any MCP client.
// ─────────────────────────────────────────────────────────────────────────
app.get("/prompt-templates", (_req, res) => {
  res.setHeader("Deprecation", "true");
  res.setHeader("Link", '</mcp>; rel="successor-version"');
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
      {
        id: "alert-notification",
        title: "Alert / notification",
        description: "Build an alert or notification banner with status variants",
        prompt: "Create an alert component with success, warning, error, and info variants using design system tokens",
      },
      {
        id: "typography-scale",
        title: "Typography scale",
        description: "Explore available typography tokens and usage",
        prompt: "Show me the typography tokens — sizes, weights, and line-heights — and when to use each",
      },
      {
        id: "icon-search",
        title: "Search icons",
        description: "Find icons available in the design system",
        prompt: "What icons are available in the design system? Show me navigation and action icons",
      },
      {
        id: "token-compliance",
        title: "Token compliance check",
        description: "Check whether common CSS values match design tokens",
        prompt: "Check these CSS values for token compliance: color #2563eb, font-size 16px, border-radius 8px, padding 16px",
      },
      {
        id: "pricing-card",
        title: "Pricing card",
        description: "Build a pricing card component using design system tokens",
        prompt: "Create a pricing card with a plan name, price, feature list, and a primary CTA button using design system tokens",
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
  {
    type: "function",
    function: {
      name: "get_schema",
      description: 'Return the JSON Schema for a design system data file. Use this before loading custom data to understand the expected structure. Valid dataType values: "tokens", "components", "themes", "icons".',
      parameters: {
        type: "object",
        properties: {
          dataType: {
            type: "string",
            enum: ["tokens", "components", "themes", "icons"],
            description: 'The data file to get the schema for.',
          },
        },
        required: ["dataType"],
      },
    },
  },
  // v0.2.0 tools
  { type: "function", function: { name: "list_themes", description: "List all available themes (e.g. light, dark). Returns theme keys, names, and descriptions.", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function", function: { name: "get_theme", description: 'Get full theme definition including all semantic token overrides. Example: "light", "dark".', parameters: { type: "object", properties: { themeName: { type: "string", description: "The theme key." } }, required: ["themeName"] } } },
  { type: "function", function: { name: "list_icons", description: "List all icons, optionally filtered by category or tag.", parameters: { type: "object", properties: { category: { type: "string" }, tag: { type: "string" } }, required: [] } } },
  { type: "function", function: { name: "get_icon", description: "Get a single icon by name with metadata, sizes, and usage guidance.", parameters: { type: "object", properties: { iconName: { type: "string", description: "The icon key, e.g. 'arrow-right'." } }, required: ["iconName"] } } },
  { type: "function", function: { name: "search_icons", description: "Semantic search across the icon set. E.g. 'warning' returns alert-triangle, exclamation-circle.", parameters: { type: "object", properties: { query: { type: "string" }, limit: { type: "number" } }, required: ["query"] } } },
  { type: "function", function: { name: "check_contrast", description: "Check WCAG 2.1 contrast ratio between foreground and background hex colors. Returns AA/AAA pass/fail.", parameters: { type: "object", properties: { foreground: { type: "string", description: "Foreground hex color, e.g. '#1e293b'." }, background: { type: "string", description: "Background hex color, e.g. '#ffffff'." } }, required: ["foreground", "background"] } } },
  { type: "function", function: { name: "get_accessibility_guidance", description: "Get per-component accessibility spec: ARIA roles, keyboard interaction, focus order, screen reader expectations.", parameters: { type: "object", properties: { componentName: { type: "string" } }, required: ["componentName"] } } },
  { type: "function", function: { name: "get_component_variants", description: "List all variants for a component with when-to-use guidance for each.", parameters: { type: "object", properties: { componentName: { type: "string" } }, required: ["componentName"] } } },
  { type: "function", function: { name: "get_component_anatomy", description: "Get internal structure of a component: named slots, valid children, and composition patterns.", parameters: { type: "object", properties: { componentName: { type: "string" } }, required: ["componentName"] } } },
  { type: "function", function: { name: "get_component_relationships", description: "Get component relationships: parent, siblings, related components, and composition contexts.", parameters: { type: "object", properties: { componentName: { type: "string" } }, required: ["componentName"] } } },
  { type: "function", function: { name: "get_layout_guidance", description: "Get layout rules: page gutters, content max-widths, breakpoints, grid columns, and region spacing.", parameters: { type: "object", properties: { context: { type: "string", description: "Optional context, e.g. 'page', 'form', 'dashboard'." } }, required: [] } } },
  { type: "function", function: { name: "get_spacing_scale", description: "Get the complete spacing scale with semantic usage hints for each step.", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function", function: { name: "get_changelog", description: "Get the design system version history, filterable by version range.", parameters: { type: "object", properties: { fromVersion: { type: "string" }, toVersion: { type: "string" } }, required: [] } } },
  { type: "function", function: { name: "get_deprecations", description: "List all deprecated tokens, components, patterns, and endpoints with migration paths.", parameters: { type: "object", properties: { type: { type: "string", enum: ["token", "component", "endpoint", "all"] } }, required: [] } } },
] as const;

const CHAT_SYSTEM_PROMPT =
  "You are a design system expert assistant. You have access to a design system MCP server with tokens, components, themes, icons, and guidelines. " +
  "When the user asks about UI components, colors, spacing, typography, or design tokens, call the appropriate tools to get accurate data from the design system before answering. " +
  "Always use the actual token values and component specs from the tools — never guess or invent values. " +
  "When the user asks you to create, build, design, or show a UI element or component, always include a complete, self-contained HTML snippet " +
  "in a fenced html code block (opening fence: three backticks followed by html) that can be rendered directly in a browser. " +
  "The HTML snippet must use inline styles only (no external stylesheets) and apply the exact token values (colors, spacing, font sizes, etc.) " +
  "returned by the MCP tools. Include only the component markup — no html, head, or body wrappers.";

// ── Chat endpoint ──────────────────────────────────────────────────────────
// OpenRouter-backed agentic loop. Calls OpenRouter with the conversation and
// all 26 design-system tools. Tool calls are executed locally via runMcpTool,
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

  const model = requestedModel ?? process.env.OPENROUTER_MODEL ?? "openai/gpt-oss-20b:nitro";

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
    console.log(`  Health check  : GET  /health`);
    console.log(`  MCP endpoint  : POST /mcp`);
    console.log(`  Version       : 0.3.0`);
    console.log(`  Tools         : 26`);
    console.log(`  Resources     : 14 URIs + 4 templates`);
    console.log(`  Prompts       : 9\n`);
  });
}

// Exported for Vercel's serverless runtime and for testing.
export default app;
