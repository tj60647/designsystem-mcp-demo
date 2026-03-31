import { escapeHtml, loadAgentSettings, saveAgentSettings } from '../utils.js';
import { AGENT_COLORS, AGENT_LABELS } from './testlab.js';

const MODEL_OPTIONS = [
  "openai/gpt-oss-20b:nitro",
  "anthropic/claude-sonnet-4.6",
  "anthropic/claude-3.7-sonnet",
  "openai/gpt-4.1",
  "google/gemini-2.5-pro",
];

function modelSelectHtml(dataAttr, currentValue, disabled = false) {
  const opts = MODEL_OPTIONS.map(m => {
    const selected = m === currentValue ? " selected" : "";
    return `<option value="${escapeHtml(m)}"${selected}>${escapeHtml(m)}</option>`;
  });
  // If the stored value isn't in the list, add it as a custom option
  if (!MODEL_OPTIONS.includes(currentValue)) {
    opts.unshift(`<option value="${escapeHtml(currentValue)}" selected>${escapeHtml(currentValue)}</option>`);
  }
  return `<select ${dataAttr} class="lobby-input"${disabled ? " disabled" : ""}>${opts.join("")}</select>`;
}

export function initAgentsPanel() {
  const container = document.getElementById("agents-panel-body");
  const navBtn    = document.querySelector('[data-section="section-agent-sandbox"]');
  if (!container) return;

  let allAgents   = [];
  let modelMeta   = { model: "", modelSource: "" };
  let settings    = null;
  let lobbyFilter = "";

  // Colour token per agent index — matches diagram node colours
  const ROLE_COLORS = ["purple", "accent", "orange", "green", "red"];

  // ── Agent Lobby ────────────────────────────────────────────────────────
  function buildToolCards(tools) {
    return tools.map(t => {
      const params   = t.parameters && t.parameters.properties ? Object.keys(t.parameters.properties) : [];
      const required = (t.parameters && t.parameters.required) || [];
      const hasParams = params.length > 0;
      const paramChips = hasParams
        ? params.map(p => {
            const isRequired = required.includes(p);
            return `<span class="agents-param-chip"${isRequired ? ' data-required="true"' : ""}>${escapeHtml(p)}${isRequired ? "<sup>*</sup>" : ""}</span>`;
          }).join("")
        : "";
      const paramHtml = hasParams
        ? `<div class="agents-param-chips">${paramChips}</div><div class="agents-param-legend">* required parameter</div>`
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
      settings = loadAgentSettings();
    }
  }

  function getAgentSetting(agentKey) {
    ensureSettings();
    return settings.useGlobalModel ? settings.global : (settings.agents[agentKey] || settings.global);
  }

  function bindLobbyControls() {
    const filterInput = container.querySelector('[data-role="agent-filter"]');
    if (filterInput) {
      filterInput.addEventListener("input", (e) => {
        lobbyFilter = String(e.target.value || "");
        renderLobby();
      });
    }

    const globalToggle = container.querySelector('[data-role="use-global-model"]');
    if (globalToggle) {
      globalToggle.addEventListener("change", (e) => {
        ensureSettings();
        settings.useGlobalModel = Boolean(e.target.checked);
        saveAgentSettings(settings);
        renderLobby();
      });
    }

    container.querySelectorAll('[data-setting="global-model"]').forEach((el) => {
      el.addEventListener("change", (e) => {
        ensureSettings();
        const v = String(e.target.value || "").trim();
        if (!v) return;
        settings.global.model = v;
        // Mirror to all individual agents so they stay in sync
        for (const key of Object.keys(settings.agents)) {
          settings.agents[key].model = v;
        }
        saveAgentSettings(settings);
        renderLobby();
      });
    });

    container.querySelectorAll('[data-setting="global-temp"]').forEach((el) => {
      el.addEventListener("change", (e) => {
        ensureSettings();
        const n = Number(e.target.value);
        settings.global.temperature = Number.isFinite(n) ? n : 0;
        saveAgentSettings(settings);
      });
    });

    container.querySelectorAll('[data-agent-model]').forEach((el) => {
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

    container.querySelectorAll('[data-agent-temp]').forEach((el) => {
      el.addEventListener("change", (e) => {
        ensureSettings();
        const key = e.target.getAttribute("data-agent-temp");
        const n = Number(e.target.value);
        if (!key || !settings.agents[key]) return;
        settings.agents[key].temperature = Number.isFinite(n) ? n : 0;
        saveAgentSettings(settings);
      });
    });

    container.querySelectorAll('[data-action="toggle-tools"]').forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const card = e.target.closest(".lobby-card-body");
        if (!card) return;
        const details = card.querySelectorAll(".agents-tool-card");
        const anyClosed = Array.from(details).some((d) => !d.open);
        details.forEach((d) => { d.open = anyClosed; });
      });
    });

    container.querySelectorAll('[data-action="edit-agent"]').forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const agentKey = e.currentTarget.getAttribute("data-agent");
        const card = container.querySelector(`.lobby-card[data-agent-key="${agentKey}"]`);
        if (!card) return;
        card.open = true;
        const panel = card.querySelector(`[data-edit-panel="${agentKey}"]`);
        if (panel) panel.classList.toggle("lobby-edit-panel--open");
      });
    });

    container.querySelectorAll('[data-action="save-agent"]').forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const agentKey = e.currentTarget.getAttribute("data-agent");
        ensureSettings();
        if (!agentKey || !settings.agents[agentKey]) return;
        const card = container.querySelector(`.lobby-card[data-agent-key="${agentKey}"]`);
        if (!card) return;
        const agent = allAgents.find((a) => String(a.key) === agentKey);

        const promptEl = card.querySelector(`[data-edit-prompt="${agentKey}"]`);
        if (promptEl) {
          const val = promptEl.value.trim();
          if (val && val !== (agent?.systemPrompt ?? "")) {
            settings.agents[agentKey].systemPrompt = val;
          } else {
            delete settings.agents[agentKey].systemPrompt;
          }
        }

        const maxIterEl = card.querySelector(`[data-edit-max-iter="${agentKey}"]`);
        if (maxIterEl) {
          const n = parseInt(maxIterEl.value, 10);
          const defaultMaxIter = agent?.parameters?.maxIterations;
          if (Number.isInteger(n) && n >= 1 && n !== defaultMaxIter) {
            settings.agents[agentKey].maxIterations = n;
          } else {
            delete settings.agents[agentKey].maxIterations;
          }
        }

        const toolCheckboxes = Array.from(card.querySelectorAll(`[data-edit-tool="${agentKey}"]`));
        if (toolCheckboxes.length > 0) {
          const enabled = toolCheckboxes.filter((cb) => cb.checked).map((cb) => cb.value);
          const allToolNames = (agent?.tools ?? []).map((t) => t.name);
          if (enabled.length === allToolNames.length) {
            delete settings.agents[agentKey].tools;
          } else {
            settings.agents[agentKey].tools = enabled;
          }
        }

        saveAgentSettings(settings);
        renderLobby();
      });
    });

    container.querySelectorAll('[data-action="reset-agent"]').forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const agentKey = e.currentTarget.getAttribute("data-agent");
        ensureSettings();
        if (!agentKey || !settings.agents[agentKey]) return;
        delete settings.agents[agentKey].systemPrompt;
        delete settings.agents[agentKey].maxIterations;
        delete settings.agents[agentKey].tools;
        saveAgentSettings(settings);
        renderLobby();
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

    const globalSettings = `<div class="lobby-global-settings">
      <div class="lobby-global-title">Model Settings</div>
      <div class="lobby-controls-grid">
        <label class="lobby-check"><input type="checkbox" data-role="use-global-model" ${settings.useGlobalModel ? "checked" : ""}> Use same model for all agents</label>
        <label class="lobby-control">Default model${modelSelectHtml('data-setting="global-model"', settings.global.model, !settings.useGlobalModel)}</label>
        <label class="lobby-control">Temperature<input data-setting="global-temp" class="lobby-input" type="number" step="0.1" min="0" max="2" value="${escapeHtml(String(settings.global.temperature))}" ${!settings.useGlobalModel ? "disabled" : ""} /></label>
      </div>
      ${modelMeta.model ? `<div class="lobby-global-row"><span class="lobby-global-key">server default</span><span class="lobby-global-val">${escapeHtml(modelMeta.model)}</span></div>` : ""}
    </div>`;

    const legend = `<div class="lobby-legend"><div class="lobby-global-title">Agent Legend</div><div class="lobby-legend-row">${legendItems}</div><div class="lobby-toolbar"><label class="lobby-control lobby-filter">Filter<input data-role="agent-filter" class="lobby-input" value="${escapeHtml(lobbyFilter)}" placeholder="Search agents or tools" /></label></div></div>`;

    const cards = filteredAgents.map((agent, i) => {
      const color = ROLE_COLORS[i] ?? "accent";
      const agentKey = String(agent.key || "unified");
      const cfg = getAgentSetting(agentKey);
      const agentOverrides = settings.agents[agentKey] || {};
      const hasOverrides = !!(agentOverrides.systemPrompt || agentOverrides.maxIterations !== undefined || (Array.isArray(agentOverrides.tools) && agentOverrides.tools.length > 0));
      const enabledToolNames = agentOverrides.tools ? new Set(agentOverrides.tools) : null;
      const paramsHtml = Object.entries(agent.parameters).map(([k, v]) =>
        `<div class="lobby-param-row"><span class="lobby-param-key">${escapeHtml(k)}</span><span class="lobby-param-val">${escapeHtml(String(v))}</span></div>`
      ).join("");
      const expectedInput = typeof agent.expectedInput === "string" && agent.expectedInput.trim().length > 0
        ? agent.expectedInput
        : "Uses chat message history and available tool schemas.";
      const expectedOutput = typeof agent.expectedOutput === "string" && agent.expectedOutput.trim().length > 0
        ? agent.expectedOutput
        : "Final assistant response text (often JSON-parsed by runtime).";
      const displayModel = settings.useGlobalModel ? settings.global.model : cfg.model;
      const editPromptVal = agentOverrides.systemPrompt ?? agent.systemPrompt;
      const editMaxIter = agentOverrides.maxIterations ?? agent.parameters.maxIterations ?? 5;
      const toolCheckItems = (agent.tools || []).map((t) => {
        const checked = !enabledToolNames || enabledToolNames.has(t.name) ? " checked" : "";
        return `<label class="lobby-tool-check"><input type="checkbox" data-edit-tool="${escapeHtml(agentKey)}" value="${escapeHtml(t.name)}"${checked}><span>${escapeHtml(t.name)}</span></label>`;
      }).join("");
      return `
      <details class="lobby-card" data-color="${color}" data-agent-key="${escapeHtml(agentKey)}">
        <summary class="lobby-card-summary">
          <div class="lobby-card-header">
            <div class="lobby-card-name">${escapeHtml(agent.name)}</div>
            ${hasOverrides ? '<span class="lobby-card-override-badge" title="Custom configuration active"></span>' : ""}
            <button class="lobby-card-gear${hasOverrides ? " lobby-card-gear--active" : ""}" data-action="edit-agent" data-agent="${escapeHtml(agentKey)}" title="Configure agent" type="button">⚙</button>
            <div class="lobby-card-model">${escapeHtml(displayModel)}</div>
          </div>
          <div class="lobby-card-desc">${escapeHtml(agent.description)}</div>
        </summary>
        <div class="lobby-card-body">
          <div class="lobby-edit-panel" data-edit-panel="${escapeHtml(agentKey)}">
            <div class="lobby-edit-header">
              <span class="lobby-edit-title">Configuration overrides</span>
              <div class="lobby-edit-actions">
                <button class="lobby-btn-save" data-action="save-agent" data-agent="${escapeHtml(agentKey)}" type="button">Save</button>
                <button class="lobby-btn-reset" data-action="reset-agent" data-agent="${escapeHtml(agentKey)}" type="button">Reset to defaults</button>
              </div>
            </div>
            <label class="lobby-control">Max Iterations<input data-edit-max-iter="${escapeHtml(agentKey)}" class="lobby-input" type="number" min="1" max="30" value="${escapeHtml(String(editMaxIter))}" /></label>
            <label class="lobby-control">System Instructions<textarea data-edit-prompt="${escapeHtml(agentKey)}" class="lobby-input lobby-prompt-textarea" rows="8">${escapeHtml(editPromptVal)}</textarea></label>
            ${agent.tools && agent.tools.length > 0 ? `<div class="lobby-control"><span>Tools (${agent.tools.length} available — uncheck to disable)</span><div class="lobby-tools-checklist">${toolCheckItems}</div></div>` : ""}
          </div>

          <div class="lobby-controls-grid lobby-controls-grid-agent">
            <label class="lobby-control">Model${modelSelectHtml(`data-agent-model="${escapeHtml(agentKey)}"`, cfg.model, settings.useGlobalModel)}</label>
            <label class="lobby-control">Temperature<input data-agent-temp="${escapeHtml(agentKey)}" class="lobby-input" type="number" step="0.1" min="0" max="2" value="${escapeHtml(String(cfg.temperature))}" ${settings.useGlobalModel ? "disabled" : ""} /></label>
          </div>

          <details class="lobby-section-details">
            <summary class="lobby-section-label">Expected Input</summary>
            <div class="lobby-io">${escapeHtml(expectedInput)}</div>
          </details>

          <details class="lobby-section-details">
            <summary class="lobby-section-label">Expected Output</summary>
            <div class="lobby-io">${escapeHtml(expectedOutput)}</div>
          </details>

          <details class="lobby-section-details">
            <summary class="lobby-section-label">Parameters</summary>
            <div class="lobby-params">${paramsHtml}</div>
          </details>

          <details class="lobby-section-details">
            <summary class="lobby-section-label">System Instructions</summary>
            <pre class="agents-prompt-pre lobby-prompt-pre">${escapeHtml(agent.systemPrompt)}</pre>
          </details>

          <details class="lobby-section-details">
            <summary class="lobby-section-label lobby-section-tools-label">
              ${agent.tools.length} Tool${agent.tools.length !== 1 ? "s" : ""}
              <button class="lobby-tools-toggle" data-action="toggle-tools" type="button">Expand All</button>
            </summary>
            <div class="agents-tools-list">${buildToolCards(agent.tools)}</div>
          </details>
        </div>
      </details>`;
    }).join("");

    container.innerHTML = `<div class="lobby-list">${legend}${globalSettings}${cards || '<div class="agents-loading">No agents match this filter.</div>'}</div>`;
    bindLobbyControls();
  }

  // ── Load panel ─────────────────────────────────────────────────────────
  async function loadPanel() {
    if (allAgents.length > 0) {
      renderLobby();
      return;
    }
    container.innerHTML = '<div class="agents-loading">Loading agent info…</div>';
    try {
      settings = loadAgentSettings();
      const res = await fetch("/api/agent-info");
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      allAgents = data.agents ?? [];
      modelMeta = {
        model: typeof data.model === "string" ? data.model : "",
        modelSource: typeof data.modelSource === "string" ? data.modelSource : "",
      };
      renderLobby();
    } catch (err) {
      container.innerHTML = `<div class="agents-loading">Could not load agent info: ${escapeHtml(err.message)}</div>`;
    }
  }

  // Lazy load on first visit, reload on each subsequent visit
  if (navBtn) {
    navBtn.addEventListener("click", loadPanel);
  }

  // ── Scenario Runner ────────────────────────────────────────────────────
  initScenarioRunner();
}

