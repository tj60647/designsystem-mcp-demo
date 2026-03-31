import { escapeHtml } from './utils.js';

// ── Local state ──────────────────────────────────────────────────────────────
let galleryLoaded = false;
let galleryComponents = {};
let galleryTokens = {};
let galleryActiveVariants = {};  // { componentKey: variant string }

function getTokNode(tokens, path) {
  const parts = path.split(".");
  let cur = tokens;
  for (const p of parts) {
    if (cur == null) return null;
    cur = cur[p];
  }
  return cur;
}

function resolveTokenValue(tokens, ref, visited = new Set()) {
  if (typeof ref !== "string") return null;

  const trimmed = ref.trim();
  if (!trimmed) return null;

  const looksLikeLiteral = /^(#|rgb\(|rgba\(|hsl\(|hsla\(|var\(|calc\()/i.test(trimmed);
  const tokenPath = trimmed.startsWith("{") && trimmed.endsWith("}")
    ? trimmed.slice(1, -1).trim()
    : (!looksLikeLiteral && trimmed.includes(".") ? trimmed : null);

  if (!tokenPath) return trimmed;
  if (visited.has(tokenPath)) return null;
  visited.add(tokenPath);

  const node = getTokNode(tokens, tokenPath);
  if (node == null) return null;
  if (typeof node === "string") return node;
  if (node && typeof node === "object") {
    const resolvedValue = node.$extensions?.resolvedValue;
    if (typeof resolvedValue === "string" && resolvedValue.trim()) return resolvedValue;
    if (typeof node.$value === "string") {
      return resolveTokenValue(tokens, node.$value, visited) || node.$value;
    }
  }
  return null;
}

// Resolve a dot-path token from the token tree (e.g. "color.primary.600" → "#2563eb")
function getTok(tokens, path) {
  return resolveTokenValue(tokens, path);
}

function uniqStrings(values) {
  return Array.from(new Set(
    values.filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim())
  ));
}

function getPropEnumValues(prop) {
  if (!prop || typeof prop !== "object") return [];
  if (Array.isArray(prop.values)) return uniqStrings(prop.values);
  if (Array.isArray(prop.enum)) return uniqStrings(prop.enum);
  if (Array.isArray(prop.options)) {
    return uniqStrings(prop.options.map((option) => {
      if (typeof option === "string") return option;
      if (option && typeof option === "object") return option.value || option.name || option.label;
      return null;
    }));
  }
  return [];
}

function getPropDefaultValue(comp, propName) {
  const prop = comp?.props?.[propName];
  return typeof prop?.default === "string" && prop.default.trim() ? prop.default.trim() : null;
}

function getComponentVariants(comp) {
  return uniqStrings([
    ...(Array.isArray(comp?.variants) ? comp.variants : []),
    ...getPropEnumValues(comp?.props?.variant),
    ...Object.keys(comp?.variantGuidance || {}),
  ]);
}

function getComponentSizes(comp) {
  return uniqStrings([
    ...(Array.isArray(comp?.sizes) ? comp.sizes : []),
    ...getPropEnumValues(comp?.props?.size),
  ]);
}

function getVariantAliases(variant) {
  const value = typeof variant === "string" ? variant.toLowerCase() : "";
  const aliases = new Set(value ? [value] : []);

  if (value === "default") aliases.add("primary");
  if (value === "primary") aliases.add("default");
  if (value === "filled" || value === "solid") {
    aliases.add("primary");
    aliases.add("default");
  }
  if (value === "outline") aliases.add("outlined");
  if (value === "outlined") aliases.add("outline");
  if (value === "danger" || value === "error") aliases.add("destructive");
  if (value === "destructive") {
    aliases.add("danger");
    aliases.add("error");
  }
  if (value === "success") aliases.add("positive");
  if (value === "warning") aliases.add("caution");

  return Array.from(aliases);
}

function pickComponentToken(source, tokens, candidates = []) {
  if (!source) return null;
  if (typeof source === "string") return resolveTokenValue(tokens, source);
  if (typeof source !== "object") return null;

  for (const candidate of uniqStrings(candidates)) {
    const direct = source[candidate];
    const resolved = typeof direct === "object" && direct !== null && !Array.isArray(direct)
      ? null
      : resolveTokenValue(tokens, direct);
    if (resolved) return resolved;
  }

  for (const fallbackKey of ["default", "base", "primary", "value", "others"]) {
    const fallback = source[fallbackKey];
    const resolved = typeof fallback === "object" && fallback !== null && !Array.isArray(fallback)
      ? null
      : resolveTokenValue(tokens, fallback);
    if (resolved) return resolved;
  }

  return null;
}

