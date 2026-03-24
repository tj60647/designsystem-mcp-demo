/**
 * Design System MCP — Shared In-Memory Data Store
 *
 * A singleton that holds the active design system JSON data for all four
 * data types: tokens, components, themes, and icons.
 *
 * Both mcp-server.ts and toolRunner.ts read from here so that any JSON
 * loaded via POST /api/data is immediately reflected in MCP tool responses.
 *
 * Data is loaded from disk once at module initialisation. Callers may
 * replace individual data sets at runtime via setData() and restore
 * originals via resetData().
 */

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

export type DataType = "tokens" | "components" | "themes" | "icons";

function loadJson(filename: string): unknown {
  return JSON.parse(readFileSync(join(__dirname, "data", filename), "utf-8"));
}

// The active data for each type — replaced by setData(), restored by resetData().
const store: Record<DataType, unknown> = {
  tokens:     loadJson("tokens.json"),
  components: loadJson("components.json"),
  themes:     loadJson("themes.json"),
  icons:      loadJson("icons.json"),
};

/** Return the active data for the given type. */
export function getData(type: DataType): unknown {
  return store[type];
}

/** Replace the active data for the given type. */
export function setData(type: DataType, data: unknown): void {
  store[type] = data;
}

/**
 * Reset the active data back to the on-disk originals.
 * If a type is provided only that type is reset; otherwise all four are reset.
 */
export function resetData(type?: DataType): void {
  if (type) {
    store[type] = loadJson(`${type}.json`);
  } else {
    (["tokens", "components", "themes", "icons"] as DataType[]).forEach((t) => {
      store[t] = loadJson(`${t}.json`);
    });
  }
}
