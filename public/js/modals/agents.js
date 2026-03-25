import { escapeHtml } from '../utils.js';

export function initAgentsModal() {
  const overlay   = document.getElementById("agents-modal");
  const body      = document.getElementById("agents-modal-body");
  const closeBtn  = document.getElementById("agents-modal-close");
  const cancelBtn = document.getElementById("agents-modal-cancel");
  const openBtn   = document.getElementById("view-agents-btn");
  const tabs      = overlay.querySelectorAll(".agents-tab");

  let agentData = null;
  let activeTab = "config";

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
        <div class="diag-label">system + conversation + tool defs</div>
        <div class="diag-row">
          <div class="diag-node purple">OpenRouter LLM</div>
        </div>
        <div class="diag-arrow-down">↓</div>
        <div class="diag-label">tool_calls[ ]  or  final JSON</div>
        <div class="diag-row" style="gap:32px">
          <div class="diag-node orange" style="font-size:11px">MCP Tool Calls<br><small style="opacity:.7;font-weight:400">runMcpTool()</small></div>
          <div class="diag-arrow" style="align-self:center">↺</div>
          <div class="diag-node" style="font-size:11px">loop up to<br>8 iterations</div>
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
      pane.innerHTML = `<div class="agents-tools-list">${toolCards}</div>`;
    } else if (tab === "diagram") {
      pane.innerHTML = renderDiagram();
    }

    body.appendChild(pane);
  }

  function switchTab(tab) {
    activeTab = tab;
    tabs.forEach(t => t.classList.toggle("active", t.dataset.tab === tab));
    if (agentData) renderPane(tab, agentData);
  }

  async function openModal() {
    body.innerHTML = '<div class="agents-loading">Loading agent info…</div>';
    overlay.classList.add("open");

    try {
      if (!agentData) {
        const res = await fetch("/api/agent-info");
        if (!res.ok) throw new Error("HTTP " + res.status);
        const data = await res.json();
        agentData = data.agents[0];
      }
      renderPane(activeTab, agentData);
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