// ── Component classification ──────────────────────────────────────────────────
// Maps any reasonable comp.type value (or regex-inferred keyword) to one of the
// canonical renderer keys used in inferredRenderer's switch statement.
const COMPONENT_TYPE_MAP = {
  button: "button",     btn: "button",        action: "button",     cta: "button",
  checkbox: "checkbox",
  radio: "radio",
  toggle: "toggle",     switch: "toggle",
  input: "input",       textarea: "input",    text: "input",        search: "input",
  email: "input",       password: "input",    phone: "input",       url: "input",
  number: "input",      otp: "input",
  select: "select",     dropdown: "select",   picker: "select",     combobox: "select",   autocomplete: "select",
  slider: "slider",     range: "slider",      knob: "slider",
  badge: "badge",       tag: "badge",         chip: "badge",        pill: "badge",
  status: "badge",      indicator: "badge",
  alert: "alert",       notification: "alert", toast: "alert",      banner: "alert",
  snackbar: "alert",    callout: "alert",     flash: "alert",       announcement: "alert",
  modal: "modal",       dialog: "modal",      drawer: "modal",      sheet: "modal",
  popup: "modal",       lightbox: "modal",
  tooltip: "tooltip",   hint: "tooltip",      popover: "tooltip",   popout: "tooltip",
  tabs: "tabs",         tab: "tabs",          segment: "tabs",      segmented: "tabs",
  accordion: "accordion", collapse: "accordion", disclosure: "accordion",
  expand: "accordion",  details: "accordion",
  breadcrumb: "breadcrumb",
  pagination: "pagination",
  spinner: "spinner",   loader: "spinner",
  skeleton: "skeleton",
  progress: "progress", loading: "progress",
  avatar: "avatar",     image: "avatar",      img: "avatar",        photo: "avatar",
  picture: "avatar",    thumbnail: "avatar",
  icon: "icon",
  list: "list",         menu: "list",         nav: "list",          navigation: "list",   sidebar: "list",
  table: "table",       grid: "table",
  card: "card",         panel: "card",        container: "card",    box: "card",
  section: "card",      surface: "card",      tile: "card",
  form: "form",         wizard: "form",       step: "form",
  divider: "divider",   separator: "divider", rule: "divider",      hr: "divider",
};

// Returns a canonical renderer key for a component.
// Priority: explicit comp.type > component-name keywords >
//           prop heuristics > variant heuristics > null (generic fallback).
function classifyComponent(key, comp, vars, props) {
  // 1. Explicit type annotation
  if (typeof comp.type === "string" && comp.type.trim()) {
    const canonical = COMPONENT_TYPE_MAP[comp.type.trim().toLowerCase()];
    if (canonical) return canonical;
  }

  const nameLc = (comp.name || key).toLowerCase();

  // 2. Name-based — ordered most-specific first (badge before the variant-based button check)
  const namePatterns = [
    [/\bbadge\b/,                                                          "badge"],
    [/\bcheckbox\b/,                                                       "checkbox"],
    [/\bradio\b/,                                                          "radio"],
    [/\b(btn|button|action|cta)\b/,                                        "button"],
    [/\b(toggle|switch)\b/,                                                "toggle"],
    [/\b(input|field|search|email|password|phone|url|number|textarea|otp)\b/, "input"],
    [/\b(dropdown|select|picker|combobox|autocomplete)\b/,                 "select"],
    [/\b(slider|range|knob)\b/,                                            "slider"],
    [/\b(tag|chip|label|pill|status|indicator)\b/,                         "badge"],
    [/\b(alert|notification|banner|snackbar|callout|flash|announcement)\b/,"alert"],
    [/\b(dialog|modal|drawer|sheet|popup|lightbox)\b/,                     "modal"],
    [/\b(tooltip|hint|popover|popout)\b/,                                  "tooltip"],
    [/\b(tab|tabs|segment|segmented)\b/,                                   "tabs"],
    [/\b(accordion|collapse|disclosure|expand|details)\b/,                 "accordion"],
    [/\bbreadcrumb\b/,                                                     "breadcrumb"],
    [/\bpagination\b/,                                                     "pagination"],
    [/\bspinner\b/,                                                        "spinner"],
    [/\bskeleton\b/,                                                       "skeleton"],
    [/\b(progress|loader|loading)\b/,                                      "progress"],
    [/\b(avatar|image|img|photo|picture|thumbnail)\b/,                     "avatar"],
    [/\bicon\b/,                                                           "icon"],
    [/\b(list|menu|nav|navigation|sidebar)\b/,                             "list"],
    [/\b(table|grid|data)\b/,                                              "table"],
    [/\b(card|panel|container|box|section|surface|tile)\b/,                "card"],
    [/\b(form|wizard|step)\b/,                                             "form"],
    [/\b(divider|separator|rule|hr)\b/,                                    "divider"],
  ];
  for (const [re, type] of namePatterns) {
    if (re.test(nameLc)) return type;
  }

  // 3. Prop-based heuristics
  if (props.some(p => /^(checked|indeterminate)$/.test(p))) return "checkbox";
  if (props.some(p => /^(toggled|selected)$/.test(p)))      return "toggle";
  if (props.some(p => /^(value|placeholder|type)$/.test(p))) return "input";
  if (props.some(p => /^(options|choices|onselect)$/.test(p))) return "select";
  if (props.some(p => /^(min|max|step|range)$/.test(p)))    return "slider";
  if (props.some(p => /^(isopen|open|onclose|visible)$/.test(p))) return "modal";
  if (props.some(p => /^(progress|percent)$/.test(p)))      return "progress";
  if (props.some(p => /^(items|links|pages)$/.test(p)))     return "list";
  if (props.some(p => /^(columns|rows)$/.test(p)))          return "table";

  // 4. Variant-based heuristics (lowest priority — most prone to false positives)
  if (vars.some(v => /^(primary|secondary|ghost|outline|destructive)$/.test(v))
      && !props.includes("checked") && !props.includes("value")) return "button";
  if (vars.some(v => /^(info|success|warning|error|danger)$/.test(v)))  return "alert";

  return null; // unknown → generic fallback card
}


