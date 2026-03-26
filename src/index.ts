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
import { setData, getData, resetData, type DataType } from "./dataStore.js";
import { DATA_SCHEMAS } from "./schemas.js";
import { generateDesignSystem } from "./generator.js";
import { extractWebsiteDesignContext, validateWebsiteUrl } from "./websiteExtractor.js";

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
      tools: 27,
      resources: "14 URIs + 4 templates",
      prompts: 10,
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
      "GET /demo": "Split-panel chatbot demo UI with Component Explorer",
      "POST /api/chat": "OpenRouter-backed agentic chat with MCP tool calling",
      "GET /prompt-templates": "DEPRECATED in v0.3.0 — use MCP Prompts primitive instead. Retained for backward compatibility.",
      "GET /api/data/:type": "Read active data for a type (tokens, components, themes, icons) — used by Component Explorer",
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
 * GET /api/data/:type
 * Returns the active data for the given type as JSON.
 * Used by the Component Explorer UI to read live design system data.
 */
app.get("/api/data/:type", (req, res) => {
  const VALID_TYPES: DataType[] = ["tokens", "components", "themes", "icons"];
  const { type } = req.params;

  if (!VALID_TYPES.includes(type as DataType)) {
    res.status(404).json({
      error: `Unknown type "${type}". Must be one of: ${VALID_TYPES.join(", ")}`,
    });
    return;
  }

  res.json(getData(type as DataType));
});

/**
 * POST /api/data
 * Body: { "type": "tokens"|"components"|"themes"|"icons", "data": <object> }
 * Replaces the active data for the given type with the supplied JSON.
 */
app.post("/api/data", (req, res) => {
  const VALID_TYPES: DataType[] = ["tokens", "components", "themes", "icons"];
  const { type, data } = req.body as { type?: string; data?: unknown };

  if (!type || (!VALID_TYPES.includes(type as DataType) && type !== "design-system")) {
    res.status(400).json({
      error: `"type" must be one of: ${[...VALID_TYPES, "design-system"].join(", ")}`,
    });
    return;
  }

  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    res.status(400).json({ error: '"data" must be a JSON object.' });
    return;
  }

  if (type === "design-system") {
    // Split the combined payload and set each present sub-section.
    const combined = data as Record<string, unknown>;
    const loaded: string[] = [];
    for (const section of VALID_TYPES) {
      const sectionData = combined[section];
      if (sectionData !== undefined) {
        if (sectionData === null || typeof sectionData !== "object" || Array.isArray(sectionData)) {
          res.status(400).json({ error: `"${section}" must be a JSON object.` });
          return;
        }
        setData(section, sectionData);
        loaded.push(section);
      }
    }
    if (loaded.length === 0) {
      res.status(400).json({ error: 'design-system JSON must contain at least one of: tokens, components, themes, icons.' });
      return;
    }
    res.json({ ok: true, type: "design-system", loaded, message: `Design system data loaded (${loaded.join(", ")}). MCP tools now reflect the new data.` });
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
  const VALID_TYPES = ["tokens", "components", "themes", "icons", "design-system"];
  const { type } = req.params;

  if (!VALID_TYPES.includes(type)) {
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

  if (!type || (!VALID_TYPES.includes(type as DataType) && type !== "design-system")) {
    res.status(400).json({ error: `"type" must be one of: ${[...VALID_TYPES, "design-system"].join(", ")}` });
    return;
  }

  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    res.status(400).json({ error: '"data" must be a JSON object.' });
    return;
  }

  const result = validateAgainstSchema(type as DataType | "design-system", data as Record<string, unknown>);
  res.json(result);
});

