# Design System MCP — Tutorial

> A queryable context layer that makes design systems machine-readable, enforceable, and usable by AI.

**[→ Try the live demo](https://designsystem-mcp-demo.vercel.app/demo)**

---

## Table of Contents

1. [What is a Design System MCP?](#1-what-is-a-design-system-mcp)
2. [Why this matters](#2-why-this-matters)
3. [Core concepts](#3-core-concepts)
4. [How it works end-to-end](#4-how-it-works-end-to-end)
5. [The 27 MCP tools — and when to use them](#5-the-27-mcp-tools--and-when-to-use-them)
6. [Using the demo](#6-using-the-demo)
7. [Connecting an AI client](#7-connecting-an-ai-client)
8. [Key design considerations](#8-key-design-considerations)
9. [Running it yourself](#9-running-it-yourself)
10. [Deployment options](#10-deployment-options)
11. [Project structure](#11-project-structure)

---

## Introduction

This demo consists of two parts that work together: a **Design System MCP server** and a **web application** that consumes it.

The **Design System MCP** is a self-contained server that exposes a design system — its tokens, components, themes, and icons — as a set of queryable tools over the [Model Context Protocol](https://modelcontextprotocol.io). Because MCP is an open standard, the server is not coupled to this demo's web app. Any MCP-compatible client (Claude Desktop, Cursor, a custom agent, or any other application) can connect to it and query the design system directly.

The **web application** demonstrates what becomes possible when an AI assistant has live, structured access to a design system. It provides a split-panel interface with a chat pane on the left and a live preview pane on the right, and exposes three distinct capabilities:

1. **Build design-system-compliant UI via chat.** A Builder agent uses the MCP to look up component specs, token values, constraints, and accessibility rules at query time, then generates HTML with inline styles grounded in actual token values — never hard-coded colours or arbitrary spacing.

2. **Dialog about the design system.** A Reader agent can answer natural-language questions about the design system the MCP represents: which tokens exist, what variants a component supports, how to achieve WCAG AA contrast, what changed between versions, and more.

3. **Build new design systems via chat or a reference website.** A Generator agent guides you through a short conversational exchange to gather brand intent, then produces a complete `design-system.json` that conforms to the schema the MCP expects. Alternatively, the **Generate from Website** feature extracts visual context from any public URL — using computed CSS, custom properties, external stylesheets, and framework detection — and uses AI to generate a conforming design system automatically.

---

## 1. What is a Design System MCP?

The [Model Context Protocol (MCP)](https://modelcontextprotocol.io) is an open standard that lets AI systems call external **tools** — structured functions that return real data on demand. Think of it as a USB standard for giving AI access to the systems your organisation already has.

A **Design System MCP** applies this idea to a design system. Instead of pasting documentation into a prompt, you expose your design system as a set of queryable tools. An AI assistant can then:

- Look up the exact token for "error text color"
- Fetch every constraint on a Button component
- Validate whether a proposed component configuration is allowed
- Detect CSS values that don't match any token in the system

The result is AI-generated UI that is **grounded in your actual design system** — not hallucinated, not outdated, and not inconsistent.

---

## 2. Why this matters

### The problem with static documentation

Most design systems live in Storybook, Notion, Figma, or a documentation site. These are built for humans. When an AI reads them:

- The AI works from a snapshot — it can't query live, up-to-date values
- There is no machine-enforceable contract — the AI guesses at the right token name
- Validation only happens after the fact, in code review

This means AI-generated UI drifts from the design system over time, and there is no automated feedback loop to catch it.

### What changes with MCP

| Without MCP | With MCP |
|---|---|
| AI reads static docs pasted into a prompt | AI fetches structured data at query time |
| Token names are guessed or hallucinated | Token names come directly from the source of truth |
| Component constraints exist only as prose | Constraints are machine-readable and enforceable |
| Validation happens in code review | Validation happens before code is written |
| Design system changes require re-prompting | AI always queries the current state of the system |

---

## 3. Core concepts

### Design tokens

A **token** is a named design decision — a single source of truth for a value like a color, font size, or spacing step. Tokens have a structured path (e.g. `color.semantic.error`, `spacing.4`, `typography.body.size`) and a value.

This MCP exposes tokens across these categories:

| Category | Examples |
|---|---|
| Color | `color.primary.600`, `color.semantic.error`, `color.neutral.100` |
| Typography | `typography.body.size`, `typography.heading.weight`, `typography.mono.family` |
| Spacing | `spacing.1` through `spacing.16` (4px steps) |
| Border radius | `radius.sm`, `radius.md`, `radius.full` |
| Shadow | `shadow.sm`, `shadow.md`, `shadow.lg` |
| Motion | `motion.duration.fast`, `motion.easing.standard` |
| Layout | `layout.grid.columns`, `layout.breakpoint.md`, `layout.zIndex.modal` |

### Components

A **component** is a reusable UI element with a defined spec: allowed variants, sizes, props, token dependencies, constraints, anatomy, and accessibility requirements. This MCP includes 11 components: Button, Input, Card, Badge, Modal, Select, Checkbox, Toast, Navigation, Table, Form.

### Themes

A **theme** is a named set of semantic token overrides — for example, dark mode swaps `color.semantic.background` from `#ffffff` to `#0d1117` without changing the token name itself. The MCP exposes both light and dark themes via `themes.json`.

### The MCP server

The MCP server is a stateless HTTP endpoint (`POST /mcp`) that accepts JSON-RPC tool calls and returns structured JSON. It works with any MCP-compatible AI client — Claude Desktop, GitHub Copilot, custom agents — and with the demo chatbot UI included in this repository.

---

## 4. How it works end-to-end

```
┌─────────────┐    natural language    ┌──────────────┐
│   User      │ ───────────────────▶  │  LLM (AI)    │
│             │                        │              │
│             │ ◀─── grounded response │              │
└─────────────┘                        └──────┬───────┘
                                              │  tool calls (JSON-RPC)
                                              ▼
                                       ┌──────────────┐
                                       │  MCP Server  │
                                       │  POST /mcp   │
                                       └──────┬───────┘
                                              │  reads
                                              ▼
                                       ┌──────────────┐
                                       │ Design System│
                                       │ tokens.json  │
                                       │ components.json│
                                       │ themes.json  │
                                       └──────────────┘
```

**Step by step:**

1. **User describes a UI** — e.g. "Create a login form with email, password, and a primary submit button"
2. **The LLM recognises it needs design system context** and calls MCP tools automatically (e.g. `get_component("input")`, `get_component("button")`, `get_tokens("spacing")`)
3. **The MCP server returns structured data** — correct tokens, approved variants, constraints, and accessibility rules
4. **The LLM generates a grounded response** — JSX, HTML, or a component spec that uses the actual token names and variant values, not guesses
5. **The preview panel renders the result** — a live component preview or token swatch grid built from the MCP response

The key distinction: the AI's output is anchored to the real design system definition fetched at query time.

---

## 5. The 27 MCP tools — and when to use them

AI clients call these tools via `POST /mcp` using the JSON-RPC protocol.

### Token tools

| Tool | When to use |
|---|---|
| `list_token_categories` | Get a top-level map of the design system — useful as a first call to orient the AI |
| `get_tokens` | Fetch all tokens in a category (e.g. `"color"`, `"spacing"`) |
| `get_token` | Look up one specific token by path (e.g. `color.primary.600`) |
| `suggest_token` | Describe an intent in plain language (e.g. `"error text color"`) and get the best matching token |
| `validate_color` | Check whether a hex or RGB value matches a named token |
| `diff_against_system` | Compare CSS property values against the token set — flags non-token values |
| `get_spacing_scale` | Get the structured spacing scale with semantic usage hints |

### Component tools

| Tool | When to use |
|---|---|
| `list_components` | Get names, descriptions, variants, and sizes for every component |
| `get_component` | Full spec for one component — props, tokens, constraints, accessibility |
| `get_component_tokens` | Every token a component depends on |
| `get_component_constraints` | Usage rules, do's and don'ts, required props |
| `validate_component_usage` | Check whether a variant/size/props combo is valid |
| `get_component_variants` | Variant list with when-to-use guidance |
| `get_component_anatomy` | Internal slots, valid children, composition patterns |
| `get_component_relationships` | Parent, sibling, and related components |

### Theme & icon tools

| Tool | When to use |
|---|---|
| `list_themes` | List all available themes |
| `get_theme` | Full theme definition with semantic token overrides |
| `list_icons` | List icons, optionally filtered by category or tag |
| `get_icon` | Single icon by name with metadata and usage guidance |
| `search_icons` | Semantic search across the icon set |

### Accessibility & layout tools

| Tool | When to use |
|---|---|
| `check_contrast` | WCAG 2.1 AA/AAA contrast ratio checker |
| `get_accessibility_guidance` | Per-component ARIA, keyboard, focus-order spec |
| `get_layout_guidance` | Page gutters, max-widths, breakpoints, region spacing |

### History & search tools

| Tool | When to use |
|---|---|
| `get_changelog` | Version history filterable by version range |
| `get_deprecations` | Deprecations with migration paths and removal timelines |
| `get_style_guide` | Design principles, color usage rules, typography guidance, and composition patterns |
| `search` | Full-text search across all tokens, components, and icons |
| `get_schema` | JSON Schema for a data file — use before loading custom JSON |

---

## 6. Using the demo

The demo UI is a **split-panel interface** — chat on the left, preview and component explorer on the right.

```
┌─────────────────────────────┬──────────────────────────────┐
│  Chat                       │  [Live Preview] [Explorer]   │
│                             │                              │
│  User: "Create a login      │  ┌─────────────────────────┐ │
│  form with email, password, │  │  [Email input]          │ │
│  and a primary submit       │  │  [Password input]       │ │
│  button"                    │  │  [Submit button]        │ │
│                             │  └─────────────────────────┘ │
│  AI: Here's a login form    │  MCP tools used:            │
│  using the design system…   │  · get_component(button)    │
│                             │  · get_tokens(spacing)      │
└─────────────────────────────┴──────────────────────────────┘
```

### Component Explorer tab

Switch to the **Component Explorer** tab in the right column to browse all loaded components as a card gallery. Each card shows the component name, description, and its variant and size chips. Clicking a card opens a detail drawer with five tabs:

- **Overview** — description, variants, sizes, states, constraints, and variant guidance
- **Props** — full props table with types, defaults, and descriptions
- **Anatomy** — root element, named slots, valid children, composition notes
- **Tokens** — all design token references used by the component
- **Accessibility** — ARIA roles, keyboard support, and focus management rules

The Explorer reflects the live data — if you load a custom `components.json` via **Load JSON**, the Explorer updates immediately.

### Prompt ideas to try

| Prompt | What the AI does |
|---|---|
| "Create a login form with email, password, and a primary submit button" | Calls `get_component` for input and button, fetches spacing tokens, returns grounded HTML |
| "What primary color tokens are available?" | Calls `get_tokens("color")` and presents the palette with values |
| "Show me all button variants and their token usage" | Calls `get_component("button")` and `get_component_tokens("button")` |
| "What token overrides are needed for dark mode?" | Calls `get_theme("dark")` and explains semantic token swaps |
| "Create an accessible input with error state and helper text" | Calls `get_component("input")` and `get_accessibility_guidance("input")` |
| "Is `background-color: #2f81f7` a valid design token?" | Calls `validate_color` — maps the hex to `color.primary.600` if it matches |
| "Do primary and neutral/0 pass WCAG AA contrast?" | Calls `check_contrast` with the two color tokens |

### Loading a sample design system

The repository ships with a sample `design-system.json` at `public/sample-design-system.json`. This is a full-featured "Verdigris" design system (green palette, Plus Jakarta Sans typography, 3 themes, 6 components, 17 icons) that you can load via the **Load JSON** button to test the full workflow with a fresh data set.

### Generate from Website

The **Generate from Website** button lets you point the demo at any public URL and automatically produce a full design system JSON inspired by that site's visual language.

**How it works:**

The extractor runs multiple strategies in order of richness, combining all available signals into a single AI prompt:

| Strategy | What is captured | Works on |
|---|---|---|
| **Headless browser (Playwright)** | Computed CSS values after JS runs — colors, fonts, border-radius, CSS custom properties | CSS-in-JS, Tailwind JIT, SPAs, Next.js |
| **CSS custom properties** | `--token-name: value` declared on `:root` | Any site that publishes a token layer |
| **External stylesheets** | Up to 5 linked `.css` files parsed for colors, fonts, spacing | Traditional CSS, SCSS, Bootstrap |
| **`<meta name="theme-color">`** | Browser tab / PWA brand color | Most modern web apps |
| **Web App Manifest** | `theme_color` and `background_color` from `manifest.json` | PWAs |
| **CSS framework detection** | Infers Tailwind, Bootstrap, Material, Chakra, Ant Design from class patterns | Class-heavy frameworks |
| **Brand context** | Page title, `og:site_name`, meta description | All sites |
| **Sparse-CSS fallback** | When signals are few, instructs the AI to infer from brand name and URL | JS-heavy SPAs |

After extraction the signals are assembled into a context prompt and sent to the AI, which generates a complete `tokens + components + themes + icons` JSON in one pass (with up to 3 self-correcting retry attempts). If the AI still can't produce all four sections, a partial-fill fallback inserts minimal stubs and surfaces warnings rather than returning an error.

**Local setup for Playwright extraction:**

```bash
# Playwright is already in package.json — just install the browser
npx playwright install chromium
```

On platforms where Chromium is unavailable (Vercel serverless), the server automatically falls back to the fetch-based pipeline.

### Requirements

- An [OpenRouter API key](https://openrouter.ai/keys) must be set as `OPENROUTER_API_KEY` in your environment (or Vercel project settings)
- The demo uses `google/gemini-flash-1.5:free` via OpenRouter by default (free tier, no credits needed), but any model with tool-calling support works — set `OPENROUTER_MODEL` to override

---

## 7. Connecting an AI client

Any MCP-compatible client can connect to this server's `POST /mcp` endpoint using the StreamableHTTP transport.

### Claude Desktop

Add this to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or the equivalent path on your OS:

```json
{
  "mcpServers": {
    "design-system": {
      "url": "https://your-deployment-url.vercel.app/mcp"
    }
  }
}
```

Once connected, Claude will automatically call design system tools when you ask it to build UI, reference tokens, or validate component usage.

### Local development

```json
{
  "mcpServers": {
    "design-system": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

### Other MCP clients

The server uses the standard StreamableHTTP transport. Any client that implements [MCP's HTTP transport spec](https://modelcontextprotocol.io/docs/concepts/transports) — including custom agents built with the MCP SDK — will work without modification.

---

## 8. Key design considerations

These are the decisions that matter most when building a Design System MCP for a real product.

### What to expose vs. what to keep internal

Not everything in a design system needs to be a tool. Consider exposing:

- **Semantic tokens** — the layer AI should use when generating UI (e.g. `color.semantic.action` rather than `color.primary.600`)
- **Component specs** — variants, sizes, required props, constraints
- **Validation rules** — what combinations are allowed or forbidden

Keep internal (or out of scope for MCP):
- Raw primitive tokens that components should never use directly
- Implementation details like CSS custom property names
- Internal tooling or admin-only configuration

### Semantic tokens vs. primitive tokens

AI tools should reference **semantic tokens** (e.g. `color.semantic.error`) rather than primitives (e.g. `color.red.500`). Semantic tokens carry intent — they describe what something *is* rather than what it *looks like*. This makes AI output resilient to theme changes and rebrandings.

Design your token structure so semantic tokens are the public API of the design system. Primitives are implementation details.

### Stateless MCP server with shared data store

The MCP server is **stateless** — every request creates a fresh McpServer instance, handles the call, and tears down. This is the right choice for serverless deployments (Vercel, Netlify) and most demo use cases.

However, all four data files (`tokens`, `components`, `themes`, `icons`) are held in a **shared in-memory data store** (`dataStore.ts`) that lives for the lifetime of the Node.js process. This means:

- MCP tool calls always reflect the most recently loaded data — if you call `POST /api/data` to replace `components.json`, the next MCP request sees the new data.
- On Vercel (serverless), each function invocation gets its own process, so loaded data does not persist across cold starts. Use the bundled defaults or a persistent store for production.
- On Heroku, Railway, or local Node.js the process stays alive and loaded data persists until the process restarts or `POST /api/data/reset` is called.

### Keeping the MCP data in sync with the source of truth

The biggest operational challenge for a production Design System MCP is keeping tool data current. Options, in order of automation:

1. **Manual**: Update `tokens.json` and `components.json` by hand when the design system changes — fine for demos, unsustainable at scale
2. **CI pipeline**: Run `scripts/generate-tokens.mjs` as part of a GitHub Actions workflow that fires on changes to the Figma file or token repo — good for most teams
3. **Webhook-driven**: Figma can send a webhook on file change; the MCP server receives it and rebuilds the token data — requires an always-on server
4. **Live API proxy**: Skip static JSON entirely; the MCP server queries the Figma Variables API (or Style Dictionary) on every tool call — maximum freshness, higher latency

### Tool granularity

Tools that are too broad make the AI do unnecessary work. Tools that are too narrow require too many round trips. A good starting point:

- One tool per *type of query* (list, get one, validate, suggest, search)
- Separate tools for tokens and components (they have different shapes and query patterns)
- A `search` tool as a fallback when the AI doesn't know the exact path

### Rate limits and latency

MCP tool calls happen in the middle of a user-facing conversation. Keep tool responses fast:

- Load JSON data once at server startup, not on every request
- Avoid calling external APIs (Figma, etc.) inside a tool call unless you cache aggressively
- Aim for < 100ms per tool call — the `/api/chat` agentic loop typically makes 2–4 tool calls per user message

### Security

- The MCP endpoint is **read-only** — all tools return data, none modify anything. This is the correct default for a design system context layer.
- If you add write tools (e.g. to update tokens from AI suggestions), add authentication. The current server has no auth — appropriate for a public demo, not for production write access.
- Do not put secrets (API keys, internal token values) into the MCP tool responses. Token *names* and design *values* (hex colors, spacing numbers) are safe to expose; authentication credentials and internal infrastructure details are not.

### Accessibility and constraints as first-class data

One of the highest-value things a Design System MCP can do is encode **accessibility requirements** as machine-readable constraints. Instead of prose in a doc ("always provide an aria-label on icon-only buttons"), the component spec makes it a structured rule the AI can read and enforce:

```json
{
  "constraint": "icon-only buttons require aria-label",
  "required": true,
  "enforceable": true
}
```

This turns the design system from a reference document into an active guardrail.

---

## 9. Running it yourself

### Prerequisites

- Node.js ≥ 20
- npm
- An [OpenRouter API key](https://openrouter.ai/keys) (for the chatbot demo)

### Install & run locally

```bash
npm install
cp .env.example .env
# Edit .env and set OPENROUTER_API_KEY=sk-or-...
npm run dev
```

The server starts at `http://localhost:3000` and opens the demo UI automatically.

### Endpoints

| Endpoint | Description |
|---|---|
| `GET /` | Redirects to `/demo` |
| `GET /demo` | Split-panel demo UI (Chat + Live Preview + Component Explorer) |
| `GET /health` | JSON health check — server info, tools, resources, and prompts |
| `POST /mcp` | MCP JSON-RPC endpoint for AI clients |
| `POST /api/chat` | OpenRouter-backed agentic chat endpoint |
| `GET /api/data/:type` | Read active data for a type (`tokens`, `components`, `themes`, `icons`) |
| `POST /api/data` | Load custom JSON for a data type |
| `POST /api/data/reset` | Reset all (or one) data type back to bundled defaults |
| `GET /api/schema/:type` | Download the JSON Schema for a data type |
| `POST /api/validate` | Validate custom JSON against a schema without loading it |
| `POST /api/generate-from-website` | Scrape a public URL and generate a complete design system with AI |
| `GET /prompt-templates` | _(Deprecated v0.3.0)_ Pre-built prompt templates — use MCP Prompts instead |

### Loading custom data at runtime

The MCP server keeps the four data files in memory. You can replace any of them at runtime so that all subsequent tool calls reflect the new data. This is the mechanism the demo UI's **Load JSON** button uses.

```bash
# Replace the components data with your own
curl -X POST http://localhost:3000/api/data \
  -H "Content-Type: application/json" \
  -d '{ "type": "components", "data": { "button": { "name": "Button", "description": "…" } } }'

# Reset everything back to the bundled defaults
curl -X POST http://localhost:3000/api/data/reset \
  -H "Content-Type: application/json" \
  -d '{}'

# Reset only tokens
curl -X POST http://localhost:3000/api/data/reset \
  -H "Content-Type: application/json" \
  -d '{ "type": "tokens" }'
```

Before loading custom JSON, call the `get_schema` MCP tool to see the expected structure:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": { "name": "get_schema", "arguments": { "dataType": "components" } }
}
```

### Build for production

```bash
npm run build
npm start
```

---

## 10. Deployment options

The MCP server is a standard Node.js HTTP process. Choose the platform that fits your workflow.

| Platform | Best for | Cost | Config | Playwright? |
|---|---|---|---|---|
| **Vercel** | Serverless, zero-ops (**recommended**) | Generous free tier | ✅ `vercel.json` included | ❌ Falls back to fetch |
| **Heroku** | Simple, long-running server | ~$5/mo Eco dyno | ✅ `Procfile` included | ✅ Add buildpack |
| **Railway** | Heroku-like, modern DX | ~$5/mo | Auto-detected | ✅ Auto-detected |
| **Render** | Free tier available | Free (sleeps after inactivity) | Auto-detected | ✅ Auto-detected |
| **Fly.io** | Persistent, global edge | Free allowance | `fly launch` auto-configures | ✅ Add Chromium layer |
| **Local + ngrok** | Quick AI client demos | Free | `npm run dev` | ✅ Already installed |

> **Playwright note**: The headless browser extractor runs automatically when the `playwright` package is installed and `npx playwright install chromium` has been run. On platforms where it is unavailable (Vercel serverless), the server falls back to the fetch-based CSS pipeline transparently — no configuration needed.

### Vercel (recommended)

```bash
npm install -g vercel
vercel
```

Set `OPENROUTER_API_KEY` in Vercel project settings → Environment Variables.

> Vercel sets `VERCEL=1` automatically, which causes the server to skip `app.listen()` and export the Express app as a serverless function instead. Static files in `public/` are served by Vercel's CDN.

### Heroku

```bash
heroku create your-app-name
git push heroku main
heroku open
```

`PORT` is set automatically by Heroku.

### Local + ngrok (for AI client testing)

```bash
# Terminal 1
npm run dev

# Terminal 2
npx ngrok http 3000
```

Use the ngrok HTTPS URL as the MCP server URL in your AI client config.

---

## 11. Project structure

```
src/
  index.ts               — Express server (routes, MCP endpoint, /api/chat, /api/data)
  mcp-server.ts          — MCP server factory; all 26 tool definitions + resources + prompts + logging
  toolRunner.ts          — Local tool executor for the /api/chat agentic loop
  dataStore.ts           — Shared in-memory data store; getData/setData/resetData
  schemas.ts             — JSON Schema definitions for each data file (tokens/components/themes/icons)
  generator.ts           — AI design system generator (OpenRouter); 3-retry loop with partial-fill fallback
  websiteExtractor.ts    — Multi-strategy website design context extractor (CSS, manifest, Playwright)
  playwrightExtractor.ts — Headless Chromium extractor; captures computed styles after JS runs
  data/
    tokens.json          — Design tokens (color, typography, spacing, borderRadius, shadow, motion, layout)
    components.json      — Component specs (11 components with anatomy, variants, tokens, accessibility)
    themes.json          — Light and dark theme semantic token overrides
    icons.json           — Icon metadata (34 icons, 7 categories)
    changelog.json       — Version history (v0.1.0 → v0.3.0)
    deprecations.json    — Deprecation entries with migration paths

public/
  demo.html                  — Split-panel demo UI (Chat, Live Preview, Component Explorer tabs)
  sample-design-system.json  — "Verdigris" sample design system (green palette, 6 components, 3 themes, 17 icons)

figma-export.json     — Simulated Figma export (upstream data shape reference)
scripts/
  copy-data.mjs       — Post-build: copies src/data/ into dist/data/
  figma-sync.mjs      — Syncs live token data from the Figma Variables API
  generate-tokens.mjs — Transforms figma-export.json → tokens.json
```

---

## License

MIT — Thomas J McLeish
