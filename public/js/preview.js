import { escapeHtml } from './utils.js';

// ── Local state ──────────────────────────────────────────────────────────────
let currentHtmlCode = null;
let showingCode = false;
let currentBlobUrl = null;

// ── DOM refs (populated by initPreview) ──────────────────────────────────────
let previewBody, codeToggleBtn, modelBadge, toolsBody;

export function initPreview() {
  previewBody   = document.getElementById("preview-body");
  codeToggleBtn = document.getElementById("code-toggle-btn");
  modelBadge    = document.getElementById("model-badge");
  toolsBody     = document.getElementById("tools-body");

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
}

export function updateLivePreview(previewHtml, toolsUsed, model) {
  if (model) {
    modelBadge.textContent = model;
    modelBadge.style.display = "";
  }

  currentHtmlCode = previewHtml || null;
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

  updateToolsPanel(toolsUsed);
}

function updateToolsPanel(toolsUsed) {
  if (!toolsUsed || toolsUsed.length === 0) {
    toolsBody.innerHTML = `<div class="tools-empty">No MCP tools were called for this response.</div>`;
    return;
  }
  const items = toolsUsed.map(t => `<span class="tool-item">${escapeHtml(t)}</span>`).join("");
  toolsBody.innerHTML = `<div class="tools-list">${items}</div>`;
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