// ── Scenario Runner ──────────────────────────────────────────────────────────
// Inline "watch it work" panel below the agent lobby. Shows 3 design-system
// scenarios as a chip row, a chain visualization, and a live per-step
// tool-call trace streamed from /api/chat.

const SR_SCENARIOS = {
  token_audit: {
    name: "Token Audit",
    description: "Read primary colors → spacing → typography scale",
    steps: [
      { id: "sr-ta-1", agentId: "reader",      prompt: "What are the primary color tokens?" },
      { id: "sr-ta-2", agentId: "reader",      prompt: "What spacing tokens are defined in the design system?" },
      { id: "sr-ta-3", agentId: "reader",      prompt: "What typography tokens are available — sizes, weights, and line-heights?" },
    ],
  },
  build_flow: {
    name: "Read + Build",
    description: "Inspect button specs → build component → get style guidance",
    steps: [
      { id: "sr-bf-1", agentId: "reader",      prompt: "What are the button component variants and their token properties?" },
      { id: "sr-bf-2", agentId: "builder",     prompt: "Build a primary and secondary button component using design system tokens" },
      { id: "sr-bf-3", agentId: "style-guide", prompt: "What are the best practices for choosing between primary and secondary buttons?" },
    ],
  },
  compliance_check: {
    name: "Style Compliance",
    description: "Get color principles → read exact tokens → build a compliant form",
    steps: [
      { id: "sr-cc-1", agentId: "style-guide", prompt: "What color usage principles and contrast requirements should I follow?" },
      { id: "sr-cc-2", agentId: "reader",      prompt: "What is the exact hex value of the primary action color and its accessible text pair?" },
      { id: "sr-cc-3", agentId: "builder",     prompt: "Build an accessible login form with a primary submit button following the design system color principles" },
    ],
  },
};

