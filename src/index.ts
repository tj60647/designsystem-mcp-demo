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
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer } from "./mcp-server.js";

const app = express();

// Parse incoming JSON bodies — required for MCP's JSON-RPC message format.
app.use(express.json());

// ── Health check ──────────────────────────────────────────────────────────
// A simple GET / so Heroku, Vercel, and uptime monitors can confirm the
// server is alive without sending a full MCP request.
// ─────────────────────────────────────────────────────────────────────────
app.get("/", (_req, res) => {
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
    ],
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
