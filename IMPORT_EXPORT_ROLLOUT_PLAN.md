# Import/Export Architecture Rollout Plan

## High-Level Goals

This rollout standardizes how design system JSON enters, is validated, normalized, stored, and exported by the app.

Goals:
1. Prevent piecemeal drift across UI, API routes, generator output, and Figma pipelines.
2. Keep input compatibility broad (real-world JSON is messy) while making runtime behavior predictable.
3. Ensure Gallery, Explorer, MCP tools, and download/export all operate on one canonical internal model.
4. Make warnings explicit so quality issues are visible instead of silently masked by fallbacks.
5. Create a testable pipeline that can evolve without breaking existing user workflows.
6. Verify and communicate whether a loaded design system is sufficiently specified to be useful and consistent.

---

## Why This Strategy

Current state uses multiple pathways:
1. Manual JSON load via modal and /api/data.
2. Website generation via /api/generate-from-website.
3. Figma-related scripts producing token data in alternate shapes.
4. UI rendering with local fallback assumptions when conventions differ.

Risk if unchanged:
1. Behavior divergence between pathways.
2. Hard-to-debug visual mismatches caused by naming/path conventions.
3. Increasing maintenance cost as new import sources are added.

Recommended architecture:
1. Be lenient at boundaries (accept varied source formats).
2. Be strict internally (canonical model used everywhere after ingest).
3. Use one ingestion pipeline for all entry points.

This gives strong runtime guarantees without rejecting practical inputs.

---

## Scope

In scope:
1. Server-side ingest architecture for manual load and website generation.
2. Normalization and canonicalization of token references and section shapes.
3. Validation layering (compatibility vs canonical).
4. API warning model and UI display of warnings.
5. Export consistency from canonical state.
6. Contract/fixture tests for import sources.
7. Design system readiness scoring and user-facing quality communication.

Out of scope (separate roadmap):
1. Complete redesign of schema semantics.
2. Full rewrite of Figma scripts into bidirectional sync.
3. New MCP primitives unrelated to import/export.

---

## Target Architecture

### Single Canonical Internal Model

Canonical design-system object:
1. tokens
2. components
3. themes
4. icons
5. style-guide (optional but supported)

Rules:
1. All runtime consumers read canonicalized store data only.
2. No route-specific transforms after persistence.

### One Ingestion Pipeline (Server)

All inputs flow through:
1. parse
2. source adapter (if needed)
3. normalize
4. compatibility validate
5. canonical validate
6. enrich defaults (safe minimal fills only)
7. persist
8. return structured warnings and loaded sections

### Validation Layers

Layer A: Compatibility validation
1. Accepts realistic external variation.
2. Produces warnings and targeted remediation hints.

Layer B: Canonical validation
1. Enforces strict internal guarantees needed by runtime/UI.
2. Blocks persistence only on hard errors.

### Warning Model

Every ingest response should include:
1. warnings: array of machine-readable warning objects.
2. errors: array of blocking errors (if any).
3. loaded: list of sections successfully persisted.
4. normalizationSummary: optional counts by transform category.

### Design System Readiness Gate

Every successfully loaded design system should be evaluated for practical readiness.

Readiness dimensions:
1. Coverage: required sections present and non-empty (tokens, components, themes, icons).
2. Token utility: semantic and foundational token availability for common UI rendering.
3. Component utility: minimum component metadata quality (variants, states, key token references, constraints/accessibility hints).
4. Theme utility: at least one complete baseline theme and coherent semantic mapping.
5. Consistency: token references resolve and do not rely on unresolved aliases/unknown paths.

Readiness output (API + UI):
1. readiness.status: ready, usable-with-warnings, or insufficient.
2. readiness.score: numeric score for trend visibility.
3. readiness.findings: concise, actionable items grouped by severity.
4. readiness.nextSteps: remediation guidance users can follow immediately.

---

## Rollout Phases

## Phase 0 - Baseline and Guardrails

Objective:
1. Establish observable baseline before refactor.

Work:
1. Inventory all ingest and export paths and map ownership.
2. Add temporary logging for path usage and fallback hits.
3. Define migration-safe response contract for warnings.

Reasoning:
1. Prevent regressions by measuring behavior before changing internals.

Done when:
1. Baseline report exists with path matrix and fallback metrics.
2. Team agrees on warning object shape.

