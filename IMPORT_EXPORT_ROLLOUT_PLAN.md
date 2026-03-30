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