// Delegate to the already-imported escapeHtml (which also escapes single quotes)
const escHtml = (s) => escapeHtml(String(s));

let srSelectedKey = "token_audit";
let srSteps       = [];
let srRunning     = false;
let srStopFlag    = false;
let srInited      = false;

function srFreshStep(s) {
  return { ...s, status: "pending", traceEvents: [], latencyMs: undefined, error: undefined, message: undefined };
}

function srLoadScenario(key) {
  srSelectedKey = key;
  srSteps = SR_SCENARIOS[key].steps.map(srFreshStep);
}

function srRenderChain(wrap) {
  const chainEl = wrap.querySelector("#sr-chain");
  if (!chainEl) return;
  chainEl.innerHTML = srSteps.map((step, idx) => `
    ${idx > 0 ? '<div class="pg-chain-arrow">→</div>' : ""}
    <div class="pg-chain-node pg-chain-node-${step.status}">
      <span class="pg-node-num">${idx + 1}</span>
      <span class="pg-node-agent">${escHtml(AGENT_LABELS[step.agentId] ?? step.agentId)}</span>
    </div>
  `).join("");
}

function srTraceHtml(events) {
  if (!events || events.length === 0) return "";
  const rows = events.map(ev => {
    if (ev.type === "agent_routed") {
      return `<div class="eval-pl-trace-step"><div class="eval-pl-step-type type-agent">ROUTED → ${escHtml(ev.agent ?? "")}</div>${ev.reason ? `<div class="eval-pl-step-content">${escHtml(ev.reason)}</div>` : ""}</div>`;
    }
    if (ev.type === "tool_call") {
      return `<div class="eval-pl-trace-step"><div class="eval-pl-step-type type-tool">TOOL CALL — ${escHtml(ev.tool ?? "")}</div><div class="eval-pl-step-content"><pre class="sr-trace-pre">${escHtml(JSON.stringify(ev.args, null, 2).slice(0, 400))}</pre></div></div>`;
    }
    if (ev.type === "tool_result") {
      return `<div class="eval-pl-trace-step"><div class="eval-pl-step-type type-result">TOOL RESULT — ${escHtml(ev.tool ?? "")}</div><div class="eval-pl-step-content">${escHtml(`${ev.chars ?? "?"} chars`)}${ev.preview ? ` · ${escHtml(ev.preview)}` : ""}</div></div>`;
    }
    if (ev.type === "progress") {
      return `<div class="eval-pl-trace-step"><div class="eval-pl-step-type type-agent">PROGRESS</div><div class="eval-pl-step-content">${escHtml(ev.message ?? "")}</div></div>`;
    }
    return "";
  }).join("");
  return `<div class="sr-step-trace"><div class="eval-pl-trace-header">Tool Trace</div><div class="eval-pl-trace-body">${rows}</div></div>`;
}

