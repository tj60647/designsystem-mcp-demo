import { escapeHtml } from './utils.js';

// ── Local state ──────────────────────────────────────────────────────────────
let explorerLoaded   = false;
let explorerData     = {};
let selectedCompKey  = null;
let activeDetailPane = "overview";

export function isExplorerLoaded() { return explorerLoaded; }

export function resetAndReloadExplorer() {
  explorerLoaded  = false;
  selectedCompKey = null;
  document.getElementById("comp-detail").classList.remove("open");
  loadExplorer();
}

export async function loadExplorer() {
  const body = document.getElementById("explorer-body");
  body.innerHTML = '<div class="explorer-empty"><div class="explorer-empty-icon">&#9647;</div><div class="explorer-empty-text">Loading components…</div></div>';
  try {
    const res = await fetch("/api/data/components");
    if (!res.ok) throw new Error("HTTP " + res.status);
    explorerData  = await res.json();
    explorerLoaded = true;
    renderExplorerGrid(document.getElementById("explorer-search").value);
  } catch (err) {
    body.innerHTML = `<div class="explorer-empty"><div class="explorer-empty-icon">&#9888;</div><div class="explorer-empty-text">Could not load components: ${escapeHtml(err.message)}</div></div>`;
  }
}

function renderExplorerGrid(filter) {
  const body = document.getElementById("explorer-body");
  const keys = Object.keys(explorerData).filter(k => {
    if (!filter) return true;
    const f = filter.toLowerCase();
    const c = explorerData[k];
    return k.toLowerCase().includes(f) || (c.name || "").toLowerCase().includes(f) || (c.description || "").toLowerCase().includes(f);
  });

  if (keys.length === 0) {
    body.innerHTML = `<div class="explorer-empty"><div class="explorer-empty-icon">&#9647;</div><div class="explorer-empty-text">${filter ? "No components match your filter." : "No components loaded."}</div></div>`;
    return;
  }

  const grid = document.createElement("div");
  grid.className = "explorer-grid";

  for (const key of keys) {
    const comp = explorerData[key];
    const card = document.createElement("div");
    card.className = "comp-card" + (key === selectedCompKey ? " selected" : "");
    card.dataset.key = key;

    const name = document.createElement("div");
    name.className = "comp-card-name";
    name.textContent = comp.name || key;
    card.appendChild(name);

    const desc = document.createElement("div");
    desc.className = "comp-card-desc";
    desc.textContent = comp.description || "";
    card.appendChild(desc);

    const chips = document.createElement("div");
    chips.className = "comp-card-chips";
    for (const v of (comp.variants || []).slice(0, 4)) {
      const chip = document.createElement("span");
      chip.className = "comp-card-chip variant";
      chip.textContent = v;
      chips.appendChild(chip);
    }
    for (const s of (comp.sizes || []).slice(0, 3)) {
      const chip = document.createElement("span");
      chip.className = "comp-card-chip size";
      chip.textContent = s;
      chips.appendChild(chip);
    }
    card.appendChild(chips);

    card.addEventListener("click", () => openCompDetail(key));
    grid.appendChild(card);
  }

  body.innerHTML = "";
  body.appendChild(grid);
}

function openCompDetail(key) {
  selectedCompKey = key;
  document.querySelectorAll(".comp-card").forEach(c => {
    c.classList.toggle("selected", c.dataset.key === key);
  });

  const comp = explorerData[key];
  document.getElementById("comp-detail-title").textContent = comp.name || key;
  activeDetailPane = "overview";
  renderDetailPane(comp, activeDetailPane);

  const detail = document.getElementById("comp-detail");
  detail.classList.add("open");

  document.querySelectorAll(".comp-detail-tab").forEach(t => {
    t.classList.toggle("active", t.dataset.pane === "overview");
  });
}

