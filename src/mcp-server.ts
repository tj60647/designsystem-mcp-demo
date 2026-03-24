/**
 * Design System MCP — MCP Server & Tool Definitions
 * Author: Thomas J McLeish
 * License: MIT
 *
 * This module defines the MCP server and registers all the "tools" that
 * AI clients can call. Think of each tool as a typed API endpoint that
 * returns structured design system data in response to a natural-language
 * or programmatic request.
 *
 * ── What is a "tool"? ────────────────────────────────────────────────────
 * In MCP, a tool is a named function with:
 *   - A description (tells the AI what the tool does and when to use it)
 *   - An input schema (defines what arguments the AI may pass, using Zod)
 *   - A handler (the function that does the actual work and returns data)
 *
 * When an AI client sends a request like "what is the primary button's
 * background color?", it can call the get_component tool with
 * componentName="button" and then read the tokens from the response.
 *
 * ── Tools in this file ───────────────────────────────────────────────────
 *   list_token_categories      — what token groups exist (color, spacing…)
 *   get_tokens                 — full token tree for a category
 *   get_token                  — single token looked up by dot-path
 *   list_components            — all components with names + descriptions
 *   get_component              — full spec for one component
 *   get_component_tokens       — all token references a component uses
 *   validate_color             — does a hex/rgb value match a named token?
 *   get_component_constraints  — usage rules for a component
 *   validate_component_usage   — validate props/config against component rules
 *   suggest_token              — suggest best token for a described intent
 *   diff_against_system        — compare CSS props to design tokens
 *   search                     — full-text search across tokens, components, icons
 *   get_schema                 — JSON Schema for a data file (tokens/components/themes/icons)
 * ──────────────────────────────────────────────────────────────────────────
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getData } from "./dataStore.js";
import { DATA_SCHEMAS } from "./schemas.js";

// ── Types ─────────────────────────────────────────────────────────────────
// Minimal type definitions that describe the shapes of the JSON data files.
// ─────────────────────────────────────────────────────────────────────────

/** A leaf entry in the token tree — has a value and a type. */
interface TokenEntry {
  value: string;
  type: string;
  description?: string;
  resolvedValue?: string;
}

/** A node in the token tree: either a leaf TokenEntry or a nested object. */
type TokenNode = TokenEntry | Record<string, unknown>;

/** The top-level tokens data file shape. */
interface TokensData {
  color:        Record<string, TokenNode>;
  typography:   Record<string, TokenNode>;
  spacing:      Record<string, TokenNode>;
  borderRadius: Record<string, TokenNode>;
  shadow:       Record<string, TokenNode>;
  motion:       Record<string, TokenNode>;
  layout:       Record<string, TokenNode>;
}

/** A single theme specification as defined in themes.json. */
interface ThemeSpec {
  name: string;
  description: string;
  semantic: Record<string, string>;
}
/** The top-level themes data file shape. */
interface ThemesData {
  [themeKey: string]: ThemeSpec;
}
/** A single icon specification as defined in icons.json. */
interface IconSpec {
  name: string;
  category: string;
  keywords: string[];
  sizes: number[];
  description: string;
}
/** The top-level icons data file shape. */
interface IconsData {
  [iconKey: string]: IconSpec;
}

/** A full component specification as defined in components.json. */
interface ComponentSpec {
  name:          string;
  description:   string;
  variants?:     string[];
  sizes?:        string[];
  states?:       string[];
  props?:        Record<string, unknown>;
  tokens?:       Record<string, unknown>;
  constraints?:  string[];
  accessibility?: Record<string, unknown>;
}

/** The top-level components data file shape. */
interface ComponentsData {
  [componentKey: string]: ComponentSpec;
}

// ── Utility: navigate nested objects by dot-path ─────────────────────────
// Turns a string like "color.primary.600" into a traversal:
//   tokens["color"]["primary"]["600"]
// Returns undefined if any key in the chain is missing.
// ─────────────────────────────────────────────────────────────────────────
function getByPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    if (current !== null && typeof current === "object") {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

// ── Utility: flatten all token leaf values ───────────────────────────────
// Walks the entire token tree and builds a flat map of:
//   "color.primary.600" → "#2563eb"
// Used by validate_color to do a reverse lookup (value → token name).
// ─────────────────────────────────────────────────────────────────────────
function flattenTokenValues(
  obj: Record<string, unknown>,
  prefix = ""
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, val] of Object.entries(obj)) {
    const fullPath = prefix ? `${prefix}.${key}` : key;

    if (val !== null && typeof val === "object" && "value" in (val as object)) {
      // This is a leaf token entry — record its value.
      result[fullPath] = (val as TokenEntry).value;
    } else if (val !== null && typeof val === "object") {
      // This is a nested category — recurse into it.
      Object.assign(
        result,
        flattenTokenValues(val as Record<string, unknown>, fullPath)
      );
    }
  }

  return result;
}