function srRenderTimeline(wrap) {
  const timeline = wrap.querySelector("#sr-timeline");
  if (!timeline) return;
  timeline.innerHTML = srSteps.map((step, idx) => {
    let content = "";
    if (step.status === "pending") {
      content = `<div class="pg-prompt-preview"><span class="pg-prompt-label">Prompt:</span><code class="pg-prompt-code">${escHtml(step.prompt.slice(0, 120))}${step.prompt.length > 120 ? "…" : ""}</code></div>`;
    } else if (step.status === "running") {
      content = `<div class="pg-running-indicator"><span class="pg-spinner"></span>Executing…</div>`;
    } else if (step.status === "complete") {
      const traceHtml = srTraceHtml(step.traceEvents);
      const msgHtml = step.message
        ? `<pre class="pg-step-output">${escapeHtml(step.message.slice(0, 400))}${step.message.length > 400 ? "…" : ""}</pre>`
        : "";
      content = traceHtml + msgHtml;
    } else if (step.status === "error") {
      content = `<div class="pg-error-box">${escHtml(step.error ?? "Error")}</div>`;
    }
    const chips = step.latencyMs !== undefined ? `<span class="pg-meta-chip">${step.latencyMs}ms</span>` : "";
    return `<div class="pg-step-card pg-step-card-${step.status}">
      <div class="pg-step-header">
        <div class="pg-step-identity">
          <span class="pg-status-dot pg-status-dot-${step.status}"></span>
          <span class="pg-step-num">${idx + 1}</span>
          <span class="pg-step-agent">${escHtml(AGENT_LABELS[step.agentId] ?? step.agentId)}</span>
        </div>
        <div class="pg-step-meta">${chips}</div>
      </div>
      ${content}
    </div>`;
  }).join("");
}

