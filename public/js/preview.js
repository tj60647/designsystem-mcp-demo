import { escapeHtml, renderMarkdown, highlightTokens } from './utils.js';

// ── Local state ──────────────────────────────────────────────────────────────
let currentHtmlCode = null;
let showingCode = false;
let currentBlobUrl = null;

// ── Preview history ───────────────────────────────────────────────────────────
// Each entry: { html, toolsUsed, model, notes, usage }
const history = [];
let historyIndex = -1;

// ── DOM refs (populated by initPreview) ──────────────────────────────────────
let previewBody, codeToggleBtn, modelBadge, toolsBody, notesBody, usageBody;
let previewNav, previewPrev, previewNext, previewNavCounter;
let tabMcpTools, tabPreviewNotes, tabUsage;
let isPreviewReady = false;

export function initPreview() {
  isPreviewReady = false;

  previewBody   = document.getElementById("preview-body");
  codeToggleBtn = document.getElementById("code-toggle-btn");
  modelBadge    = document.getElementById("model-badge");
  toolsBody     = document.getElementById("tools-body");
  notesBody     = document.getElementById("preview-notes-body");
  usageBody     = document.getElementById("usage-body");
  previewNav    = document.getElementById("preview-nav");
  previewPrev   = document.getElementById("preview-prev");
  previewNext   = document.getElementById("preview-next");
  previewNavCounter = document.getElementById("preview-nav-counter");
  tabMcpTools      = document.getElementById("tab-mcp-tools");
  tabPreviewNotes  = document.getElementById("tab-preview-notes");
  tabUsage         = document.getElementById("tab-usage");

  const requiredNodes = [
    ["preview-body", previewBody],
    ["code-toggle-btn", codeToggleBtn],
    ["model-badge", modelBadge],
    ["tools-body", toolsBody],
    ["preview-notes-body", notesBody],
    ["usage-body", usageBody],
    ["preview-nav", previewNav],
    ["preview-prev", previewPrev],
    ["preview-next", previewNext],
    ["preview-nav-counter", previewNavCounter],
    ["tab-mcp-tools", tabMcpTools],
    ["tab-preview-notes", tabPreviewNotes],
    ["tab-usage", tabUsage]
  ];

  const missing = requiredNodes.filter(([, node]) => !node).map(([id]) => id);
  if (missing.length > 0) {
    console.warn(`[preview] init skipped; missing DOM nodes: ${missing.join(", ")}`);
    return;
  }

  isPreviewReady = true;

  codeToggleBtn.addEventListener("click", () => {
    showingCode = !showingCode;
    if (showingCode) {
      renderCodeView();
      codeToggleBtn.textContent = "Show Preview";
      codeToggleBtn.classList.add("active");
    } else {
      renderIframeView();
      codeToggleBtn.textContent = "Show Code";
      codeToggleBtn.classList.remove("active");
    }
  });

  previewPrev.addEventListener("click", () => navigateHistory(historyIndex - 1));
  previewNext.addEventListener("click", () => navigateHistory(historyIndex + 1));

  // Bottom panel sub-tab switching
  tabMcpTools.addEventListener("click", () => activateBottomTab("tools"));
  tabPreviewNotes.addEventListener("click", () => activateBottomTab("notes"));
  tabUsage.addEventListener("click", () => activateBottomTab("usage"));
}

function activateBottomTab(which) {
  const isTools = which === "tools";
  const isNotes = which === "notes";
  const isUsage = which === "usage";
  tabMcpTools.classList.toggle("active", isTools);
  tabPreviewNotes.classList.toggle("active", isNotes);
  tabUsage.classList.toggle("active", isUsage);
  tabMcpTools.setAttribute("aria-selected", String(isTools));
  tabPreviewNotes.setAttribute("aria-selected", String(isNotes));
  tabUsage.setAttribute("aria-selected", String(isUsage));
  toolsBody.style.display = isTools ? "" : "none";
  notesBody.style.display = isNotes ? "" : "none";
  usageBody.style.display = isUsage ? "" : "none";
}

export function updateLivePreview(previewHtml, toolsUsed, model, notes, usage) {
  if (!isPreviewReady) return;

  // Push a new history entry (only when there's something to show)
  history.push({ html: previewHtml || null, toolsUsed: toolsUsed || [], model: model || null, notes: notes || null, usage: usage || null });
  historyIndex = history.length - 1;
  renderHistoryEntry(historyIndex);
}

function navigateHistory(idx) {
  if (idx < 0 || idx >= history.length) return;
  historyIndex = idx;
  renderHistoryEntry(historyIndex);
}

