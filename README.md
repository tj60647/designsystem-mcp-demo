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

## Demo UI Flow

The intended demo experience is a **split-panel chatbot**:

```
┌─────────────────────────────┬──────────────────────────────┐
│  Chat                       │  Preview                     │
│                             │                              │
│  User: "Create a login      │  ┌─────────────────────────┐ │
│  form with email, password, │  │  [Email input]          │ │
│  and a primary submit       │  │  [Password input]       │ │
│  button"                    │  │  [Submit button]        │ │
│                             │  └─────────────────────────┘ │
│  AI: Here's a login form    │  Token refs used:            │
│  using the design system…   │  · color.semantic.action…   │
│                             │  · spacing.4 / spacing.16   │
└─────────────────────────────┴──────────────────────────────┘
```

**How it works — step by step:**

1. **User describes a UI** in natural language in the chat panel
2. **The LLM processes the message** and recognizes it needs design system context — it calls MCP tools automatically (e.g. `get_component("input")`, `get_component("button")`, `get_tokens("spacing")`)
3. **The MCP server returns structured data** — correct tokens, approved variants, constraints, and accessibility rules for each component
4. **The LLM generates a grounded response** — component specs, JSX/HTML, or a structured component tree that uses the actual token names and variant values from the design system, not guesses
5. **The preview panel renders the result** — a live component preview, a token swatch grid, or a visual spec card built from the structured MCP response

The key distinction from a plain LLM chat: the AI's output is anchored to the real design system definition fetched at query time, so colors, spacing, typography, and constraints are always correct.

> This demo ships only the MCP server (step 3). The chatbot UI (steps 1–2, 5) is the next layer to build — see [Phase 5 in the roadmap](#roadmap).

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

### Connect an AI client

To connect Claude Desktop (or any MCP-compatible client), point it at your deployed server URL using the StreamableHTTP transport.

Example `claude_desktop_config.json` entry (local dev):

```json
{
  "mcpServers": {
    "design-system": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

Replace the URL with your deployed server address when running in production.

---

## Deployment

The MCP server is a standard Node.js HTTP process. It runs equally well as a long-running server or a serverless function. Choose the option that fits your workflow.

### Recommended options

| Platform | Best for | Cost | Config included |
|---|---|---|---|
| **Heroku** | Simple, long-running server | Free tier removed; ~$5/mo Eco dyno | ✅ `Procfile` |
| **Vercel** | Serverless, zero-ops | Generous free tier | ✅ `vercel.json` |
| **Railway** | Heroku-like, modern DX | ~$5/mo | Manual (see below) |
| **Render** | Free tier with spin-down | Free (spins down after inactivity) | Manual (see below) |
| **Fly.io** | Persistent, global edge | Free allowance | Manual (see below) |
| **Local / ngrok** | Quick demos, AI client testing | Free | ✅ `npm run dev` |

---

### Heroku

A `Procfile` is included (`web: node dist/index.js`).

```bash
# Install the Heroku CLI, then:
heroku create your-app-name
git push heroku main
heroku open
```

The `PORT` environment variable is set automatically by Heroku. No additional config is needed.

> **Note:** Heroku removed its free tier in 2022. The Eco dyno plan starts at ~$5/month. The server will sleep after 30 minutes of inactivity on Eco — upgrade to Basic ($7/mo) for always-on behavior.

---

### Vercel

`vercel.json` is pre-configured for serverless deployment.

```bash
npm install -g vercel
vercel
```

The server runs in stateless mode (one fresh instance per request), which is correct for Vercel's function model. `VERCEL=1` is set automatically by the platform, which skips the `app.listen()` call and exports the Express app instead.

> **Note:** Vercel serverless functions have a maximum execution timeout (default 10s on Hobby, 60s on Pro). This is plenty for MCP tool calls, which return in milliseconds.

---

### Railway

Railway auto-detects Node.js projects and builds from source.

1. Push your repo to GitHub
2. Create a new Railway project → **Deploy from GitHub repo**
3. Railway runs `npm run build` and `npm start` automatically
4. Set `PORT` to `3000` in Railway's environment variables (or leave it unset — Railway injects `PORT` automatically)

No additional config files are needed.

---

### Render

1. Create a new **Web Service** in the Render dashboard
2. Connect your GitHub repo
3. Set **Build Command**: `npm run build`
4. Set **Start Command**: `npm start`
5. Choose the **Free** instance type (note: free instances spin down after 15 minutes of inactivity — first request after sleep takes ~30s to wake)

For a demo server that should stay responsive, use the Starter plan ($7/mo).

---

### Fly.io

```bash
# Install flyctl, then:
fly launch          # auto-detects Node, generates fly.toml
fly deploy
```

Fly runs the app as a persistent VM. The free allowance covers one small VM. Set `PORT` to `8080` (Fly's default internal port) or configure `fly.toml` to match port `3000`.

---

### Local + ngrok (quick AI client demo)

If you want to test with Claude Desktop or another local AI client without deploying:

```bash
# Terminal 1 — start the MCP server
npm run dev

# Terminal 2 — expose it publicly
npx ngrok http 3000
```

Use the ngrok HTTPS URL (e.g. `https://abc123.ngrok.io/mcp`) as the MCP server URL in your AI client config. Useful for demos and testing before committing to a deployment platform.

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

### Phase 5 — Demo UI and AI workflow integration
- [ ] Split-panel chatbot demo UI (chat + live component preview panel)
- [ ] Structured component renderer — turn MCP responses into rendered HTML/React previews
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
