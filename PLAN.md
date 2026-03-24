# Design System MCP — Implementation Plan

**Target:** v0.3.0  
**From:** v0.1.0 (13 tools, no Resources/Prompts/Logging/Sampling/Elicitation)  
**To:** v0.3.0 (26 tools + full MCP primitive coverage)

---

## Architecture Notes

### Stateless Per-Request Pattern
The server creates a new `McpServer` instance on each `POST /mcp` request. This is correct and supported by the MCP SDK's `StreamableHTTPServerTransport` — the server is fully stateless from the client's perspective.

**Implications by primitive:**
- **Tools** ✅ — Work correctly in stateless mode. Data is read from `dataStore.ts` on every call.
- **Resources** ✅ — Work correctly. Resources return current data on demand.
- **Prompts** ✅ — Work correctly. Prompts are pure transformations of inputs.
- **Logging** ✅ — Notifications sent during active request/response cycle.
- **Sampling** ⚠️ — Requires the client to support `sampling/createMessage`. Works with streaming transport (SSE) and compatible clients (e.g., Claude Desktop). Falls back silently if unsupported.
- **Elicitation** ⚠️ — Same as sampling; requires client support for `elicitation/create`.
- **Resource Subscriptions** ⚠️ — Push notifications for resource changes require a persistent SSE connection. Not available in pure stateless HTTP mode.

### Shared Data Store
All tool, resource, and prompt handlers read from `src/dataStore.ts` via `getData()`. This means data loaded via `POST /api/data` is immediately reflected in all MCP responses without server restart.

---

## v0.2.0 — Tool Expansion (+13 tools)

### Data Changes
- [x] `src/data/components.json` — Added `anatomy`, `relationships`, and `variantGuidance` fields to all 11 components
- [x] `src/data/changelog.json` — New: version history for v0.1.0, v0.2.0, v0.3.0
- [x] `src/data/deprecations.json` — New: deprecation entries for Overlay component, legacy tokens, and deprecated REST endpoint
- [x] `src/dataStore.ts` — Added `changelog` and `deprecations` data types
- [x] `scripts/copy-data.mjs` — Updated to copy `changelog.json` and `deprecations.json` to `dist/data/`

### New Tools
- [x] `list_themes` — List all available themes
- [x] `get_theme` — Get full theme definition with token overrides
- [x] `list_icons` — List icons, optionally filtered by category or tag
- [x] `get_icon` — Get single icon by name with metadata and usage guidance
- [x] `search_icons` — Semantic search across the icon set
- [x] `check_contrast` — WCAG 2.1 AA/AAA contrast ratio checker
- [x] `get_accessibility_guidance` — Per-component ARIA, keyboard, focus-order spec
- [x] `get_component_variants` — Variant list with when-to-use guidance
- [x] `get_component_anatomy` — Internal slots, valid children, composition patterns
- [x] `get_component_relationships` — Parent, sibling, and related components
- [x] `get_layout_guidance` — Page gutters, max-widths, breakpoints, region spacing
- [x] `get_spacing_scale` — Structured spacing scale with semantic usage hints
- [x] `get_changelog` — Version history filterable by version range
- [x] `get_deprecations` — Deprecations with migration paths and removal timelines

### Updated Tools
- [x] `validate_component_usage` — Now returns `{ rule, suggestion }` objects instead of plain violation strings

---

## v0.3.0 — MCP Primitive Coverage

### Resources (14 URIs + 4 templates)
- [x] `design-system://tokens` — Complete token reference
- [x] `design-system://tokens/{category}` — Tokens by category (template)
- [x] `design-system://components` — Component index
- [x] `design-system://components/{name}/spec` — Component spec (template)
- [x] `design-system://components/{name}/examples` — Component examples (template)
- [x] `design-system://themes` — Theme list
- [x] `design-system://themes/{name}` — Theme definition (template)
- [x] `design-system://icons` — Full icon catalog
- [x] `design-system://guidelines/accessibility` — Accessibility guidelines
- [x] `design-system://guidelines/layout` — Layout guidelines
- [x] `design-system://guidelines/content` — Content guidelines
- [x] `design-system://guidelines/motion` — Motion guidelines
- [x] `design-system://changelog` — Full changelog
- [x] `design-system://changelog/latest` — Latest changelog entry
- [x] `design-system://deprecations` — All deprecations