function srUpdateControls(wrap) {
  const runBtn  = wrap.querySelector("#sr-run-btn");
  const stopBtn = wrap.querySelector("#sr-stop-btn");
  const resetBtn = wrap.querySelector("#sr-reset-btn");
  if (runBtn)   { runBtn.disabled = srRunning; runBtn.textContent = srRunning ? "⏳ Running…" : "▶ Run Scenario"; }
  if (stopBtn)  { stopBtn.style.display = srRunning ? "" : "none"; }
  if (resetBtn) { resetBtn.disabled = srRunning; }
}

async function srRunAll(wrap) {
  if (srRunning) return;
  srRunning  = true;
  srStopFlag = false;
  srSteps    = srSteps.map(srFreshStep);
  srUpdateControls(wrap);
  srRenderChain(wrap);
  srRenderTimeline(wrap);

  const settings = loadAgentSettings();
  const model    = settings.global.model || "openai/gpt-oss-20b:nitro";

  for (let i = 0; i < srSteps.length; i++) {
    if (srStopFlag) break;
    srSteps[i] = { ...srSteps[i], status: "running" };
    srRenderChain(wrap);
    srRenderTimeline(wrap);

    const step  = srSteps[i];
    const start = Date.now();
    const body  = { messages: [{ role: "user", content: step.prompt }], model };
    if (step.agentId !== "orchestrator") body.previousAgent = step.agentId;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("HTTP " + res.status);

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      const traceEvents = [];

      outer: while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          if (!part.startsWith("data: ")) continue;
          let ev;
          try { ev = JSON.parse(part.slice(6)); } catch { continue; }
          if (["agent_routed", "tool_call", "tool_result", "progress"].includes(ev.type)) {
            if (traceEvents.length < 50) traceEvents.push(ev);
          }
          if (ev.type === "done") {
            srSteps[i] = { ...srSteps[i], status: "complete", traceEvents, latencyMs: Date.now() - start, message: ev.message ?? "" };
            break outer;
          }
          if (ev.type === "error") throw new Error(ev.error ?? "Unknown error");
        }
      }
      if (srSteps[i].status === "running") {
        srSteps[i] = { ...srSteps[i], status: "error", error: "Stream ended unexpectedly", latencyMs: Date.now() - start };
      }
    } catch (err) {
      srSteps[i] = { ...srSteps[i], status: "error", error: String(err), latencyMs: Date.now() - start };
    }
    srRenderChain(wrap);
    srRenderTimeline(wrap);
  }

  srRunning = false;
  srUpdateControls(wrap);
}