/** Lightweight structural validator for each design-system data type. */
function validateAgainstSchema(
  type: DataType | "design-system",
  data: Record<string, unknown>,
): { valid: boolean; errors: string[]; recommendations: string[] } {
  const errors: string[] = [];
  const recommendations: string[] = [];

  if (type === "design-system") {
    const SECTIONS: DataType[] = ["tokens", "components", "themes", "icons"];
    const keys = Object.keys(data);

    // Warn about unexpected top-level keys
    const unknown = keys.filter(k => !SECTIONS.includes(k as DataType));
    if (unknown.length > 0) {
      recommendations.push(
        `Unexpected top-level keys: ${unknown.map(k => `"${k}"`).join(", ")}. ` +
        `Expected keys are: ${SECTIONS.join(", ")}.`,
      );
    }

    // Recommend adding any missing sections
    for (const section of SECTIONS) {
      if (!(section in data)) {
        recommendations.push(`Section "${section}" is missing. Add it to include ${section} data.`);
      }
    }

    // Validate each present sub-section, prefixing messages with the section name
    for (const section of SECTIONS) {
      if (section in data) {
        const sectionData = data[section];
        if (sectionData === null || typeof sectionData !== "object" || Array.isArray(sectionData)) {
          errors.push(`"${section}" must be a JSON object.`);
        } else {
          const sub = validateAgainstSchema(section, sectionData as Record<string, unknown>);
          for (const e of sub.errors) errors.push(`[${section}] ${e}`);
          for (const r of sub.recommendations) recommendations.push(`[${section}] ${r}`);
        }
      }
    }

    return { valid: errors.length === 0, errors, recommendations };
  }

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
  { type: "function", function: { name: "list_icons", description: "List all icons, optionally filtered by category or tag.", parameters: { type: "object", properties: { category: { type: "string", description: "Optional icon category to filter by, e.g. 'navigation', 'action'." }, tag: { type: "string", description: "Optional tag to filter by, e.g. 'arrow', 'alert'." } }, required: [] } } },
  { type: "function", function: { name: "get_icon", description: "Get a single icon by name with metadata, sizes, and usage guidance.", parameters: { type: "object", properties: { iconName: { type: "string", description: "The icon key, e.g. 'arrow-right'." } }, required: ["iconName"] } } },
  { type: "function", function: { name: "search_icons", description: "Semantic search across the icon set. E.g. 'warning' returns alert-triangle, exclamation-circle.", parameters: { type: "object", properties: { query: { type: "string", description: "Natural-language search term, e.g. 'warning', 'close', 'arrow right'." }, limit: { type: "number", description: "Maximum number of results to return (default 10)." } }, required: ["query"] } } },
  { type: "function", function: { name: "check_contrast", description: "Check WCAG 2.1 contrast ratio between foreground and background hex colors. Returns AA/AAA pass/fail.", parameters: { type: "object", properties: { foreground: { type: "string", description: "Foreground hex color, e.g. '#1e293b'." }, background: { type: "string", description: "Background hex color, e.g. '#ffffff'." } }, required: ["foreground", "background"] } } },
  { type: "function", function: { name: "get_accessibility_guidance", description: "Get per-component accessibility spec: ARIA roles, keyboard interaction, focus order, screen reader expectations.", parameters: { type: "object", properties: { componentName: { type: "string", description: "The component key, e.g. 'button', 'modal', 'input'." } }, required: ["componentName"] } } },
  { type: "function", function: { name: "get_component_variants", description: "List all variants for a component with when-to-use guidance for each.", parameters: { type: "object", properties: { componentName: { type: "string", description: "The component key, e.g. 'button', 'badge', 'alert'." } }, required: ["componentName"] } } },
  { type: "function", function: { name: "get_component_anatomy", description: "Get internal structure of a component: named slots, valid children, and composition patterns.", parameters: { type: "object", properties: { componentName: { type: "string", description: "The component key, e.g. 'card', 'modal', 'select'." } }, required: ["componentName"] } } },
  { type: "function", function: { name: "get_component_relationships", description: "Get component relationships: parent, siblings, related components, and composition contexts.", parameters: { type: "object", properties: { componentName: { type: "string", description: "The component key, e.g. 'button', 'input', 'card'." } }, required: ["componentName"] } } },
  { type: "function", function: { name: "get_layout_guidance", description: "Get layout rules: page gutters, content max-widths, breakpoints, grid columns, and region spacing.", parameters: { type: "object", properties: { context: { type: "string", description: "Optional context, e.g. 'page', 'form', 'dashboard'." } }, required: [] } } },
  { type: "function", function: { name: "get_spacing_scale", description: "Get the complete spacing scale with semantic usage hints for each step.", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function", function: { name: "get_changelog", description: "Get the design system version history, filterable by version range.", parameters: { type: "object", properties: { fromVersion: { type: "string", description: "Inclusive lower bound version, e.g. '0.2.0'." }, toVersion: { type: "string", description: "Inclusive upper bound version, e.g. '0.3.0'." } }, required: [] } } },
  { type: "function", function: { name: "get_deprecations", description: "List all deprecated tokens, components, patterns, and endpoints with migration paths.", parameters: { type: "object", properties: { type: { type: "string", enum: ["token", "component", "endpoint", "all"] } }, required: [] } } },
  // AI generation
  {
    type: "function",
    function: {
      name: "generate_design_system",
      description:
        "Generate a complete design system (tokens, components, themes, icons) from a natural-language description and automatically load it for immediate use. " +
        "Call this once you have gathered sufficient information about the user's brand name, product type, aesthetic direction, primary colors, secondary colors, and typography preferences. " +
        "The generated design system replaces the currently loaded data and is immediately available in the Component Explorer.",
      parameters: {
        type: "object",
        properties: {
          description: {
            type: "string",
            description:
              "Comprehensive description including: brand name, product type, aesthetic direction " +
              "(e.g. modern/minimal, playful, professional, trustworthy, bold/expressive), primary color(s), " +
              "secondary color(s), typography style, and any other brand characteristics provided by the user.",
          },
        },
        required: ["description"],
      },
    },
  },
] as const;

const CHAT_SYSTEM_PROMPT =
  "You are a design system expert assistant. You have access to a design system MCP server with tokens, components, themes, icons, and guidelines. " +
  "When the user asks about UI components, colors, spacing, typography, design tokens, layout, accessibility, themes, icons, changelog, or deprecations, " +
  "call the appropriate tools to get accurate data from the design system before answering. " +
  "Use diff_against_system to check whether CSS properties or values match design system tokens. " +
  "Always use the actual token values and component specs from the tools — never guess or invent values.\n\n" +
  "## Response format\n" +
  "IMPORTANT: Every response must be a single valid JSON object. Output ONLY the JSON — no text, no markdown, no code fences outside it.\n\n" +
  "When answering a question (no UI to render):\n" +
  '{"message": "Your prose answer here."}\n\n' +
  "When generating a UI component:\n" +
  '{"message": "Your prose explanation here.", "preview": "<button style=\\"...\\">...</button>"}\n\n' +
  "Field rules:\n" +
  '  • "message": plain prose text for the chat — no HTML, no code fences. Required.\n' +
  '  • "preview": raw HTML markup only — no backtick fences, no extra wrappers. ' +
  "Use inline styles only. Apply exact token values from the MCP tools. " +
  "Omit this field entirely when no UI is generated.\n\n" +
  "You also help users create brand-new design systems through conversation. " +
  "When a user wants to generate a design system:\n" +
  "1. Gather their brand name, product type, aesthetic direction (e.g. modern/minimal, playful, professional, trustworthy, bold), primary color(s), secondary color(s), and typography style preferences.\n" +
  "2. Ask clarifying questions one at a time until you have at least a clear brand aesthetic and color direction.\n" +
  "3. Once you have enough information (typically after 2–4 exchanges), call the generate_design_system tool with a comprehensive, detailed description.\n" +
  "4. After the tool returns success, briefly summarise what was generated and tell the user it has been loaded and is ready to explore.";

// ── Strategy 3: per-agent system prompts ─────────────────────────────────
const ORCHESTRATOR_SYSTEM_PROMPT =
  "You are a routing agent. Your only job is to classify the user's intent and call delegate_to_agent exactly once.\n\n" +
  'Route to "reader" for: questions, explanations, token lookups, component specs, icon search, theme info, changelog, deprecations, layout and accessibility guidance.\n' +
  'Route to "builder" for: requests to create, build, render, or code a UI component or HTML preview.\n' +
  'Route to "generator" for: requests to create a brand-new design system, extract styles from a website, or generate from scratch.\n\n' +
  "Always call delegate_to_agent. Never answer the user directly.";

const READER_SYSTEM_PROMPT =
  "You are a design system expert assistant. Answer questions about tokens, components, themes, icons, layout, and accessibility by calling the appropriate read-only tools. " +
  "Use diff_against_system to answer CSS compliance questions (e.g. 'does this color or spacing value match our design system tokens?'). " +
  "Always use actual values from the tools — never guess or invent values.\n\n" +
  "IMPORTANT: Every response must be a single valid JSON object. Output ONLY the JSON.\n" +
  'Return: {"message": "Your prose answer here."}\n' +
  '  • "message": plain prose text — no HTML, no code fences. Required.';

const BUILDER_SYSTEM_PROMPT =
  "You are a component code generator. For every component request:\n" +
  "1. Call get_component to fetch the spec and available variants.\n" +
  "2. Call get_component_tokens to resolve the exact token values.\n" +
  "3. Optionally call get_component_variants or get_component_anatomy to understand valid configurations and slot structure.\n" +
  "4. Optionally call get_component_constraints or get_accessibility_guidance to apply ARIA roles, keyboard patterns, and usage rules.\n" +
  "5. Optionally call validate_component_usage or diff_against_system to verify your final configuration against design system rules.\n" +
  "Generate clean HTML with inline styles using exact token values from the tools. Never hard-code colors or spacing.\n\n" +
  "IMPORTANT: Every response must be a single valid JSON object. Output ONLY the JSON.\n" +
  'Return: {"message": "Brief prose explanation.", "preview": "<html with inline styles>"}\n' +
  '  • "message": plain prose — no HTML. Required.\n' +
  '  • "preview": raw HTML only — no fences, no wrappers. Omit when no UI is generated.';

const GENERATOR_SYSTEM_PROMPT =
  "You are a design system architect. Help users create complete new design systems through conversation.\n" +
  "1. Gather brand name, product type, aesthetic direction, primary and secondary colors, and typography preferences.\n" +
  "2. Ask one clarifying question at a time until you have a clear brand direction (typically 2–4 exchanges).\n" +
  "3. Once you have enough information, call generate_design_system with a comprehensive, detailed description.\n" +
  "4. After the tool returns success, briefly summarise what was generated and tell the user it is loaded and ready to explore.\n\n" +
  "IMPORTANT: Every response must be a single valid JSON object. Output ONLY the JSON.\n" +
  'Return: {"message": "Your prose here."}';

// ── Strategy 3: tool subsets per specialist agent ────────────────────────
const READER_TOOL_NAMES = new Set([
  "list_token_categories", "get_tokens", "get_token", "suggest_token", "get_spacing_scale",
  "list_components", "get_component", "get_component_tokens", "get_component_constraints",
  "get_component_variants", "get_component_anatomy", "get_component_relationships",
  "list_themes", "get_theme", "list_icons", "get_icon", "search_icons", "search",
  "get_schema", "get_layout_guidance", "get_accessibility_guidance", "get_changelog", "get_deprecations",
  // Pure query tools — also useful when the reader answers accessibility/compliance questions
  "validate_color", "check_contrast",
  // CSS compliance: "does this color/spacing value match our design system?"
  "diff_against_system",
]);

const BUILDER_TOOL_NAMES = new Set([
  "get_token", "get_tokens",
  "get_component", "get_component_tokens", "get_component_variants", "get_component_anatomy",
  "get_component_constraints", "get_accessibility_guidance",
  "suggest_token", "validate_component_usage", "validate_color", "diff_against_system", "check_contrast",
]);

const GENERATOR_TOOL_NAMES = new Set([
  "generate_design_system",
]);

function filterTools(nameSet: Set<string>) {
  return OPENROUTER_TOOLS.filter((t) => nameSet.has(t.function.name));
}

// Routing tool used by the Orchestrator agent.
// Extracted as a constant so both the /api/agent-info endpoint and the
// /api/chat routing step reference the same definition.
const DELEGATE_TOOL = {
  type: "function" as const,
  function: {
    name: "delegate_to_agent",
    description: 'Route the conversation to a specialist. agent must be "reader", "builder", or "generator".',
    parameters: {
      type: "object",
      properties: {
        agent: {
          type: "string",
          enum: ["reader", "builder", "generator"],
          description: "The specialist agent to delegate to.",
        },
        reason: { type: "string", description: "One-sentence rationale for the routing decision." },
      },
      required: ["agent", "reason"],
    },
  },
};

// Pre-computed per-agent configs used in both /api/agent-info and the
// /api/chat routing step.
const SPECIALIST_CONFIGS = {
  reader: {
    systemPrompt: READER_SYSTEM_PROMPT,
    tools: filterTools(READER_TOOL_NAMES),
    maxIterations: 5,
  },
  builder: {
    systemPrompt: BUILDER_SYSTEM_PROMPT,
    tools: filterTools(BUILDER_TOOL_NAMES),
    maxIterations: 6,
  },
  generator: {
    systemPrompt: GENERATOR_SYSTEM_PROMPT,
    tools: filterTools(GENERATOR_TOOL_NAMES),
    maxIterations: 3,
  },
} as const;

type SpecialistName = keyof typeof SPECIALIST_CONFIGS;

// ── Agent info endpoint ───────────────────────────────────────────────────
// Returns a machine-readable description of all four Strategy-3 agents:
// Orchestrator, Design System Reader, Component Builder, System Generator.
// Each entry includes the agent's name, role, system prompt, parameters,
// and the exact tool subset it is given.
// Used by the "View Agents" modal in the demo UI.
// ─────────────────────────────────────────────────────────────────────────
app.get("/api/agent-info", (_req, res) => {
  const model = process.env.OPENROUTER_MODEL ?? "openai/gpt-oss-20b:nitro";
  res.json({
    agents: [
      {
        name: "Orchestrator",
        description: "Classifies the user's intent in a single LLM call and routes to the correct specialist agent. Never answers the user directly.",
        model,
        parameters: {
          maxIterations: 1,
          toolChoice: "required",
          endpoint: "POST https://openrouter.ai/api/v1/chat/completions",
        },
        systemPrompt: ORCHESTRATOR_SYSTEM_PROMPT,
        tools: [
          {
            name: DELEGATE_TOOL.function.name,
            description: DELEGATE_TOOL.function.description,
            parameters: DELEGATE_TOOL.function.parameters,
          },
        ],
      },
      {
        name: "Design System Reader",
        description: "Answers questions about tokens, components, themes, icons, layout, and accessibility using read-only MCP tools. Never mutates the design system.",
        model,
        parameters: {
          maxIterations: SPECIALIST_CONFIGS.reader.maxIterations,
          toolChoice: "auto",
          endpoint: "POST https://openrouter.ai/api/v1/chat/completions",
        },
        systemPrompt: SPECIALIST_CONFIGS.reader.systemPrompt,
        tools: SPECIALIST_CONFIGS.reader.tools.map((t) => ({
          name: t.function.name,
          description: t.function.description,
          parameters: t.function.parameters,
        })),
      },
      {
        name: "Component Builder",
        description: "Generates HTML/CSS component code grounded in exact design system tokens. Validates all props and token values before emitting code.",
        model,
        parameters: {
          maxIterations: SPECIALIST_CONFIGS.builder.maxIterations,
          toolChoice: "auto",
          endpoint: "POST https://openrouter.ai/api/v1/chat/completions",
        },
        systemPrompt: SPECIALIST_CONFIGS.builder.systemPrompt,
        tools: SPECIALIST_CONFIGS.builder.tools.map((t) => ({
          name: t.function.name,
          description: t.function.description,
          parameters: t.function.parameters,
        })),
      },
      {
        name: "System Generator",
        description: "Gathers brand requirements through conversation then generates a complete new design system (tokens, components, themes, icons) via AI.",
        model,
        parameters: {
          maxIterations: SPECIALIST_CONFIGS.generator.maxIterations,
          toolChoice: "auto",
          endpoint: "POST https://openrouter.ai/api/v1/chat/completions",
        },
        systemPrompt: SPECIALIST_CONFIGS.generator.systemPrompt,
        tools: SPECIALIST_CONFIGS.generator.tools.map((t) => ({
          name: t.function.name,
          description: t.function.description,
          parameters: t.function.parameters,
        })),
      },
    ],
  });
});

// ── Generate from Website endpoint ────────────────────────────────────────
// Fetches a public website, extracts CSS design tokens, then generates a
// complete design system JSON using the AI generator.
// ─────────────────────────────────────────────────────────────────────────
app.post("/api/generate-from-website", async (req, res) => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    res.status(503).json({
      error: "OpenRouter not configured. Set OPENROUTER_API_KEY environment variable.",
    });
    return;
  }

  const { url, model: requestedModel } = req.body as { url?: string; model?: string };

  if (!url || typeof url !== "string" || !url.trim()) {
    res.status(400).json({ error: "url is required." });
    return;
  }

  try {
    // Validate URL up-front to return a clear 400 before doing any I/O
    validateWebsiteUrl(url.trim());
  } catch (err) {
    res.status(400).json({ error: String(err) });
    return;
  }

  const model = requestedModel ?? process.env.OPENROUTER_MODEL ?? "openai/gpt-oss-20b:nitro";

  try {
    const description = await extractWebsiteDesignContext(url.trim());
    const result      = await generateDesignSystem(description, apiKey, model);

    // Auto-load each section into the live data store
    const VALID_TYPES: DataType[] = ["tokens", "components", "themes", "icons"];
    for (const section of VALID_TYPES) {
      if (result.data[section] !== undefined) {
        setData(section, result.data[section]);
      }
    }

    res.json({
      generatedDesignSystem: result.data,
      warnings: result.warnings,
    });
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: String(err) });
    }
  }
});

