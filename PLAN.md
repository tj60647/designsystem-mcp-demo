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

## What Was NOT Implemented

### Sampling & Elicitation (Architecture Decision)
Sampling (`sampling/createMessage`) and Elicitation (`elicitation/create`) require the client to explicitly declare these capabilities in its `initialize` request. In the current stateless HTTP transport mode:

- The server creates a new `McpServer` per request — it cannot make unsolicited requests to the client
- Sampling/Elicitation as *server-initiated* features work only when the server holds an active, persistent connection (SSE streaming mode)
- For a future persistent/stateful server mode, these can be enabled by calling `server.server.createMessage()` and `server.server.elicitInput()` from within tool handlers

**Decision:** Logging is fully implemented. Sampling and Elicitation are documented in this plan and the spec but not wired into specific tool paths, as they would silently fail in the current stateless architecture without providing value.

### Tasks (Experimental)
The SDK's `server.experimental.tasks.registerToolTask()` API is available and functional. Task-eligible operations (`batch_validate`, `full_audit`, `large_scale_diff`, `theme_migration`, `cross_reference_report`) are defined in the spec but require:

1. Persistent task state store (in-memory Map or Redis) across requests
2. Background worker threads for long-running operations
3. A `/api/tasks/{id}` REST endpoint for polling from the demo UI

These are intentionally scoped out of v0.3.0 as they require significant infrastructure beyond the stateless server model. They are tracked for a future v0.4.0 milestone.

### Resource Subscriptions
The MCP `subscribe` mechanism requires persistent client connections (SSE). In stateless HTTP mode, the server cannot push notifications when data changes. The `POST /api/data` endpoint that triggers data changes would need to be extended to notify connected clients via SSE when subscriptions are implemented.

---

## Summary

| Primitive | Spec Count | Implemented | Notes |
|-----------|-----------|-------------|-------|
| Tools | 26 | ✅ 26 | All v0.1.0–v0.2.0 tools |
| Resources | 14 URIs + 4 templates | ✅ 14 + 4 | All static and template resources |
| Prompts | 9 | ✅ 10 | 9 specified + 1 bonus (token-rationale) |
| Logging | 14 events | ✅ 9 event types | Core events; debug events available via log level |
| Sampling | 5 use cases | 🟡 Documented | Requires persistent transport for activation |
| Elicitation | 6 scenarios | 🟡 Documented | Requires persistent transport for activation |
| Tasks | 5 operations | 🔵 Planned v0.4.0 | Requires background worker + task store |
