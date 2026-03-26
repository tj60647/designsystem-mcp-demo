/**
 * Design System MCP — Express HTTP Server
 * Author: Thomas J McLeish
 * License: MIT
 *
 * Bootstrap entry point.  Sets up Express, mounts route modules, and starts
 * the server.  All route logic lives in src/routes/:
 *
 *   routes/mcp.ts      — POST /mcp  (MCP JSON-RPC endpoint for AI clients)
 *   routes/data.ts     — /api/data*, /api/schema*, /api/validate
 *   routes/agent.ts    — /api/agent-info, /prompt-templates
 *   routes/generate.ts — /api/generate-from-website
 *   routes/chat.ts     — /api/chat  (OpenRouter agentic loop)
 *
 * All agent constants (tool definitions, system prompts, SPECIALIST_CONFIGS)
 * live in src/agentConfig.ts and are imported by the relevant route files.
 */

import "dotenv/config";
import express from "express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import mcpRouter      from "./routes/mcp.js";
import dataRouter     from "./routes/data.js";
import agentRouter    from "./routes/agent.js";
import generateRouter from "./routes/generate.js";
import chatRouter     from "./routes/chat.js";

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

// ── Route mounts ──────────────────────────────────────────────────────────
app.use(mcpRouter);           // POST /mcp
app.use("/api", dataRouter);  // /api/data*, /api/schema*, /api/validate
app.use(agentRouter);         // /api/agent-info, /prompt-templates
app.use("/api", generateRouter); // /api/generate-from-website
app.use("/api", chatRouter);  // /api/chat

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
