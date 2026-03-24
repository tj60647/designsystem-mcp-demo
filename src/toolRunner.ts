/**
 * Design System MCP — Tool Runner
 *
 * Provides a single `runMcpTool(name, args)` function that executes any of the
 * 13 design-system tools and returns a plain string result. Used by the
 * /api/chat agentic loop to execute OpenRouter tool-call responses locally
 * without going through the full MCP JSON-RPC protocol.
 *
 * Data is read from the shared dataStore on every call so that JSON loaded
 * via POST /api/data is immediately reflected in chat tool responses.
 */

import { getData } from "./dataStore.js";
import { DATA_SCHEMAS } from "./schemas.js";

// ── Data ──────────────────────────────────────────────────────────────────
interface TokenEntry {
  value: string;
  type: string;
  description?: string;
}
type TokenNode = TokenEntry | Record<string, unknown>;
interface TokensData {
  color:        Record<string, TokenNode>;
  typography:   Record<string, TokenNode>;
  spacing:      Record<string, TokenNode>;
  borderRadius: Record<string, TokenNode>;
  shadow:       Record<string, TokenNode>;
  motion:       Record<string, TokenNode>;
  layout:       Record<string, TokenNode>;
}
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
interface ComponentsData { [key: string]: ComponentSpec; }
interface IconSpec {
  name: string; category: string; keywords: string[];
  sizes: number[]; description: string;
}
interface IconsData { [key: string]: IconSpec; }

// ── Utilities ─────────────────────────────────────────────────────────────

function getByPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((cur, key) => {
    if (cur !== null && typeof cur === "object") return (cur as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

function flattenTokenValues(obj: Record<string, unknown>, prefix = ""): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, val] of Object.entries(obj)) {
    const fp = prefix ? `${prefix}.${key}` : key;
    if (val !== null && typeof val === "object" && "value" in (val as object)) {
      result[fp] = (val as TokenEntry).value;
    } else if (val !== null && typeof val === "object") {
      Object.assign(result, flattenTokenValues(val as Record<string, unknown>, fp));
    }
  }
  return result;
}

function flattenAllTokens(
  obj: Record<string, unknown>, prefix = ""
): Record<string, { value: string; type: string; description?: string }> {
  const result: Record<string, { value: string; type: string; description?: string }> = {};
  for (const [key, val] of Object.entries(obj)) {
    const fp = prefix ? `${prefix}.${key}` : key;
    if (val !== null && typeof val === "object" && "value" in (val as object)) {
      const e = val as TokenEntry;
      result[fp] = { value: e.value, type: e.type, ...(e.description ? { description: e.description } : {}) };
    } else if (val !== null && typeof val === "object") {
      Object.assign(result, flattenAllTokens(val as Record<string, unknown>, fp));
    }
  }
  return result;
}

function extractTokenRefs(obj: unknown, refs: Set<string>): void {
  if (typeof obj === "string" && obj.startsWith("{") && obj.endsWith("}")) {
    refs.add(obj.slice(1, -1));
  } else if (obj !== null && typeof obj === "object") {
    for (const val of Object.values(obj as Record<string, unknown>)) extractTokenRefs(val, refs);
  }
}

// ── Tool runner ───────────────────────────────────────────────────────────

