# Design System MCP — Demo

> A queryable context layer that makes design systems machine-readable, enforceable, and usable by AI.

This repository is a **minimum viable demo** of the Design System MCP concept. It provides a live HTTP server that exposes design system data — tokens, components, and their constraints — as structured, queryable tools that AI systems (Claude, Copilot, etc.) can call via the [Model Context Protocol (MCP)](https://modelcontextprotocol.io).

---

## What is a Design System MCP?

Modern design systems are largely built for human consumption: documentation sites, component libraries, and design files communicate intent but do not function as a unified, machine-readable source of truth.

A **Design System MCP** reframes the design system as a live context layer — one that AI tools can query, interpret, and enforce in real time. Instead of static documentation, the design system becomes an active interface that provides structured knowledge about tokens, components, and usage constraints.

This enables AI-assisted tools to generate, evaluate, and transform UI in ways that are consistently aligned with a system's rules and semantics.

---

## MVP Scope

This demo implements the minimal foundation required to validate the concept end-to-end:

| Layer | What's included |
|---|---|
| **Token data** | Colors, typography, spacing, border radius, shadows — loaded from `tokens.json` |
| **Component data** | Button, Input, Card, Badge — loaded from `components.json` |
| **MCP tools** | 8 queryable tools AI clients can call (see below) |
| **HTTP transport** | Stateless Express server with a `POST /mcp` endpoint |
| **Figma-style source** | `figma-export.json` — a simulated design tool export showing the upstream data shape |

The data files (`tokens.json`, `components.json`) represent what a real pipeline would produce from a design tool like Figma via Style Dictionary. The `figma-export.json` file simulates what that raw upstream export looks like before transformation.

---

## Available MCP Tools

AI clients call these tools via `POST /mcp` using the JSON-RPC protocol.

| Tool | Description |
|---|---|
| `list_token_categories` | List all top-level token categories (color, typography, spacing…) |
| `get_tokens` | Get the full token tree for a category, or all tokens |
| `get_token` | Look up a single token by dot-path (e.g. `color.primary.600`) |
| `list_components` | List all components with names, descriptions, variants, and sizes |
| `get_component` | Get the full spec for one component (props, tokens, constraints, accessibility) |
| `get_component_tokens` | Get all token references a component depends on |
| `validate_color` | Check whether a hex/rgb value matches a named design token |
| `get_component_constraints` | Get usage rules and constraints for a component |

---

## Getting Started

### Prerequisites

- Node.js ≥ 20
- npm

### Install & run locally

```bash
npm install
npm run dev
```

The server starts at `http://localhost:3000`.

- `GET /` — health check, returns server info and available tools
- `POST /mcp` — MCP JSON-RPC endpoint for AI clients

### Build for production

```bash
npm run build
npm start
```

### Deploy

**Heroku** — a `Procfile` is included. Push to a Heroku app and the server starts automatically.

**Vercel** — `vercel.json` is configured for serverless deployment. The server runs in stateless mode, which is compatible with Vercel's function execution model.

### Connect an AI client

To connect Claude Desktop (or any MCP-compatible client), point it at `http://localhost:3000/mcp` using the StreamableHTTP transport.

Example MCP client config entry:

```json
{
  "mcpServers": {
    "design-system": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

---

## Project Structure

```
src/
  index.ts          — Express HTTP server (health check + MCP endpoint)
  mcp-server.ts     — MCP server factory; all tool definitions
  data/
    tokens.json     — Design tokens (color, typography, spacing, etc.)
    components.json — Component specs (props, tokens, constraints, a11y)

figma-export.json   — Simulated Figma/design-tool export (upstream source shape)
scripts/
  copy-data.mjs     — Post-build script: copies data files into dist/
```

---

## Roadmap

### Phase 1 — Foundation ✅ (this demo)
- [x] Stateless MCP HTTP server with Express
- [x] Token data: color, typography, spacing, border radius, shadow
- [x] Component data: Button, Input, Card, Badge
- [x] 8 MCP tools for querying tokens and components
- [x] Heroku and Vercel deployment support
- [x] Simulated Figma export JSON showing the upstream data shape

### Phase 2 — Richer design system coverage
- [ ] Expand component library (Modal, Select, Checkbox, Toast, Navigation, Table, Form)
- [ ] Add layout patterns (page shells, grid system, responsive breakpoints)
- [ ] Add motion/animation tokens
- [ ] Add dark mode / theme variant support
- [ ] Add icon token references and icon metadata

### Phase 3 — Live pipeline integration
- [ ] Connect to a real Figma file via the Figma REST API
- [ ] Automate token extraction using Style Dictionary
- [ ] Webhook or polling to keep the MCP data in sync with design tool changes
- [ ] Support multiple brand themes or product lines

### Phase 4 — Validation and enforcement
- [ ] `validate_component_usage` tool — checks whether a given component config is valid
- [ ] `suggest_token` tool — suggests the correct token for a described intent (e.g. "error text color")
- [ ] `diff_against_system` tool — compares arbitrary CSS/props against system definitions
- [ ] Semantic search over components and tokens using embeddings

### Phase 5 — AI workflow integration
- [ ] GitHub Copilot / VS Code extension integration
- [ ] Prompt templates for common AI-assisted UI generation tasks
- [ ] Audit report generation: scan a codebase and report design system deviations
- [ ] Storybook or component playground integration for live preview

---

## Background and Motivation

See the [project concept document](https://github.com/tj60647/designsystem-mcp-demo) for the full reasoning behind this approach, including the problem it addresses and the long-term vision for design systems as machine-readable infrastructure.

---

## License

MIT — Thomas J McLeish
