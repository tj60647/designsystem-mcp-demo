import { escapeHtml, renderMarkdown, highlightTokens, loadAgentSettings } from './utils.js';
import { updateLivePreview } from './preview.js';

// ── Constants ────────────────────────────────────────────────────────────────
const DEFAULT_CHAT_MODEL = "openai/gpt-oss-20b:nitro";

// ── Local state ──────────────────────────────────────────────────────────────
const conversationHistory = [];
let isLoading = false;
let generatedDesignSystemData = null;
/** Agent used in the most recent completed turn — sent back to the server so
 *  short follow-up messages don't get mis-routed by the stateless orchestrator. */
let lastRoutedAgent = null;

// ── DOM refs (populated by initChat) ─────────────────────────────────────────
let messagesEl, chipsEl, inputEl, sendBtn, downloadDsBtn;

export function initChat() {
  messagesEl    = document.getElementById("messages");
  chipsEl       = document.getElementById("chips");
  inputEl       = document.getElementById("user-input");
  sendBtn       = document.getElementById("send-btn");
  downloadDsBtn = document.getElementById("download-ds-btn");

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
  return loadAgentSettings().global.model || DEFAULT_CHAT_MODEL;
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

  // Capture the stored agent for this single continuation turn, then clear it
  // immediately so topic changes on subsequent turns are re-routed fresh.
  const agentForThisTurn = lastRoutedAgent;
  lastRoutedAgent = null;

  try {
    const selectedModel = getSelectedModel();
    const agentSettings = loadAgentSettings();

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: conversationHistory,
        model: selectedModel,
        previousAgent: agentForThisTurn,
        agentSettings,
      }),
    });

    // Early validation errors (400, 503) are returned as plain JSON before SSE
    // headers are set, so we handle them here.
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      loadingEl.remove();
      const errMsg = data.error || "Request failed";
      appendMessage("error", "⚠ " + errMsg);
      return;
    }

    // Parse the Server-Sent Events stream for live progress + final result
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    // ── Live activity trace ───────────────────────────────────────────────
    // Rows are appended into the loading bubble as events arrive.
    // On "done" the trace is detached and re-attached as a collapsible block.
    let traceEl = null;
    const liveToolRows = new Map(); // callId → <div.trace-item>

    const feedbackState = {
      agent: "Routing",
      phase: "Preparing",
      action: "Waiting for first model step…",
      thought: "",
    };

    function summarizeThought(content) {
      const text = String(content || "").replace(/\s+/g, " ").trim();
      if (!text) return "";
      return text.length > 160 ? `${text.slice(0, 160)}…` : text;
    }

    function ensureLiveFeedback() {
      let panel = loadingEl.querySelector(".agent-live-feedback");
      if (panel) return panel;
      panel = document.createElement("div");
      panel.className = "agent-live-feedback";
      panel.innerHTML = `
        <div class="agent-live-title">Agent Feedback</div>
        <div class="agent-live-row"><span class="agent-live-key">Agent</span><span class="agent-live-val" data-live="agent"></span></div>
        <div class="agent-live-row"><span class="agent-live-key">Phase</span><span class="agent-live-val" data-live="phase"></span></div>
        <div class="agent-live-row"><span class="agent-live-key">Doing</span><span class="agent-live-val" data-live="action"></span></div>
        <div class="agent-live-row"><span class="agent-live-key">Thinking</span><span class="agent-live-val" data-live="thought"></span></div>
      `;
      loadingEl.querySelector(".loading-bubble").appendChild(panel);
      return panel;
    }

    function updateLiveFeedback() {
      const panel = ensureLiveFeedback();
      const setText = (key, value) => {
        const el = panel.querySelector(`[data-live="${key}"]`);
        if (el) el.textContent = value;
      };
      setText("agent", feedbackState.agent || "-");
      setText("phase", feedbackState.phase || "-");
      setText("action", feedbackState.action || "-");
      setText("thought", feedbackState.thought || "Waiting for reasoning…");
    }

    updateLiveFeedback();

    function getOrCreateTrace() {
      if (traceEl) return traceEl;
      traceEl = document.createElement("div");
      traceEl.className = "trace-live";
      loadingEl.querySelector(".loading-bubble").appendChild(traceEl);
      return traceEl;
    }

    function addTraceAgentRouted(agent, reason) {
      const trace = getOrCreateTrace();
      const row = document.createElement("div");
      row.className = "trace-item trace-routed";
      const agentLabel = { orchestrator: "Orchestrator", reader: "Design System Reader", builder: "Component Builder", generator: "System Generator", "style-guide": "Style Guide" }[agent] ?? agent;
      row.innerHTML = `<span class="trace-agent-name">${escapeHtml(agentLabel)}</span>`;
      if (reason) {
        const tip = document.createElement("span");
        tip.className = "trace-reason";
        tip.textContent = reason;
        row.appendChild(tip);
      }
      trace.appendChild(row);

      feedbackState.agent = agentLabel;
      feedbackState.phase = "Routed";
      feedbackState.action = reason || "Delegated to specialist agent.";
      updateLiveFeedback();
      scrollToBottom();
    }

    function addTraceToolCall(callId, tool, args) {
      const trace = getOrCreateTrace();
      const row = document.createElement("div");
      row.className = "trace-item trace-tool";

      // Format the first arg as a short inline hint
      let argHint = "";
      try {
        const keys = Object.keys(args || {});
        if (keys.length > 0) {
          const val = String(args[keys[0]]).slice(0, 35);
          argHint = `<span class="trace-arg-hint">${escapeHtml(keys[0])}: ${escapeHtml(val)}${String(args[keys[0]]).length > 35 ? "…" : ""}</span>`;
        }
      } catch { /* ignore */ }

      row.innerHTML = `<span class="trace-tool-name">${escapeHtml(tool)}</span>${argHint}`;

      // Make the row a toggle that reveals full args + result
      const detail = document.createElement("div");
      detail.className = "trace-detail";
      try {
        detail.innerHTML = `<div class="trace-detail-section"><span class="trace-detail-label">Args</span><pre class="trace-detail-code">${escapeHtml(JSON.stringify(args, null, 2))}</pre></div>`;
      } catch { /* ignore */ }
      row.appendChild(detail);

      row.addEventListener("click", () => row.classList.toggle("trace-expanded"));

      trace.appendChild(row);
      liveToolRows.set(callId, { row, detail });

      feedbackState.phase = "Tool Call";
      feedbackState.action = `Calling ${tool}`;
      updateLiveFeedback();
      scrollToBottom();
    }

    function addTraceReasoning(iteration, content) {
      const trace = getOrCreateTrace();
      const row = document.createElement("div");
      row.className = "trace-item trace-reasoning-row";
      const short = content.slice(0, 200).replace(/\n/g, ' ');
      row.innerHTML = `<span class="trace-reasoning-preview">${escapeHtml(short)}${content.length > 200 ? '…' : ''}</span>`;
      const detail = document.createElement("div");
      detail.className = "trace-detail";
      detail.innerHTML = `<div class="trace-detail-section"><pre class="trace-detail-code trace-reasoning-full">${escapeHtml(content)}</pre></div>`;
      row.appendChild(detail);
      row.addEventListener("click", () => row.classList.toggle("trace-expanded"));
      trace.appendChild(row);

      feedbackState.phase = "Reasoning";
      feedbackState.thought = summarizeThought(content);
      feedbackState.action = "Analyzing request and planning next step.";
      updateLiveFeedback();
      scrollToBottom();
    }

    function addTraceToolResult(callId, chars, preview) {
      const entry = liveToolRows.get(callId);
      if (!entry) return;
      const { row, detail } = entry;

      // Append size badge to the row header
      const badge = document.createElement("span");
      badge.className = "trace-result-badge";
      badge.textContent = chars < 1024 ? `${chars} chars` : `${(chars / 1024).toFixed(1)}k chars`;
      row.insertBefore(badge, row.querySelector(".trace-detail"));

      // Add result preview to the expandable section
      const resultSection = document.createElement("div");
      resultSection.className = "trace-detail-section";
      resultSection.innerHTML = `<span class="trace-detail-label">Result</span><pre class="trace-detail-code">${escapeHtml(preview)}</pre>`;
      detail.appendChild(resultSection);

      feedbackState.phase = "Tool Result";
      feedbackState.action = "Tool completed; integrating result.";
      updateLiveFeedback();
    }

    function finalizeTrace(routedAgent) {
      if (!traceEl || traceEl.children.length === 0) return null;

      const toolCount = liveToolRows.size;
      const summary = toolCount > 0
        ? `${toolCount} tool call${toolCount !== 1 ? "s" : ""}`
        : "Processed";

      const block = document.createElement("div");
      block.className = "thinking-block expanded";

      const toggle = document.createElement("button");
      toggle.className = "thinking-toggle";
      toggle.innerHTML = `<span class="thinking-toggle-icon">▶</span><span>Activity — ${escapeHtml(summary)}</span>`;
      toggle.addEventListener("click", () => block.classList.toggle("expanded"));

      const wrapper = document.createElement("div");
      wrapper.className = "thinking-steps trace-finalized";
      wrapper.appendChild(traceEl);

      block.appendChild(toggle);
      block.appendChild(wrapper);
      messagesEl.appendChild(block);
      return block;
    }
    // ─────────────────────────────────────────────────────────────────────

    sseLoop: while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      // SSE messages are separated by a blank line (\n\n)
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";

      for (const part of parts) {
        if (!part.startsWith("data: ")) continue;
        let event;
        try {
          event = JSON.parse(part.slice(6));
        } catch {
          continue;
        }

        if (event.type === "progress") {
          updateLoadingStatus(loadingEl, event.message);
          feedbackState.phase = "Progress";
          feedbackState.action = event.message;
          updateLiveFeedback();
          scrollToBottom();
        } else if (event.type === "agent_routed") {
          addTraceAgentRouted(event.agent, event.reason);
        } else if (event.type === "tool_call") {
          addTraceToolCall(event.callId, event.tool, event.args);
        } else if (event.type === "tool_result") {
          addTraceToolResult(event.callId, event.chars, event.preview);
        } else if (event.type === "reasoning") {
          addTraceReasoning(event.iteration, event.content);
        } else if (event.type === "done") {
          loadingEl.remove();
          finalizeTrace(event.routedAgent);

          const message   = event.message || "";
          const preview   = event.preview || null;
          const toolsUsed = event.toolCallsUsed || [];
          conversationHistory.push({ role: "assistant", content: message });

          // Remember which specialist handled this turn so the server can skip
          // re-routing on the immediately following message.
          if (!agentForThisTurn && event.routedAgent && event.routedAgent !== "unified") {
            lastRoutedAgent = event.routedAgent;
          }

          const msgEl = appendMessage("assistant", message);
          if (event.fromCache) {
            const badge = document.createElement("span");
            badge.className = "cache-badge";
            badge.textContent = "cached";
            badge.title = "This response was served from cache — the same question was answered earlier.";
            msgEl.querySelector(".msg-bubble").appendChild(badge);
          }

          updateLivePreview(preview, toolsUsed, event.model, preview ? message : null, event.usage || null);

          if (event.generatedDesignSystem) {
            handleGeneratedDesignSystem(event.generatedDesignSystem);
          }
          break sseLoop;
        } else if (event.type === "error") {
          loadingEl.remove();
          appendMessage("error", "⚠ " + (event.error || "Request failed"));
          break sseLoop;
        }
      }
    }
  } catch (err) {
    loadingEl.remove();
    const isTimeout = err.name === "AbortError";
    appendMessage("error", "⚠ " + (isTimeout
      ? "Request timed out. Please try again."
      : `Network error: ${err.message || err.name || "Unknown error"}`));
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
  bubble.innerHTML = '<div class="loading-dots"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div><span class="loading-status"></span>';
  wrap.appendChild(bubble);
  messagesEl.appendChild(wrap);
  return wrap;
}

function updateLoadingStatus(loadingEl, message) {
  const statusEl = loadingEl.querySelector(".loading-status");
  if (statusEl) statusEl.textContent = message;
}

export function scrollToBottom() {
  requestAnimationFrame(() => { messagesEl.scrollTop = messagesEl.scrollHeight; });
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