function initScenarioRunner() {
  const wrap = document.getElementById("scenario-runner-body");
  if (!wrap || srInited) return;

  srLoadScenario(srSelectedKey);

  const chipHtml = Object.entries(SR_SCENARIOS).map(([key, s]) =>
    `<button class="sr-scenario-chip${srSelectedKey === key ? " active" : ""}" data-sr-key="${key}" title="${escHtml(s.description)}">${escHtml(s.name)}</button>`
  ).join("");

  wrap.innerHTML = `
    <div class="sr-section">
      <div class="sr-section-header">
        <span class="sandbox-coming-soon-icon">⬡</span>
        <div>
          <h3 class="sr-section-title">Scenario Runner</h3>
          <p class="sr-section-desc">Watch agents work through a real design-system request chain — tool calls and all.</p>
        </div>
      </div>

      <div class="sr-scenario-chips" id="sr-scenario-chips">${chipHtml}</div>
      <p class="sr-scenario-desc-line" id="sr-scenario-desc">${escHtml(SR_SCENARIOS[srSelectedKey].description)}</p>

      <div class="sr-actions">
        <button class="eval-btn eval-btn-green" id="sr-run-btn">▶ Run Scenario</button>
        <button class="eval-btn" id="sr-stop-btn" style="display:none">⏹ Stop</button>
        <button class="eval-btn" id="sr-reset-btn">↺ Reset</button>
      </div>

      <div class="pg-chain" id="sr-chain"></div>
      <div class="pg-timeline" id="sr-timeline"></div>

      <div class="sr-eval-entry">
        <span class="sandbox-coming-soon-icon" style="font-size:18px">⬡</span>
        <div class="sr-eval-entry-text">
          <strong>Go deeper in the Eval Lab</strong>
          <span>Assertions, batch regression runs, comparison mode, and more.</span>
        </div>
        <a href="/eval" class="eval-btn eval-btn-primary sr-eval-link">Open Eval Lab →</a>
      </div>
    </div>`;

  srRenderChain(wrap);
  srRenderTimeline(wrap);

  wrap.querySelectorAll("[data-sr-key]").forEach(btn => {
    btn.addEventListener("click", () => {
      if (srRunning) return;
      srLoadScenario(btn.dataset.srKey);
      wrap.querySelectorAll("[data-sr-key]").forEach(b => b.classList.toggle("active", b.dataset.srKey === btn.dataset.srKey));
      const descEl = document.getElementById("sr-scenario-desc");
      if (descEl) descEl.textContent = SR_SCENARIOS[btn.dataset.srKey].description;
      srRenderChain(wrap);
      srRenderTimeline(wrap);
    });
  });

  wrap.querySelector("#sr-run-btn")?.addEventListener("click", () => srRunAll(wrap));
  wrap.querySelector("#sr-stop-btn")?.addEventListener("click", () => { srStopFlag = true; });
  wrap.querySelector("#sr-reset-btn")?.addEventListener("click", () => {
    if (srRunning) return;
    srSteps = srSteps.map(srFreshStep);
    srRenderChain(wrap);
    srRenderTimeline(wrap);
  });

  srInited = true;
}
