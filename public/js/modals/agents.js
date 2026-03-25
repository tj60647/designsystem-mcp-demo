import { escapeHtml } from '../utils.js';

export function initAgentsModal() {
  const overlay    = document.getElementById("agents-modal");
  const body       = document.getElementById("agents-modal-body");
  const closeBtn   = document.getElementById("agents-modal-close");
  const cancelBtn  = document.getElementById("agents-modal-cancel");
  const openBtn    = document.getElementById("view-agents-btn");
  const tabs       = overlay.querySelectorAll(".agents-tab");
  const selectorEl = document.getElementById("agents-selector");

  let allAgents = [];
  let selectedAgentIndex = 0;
  let activeTab = "config";

  // Colour tokens for each agent's selector pill (matches diagram nodes)
  const ROLE_COLORS = ["purple", "accent", "orange", "green"];

  // ── Agent selector pills ──────────────────────────────────────────────
  function renderSelector() {
    if (!selectorEl) return;
    if (allAgents.length === 0) { selectorEl.innerHTML = ""; return; }
    selectorEl.innerHTML = allAgents.map((a, i) =>
      `<button class="agents-selector-btn${i === selectedAgentIndex ? " active" : ""}" data-idx="${i}"
        data-color="${ROLE_COLORS[i] ?? "accent"}"
      >${escapeHtml(a.name)}</button>`
    ).join("");
    selectorEl.querySelectorAll(".agents-selector-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        selectedAgentIndex = parseInt(btn.dataset.idx, 10);
        renderSelector();
        if (activeTab !== "diagram") renderPane(activeTab, allAgents[selectedAgentIndex]);
      });
    });
  }

  // ── System Diagram (always shows full 4-agent architecture) ───────────
  function renderDiagram() {
    return `
    <div class="diagram-wrap">
      <div class="diagram">
        <div class="diag-row">
          <div class="diag-node accent">User Input</div>
        </div>
        <div class="diag-arrow-down">↓</div>
        <div class="diag-label">POST /api/chat  { messages[] }</div>
        <div class="diag-row">
          <div class="diag-node accent">Chat API  <small style="opacity:.7;font-weight:400">/api/chat</small></div>
        </div>
        <div class="diag-arrow-down">↓</div>
        <div class="diag-label">last user message</div>
        <div class="diag-row">
          <div class="diag-node purple">Orchestrator Agent<br><small style="opacity:.7;font-weight:400">classify intent — 1 LLM call</small></div>
        </div>
        <div class="diag-arrow-down">↓</div>
        <div class="diag-label">delegate_to_agent("reader" | "builder" | "generator")</div>
        <div class="diag-row" style="gap:10px;align-items:stretch">
          <div class="diag-node accent" style="font-size:11px;flex:1;text-align:center">
            Design System<br>Reader<br><small style="opacity:.7;font-weight:400">up to 5 iters</small>
          </div>
          <div class="diag-node orange" style="font-size:11px;flex:1;text-align:center">
            Component<br>Builder<br><small style="opacity:.7;font-weight:400">up to 6 iters</small>
          </div>
          <div class="diag-node green" style="font-size:11px;flex:1;text-align:center">
            System<br>Generator<br><small style="opacity:.7;font-weight:400">up to 10 iters</small>
          </div>
        </div>
        <div class="diag-arrow-down">↓</div>
        <div class="diag-label">tool calls (per-agent subset)</div>
        <div class="diag-row" style="gap:32px">
          <div class="diag-node orange" style="font-size:11px">MCP Tool Calls<br><small style="opacity:.7;font-weight:400">runMcpTool()</small></div>
          <div class="diag-arrow" style="align-self:center">↺</div>
          <div class="diag-node" style="font-size:11px">agentic<br>loop</div>
        </div>
        <div class="diag-arrow-down">↓</div>
        <div class="diag-label">JSON { "message":"…", "preview":"…html…" }</div>
        <div class="diag-row">
          <div class="diag-node green">✓ parseChatResponse()</div>
        </div>
        <div class="diag-arrow-down">↓</div>
        <div class="diag-split">
          <div class="diag-branch">
            <div class="diag-node accent" style="font-size:11px">message<br><small style="opacity:.7;font-weight:400">Chat bubble</small></div>
          </div>
          <div class="diag-branch">
            <div class="diag-node green" style="font-size:11px">preview<br><small style="opacity:.7;font-weight:400">Live Preview iframe</small></div>
            <div class="diag-arrow-down">↓</div>
            <div class="diag-node" style="font-size:11px">Show Code ⟷ Show Preview toggle</div>
          </div>
        </div>
      </div>
    </div>`;
  }

  // ── Pane renderer ─────────────────────────────────────────────────────
  function renderPane(tab, agent) {
    body.innerHTML = "";
    const pane = document.createElement("div");
    pane.className = "agents-pane active";

    if (tab === "config") {
      pane.innerHTML = `
        <div class="agents-field">
          <div class="agents-field-label">Agent Name</div>
          <div class="agents-value">${escapeHtml(agent.name)}</div>
        </div>
        <div class="agents-field">
          <div class="agents-field-label">Description</div>
          <div class="agents-value" style="font-family:inherit;font-size:12px">${escapeHtml(agent.description)}</div>
        </div>
        <div class="agents-field">
          <div class="agents-field-label">Model</div>
          <div class="agents-value">${escapeHtml(agent.model)}</div>
        </div>
        <div class="agents-field">
          <div class="agents-field-label">Parameters</div>
          <div class="agents-value">${
            Object.entries(agent.parameters).map(([k, v]) =>
              `<div><span style="color:var(--purple)">${escapeHtml(k)}</span>: <span style="color:var(--text)">${escapeHtml(String(v))}</span></div>`
            ).join("")
          }</div>
        </div>
        <div class="agents-field">
          <div class="agents-field-label">Prompt Logging</div>
          <div class="agents-value" style="font-family:inherit;font-size:12px">Server-side <code style="background:rgba(0,0,0,.2);padding:1px 5px;border-radius:3px;font-size:11px">console.log("[chat:prompt]", ...)</code> on every agentic-loop iteration. Check your server process stdout for full prompt traces.</div>
        </div>`;
    } else if (tab === "prompt") {
      pane.innerHTML = `
        <div class="agents-field">
          <div class="agents-field-label">Exact System Instructions  <span style="color:var(--text-dim);text-transform:none;font-weight:400;font-size:9px">(sent verbatim as the system message)</span></div>
          <pre class="agents-prompt-pre">${escapeHtml(agent.systemPrompt)}</pre>
        </div>`;
    } else if (tab === "tools") {
      const toolCards = agent.tools.map(t => {
        const params = t.parameters && t.parameters.properties
          ? Object.keys(t.parameters.properties)
          : [];
        const required = (t.parameters && t.parameters.required) || [];
        const paramHtml = params.length
          ? params.map(p => `<span class="agents-param-chip">${escapeHtml(p)}${required.includes(p) ? "<sup style='color:var(--red)'>*</sup>" : ""}</span>`).join("")
          : "<span style='font-size:10.5px;color:var(--text-dim);font-style:italic'>no parameters</span>";
        return `<div class="agents-tool-card">
          <div class="agents-tool-name">${escapeHtml(t.name)}</div>
          <div class="agents-tool-desc">${escapeHtml(t.description)}</div>
          <div class="agents-tool-params">${paramHtml}</div>
        </div>`;
      }).join("");
      const toolCount = agent.tools.length;
      pane.innerHTML = `
        <div style="font-size:11px;color:var(--text-dim);margin-bottom:10px">${toolCount} tool${toolCount !== 1 ? "s" : ""} available to this agent</div>
        <div class="agents-tools-list">${toolCards}</div>`;
    } else if (tab === "diagram") {
      pane.innerHTML = renderDiagram();
    }

    body.appendChild(pane);
  }

  function switchTab(tab) {
    activeTab = tab;
    tabs.forEach(t => t.classList.toggle("active", t.dataset.tab === tab));
    if (allAgents.length > 0) renderPane(tab, allAgents[selectedAgentIndex]);
  }

  async function openModal() {
    body.innerHTML = '<div class="agents-loading">Loading agent info…</div>';
    overlay.classList.add("open");

    try {
      if (allAgents.length === 0) {
        const res = await fetch("/api/agent-info");
        if (!res.ok) throw new Error("HTTP " + res.status);
        const data = await res.json();
        allAgents = data.agents ?? [];
        selectedAgentIndex = 0;
      }
      renderSelector();
      renderPane(activeTab, allAgents[selectedAgentIndex]);
    } catch (err) {
      body.innerHTML = `<div class="agents-loading">Could not load agent info: ${escapeHtml(err.message)}</div>`;
    }
  }

  function closeModal() { overlay.classList.remove("open"); }

  tabs.forEach(t => t.addEventListener("click", () => switchTab(t.dataset.tab)));
  openBtn.addEventListener("click", openModal);
  closeBtn.addEventListener("click", closeModal);
  cancelBtn.addEventListener("click", closeModal);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay.classList.contains("open")) closeModal();
  });
}
