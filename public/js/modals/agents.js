import { escapeHtml } from '../utils.js';

export function initAgentsModal() {
  const overlay    = document.getElementById("agents-modal");
  const modalBody  = document.getElementById("agents-modal-modalBody");
  const closeBtn  = document.getElementById("agents-modal-close");
  const cancelBtn = document.getElementById("agents-modal-cancel");
  const openBtn   = document.getElementById("view-agents-btn");
  const lobbyTabs = overlay.querySelectorAll(".agents-lobby-tab");

  let allAgents = [];
  let activeTab = "lobby";

  // Colour token per agent index — matches diagram node colours
  const ROLE_COLORS = ["purple", "accent", "orange", "green"];

  // ── System Diagram ─────────────────────────────────────────────────────
  function renderDiagram() {
    modalBody.innerHTML = `
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

  // ── Agent Lobby ────────────────────────────────────────────────────────
  function buildToolCards(tools) {
    return tools.map(t => {
      const params   = t.parameters && t.parameters.properties ? Object.keys(t.parameters.properties) : [];
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
  }

  function renderLobby() {
    const cards = allAgents.map((agent, i) => {
      const color = ROLE_COLORS[i] ?? "accent";
      const toolCount = agent.tools.length;
      const cardId = `agent-card-${i}`;
      return `
      <div class="lobby-card" data-color="${color}">
        <div class="lobby-card-header">
          <div class="lobby-card-name">${escapeHtml(agent.name)}</div>
          <div class="lobby-card-badges">
            <span class="lobby-badge">${toolCount} tool${toolCount !== 1 ? "s" : ""}</span>
            <span class="lobby-badge">${escapeHtml(String(agent.parameters.maxIterations))} iter${agent.parameters.maxIterations !== 1 ? "s" : ""}</span>
          </div>
        </div>
        <div class="lobby-card-desc">${escapeHtml(agent.description)}</div>
        <div class="lobby-card-model">${escapeHtml(agent.model)}</div>
        <div class="lobby-card-actions">
          <button class="lobby-toggle-btn" data-target="${cardId}-prompt">System Prompt</button>
          <button class="lobby-toggle-btn" data-target="${cardId}-tools">Tools</button>
        </div>
        <div class="lobby-card-detail" id="${cardId}-prompt">
          <pre class="agents-prompt-pre lobby-prompt-pre">${escapeHtml(agent.systemPrompt)}</pre>
        </div>
        <div class="lobby-card-detail" id="${cardId}-tools">
          <div class="agents-tools-list">${buildToolCards(agent.tools)}</div>
        </div>
      </div>`;
    }).join("");

    modalBody.innerHTML = `<div class="lobby-grid">${cards}</div>`;

    // Wire up expand/collapse toggles
    modalBody.querySelectorAll(".lobby-toggle-btn").forEach(btn => {
      const target = document.getElementById(btn.dataset.target);
      btn.addEventListener("click", () => {
        const open = target.classList.toggle("open");
        btn.classList.toggle("active", open);
        // Collapse the sibling detail if this one just opened
        if (open) {
          const card = btn.closest(".lobby-card");
          card.querySelectorAll(".lobby-card-detail.open").forEach(el => {
            if (el !== target) {
              el.classList.remove("open");
              const siblingBtn = card.querySelector(`[data-target="${el.id}"]`);
              if (siblingBtn) siblingBtn.classList.remove("active");
            }
          });
        }
      });
    });
  }

  // ── Tab switching ──────────────────────────────────────────────────────
  function switchTab(tab) {
    activeTab = tab;
    lobbyTabs.forEach(t => t.classList.toggle("active", t.dataset.tab === tab));
    if (tab === "diagram") renderDiagram();
    else if (allAgents.length > 0) renderLobby();
  }

  // ── Open / close ───────────────────────────────────────────────────────
  async function openModal() {
    modalBody.innerHTML = '<div class="agents-loading">Loading agent info…</div>';
    overlay.classList.add("open");
    try {
      if (allAgents.length === 0) {
        const res = await fetch("/api/agent-info");
        if (!res.ok) throw new Error("HTTP " + res.status);
        const data = await res.json();
        allAgents = data.agents ?? [];
      }
      switchTab(activeTab);
    } catch (err) {
      modalBody.innerHTML = `<div class="agents-loading">Could not load agent info: ${escapeHtml(err.message)}</div>`;
    }
  }

  function closeModal() { overlay.classList.remove("open"); }

  lobbyTabs.forEach(t => t.addEventListener("click", () => switchTab(t.dataset.tab)));
  openBtn.addEventListener("click", openModal);
  closeBtn.addEventListener("click", closeModal);
  cancelBtn.addEventListener("click", closeModal);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay.classList.contains("open")) closeModal();
  });
}
