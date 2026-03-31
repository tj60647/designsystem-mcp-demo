import { marked } from "https://esm.sh/marked@15";

// Configure marked: GFM (tables, strikethrough, etc.), treat single newlines as <br>
marked.use({ gfm: true, breaks: true });

// ── Token color cache ─────────────────────────────────────────────────────
// Flattened map of dot-notation token path → CSS color value.
// Populated once at init; used synchronously by highlightTokens().
const tokenColorCache = new Map();

const AGENT_SETTINGS_STORAGE_KEY = "designsystem-mcp-demo.chat.agent-settings";
const AGENT_KEYS = ["orchestrator", "reader", "builder", "generator", "style-guide", "unified"];
const DEFAULT_SAMPLING = { temperature: 0 };

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
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

function coerceNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function makeAgentSampling(seed) {
  const src = seed && typeof seed === "object" ? seed : {};
  const result = {
    temperature: coerceNumber(src.temperature, DEFAULT_SAMPLING.temperature),
  };
  if (typeof src.systemPrompt === "string" && src.systemPrompt.trim()) {
    result.systemPrompt = src.systemPrompt;
  }
  if (typeof src.maxIterations === "number" && src.maxIterations >= 1) {
    result.maxIterations = Math.trunc(src.maxIterations);
  }
  if (Array.isArray(src.tools)) {
    const tools = src.tools.filter((t) => typeof t === "string");
    if (tools.length > 0) result.tools = tools;
  }
  return result;
}

export function createDefaultAgentSettings(defaultModel) {
  const model = (defaultModel || "openai/gpt-oss-20b:nitro").trim();
  const agents = {};
  for (const key of AGENT_KEYS) {
    agents[key] = { model, ...DEFAULT_SAMPLING };
  }
  return {
    useGlobalModel: true,
    global: { model, ...DEFAULT_SAMPLING },
    agents,
  };
}

export function loadAgentSettings(defaultModel) {
  const fallback = createDefaultAgentSettings(defaultModel);
  let raw = null;
  try {
    raw = localStorage.getItem(AGENT_SETTINGS_STORAGE_KEY);
  } catch {
    return fallback;
  }
  if (!raw) return fallback;

  try {
    const parsed = JSON.parse(raw);
    const next = createDefaultAgentSettings(defaultModel);
    next.useGlobalModel = Boolean(parsed?.useGlobalModel ?? true);
    if (parsed?.global && typeof parsed.global === "object") {
      next.global.model = String(parsed.global.model || next.global.model).trim() || next.global.model;
      Object.assign(next.global, makeAgentSampling(parsed.global));
    }
    if (parsed?.agents && typeof parsed.agents === "object") {
      for (const key of AGENT_KEYS) {
        const src = parsed.agents[key];
        if (!src || typeof src !== "object") continue;
        next.agents[key].model = String(src.model || next.agents[key].model).trim() || next.agents[key].model;
        Object.assign(next.agents[key], makeAgentSampling(src));
      }
    }
    return next;
  } catch {
    return fallback;
  }
}

export function saveAgentSettings(settings) {
  try {
    localStorage.setItem(AGENT_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Non-fatal if storage is unavailable.
  }
}
