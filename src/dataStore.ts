/**
 * Design System MCP — Shared In-Memory Data Store
 *
 * A singleton that holds the active design system JSON data for all seven
 * data types: tokens, components, themes, icons, changelog, deprecations and
 * the style guide.
 *
 * Both mcp-server.ts and toolRunner.ts read from here so that any JSON
 * loaded via POST /api/data is immediately reflected in MCP tool responses.
 *
 * Two modes:
 *
 *   Bundled (the default): data is loaded from src/data/ once at module
 *   initialisation. Callers may replace individual data sets at runtime via
 *   setData() and restore originals via resetData().
 *
 *   Remote (DESIGN_SYSTEM_DATA_URL is set): the seven data sets are fetched
 *   from <url>/<type>.json, for example a design system's own published files,
 *   and fetched again once they are older than DESIGN_SYSTEM_DATA_TTL_SECONDS
 *   (default 60). The store is then read-only: setData() and resetData() refuse,
 *   and the bundled sample is never served in its place. Call ensureFresh()
 *   before reading; it throws when no data has ever been fetched.
 */

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

export type DataType = "tokens" | "components" | "themes" | "icons" | "changelog" | "deprecations" | "style-guide";

const ALL_TYPES: DataType[] = ["tokens", "components", "themes", "icons", "changelog", "deprecations", "style-guide"];

function loadJson(filename: string): unknown {
  return JSON.parse(readFileSync(join(__dirname, "data", filename), "utf-8"));
}

/** The remote data address, without a trailing slash, or null in bundled mode. */
export function remoteDataUrl(): string | null {
  const url = process.env.DESIGN_SYSTEM_DATA_URL?.trim();
  return url ? url.replace(/\/+$/, "") : null;
}

/** True when the data comes from DESIGN_SYSTEM_DATA_URL and cannot be replaced at runtime. */
export function isReadOnly(): boolean {
  return remoteDataUrl() !== null;
}

function ttlMs(): number {
  const seconds = Number(process.env.DESIGN_SYSTEM_DATA_TTL_SECONDS ?? 60);
  return (Number.isFinite(seconds) && seconds >= 0 ? seconds : 60) * 1000;
}

// The active data for each type — replaced by setData(), restored by resetData(),
// or, in remote mode, by each successful fetch.
const store: Record<DataType, unknown> = remoteDataUrl()
  ? { tokens: null, components: null, themes: null, icons: null, changelog: null, deprecations: null, "style-guide": null }
  : {
      tokens:        loadJson("tokens.json"),
      components:    loadJson("components.json"),
      themes:        loadJson("themes.json"),
      icons:         loadJson("icons.json"),
      changelog:     loadJson("changelog.json"),
      deprecations:  loadJson("deprecations.json"),
      "style-guide": loadJson("style-guide.json"),
    };

let fetchedAt = 0;
let inFlight: Promise<void> | null = null;
let lastError: string | null = null;

async function fetchAll(base: string): Promise<void> {
  const entries = await Promise.all(ALL_TYPES.map(async (type) => {
    const res = await fetch(`${base}/${type}.json`, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`${type}.json: HTTP ${res.status}`);
    return [type, await res.json()] as const;
  }));
  // Replace all seven together, so a reader never sees two versions mixed.
  for (const [type, data] of entries) store[type] = data;
  fetchedAt = Date.now();
  lastError = null;
}

/**
 * In remote mode, make sure the data is no older than the TTL. A failed
 * refresh keeps serving the last good copy; with no good copy yet, it throws.
 * In bundled mode it does nothing.
 */
export async function ensureFresh(): Promise<void> {
  const base = remoteDataUrl();
  if (!base) return;
  if (fetchedAt && Date.now() - fetchedAt < ttlMs()) return;
  inFlight ??= fetchAll(base)
    .catch((err: unknown) => {
      lastError = err instanceof Error ? err.message : String(err);
      console.error(`Design system data: could not fetch from ${base}: ${lastError}`);
      if (!fetchedAt) throw new Error(`Design system data unavailable from ${base}: ${lastError}`);
    })
    .finally(() => { inFlight = null; });
  await inFlight;
}

/** Where the data comes from, for /health. */
export function dataSource(): { mode: "bundled" | "remote"; url?: string; fetchedAt?: string | null; lastError?: string | null } {
  const url = remoteDataUrl();
  if (!url) return { mode: "bundled" };
  return { mode: "remote", url, fetchedAt: fetchedAt ? new Date(fetchedAt).toISOString() : null, lastError };
}

/** Return the active data for the given type. */
export function getData(type: DataType): unknown {
  return store[type];
}

/** Replace the active data for the given type. Refused in remote mode. */
export function setData(type: DataType, data: unknown): void {
  if (isReadOnly()) throw new Error("This design system is read-only: it is served from DESIGN_SYSTEM_DATA_URL.");
  store[type] = data;
}

/**
 * Reset the active data back to the on-disk originals.
 * If a type is provided only that type is reset; otherwise all seven are reset.
 * Refused in remote mode.
 */
export function resetData(type?: DataType): void {
  if (isReadOnly()) throw new Error("This design system is read-only: it is served from DESIGN_SYSTEM_DATA_URL.");
  if (type) {
    store[type] = loadJson(`${type}.json`);
  } else {
    ALL_TYPES.forEach((t) => {
      store[t] = loadJson(`${t}.json`);
    });
  }
}