export async function loadGallery() {
  const body = document.getElementById("gallery-body");
  body.innerHTML = '<div class="explorer-empty"><div class="explorer-empty-icon">&#9671;</div><div class="explorer-empty-text">Loading gallery…</div></div>';
  try {
    const [compRes, tokRes] = await Promise.all([
      fetch("/api/data/components"),
      fetch("/api/data/tokens"),
    ]);
    if (!compRes.ok) throw new Error("HTTP " + compRes.status);
    galleryComponents = await compRes.json();
    galleryTokens     = tokRes.ok ? await tokRes.json() : {};
    galleryLoaded     = true;
    renderGalleryGrid(document.getElementById("gallery-search").value);
  } catch (err) {
    body.innerHTML = `<div class="explorer-empty"><div class="explorer-empty-icon">&#9888;</div><div class="explorer-empty-text">Could not load gallery: ${escapeHtml(err.message)}</div></div>`;
  }
}

function renderGalleryGrid(filter) {
  const body = document.getElementById("gallery-body");
  const keys = Object.keys(galleryComponents).filter(k => {
    if (!filter) return true;
    const f = filter.toLowerCase();
    const c = galleryComponents[k];
    return k.toLowerCase().includes(f) || (c.name || "").toLowerCase().includes(f) || (c.description || "").toLowerCase().includes(f);
  });

  if (!keys.length) {
    body.innerHTML = `<div class="explorer-empty"><div class="explorer-empty-icon">&#9671;</div><div class="explorer-empty-text">${filter ? "No components match your filter." : "No components loaded."}</div></div>`;
    return;
  }

  const grid = document.createElement("div");
  grid.className = "gallery-grid";

  for (const key of keys) {
    const comp    = galleryComponents[key];
    const variants = getComponentVariants(comp);
    const defaultVariant = getPropDefaultValue(comp, "variant");
    const activeVar = variants.includes(galleryActiveVariants[key])
      ? galleryActiveVariants[key]
      : (defaultVariant && variants.includes(defaultVariant) ? defaultVariant : (variants[0] || null));

    const card = document.createElement("div");
    card.className = "gallery-card";
    card.dataset.key = key;

    // Header
    const header = document.createElement("div");
    header.className = "gallery-card-header";

    const nameEl = document.createElement("div");
    nameEl.className = "gallery-card-name";
    nameEl.textContent = comp.name || key;
    header.appendChild(nameEl);

    const varBar = document.createElement("div");
    varBar.className = "gallery-variant-bar";

    if (variants.length > 1) {
      for (const v of variants) {
        const btn = document.createElement("button");
        btn.className = "gallery-variant-btn" + (v === activeVar ? " active" : "");
        btn.textContent = v;
        btn.dataset.variant = v;
        btn.addEventListener("click", () => {
          galleryActiveVariants[key] = v;
          varBar.querySelectorAll(".gallery-variant-btn").forEach(b => {
            b.classList.toggle("active", b.dataset.variant === v);
          });
          const preview = card.querySelector(".gallery-preview");
          if (preview) preview.innerHTML = renderComponentPreview(key, comp, galleryTokens, v);
        });
        varBar.appendChild(btn);
      }
      header.appendChild(varBar);
    }

    card.appendChild(header);

    // Preview
    const preview = document.createElement("div");
    preview.className = "gallery-preview";
    preview.innerHTML = renderComponentPreview(key, comp, galleryTokens, activeVar);
    card.appendChild(preview);

    // Footer description
    if (comp.description) {
      const footer = document.createElement("div");
      footer.className = "gallery-card-footer";
      footer.textContent = comp.description;
      card.appendChild(footer);
    }

    grid.appendChild(card);
  }

  body.innerHTML = "";
  body.appendChild(grid);
}