function renderDetailPane(comp, pane) {
  const body = document.getElementById("comp-detail-body");

  if (pane === "overview") {
    let html = "";
    if (comp.description) {
      html += `<div class="detail-section"><div class="detail-section-title">Description</div><div>${escapeHtml(comp.description)}</div></div>`;
    }
    if (comp.variants?.length) {
      html += `<div class="detail-section"><div class="detail-section-title">Variants</div><div class="detail-chip-row">`;
      html += comp.variants.map(v => `<span class="detail-chip variant">${escapeHtml(v)}</span>`).join("");
      html += `</div></div>`;
    }
    if (comp.sizes?.length) {
      html += `<div class="detail-section"><div class="detail-section-title">Sizes</div><div class="detail-chip-row">`;
      html += comp.sizes.map(s => `<span class="detail-chip size">${escapeHtml(s)}</span>`).join("");
      html += `</div></div>`;
    }
    if (comp.states?.length) {
      html += `<div class="detail-section"><div class="detail-section-title">States</div><div class="detail-chip-row">`;
      html += comp.states.map(s => `<span class="detail-chip state">${escapeHtml(s)}</span>`).join("");
      html += `</div></div>`;
    }
    if (comp.constraints?.length) {
      html += `<div class="detail-section"><div class="detail-section-title">Constraints</div><ul style="padding-left:1.2em;line-height:1.8">`;
      html += comp.constraints.map(c => `<li>${escapeHtml(c)}</li>`).join("");
      html += `</ul></div>`;
    }
    if (comp.variantGuidance) {
      html += `<div class="detail-section"><div class="detail-section-title">Variant Guidance</div>`;
      for (const [k, v] of Object.entries(comp.variantGuidance)) {
        html += `<div style="margin-bottom:5px"><span class="detail-chip variant" style="margin-right:6px">${escapeHtml(k)}</span>${escapeHtml(String(v))}</div>`;
      }
      html += `</div>`;
    }
    body.innerHTML = html || "<em>No overview data.</em>";

  } else if (pane === "props") {
    const props = comp.props || {};
    const keys = Object.keys(props);
    if (!keys.length) { body.innerHTML = "<em>No props defined.</em>"; return; }
    let html = `<table class="props-table"><thead><tr><th>Prop</th><th>Type</th><th>Default</th><th>Req?</th></tr></thead><tbody>`;
    for (const k of keys) {
      const p = props[k] || {};
      const type = p.type || (p.values ? p.values.join(" | ") : "—");
      const def  = p.default !== undefined ? String(p.default) : "—";
      const req  = p.required ? "✓" : "";
      html += `<tr>
        <td>${escapeHtml(k)}</td>
        <td>${escapeHtml(type)}</td>
        <td>${escapeHtml(def)}</td>
        <td class="prop-required">${req}</td>
      </tr>`;
      if (p.description) {
        html += `<tr><td colspan="4" style="color:var(--text-dim);padding-top:0;font-size:10.5px;padding-bottom:6px">${escapeHtml(p.description)}</td></tr>`;
      }
    }
    html += `</tbody></table>`;
    body.innerHTML = html;

  } else if (pane === "anatomy") {
    const anatomy = comp.anatomy || {};
    let html = "";
    if (anatomy.root) {
      html += `<div class="detail-section"><div class="detail-section-title">Root Element</div><code style="font-family:monospace;color:var(--accent)">${escapeHtml(anatomy.root)}</code></div>`;
    }
    const slots = anatomy.slots || {};
    if (Object.keys(slots).length) {
      html += `<div class="detail-section"><div class="detail-section-title">Slots</div>`;
      for (const [name, desc] of Object.entries(slots)) {
        html += `<div class="anatomy-slot"><span class="anatomy-slot-name">${escapeHtml(name)}</span> — <span class="anatomy-slot-desc">${escapeHtml(String(desc))}</span></div>`;
      }
      html += `</div>`;
    }
    if (anatomy.validChildren?.length) {
      html += `<div class="detail-section"><div class="detail-section-title">Valid Children</div><div class="detail-chip-row">`;
      html += anatomy.validChildren.map(c => `<span class="detail-chip">${escapeHtml(c)}</span>`).join("");
      html += `</div></div>`;
    }
    if (anatomy.compositionNotes) {
      html += `<div class="detail-section"><div class="detail-section-title">Composition Notes</div>${escapeHtml(anatomy.compositionNotes)}</div>`;
    }
    body.innerHTML = html || "<em>No anatomy data.</em>";

  } else if (pane === "tokens") {
    const tokens = comp.tokens || {};
    if (!Object.keys(tokens).length) { body.innerHTML = "<em>No token references.</em>"; return; }
    let html = "";
    function renderTokenObj(obj, prefix) {
      for (const [k, v] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${k}` : k;
        if (v && typeof v === "object") {
          renderTokenObj(v, fullKey);
        } else {
          html += `<div class="token-ref"><span class="token-ref-key">${escapeHtml(fullKey)}</span><span class="token-ref-val">${escapeHtml(String(v))}</span></div>`;
        }
      }
    }
    renderTokenObj(tokens, "");
    body.innerHTML = `<div class="token-ref-row">${html}</div>`;

  } else if (pane === "a11y") {
    const a11y = comp.accessibility || {};
    if (!Object.keys(a11y).length) { body.innerHTML = "<em>No accessibility data.</em>"; return; }
    let html = "";
    for (const [section, val] of Object.entries(a11y)) {
      html += `<div class="detail-section"><div class="detail-section-title">${escapeHtml(section)}</div>`;
      if (Array.isArray(val)) {
        html += `<ul style="padding-left:1.2em;line-height:1.8">` + val.map(i => `<li>${escapeHtml(String(i))}</li>`).join("") + `</ul>`;
      } else if (val && typeof val === "object") {
        for (const [k, v] of Object.entries(val)) {
          html += `<div style="margin-bottom:4px"><span style="color:var(--text-dim);font-size:10px;text-transform:uppercase">${escapeHtml(k)}: </span>${escapeHtml(String(v))}</div>`;
        }
      } else {
        html += escapeHtml(String(val));
      }
      html += `</div>`;
    }
    body.innerHTML = html;
  }
}

export function initComponentExplorer() {
  const searchEl   = document.getElementById("explorer-search");
  const refreshBtn = document.getElementById("explorer-refresh-btn");
  const closeBtn   = document.getElementById("comp-detail-close");

  searchEl.addEventListener("input", () => {
    if (explorerLoaded) renderExplorerGrid(searchEl.value);
  });

  refreshBtn.addEventListener("click", () => {
    explorerLoaded  = false;
    selectedCompKey = null;
    document.getElementById("comp-detail").classList.remove("open");
    loadExplorer();
  });

  closeBtn.addEventListener("click", () => {
    document.getElementById("comp-detail").classList.remove("open");
    selectedCompKey = null;
    document.querySelectorAll(".comp-card").forEach(c => c.classList.remove("selected"));
  });

  document.querySelectorAll(".comp-detail-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".comp-detail-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      activeDetailPane = tab.dataset.pane;
      if (selectedCompKey && explorerData[selectedCompKey]) {
        renderDetailPane(explorerData[selectedCompKey], activeDetailPane);
      }
    });
  });
}
