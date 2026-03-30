/**
 * Design System MCP — Shared Ingest Service
 *
 * Single pipeline for all design-system data entry points. All import
 * pathways — manual JSON load (/api/data) and website generation
 * (/api/generate-from-website) — flow through this module so that
 * behaviour is consistent and drift between routes is impossible.
 *
 * Pipeline stages (Import/Export Rollout Plan Phases 0 & 1):
 *   1. validate input shape (compatibility validation)
 *   2. normalize section shapes
 *   3. enrich defaults (minimal safe fills)
 *   4. persist via setData()
 *   5. return structured { loaded, warnings, normalizationSummary }
 *
 * Phase 0 — Baseline logging: every ingest call is logged with path usage
 * and any fallback hits so that behaviour is observable before deeper
 * refactors are applied in later phases.
 */

import { setData, type DataType } from "./dataStore.js";

// ── Types ─────────────────────────────────────────────────────────────────

export interface IngestWarning {
  code: string;
  section: string;
  message: string;
  severity: "error" | "warning" | "info";
}

export interface NormalizationSummary {
  renamedKeys: number;
  filledDefaults: number;
  droppedUnknownSections: number;
}

export interface IngestResult {
  ok: boolean;
  type: string;
  loaded: string[];
  warnings: IngestWarning[];
  errors: IngestWarning[];
  normalizationSummary: NormalizationSummary;
  message: string;
}

// ── Baseline logger (Phase 0) ─────────────────────────────────────────────
// Lightweight structured logging to stdout.  All ingest activity is logged
// so path usage and fallback hits are observable before deeper refactors.