// ── Utility: extract all {token.reference} strings from an object ─────────
// Design token references are written as "{color.primary.600}" in the
// component token definitions. This helper collects all such strings from
// any nested object.
// ─────────────────────────────────────────────────────────────────────────
function extractTokenRefs(obj: unknown, refs: Set<string>): void {
  if (typeof obj === "string" && obj.startsWith("{") && obj.endsWith("}")) {
    // Strip the { } braces to get the path: "color.primary.600"
    refs.add(obj.slice(1, -1));
  } else if (obj !== null && typeof obj === "object") {
    for (const val of Object.values(obj as Record<string, unknown>)) {
      extractTokenRefs(val, refs);
    }
  }
}

// ── Utility: flatten token tree preserving metadata ─────────────────────
// Like flattenTokenValues but also returns type and description for each leaf.
// ─────────────────────────────────────────────────────────────────────────
function flattenAllTokens(
  obj: Record<string, unknown>,
  prefix = ""
): Record<string, { value: string; type: string; description?: string }> {
  const result: Record<string, { value: string; type: string; description?: string }> = {};

  for (const [key, val] of Object.entries(obj)) {
    const fullPath = prefix ? `${prefix}.${key}` : key;

    if (val !== null && typeof val === "object" && "value" in (val as object)) {
      const entry = val as TokenEntry;
      result[fullPath] = {
        value: entry.value,
        type: entry.type,
        ...(entry.description ? { description: entry.description } : {}),
      };
    } else if (val !== null && typeof val === "object") {
      Object.assign(
        result,
        flattenAllTokens(val as Record<string, unknown>, fullPath)
      );
    }
  }

  return result;
}

