/**
 * Design System MCP — AI Generator
 *
 * Generates a complete design-system.json from a natural-language description
 * using the OpenRouter API. Retries up to 3 times on validation failures so
 * that the model can self-correct based on the error messages.
 */

export interface GeneratedDesignSystem {
  /** The generated design-system data (tokens, components, themes, icons). */
  data: Record<string, unknown>;
  /** Non-fatal warnings from the validation pass. */
  warnings: string[];
}

// ── Generation system prompt ───────────────────────────────────────────────
const GENERATION_SYSTEM_PROMPT = `You are a design system architect. Generate a complete, valid design-system JSON object from a natural-language description.

OUTPUT RULES:
1. Respond with ONLY a valid JSON object. No prose, no markdown fences, no commentary before or after.
2. The JSON must have exactly these four top-level keys: "tokens", "components", "themes", "icons".
3. Do not truncate or abbreviate — generate the full content for every section.

TOKENS structure (all leaf nodes must be {"value":"...","type":"...","description":"..."}):
  color:
    primary: 50,100,200,300,400,500,600,700,800,900 scale (hex values)
    secondary: 50,100,300,500,600,700,900 scale
    neutral: 0,50,100,200,300,400,500,600,700,800,900,950 scale
    success/warning/error: light,default,dark
    semantic: action.primary, action.primaryHover, background, surface, border, text.primary, text.secondary, text.disabled
  typography:
    fontFamily: sans, mono
    fontSize: xs(0.75rem), sm(0.875rem), base(1rem), lg(1.125rem), xl(1.25rem), 2xl(1.5rem), 3xl(1.875rem), 4xl(2.25rem)
    fontWeight: regular(400), medium(500), semibold(600), bold(700)
    lineHeight: tight(1.25), snug(1.375), normal(1.5), relaxed(1.625)
  spacing: keys "0" through "16" (0px, 4px, 8px, 12px, 16px, 20px, 24px, 28px, 32px, 36px, 40px, 48px, 56px, 64px, 80px, 96px, 128px)
  borderRadius: none(0px), sm(2px), md(4px), lg(8px), xl(12px), full(9999px)
  shadow: sm, md, lg, xl  — CSS box-shadow strings
  motion: duration.fast/base/slow (ms), easing.default/in/out (cubic-bezier strings)
  layout: maxWidth.sm/md/lg/xl/content, gutter.mobile/tablet/desktop

Token types to use: "color", "dimension", "fontFamily", "fontWeight", "number", "shadow", "duration", "cubic-bezier"

COMPONENTS (at least 8 entries, keys are lowercase):
  Required: button, input, card, badge, modal, select, checkbox, alert
  Each entry: {"name":"...","description":"...","variants":[...],"sizes":[...],"states":[...],"tokens":{...},"constraints":[...],"accessibility":{"role":"...","keyboardInteraction":[...]}}
  tokens values should be dot-notation token paths like "color.primary.600"

THEMES (at least 2 entries):
  Required: "light" and "dark"
  Each entry: {"name":"...","description":"...","semantic":{"background":"#hex","surface":"#hex","border":"#hex","text-primary":"#hex","text-secondary":"#hex","action-primary":"#hex","action-primary-hover":"#hex"}}

ICONS (at least 12 entries, keys are kebab-case):
  Each entry: {"name":"...","category":"...","keywords":[...],"sizes":[16,24,32],"description":"..."}
  Categories: action, navigation, status, communication, media, interface
  Include icons relevant to the brand and product type described.`;

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Extract a JSON object from raw LLM output, handling common cases where
 * the model wraps the JSON in markdown fences or adds prose preamble.
 */
function extractJson(text: string): string {
  // Strip markdown code fences (```json ... ``` or ``` ... ```)
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();

  // Find outermost JSON object by scanning for matching braces
  const start = text.indexOf("{");
  const end   = text.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return text.slice(start, end + 1);
  }

  return text.trim();
}

