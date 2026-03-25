/**
 * Design System MCP — Website Design Context Extractor
 *
 * Fetches a public website and extracts design-relevant CSS information
 * (custom properties, colors, typography) to use as context when generating
 * a design system with AI.
 */

/** Allowed protocols for safety */
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

/** Reject private/loopback IP ranges to prevent SSRF */
function isPrivateHostname(hostname: string): boolean {
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]") return true;
  if (/^10\.\d+\.\d+\.\d+$/.test(hostname)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(hostname)) return true;
  if (/^192\.168\.\d+\.\d+$/.test(hostname)) return true;
  if (/^0\./.test(hostname)) return true;
  if (/^169\.254\./.test(hostname)) return true;
  return false;
}

/**
 * Validate and parse a URL, throwing on unsafe or malformed input.
 */
export function validateWebsiteUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Invalid URL format.");
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new Error("Only http:// and https:// URLs are allowed.");
  }

  if (isPrivateHostname(parsed.hostname)) {
    throw new Error("URLs pointing to private or loopback addresses are not allowed.");
  }

  return parsed;
}

/** Extract CSS custom properties and design-relevant values from raw CSS text */
function extractCssDesignTokens(css: string): {
  variables: Record<string, string>;
  colors: string[];
  fonts: string[];
} {
  const variables: Record<string, string> = {};
  const colorsSet = new Set<string>();
  const fontsSet  = new Set<string>();

  // CSS custom properties: --name: value;
  const varRegex = /--([\w-]+)\s*:\s*([^;{}]+)/g;
  let m: RegExpExecArray | null;
  while ((m = varRegex.exec(css)) !== null) {
    const name  = m[1].trim();
    const value = m[2].trim();
    if (value && value.length < 200) {
      variables[name] = value;
    }
  }

  // Hex colors (#rgb, #rrggbb, #rrggbbaa)
  const hexRegex = /#([0-9a-fA-F]{6}|[0-9a-fA-F]{8}|[0-9a-fA-F]{3})\b/g;
  while ((m = hexRegex.exec(css)) !== null) {
    colorsSet.add(m[0].toLowerCase());
  }

  // Functional color notations
  const funcColorRegex = /(?:rgb|rgba|hsl|hsla)\([^)]+\)/g;
  while ((m = funcColorRegex.exec(css)) !== null) {
    colorsSet.add(m[0]);
  }

  // font-family declarations
  const fontRegex = /font-family\s*:\s*([^;}{]+)/g;
  while ((m = fontRegex.exec(css)) !== null) {
    const font = m[1].trim().replace(/['"`]/g, "").split(",")[0].trim();
    if (font && font !== "inherit" && font !== "initial" && font !== "unset") {
      fontsSet.add(font);
    }
  }

  return {
    variables,
    colors: Array.from(colorsSet).slice(0, 50),
    fonts:  Array.from(fontsSet).slice(0, 10),
  };
}

const FETCH_TIMEOUT_MS   = 15_000;
const MAX_HTML_BYTES     = 500_000;
const MAX_CSS_BYTES      = 100_000;
const MAX_STYLESHEETS    = 3;

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "DesignSystemMCP/0.3.0 (design token extractor)" },
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch a public website and extract design-relevant CSS context.
 * Returns a textual description suitable for passing to `generateDesignSystem`.
 */
export async function extractWebsiteDesignContext(rawUrl: string): Promise<string> {
  const parsed  = validateWebsiteUrl(rawUrl);
  const baseUrl = parsed.origin;

  // Fetch the page HTML
  let html: string;
  try {
    const res = await fetchWithTimeout(parsed.href, FETCH_TIMEOUT_MS);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const text = await res.text();
    html = text.slice(0, MAX_HTML_BYTES);
  } catch (err) {
    throw new Error(`Could not fetch website: ${String(err)}`);
  }

  const cssChunks: string[] = [];

  // 1. Inline <style> tags
  const styleTagRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let sm: RegExpExecArray | null;
  while ((sm = styleTagRegex.exec(html)) !== null) {
    cssChunks.push(sm[1]);
  }

  // 2. <link rel="stylesheet"> hrefs (handle both attribute orderings and quote styles)
  const linkPatterns = [
    /<link[^>]+rel=["']stylesheet["'][^>]*href=["']([^"']+)["']/gi,
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']stylesheet["']/gi,
    /<link[^>]+rel=stylesheet[^>]+href=["']([^"']+)["']/gi,
  ];
  const sheetUrls: string[] = [];
  for (const pattern of linkPatterns) {
    let lm: RegExpExecArray | null;
    while ((lm = pattern.exec(html)) !== null) {
      const href = lm[1];
      if (href.startsWith("data:")) continue;
      try {
        const resolved = new URL(href, baseUrl).href;
        if (!sheetUrls.includes(resolved)) sheetUrls.push(resolved);
      } catch { /* ignore unparseable hrefs */ }
    }
  }

  // Fetch up to MAX_STYLESHEETS external sheets, skipping private addresses
  await Promise.allSettled(
    sheetUrls.slice(0, MAX_STYLESHEETS).map(async (sheetUrl) => {
      try {
        validateWebsiteUrl(sheetUrl); // guard against SSRF via stylesheet redirect
        const res = await fetchWithTimeout(sheetUrl, FETCH_TIMEOUT_MS);
        if (res.ok) {
          const text = await res.text();
          cssChunks.push(text.slice(0, MAX_CSS_BYTES));
        }
      } catch { /* silently skip inaccessible stylesheets */ }
    }),
  );

  const allCss = cssChunks.join("\n");
  const { variables, colors, fonts } = extractCssDesignTokens(allCss);

  // Extract page title
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const pageTitle  = titleMatch ? titleMatch[1].trim() : parsed.hostname;

  // Extract meta description
  const metaMatch = html.match(
    /<meta[^>]+name=["']description["'][^>]*content=["']([^"']+)["']/i,
  ) ?? html.match(
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i,
  );
  const metaDesc = metaMatch ? metaMatch[1].trim() : "";

  // Build description for the generator
  const lines: string[] = [
    `Generate a design system inspired by the website: ${parsed.href}`,
    `Page title: ${pageTitle}`,
  ];

  if (metaDesc) lines.push(`Description: ${metaDesc}`);

  const varEntries = Object.entries(variables);
  if (varEntries.length > 0) {
    lines.push("\nCSS custom properties found on the site:");
    for (const [name, value] of varEntries.slice(0, 60)) {
      lines.push(`  --${name}: ${value}`);
    }
  }

  if (colors.length > 0) {
    lines.push(`\nColors used on the site: ${colors.slice(0, 20).join(", ")}`);
  }

  if (fonts.length > 0) {
    lines.push(`\nFont families used: ${fonts.join(", ")}`);
  }

  lines.push(
    "\nUse these design tokens as inspiration to generate a complete, cohesive design system.",
  );

  return lines.join("\n");
}
