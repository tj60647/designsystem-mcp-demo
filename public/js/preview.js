import { escapeHtml, renderMarkdown, highlightTokens } from './utils.js';

// ── Local state ──────────────────────────────────────────────────────────────
let currentHtmlCode = null;
let showingCode = false;
let currentBlobUrl = null;

// ── Preview history ───────────────────────────────────────────────────────────
// Each entry: { html, toolsUsed, model, notes }
const history = [];
let historyIndex = -1;

// ── DOM refs (populated by initPreview) ──────────────────────────────────────
let previewBody, codeToggleBtn, modelBadge, toolsBody, notesBody;
let previewNav, previewPrev, previewNext, previewNavCounter;
let tabMcpTools, tabPreviewNotes;

export function initPreview() {
  previewBody   = document.getElementById("preview-body");
  codeToggleBtn = document.getElementById("code-toggle-btn");
  modelBadge    = document.getElementById("model-badge");
  toolsBody     = document.getElementById("tools-body");
  notesBody     = document.getElementById("preview-notes-body");
  previewNav    = document.getElementById("preview-nav");
  previewPrev   = document.getElementById("preview-prev");
  previewNext   = document.getElementById("preview-next");
  previewNavCounter = document.getElementById("preview-nav-counter");
  tabMcpTools      = document.getElementById("tab-mcp-tools");
  tabPreviewNotes  = document.getElementById("tab-preview-notes");

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
}

function activateBottomTab(which) {
  const showTools = which === "tools";
  tabMcpTools.classList.toggle("active", showTools);
  tabPreviewNotes.classList.toggle("active", !showTools);
  tabMcpTools.setAttribute("aria-selected", String(showTools));
  tabPreviewNotes.setAttribute("aria-selected", String(!showTools));
  toolsBody.style.display  = showTools ? "" : "none";
  notesBody.style.display  = showTools ? "none" : "";
}

export function updateLivePreview(previewHtml, toolsUsed, model, notes) {
  // Push a new history entry (only when there's something to show)
  history.push({ html: previewHtml || null, toolsUsed: toolsUsed || [], model: model || null, notes: notes || null });
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
