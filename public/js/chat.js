import { escapeHtml, renderMarkdown, highlightTokens } from './utils.js';
import { updateLivePreview } from './preview.js';

// ── Constants ────────────────────────────────────────────────────────────────
const MODEL_STORAGE_KEY  = "designsystem-mcp-demo.chat.model";
const DEFAULT_CHAT_MODEL = "openai/gpt-oss-20b:nitro";

// ── Local state ──────────────────────────────────────────────────────────────
const conversationHistory = [];
let isLoading = false;
let generatedDesignSystemData = null;

// ── DOM refs (populated by initChat) ─────────────────────────────────────────
let messagesEl, chipsEl, inputEl, sendBtn, downloadDsBtn, modelSelect;

export function initChat() {
  messagesEl    = document.getElementById("messages");
  chipsEl       = document.getElementById("chips");
  inputEl       = document.getElementById("user-input");
  sendBtn       = document.getElementById("send-btn");
  downloadDsBtn = document.getElementById("download-ds-btn");
  modelSelect   = document.getElementById("model-select");

  restoreModelSelection();
  modelSelect?.addEventListener("change", () => {
    localStorage.setItem(MODEL_STORAGE_KEY, getSelectedModel());
  });

  inputEl.addEventListener("input", () => {
    inputEl.style.height = "auto";
    inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + "px";
  });

  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  sendBtn.addEventListener("click", handleSend);
  downloadDsBtn.addEventListener("click", downloadGeneratedDesignSystem);

  loadTemplates();
}

// ── Model selection ───────────────────────────────────────────────────────────
function getSelectedModel() {
  return modelSelect?.value || DEFAULT_CHAT_MODEL;
}

function restoreModelSelection() {
  const savedModel = localStorage.getItem(MODEL_STORAGE_KEY);
  const nextModel  = savedModel || DEFAULT_CHAT_MODEL;
  if (!modelSelect) return;
  const exists = Array.from(modelSelect.options).some((opt) => opt.value === nextModel);
  if (!exists && nextModel) {
    const custom = document.createElement("option");
    custom.value = nextModel;
    custom.textContent = `${nextModel} (saved)`;
    modelSelect.appendChild(custom);
  }
  modelSelect.value = nextModel;
}


async function loadTemplates() {
  try {
    const res  = await fetch("/prompt-templates");
    const data = await res.json();
    const templates = data.templates || [];
    chipsEl.innerHTML = "";
    for (const t of templates) {
      const chip = document.createElement("button");
      chip.className = "chip";
      chip.textContent = t.title;
      chip.title = t.description;
      chip.addEventListener("click", () => {
        inputEl.value = t.prompt;
        inputEl.style.height = "auto";
        inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + "px";
        handleSend();
      });
      chipsEl.appendChild(chip);
    }
  } catch (e) {
    console.warn("Could not load templates", e);
  }
}

// ── Chat logic ────────────────────────────────────────────────────────────────
async function handleSend() {
  const text = inputEl.value.trim();
  if (!text || isLoading) return;

  inputEl.value = "";
  inputEl.style.height = "auto";
  isLoading = true;
  sendBtn.disabled = true;

  conversationHistory.push({ role: "user", content: text });
  appendMessage("user", text);

  const loadingEl = appendLoading();
  scrollToBottom();

  try {
    const res  = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: conversationHistory, model: getSelectedModel() }),
    });

    const data = await res.json();
    loadingEl.remove();

    if (!res.ok) {
      const errMsg = data.error || "Request failed";
      const details = data.details ? `\n${data.details}` : "";
      appendMessage("error", "⚠ " + errMsg + details);
    } else {
      const message   = data.message || "";
      const preview   = data.preview || null;
      const toolsUsed = data.toolCallsUsed || [];
      conversationHistory.push({ role: "assistant", content: message });

      if (data.thinkingSteps && data.thinkingSteps.length > 0) {
        appendThinkingBlock(data.thinkingSteps);
      }

      appendMessage("assistant", message);
      updateLivePreview(preview, toolsUsed, data.model);

      if (data.generatedDesignSystem) {
        handleGeneratedDesignSystem(data.generatedDesignSystem);
      }
    }
  } catch (err) {
    loadingEl.remove();
    appendMessage("error", "⚠ Network error: " + err.message);
  } finally {
    isLoading = false;
    sendBtn.disabled = false;
    scrollToBottom();
  }
}

// ── Append message to chat ────────────────────────────────────────────────────
export function appendMessage(role, text) {
  const wrap = document.createElement("div");
  wrap.className = `msg ${role}`;

  const bubble = document.createElement("div");
  bubble.className = "msg-bubble";

  if (role === "user" || role === "error") {
    bubble.textContent = text;
  } else {
    bubble.innerHTML = renderMarkdown(text);
    highlightTokens(bubble);
  }

  wrap.appendChild(bubble);
  messagesEl.appendChild(wrap);
  return wrap;
}