### Prompts (9)
- [x] `design-system/build-component` — Build a conformant component
- [x] `design-system/compose-layout` — Assemble a page layout
- [x] `design-system/implement-theme` — Apply a theme with token overrides
- [x] `design-system/review-markup` — Review code for system compliance
- [x] `design-system/audit-page` — Comprehensive page audit
- [x] `design-system/migrate-deprecated` — Identify and migrate deprecated patterns
- [x] `design-system/fix-violations` — Fix validation violations
- [x] `design-system/explain-component` — Explain a component for developers/designers/PMs
- [x] `design-system/compare-components` — Compare two similar components
- [x] `design-system/token-rationale` — Explain the reasoning behind a token (bonus: 10th prompt)

### Logging
- [x] `log()` helper in `mcp-server.ts` wrapping `server.server.sendLoggingMessage()`
- [x] `tool.invoked` — info, on every tool call with duration and result_size
- [x] `tool.error` — error, on NOT_FOUND and INVALID_COLOR errors
- [x] `validation.failure` — warning, on `validate_component_usage` violations
- [x] `deprecation.accessed` — warning, when a deprecated entity is returned
- [x] `search.executed` — info, on `search` and `search_icons` calls
- [x] `search.no_results` — warning, when search returns empty results
- [x] `contrast.check` — info, on `check_contrast` calls with ratio and pass/fail
- [x] `resource.accessed` — info, on every resource read

### Deprecation
- [x] `GET /prompt-templates` — Marked deprecated in v0.3.0 with `Deprecation: true` header and successor-version Link header
- [x] Health endpoint (`GET /health`) — Updated to v0.3.0 with full primitive inventory

---

## Server Infrastructure Updates
- [x] `src/mcp-server.ts` — Complete rewrite to v0.3.0 with all 26 tools + resources + prompts + logging
- [x] `src/toolRunner.ts` — Updated to support all 26 tools for the `/api/chat` agentic loop
- [x] `src/index.ts` — Updated `OPENROUTER_TOOLS`, `CHAT_SYSTEM_PROMPT`, health endpoint, startup log, deprecation header on `/prompt-templates`
- [x] `package.json` — Version bumped to `0.3.0`

---

## v0.3.1 — Component Explorer UI

### Demo UI Enhancements
- [x] `GET /api/data/:type` — New REST endpoint serving active data to the browser (used by Component Explorer)
- [x] `public/demo.html` — Added right-column tab bar: **Live Preview** | **Component Explorer**
- [x] Component Explorer grid — card-based gallery of all loaded components with variant and size chips
- [x] Component detail drawer — tabbed detail view (Overview, Props, Anatomy, Tokens, Accessibility)
- [x] Explorer auto-reloads when new JSON is loaded or data is reset
- [x] Filter bar for searching components by name or description
- [x] `public/sample-design-system.json` — New "Verdigris" design system sample using the current schema (tokens + 6 components + 3 themes + 17 icons)
- [x] `src/index.ts` — `GET /demo` endpoint description updated; health endpoint includes new REST endpoint

---

## v0.4.0 — Tasks & Persistent Server (Planned)

### Background Tasks
- [ ] `batch_validate` — Validate multiple components/tokens in a single long-running task
- [ ] `full_audit` — Comprehensive design system audit with accessibility + deprecation + token compliance
- [ ] `large_scale_diff` — Diff two design system snapshots across tokens, components, themes
- [ ] `theme_migration` — Migrate a codebase from one theme to another
- [ ] `cross_reference_report` — Generate a cross-reference of all token usages across components

Requires:
1. Persistent task state store (in-memory Map or Redis) across requests
2. Background worker threads for long-running operations
3. `/api/tasks/{id}` REST endpoint for polling from the demo UI

### Resource Subscriptions
- [ ] SSE-based persistent transport for push notifications when data changes
- [ ] `POST /api/data` triggers subscription notifications to connected clients

---

## v0.5.0 — AI-Generated Design Systems (Planned)

This milestone enables users to generate a complete design system from a natural-language prompt or an existing website URL — dramatically reducing the time-to-first-load for the MCP server.

### Approach A: Prompt-to-Design-System

Users describe their brand and product in plain language. An LLM generates a valid `design-system.json` conforming to the current schema.

**Planned flow:**
1. User submits a prompt (e.g., _"A fintech app with a clean, trustworthy aesthetic — navy and gold palette, geometric sans-serif type"_) via a new UI panel or CLI command.
2. The server calls the LLM (via `/api/chat` or a new `/api/generate` endpoint) with:
   - The full `design-system` JSON schema (retrieved via `GET /api/schema/design-system`)
   - A system prompt instructing the model to emit valid JSON matching the schema
   - The user's brand prompt as the generation target
3. The LLM response is parsed and validated against the schema via the existing `validateAgainstSchema()` function.
4. If valid (or warnings only), the generated design system is loaded via `POST /api/data`.
5. The Component Explorer immediately reflects the generated system.