---

## Phase 1 - Shared Ingest Service

Objective:
1. Remove duplicate ingest logic from routes.

Work:
1. Introduce a server module responsible for shared ingest flow.
2. Route /api/data calls ingest service.
3. Route /api/generate-from-website calls the same ingest service.
4. Keep route responses backward compatible while adding warnings field.

Reasoning:
1. Centralization eliminates drift and makes future changes single-point.

Done when:
1. Both routes use shared service.
2. Existing UI flows still work.
3. API responses include consistent loaded and warnings fields.

---

## Phase 2 - Canonicalization Rules

Objective:
1. Normalize naming/path conventions consistently.

Work:
1. Normalize token reference paths (for example tokens.color.x to color.x where canonical).
2. Normalize common variant aliases where safe.
3. Normalize section shape differences from known sources.
4. Emit warning entries for every non-trivial rewrite.

Reasoning:
1. Compatibility is preserved, but runtime receives deterministic shape.

Done when:
1. Canonicalization is deterministic and idempotent.
2. Warning output clearly explains rewrites.

---

## Phase 3 - Validation Layering

Objective:
1. Separate compatibility acceptance from canonical guarantees.

Work:
1. Add compatibility validator module.
2. Add canonical validator module.
3. Define hard-error vs warning policy.
4. Ensure persistence occurs only after canonical pass success.

Reasoning:
1. Avoid false rejects while preventing unstable runtime data.

Done when:
1. Validation decision table is documented and covered by tests.
2. Blocking errors are clear and actionable.

---

## Phase 3.5 - Readiness Evaluation and Communication

Objective:
1. Ensure users know whether the loaded design system is actually usable and consistent.

Work:
1. Implement readiness evaluator in shared ingest service.
2. Define a stable readiness rubric and scoring thresholds.
3. Return readiness payload in ingest responses.
4. Display readiness summary in Load JSON and Generate from Website success flows.
5. Include actionable remediation tips in UI and API responses.

Reasoning:
1. Schema validity alone does not guarantee practical design system utility.
2. Explicit readiness communication reduces confusion and improves trust.

Done when:
1. Every successful ingest response contains readiness payload.
2. UI presents readiness status and top findings without requiring debug logs.
3. Readiness rubric is documented and covered by fixtures.

---

## Phase 4 - UI Warning and Insight Surfaces

Objective:
1. Make ingest quality visible to users.

Work:
1. Show warnings in Load JSON and Generate from Website workflows.
2. Include concise normalization summary in chat card/system message.
3. Keep current behavior for successful loads while surfacing quality signals.

Reasoning:
1. Silent normalization creates confusion; visible warnings build trust.

Done when:
1. Users can see what was changed and why.
2. No extra clicks required for standard success path.

---

## Phase 5 - Export Consistency

Objective:
1. Ensure downloads/export always represent canonical state.

Work:
1. Define one canonical export shape.
2. Ensure generated download uses canonicalized store snapshot.
3. Optionally expose source-profile exports later (non-canonical) as explicit variants.

Reasoning:
1. Export should be stable and predictable regardless of import source.

Done when:
1. Export output is consistent across import pathways.
2. Round-trip tests pass (import -> canonicalize -> export -> import).

---

## Phase 6 - Tests and Rollout Safety

Objective:
1. Lock behavior with fixture-based contract tests.

Work:
1. Add fixtures for manual canonical, website-generated sparse, and Figma-like source inputs.
2. Add snapshot tests for warnings and normalized outputs.
3. Add API route integration tests for both /api/data and /api/generate-from-website.
4. Add rollback switch/feature flag for ingest service if needed.

Reasoning:
1. Refactor safety depends on stable fixtures and route-level contract tests.

Done when:
1. CI covers ingestion contracts and key UI compatibility assumptions.
2. Rollback path is documented and tested.

---

## Decision Rules

Use these rules during implementation:
1. Never silently drop known data; warn if data is ignored.
2. Prefer normalization over rejection for common source variations.
3. Reject only when canonical runtime safety would be compromised.
4. Keep route responses stable unless versioned changes are explicitly introduced.
5. Every transform should be testable and explainable.
6. Passing schema checks is necessary but not sufficient; readiness must be evaluated and communicated.

---

## Ownership and Work Breakdown