// ── Loading indicator ─────────────────────────────────────────────────────────
function appendLoading() {
  const wrap = document.createElement("div");
  wrap.className = "msg assistant";
  const bubble = document.createElement("div");
  bubble.className = "loading-bubble";
  bubble.innerHTML = '<div class="dot"></div><div class="dot"></div><div class="dot"></div>';
  wrap.appendChild(bubble);
  messagesEl.appendChild(wrap);
  return wrap;
}

export function scrollToBottom() {
  requestAnimationFrame(() => { messagesEl.scrollTop = messagesEl.scrollHeight; });
}

// ── Thinking / reasoning block ────────────────────────────────────────────────
function appendThinkingBlock(steps) {
  const toolSteps   = steps.filter(s => s.type === "tool_call");
  const reasonSteps = steps.filter(s => s.type === "reasoning");
  const totalSteps  = steps.length;

  const parts = [];
  if (toolSteps.length > 0) parts.push(`${toolSteps.length} tool call${toolSteps.length !== 1 ? "s" : ""}`);
  if (reasonSteps.length > 0) parts.push("model reasoning");
  const summary = parts.length > 0 ? parts.join(" · ") : `${totalSteps} step${totalSteps !== 1 ? "s" : ""}`;

  const block = document.createElement("div");
  block.className = "thinking-block";

  const toggle = document.createElement("button");
  toggle.className = "thinking-toggle";
  toggle.innerHTML = `<span class="thinking-toggle-icon">▶</span><span>Thought for ${summary}</span>`;
  toggle.addEventListener("click", () => block.classList.toggle("expanded"));

  const stepsEl = document.createElement("div");
  stepsEl.className = "thinking-steps";

  for (const step of steps) {
    const item = document.createElement("div");
    item.className = "thinking-step";

    if (step.type === "tool_call") {
      let argsLabel = "";
      try {
        const parsed = JSON.parse(step.args || "{}");
        const keys = Object.keys(parsed);
        if (keys.length > 0) {
          const first = String(parsed[keys[0]]).slice(0, 40);
          argsLabel = ` <span style="color:var(--text-dim);font-size:10.5px">${escapeHtml(keys[0])}: ${escapeHtml(first)}${first.length >= 40 ? "…" : ""}</span>`;
        }
      } catch { /* ignore */ }
      item.innerHTML = `<span class="thinking-step-tool"><span style="color:var(--text-dim)">Called</span> <span class="thinking-step-tool-name">${escapeHtml(step.tool)}</span>${argsLabel}</span>`;
    } else if (step.type === "reasoning") {
      item.innerHTML = `<div class="thinking-step-reasoning">${escapeHtml(step.content)}</div>`;
    }

    stepsEl.appendChild(item);
  }

  block.appendChild(toggle);
  block.appendChild(stepsEl);
  messagesEl.appendChild(block);
}

// ── Generated Design System handler ──────────────────────────────────────────
export function handleGeneratedDesignSystem(dsData) {
  generatedDesignSystemData = dsData;
  downloadDsBtn.style.display = "";

  const compKeys  = Object.keys(dsData.components  || {});
  const themeKeys = Object.keys(dsData.themes       || {});
  const iconKeys  = Object.keys(dsData.icons        || {});

  const card = document.createElement("div");
  card.className = "msg assistant";

  const inner = document.createElement("div");
  inner.className = "msg-bubble";
  inner.innerHTML = `
    <div class="generated-ds-card">
      <div class="generated-ds-header">
        <span class="generated-ds-header-icon">✨</span>
        Design System Generated
      </div>
      <div class="generated-ds-meta">
        ${compKeys.length} component${compKeys.length !== 1 ? "s" : ""}
        &nbsp;·&nbsp; ${themeKeys.length} theme${themeKeys.length !== 1 ? "s" : ""}
        &nbsp;·&nbsp; ${iconKeys.length} icon${iconKeys.length !== 1 ? "s" : ""}
      </div>
      <div class="generated-ds-actions">
        <button class="generated-ds-btn generated-ds-btn-primary" id="gen-view-btn">View in Component Explorer</button>
        <button class="generated-ds-btn generated-ds-btn-secondary" id="gen-download-btn">⬇ Download JSON</button>
      </div>
    </div>`;
  card.appendChild(inner);
  messagesEl.appendChild(card);
  scrollToBottom();

  inner.querySelector("#gen-view-btn").addEventListener("click", () => {
    if (typeof window.switchToExplorerTab === "function") window.switchToExplorerTab();
  });
  inner.querySelector("#gen-download-btn").addEventListener("click", downloadGeneratedDesignSystem);

  if (typeof window.notifyDataReloaded === "function") window.notifyDataReloaded();
  if (typeof window.switchToExplorerTab === "function") window.switchToExplorerTab();
}

function downloadGeneratedDesignSystem() {
  if (!generatedDesignSystemData) return;
  const json = JSON.stringify(generatedDesignSystemData, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;

  const themeNames = Object.keys((generatedDesignSystemData.themes || {}));
  const dsName = themeNames.length
    ? themeNames[0].replace(/[^a-z0-9]+/gi, "-").toLowerCase().replace(/^-+|-+$/g, "").replace(/-+/g, "-") || "design-system"
    : "design-system";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  a.download = `${dsName}-${stamp}.json`;

  a.click();
  URL.revokeObjectURL(url);
}
