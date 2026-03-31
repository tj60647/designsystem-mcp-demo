/**
 * figma-sync.mjs
 *
 * Syncs design tokens from a Figma file to src/data/tokens.json by calling
 * the Figma Variables API. Also writes the raw response to figma-export.json.
 *
 * Usage:
 *   node scripts/figma-sync.mjs [--dry-run]
 *
 * Required environment variables (or .env file):
 *   FIGMA_TOKEN    – Personal access token or OAuth token for the Figma API
 *   FIGMA_FILE_KEY – The file key from the Figma file URL
 *
 * Author: Thomas J McLeish
 * License: MIT
 */

import { writeFileSync, readFileSync, existsSync } from "fs";
import { dirname, join }                            from "path";
import { fileURLToPath }                            from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const root       = join(__dirname, "..");

// ---------------------------------------------------------------------------
// Optional: load .env if present (no external dependencies)
// ---------------------------------------------------------------------------
const envFile = join(root, ".env");
if (existsSync(envFile)) {
  const lines = readFileSync(envFile, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    if (key && !(key in process.env)) process.env[key] = val;
  }
}

// ---------------------------------------------------------------------------
// Validate env vars
// ---------------------------------------------------------------------------
const FIGMA_TOKEN    = process.env.FIGMA_TOKEN;
const FIGMA_FILE_KEY = process.env.FIGMA_FILE_KEY;

if (!FIGMA_TOKEN || !FIGMA_FILE_KEY) {
  const missing = [
    !FIGMA_TOKEN    && "FIGMA_TOKEN",
    !FIGMA_FILE_KEY && "FIGMA_FILE_KEY",
  ].filter(Boolean).join(", ");

  console.error(`Error: missing required environment variable(s): ${missing}`);
  console.error("");
  console.error("Set them before running this script:");
  console.error("  export FIGMA_TOKEN=<your-personal-access-token>");
  console.error("  export FIGMA_FILE_KEY=<key-from-figma-file-url>");
  console.error("");
  console.error("Or create a .env file in the repo root with:");
  console.error("  FIGMA_TOKEN=<your-personal-access-token>");
  console.error("  FIGMA_FILE_KEY=<key-from-figma-file-url>");
  process.exit(1);
}

const dryRun = process.argv.includes("--dry-run");

// ---------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------

/** Convert a Figma RGBA object ({ r, g, b, a } in 0-1 range) to a hex string. */
function rgbaToHex({ r, g, b, a = 1 }) {
  const toHex = (n) => Math.round(n * 255).toString(16).padStart(2, "0");
  const hex = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  return a < 1 ? hex + toHex(a) : hex;
}

// ---------------------------------------------------------------------------
// Transform Figma Variables API response → tokens.json structure
// ---------------------------------------------------------------------------

/**
 * The Figma Variables API returns:
 *   { meta: { variableCollections: { [id]: Collection }, variables: { [id]: Variable } } }
 *
 * Each Variable has:
 *   - name         : e.g. "color/primary/600"
 *   - resolvedType : "COLOR" | "FLOAT" | "STRING" | "BOOLEAN"
 *   - valuesByMode : { [modeId]: value | { type: "VARIABLE_ALIAS", id: string } }
 *
 * We pick the first mode's value for simplicity (light/default mode).
 */
function transformFigmaVariables(apiResponse) {
  const { variableCollections, variables } = apiResponse.meta;

  // Build a lookup: variable id → resolved primitive value (first mode)
  const idToValue = {};
  for (const [id, variable] of Object.entries(variables)) {
    const firstModeId = Object.keys(variable.valuesByMode)[0];
    idToValue[id] = { variable, modeValue: variable.valuesByMode[firstModeId] };
  }

  // Resolve a raw mode value to a scalar (handles aliases recursively)
  const seen = new Set();
  function resolveValue(modeValue, resolvedType, depth = 0) {
    if (depth > 20) return null; // guard against circular refs
    if (modeValue && typeof modeValue === "object" && modeValue.type === "VARIABLE_ALIAS") {
      const aliasId = modeValue.id;
      if (seen.has(aliasId)) return null;
      seen.add(aliasId);
      const aliasEntry = idToValue[aliasId];
      if (!aliasEntry) return null;
      const firstModeId = Object.keys(aliasEntry.variable.valuesByMode)[0];
      const result = resolveValue(
        aliasEntry.variable.valuesByMode[firstModeId],
        aliasEntry.variable.resolvedType,
        depth + 1
      );
      seen.delete(aliasId);
      return result;
    }

    if (resolvedType === "COLOR" && modeValue && typeof modeValue === "object") {
      return rgbaToHex(modeValue);
    }
    if (resolvedType === "FLOAT" && typeof modeValue === "number") {
      return modeValue === 0 ? "0px" : `${modeValue}px`;
    }
    return String(modeValue ?? "");
  }

  // Map Figma resolvedType → token type string
  function tokenType(resolvedType, collectionName) {
    if (resolvedType === "COLOR")  return "color";
    if (resolvedType === "FLOAT")  return "dimension";
    if (resolvedType === "STRING") return "string";
    return "unknown";
  }

  // Build flat token map keyed by dot-path
  const flat = {};
  for (const [id, variable] of Object.entries(variables)) {
    const path = variable.name.replace(/\//g, ".");
    const collection = variableCollections[variable.variableCollectionId];
    const firstModeId = Object.keys(variable.valuesByMode)[0];
    const modeValue   = variable.valuesByMode[firstModeId];
    const value       = resolveValue(modeValue, variable.resolvedType);

    flat[path] = {
      $value: value,
      $type: tokenType(variable.resolvedType, collection?.name),
      ...(variable.description ? { $description: variable.description } : {}),
    };
  }

  // Nest the flat dot-paths into a deep object
  const result = {};
  for (const [dotPath, token] of Object.entries(flat)) {
    const parts = dotPath.split(".");
    let node = result;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!node[parts[i]]) node[parts[i]] = {};
      node = node[parts[i]];
    }
    node[parts[parts.length - 1]] = token;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

(async () => {
  const apiUrl = `https://api.figma.com/v1/files/${FIGMA_FILE_KEY}/variables/local`;

  console.log("Fetching variables from Figma...");
  let apiResponse;
  try {
    const res = await fetch(apiUrl, {
      headers: { "X-Figma-Token": FIGMA_TOKEN },
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`Figma API error ${res.status}: ${body}`);
      process.exit(1);
    }

    apiResponse = await res.json();
  } catch (err) {
    console.error(`Network error while fetching from Figma: ${err.message}`);
    process.exit(1);
  }

  console.log("Transforming tokens...");
  let tokens;
  try {
    tokens = transformFigmaVariables(apiResponse);
  } catch (err) {
    console.error(`Error transforming Figma response: ${err.message}`);
    process.exit(1);
  }

  if (dryRun) {
    console.log("--dry-run: transformed tokens (not written to disk):");
    console.log(JSON.stringify(tokens, null, 2));
    return;
  }

  const tokensPath = join(root, "src", "data", "tokens.json");
  const exportPath = join(root, "figma-export.json");

  console.log("Writing src/data/tokens.json...");
  writeFileSync(tokensPath, JSON.stringify(tokens, null, 2) + "\n", "utf8");

  writeFileSync(exportPath, JSON.stringify(apiResponse, null, 2) + "\n", "utf8");

  console.log("Done.");
})();
