import { marked } from "https://esm.sh/marked@15";

// Configure marked: GFM (tables, strikethrough, etc.), treat single newlines as <br>
marked.use({ gfm: true, breaks: true });

// ── Token color cache ─────────────────────────────────────────────────────
// Flattened map of dot-notation token path → CSS color value.
// Populated once at init; used synchronously by highlightTokens().
const tokenColorCache = new Map();

function flattenTokens(obj, prefix) {
  if (!obj || typeof obj !== "object") return;
  if ("value" in obj && typeof obj.value === "string") {
    // Leaf token node — store if it looks like a color value
    const v = obj.value.trim();
    if (v.startsWith("#") || v.startsWith("rgb") || v.startsWith("hsl")) {
      tokenColorCache.set(prefix, v);
    }
    return;
  }
  for (const key of Object.keys(obj)) {
    flattenTokens(obj[key], prefix ? `${prefix}.${key}` : key);
  }
}

async function initTokenColors() {
  try {
    const res = await fetch("/api/data/tokens");
    if (!res.ok) return;
    const data = await res.json();
    // tokens live under a "color" key; flatten the whole payload
    const colorSection = data?.color ?? data?.tokens?.color ?? null;
    if (colorSection) {
      flattenTokens(colorSection, "color");
    } else {
      // Fallback: flatten entire payload to catch any color.* paths
      flattenTokens(data, "");
    }
  } catch { /* non-fatal — swatches fall back to accent gradient */ }
}

initTokenColors();
// ─────────────────────────────────────────────────────────────────────────

export function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderMarkdown(text) {
  return marked.parse(text);
}

export function highlightTokens(container) {
  const tokenRegex = /\b(color|spacing|typography|borderRadius|shadow|motion|layout)\.[a-zA-Z0-9_.]+/g;

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
  const toReplace = [];
  let node;
  while ((node = walker.nextNode())) {
    if (tokenRegex.test(node.textContent)) toReplace.push(node);
    tokenRegex.lastIndex = 0;
  }

  for (const textNode of toReplace) {
    const parent = textNode.parentNode;
    if (!parent || parent.tagName === "CODE" || parent.tagName === "PRE") continue;

    const fragment = document.createDocumentFragment();
    let lastIdx = 0;
    let m;
    tokenRegex.lastIndex = 0;
    const str = textNode.textContent;

    while ((m = tokenRegex.exec(str)) !== null) {
      // Strip trailing dots (e.g. "typography.fontSize." from glob notation "typography.fontSize.*")
      const tokenPath = m[0].replace(/\.+$/, "");
      const matchEnd = m.index + tokenPath.length;
      if (m.index > lastIdx) {
        fragment.appendChild(document.createTextNode(str.slice(lastIdx, m.index)));
      }
      const chip = document.createElement("span");
      chip.className = "token-chip";
      if (tokenPath.startsWith("color.")) {
        const swatch = document.createElement("span");
        swatch.className = "token-chip-swatch";
        const resolvedColor = tokenColorCache.get(tokenPath);
        swatch.style.background = resolvedColor ?? "linear-gradient(135deg, #2f81f7, #bc8cff)";
        chip.appendChild(swatch);
      }
      chip.appendChild(document.createTextNode(tokenPath));
      fragment.appendChild(chip);
      lastIdx = matchEnd;
    }
    if (lastIdx < str.length) {
      fragment.appendChild(document.createTextNode(str.slice(lastIdx)));
    }
    parent.replaceChild(fragment, textNode);
    tokenRegex.lastIndex = 0;
  }
}
