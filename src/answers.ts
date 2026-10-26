/**
 * What three tools answer, shared by the MCP server (mcp-server.ts) and the demo's chat agent
 * (toolRunner.ts) so the two can never answer differently:
 *   rankTokens       suggest_token's ranking of tokens for a described intent
 *   validateUsage    validate_component_usage's violations
 *   componentNotFound  the answer when a component is not in the system
 */

export interface FlatToken { value: string; type: string; description?: string }

export interface RankedToken {
  tokenPath: string;
  value: string;
  type: string;
  description: string | null;
  score: number;
}

// Words that say nothing about what a token is for.
const STOPWORDS = new Set("a an the and or of for to in on at by with as is it its be that this what which when where how use var css ds token tokens value".split(" "));
// What a token's path abbreviates, in the words a person would use.
const SPELLED_OUT: Record<string, string[]> = { bg: ["background"], sm: ["small"] };

// Plurals match their singular: "buttons" is "button", "captions" is "caption".
const stem = (w: string) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);
const wordsOf = (text: string) => text
  .replace(/([a-z])([A-Z])/g, "$1 $2")
  .toLowerCase()
  .split(/[^a-z0-9]+/)
  .filter((w) => w.length >= 2 && !STOPWORDS.has(w))
  .map(stem);

/**
 * The five tokens that best fit the intent, best first; none when nothing matches.
 * Whole words only. Each word of the intent counts by how rare it is among the tokens (so
 * "color" weighs little and "error" a lot), double when it is in the token's path, and a token
 * is scaled by how much of the intent it covers.
 */
export function rankTokens(flat: Record<string, FlatToken>, intent: string): RankedToken[] {
  const asked = [...new Set(wordsOf(intent))];
  if (!asked.length) return [];
  const entries = Object.entries(flat).map(([tokenPath, meta]) => {
    // The first segment is the category, shared by every token in it, so it counts as little as
    // the description; the rest of the path names this token.
    const [category, ...name] = tokenPath.split(".");
    const path = new Set(wordsOf(name.join(".")).flatMap((w) => [w, ...(SPELLED_OUT[w] ?? [])]));
    const all = new Set([...path, ...wordsOf(category), ...wordsOf(meta.description ?? "")]);
    return { tokenPath, meta, path, all };
  });
  const rarity = (w: string) => Math.log(1 + entries.length / Math.max(1, entries.filter((e) => e.all.has(w)).length));
  return entries
    .map(({ tokenPath, meta, path, all }) => {
      const found = asked.filter((w) => all.has(w));
      const weight = found.reduce((sum, w) => sum + rarity(w) * (path.has(w) ? 2 : 1), 0);
      const score = Math.round((weight * found.length / asked.length) * 100) / 100;
      return { tokenPath, value: meta.value, type: meta.type, description: meta.description ?? null, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.tokenPath.localeCompare(b.tokenPath))
    .slice(0, 5);
}

export interface ComponentSpecLike {
  name: string;
  variants?: string[];
  sizes?: string[];
  states?: string[];
  variantGuidance?: Record<string, string>;
  props?: Record<string, unknown>;
}

export interface Violation { rule: string; suggestion: string }

/** Every way the configuration breaks the component's spec. */
export function validateUsage(spec: ComponentSpecLike, config: Record<string, unknown>): Violation[] {
  const violations: Violation[] = [];

  if (config.variant !== undefined && spec.variants && !spec.variants.includes(String(config.variant))) {
    const variantHint = spec.variantGuidance
      ? Object.entries(spec.variantGuidance).map(([v, g]) => `"${v}": ${g.split(".")[0]}`).join("; ")
      : "";
    violations.push({
      rule: `Variant "${config.variant}" is not valid for ${spec.name}. Allowed variants: ${spec.variants.join(", ")}.`,
      suggestion: `Change variant to one of: ${spec.variants.join(", ")}.${variantHint ? ` Guidance: ${variantHint}.` : ""}`,
    });
  }
  if (config.size !== undefined && spec.sizes && !spec.sizes.includes(String(config.size))) {
    violations.push({
      rule: `Size "${config.size}" is not valid for ${spec.name}. Allowed sizes: ${spec.sizes.join(", ")}.`,
      suggestion: `Change size to one of: ${spec.sizes.join(", ")}.`,
    });
  }
  if (config.state !== undefined && spec.states && !spec.states.includes(String(config.state))) {
    violations.push({
      rule: `State "${config.state}" is not valid for ${spec.name}. Allowed states: ${spec.states.join(", ")}.`,
      suggestion: `Change state to one of: ${spec.states.join(", ")}.`,
    });
  }
  if (spec.props) {
    const reserved = new Set(["variant", "size", "state"]);
    for (const [propKey, value] of Object.entries(config)) {
      if (reserved.has(propKey)) continue;
      if (!(propKey in spec.props)) {
        violations.push({
          rule: `Unknown prop "${propKey}" - not defined in the ${spec.name} spec.`,
          suggestion: `Remove "${propKey}" or replace with a valid prop. Valid props: ${Object.keys(spec.props).join(", ")}.`,
        });
        continue;
      }
      // A prop that lists its values takes one of them; a class list matches in any order.
      const allowed = (spec.props[propKey] as { values?: unknown[] } | null)?.values;
      if (!Array.isArray(allowed)) continue;
      const classes = (v: unknown) => String(v).trim().split(/\s+/).sort().join(" ");
      const ok = propKey === "class"
        ? allowed.some((a) => classes(a) === classes(value))
        : allowed.map(String).includes(String(value));
      if (!ok) {
        violations.push({
          rule: `${propKey} "${value}" is not one of the values ${spec.name} has.`,
          suggestion: `Use one of: ${allowed.map((a) => `"${a}"`).join(", ")}.`,
        });
      }
    }
  }
  return violations;
}

export interface PlannedComponents {
  batches?: Record<string, string>;
  components?: Record<string, { name: string; batch: number | string; what?: string; mustGetRight?: string; guide?: string }>;
}

/**
 * The answer when a component is not in the system. One the system plans is named as planned,
 * with its batch and what it must get right, so an agent says so instead of inventing one.
 */
export function componentNotFound(componentName: string, components: Record<string, unknown>, planned?: PlannedComponents): string {
  const available = Object.keys(components).join(", ");
  const want = componentName.toLowerCase().trim();
  const found = Object.entries(planned?.components ?? {})
    .find(([key, p]) => key === want || key === want.replace(/\s+/g, "-") || p.name.toLowerCase() === want);
  if (!found) return `Component "${componentName}" not found. Available: ${available}`;
  const [, p] = found;
  const batch = planned?.batches?.[String(p.batch)];
  return [
    `${p.name} is planned, not in the design system yet: batch ${p.batch}${batch ? ` (${batch})` : ""}.`,
    p.what ? `What it is for: ${p.what}` : "",
    p.mustGetRight ? `What it must get right: ${p.mustGetRight}` : "",
    `Do not invent it: build from the components there are (${available}) until it lands.`,
    p.guide ? `Guide: ${p.guide}` : "",
  ].filter(Boolean).join(" ");
}
