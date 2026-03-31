/**
 * generate-tokens.mjs
 *
 * Style-Dictionary-inspired script that transforms figma-export.json (the
 * simulated Figma plugin export at the repo root) into src/data/tokens.json.
 *
 * Features:
 *   - Reads all variable collections from figma-export.json
 *   - Converts slash-delimited variable names to dot-path token keys
 *   - Maps Figma value types: COLOR → hex string, FLOAT → "Npx", STRING → string
 *   - Resolves $alias references and stores them as alias reference strings
 *     (e.g. {color.neutral.0}); resolved values are computed at the tool layer
 *   - Picks the Light mode (or Default if no Light mode exists) as canonical value
 *
 * Usage:
 *   node scripts/generate-tokens.mjs
 *
 * Author: Thomas J McLeish
 * License: MIT
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { dirname, join }                            from "path";
import { fileURLToPath }                            from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const root       = join(__dirname, "..");

// ---------------------------------------------------------------------------
// Load figma-export.json
// ---------------------------------------------------------------------------
const exportPath = join(root, "figma-export.json");
if (!existsSync(exportPath)) {
  console.error("Error: figma-export.json not found at repo root.");
  console.error("Run the Figma export plugin or fetch from Figma to generate it.");
  process.exit(1);
}

let figmaExport;
try {
  figmaExport = JSON.parse(readFileSync(exportPath, "utf8"));
} catch (err) {
  console.error(`Error: could not parse figma-export.json — ${err.message}`);
  process.exit(1);
}

if (!figmaExport.variables || !figmaExport.variables.collections) {
  console.error("Error: figma-export.json is missing the expected variables.collections structure.");
  process.exit(1);
}

console.log("Reading figma-export.json...");

// ---------------------------------------------------------------------------
// Step 1: Flatten all variables across collections into a lookup by path
//         e.g. "color/blue/50" → { type, rawValue, collectionName }
// ---------------------------------------------------------------------------

/**
 * Pick the canonical mode value from a variable's value map.
 * Priority: "Light" > "Default" > first key.
 */
function pickModeValue(valueMap) {
  if (valueMap["Light"]   !== undefined) return valueMap["Light"];
  if (valueMap["Default"] !== undefined) return valueMap["Default"];
  const firstKey = Object.keys(valueMap)[0];
  return firstKey !== undefined ? valueMap[firstKey] : undefined;
}

/**
 * Convert a Figma variable value to the tokens.json value string.
 *   - COLOR (string)  → as-is  (already "#rrggbb" in the export)
 *   - FLOAT (number)  → "Npx"
 *   - STRING          → string as-is
 */
function primitiveToTokenValue(rawValue, figmaType) {
  if (figmaType === "FLOAT" && typeof rawValue === "number") {
    return rawValue === 0 ? "0px" : `${rawValue}px`;
  }
  return String(rawValue);
}

/**
 * Map Figma type string to the tokens.json `type` field.
 */
function figmaTypeToTokenType(figmaType) {
  if (figmaType === "COLOR")  return "color";
  if (figmaType === "FLOAT")  return "dimension";
  if (figmaType === "STRING") return "string";
  return "unknown";
}

// Build a flat map from slash-path → { figmaType, modeValue, collectionName }
const allVariables = {};
for (const [collectionName, collection] of Object.entries(figmaExport.variables.collections)) {
  if (collectionName.startsWith("_")) continue; // skip comment keys
  const variables = collection.variables ?? {};
  for (const [varName, varDef] of Object.entries(variables)) {
    const modeValue = pickModeValue(varDef.value ?? {});
    allVariables[varName] = {
      figmaType:      varDef.type,
      modeValue,
      collectionName,
      description:    varDef.description,
    };
  }
}

// ---------------------------------------------------------------------------
// Step 2: Resolve an alias chain to its concrete primitive value
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Step 3: Convert each variable to a token entry
// ---------------------------------------------------------------------------
console.log("Transforming tokens...");

/** Convert "color/blue/50" → "color.blue.50" */
function slashToDot(path) {
  return path.replace(/\//g, ".");
}

/** Nest a flat dot-path into a deep object */
function setDeep(obj, dotPath, value) {
  const parts = dotPath.split(".");
  let node = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!node[parts[i]]) node[parts[i]] = {};
    node = node[parts[i]];
  }
  node[parts[parts.length - 1]] = value;
}

const tokens = {};

for (const [varName, { figmaType, modeValue, description }] of Object.entries(allVariables)) {
  const dotPath   = slashToDot(varName);
  const tokenType = figmaTypeToTokenType(figmaType);

  let tokenEntry;

  if (modeValue && typeof modeValue === "object" && "$alias" in modeValue) {
    // Alias token: $value is a reference string; resolved values are computed at the tool layer
    const aliasRef = slashToDot(modeValue["$alias"]);
    tokenEntry = {
      $value:      `{${aliasRef}}`,
      $type:       tokenType,
      ...(description ? { $description: description } : {}),
    };
  } else {
    // Primitive token
    const value = primitiveToTokenValue(modeValue, figmaType);
    tokenEntry = {
      $value: value,
      $type:  tokenType,
      ...(description ? { $description: description } : {}),
    };
  }

  setDeep(tokens, dotPath, tokenEntry);
}

// ---------------------------------------------------------------------------
// Step 4: Write output
// ---------------------------------------------------------------------------
const tokensPath = join(root, "src", "data", "tokens.json");
console.log("Writing src/data/tokens.json...");
try {
  writeFileSync(tokensPath, JSON.stringify(tokens, null, 2) + "\n", "utf8");
} catch (err) {
  console.error(`Error writing src/data/tokens.json: ${err.message}`);
  process.exit(1);
}

console.log("Done.");