/**
 * Lightweight structural validation of the generated data.
 * Returns errors (hard failures) and warnings (soft suggestions).
 */
function validateGeneratedData(data: Record<string, unknown>): {
  errors: string[];
  warnings: string[];
} {
  const errors:   string[] = [];
  const warnings: string[] = [];

  const required = ["tokens", "components", "themes", "icons"] as const;
  for (const key of required) {
    if (!(key in data)) {
      errors.push(`Missing required top-level key: "${key}"`);
    } else if (typeof data[key] !== "object" || Array.isArray(data[key]) || data[key] === null) {
      errors.push(`"${key}" must be a non-null object.`);
    }
  }

  if (errors.length > 0) return { errors, warnings };

  const tokens     = data.tokens     as Record<string, unknown>;
  const components = data.components as Record<string, unknown>;
  const themes     = data.themes     as Record<string, unknown>;
  const icons      = data.icons      as Record<string, unknown>;

  if (!tokens.color)      warnings.push("tokens.color is missing.");
  if (!tokens.typography) warnings.push("tokens.typography is missing.");
  if (!tokens.spacing)    warnings.push("tokens.spacing is missing.");

  const compKeys = Object.keys(components);
  if (compKeys.length < 4) {
    warnings.push(`Only ${compKeys.length} component(s) defined; at least 8 recommended.`);
  }

  const themeKeys = Object.keys(themes);
  if (themeKeys.length < 2) {
    warnings.push("Fewer than 2 themes defined; light and dark are recommended.");
  }

  const iconKeys = Object.keys(icons);
  if (iconKeys.length < 6) {
    warnings.push(`Only ${iconKeys.length} icon(s) defined; at least 12 recommended.`);
  }

  return { errors, warnings };
}

// ── Main export ────────────────────────────────────────────────────────────

/**
 * Generate a complete design system JSON from a natural-language description.
 *
 * @param description  Free-text description of the brand, aesthetic, and colors.
 * @param apiKey       OpenRouter API key.
 * @param model        OpenRouter model identifier.
 * @returns            { data, warnings } on success; throws on repeated failure.
 */
export async function generateDesignSystem(
  description: string,
  apiKey: string,
  model: string,
): Promise<GeneratedDesignSystem> {
  const MAX_RETRIES = 3;
  let lastErrors: string[] = [];

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const retryContext = attempt > 0
      ? `\n\nYour previous attempt failed validation. Fix these errors:\n${lastErrors.map(e => `- ${e}`).join("\n")}\n\nThen regenerate the complete JSON.`
      : "";

    const userMessage =
      `Generate a complete design-system JSON for the following description:\n\n${description}${retryContext}\n\nRespond with ONLY the JSON object.`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization":  `Bearer ${apiKey}`,
        "Content-Type":   "application/json",
        "HTTP-Referer":   "https://github.com/designsystem-mcp-demo",
        "X-Title":        "Design System MCP Demo",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system",  content: GENERATION_SYSTEM_PROMPT },
          { role: "user",    content: userMessage },
        ],
        temperature: 0.4,
        max_tokens:  8000,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenRouter API error (${response.status}): ${errText}`);
    }

    const orData = await response.json() as {
      choices: Array<{ message: { content: string | null } }>;
    };

    const rawContent = orData.choices[0]?.message?.content ?? "";
    if (!rawContent) {
      lastErrors = ["Model returned an empty response."];
      continue;
    }

    let parsed: Record<string, unknown>;
    try {
      const jsonStr = extractJson(rawContent);
      parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    } catch (e) {
      lastErrors = [`JSON parse error: ${String(e)}`];
      continue;
    }

    const { errors, warnings } = validateGeneratedData(parsed);
    if (errors.length > 0) {
      lastErrors = errors;
      continue;
    }

    return { data: parsed, warnings };
  }

  throw new Error(
    `Failed to generate a valid design system after ${MAX_RETRIES} attempts. ` +
    `Last errors: ${lastErrors.join("; ")}`,
  );
}