Suggested ownership:
1. Server ingest and validators: backend owner.
2. Source adapters (website/Figma/manual): backend + design ops owner.
3. UI warning surfaces: frontend owner.
4. Fixtures and contract tests: shared ownership.

Suggested execution order:
1. Phase 0 and Phase 1 first.
2. Phase 2 and Phase 3 second.
3. Phase 4 and Phase 5 third.
4. Phase 6 across all phases, finalized last.

---

## Milestone Acceptance Checklist

Ship-ready checklist:
1. One shared ingest service is used by all import pathways.
2. Canonicalization rules documented and idempotent.
3. Validation layering implemented with clear hard-error policy.
4. Warnings returned by API and displayed in UI.
5. Export is canonical and round-trip safe.
6. Fixture and integration tests pass in CI.
7. Rollback procedure documented.
8. Readiness status is returned by API and visible in UI for every successful load.

---

## Immediate Next Actions

1. Create ingest service module and wire /api/data to it first.
2. Add website route integration to same service.
3. Implement first canonicalization rule set for token path references.
4. Add warning object schema and UI rendering for warnings.
5. Add three initial fixtures: canonical, website sparse, figma-like.
6. Define and implement readiness rubric with explicit thresholds.

---

## IA Refactor Workplan (Implementation-Ready)

The IA definition is only the destination. This section defines what must change in code and UI to get there safely.

### Target Product Navigation

1. Workspace
2. Design System Ops
3. Agent Sandbox
4. About

### Current State to Refactor

Current UI behavior places operational actions in topbar buttons and sends advanced agent evaluation to a separate Eval Lab page.

Key touchpoints:
1. Topbar and tab shell: public/demo.html
2. Right-panel tab behavior: public/js/tabs.js
3. App boot wiring and reload hooks: public/js/main.js
4. Current eval-oriented surface: public/eval.html and public/js/eval.js

### Workstream A - Navigation and Layout Separation

Objective:
1. Move from control/button-centric navigation to section-centric navigation.

Implementation:
1. Add explicit product-level nav for Workspace, Design System Ops, Agent Sandbox, About.
2. Keep existing Workspace internals (Chat, Preview, Explorer, Gallery) grouped under Workspace.
3. Move operational controls (Load JSON, Generate from Website, View Schema, Reset, Export) into the Design System Ops section.
4. Keep About focused on product purpose and onboarding only.

Reasoning:
1. Reduces cognitive load and prevents operational tasks from competing with core build flows.

Acceptance criteria:
1. Users can identify and enter each major section in one click.
2. Topbar is no longer overloaded with data lifecycle actions.

### Workstream B - Design System Ops Surface

Objective:
1. Create one cohesive UI surface for JSON lifecycle management.

Implementation:
1. Build a Design System Ops panel/page with grouped subsections:
	1. Import
	2. Generate
	3. Validate and readiness
	4. Normalize summary
	5. Export and reset
2. Reuse existing modal logic initially, then progressively inline into panel workflows.
3. Display readiness status and key findings after every load/generation success.
4. Preserve backend endpoint usage while migrating UI presentation.

Reasoning:
1. Data trust, consistency, and lifecycle state must be visible where data operations happen.

Acceptance criteria:
1. All JSON lifecycle actions are discoverable in Design System Ops without relying on topbar buttons.
2. Every successful operation shows readiness and warning outcomes.

### Workstream C - Agent Sandbox (Epistemic, User-Facing)

Objective:
1. Make agent behavior understandable in user-centered terms.

Implementation:
1. Position Agent Sandbox as product-facing evaluation, not engineering QA.
2. Include:
	1. Meet the Agents
	2. Scenario execution
	3. Tool-call trace transparency
	4. Confidence and uncertainty signals
	5. Model and protocol explanation in the sandbox context
3. Keep framing grounded in behavioral outcomes and user goals.

Reasoning:
1. Trust and transparency come from behavior evidence, not internal harness metrics.

Acceptance criteria:
1. Users can answer what each agent is doing and why.
2. Users can inspect behavior evidence without seeing engineering-only controls.

### Workstream D - Developer Surface Separation

Objective:
1. Keep engineering test concerns out of product IA.