// ── MCP Server factory ────────────────────────────────────────────────────
// Returns a fully configured McpServer with all tools registered.
// Called once per HTTP request — stateless, no shared state between calls.
// Data is read from the shared dataStore on each call so that any JSON
// loaded via POST /api/data is immediately reflected in tool responses.
// ─────────────────────────────────────────────────────────────────────────
export function createMcpServer(): McpServer {
  // Snapshot the current store state for this request.
  const tokens     = getData("tokens")     as TokensData;
  const components = getData("components") as ComponentsData;
  const themes     = getData("themes")     as ThemesData;
  const icons      = getData("icons")      as IconsData;

  const server = new McpServer({
    name: "design-system-mcp",
    version: "0.1.0",
  });

  // ── TOOL: list_token_categories ─────────────────────────────────────────
  // Returns the names of all top-level token categories.
  // Good starting point for an AI exploring the design system.
  // ───────────────────────────────────────────────────────────────────────
  server.tool(
    "list_token_categories",
    "List all top-level token categories available in the design system (e.g. color, typography, spacing, borderRadius, shadow). Use this first to discover what token data is available before calling get_tokens.",
    {},
    async () => {
      const categories = Object.keys(tokens);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ categories }, null, 2),
          },
        ],
      };
    }
  );

  // ── TOOL: get_tokens ────────────────────────────────────────────────────
  // Returns the complete token tree for a given category, or the entire
  // token set if no category is specified.
  //
  // The tree uses nested JSON — for example, under "color" you'll find
  // sub-groups like "primary", "neutral", "semantic", etc.
  // ───────────────────────────────────────────────────────────────────────
  server.tool(
    "get_tokens",
    "Get design tokens by category (color, typography, spacing, borderRadius, shadow). Returns the full nested token tree for that category. Omit category to get all tokens at once.",
    {
      category: z
        .enum(["color", "typography", "spacing", "borderRadius", "shadow", "motion", "layout"])
        .optional()
        .describe(
          'Optional token category. If omitted, all tokens are returned. Example: "color"'
        ),
    },
    async ({ category }) => {
      if (category && !(category in tokens)) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Category "${category}" not found. Available: ${Object.keys(tokens).join(", ")}`,
            },
          ],
          isError: true,
        };
      }

      const data = category ? tokens[category] : tokens;
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(data, null, 2),
          },
        ],
      };
    }
  );

  // ── TOOL: get_token ─────────────────────────────────────────────────────
  // Looks up a single token by its dot-notation path.
  // Examples:
  //   "color.primary.600"           → { value: "#2563eb", type: "color" }
  //   "spacing.4"                   → { value: "16px", type: "dimension" }
  //   "typography.fontFamily.sans"  → { value: "Inter, system-ui, …" }
  //   "color.semantic.action.primary" → resolves to the primary action color
  // ───────────────────────────────────────────────────────────────────────
  server.tool(
    "get_token",
    'Get a single token by its dot-notation path. Examples: "color.primary.600", "spacing.4", "typography.fontFamily.sans", "color.semantic.text.primary". Returns the token entry including value, type, and description if available.',
    {
      tokenPath: z
        .string()
        .min(1)
        .describe(
          'Dot-notation path to the token. Example: "color.primary.600"'
        ),
    },
    async ({ tokenPath }) => {
      const value = getByPath(tokens as unknown as Record<string, unknown>, tokenPath);

      if (value === undefined) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Token "${tokenPath}" not found. Use list_token_categories and get_tokens to explore the available tokens.`,
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ path: tokenPath, token: value }, null, 2),
          },
        ],
      };
    }
  );

  // ── TOOL: list_components ───────────────────────────────────────────────
  // Returns a summary of all components in the design system: their key,
  // display name, description, available variants, and available sizes.
  // Use this to discover what components exist before calling get_component.
  // ───────────────────────────────────────────────────────────────────────
  server.tool(
    "list_components",
    "List all components in the design system with their names, descriptions, available variants, and sizes. Use this to discover what components are available before calling get_component.",
    {},
    async () => {
      const summary = Object.entries(components).map(([key, spec]) => ({
        key,
        name:        spec.name,
        description: spec.description,
        variants:    spec.variants ?? [],
        sizes:       spec.sizes ?? [],
      }));

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ components: summary }, null, 2),
          },
        ],
      };
    }
  );

  // ── TOOL: get_component ─────────────────────────────────────────────────
  // Returns the full specification for a named component, including:
  //   - props and their types/defaults
  //   - token references (what design tokens it consumes)
  //   - usage constraints (rules the component enforces)
  //   - accessibility requirements
  // ───────────────────────────────────────────────────────────────────────
  server.tool(
    "get_component",
    'Get the complete specification for a design system component. Returns props, variants, sizes, token references, usage constraints, and accessibility requirements. Example componentName values: "button", "input", "card", "badge".',
    {
      componentName: z
        .string()
        .min(1)
        .describe(
          'The component key or name (case-insensitive). Examples: "button", "input", "card", "badge".'
        ),
    },
    async ({ componentName }) => {
      const key  = componentName.toLowerCase().trim();
      const spec = components[key];

      if (!spec) {
        const available = Object.keys(components).join(", ");
        return {
          content: [
            {
              type: "text" as const,
              text: `Component "${componentName}" not found. Available components: ${available}`,
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(spec, null, 2),
          },
        ],
      };
    }
  );

  // ── TOOL: get_component_tokens ──────────────────────────────────────────
  // Extracts and lists every token reference (e.g. "{color.primary.600}")
  // used by a given component. Useful for understanding a component's full
  // token dependency graph — e.g. for theming or audit work.
  // ───────────────────────────────────────────────────────────────────────
  server.tool(
    "get_component_tokens",
    'Get all design token references used by a specific component. Returns a deduplicated, sorted list of token paths the component depends on, plus the raw token definitions for context. Example: "button" returns all color, spacing, and typography tokens it references.',
    {
      componentName: z
        .string()
        .min(1)
        .describe('The component key (e.g. "button", "input", "card").'),
    },
    async ({ componentName }) => {
      const key  = componentName.toLowerCase().trim();
      const spec = components[key];

      if (!spec) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Component "${componentName}" not found. Available: ${Object.keys(components).join(", ")}`,
            },
          ],
          isError: true,
        };
      }

      // Walk the component's token definitions and collect every {ref} string.
      const tokenRefs = new Set<string>();
      extractTokenRefs(spec.tokens, tokenRefs);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                component: spec.name,
                // Sorted alphabetically for easy reading
                tokenReferences: Array.from(tokenRefs).sort(),
                rawTokenDefinitions: spec.tokens,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // ── TOOL: validate_color ─────────────────────────────────────────────────
  // Checks whether a CSS color value (hex, rgb, etc.) corresponds to a
  // named token in the color token set.
  //
  // This enforces the constraint that UI should only use token-backed colors,
  // not arbitrary values. Returns matching token paths if found, or flags
  // the value as non-token-compliant if not found.
  //
  // Note: comparison is case-insensitive and exact — partial matches are
  // not returned.
  // ───────────────────────────────────────────────────────────────────────
  server.tool(
    "validate_color",
    'Check whether a CSS color value (like "#2563eb" or "rgb(37,99,235)") maps to a named token in the design system. Returns the matching token paths if it is a recognized token value, or flags it as an arbitrary (non-compliant) color if not found.',
    {
      colorValue: z
        .string()
        .min(1)
        .describe(
          'A CSS color value to look up. Examples: "#2563eb", "#ffffff", "rgb(37, 99, 235)".'
        ),
    },
    async ({ colorValue }) => {
      const normalized = colorValue.trim().toLowerCase();

      // Build a flat map of all color token values for reverse lookup.
      const colorFlat = flattenTokenValues(
        tokens.color as unknown as Record<string, unknown>,
        "color"
      );

      const matches = Object.entries(colorFlat)
        .filter(([, val]) => val.toLowerCase() === normalized)
        .map(([path, val]) => ({ tokenPath: path, value: val }));

      if (matches.length > 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  input:          colorValue,
                  compliant:      true,
                  matchingTokens: matches,
                  message:
                    "This color value is a recognized design token. Use the token path instead of the raw value in production code.",
                },
                null,
                2
              ),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                input:          colorValue,
                compliant:      false,
                matchingTokens: [],
                message:
                  "This color is not part of the design token system. Replace it with a named token (e.g. color.primary.600) to stay compliant with system standards.",
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // ── TOOL: get_component_constraints ────────────────────────────────────
  // Returns the human-readable list of usage constraints and accessibility
  // requirements for a component. These are the rules the design system
  // enforces — e.g. "always pair an input with a label", or "the destructive
  // variant must only be used for irreversible actions".
  // ───────────────────────────────────────────────────────────────────────
  server.tool(
    "get_component_constraints",
    'Get the usage constraints and accessibility requirements for a design system component. These are the enforceable rules the system defines for correct component usage. Example: "button" returns rules about variant usage, loading states, touch targets, and ARIA attributes.',
    {
      componentName: z
        .string()
        .min(1)
        .describe('The component key (e.g. "button", "input", "card", "badge").'),
    },
    async ({ componentName }) => {
      const key  = componentName.toLowerCase().trim();
      const spec = components[key];

      if (!spec) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Component "${componentName}" not found. Available: ${Object.keys(components).join(", ")}`,
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                component:       spec.name,
                constraints:     spec.constraints ?? [],
                accessibility:   spec.accessibility ?? {},
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // ── TOOL: validate_component_usage ────────────────────────────────────
  // Checks a component configuration (variant, size, state, props) against
  // the design system rules and returns any violations found.
  // ───────────────────────────────────────────────────────────────────────
  server.tool(
    "validate_component_usage",
    "Validate whether a component configuration is valid according to the design system rules. Pass the component name and a props/config object to check. Returns a list of violations (if any) and a pass/fail result.",
    {
      componentName: z.string().min(1).describe('Component key, e.g. "button", "input".'),
      config: z.record(z.unknown()).describe('Props/config object to validate, e.g. { variant: "primary", size: "xl" }.'),
    },
    async ({ componentName, config }) => {
      const key  = componentName.toLowerCase().trim();
      const spec = components[key];

      if (!spec) {
        return {
          content: [{ type: "text" as const, text: `Component "${componentName}" not found. Available: ${Object.keys(components).join(", ")}` }],
          isError: true,
        };
      }

      const violations: string[] = [];

      if (config.variant !== undefined && spec.variants) {
        if (!spec.variants.includes(String(config.variant))) {
          violations.push(
            `Variant "${config.variant}" is not valid for ${spec.name}. Allowed variants: ${spec.variants.join(", ")}.`
          );
        }
      }

      if (config.size !== undefined && spec.sizes) {
        if (!spec.sizes.includes(String(config.size))) {
          violations.push(
            `Size "${config.size}" is not valid for ${spec.name}. Allowed sizes: ${spec.sizes.join(", ")}.`
          );
        }
      }

      if (config.state !== undefined && spec.states) {
        if (!spec.states.includes(String(config.state))) {
          violations.push(
            `State "${config.state}" is not valid for ${spec.name}. Allowed states: ${spec.states.join(", ")}.`
          );
        }
      }

      if (spec.props) {
        // Exclude keys that have their own dedicated validation above.
        const reservedKeys = new Set(["variant", "size", "state"]);
        for (const propKey of Object.keys(config)) {
          if (!reservedKeys.has(propKey) && !(propKey in spec.props)) {
            violations.push(
              `Unknown prop "${propKey}" — not defined in the ${spec.name} spec.`
            );
          }
        }
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                component:    spec.name,
                valid:        violations.length === 0,
                violations,
                checkedProps: Object.keys(config),
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // ── TOOL: suggest_token ─────────────────────────────────────────────────
  // Scores and ranks tokens by how well they match a natural-language intent.
  // ───────────────────────────────────────────────────────────────────────
  server.tool(
    "suggest_token",
    "Suggest the most appropriate design token for a described intent (e.g. 'primary button background', 'error text color', 'small spacing between icon and label'). Returns a ranked list of matching tokens with their values and paths.",
    {
      intent: z.string().min(1).describe('Natural-language description of what the token should be used for.'),
      category: z
        .enum(["color", "typography", "spacing", "borderRadius", "shadow", "motion", "layout"])
        .optional()
        .describe("Optionally restrict the search to a single token category."),
    },
    async ({ intent, category }) => {
      const intentLower = intent.toLowerCase();
      const intentWords = intentLower.split(/[\s\-_./]+/).filter(Boolean);

      // Build the flat token map to search — either one category or all.
      const source: Record<string, unknown> = category
        ? { [category]: tokens[category] }
        : (tokens as unknown as Record<string, unknown>);

      const flat = flattenAllTokens(source as Record<string, unknown>);

      const scored = Object.entries(flat).map(([tokenPath, meta]) => {
        const segments = tokenPath.toLowerCase().split(".");
        let score = 0;
        for (const word of intentWords) {
          for (const seg of segments) {
            if (seg.includes(word) || word.includes(seg)) score += 2;
          }
          if (meta.description) {
            const descWords = meta.description.toLowerCase().split(/\W+/);
            for (const dw of descWords) {
              if (dw && (dw.includes(word) || word.includes(dw))) score += 3;
            }
          }
        }
        return { tokenPath, value: meta.value, type: meta.type, description: meta.description ?? null, score };
      });

      const top5 = scored
        .filter(r => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

      if (top5.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { intent, results: [], message: "No tokens matched the given intent. Try different keywords or omit the category filter." },
                null,
                2
              ),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ intent, results: top5 }, null, 2),
          },
        ],
      };
    }
  );

  // ── TOOL: diff_against_system ───────────────────────────────────────────
  // Audits a map of CSS property→value pairs against all design tokens.
  // Flags non-token values and suggests the correct token to use.
  // ───────────────────────────────────────────────────────────────────────
  server.tool(
    "diff_against_system",
    "Compare a set of CSS properties or component props against the design system definitions. Flags values that don't match any token, and suggests the correct token to use instead. Useful for auditing generated or hand-written UI code.",
    {
      properties: z
        .record(z.string())
        .describe('Map of CSS property names to values, e.g. { "background-color": "#2563eb", "font-size": "14px" }.'),
    },
    async ({ properties }) => {
      // Build a reverse map: lowercased value → list of token paths.
      const allFlat = flattenAllTokens(tokens as unknown as Record<string, unknown>);
      const reverseMap: Record<string, string[]> = {};
      for (const [path, meta] of Object.entries(allFlat)) {
        const key = meta.value.toLowerCase();
        (reverseMap[key] ??= []).push(path);
      }

      const results = Object.entries(properties).map(([property, value]) => {
        const matches = reverseMap[value.toLowerCase()];
        if (matches && matches.length > 0) {
          return { property, value, status: "token-matched" as const, matchingTokens: matches };
        }
        return { property, value, status: "no-token-match" as const, suggestion: "Replace with a design token" };
      });

      const matched   = results.filter(r => r.status === "token-matched").length;
      const total     = results.length;
      const violations = total - matched;
      const compliant = violations === 0;

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                compliant,
                summary: `${matched} of ${total} properties match design tokens. ${violations} violation${violations === 1 ? "" : "s"} found.`,
                results,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // ── TOOL: search ────────────────────────────────────────────────────────
  // Full-text search across tokens, components, and icons.
  // ───────────────────────────────────────────────────────────────────────
  server.tool(
    "search",
    "Search across all design system tokens, components, and icons by keyword. Returns matching tokens, components, and icons ranked by relevance. Use this to discover the right token or component for a given term.",
    {
      query: z.string().min(1).describe("Search term, e.g. \"primary blue\" or \"modal overlay\"."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("Maximum number of results to return (default 10, max 50)."),
    },
    async ({ query, limit = 10 }) => {
      const queryWords = query.toLowerCase().split(/[\s\-_./,;:!?]+/).filter(Boolean);

      type SearchResult = { type: "token" | "component" | "icon"; key: string; score: number; preview: string };
      const results: SearchResult[] = [];

      // ── Tokens ──────────────────────────────────────────────────────────
      const flat = flattenAllTokens(tokens as unknown as Record<string, unknown>);
      for (const [tokenPath, meta] of Object.entries(flat)) {
        const segments = tokenPath.toLowerCase().split(".");
        let score = 0;
        for (const word of queryWords) {
          for (const seg of segments) {
            if (seg.includes(word) || word.includes(seg)) score += 2;
          }
          if (meta.description) {
            for (const dw of meta.description.toLowerCase().split(/\W+/)) {
              if (dw && (dw.includes(word) || word.includes(dw))) score += 3;
            }
          }
        }
        if (score > 0) {
          results.push({ type: "token", key: tokenPath, score, preview: meta.value });
        }
      }

      // Pre-compile word regexes once before iterating over components/icons.
      const wordRegexes = queryWords.map(w => new RegExp(w, "g"));

      // ── Components ───────────────────────────────────────────────────────
      for (const [compKey, spec] of Object.entries(components)) {
        const haystack = [
          spec.name,
          spec.description,
          ...(spec.variants ?? []),
          ...Object.keys(spec.props ?? {}),
          ...(spec.constraints ?? []),
        ].join(" ").toLowerCase();

        let score = 0;
        for (const re of wordRegexes) {
          re.lastIndex = 0;
          const count = (haystack.match(re) ?? []).length;
          score += count * 2;
        }
        if (score > 0) {
          results.push({ type: "component", key: compKey, score, preview: spec.description });
        }
      }

      // ── Icons ────────────────────────────────────────────────────────────
      for (const [iconKey, icon] of Object.entries(icons)) {
        const haystack = [
          icon.name,
          icon.category,
          icon.description,
          ...icon.keywords,
        ].join(" ").toLowerCase();

        let score = 0;
        for (const re of wordRegexes) {
          re.lastIndex = 0;
          const count = (haystack.match(re) ?? []).length;
          score += count * 2;
        }
        if (score > 0) {
          results.push({
            type: "icon",
            key: iconKey,
            score,
            preview: `${icon.category} icon — ${icon.description}`,
          });
        }
      }

      results.sort((a, b) => b.score - a.score);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ query, results: results.slice(0, limit) }, null, 2),
          },
        ],
      };
    }
  );

  // ── TOOL: get_schema ────────────────────────────────────────────────────
  // Returns the JSON Schema (draft-07) for one of the four data files.
  // Use this before loading custom JSON via POST /api/data to understand
  // the expected structure.  The demo UI uses this to show inline hints
  // in the "Load JSON" modal.
  // ───────────────────────────────────────────────────────────────────────
  server.tool(
    "get_schema",
    'Return the JSON Schema for a design system data file. Use this before loading custom data (via POST /api/data) to understand the expected structure. Valid dataType values: "tokens", "components", "themes", "icons".',
    {
      dataType: z
        .enum(["tokens", "components", "themes", "icons"])
        .describe('The data file whose schema you want. One of: "tokens", "components", "themes", "icons".'),
    },
    async ({ dataType }) => {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(DATA_SCHEMAS[dataType], null, 2),
          },
        ],
      };
    }
  );

  return server;
}