export async function runMcpTool(name: string, args: Record<string, unknown>): Promise<string> {
  // Read the current store state on each call so that any JSON loaded via
  // POST /api/data is reflected immediately in chat tool responses.
  const tokens     = getData("tokens")     as TokensData;
  const components = getData("components") as ComponentsData;
  const icons      = getData("icons")      as IconsData;

  switch (name) {

    case "list_token_categories": {
      return JSON.stringify({ categories: Object.keys(tokens) }, null, 2);
    }

    case "get_tokens": {
      const category = args.category as string | undefined;
      if (category && !(category in tokens)) {
        return `Category "${category}" not found. Available: ${Object.keys(tokens).join(", ")}`;
      }
      const data = category ? tokens[category as keyof TokensData] : tokens;
      return JSON.stringify(data, null, 2);
    }

    case "get_token": {
      const tokenPath = args.tokenPath as string;
      const value = getByPath(tokens as unknown as Record<string, unknown>, tokenPath);
      if (value === undefined) {
        return `Token "${tokenPath}" not found. Use list_token_categories and get_tokens to explore available tokens.`;
      }
      return JSON.stringify({ path: tokenPath, token: value }, null, 2);
    }

    case "list_components": {
      const summary = Object.entries(components).map(([key, spec]) => ({
        key,
        name:        spec.name,
        description: spec.description,
        variants:    spec.variants ?? [],
        sizes:       spec.sizes ?? [],
      }));
      return JSON.stringify({ components: summary }, null, 2);
    }

    case "get_component": {
      const key  = (args.componentName as string).toLowerCase().trim();
      const spec = components[key];
      if (!spec) {
        return `Component "${args.componentName}" not found. Available: ${Object.keys(components).join(", ")}`;
      }
      return JSON.stringify(spec, null, 2);
    }

    case "get_component_tokens": {
      const key  = (args.componentName as string).toLowerCase().trim();
      const spec = components[key];
      if (!spec) {
        return `Component "${args.componentName}" not found. Available: ${Object.keys(components).join(", ")}`;
      }
      const refs = new Set<string>();
      extractTokenRefs(spec.tokens, refs);
      return JSON.stringify({
        component: spec.name,
        tokenReferences: Array.from(refs).sort(),
        rawTokenDefinitions: spec.tokens,
      }, null, 2);
    }

    case "validate_color": {
      const colorValue  = args.colorValue as string;
      const normalized  = colorValue.trim().toLowerCase();
      const colorFlat   = flattenTokenValues(tokens.color as unknown as Record<string, unknown>, "color");
      const matches     = Object.entries(colorFlat)
        .filter(([, v]) => v.toLowerCase() === normalized)
        .map(([path, val]) => ({ tokenPath: path, value: val }));

      if (matches.length > 0) {
        return JSON.stringify({ input: colorValue, compliant: true, matchingTokens: matches,
          message: "This color value is a recognized design token. Use the token path instead of the raw value in production code." }, null, 2);
      }
      return JSON.stringify({ input: colorValue, compliant: false, matchingTokens: [],
        message: "This color is not part of the design token system. Replace it with a named token (e.g. color.primary.600) to stay compliant." }, null, 2);
    }

    case "get_component_constraints": {
      const key  = (args.componentName as string).toLowerCase().trim();
      const spec = components[key];
      if (!spec) {
        return `Component "${args.componentName}" not found. Available: ${Object.keys(components).join(", ")}`;
      }
      return JSON.stringify({ component: spec.name, constraints: spec.constraints ?? [], accessibility: spec.accessibility ?? {} }, null, 2);
    }

    case "validate_component_usage": {
      const key    = (args.componentName as string).toLowerCase().trim();
      const spec   = components[key];
      const config = (args.config ?? {}) as Record<string, unknown>;

      if (!spec) {
        return `Component "${args.componentName}" not found. Available: ${Object.keys(components).join(", ")}`;
      }

      const violations: string[] = [];
      if (config.variant !== undefined && spec.variants) {
        if (!spec.variants.includes(String(config.variant))) {
          violations.push(`Variant "${config.variant}" is not valid for ${spec.name}. Allowed: ${spec.variants.join(", ")}.`);
        }
      }
      if (config.size !== undefined && spec.sizes) {
        if (!spec.sizes.includes(String(config.size))) {
          violations.push(`Size "${config.size}" is not valid for ${spec.name}. Allowed: ${spec.sizes.join(", ")}.`);
        }
      }
      if (config.state !== undefined && spec.states) {
        if (!spec.states.includes(String(config.state))) {
          violations.push(`State "${config.state}" is not valid for ${spec.name}. Allowed: ${spec.states.join(", ")}.`);
        }
      }
      if (spec.props) {
        const reserved = new Set(["variant", "size", "state"]);
        for (const propKey of Object.keys(config)) {
          if (!reserved.has(propKey) && !(propKey in spec.props)) {
            violations.push(`Unknown prop "${propKey}" — not defined in the ${spec.name} spec.`);
          }
        }
      }
      return JSON.stringify({ component: spec.name, valid: violations.length === 0, violations, checkedProps: Object.keys(config) }, null, 2);
    }

    case "suggest_token": {
      const intent      = args.intent as string;
      const category    = args.category as string | undefined;
      const intentWords = intent.toLowerCase().split(/[\s\-_./]+/).filter(Boolean);
      const source: Record<string, unknown> = category
        ? { [category]: tokens[category as keyof TokensData] }
        : (tokens as unknown as Record<string, unknown>);

      const flat   = flattenAllTokens(source);
      const scored = Object.entries(flat).map(([tokenPath, meta]) => {
        const segs = tokenPath.toLowerCase().split(".");
        let score  = 0;
        for (const word of intentWords) {
          for (const seg of segs) if (seg.includes(word) || word.includes(seg)) score += 2;
          if (meta.description) {
            for (const dw of meta.description.toLowerCase().split(/\W+/)) {
              if (dw && (dw.includes(word) || word.includes(dw))) score += 3;
            }
          }
        }
        return { tokenPath, value: meta.value, type: meta.type, description: meta.description ?? null, score };
      });

      const top5 = scored.filter(r => r.score > 0).sort((a, b) => b.score - a.score).slice(0, 5);
      if (top5.length === 0) {
        return JSON.stringify({ intent, results: [], message: "No tokens matched. Try different keywords." }, null, 2);
      }
      return JSON.stringify({ intent, results: top5 }, null, 2);
    }

    case "diff_against_system": {
      const properties = (args.properties ?? {}) as Record<string, string>;
      const allFlat    = flattenAllTokens(tokens as unknown as Record<string, unknown>);
      const reverseMap: Record<string, string[]> = {};
      for (const [path, meta] of Object.entries(allFlat)) {
        (reverseMap[meta.value.toLowerCase()] ??= []).push(path);
      }
      const results = Object.entries(properties).map(([property, value]) => {
        const matches = reverseMap[value.toLowerCase()];
        if (matches && matches.length > 0) return { property, value, status: "token-matched" as const, matchingTokens: matches };
        return { property, value, status: "no-token-match" as const, suggestion: "Replace with a design token" };
      });
      const matched    = results.filter(r => r.status === "token-matched").length;
      const total      = results.length;
      const violations = total - matched;
      return JSON.stringify({
        compliant: violations === 0,
        summary: `${matched} of ${total} properties match design tokens. ${violations} violation${violations === 1 ? "" : "s"} found.`,
        results,
      }, null, 2);
    }

    case "search": {
      const query      = args.query as string;
      const limit      = (args.limit as number | undefined) ?? 10;
      const queryWords = query.toLowerCase().split(/[\s\-_./,;:!?]+/).filter(Boolean);

      type SR = { type: "token" | "component" | "icon"; key: string; score: number; preview: string };
      const results: SR[] = [];

      const flat = flattenAllTokens(tokens as unknown as Record<string, unknown>);
      for (const [tokenPath, meta] of Object.entries(flat)) {
        const segs = tokenPath.toLowerCase().split(".");
        let score  = 0;
        for (const word of queryWords) {
          for (const seg of segs) if (seg.includes(word) || word.includes(seg)) score += 2;
          if (meta.description) {
            for (const dw of meta.description.toLowerCase().split(/\W+/)) {
              if (dw && (dw.includes(word) || word.includes(dw))) score += 3;
            }
          }
        }
        if (score > 0) results.push({ type: "token", key: tokenPath, score, preview: meta.value });
      }

      const wordRegexes = queryWords.map(w => new RegExp(w, "g"));

      for (const [compKey, spec] of Object.entries(components)) {
        const haystack = [spec.name, spec.description, ...(spec.variants ?? []), ...Object.keys(spec.props ?? {}), ...(spec.constraints ?? [])].join(" ").toLowerCase();
        let score = 0;
        for (const re of wordRegexes) { re.lastIndex = 0; score += (haystack.match(re) ?? []).length * 2; }
        if (score > 0) results.push({ type: "component", key: compKey, score, preview: spec.description });
      }

      for (const [iconKey, icon] of Object.entries(icons)) {
        const haystack = [icon.name, icon.category, icon.description, ...icon.keywords].join(" ").toLowerCase();
        let score = 0;
        for (const re of wordRegexes) { re.lastIndex = 0; score += (haystack.match(re) ?? []).length * 2; }
        if (score > 0) results.push({ type: "icon", key: iconKey, score, preview: `${icon.category} icon — ${icon.description}` });
      }

      results.sort((a, b) => b.score - a.score);
      return JSON.stringify({ query, results: results.slice(0, limit) }, null, 2);
    }

    case "get_schema": {
      const dataType = args.dataType as string;
      if (!(dataType in DATA_SCHEMAS)) {
        return JSON.stringify({ error: `Unknown dataType "${dataType}". Valid values: tokens, components, themes, icons.` });
      }
      return JSON.stringify(DATA_SCHEMAS[dataType], null, 2);
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}