function log(level: "info" | "warn" | "error", event: string, data?: Record<string, unknown>): void {
  const entry = {
    ts: new Date().toISOString(),
    level,
    event,
    ...data,
  };
  if (level === "error") {
    console.error(JSON.stringify(entry));
  } else if (level === "warn") {
    console.warn(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}

// ── Compatibility validation ──────────────────────────────────────────────
// Lenient checks that accept realistic external variation and produce
// targeted warnings.  Does NOT block persistence.

function compatibilityCheck(
  section: DataType,
  data: Record<string, unknown>,
): IngestWarning[] {
  const warnings: IngestWarning[] = [];

  if (section === "tokens") {
    if (Object.keys(data).length === 0) {
      warnings.push({
        code: "TOKENS_EMPTY",
        section,
        message: "tokens object is empty — no token categories found.",
        severity: "warning",
      });
    }
  }

  if (section === "components") {
    const entries = Object.entries(data);
    for (const [key, comp] of entries) {
      const c = comp as Record<string, unknown>;
      if (!c.name || !c.description) {
        warnings.push({
          code: "COMPONENT_MISSING_REQUIRED",
          section,
          message: `Component "${key}" is missing "name" or "description". Consider adding them for MCP tool accuracy.`,
          severity: "warning",
        });
      }
    }
  }

  if (section === "themes") {
    const entries = Object.entries(data);
    for (const [key, theme] of entries) {
      const t = theme as Record<string, unknown>;
      if (!t.semantic) {
        warnings.push({
          code: "THEME_MISSING_SEMANTIC",
          section,
          message: `Theme "${key}" has no "semantic" mapping. Token resolution may be incomplete.`,
          severity: "warning",
        });
      }
    }
  }

  return warnings;
}

// ── Normalization ─────────────────────────────────────────────────────────
// Safe, idempotent transforms.  Each transform emits a warning entry so
// callers know what was changed and why.  Phase 2 will expand this set.

function normalize(
  section: DataType,
  data: Record<string, unknown>,
): { normalized: Record<string, unknown>; warnings: IngestWarning[]; summary: NormalizationSummary } {
  const warnings: IngestWarning[] = [];
  const summary: NormalizationSummary = { renamedKeys: 0, filledDefaults: 0, droppedUnknownSections: 0 };
  let normalized = { ...data };

  // Tokens: if top-level key is "tokens" wrapping actual categories, unwrap it.
  // This handles payloads like { tokens: { color: {...} } } vs { color: {...} }.
  if (section === "tokens" && normalized.tokens && typeof normalized.tokens === "object" && !Array.isArray(normalized.tokens)) {
    const inner = normalized.tokens as Record<string, unknown>;
    const innerKeys = Object.keys(inner);
    // Only unwrap if all inner keys look like token category names (not leaf tokens)
    const looksLikeCategories = innerKeys.every(k => typeof inner[k] === "object" && inner[k] !== null && !Array.isArray(inner[k]));
    if (looksLikeCategories && innerKeys.length > 0) {
      warnings.push({
        code: "TOKENS_UNWRAPPED",
        section,
        message: 'Top-level "tokens" wrapper key detected and unwrapped to canonical flat structure.',
        severity: "info",
      });
      normalized = inner;
      summary.renamedKeys++;
    }
  }

  return { normalized, warnings, summary };
}

// ── Default enrichment ────────────────────────────────────────────────────
// Minimal safe fills only.  Never overwrites existing data.

function enrichDefaults(
  section: DataType,
  data: Record<string, unknown>,
): { enriched: Record<string, unknown>; warnings: IngestWarning[]; filled: number } {
  const warnings: IngestWarning[] = [];
  let filled = 0;
  const enriched = { ...data };

  // Themes: ensure each theme has a "mode" field defaulting to "light"
  if (section === "themes") {
    for (const [key, theme] of Object.entries(enriched)) {
      const t = theme as Record<string, unknown>;
      if (t && typeof t === "object" && !("mode" in t)) {
        (enriched[key] as Record<string, unknown>)["mode"] = "light";
        filled++;
      }
    }
    if (filled > 0) {
      warnings.push({
        code: "THEME_MODE_DEFAULTED",
        section,
        message: `Added default "mode": "light" to ${filled} theme(s) that had no mode set.`,
        severity: "info",
      });
    }
  }

  return { enriched, warnings, filled };
}

// ── Main ingest pipeline ──────────────────────────────────────────────────

const VALID_SECTIONS: DataType[] = ["tokens", "components", "themes", "icons", "style-guide"];
const REQUIRED_SECTIONS: DataType[] = ["tokens", "components", "themes", "icons"];

/**
 * Ingest a single section (e.g. "tokens", "components") or a combined
 * "design-system" payload.  Returns a structured result with warnings,
 * loaded sections, and a normalization summary.
 *
 * @param source - Human-readable label for the entry point (e.g. "api/data", "generate-from-website")
 * @param type   - The data type to ingest ("design-system" or a section name)
 * @param data   - The raw JSON object to process
 */
export async function ingest(
  source: string,
  type: "design-system" | DataType,
  data: Record<string, unknown>,
): Promise<IngestResult> {
  const allWarnings: IngestWarning[] = [];
  const allErrors: IngestWarning[] = [];
  const loaded: string[] = [];
  const totalSummary: NormalizationSummary = { renamedKeys: 0, filledDefaults: 0, droppedUnknownSections: 0 };

  log("info", "ingest.started", { source, type, keys: Object.keys(data).length });

  const sectionsToProcess: Array<{ section: DataType; sectionData: Record<string, unknown> }> = [];

  if (type === "design-system") {
    // Collect all known sections from the combined payload
    for (const section of [...REQUIRED_SECTIONS, "style-guide" as DataType]) {
      const raw = data[section];
      if (raw !== undefined) {
        if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
          allErrors.push({
            code: "SECTION_INVALID_TYPE",
            section,
            message: `"${section}" must be a JSON object, got ${Array.isArray(raw) ? "array" : typeof raw}.`,
            severity: "error",
          });
          log("warn", "ingest.section.invalid_type", { source, section });
          continue;
        }
        sectionsToProcess.push({ section, sectionData: raw as Record<string, unknown> });
      }
    }

    // Warn about missing required sections
    for (const required of REQUIRED_SECTIONS) {
      if (!sectionsToProcess.find(s => s.section === required)) {
        allWarnings.push({
          code: "SECTION_MISSING",
          section: required,
          message: `Required section "${required}" was not present in the design-system payload.`,
          severity: "warning",
        });
        log("warn", "ingest.section.missing", { source, section: required });
      }
    }

    // Warn about unexpected top-level keys
    const knownKeys = new Set([...REQUIRED_SECTIONS, "style-guide"]);
    for (const key of Object.keys(data)) {
      if (!knownKeys.has(key as DataType)) {
        allWarnings.push({
          code: "UNKNOWN_SECTION",
          section: key,
          message: `Unknown top-level key "${key}" will be ignored. Expected sections: ${[...knownKeys].join(", ")}.`,
          severity: "warning",
        });
        totalSummary.droppedUnknownSections++;
        log("warn", "ingest.unknown_section", { source, key });
      }
    }

    if (sectionsToProcess.length === 0 && allErrors.length === 0) {
      allErrors.push({
        code: "DESIGN_SYSTEM_EMPTY",
        section: "design-system",
        message: "design-system payload must contain at least one of: tokens, components, themes, icons, style-guide.",
        severity: "error",
      });
    }
  } else {
    if (!VALID_SECTIONS.includes(type)) {
      allErrors.push({
        code: "UNKNOWN_TYPE",
        section: type,
        message: `Unknown type "${type}". Must be one of: ${["design-system", ...VALID_SECTIONS].join(", ")}.`,
        severity: "error",
      });
    } else {
      sectionsToProcess.push({ section: type, sectionData: data });
    }
  }

  // Hard errors: abort before persisting
  if (allErrors.length > 0) {
    log("error", "ingest.aborted", { source, type, errorCount: allErrors.length });
    return {
      ok: false,
      type,
      loaded: [],
      warnings: allWarnings,
      errors: allErrors,
      normalizationSummary: totalSummary,
      message: `Ingest failed: ${allErrors.map(e => e.message).join("; ")}`,
    };
  }

  // Process each section through the pipeline
  for (const { section, sectionData } of sectionsToProcess) {
    log("info", "ingest.section.started", { source, section });

    // 1. Compatibility validation
    const compatWarnings = compatibilityCheck(section, sectionData);
    allWarnings.push(...compatWarnings);
    if (compatWarnings.length > 0) {
      log("warn", "ingest.section.compat_warnings", { source, section, count: compatWarnings.length });
    }

    // 2. Normalization
    const { normalized, warnings: normWarnings, summary } = normalize(section, sectionData);
    allWarnings.push(...normWarnings);
    totalSummary.renamedKeys += summary.renamedKeys;
    totalSummary.droppedUnknownSections += summary.droppedUnknownSections;

    // 3. Default enrichment
    const { enriched, warnings: enrichWarnings, filled } = enrichDefaults(section, normalized);
    allWarnings.push(...enrichWarnings);
    totalSummary.filledDefaults += filled;

    // 4. Persist
    setData(section, enriched);
    loaded.push(section);
    log("info", "ingest.section.persisted", { source, section });
  }

  const warnCount = allWarnings.length;
  log("info", "ingest.completed", {
    source,
    type,
    loaded,
    warnCount,
    normalizationSummary: totalSummary,
  });

  const message =
    type === "design-system"
      ? `Design system data loaded (${loaded.join(", ")}).${warnCount > 0 ? ` ${warnCount} warning(s) noted.` : ""} MCP tools now reflect the new data.`
      : `${type} data replaced.${warnCount > 0 ? ` ${warnCount} warning(s) noted.` : ""} MCP tools now reflect the new data.`;

  return {
    ok: true,
    type,
    loaded,
    warnings: allWarnings,
    errors: [],
    normalizationSummary: totalSummary,
    message,
  };
}