function renderHistoryEntry(idx) {
  const entry = history[idx];

  if (entry.model) {
    modelBadge.textContent = entry.model;
    modelBadge.style.display = "";
  } else {
    modelBadge.style.display = "none";
  }

  currentHtmlCode = entry.html;
  showingCode = false;

  if (currentHtmlCode) {
    codeToggleBtn.style.display = "";
    codeToggleBtn.textContent = "Show Code";
    codeToggleBtn.classList.remove("active");
    renderIframeView();
  } else {
    codeToggleBtn.style.display = "none";
    previewBody.innerHTML = `
      <div class="preview-empty">
        <div class="preview-empty-icon">◇</div>
        <div class="preview-empty-text">No UI was generated for this response.<br>Try asking to <em>create</em> or <em>build</em> a component.</div>
      </div>`;
  }

  updateToolsPanel(entry.toolsUsed);
  updateNotesPanel(entry.notes, !!entry.html);
  updateUsagePanel(entry.usage);
  syncNavControls();
}

function syncNavControls() {
  if (history.length > 1) {
    previewNav.style.display = "";
    previewNavCounter.textContent = `${historyIndex + 1} / ${history.length}`;
    previewPrev.disabled = historyIndex === 0;
    previewNext.disabled = historyIndex === history.length - 1;
  } else {
    previewNav.style.display = "none";
  }
}

function updateToolsPanel(toolsUsed) {
  if (!toolsUsed || toolsUsed.length === 0) {
    toolsBody.innerHTML = `<div class="tools-empty">No MCP tools were called for this response.</div>`;
    return;
  }
  const items = toolsUsed.map(t => `<span class="tool-item">${escapeHtml(t)}</span>`).join("");
  toolsBody.innerHTML = `<div class="tools-list">${items}</div>`;
}

function updateNotesPanel(notes, hasPreview) {
  if (!notes || !notes.trim()) {
    notesBody.innerHTML = `<div class="tools-empty">No notes for this response.</div>`;
    return;
  }
  const wrap = document.createElement("div");
  wrap.className = "preview-notes-content";
  wrap.innerHTML = renderMarkdown(notes);
  highlightTokens(wrap);
  notesBody.innerHTML = "";
  notesBody.appendChild(wrap);

  // Auto-switch to Notes tab when a UI preview was generated
  if (hasPreview) {
    activateBottomTab("notes");
  }
}

function updateUsagePanel(usage) {
  if (!usage || (usage.totalTokens === 0 && usage.cost === 0 && usage.promptTokens === 0)) {
    usageBody.innerHTML = `<div class="tools-empty">No usage data available for this response.</div>`;
    return;
  }

  const costStr = (typeof usage.cost === "number" && Number.isFinite(usage.cost) && usage.cost > 0)
    ? `$${usage.cost.toFixed(6)}`
    : "—";

  usageBody.innerHTML = `
    <div class="usage-grid">
      <div class="usage-row">
        <span class="usage-label">Prompt tokens</span>
        <span class="usage-value">${usage.promptTokens.toLocaleString()}</span>
      </div>
      <div class="usage-row">
        <span class="usage-label">Completion tokens</span>
        <span class="usage-value">${usage.completionTokens.toLocaleString()}</span>
      </div>
      <div class="usage-row usage-row-total">
        <span class="usage-label">Total tokens</span>
        <span class="usage-value">${usage.totalTokens.toLocaleString()}</span>
      </div>
      <div class="usage-row usage-row-cost">
        <span class="usage-label">Estimated cost</span>
        <span class="usage-value usage-cost">${escapeHtml(costStr)}</span>
      </div>
    </div>`;
}

function renderIframeView() {
  if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl);
  const iframeDoc = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    body { margin: 16px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; font-size: 14px; line-height: 1.5; }
  </style></head><body>${currentHtmlCode}</body></html>`;
  const blob = new Blob([iframeDoc], { type: "text/html" });
  currentBlobUrl = URL.createObjectURL(blob);
  previewBody.innerHTML = "";
  const iframe = document.createElement("iframe");
  iframe.className = "preview-iframe";
  iframe.src = currentBlobUrl;
  iframe.setAttribute("sandbox", "");
  iframe.title = "UI Preview";
  previewBody.appendChild(iframe);
}

function renderCodeView() {
  const escaped = escapeHtml(currentHtmlCode);
  previewBody.innerHTML = `
    <div class="code-view-wrap">
      <div class="code-view-toolbar">
        <button class="copy-code-btn" id="copy-code-btn">Copy HTML</button>
      </div>
      <pre class="code-view"><code>${escaped}</code></pre>
    </div>`;
  document.getElementById("copy-code-btn").addEventListener("click", copyCode);
}

function copyCode() {
  if (!currentHtmlCode) return;
  navigator.clipboard.writeText(currentHtmlCode).then(() => {
    const btn = document.getElementById("copy-code-btn");
    if (btn) { btn.textContent = "Copied!"; setTimeout(() => { btn.textContent = "Copy HTML"; }, 1500); }
  }).catch(() => {});
}