// ── Chat endpoint ──────────────────────────────────────────────────────────
// OpenRouter-backed agentic loop. Calls OpenRouter with the conversation and
// all 27 design-system read tools (plus generate_design_system, handled inline);
// results are fed back into the loop until the model returns a final answer.
// ─────────────────────────────────────────────────────────────────────────

/** Parse the LLM's JSON response into {message, preview}.
 *  Falls back to treating the raw text as the message if JSON parsing fails,
 *  so a non-compliant model reply still works rather than blowing up. */
function parseChatResponse(raw: string): { message: string; preview: string | null } {
  const text = raw.trim();
  // Strip a possible ```json ... ``` fence — some models add one despite instructions
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)```\s*$/i);
  const candidate = fenced ? fenced[1].trim() : text;
  try {
    const parsed = JSON.parse(candidate) as { message?: unknown; preview?: unknown };
    const message = typeof parsed.message === "string" ? parsed.message : raw;
    const preview = typeof parsed.preview === "string" && parsed.preview.trim() ? parsed.preview.trim() : null;
    return { message, preview };
  } catch {
    // Graceful fallback: plain text, no preview
    return { message: raw, preview: null };
  }
}

app.post("/api/chat", async (req, res) => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    res.status(503).json({
      error: "OpenRouter not configured. Set OPENROUTER_API_KEY environment variable.",
    });
    return;
  }

  const { messages, model: requestedModel, previousAgent } = req.body as {
    messages: Array<{ role: "user" | "assistant"; content: string }>;
    model?: string;
    /** Agent name from the previous turn, sent by the client to avoid re-routing follow-up messages. */
    previousAgent?: string;
  };

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages array is required and must not be empty." });
    return;
  }

  const model = requestedModel ?? process.env.OPENROUTER_MODEL ?? "openai/gpt-oss-20b:nitro";

  // Stream progress updates to the client via Server-Sent Events so the user
  // sees live feedback ("Thinking…", "Calling get_component…") instead of a
  // silent spinner for the full duration of the agentic loop.
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const sendEvent = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);
  const sendProgress = (message: string) => sendEvent({ type: "progress", message });
  const endWithDone = (payload: object) => { sendEvent({ type: "done", ...payload }); res.end(); };
  const endWithError = (error: string) => { sendEvent({ type: "error", error }); res.end(); };

  // Build the message list for OpenRouter: system + conversation.
  // System prompt and tool set are determined after the Orchestrator routing
  // step below; these are the fallback values used if routing fails.
  type OpenRouterMessage = {
    role: string;
    content: string | null;
    tool_calls?: unknown[];
    tool_call_id?: string;
    name?: string;
  };

  const toolCallsUsed: string[] = [];

  // Abort the whole agentic loop after a generous timeout.  Progress is
  // streamed so the user sees activity; 120 s gives multi-step agentic tasks
  // (including generate_design_system) time to complete.
  // Override with CHAT_TIMEOUT_MS env var for tighter platform limits.
  const CHAT_TIMEOUT_MS = Number(process.env.CHAT_TIMEOUT_MS ?? 120_000);
  const chatAbort = new AbortController();
  const chatTimer = setTimeout(() => chatAbort.abort(), CHAT_TIMEOUT_MS);

  // Collects thinking steps to surface in the UI
  type ThinkingStep =
    | { type: "reasoning"; content: string }
    | { type: "tool_call"; tool: string; args: string };
  const thinkingSteps: ThinkingStep[] = [];

  // ── Step 1: Orchestrator routing ──────────────────────────────────────────
  // Call the Orchestrator with tool_choice:"required" so it must call
  // delegate_to_agent.  Fall back to the unified single-agent mode (with all
  // tools and CHAT_SYSTEM_PROMPT) if the routing call fails for any reason.
  //
  // If the client supplies a valid previousAgent (the agent used on the prior
  // turn), skip the orchestrator entirely — this prevents short follow-up
  // messages (e.g. "yes, go ahead") from being mis-classified as a new topic.
  // ─────────────────────────────────────────────────────────────────────────
  let routedAgent: SpecialistName | "unified" = "unified";
  let systemPrompt = CHAT_SYSTEM_PROMPT;
  type AnyTool = { type: string; function: { name: string; description: string; parameters: unknown } };
  let agentTools: AnyTool[] = OPENROUTER_TOOLS as unknown as AnyTool[];
  let MAX_ITERATIONS = 8;

  // Re-use the previous agent without an orchestrator call when the client
  // signals it is a continuation of the same conversation thread.
  if (previousAgent && previousAgent in SPECIALIST_CONFIGS) {
    const prev = previousAgent as SpecialistName;
    routedAgent     = prev;
    systemPrompt    = SPECIALIST_CONFIGS[prev].systemPrompt;
    agentTools      = SPECIALIST_CONFIGS[prev].tools;
    MAX_ITERATIONS  = SPECIALIST_CONFIGS[prev].maxIterations;
    console.log(`[chat:orchestrator] reusing previousAgent="${prev}" (skip re-route)`);
  } else {
    try {
      sendProgress("Routing request…");
      const orchMessages: OpenRouterMessage[] = [
        { role: "system", content: ORCHESTRATOR_SYSTEM_PROMPT },
        // Only send the latest user message — the orchestrator only needs to
        // classify intent, not re-read the full conversation history.
        // The empty-array guard at the top of this handler ensures messages[0] exists.
        messages.at(-1)!,
      ];
      const orchResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://github.com/designsystem-mcp-demo",
          "X-Title": "Design System MCP Demo",
        },
        body: JSON.stringify({
          model,
          messages: orchMessages,
          tools: [DELEGATE_TOOL],
          tool_choice: "required",
        }),
        signal: chatAbort.signal,
      });
      if (orchResponse.ok) {
        const orchData = await orchResponse.json() as { choices: Array<{ message: { tool_calls?: Array<{ function: { name: string; arguments: string } }> } }> };
        const delegateCall = orchData.choices?.[0]?.message?.tool_calls?.[0];
        if (delegateCall?.function?.name === "delegate_to_agent") {
          let delegateArgs: { agent?: string; reason?: string } = {};
          try {
            delegateArgs = JSON.parse(delegateCall.function.arguments) as { agent?: string; reason?: string };
          } catch (parseErr) {
            console.warn("[chat:orchestrator] failed to parse delegate_to_agent arguments:", String(parseErr), delegateCall.function.arguments);
          }
          const agent = delegateArgs.agent as SpecialistName | undefined;
          if (agent && agent in SPECIALIST_CONFIGS) {
            routedAgent = agent;
            systemPrompt = SPECIALIST_CONFIGS[agent].systemPrompt;
            agentTools = SPECIALIST_CONFIGS[agent].tools;
            MAX_ITERATIONS = SPECIALIST_CONFIGS[agent].maxIterations;
            console.log(`[chat:orchestrator] routed to "${agent}" — ${delegateArgs.reason ?? ""}`);
          }
        }
      } else {
        console.warn(`[chat:orchestrator] non-ok response ${orchResponse.status}, falling back to unified agent`);
      }
    } catch (err) {
      // Routing failure is non-fatal: continue with unified single-agent mode
      console.warn("[chat:orchestrator] routing failed, falling back to unified agent:", String(err));
    }
  }

  // ── Step 2: Specialist (or unified fallback) agentic loop ────────────────
  const loopMessages: OpenRouterMessage[] = [
    { role: "system", content: systemPrompt },
    ...messages,
  ];

  // Holds the generated design system data if generate_design_system is called
  let generatedDesignSystemData: Record<string, unknown> | null = null;

  // Content block shape returned by thinking-capable models (e.g. Claude)
  type ContentBlock =
    | { type: "thinking"; thinking: string }
    | { type: "text"; text: string }
    | { type: string; [key: string]: unknown };

  try {
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      console.log(`[chat] iteration=${i} model=${model} messages=${loopMessages.length}`);

      sendProgress("Thinking…");

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
          tools: agentTools,
          tool_choice: "auto",
        }),
        signal: chatAbort.signal,
      });

      if (!orResponse.ok) {
        const errText = await orResponse.text();
        clearTimeout(chatTimer);
        endWithError(`OpenRouter API error: ${errText}`);
        return;
      }

      const orData = await orResponse.json() as {
        choices: Array<{
          message: {
            role: string;
            content: string | Array<ContentBlock> | null;
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
        clearTimeout(chatTimer);
        endWithError("OpenRouter returned no choices.");
        return;
      }

      const assistantMessage = choice.message;

      // Extract text content and any reasoning blocks when content is an array
      // (thinking-capable models like Claude return an array of content blocks)
      let assistantTextContent: string | null = null;
      if (Array.isArray(assistantMessage.content)) {
        for (const block of assistantMessage.content as ContentBlock[]) {
          if (block.type === "thinking" && block.thinking) {
            thinkingSteps.push({ type: "reasoning", content: block.thinking as string });
          } else if (block.type === "text" && block.text) {
            assistantTextContent = (assistantTextContent ?? "") + block.text;
          }
        }
      } else {
        assistantTextContent = assistantMessage.content;
      }

      // Store the message with normalised string content so the loop continues cleanly
      loopMessages.push({
        ...assistantMessage,
        content: assistantTextContent,
      } as OpenRouterMessage);

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

          // Record as a thinking step so the UI can show it
          thinkingSteps.push({ type: "tool_call", tool: toolName, args: toolCall.function.arguments });

          console.log(`[chat:tool] calling ${toolName}`, JSON.stringify(toolArgs));

          // Notify the client which tool is being executed
          if (toolName === "generate_design_system") {
            sendProgress("Generating design system — this may take a moment…");
          } else {
            sendProgress(`Calling \`${toolName}\`…`);
          }

          let toolResult: string;

          // ── Special handling: generate_design_system ───────────────────
          // Handled here (rather than delegating to runMcpTool) for two reasons:
          // 1. We pass chatAbort.signal so the long-running generation respects
          //    the request timeout and can be aborted by the client.
          // 2. We capture the returned data in generatedDesignSystemData so it
          //    is included in the SSE "done" payload for the UI to display.
          if (toolName === "generate_design_system") {
            try {
              const description = (toolArgs.description as string) ?? "";
              const result = await generateDesignSystem(description, apiKey, model, chatAbort.signal);

              // Auto-load each present section into the data store
              const VALID_TYPES: DataType[] = ["tokens", "components", "themes", "icons"];
              const loadedSections: string[] = [];
              for (const section of VALID_TYPES) {
                if (result.data[section] !== undefined) {
                  setData(section, result.data[section]);
                  loadedSections.push(section);
                }
              }

              generatedDesignSystemData = result.data;

              toolResult = JSON.stringify({
                success: true,
                message:          "Design system generated and loaded successfully.",
                sectionsLoaded:   loadedSections,
                componentCount:   Object.keys((result.data.components ?? {}) as object).length,
                themeCount:       Object.keys((result.data.themes    ?? {}) as object).length,
                iconCount:        Object.keys((result.data.icons     ?? {}) as object).length,
                warnings:         result.warnings,
              });
            } catch (genErr) {
              clearTimeout(chatTimer);
              endWithError(`Design system generation failed: ${String(genErr)}`);
              return;
            }
          } else {
            // ── Standard tool execution ────────────────────────────────
            try {
              toolResult = await runMcpTool(toolName, toolArgs);
            } catch (toolErr) {
              toolResult = JSON.stringify({ error: String(toolErr) });
            }
          }

          loopMessages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            name: toolName,
            content: toolResult,
          });
          console.log(`[chat:tool] result for ${toolName}:`, toolResult.slice(0, 500));
        }
        // Continue loop to let the model process tool results
        continue;
      }

      // No tool calls — return the final answer
      const rawResponse = assistantTextContent ?? "";
      const { message, preview } = parseChatResponse(rawResponse);
      console.log("[chat:response]", message.slice(0, 300));
      clearTimeout(chatTimer);
      endWithDone({ message, preview, model, routedAgent, toolCallsUsed, thinkingSteps, generatedDesignSystem: generatedDesignSystemData });
      return;
    }

    // Reached max iterations without a final text response — return whatever is in the last assistant message
    const lastAssistant = [...loopMessages].reverse().find((m: OpenRouterMessage) => m.role === "assistant" && m.content);
    const rawLast = String(lastAssistant?.content ?? "");
    const { message: lastMessage, preview: lastPreview } = parseChatResponse(rawLast);
    clearTimeout(chatTimer);
    endWithDone({ message: lastMessage, preview: lastPreview, model, routedAgent, toolCallsUsed, thinkingSteps, generatedDesignSystem: generatedDesignSystemData });
  } catch (err) {
    clearTimeout(chatTimer);
    console.error("Chat error:", err);
    const isTimeout = (err as { name?: string }).name === "AbortError";
    endWithError(
      isTimeout
        ? "The AI took too long to respond. Please try a simpler question or try again."
        : "Internal server error during chat.",
    );
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
    console.log(`  Tools         : 27`);
    console.log(`  Resources     : 14 URIs + 4 templates`);
    console.log(`  Prompts       : 10\n`);
  });
}

// Exported for Vercel's serverless runtime and for testing.
export default app;
