import { escapeHtml, loadAgentSettings, saveAgentSettings } from '../utils.js';

export function initAgentsModal() {
  const overlay    = document.getElementById("agents-modal");
  const modalBody  = document.getElementById("agents-modal-body");
  const closeBtn  = document.getElementById("agents-modal-close");
  const cancelBtn = document.getElementById("agents-modal-cancel");
  const openBtn   = document.getElementById("view-agents-btn");
  const lobbyTabs = overlay.querySelectorAll(".agents-lobby-tab");

  let allAgents = [];
  let modelMeta = { model: "", modelSource: "" };
  let selectedModel = "";
  let settings = null;
  let lobbyFilter = "";
  let lobbyDensity = "detailed";
  let activeTab = "lobby";
  const LOBBY_DENSITY_KEY = "designsystem-mcp-demo.lobby-density";

  // Colour token per agent index — matches diagram node colours
  const ROLE_COLORS = ["purple", "accent", "orange", "green", "red"];

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
            System<br>Generator<br><small style="opacity:.7;font-weight:400">up to 8 iters</small>
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
      return `<details class="agents-tool-card">
        <summary class="agents-tool-summary">
          <span class="agents-tool-name">${escapeHtml(t.name)}</span>
          <span class="agents-tool-toggle"></span>
        </summary>
        <div class="agents-tool-desc">${escapeHtml(t.description)}</div>
        <div class="agents-tool-params">${paramHtml}</div>
      </details>`;
    }).join("");
  }

  function ensureSettings() {
    if (!settings) {
      settings = loadAgentSettings(selectedModel || modelMeta.model || "openai/gpt-oss-20b:nitro");
    }
    if (selectedModel) {
      settings.global.model = selectedModel;
    }
  }

  function getAgentSetting(agentKey) {
    ensureSettings();
    return settings.useGlobalModel ? settings.global : (settings.agents[agentKey] || settings.global);
  }

  function bindLobbyControls() {
    const densityButtons = modalBody.querySelectorAll('[data-role="density-toggle"]');
    densityButtons.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const next = String(e.currentTarget.getAttribute("data-density") || "detailed");
        if (next !== "compact" && next !== "detailed") return;
        lobbyDensity = next;
        try { localStorage.setItem(LOBBY_DENSITY_KEY, lobbyDensity); } catch { /* ignore */ }
        renderLobby();
      });
    });

    const filterInput = modalBody.querySelector('[data-role="agent-filter"]');
    if (filterInput) {
      filterInput.addEventListener("input", (e) => {
        lobbyFilter = String(e.target.value || "");
        renderLobby();
      });
    }

    const globalToggle = modalBody.querySelector('[data-role="use-global-model"]');
    if (globalToggle) {
      globalToggle.addEventListener("change", (e) => {
        ensureSettings();
        settings.useGlobalModel = Boolean(e.target.checked);
        saveAgentSettings(settings);
        renderLobby();
      });
    }

    modalBody.querySelectorAll('[data-setting="global-temp"]').forEach((el) => {
      el.addEventListener("change", (e) => {
        ensureSettings();
        const n = Number(e.target.value);
        settings.global.temperature = Number.isFinite(n) ? n : 0;
        saveAgentSettings(settings);
        renderLobby();
      });
    });

    modalBody.querySelectorAll('[data-agent-model]').forEach((el) => {
      el.addEventListener("change", (e) => {
        ensureSettings();
        const key = e.target.getAttribute("data-agent-model");
        const v = String(e.target.value || "").trim();
        if (!key || !v || !settings.agents[key]) return;
        settings.agents[key].model = v;
        saveAgentSettings(settings);
        renderLobby();
      });
    });

    modalBody.querySelectorAll('[data-agent-temp]').forEach((el) => {
      el.addEventListener("change", (e) => {
        ensureSettings();
        const key = e.target.getAttribute("data-agent-temp");
        const n = Number(e.target.value);
        if (!key || !settings.agents[key]) return;
        settings.agents[key].temperature = Number.isFinite(n) ? n : 0;
        saveAgentSettings(settings);
        renderLobby();
      });
    });

    modalBody.querySelectorAll('[data-action="toggle-tools"]').forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const card = e.target.closest(".lobby-card");
        if (!card) return;
        const details = card.querySelectorAll(".agents-tool-card");
        const anyClosed = Array.from(details).some((d) => !d.open);
        details.forEach((d) => { d.open = anyClosed; });
      });
    });
  }

  function renderLobby() {
    ensureSettings();
    const legendItems = allAgents.map((agent, i) => {
      const color = ROLE_COLORS[i] ?? "accent";
      return `<div class="lobby-legend-item"><span class="lobby-legend-dot" data-color="${color}"></span><span class="lobby-legend-label">${escapeHtml(agent.name)}</span></div>`;
    }).join("");

    const filteredAgents = allAgents.filter((agent) => {
      if (!lobbyFilter.trim()) return true;
      const q = lobbyFilter.trim().toLowerCase();
      const haystack = [
        agent.name,
        agent.description,
        agent.expectedInput,
        agent.expectedOutput,
        ...((agent.tools || []).map((t) => t.name)),
      ].join(" ").toLowerCase();
      return haystack.includes(q);
    });

    const globalSettings = modelMeta.model
      ? `<div class="lobby-global-settings">
          <div class="lobby-global-title">Global Model</div>
          <div class="lobby-controls-grid">
            <label class="lobby-check"><input type="checkbox" data-role="use-global-model" ${settings.useGlobalModel ? "checked" : ""}> Use global model for all agents</label>
            <label class="lobby-control">Model (from top bar)<input class="lobby-input" value="${escapeHtml(selectedModel || settings.global.model)}" disabled /></label>
            <label class="lobby-control">Temperature<input data-setting="global-temp" class="lobby-input" type="number" step="0.1" min="0" max="2" value="${escapeHtml(String(settings.global.temperature))}" /></label>
          </div>
          <div class="lobby-global-row"><span class="lobby-global-key">model</span><span class="lobby-global-val">${escapeHtml(modelMeta.model)}</span></div>
          <div class="lobby-global-row"><span class="lobby-global-key">source</span><span class="lobby-global-val">${escapeHtml(modelMeta.modelSource || "unknown")}</span></div>
        </div>`
      : "";

    const legend = `<div class="lobby-legend"><div class="lobby-global-title">Agent Legend</div><div class="lobby-legend-row">${legendItems}</div><div class="lobby-toolbar"><label class="lobby-control lobby-filter">Filter<input data-role="agent-filter" class="lobby-input" value="${escapeHtml(lobbyFilter)}" placeholder="Search agents or tools" /></label><div class="lobby-density-switch" role="group" aria-label="Lobby density"><button type="button" class="lobby-density-btn ${lobbyDensity === "compact" ? "active" : ""}" data-role="density-toggle" data-density="compact">Compact</button><button type="button" class="lobby-density-btn ${lobbyDensity === "detailed" ? "active" : ""}" data-role="density-toggle" data-density="detailed">Detailed</button></div></div></div>`;

    const cards = filteredAgents.map((agent, i) => {
      const color = ROLE_COLORS[i] ?? "accent";
      const agentKey = String(agent.key || "unified");
      const cfg = getAgentSetting(agentKey);
      const paramsHtml = Object.entries(agent.parameters).map(([k, v]) =>
        `<div class="lobby-param-row"><span class="lobby-param-key">${escapeHtml(k)}</span><span class="lobby-param-val">${escapeHtml(String(v))}</span></div>`
      ).join("");
      const expectedInput = typeof agent.expectedInput === "string" && agent.expectedInput.trim().length > 0
        ? agent.expectedInput
        : "Uses chat message history and available tool schemas.";
      const expectedOutput = typeof agent.expectedOutput === "string" && agent.expectedOutput.trim().length > 0
        ? agent.expectedOutput
        : "Final assistant response text (often JSON-parsed by runtime).";
      return `
      <div class="lobby-card" data-color="${color}">
        <div class="lobby-card-header">
          <div class="lobby-card-name">${escapeHtml(agent.name)}</div>
          <div class="lobby-card-model">${escapeHtml(agent.model)}</div>
        </div>

        <div class="lobby-controls-grid lobby-controls-grid-agent">
          <label class="lobby-control">Model<input data-agent-model="${escapeHtml(agentKey)}" class="lobby-input" value="${escapeHtml(cfg.model)}" ${settings.useGlobalModel ? "disabled" : ""} /></label>
          <label class="lobby-control">Temperature<input data-agent-temp="${escapeHtml(agentKey)}" class="lobby-input" type="number" step="0.1" min="0" max="2" value="${escapeHtml(String(cfg.temperature))}" ${settings.useGlobalModel ? "disabled" : ""} /></label>
          <button class="lobby-tools-toggle" data-action="toggle-tools" type="button">Toggle Tools</button>
        </div>

        <div class="lobby-section-label">Expected Input</div>
        <div class="lobby-io">${escapeHtml(expectedInput)}</div>

        <div class="lobby-section-label">Expected Output</div>
        <div class="lobby-io">${escapeHtml(expectedOutput)}</div>

        <div class="lobby-section-label">Parameters</div>
        <div class="lobby-params">${paramsHtml}</div>

        <div class="lobby-section-label">System Instructions</div>
        <pre class="agents-prompt-pre lobby-prompt-pre">${escapeHtml(agent.systemPrompt)}</pre>

        <div class="lobby-section-label">${agent.tools.length} Tool${agent.tools.length !== 1 ? "s" : ""}</div>
        <div class="agents-tools-list">${buildToolCards(agent.tools)}</div>
      </div>`;
    }).join("");

    modalBody.innerHTML = `<div class="lobby-list ${lobbyDensity === "compact" ? "lobby-list-compact" : ""}">${legend}${globalSettings}${cards || '<div class="agents-loading">No agents match this filter.</div>'}</div>`;
    bindLobbyControls();
  }

  // ── Tab switching ──────────────────────────────────────────────────────
  function switchTab(tab) {
    activeTab = tab;
    lobbyTabs.forEach(t => {
      t.classList.toggle("active", t.dataset.tab === tab);
      t.setAttribute("aria-selected", String(t.dataset.tab === tab));
    });
    if (tab === "diagram") renderDiagram();
    else if (allAgents.length > 0) renderLobby();
  }

  // ── Open / close ───────────────────────────────────────────────────────
  async function openModal() {
    modalBody.innerHTML = '<div class="agents-loading">Loading agent info…</div>';
    overlay.classList.add("open");
    try {
      try {
        const storedDensity = localStorage.getItem(LOBBY_DENSITY_KEY);
        if (storedDensity === "compact" || storedDensity === "detailed") {
          lobbyDensity = storedDensity;
        }
      } catch {
        // Ignore storage failures.
      }

      const modelSelect = document.getElementById("model-select");
      selectedModel = modelSelect && "value" in modelSelect ? String(modelSelect.value || "").trim() : "";
      settings = loadAgentSettings(selectedModel || modelMeta.model || "openai/gpt-oss-20b:nitro");
      const url = selectedModel
        ? `/api/agent-info?model=${encodeURIComponent(selectedModel)}`
        : "/api/agent-info";
      const res = await fetch(url);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      allAgents = data.agents ?? [];
      modelMeta = {
        model: typeof data.model === "string" ? data.model : "",
        modelSource: typeof data.modelSource === "string" ? data.modelSource : "",
      };
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