function renderComponentPreview(key, comp, tokens, variant) {
  // Infer component type from name/props/variants and render using loaded design system tokens
  try { return inferredRenderer(key, comp, tokens, variant); }
  catch (e) {
    console.error("Gallery renderer error:", key, e);
    return `<span style="color:#6b7280;font-size:12px;font-family:sans-serif;">Preview unavailable</span>`;
  }
}

// Classifies a component into a canonical renderer key, then returns an HTML preview.
// Classification priority: comp.type field > name keywords > prop heuristics > variant heuristics.
function inferredRenderer(key, comp, tokens, variant) {
  const props    = Object.keys(comp.props || {}).map(p => p.toLowerCase());
  const variants = getComponentVariants(comp);
  const sizes    = getComponentSizes(comp);
  const vars     = variants.map(v => v.toLowerCase());

  // ── token shortcuts ──────────────────────────────────────────────────
  const p6    = getTok(tokens, "color.primary.600")  || "#2563eb";
  const p100  = getTok(tokens, "color.primary.100")  || "#dbeafe";
  const n50   = getTok(tokens, "color.neutral.50")   || "#f9fafb";
  const n200  = getTok(tokens, "color.neutral.200")  || "#e5e7eb";
  const n300  = getTok(tokens, "color.neutral.300")  || "#d1d5db";
  const n700  = getTok(tokens, "color.neutral.700")  || "#374151";
  const err   = getTok(tokens, "color.error.default")|| "#ef4444";
  const br    = getTok(tokens, "borderRadius.md")    || "8px";
  const brSm  = getTok(tokens, "borderRadius.sm")    || "4px";
  const brLg  = getTok(tokens, "borderRadius.lg")    || "12px";
  const brFull= getTok(tokens, "borderRadius.full")  || "9999px";
  const shMd  = getTok(tokens, "shadow.md")          || "0 4px 6px -1px rgba(0,0,0,.1)";
  const shLg  = getTok(tokens, "shadow.lg")          || "0 10px 15px -3px rgba(0,0,0,.1)";

  const displayName = comp.name || key;
  const nameLc      = displayName.toLowerCase();
  const type = classifyComponent(key, comp, vars, props);

  switch (type) {

    // ── Button ──────────────────────────────────────────────────────────
    case "button": {
      const v      = variant || vars[0] || "primary";
      const isPrim = v === "primary" || v === "default";
      const isOut  = v === "outline" || v === "secondary";
      const bg     = isPrim ? p6 : isOut ? "transparent" : n200;
      const color  = isPrim ? "#fff" : isOut ? p6 : n700;
      const border = `1px solid ${isPrim ? p6 : isOut ? p6 : n200}`;
      const label  = v.charAt(0).toUpperCase() + v.slice(1);
      return `<button style="padding:9px 18px;font-size:14px;font-weight:500;font-family:inherit;background:${bg};color:${color};border:${border};border-radius:${br};cursor:pointer;">${label}</button>`;
    }

    // ── Checkbox ────────────────────────────────────────────────────────
    case "checkbox": {
      const isErr = variant === "error";
      const bdColor = isErr ? err : n300;
      return `<div style="display:flex;flex-direction:column;gap:8px;">` +
        ["Checked", "Unchecked", "Disabled"].map((label, i) =>
          `<label style="display:flex;align-items:center;gap:8px;font-size:13px;color:${i === 2 ? n300 : n700};cursor:${i === 2 ? "default" : "pointer"};">
            <span style="width:16px;height:16px;border-radius:3px;border:${i === 0 ? `none` : `1.5px solid ${i === 2 ? n300 : bdColor}`};background:${i === 0 ? p6 : "#fff"};display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;">
              ${i === 0 ? `<span style="color:#fff;font-size:11px;line-height:1;">✓</span>` : ""}
            </span>
            ${label}
          </label>`
        ).join("") +
      `</div>`;
    }

    // ── Radio ───────────────────────────────────────────────────────────
    case "radio": {
      const options = ["Option A", "Option B", "Option C"];
      return `<div style="display:flex;flex-direction:column;gap:8px;">` +
        options.map((o, i) => `<label style="display:flex;align-items:center;gap:8px;font-size:13px;color:${n700};cursor:pointer;">
          <span style="width:16px;height:16px;border-radius:50%;border:${i === 0 ? `5px solid ${p6}` : `1.5px solid ${n300}`};background:#fff;display:inline-block;flex-shrink:0;"></span>
          ${o}</label>`).join("") +
      `</div>`;
    }

    // ── Toggle / Switch ─────────────────────────────────────────────────
    case "toggle": {
      return `<label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:13px;color:${n700};">
        <span style="width:38px;height:22px;background:${p6};border-radius:${brFull};position:relative;display:inline-block;flex-shrink:0;">
          <span style="width:18px;height:18px;background:#fff;border-radius:50%;position:absolute;top:2px;right:2px;box-shadow:0 1px 2px rgba(0,0,0,.2);display:block;"></span>
        </span>
        ${displayName} on
      </label>`;
    }

    // ── Text input / Textarea ────────────────────────────────────────────
    case "input": {
      const isTextarea  = /\btextarea\b/.test(nameLc);
      const isErr       = variant === "error";
      const bdColor     = isErr ? err : n300;
      const ph          = `Enter ${displayName.toLowerCase()}…`;
      const errMsg      = isErr ? `<span style="font-size:11px;color:${err};margin-top:2px;">This field is required.</span>` : "";
      const inner       = isTextarea
        ? `<textarea rows="3" placeholder="${ph}" style="padding:8px 12px;font-size:13px;border:1px solid ${bdColor};border-radius:${br};background:#fff;color:#111827;font-family:inherit;outline:none;width:100%;resize:vertical;"></textarea>`
        : `<input type="text" placeholder="${ph}" style="padding:8px 12px;font-size:14px;border:1px solid ${bdColor};border-radius:${br};background:#fff;color:#111827;font-family:inherit;outline:none;width:100%;" />`;
      return `<div style="display:flex;flex-direction:column;gap:4px;min-width:200px;">
        <label style="font-size:12px;font-weight:500;color:${n700};">${escapeHtml(displayName)}</label>
        ${inner}${errMsg}
      </div>`;
    }

    // ── Dropdown / Select ───────────────────────────────────────────────
    case "select": {
      return `<div style="display:flex;flex-direction:column;gap:4px;min-width:180px;">
        <label style="font-size:12px;font-weight:500;color:${n700};">${escapeHtml(displayName)}</label>
        <select style="padding:8px 12px;font-size:14px;border:1px solid ${n300};border-radius:${br};background:#fff;color:#111827;font-family:inherit;cursor:pointer;">
          <option>Option 1</option>
          <option>Option 2</option>
          <option>Option 3</option>
        </select>
      </div>`;
    }

    // ── Slider / Range ───────────────────────────────────────────────────
    case "slider": {
      return `<div style="min-width:220px;">
        <label style="font-size:12px;font-weight:500;color:${n700};display:block;margin-bottom:8px;">${escapeHtml(displayName)}</label>
        <input type="range" min="0" max="100" value="60" style="width:100%;accent-color:${p6};" />
      </div>`;
    }

    // ── Badge / Tag / Chip / Pill ────────────────────────────────────────
    case "badge": {
      const allVars = variants.length ? variants.slice(0, 5) : [variant || displayName];
      const palettes = [
        { bg: p100,      color: p6,         border: p6 },
        { bg: "#d1fae5", color: "#065f46",   border: "#6ee7b7" },
        { bg: "#fef3c7", color: "#92400e",   border: "#fcd34d" },
        { bg: "#fee2e2", color: "#991b1b",   border: "#fca5a5" },
        { bg: n50,       color: n700,        border: n300 },
      ];
      return allVars.map((v, i) => {
        const p = palettes[i % palettes.length];
        return `<span style="display:inline-flex;align-items:center;padding:3px 12px;border-radius:${brFull};background:${p.bg};color:${p.color};border:1px solid ${p.border};font-size:12px;font-weight:500;margin:2px;">${escapeHtml(v)}</span>`;
      }).join(" ");
    }

    // ── Notification / Alert / Banner / Toast ────────────────────────────
    case "alert": {
      const v       = variant || vars[0] || "info";
      const isErr   = v === "error" || v === "danger";
      const isWarn  = v === "warning";
      const isOk    = v === "success";
      const bgColor = isErr ? "#fef2f2" : isWarn ? "#fffbeb" : isOk ? "#f0fdf4" : "#eff6ff";
      const bdColor = isErr ? "#fca5a5" : isWarn ? "#fcd34d" : isOk ? "#86efac" : "#93c5fd";
      const txColor = isErr ? "#b91c1c" : isWarn ? "#b45309" : isOk ? "#15803d" : "#1d4ed8";
      const icon    = isErr ? "✕" : isWarn ? "⚠" : isOk ? "✓" : "ℹ";
      return `<div style="display:flex;align-items:flex-start;gap:10px;padding:12px 16px;background:${bgColor};border:1px solid ${bdColor};border-radius:${br};min-width:240px;max-width:300px;">
        <span style="color:${txColor};font-weight:600;flex-shrink:0;">${icon}</span>
        <div>
          <div style="font-size:13px;font-weight:500;color:#111827;">${escapeHtml(displayName)}</div>
          <div style="font-size:12px;color:#6b7280;margin-top:2px;">This is a ${escapeHtml(v)} message.</div>
        </div>
      </div>`;
    }

    // ── Dialog / Modal / Drawer / Sheet ─────────────────────────────────
    case "modal": {
      return `<div style="background:#fff;border-radius:${brLg};border:1px solid ${n200};box-shadow:${shLg};width:265px;overflow:hidden;">
        <div style="padding:12px 16px;border-bottom:1px solid ${n200};display:flex;align-items:center;justify-content:space-between;">
          <div style="font-size:14px;font-weight:600;color:#111827;">${escapeHtml(displayName)}</div>
          <button style="background:none;border:none;cursor:pointer;color:#9ca3af;font-size:18px;line-height:1;padding:0;" aria-label="Close">×</button>
        </div>
        <div style="padding:14px 16px;font-size:13px;color:#6b7280;line-height:1.6;">Content goes here.</div>
        <div style="padding:10px 16px;border-top:1px solid ${n200};display:flex;justify-content:flex-end;gap:8px;">
          <button style="padding:7px 14px;font-size:13px;background:transparent;color:#6b7280;border:1px solid ${n300};border-radius:${brSm};cursor:pointer;font-family:inherit;">Cancel</button>
          <button style="padding:7px 14px;font-size:13px;background:${p6};color:#fff;border:none;border-radius:${brSm};cursor:pointer;font-family:inherit;font-weight:500;">Confirm</button>
        </div>
      </div>`;
    }

    // ── Tooltip / Popover ────────────────────────────────────────────────
    case "tooltip": {
      return `<div style="display:inline-flex;flex-direction:column;align-items:center;gap:6px;">
        <div style="padding:5px 10px;background:#111827;color:#fff;font-size:12px;border-radius:${brSm};white-space:nowrap;">${escapeHtml(displayName)} text</div>
        <div style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:5px solid #111827;"></div>
        <button style="padding:7px 16px;font-size:13px;background:#fff;color:${p6};border:1px solid ${p6};border-radius:${br};cursor:pointer;font-family:inherit;">Hover target</button>
      </div>`;
    }

    // ── Tabs / Segmented control ─────────────────────────────────────────
    case "tabs": {
      const tabs   = variants.length ? variants.slice(0, 4) : ["Tab 1", "Tab 2", "Tab 3"];
      const active = variant || tabs[0];
      return `<div style="display:inline-flex;border-bottom:1px solid ${n200};min-width:220px;">` +
        tabs.map(t => `<button style="padding:9px 16px;font-size:13px;font-weight:${t === active ? "500" : "400"};color:${t === active ? p6 : "#6b7280"};background:none;border:none;border-bottom:${t === active ? `2px solid ${p6}` : "2px solid transparent"};cursor:pointer;font-family:inherit;">${escapeHtml(t)}</button>`).join("") +
      `</div>`;
    }

    // ── Accordion / Collapse ─────────────────────────────────────────────
    case "accordion": {
      return `<div style="min-width:240px;border:1px solid ${n200};border-radius:${br};overflow:hidden;">
        <button style="width:100%;padding:11px 14px;background:${n50};border:none;display:flex;justify-content:space-between;align-items:center;font-size:13px;font-weight:500;color:${n700};cursor:pointer;font-family:inherit;border-bottom:1px solid ${n200};">Section A <span>▲</span></button>
        <div style="padding:10px 14px;font-size:12px;color:#6b7280;background:#fff;">Expanded content for Section A.</div>
        <button style="width:100%;padding:11px 14px;background:#fff;border:none;display:flex;justify-content:space-between;align-items:center;font-size:13px;color:${n700};cursor:pointer;font-family:inherit;">Section B <span>▼</span></button>
      </div>`;
    }

    // ── Breadcrumb ───────────────────────────────────────────────────────
    case "breadcrumb": {
      const crumbs = ["Home", "Products", displayName];
      return `<nav aria-label="Breadcrumb"><ol style="display:flex;align-items:center;gap:6px;list-style:none;margin:0;padding:0;font-size:13px;color:#6b7280;">` +
        crumbs.map((c, i) => `<li style="display:flex;align-items:center;gap:6px;">
          ${i < crumbs.length - 1
            ? `<a style="color:${p6};text-decoration:none;">${escapeHtml(c)}</a><span>›</span>`
            : `<span style="color:${n700};font-weight:500;">${escapeHtml(c)}</span>`}
          </li>`).join("") +
      `</ol></nav>`;
    }

    // ── Pagination ───────────────────────────────────────────────────────
    case "pagination": {
      return `<nav aria-label="Pagination"><ol style="display:flex;gap:4px;list-style:none;margin:0;padding:0;">` +
        ["‹", "1", "2", "3", "4", "›"].map((p, i) =>
          `<li><button style="width:32px;height:32px;font-size:13px;border-radius:${brSm};border:1px solid ${n300};background:${i === 2 ? p6 : "#fff"};color:${i === 2 ? "#fff" : n700};cursor:pointer;font-family:inherit;">${p}</button></li>`
        ).join("") +
      `</ol></nav>`;
    }

    // ── Spinner / Loader ─────────────────────────────────────────────────
    case "spinner": {
      return `<div style="display:flex;flex-direction:column;align-items:center;gap:8px;">
        <div style="width:36px;height:36px;border:3px solid ${n200};border-top-color:${p6};border-radius:50%;animation:spin 1s linear infinite;"></div>
        <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
        <span style="font-size:12px;color:#6b7280;">Loading…</span>
      </div>`;
    }

    // ── Skeleton ─────────────────────────────────────────────────────────
    case "skeleton": {
      return `<div style="min-width:220px;display:flex;flex-direction:column;gap:8px;">
        <div style="height:14px;background:${n200};border-radius:${brSm};width:80%;"></div>
        <div style="height:12px;background:${n200};border-radius:${brSm};width:100%;"></div>
        <div style="height:12px;background:${n200};border-radius:${brSm};width:65%;"></div>
      </div>`;
    }

    // ── Progress bar ─────────────────────────────────────────────────────
    case "progress": {
      return `<div style="min-width:220px;">
        <div style="display:flex;justify-content:space-between;font-size:12px;color:${n700};margin-bottom:4px;"><span>${escapeHtml(displayName)}</span><span>65%</span></div>
        <div style="height:8px;background:${n200};border-radius:${brFull};overflow:hidden;">
          <div style="width:65%;height:100%;background:${p6};border-radius:${brFull};"></div>
        </div>
      </div>`;
    }

    // ── Avatar / Image ───────────────────────────────────────────────────
    case "avatar": {
      const initials  = displayName.split(/[\s_-]/).map(w => w[0]).join("").toUpperCase().slice(0, 2);
      const avatarSizeConfig = [{ s: "32px", f: "13px" }, { s: "40px", f: "15px" }, { s: "56px", f: "20px" }];
      return `<div style="display:flex;align-items:center;gap:10px;">` +
        avatarSizeConfig.map(({ s, f }) =>
          `<div style="width:${s};height:${s};border-radius:${brFull};background:${p100};display:flex;align-items:center;justify-content:center;font-size:${f};font-weight:600;color:${p6};">${initials}</div>`
        ).join("") +
      `</div>`;
    }

    // ── Icon ─────────────────────────────────────────────────────────────
    case "icon": {
      return `<div style="display:flex;align-items:center;gap:14px;">
        <span style="font-size:24px;color:${p6};">◈</span>
        <span style="font-size:24px;color:${n700};">◈</span>
        <span style="font-size:24px;color:${n300};">◈</span>
      </div>`;
    }

    // ── List / Menu / Navigation / Sidebar ───────────────────────────────
    case "list": {
      const items = variants.length ? variants.slice(0, 4) : ["Item one", "Item two", "Item three"];
      return `<ul style="list-style:none;margin:0;padding:0;min-width:180px;border:1px solid ${n200};border-radius:${br};overflow:hidden;background:#fff;">` +
        items.map((item, i) =>
          `<li style="padding:9px 14px;font-size:13px;${i === 0 ? `background:#eff6ff;color:${p6};font-weight:500;` : `color:${n700};`}border-bottom:${i < items.length - 1 ? `1px solid ${n200}` : "none"};">${escapeHtml(item)}</li>`
        ).join("") +
      `</ul>`;
    }

    // ── Table / Data grid ────────────────────────────────────────────────
    case "table": {
      const rows = [["Row A", "Value 1", "Active"], ["Row B", "Value 2", "Inactive"]];
      return `<table style="border-collapse:collapse;font-size:12px;width:100%;min-width:240px;border:1px solid ${n200};border-radius:${br};overflow:hidden;">
        <thead><tr style="background:${n50};">
          ${["Name", "Value", "Status"].map(h => `<th style="padding:7px 12px;text-align:left;font-weight:600;color:${n700};border-bottom:1px solid ${n200};">${h}</th>`).join("")}
        </tr></thead>
        <tbody>${rows.map((r, ri) => `<tr style="background:#fff;">
          ${r.map((c) => `<td style="padding:7px 12px;color:#4b5563;border-bottom:${ri < rows.length - 1 ? `1px solid ${n200}` : "none"};">${c}</td>`).join("")}
        </tr>`).join("")}</tbody>
      </table>`;
    }

    // ── Card / Panel / Container / Surface ───────────────────────────────
    case "card": {
      return `<div style="padding:18px;background:#fff;border-radius:${brLg};border:1px solid ${n200};box-shadow:${shMd};max-width:240px;">
        <div style="font-weight:600;font-size:14px;color:#111827;margin-bottom:6px;">${escapeHtml(displayName)}</div>
        <div style="font-size:12px;color:#6b7280;line-height:1.5;">Content for this ${escapeHtml(displayName.toLowerCase())} component.</div>
      </div>`;
    }

    // ── Form / Wizard / Step ─────────────────────────────────────────────
    case "form": {
      const fieldSize = sizes[0] || "md";
      return `<form style="display:flex;flex-direction:column;gap:10px;padding:18px;background:#fff;border:1px solid ${n200};border-radius:${br};width:230px;" onsubmit="return false">
        <div style="font-size:14px;font-weight:600;color:#111827;">${escapeHtml(displayName)}</div>
        <input type="text" placeholder="First field" data-size="${escapeHtml(fieldSize)}" style="padding:8px 10px;font-size:13px;border:1px solid ${n300};border-radius:${br};font-family:inherit;color:#111827;outline:none;" />
        <input type="text" placeholder="Second field" data-size="${escapeHtml(fieldSize)}" style="padding:8px 10px;font-size:13px;border:1px solid ${n300};border-radius:${br};font-family:inherit;color:#111827;outline:none;" />
        <button type="submit" style="padding:8px;font-size:13px;background:${p6};color:#fff;border:none;border-radius:${br};cursor:pointer;font-weight:500;font-family:inherit;">Submit</button>
      </form>`;
    }

    // ── Divider / Separator ──────────────────────────────────────────────
    case "divider": {
      return `<div style="min-width:240px;display:flex;flex-direction:column;gap:10px;">
        <span style="font-size:12px;color:#6b7280;">Content above</span>
        <hr style="border:none;border-top:1px solid ${n200};margin:0;" />
        <span style="font-size:12px;color:#6b7280;">Content below</span>
      </div>`;
    }

    // ── Default: descriptive card with variant chips ──────────────────────
    default: {
      const chips = variants.slice(0, 4)
        .map(v => `<span style="display:inline-block;padding:2px 9px;margin:2px;border-radius:${brFull};background:${p100};color:${p6};font-size:11px;border:1px solid #bfdbfe;">${escapeHtml(v)}</span>`)
        .join("");
      return `<div style="padding:16px 20px;background:#fff;border-radius:${br};border:1px solid ${n200};max-width:280px;">
        <div style="font-size:13px;font-weight:600;color:#111827;margin-bottom:6px;">${escapeHtml(displayName)}</div>
        ${comp.description ? `<div style="font-size:11px;color:#6b7280;line-height:1.5;${chips ? "margin-bottom:10px;" : ""}">${escapeHtml(comp.description)}</div>` : ""}
        ${chips ? `<div>${chips}</div>` : ""}
      </div>`;
    }
  }
}

export function initGallery() {
  const searchEl  = document.getElementById("gallery-search");
  const refreshBtn = document.getElementById("gallery-refresh-btn");

  searchEl.addEventListener("input", () => {
    if (galleryLoaded) renderGalleryGrid(searchEl.value);
  });

  refreshBtn.addEventListener("click", () => {
    galleryLoaded = false;
    galleryActiveVariants = {};
    loadGallery();
  });
}

export function isGalleryLoaded() { return galleryLoaded; }

export function resetAndReloadGallery() {
  galleryLoaded = false;
  galleryActiveVariants = {};
  loadGallery();
}
