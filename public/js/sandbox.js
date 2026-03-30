/**
 * Agent Sandbox — Meet the Agents (Workstream C)
 *
 * Loads agent info from /api/agent-info and renders agent cards in the
 * Agent Sandbox section.  Each card shows the agent's role, a summary
 * of its responsibilities, and the number of MCP tools it has access to.
 */

import { escapeHtml } from './utils.js';

// Agent role descriptions in user-centered language (not system prompts)
const AGENT_ROLE_DESCRIPTIONS = {
  orchestrator: "Routes every message to the right specialist. Reads your intent in one step — never answers directly, just makes sure the right expert takes over.",
  reader: "Answers questions about your design system — tokens, components, themes, icons, accessibility. Looks up live data via MCP tools.",
  builder: "Generates production-ready UI code grounded in real token names and component rules. Calls MCP tools to confirm constraints before writing.",
  generator: "Creates complete design system JSON from natural language descriptions or extracted web context. Used by the Generate from Website flow.",
  "style-guide": "Answers style guide questions — voice, tone, usage guidance, and editorial rules. Reads the live style guide data, not a cached snapshot.",
  unified: "An all-in-one agent used in single-agent mode. Handles reading, building, and generating without delegation.",
};

const AGENT_COLORS = {
  orchestrator: "var(--purple)",
  reader: "var(--accent)",
  builder: "var(--green)",
  generator: "var(--orange)",
  "style-guide": "#e5a0ff",
  unified: "var(--text-muted)",
};

function renderAgentCard(agent) {
  const color = AGENT_COLORS[agent.key] ?? "var(--text-muted)";
  const desc = AGENT_ROLE_DESCRIPTIONS[agent.key] ?? agent.description ?? "";
  const toolCount = Array.isArray(agent.tools) ? agent.tools.length : 0;
  const toolNames = Array.isArray(agent.tools)
    ? agent.tools.map(t => t.name).slice(0, 5).join(", ") + (toolCount > 5 ? ` + ${toolCount - 5} more` : "")
    : "";

  const card = document.createElement("div");
  card.className = "sandbox-agent-card";
  card.innerHTML = `
    <div class="sandbox-agent-card-header">
      <span class="sandbox-agent-dot" style="background:${color}"></span>
      <span class="sandbox-agent-name">${escapeHtml(agent.name)}</span>
      ${toolCount > 0 ? `<span class="sandbox-agent-tool-count">${toolCount} tool${toolCount !== 1 ? "s" : ""}</span>` : ""}
    </div>
    <p class="sandbox-agent-desc">${escapeHtml(desc)}</p>
    ${toolCount > 0 ? `<p class="sandbox-agent-tools" title="${escapeHtml(toolNames)}">${escapeHtml(toolNames)}</p>` : ""}
  `;
  return card;
}

async function loadAndRenderAgents() {
  const container = document.getElementById("sandbox-agent-cards");
  if (!container) return;

  try {
    const model = document.getElementById("model-select")?.value ?? "";
    const url = model ? `/api/agent-info?model=${encodeURIComponent(model)}` : "/api/agent-info";
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    container.innerHTML = "";
    const agents = Array.isArray(data.agents) ? data.agents : [];
    for (const agent of agents) {
      container.appendChild(renderAgentCard(agent));
    }
    if (agents.length === 0) {
      container.innerHTML = '<div class="sandbox-agent-cards-loading">No agent data available.</div>';
    }
  } catch (err) {
    container.innerHTML = `<div class="sandbox-agent-cards-loading">Could not load agent information. <button class="sandbox-link-btn" id="sandbox-retry-agents">Retry</button></div>`;
    const retryBtn = container.querySelector("#sandbox-retry-agents");
    if (retryBtn) retryBtn.addEventListener("click", loadAndRenderAgents);
  }
}

export function initSandbox() {
  // Load agents when sandbox section becomes visible
  const nav = document.querySelector('[data-section="section-agent-sandbox"]');
  if (nav) {
    nav.addEventListener("click", () => {
      // Load lazily on first visit
      const container = document.getElementById("sandbox-agent-cards");
      if (container && !container.dataset.loaded) {
        container.dataset.loaded = "1";
        loadAndRenderAgents();
      }
    });
  }

  // "Full agent config" button opens the agents modal
  const fullAgentsBtn = document.getElementById("sandbox-view-full-agents-btn");
  if (fullAgentsBtn) {
    fullAgentsBtn.addEventListener("click", () => document.getElementById("view-agents-btn")?.click());
  }
}