**Implementation tasks:**
- [ ] `POST /api/generate` — New endpoint accepting `{ prompt: string, style?: object }`, returning a generated `design-system.json`
- [ ] `src/generator.ts` — Generation logic: schema injection → LLM call → parse → validate → return
- [ ] Demo UI — New **Generate** tab or button in the Load JSON modal: textarea prompt → Generate button → preview + load
- [ ] Streaming support — Stream token generation to the UI for perceived responsiveness
- [ ] Retry logic — If validation fails, re-prompt the LLM with error messages (up to 3 retries)

### Approach B: Website-to-Design-System

Users provide a URL. The system extracts visual design tokens from the live website and generates a matching design system.

**Planned flow:**
1. User submits a URL (e.g., `https://stripe.com`).
2. A headless browser (Puppeteer/Playwright) visits the URL and:
   - Extracts computed CSS custom properties and frequently-used colour/font/spacing values
   - Captures computed styles from key elements (headings, body text, buttons, cards)
   - Optionally takes a screenshot for colour palette extraction
3. Extracted values are normalised into token categories (color, typography, spacing, etc.)
4. An LLM receives the extracted values + the schema + a synthesis prompt to produce coherent, named design tokens and component specs.
5. The result is validated and loaded, same as Approach A.

**Implementation tasks:**
- [ ] `scripts/extract-tokens-from-url.mjs` — Headless browser script to extract CSS values from a URL
- [ ] `POST /api/generate/from-url` — Endpoint accepting `{ url: string }`, orchestrating extraction + generation
- [ ] Colour palette deduplication — Group near-identical colours using delta-E distance
- [ ] Typography stack inference — Map extracted font families to known system-safe stacks
- [ ] Demo UI — URL input field alongside the prompt textarea in the Generate panel

### Shared Infrastructure
- [ ] Token value normalisation utilities — Convert hex/rgb/hsl to a common format; round spacing to the nearest 4px step
- [ ] Schema-aware prompt templates for each data type — Ensures the LLM output matches the expected leaf-node shape
- [ ] Generation history — Store and name generated design systems in browser `localStorage` for quick switching
- [ ] Export button — Download the generated `design-system.json` for use outside the demo UI

---

## What Was NOT Implemented

### Sampling & Elicitation (Architecture Decision)
Sampling (`sampling/createMessage`) and Elicitation (`elicitation/create`) require the client to explicitly declare these capabilities in its `initialize` request. In the current stateless HTTP transport mode:

- The server creates a new `McpServer` per request — it cannot make unsolicited requests to the client
- Sampling/Elicitation as *server-initiated* features work only when the server holds an active, persistent connection (SSE streaming mode)
- For a future persistent/stateful server mode, these can be enabled by calling `server.server.createMessage()` and `server.server.elicitInput()` from within tool handlers

**Decision:** Logging is fully implemented. Sampling and Elicitation are documented in this plan and the spec but not wired into specific tool paths, as they would silently fail in the current stateless architecture without providing value.

### Tasks (Experimental)
The SDK's `server.experimental.tasks.registerToolTask()` API is available and functional. Task-eligible operations (`batch_validate`, `full_audit`, `large_scale_diff`, `theme_migration`, `cross_reference_report`) are defined in the spec but require significant infrastructure (see v0.4.0 above). These are tracked for v0.4.0.

### Resource Subscriptions
The MCP `subscribe` mechanism requires persistent client connections (SSE). In stateless HTTP mode, the server cannot push notifications when data changes. The `POST /api/data` endpoint that triggers data changes would need to be extended to notify connected clients via SSE when subscriptions are implemented.

---

## Summary

| Primitive | Spec Count | Implemented | Notes |
|-----------|-----------|-------------|-------|
| Tools | 26 | ✅ 26 | All v0.1.0–v0.3.0 tools |
| Resources | 14 URIs + 4 templates | ✅ 14 + 4 | All static and template resources |
| Prompts | 9 | ✅ 10 | 9 specified + 1 bonus (token-rationale) |
| Logging | 14 events | ✅ 9 event types | Core events; debug events available via log level |
| Sampling | 5 use cases | 🟡 Documented | Requires persistent transport for activation |
| Elicitation | 6 scenarios | 🟡 Documented | Requires persistent transport for activation |
| Tasks | 5 operations | 🔵 Planned v0.4.0 | Requires background worker + task store |
| AI Generation | Prompt + URL | 🔵 Planned v0.5.0 | Prompt-to-JSON and website scraping approaches |