Implementation:
1. Treat app test automation (Jest/Playwright) as developer workflow only.
2. Treat mechanistic harness metrics and feasibility testing as engineering/CI artifacts.
3. Keep Eval Lab internals either:
	1. internal/dev-only, or
	2. split so only epistemic sections are product-facing.

Reasoning:
1. Mixed audiences in one surface weaken both usability and engineering rigor.

Acceptance criteria:
1. Product UI contains epistemic evaluation only.
2. Engineering regression and feasibility tooling remains dev-facing.

### Workstream E - Routing and State Boundaries

Objective:
1. Ensure section transitions do not create hidden state coupling.

Implementation:
1. Introduce explicit section state model in front-end shell.
2. Keep data reload hooks centralized and section-aware.
3. Confirm Explorer/Gallery refresh logic remains correct when actions are initiated from Design System Ops.

Reasoning:
1. IA refactors fail when navigation changes but state boundaries remain implicit.

Acceptance criteria:
1. Switching sections does not lose or corrupt active session data.
2. Data updates propagate to dependent panels deterministically.

### Workstream F - Content Strategy

Objective:
1. Align section language to user intent.

Implementation:
1. About content: app purpose and workflows only.
2. Agent Sandbox content: how agents behave and how grounding works.
3. Design System Ops content: lifecycle and data quality guidance.

Reasoning:
1. Clear content boundaries reduce user confusion and improve trust.

Acceptance criteria:
1. No model/protocol deep explanation in About.
2. Model/protocol explanation appears in Agent Sandbox where behavior is evaluated.

### Dependency Analysis: IA Refactor vs Import/Export Rollout

The IA refactor workstreams have uneven dependencies on the Import/Export phases. The table below governs the recommended sequence.

| Workstream | Import/Export dependency | Can start before Import/Export? |
|---|---|---|
| A — Navigation shell | None | Yes — purely structural UI |
| B — Design System Ops surface | Requires Phase 3.5 (readiness payload) and Phase 4 (warning surfaces) | No — building the panel before readiness/warnings exist produces a hollow container |
| C — Agent Sandbox | Requires Workstream A shell; no Import/Export dependency | Yes, once A is done |
| D — Developer surface separation | None | Yes — routing and visibility decision only |
| E — Routing and state boundaries | Requires Phase 1 (centralized ingest service) to validate Explorer/Gallery refresh correctness | Partially — shell wiring can start, correctness confirmation requires Phase 1 |
| F — Content strategy | None | Yes — copy and labeling only |

### Recommended Sequence

1. Implement Workstream A (navigation shell with placeholder sections) — no Import/Export dependency; provides the stable container for all subsequent deliverables.
2. Run Import/Export Phases 0 and 1 (baseline + shared ingest service) in parallel with or immediately after Workstream A.
3. Implement Workstreams D and F in parallel with Import/Export Phases 0–3 — both are independent of backend state.
4. Run Import/Export Phases 2 and 3 (canonicalization + validation layering).
5. Run Import/Export Phase 3.5 (readiness evaluation) and Phase 4 (UI warning surfaces).
6. Implement Workstream B (Design System Ops surface) once Phase 3.5 and 4 are complete — readiness status and warning outcomes are now available to fulfill Workstream B acceptance criteria.
7. Implement Workstream C (Agent Sandbox) once Workstream A is in place.
8. Implement Workstream E (state hardening) once Phase 1 ingest service and the nav shell both exist.

### Delivery Milestones

Milestone 1 (IA-first, no Import/Export prerequisite):
1. New top-level nav present with placeholder sections wired (Workstream A complete).
2. Dev/product surface separation implemented (Workstream D complete).
3. Content boundaries finalized across all sections (Workstream F complete).

Milestone 2 (requires Import/Export Phases 0–1):
1. Shared ingest service wired to all import paths.
2. Explorer/Gallery refresh correctness confirmed when actions originate from Design System Ops section (Workstream E complete).

Milestone 3 (requires Import/Export Phases 3.5 and 4):
1. Design System Ops functional parity with existing topbar/modal operations.
2. Every successful load and generation operation shows readiness status and warning outcomes (Workstream B complete).

Milestone 4 (requires Workstream A):
1. Agent Sandbox exposes epistemic evaluation workflows and transparency artifacts (Workstream C complete).

Milestone 5:
1. Final QA pass for state transitions, data reload correctness, and content boundaries across all sections.
