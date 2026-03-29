/**
 * Design System MCP — Eval Lab
 *
 * Full-page evaluation workspace with five sections:
 *   1. Test Suite     — run the 110-test prompt suite against real agents
 *   2. Tool Explorer  — invoke any of the 27 MCP tools directly via POST /mcp
 *   3. Prompt Lab     — pick a prompt template, send it, view the full tool trace
 *   4. Agents         — browse live agent config (system prompts, tool sets, diagram)
 *   5. Metrics        — in-process request / routing / tool-call counters
 */
import { TEST_SUITE, runTest } from './modals/testlab.js';
import { escapeHtml } from './utils.js';

// ── Shared state ──────────────────────────────────────────────────────────────
let activeSection = 'suite';

function getModel() {
  return document.getElementById('eval-model-select')?.value || 'openai/gpt-oss-20b:nitro';
}

// ── Navigation ────────────────────────────────────────────────────────────────
function showSection(id) {
  activeSection = id;
  document.querySelectorAll('.eval-section').forEach(s => {
    s.classList.toggle('active', s.id === `eval-section-${id}`);
  });
  document.querySelectorAll('.eval-nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.section === id);
  });
  if (id === 'suite')      initSuiteSection();
  if (id === 'tools')      initToolsSection();
  if (id === 'prompts')    initPromptsSection();
  if (id === 'playground') initPlaygroundSection();
  if (id === 'agents')     initAgentsSection();
  if (id === 'metrics')    loadMetrics();
}

// ── Boot ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.eval-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => showSection(btn.dataset.section));
  });
  showSection('suite');
});

// ═══════════════════════════════════════════════════════════════════════════════
// 1. TEST SUITE
// ═══════════════════════════════════════════════════════════════════════════════
const suiteState = {}; // testId → { status, result, checkResults, error }
let suiteAgentFilter = 'all';
let suiteTypeFilter  = 'all';
let suiteRunning     = false;
let suiteStopFlag    = false;
let suiteInited      = false;

const AGENT_COLORS = {
  orchestrator:  'purple', reader: 'accent', builder: 'orange',
  generator: 'green', 'style-guide': 'red',
};
const AGENT_LABELS = {
  orchestrator: 'Orchestrator', reader: 'Reader', builder: 'Builder',
  generator: 'Generator', 'style-guide': 'Style Guide',
};
const TAG_STYLES = {
  routing:     { cls: 'tl-tag-routing',     label: 'routing'     },
  epistemic:   { cls: 'tl-tag-epistemic',   label: 'epistemic'   },
  grounding:   { cls: 'tl-tag-grounding',   label: 'grounding'   },
  behavioral:  { cls: 'tl-tag-behavioral',  label: 'behavioral'  },
  mechanistic: { cls: 'tl-tag-mechanistic', label: 'mechanistic' },
};

function agentBadge(agent) {
  const color = AGENT_COLORS[agent] ?? 'accent';
  return `<span class="tl-agent-badge tl-badge-${color}">${escapeHtml(AGENT_LABELS[agent] ?? agent)}</span>`;
}
function tagBadges(tags) {
  return (tags || []).map(t => {
    const s = TAG_STYLES[t] ?? { cls: 'tl-tag-mechanistic', label: t };
    return `<span class="tl-tag ${s.cls}">${s.label}</span>`;
  }).join('');
}
function statusBadge(status) {
  const map = { idle: ['tl-status-idle','—'], running: ['tl-status-running','⏳'],
    pass: ['tl-status-pass','✓'], fail: ['tl-status-fail','✗'], error: ['tl-status-error','!'] };
  const [cls, icon] = map[status] ?? map.idle;
  return `<span class="tl-status-chip ${cls}">${icon}</span>`;
}
function getState(id) { return suiteState[id] ?? { status: 'idle' }; }

function filteredTests() {
  return TEST_SUITE.filter(t => {
    const aOk = suiteAgentFilter === 'all' || t.agent === suiteAgentFilter;
    const tOk = suiteTypeFilter  === 'all' || (t.tags && t.tags.includes(suiteTypeFilter));
    return aOk && tOk;
  });
}

function renderTestDetail(test, st) {
  if (!st) return '';
  if (st.status === 'error') return `<div class="tl-test-detail"><span class="tl-error-msg">Error: ${escapeHtml(st.error ?? 'unknown')}</span></div>`;
  const checks = (st.checkResults ?? []).map(c =>
    `<div class="tl-check-row ${c.passed ? 'tl-check-pass' : 'tl-check-fail'}">
      <span class="tl-check-icon">${c.passed ? '✓' : '✗'}</span>
      <span class="tl-check-label">${escapeHtml(c.label)}</span>
      <span class="tl-check-detail">${escapeHtml(c.detail ?? '')}</span>
    </div>`
  ).join('');
  const msg = st.result?.message ?? '';
  return `<div class="tl-test-detail">
    <div class="tl-check-list">${checks}</div>
    ${msg ? `<div class="tl-response-snippet">${escapeHtml(msg.slice(0, 200))}${msg.length > 200 ? '…' : ''}</div>` : ''}
  </div>`;
}

function renderSuiteRow(id) {
  const test = TEST_SUITE.find(t => t.id === id);
  if (!test) return;
  const wrap = document.getElementById('eval-section-suite');
  const row  = wrap?.querySelector(`.tl-test-row[data-id="${id}"]`);
  if (!row) return;
  const st = getState(id);
  const exp = st.status !== 'idle' && st.status !== 'running' ? renderTestDetail(test, st) : '';
  row.innerHTML = `
    <div class="tl-test-row-header">
      <span class="tl-test-id">#${test.id}</span>
      ${agentBadge(test.agent)} ${tagBadges(test.tags)}
      <span class="tl-test-desc">${escapeHtml(test.description)}</span>
      <div class="tl-test-row-actions">
        ${statusBadge(st.status)}
        <button class="tl-run-btn" data-run="${test.id}" title="Run test">▶</button>
      </div>
    </div>
    <div class="tl-test-prompt">${escapeHtml(test.prompt)}</div>
    ${exp}`;
  row.querySelector('.tl-run-btn')?.addEventListener('click', () => runSingleTest(id));
}

function updateSuiteStats() {
  const tests  = filteredTests();
  const ran    = tests.filter(t => getState(t.id).status !== 'idle').length;
  const passed = tests.filter(t => getState(t.id).status === 'pass').length;
  const failed = tests.filter(t => ['fail','error'].includes(getState(t.id).status)).length;
  const rate   = ran > 0 ? Math.round((passed / ran) * 100) : 0;
  const wrap   = document.getElementById('eval-section-suite');
  if (!wrap) return;
  wrap.querySelector('[data-stat="ran"]')?.setAttribute('data-val', String(ran));
  const statBar = wrap.querySelector('.eval-stats-bar');
  if (statBar) {
    statBar.querySelector('[data-stat="total"] .eval-stat-value').textContent  = String(tests.length);
    statBar.querySelector('[data-stat="ran"] .eval-stat-value').textContent    = String(ran);
    statBar.querySelector('[data-stat="pass"] .eval-stat-value').textContent   = String(passed);
    statBar.querySelector('[data-stat="fail"] .eval-stat-value').textContent   = String(failed);
    statBar.querySelector('[data-stat="rate"] .eval-stat-value').textContent   = `${rate}%`;
  }
  const statsText = wrap.querySelector('.tl-suite-stats');
  if (statsText) statsText.textContent = `${ran}/${tests.length} run · ${passed} pass · ${failed} fail`;
}

async function runSingleTest(id) {
  const test = TEST_SUITE.find(t => t.id === id);
  if (!test) return;
  suiteState[id] = { status: 'running' };
  renderSuiteRow(id);
  updateSuiteStats();
  try {
    const outcome = await runTest(test, getModel());
    suiteState[id] = { status: outcome.passed ? 'pass' : 'fail', ...outcome };
  } catch (err) {
    suiteState[id] = { status: 'error', error: String(err) };
  }
  renderSuiteRow(id);
  updateSuiteStats();
}

async function runAll() {
  const tests = filteredTests();
  suiteRunning = true;
  suiteStopFlag = false;
  renderSuiteToolbar();
  for (const test of tests) {
    if (suiteStopFlag) break;
    await runSingleTest(test.id);
  }
  suiteRunning = false;
  renderSuiteToolbar();
}

function exportResults() {
  const ran = TEST_SUITE.filter(t => suiteState[t.id]);
  if (ran.length === 0) { alert('No results to export yet. Run some tests first.'); return; }
  const rows = ran.map(t => ({
    id: t.id, agent: t.agent, tags: t.tags,
    prompt: t.prompt, description: t.description,
    status: suiteState[t.id]?.status ?? 'idle',
    checks: suiteState[t.id]?.checkResults ?? [],
    message: suiteState[t.id]?.result?.message ?? null,
    routedAgent: suiteState[t.id]?.result?.routedAgent ?? null,
    toolCallsUsed: suiteState[t.id]?.result?.toolCallsUsed ?? [],
  }));
  const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `eval-results-${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function renderSuiteToolbar() {
  const wrap = document.getElementById('eval-section-suite');
  const actionsEl = wrap?.querySelector('.eval-suite-actions');
  if (!actionsEl) return;
  actionsEl.innerHTML = suiteRunning
    ? `<button class="eval-btn" id="eval-stop-all">⏹ Stop</button>`
    : `<button class="eval-btn eval-btn-green" id="eval-run-all">▶ Run (${filteredTests().length})</button>`;
  actionsEl.innerHTML += `<button class="eval-btn" id="eval-clear-results">Clear</button>
    <button class="eval-btn" id="eval-export-results">⬇ Export JSON</button>`;
  wrap.querySelector('#eval-run-all')?.addEventListener('click', runAll);
  wrap.querySelector('#eval-stop-all')?.addEventListener('click', () => { suiteStopFlag = true; });
  wrap.querySelector('#eval-clear-results')?.addEventListener('click', () => {
    Object.keys(suiteState).forEach(k => delete suiteState[k]);
    initSuiteSection();
  });
  wrap.querySelector('#eval-export-results')?.addEventListener('click', exportResults);
}

function initSuiteSection() {
  const wrap = document.getElementById('eval-section-suite');
  if (!wrap) return;

  const tests  = filteredTests();
  const total  = tests.length;
  const ran    = tests.filter(t => getState(t.id).status !== 'idle').length;
  const passed = tests.filter(t => getState(t.id).status === 'pass').length;
  const failed = tests.filter(t => ['fail','error'].includes(getState(t.id).status)).length;
  const rate   = ran > 0 ? Math.round((passed / ran) * 100) : 0;

  const agentBtns = ['all','orchestrator','reader','builder','generator','style-guide'].map(f => {
    const cnt = f === 'all'
      ? TEST_SUITE.filter(t => suiteTypeFilter === 'all' || t.tags?.includes(suiteTypeFilter)).length
      : TEST_SUITE.filter(t => t.agent === f && (suiteTypeFilter === 'all' || t.tags?.includes(suiteTypeFilter))).length;
    return `<button class="tl-filter-tab${suiteAgentFilter === f ? ' active' : ''}" data-agent="${f}">
      ${f === 'all' ? 'All' : AGENT_LABELS[f] ?? f} <span class="tl-filter-count">${cnt}</span>
    </button>`;
  }).join('');

  const typeBtns = ['all','routing','epistemic','grounding','behavioral','mechanistic'].map(f => {
    const cnt = f === 'all'
      ? TEST_SUITE.filter(t => suiteAgentFilter === 'all' || t.agent === suiteAgentFilter).length
      : TEST_SUITE.filter(t => (suiteAgentFilter === 'all' || t.agent === suiteAgentFilter) && t.tags?.includes(f)).length;
    return `<button class="tl-filter-tab tl-type-tab${suiteTypeFilter === f ? ' active' : ''}${f !== 'all' ? ` tl-type-tab-${f}` : ''}" data-type="${f}">
      ${f === 'all' ? 'All types' : f} <span class="tl-filter-count">${cnt}</span>
    </button>`;
  }).join('');

  const rows = tests.map(test => {
    const st  = getState(test.id);
    const exp = st.status !== 'idle' && st.status !== 'running' ? renderTestDetail(test, st) : '';
    return `<div class="tl-test-row" data-id="${test.id}">
      <div class="tl-test-row-header">
        <span class="tl-test-id">#${test.id}</span>
        ${agentBadge(test.agent)} ${tagBadges(test.tags)}
        <span class="tl-test-desc">${escapeHtml(test.description)}</span>
        <div class="tl-test-row-actions">
          ${statusBadge(st.status)}
          <button class="tl-run-btn" data-run="${test.id}" title="Run test">▶</button>
        </div>
      </div>
      <div class="tl-test-prompt">${escapeHtml(test.prompt)}</div>
      ${exp}
    </div>`;
  }).join('');

  wrap.innerHTML = `
    <div class="eval-stats-bar">
      <div class="eval-stat-card" data-stat="total">
        <span class="eval-stat-label">Total</span>
        <span class="eval-stat-value">${total}</span>
      </div>
      <div class="eval-stat-card" data-stat="ran">
        <span class="eval-stat-label">Run</span>
        <span class="eval-stat-value">${ran}</span>
      </div>
      <div class="eval-stat-card stat-pass" data-stat="pass">
        <span class="eval-stat-label">Passed</span>
        <span class="eval-stat-value">${passed}</span>
      </div>
      <div class="eval-stat-card stat-fail" data-stat="fail">
        <span class="eval-stat-label">Failed</span>
        <span class="eval-stat-value">${failed}</span>
      </div>
      <div class="eval-stat-card stat-rate" data-stat="rate">
        <span class="eval-stat-label">Pass rate</span>
        <span class="eval-stat-value">${rate}%</span>
      </div>
    </div>
    <div class="eval-suite-filters">
      <div class="eval-suite-filter-group">${agentBtns}</div>
      <div class="eval-suite-divider"></div>
      <div class="eval-suite-filter-group">${typeBtns}</div>
      <div class="eval-suite-actions">
        ${suiteRunning
          ? `<button class="eval-btn" id="eval-stop-all">⏹ Stop</button>`
          : `<button class="eval-btn eval-btn-green" id="eval-run-all">▶ Run (${tests.length})</button>`}
        <button class="eval-btn" id="eval-clear-results">Clear</button>
        <button class="eval-btn" id="eval-export-results">⬇ Export JSON</button>
      </div>
    </div>
    <div class="eval-test-list-wrap">
      <div class="tl-test-list">${rows}</div>
    </div>`;

  // Wire agent filter
  wrap.querySelectorAll('.tl-filter-tab[data-agent]').forEach(btn => {
    btn.addEventListener('click', () => { suiteAgentFilter = btn.dataset.agent; initSuiteSection(); });
  });
  // Wire type filter
  wrap.querySelectorAll('.tl-filter-tab[data-type]').forEach(btn => {
    btn.addEventListener('click', () => { suiteTypeFilter = btn.dataset.type; initSuiteSection(); });
  });
  // Wire run/stop/clear/export
  wrap.querySelector('#eval-run-all')?.addEventListener('click', runAll);
  wrap.querySelector('#eval-stop-all')?.addEventListener('click', () => { suiteStopFlag = true; });
  wrap.querySelector('#eval-clear-results')?.addEventListener('click', () => {
    Object.keys(suiteState).forEach(k => delete suiteState[k]);
    initSuiteSection();
  });
  wrap.querySelector('#eval-export-results')?.addEventListener('click', exportResults);
  // Wire per-test run buttons
  wrap.querySelectorAll('.tl-run-btn[data-run]').forEach(btn => {
    btn.addEventListener('click', () => runSingleTest(Number(btn.dataset.run)));
  });

  suiteInited = true;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. TOOL EXPLORER
// ═══════════════════════════════════════════════════════════════════════════════
let toolsList = null;
let selectedTool = null;
let toolsInited = false;

// Tool category groups for organized display
const TOOL_CATEGORIES = {
  'Token Queries':     ['list_token_categories','get_tokens','get_token'],
  'Component Queries': ['list_components','get_component','get_component_tokens','get_component_variants',
                        'get_component_anatomy','get_component_constraints','get_component_relationships'],
  'Theme & Icon Queries': ['list_themes','get_theme','list_icons','get_icon','search_icons'],
  'Validation':        ['check_contrast','validate_color','diff_against_system','validate_component_usage'],
  'Guidance':          ['get_accessibility_guidance','get_layout_guidance','get_spacing_scale','get_style_guide'],
  'Versioning':        ['get_changelog','get_deprecations'],
  'Generation':        ['generate_design_system','suggest_token','search'],
};

let _mcpSeq = 0;

async function mcpRequest(method, params) {
  const res = await fetch('/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++_mcpSeq, method, params }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  // MCP transport may return JSON or SSE; try JSON first.
  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) {
    const json = await res.json();
    if (json.error) throw new Error(json.error.message ?? String(json.error));
    return json.result;
  }
  // SSE fallback — look for a result event
  const text = await res.text();
  const lines = text.split('\n').filter(l => l.startsWith('data: '));
  for (const line of lines) {
    try {
      const event = JSON.parse(line.slice(6));
      if (event.result !== undefined) return event.result;
      if (event.error)  throw new Error(event.error.message ?? String(event.error));
    } catch { /* skip non-JSON lines */ }
  }
  throw new Error('Unexpected MCP response format');
}

async function initToolsSection() {
  const wrap = document.getElementById('eval-section-tools');
  if (!wrap) return;
  if (toolsInited && toolsList) return; // already rendered

  wrap.innerHTML = `
    <div class="eval-tools-layout" style="flex:1;overflow:hidden">
      <div class="eval-tools-list">
        <div class="eval-tools-search-wrap">
          <input class="eval-tools-search" id="eval-tools-search" placeholder="Filter tools…" autocomplete="off" />
        </div>
        <div class="eval-tools-scroll" id="eval-tools-scroll">
          <div class="eval-loading">Loading tools via MCP…</div>
        </div>
      </div>
      <div class="eval-tool-detail" id="eval-tool-detail">
        <div class="eval-tool-empty">← Select a tool to explore it</div>
      </div>
    </div>`;

  try {
    const result = await mcpRequest('tools/list', {});
    toolsList = result?.tools ?? [];
    renderToolList();
    toolsInited = true;
  } catch (err) {
    const scroll = document.getElementById('eval-tools-scroll');
    if (scroll) scroll.innerHTML = `<div class="eval-error">Failed to load tools: ${escapeHtml(String(err))}</div>`;
  }

  document.getElementById('eval-tools-search')?.addEventListener('input', e => renderToolList(e.target.value));
}

function renderToolList(filter = '') {
  const scroll = document.getElementById('eval-tools-scroll');
  if (!scroll || !toolsList) return;
  const q = filter.toLowerCase().trim();

  // Build category order
  let html = '';
  for (const [cat, names] of Object.entries(TOOL_CATEGORIES)) {
    const tools = toolsList.filter(t => names.includes(t.name) && (!q || t.name.includes(q) || t.description?.toLowerCase().includes(q)));
    if (tools.length === 0) continue;
    html += `<div class="eval-tool-group-label">${escapeHtml(cat)}</div>`;
    tools.forEach(t => {
      html += `<div class="eval-tool-item${selectedTool?.name === t.name ? ' active' : ''}" data-tool="${escapeHtml(t.name)}">${escapeHtml(t.name)}</div>`;
    });
  }
  // Uncategorised tools
  const categorised = Object.values(TOOL_CATEGORIES).flat();
  const extra = toolsList.filter(t => !categorised.includes(t.name) && (!q || t.name.includes(q) || t.description?.toLowerCase().includes(q)));
  if (extra.length) {
    html += `<div class="eval-tool-group-label">Other</div>`;
    extra.forEach(t => {
      html += `<div class="eval-tool-item${selectedTool?.name === t.name ? ' active' : ''}" data-tool="${escapeHtml(t.name)}">${escapeHtml(t.name)}</div>`;
    });
  }
  if (!html) html = `<div class="eval-loading">No tools match "${escapeHtml(q)}"</div>`;
  scroll.innerHTML = html;
  scroll.querySelectorAll('.eval-tool-item[data-tool]').forEach(item => {
    item.addEventListener('click', () => {
      const tool = toolsList.find(t => t.name === item.dataset.tool);
      if (tool) selectTool(tool);
    });
  });
}

function buildSchemaForm(schema) {
  if (!schema || !schema.properties || Object.keys(schema.properties).length === 0) {
    return '<div class="eval-tool-form-label">Parameters</div><div style="font-size:12px;color:var(--text-dim);font-style:italic">No parameters</div>';
  }
  const required = schema.required ?? [];
  const fields = Object.entries(schema.properties).map(([name, prop]) => {
    const isReq = required.includes(name);
    const type  = prop.type ?? 'string';
    const label = `<div class="eval-form-field-label"><code>${escapeHtml(name)}</code>${isReq ? ' <span class="req">*</span>' : ''} <span style="opacity:.6;font-size:10px">${type}</span></div>`;
    const desc  = prop.description ? `<div class="eval-form-field-desc">${escapeHtml(prop.description)}</div>` : '';
    let input;
    if (prop.enum) {
      const opts = prop.enum.map(v => `<option value="${escapeHtml(String(v))}">${escapeHtml(String(v))}</option>`).join('');
      input = `<select class="eval-form-select" data-param="${escapeHtml(name)}"><option value="">— select —</option>${opts}</select>`;
    } else if (type === 'boolean') {
      input = `<select class="eval-form-select" data-param="${escapeHtml(name)}"><option value="">— select —</option><option value="true">true</option><option value="false">false</option></select>`;
    } else if (type === 'number' || type === 'integer') {
      input = `<input class="eval-form-input" type="number" data-param="${escapeHtml(name)}" placeholder="${escapeHtml(prop.description ?? name)}" />`;
    } else if (type === 'array' || type === 'object') {
      input = `<textarea class="eval-form-textarea" data-param="${escapeHtml(name)}" placeholder="JSON value…" rows="3"></textarea>`;
    } else {
      input = `<input class="eval-form-input" type="text" data-param="${escapeHtml(name)}" placeholder="${escapeHtml(prop.description ?? name)}" />`;
    }
    return `<div class="eval-form-field">${label}${desc}${input}</div>`;
  }).join('');

  return `<div class="eval-tool-form-label">Parameters <span style="opacity:.6;font-size:10px;font-weight:400">(<span style="color:var(--red)">*</span> = required)</span></div>
    <div class="eval-tool-form" id="eval-tool-form">${fields}</div>`;
}

function selectTool(tool) {
  selectedTool = tool;
  // Update active state in list
  document.querySelectorAll('.eval-tool-item').forEach(el => {
    el.classList.toggle('active', el.dataset.tool === tool.name);
  });
  const detail = document.getElementById('eval-tool-detail');
  if (!detail) return;
  const schema = tool.inputSchema ?? {};
  detail.innerHTML = `
    <div class="eval-tool-name">${escapeHtml(tool.name)}</div>
    <div class="eval-tool-desc">${escapeHtml(tool.description ?? '')}</div>
    ${buildSchemaForm(schema)}
    <div class="eval-tool-run-row">
      <button class="eval-btn eval-btn-primary" id="eval-tool-call-btn">▶ Call Tool</button>
      <span class="eval-tool-latency" id="eval-tool-latency"></span>
    </div>
    <div id="eval-tool-result-wrap"></div>`;

  detail.querySelector('#eval-tool-call-btn')?.addEventListener('click', () => callTool(tool));
}

async function callTool(tool) {
  const detail = document.getElementById('eval-tool-detail');
  if (!detail) return;
  const btn = detail.querySelector('#eval-tool-call-btn');
  const latEl = detail.querySelector('#eval-tool-latency');
  const resultWrap = detail.querySelector('#eval-tool-result-wrap');

  // Collect arguments
  const args = {};
  detail.querySelectorAll('[data-param]').forEach(el => {
    const k = el.dataset.param;
    const v = el.value.trim();
    if (!v) return;
    const prop = tool.inputSchema?.properties?.[k];
    if (prop?.type === 'boolean') { args[k] = v === 'true'; }
    else if (prop?.type === 'number' || prop?.type === 'integer') { args[k] = Number(v); }
    else if (prop?.type === 'array' || prop?.type === 'object') {
      try { args[k] = JSON.parse(v); } catch { args[k] = v; }
    } else { args[k] = v; }
  });

  if (btn) { btn.disabled = true; btn.textContent = '⏳ Calling…'; }
  if (latEl) latEl.textContent = '';
  if (resultWrap) resultWrap.innerHTML = `<div class="eval-tool-result result-loading">Waiting for MCP response…</div>`;

  const start = Date.now();
  try {
    const result = await mcpRequest('tools/call', { name: tool.name, arguments: args });
    const ms = Date.now() - start;
    if (latEl) latEl.textContent = `${ms}ms`;
    const text = result?.content?.map(c => c.text ?? '').join('\n') ?? JSON.stringify(result, null, 2);
    let pretty = text;
    try { pretty = JSON.stringify(JSON.parse(text), null, 2); } catch { /* keep raw */ }
    if (resultWrap) resultWrap.innerHTML = `<pre class="eval-tool-result">${escapeHtml(pretty)}</pre>`;
  } catch (err) {
    const ms = Date.now() - start;
    if (latEl) latEl.textContent = `${ms}ms`;
    if (resultWrap) resultWrap.innerHTML = `<div class="eval-tool-result result-error">${escapeHtml(String(err))}</div>`;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '▶ Call Tool'; }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. PROMPT LAB
// ═══════════════════════════════════════════════════════════════════════════════
let templates = null;
let selectedTemplate = null;
let promptRunning = false;

async function initPromptsSection() {
  const wrap = document.getElementById('eval-section-prompts');
  if (!wrap) return;
  if (templates) { renderPromptsLayout(); return; }

  wrap.innerHTML = '<div class="eval-loading">Loading prompt templates…</div>';
  try {
    const res = await fetch('/prompt-templates');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    templates = data.templates ?? [];
    renderPromptsLayout();
  } catch (err) {
    wrap.innerHTML = `<div class="eval-section-body"><div class="eval-error">Failed to load templates: ${escapeHtml(String(err))}</div></div>`;
  }
}

function renderPromptsLayout() {
  const wrap = document.getElementById('eval-section-prompts');
  if (!wrap || !templates) return;

  const tplCards = templates.map(t =>
    `<div class="eval-pl-template-card${selectedTemplate?.id === t.id ? ' active' : ''}" data-tpl="${escapeHtml(t.id)}">
      <div class="eval-pl-tpl-title">${escapeHtml(t.title)}</div>
      <div class="eval-pl-tpl-desc">${escapeHtml(t.description)}</div>
    </div>`
  ).join('');

  wrap.innerHTML = `
    <div class="eval-pl-layout" style="flex:1;overflow:hidden">
      <div class="eval-pl-sidebar">
        <div class="eval-pl-sidebar-label">Prompt Templates</div>
        <div class="eval-pl-templates-scroll">${tplCards}</div>
      </div>
      <div class="eval-pl-workspace" id="eval-pl-workspace">
        <div style="color:var(--text-dim);font-style:italic;font-size:13px">← Select a template or type a prompt below</div>
        <div>
          <div class="eval-pl-field-label">Prompt</div>
          <textarea class="eval-pl-textarea" id="eval-pl-prompt" rows="4" placeholder="Type or paste a prompt…"></textarea>
        </div>
        <div class="eval-pl-controls">
          <label style="font-size:11px;color:var(--text-dim)">Agent</label>
          <select class="eval-pl-agent-select" id="eval-pl-agent">
            <option value="">Auto (orchestrator routes)</option>
            <option value="reader">Reader</option>
            <option value="builder">Builder</option>
            <option value="generator">Generator</option>
            <option value="style-guide">Style Guide</option>
          </select>
          <button class="eval-btn eval-btn-primary" id="eval-pl-run-btn" ${promptRunning ? 'disabled' : ''}>
            ${promptRunning ? '⏳ Running…' : '▶ Run'}
          </button>
        </div>
        <div id="eval-pl-trace-wrap" style="display:none">
          <div class="eval-pl-field-label" style="margin-top:8px">Tool Trace</div>
          <div class="eval-pl-trace" id="eval-pl-trace">
            <div class="eval-pl-trace-header">Trace</div>
            <div class="eval-pl-trace-body" id="eval-pl-trace-body"></div>
          </div>
        </div>
      </div>
    </div>`;

  wrap.querySelectorAll('.eval-pl-template-card[data-tpl]').forEach(card => {
    card.addEventListener('click', () => {
      const tpl = templates.find(t => t.id === card.dataset.tpl);
      if (!tpl) return;
      selectedTemplate = tpl;
      // Update active state
      wrap.querySelectorAll('.eval-pl-template-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      const promptEl = document.getElementById('eval-pl-prompt');
      if (promptEl) promptEl.value = tpl.prompt;
    });
  });

  document.getElementById('eval-pl-run-btn')?.addEventListener('click', runPromptLab);
}

async function runPromptLab() {
  const prompt = document.getElementById('eval-pl-prompt')?.value.trim();
  if (!prompt) return;
  const agent  = document.getElementById('eval-pl-agent')?.value ?? '';
  const runBtn = document.getElementById('eval-pl-run-btn');
  const traceWrap = document.getElementById('eval-pl-trace-wrap');
  const traceBody = document.getElementById('eval-pl-trace-body');

  promptRunning = true;
  if (runBtn) { runBtn.disabled = true; runBtn.textContent = '⏳ Running…'; }
  if (traceWrap) traceWrap.style.display = '';
  if (traceBody) traceBody.innerHTML = `<div class="eval-pl-trace-step"><div class="eval-pl-step-type type-agent">ROUTING</div><div class="eval-pl-step-content">Sending to /api/chat…</div></div>`;

  function appendStep(html) {
    if (traceBody) traceBody.insertAdjacentHTML('beforeend', html);
  }

  try {
    const body = { messages: [{ role: 'user', content: prompt }], model: getModel() };
    if (agent) Object.assign(body, { previousAgent: agent });

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    if (traceBody) traceBody.innerHTML = ''; // clear loading step

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop() ?? '';
      for (const part of parts) {
        if (!part.startsWith('data: ')) continue;
        let event;
        try { event = JSON.parse(part.slice(6)); } catch { continue; }
        if (event.type === 'progress') {
          appendStep(`<div class="eval-pl-trace-step"><div class="eval-pl-step-type type-agent">PROGRESS</div><div class="eval-pl-step-content">${escapeHtml(event.message)}</div></div>`);
        } else if (event.type === 'agent_routed') {
          appendStep(`<div class="eval-pl-trace-step"><div class="eval-pl-step-type type-agent">ROUTED → ${escapeHtml(event.agent)}</div><div class="eval-pl-step-content">${escapeHtml(event.reason ?? '')}</div></div>`);
        } else if (event.type === 'tool_call') {
          appendStep(`<div class="eval-pl-trace-step"><div class="eval-pl-step-type type-tool">TOOL CALL — ${escapeHtml(event.tool)}</div><div class="eval-pl-step-content"><pre style="margin:0;font-size:11px;overflow:auto">${escapeHtml(JSON.stringify(event.args, null, 2))}</pre></div></div>`);
        } else if (event.type === 'tool_result') {
          appendStep(`<div class="eval-pl-trace-step"><div class="eval-pl-step-type type-result">TOOL RESULT — ${escapeHtml(event.tool)}</div><div class="eval-pl-step-content">${event.chars} chars · ${escapeHtml(event.preview ?? '')}</div></div>`);
        } else if (event.type === 'done') {
          const tools = event.toolCallsUsed ?? [];
          const toolChips = tools.map(t => `<span class="eval-pl-tool-chip">${escapeHtml(t)}</span>`).join('');
          let previewHtml = '';
          if (event.preview) {
            previewHtml = `<div class="eval-pl-preview-wrap"><pre class="eval-pl-preview-pre">${escapeHtml(event.preview.slice(0, 600))}${event.preview.length > 600 ? '…' : ''}</pre></div>`;
          }
          appendStep(`<div class="eval-pl-trace-step"><div class="eval-pl-step-type type-result">DONE — ${escapeHtml(event.routedAgent ?? 'unknown')}</div>
            ${toolChips ? `<div class="eval-pl-step-tools">${toolChips}</div>` : ''}
            <div class="eval-pl-step-content" style="margin-top:8px">${escapeHtml(event.message ?? '')}</div>
            ${previewHtml}
          </div>`);
        } else if (event.type === 'error') {
          appendStep(`<div class="eval-pl-trace-step"><div class="eval-pl-step-type type-error">ERROR</div><div class="eval-pl-step-content">${escapeHtml(event.error ?? 'Unknown error')}</div></div>`);
        }
      }
    }
  } catch (err) {
    appendStep(`<div class="eval-pl-trace-step"><div class="eval-pl-step-type type-error">ERROR</div><div class="eval-pl-step-content">${escapeHtml(String(err))}</div></div>`);
  } finally {
    promptRunning = false;
    if (runBtn) { runBtn.disabled = false; runBtn.textContent = '▶ Run'; }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. AGENT CONFIG
// ═══════════════════════════════════════════════════════════════════════════════
let agentSectionInited = false;

function initAgentsSection() {
  if (agentSectionInited) return;
  // The agents modal init code attaches to DOM elements by ID. We need to render
  // the same lobby/diagram HTML into the eval page section instead.
  // We'll fetch /api/agent-info directly and render using a simplified version
  // of the lobby renderer (without modal open/close wiring).
  const wrap = document.getElementById('eval-section-agents');
  if (!wrap) return;

  wrap.innerHTML = '<div class="eval-loading">Loading agent config…</div>';

  fetch(`/api/agent-info?model=${encodeURIComponent(getModel())}`)
    .then(r => r.json())
    .then(data => {
      renderAgentsSection(wrap, data.agents ?? [], data.model ?? '');
      agentSectionInited = true;
    })
    .catch(err => {
      wrap.innerHTML = `<div class="eval-section-body"><div class="eval-error">Failed to load: ${escapeHtml(String(err))}</div></div>`;
    });
}

function renderAgentsSection(wrap, agents, model) {
  const ROLE_COLORS = ['purple','accent','orange','green','red'];
  const tabs = `
    <div style="display:flex;gap:2px;padding:10px 20px 0;border-bottom:1px solid var(--border);flex-shrink:0">
      <button class="eval-agents-tab active" data-agents-tab="lobby">Agents</button>
      <button class="eval-agents-tab" data-agents-tab="diagram">System Diagram</button>
    </div>`;

  const cards = agents.map((agent, i) => {
    const color = ROLE_COLORS[i] ?? 'accent';
    const params = Object.entries(agent.parameters ?? {}).map(([k,v]) =>
      `<div class="lobby-param-row"><span class="lobby-param-key">${escapeHtml(k)}</span><span class="lobby-param-val">${escapeHtml(String(v))}</span></div>`
    ).join('');
    const tools = (agent.tools ?? []).map(t => {
      const pKeys = t.parameters?.properties ? Object.keys(t.parameters.properties) : [];
      const req   = t.parameters?.required ?? [];
      const chips = pKeys.length
        ? pKeys.map(p => `<span class="agents-param-chip">${escapeHtml(p)}${req.includes(p) ? "<sup style='color:var(--red)'>*</sup>" : ""}</span>`).join('')
        : '<span style="font-size:10.5px;color:var(--text-dim);font-style:italic">no parameters</span>';
      return `<details class="agents-tool-card">
        <summary class="agents-tool-summary"><span class="agents-tool-name">${escapeHtml(t.name)}</span><span class="agents-tool-toggle"></span></summary>
        <div class="agents-tool-desc">${escapeHtml(t.description ?? '')}</div>
        <div class="agents-tool-params">${chips}</div>
      </details>`;
    }).join('');
    return `<div class="lobby-card" data-color="${color}">
      <div class="lobby-card-header">
        <div class="lobby-card-name">${escapeHtml(agent.name)}</div>
        <div class="lobby-card-model">${escapeHtml(agent.model ?? '')}</div>
      </div>
      <div class="lobby-section-label">Expected Input</div>
      <div class="lobby-io">${escapeHtml(agent.expectedInput ?? '')}</div>
      <div class="lobby-section-label">Expected Output</div>
      <div class="lobby-io">${escapeHtml(agent.expectedOutput ?? '')}</div>
      <div class="lobby-section-label">Parameters</div>
      <div class="lobby-params">${params}</div>
      <div class="lobby-section-label">System Instructions</div>
      <pre class="agents-prompt-pre lobby-prompt-pre">${escapeHtml(agent.systemPrompt ?? '')}</pre>
      <div class="lobby-section-label">${(agent.tools ?? []).length} Tool${(agent.tools ?? []).length !== 1 ? 's' : ''}</div>
      <div class="agents-tools-list">${tools}</div>
    </div>`;
  }).join('');

  const diagram = `<div class="diagram-wrap"><div class="diagram">
    <div class="diag-row"><div class="diag-node accent">User Input</div></div>
    <div class="diag-arrow-down">↓</div>
    <div class="diag-label">POST /api/chat  { messages[] }</div>
    <div class="diag-row"><div class="diag-node accent">Chat API  <small style="opacity:.7;font-weight:400">/api/chat</small></div></div>
    <div class="diag-arrow-down">↓</div>
    <div class="diag-label">last user message</div>
    <div class="diag-row"><div class="diag-node purple">Orchestrator Agent<br><small style="opacity:.7;font-weight:400">classify intent — 1 LLM call</small></div></div>
    <div class="diag-arrow-down">↓</div>
    <div class="diag-label">delegate_to_agent("reader" | "builder" | "generator" | "style-guide")</div>
    <div class="diag-row" style="gap:8px;align-items:stretch;flex-wrap:wrap">
      <div class="diag-node accent" style="font-size:11px;flex:1;text-align:center">Design System<br>Reader<br><small style="opacity:.7">up to 5 iters</small></div>
      <div class="diag-node orange" style="font-size:11px;flex:1;text-align:center">Component<br>Builder<br><small style="opacity:.7">up to 6 iters</small></div>
      <div class="diag-node green" style="font-size:11px;flex:1;text-align:center">System<br>Generator<br><small style="opacity:.7">up to 8 iters</small></div>
      <div class="diag-node red" style="font-size:11px;flex:1;text-align:center">Style<br>Guide<br><small style="opacity:.7">up to 5 iters</small></div>
    </div>
    <div class="diag-arrow-down">↓</div>
    <div class="diag-label">tool calls (per-agent subset)</div>
    <div class="diag-row" style="gap:32px">
      <div class="diag-node orange" style="font-size:11px">MCP Tool Calls<br><small style="opacity:.7">runMcpTool()</small></div>
      <div class="diag-arrow" style="align-self:center">↺</div>
      <div class="diag-node" style="font-size:11px">agentic<br>loop</div>
    </div>
    <div class="diag-arrow-down">↓</div>
    <div class="diag-label">JSON { "message":"…", "preview":"…html…" }</div>
    <div class="diag-row"><div class="diag-node green">✓ parseChatResponse()</div></div>
    <div class="diag-arrow-down">↓</div>
    <div class="diag-split">
      <div class="diag-branch"><div class="diag-node accent" style="font-size:11px">message<br><small style="opacity:.7">Chat bubble</small></div></div>
      <div class="diag-branch"><div class="diag-node green" style="font-size:11px">preview<br><small style="opacity:.7">Live Preview iframe</small></div></div>
    </div>
  </div></div>`;

  wrap.innerHTML = `${tabs}
    <div class="eval-agents-section-body" id="eval-agents-lobby-body">
      <div class="lobby-list">${cards}</div>
    </div>
    <div class="eval-agents-section-body" id="eval-agents-diagram-body" style="display:none">${diagram}</div>`;

  wrap.querySelectorAll('.eval-agents-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      wrap.querySelectorAll('.eval-agents-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const isLobby = tab.dataset.agentsTab === 'lobby';
      document.getElementById('eval-agents-lobby-body').style.display   = isLobby ? '' : 'none';
      document.getElementById('eval-agents-diagram-body').style.display = isLobby ? 'none' : '';
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. METRICS
// ═══════════════════════════════════════════════════════════════════════════════
async function loadMetrics() {
  const wrap = document.getElementById('eval-section-metrics');
  if (!wrap) return;
  wrap.innerHTML = '<div class="eval-loading">Loading metrics…</div>';
  try {
    const res = await fetch('/api/eval/metrics');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const m = await res.json();
    renderMetrics(wrap, m);
  } catch (err) {
    wrap.innerHTML = `<div class="eval-section-body"><div class="eval-error">Failed to load metrics: ${escapeHtml(String(err))}</div></div>`;
  }
}

function renderMetrics(wrap, m) {
  const totalToolCalls = Object.values(m.toolCalls ?? {}).reduce((a, b) => a + b, 0);
  const routingRows = Object.entries(m.routing ?? {}).sort((a,b) => b[1] - a[1]).map(([agent, count]) =>
    `<tr><td>${escapeHtml(agent)}</td><td class="count-cell">${count}</td></tr>`
  ).join('');
  const toolRows = Object.entries(m.toolCalls ?? {}).sort((a,b) => b[1] - a[1]).map(([tool, count]) =>
    `<tr><td>${escapeHtml(tool)}</td><td class="count-cell">${count}</td></tr>`
  ).join('');

  wrap.innerHTML = `
    <div class="eval-stats-bar">
      <div class="eval-stat-card">
        <span class="eval-stat-label">Requests</span>
        <span class="eval-stat-value">${m.requests ?? 0}</span>
      </div>
      <div class="eval-stat-card stat-pass">
        <span class="eval-stat-label">Cache hits</span>
        <span class="eval-stat-value">${m.cacheHits ?? 0}</span>
      </div>
      <div class="eval-stat-card stat-rate">
        <span class="eval-stat-label">Tool calls</span>
        <span class="eval-stat-value">${totalToolCalls}</span>
      </div>
    </div>
    <div class="eval-section-body">
      <div style="display:flex;gap:8px;margin-bottom:16px">
        <button class="eval-btn" id="eval-metrics-refresh">↺ Refresh</button>
        <button class="eval-btn eval-btn-red" id="eval-metrics-reset">Reset counters</button>
      </div>

      <div class="eval-metrics-section-title">Agent Routing Distribution</div>
      ${routingRows
        ? `<table class="eval-metrics-table"><thead><tr><th>Agent</th><th>Requests</th></tr></thead><tbody>${routingRows}</tbody></table>`
        : '<div style="font-size:12px;color:var(--text-dim);font-style:italic">No routing data yet — run some tests or chat messages.</div>'}

      <div class="eval-metrics-section-title">MCP Tool Invocations</div>
      ${toolRows
        ? `<table class="eval-metrics-table"><thead><tr><th>Tool</th><th>Calls</th></tr></thead><tbody>${toolRows}</tbody></table>`
        : '<div style="font-size:12px;color:var(--text-dim);font-style:italic">No tool calls recorded yet.</div>'}

      <div class="eval-metrics-reset-at">Stats since: ${escapeHtml(m.resetAt ?? 'unknown')}</div>
    </div>`;

  wrap.querySelector('#eval-metrics-refresh')?.addEventListener('click', loadMetrics);
  wrap.querySelector('#eval-metrics-reset')?.addEventListener('click', async () => {
    await fetch('/api/eval/metrics/reset', { method: 'POST' });
    loadMetrics();
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 6. PLAYGROUND
// ═══════════════════════════════════════════════════════════════════════════════

const PLAYGROUND_SCENARIOS = {
  token_audit: {
    name: 'Token Audit',
    description: 'Read primary colors → spacing → typography scale',
    steps: [
      { id: 'token_audit-1', agentId: 'reader', prompt: 'What are the primary color tokens?' },
      { id: 'token_audit-2', agentId: 'reader', prompt: 'What spacing tokens are defined in the design system?' },
      { id: 'token_audit-3', agentId: 'reader', prompt: 'What typography tokens are available — sizes, weights, and line-heights?' },
    ],
  },
  build_flow: {
    name: 'Read + Build Flow',
    description: 'Inspect button specs → build component → get style guidance',
    steps: [
      { id: 'build_flow-1', agentId: 'reader', prompt: 'What are the button component variants and their token properties?' },
      { id: 'build_flow-2', agentId: 'builder', prompt: 'Build a primary and secondary button component using design system tokens' },
      { id: 'build_flow-3', agentId: 'style-guide', prompt: 'What are the best practices for choosing between primary and secondary buttons?' },
    ],
  },
  compliance_check: {
    name: 'Style Compliance',
    description: 'Get color principles → read exact tokens → build a compliant form',
    steps: [
      { id: 'compliance_check-1', agentId: 'style-guide', prompt: 'What color usage principles and contrast requirements should I follow?' },
      { id: 'compliance_check-2', agentId: 'reader', prompt: 'What is the exact hex value of the primary action color and its accessible text pair?' },
      { id: 'compliance_check-3', agentId: 'builder', prompt: 'Build an accessible login form with a primary submit button following the design system color principles' },
    ],
  },
};

const PG_AGENT_LABELS = {
  orchestrator: 'Orchestrator',
  reader:        'Reader',
  builder:       'Builder',
  generator:     'Generator',
  'style-guide': 'Style Guide',
};

// ── State ─────────────────────────────────────────────────────────────────────
let pgSteps          = [];
let pgObservations   = [];
let pgRunning        = false;
let pgStopFlag       = false;
let pgSelectedKey    = 'token_audit';
let pgInited         = false;
let pgCustomStepSeq  = 0; // monotonic counter for custom step IDs

function pgFreshStep(s) {
  return { ...s, status: 'pending', output: undefined, model: undefined, latencyMs: undefined, toolCallsUsed: undefined, error: undefined };
}

function pgLoadScenario(key) {
  pgSelectedKey  = key;
  pgSteps        = PLAYGROUND_SCENARIOS[key].steps.map(pgFreshStep);
  pgObservations = [];
}

// ── Step runner ───────────────────────────────────────────────────────────────
async function pgRunStep(step, model) {
  const start = Date.now();
  const body = { messages: [{ role: 'user', content: step.prompt }], model };
  if (step.agentId !== 'orchestrator') body.previousAgent = step.agentId;

  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `HTTP ${res.status}`);
  }

  const reader  = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split('\n\n');
    buf = parts.pop() ?? '';
    for (const part of parts) {
      if (!part.startsWith('data: ')) continue;
      let ev;
      try { ev = JSON.parse(part.slice(6)); } catch { continue; }
      if (ev.type === 'done') {
        return {
          output:        ev.message        ?? '',
          model:         ev.model          ?? model,
          latencyMs:     Date.now() - start,
          toolCallsUsed: ev.toolCallsUsed  ?? [],
        };
      }
      if (ev.type === 'error') throw new Error(ev.error ?? 'Unknown error');
    }
  }
  throw new Error('Stream ended without a done event');
}

// ── Rendering ─────────────────────────────────────────────────────────────────
function pgLog(msg) {
  pgObservations.push(`[${new Date().toLocaleTimeString()}] ${msg}`);
  pgRenderObservations();
}

function pgRenderObservations() {
  const list = document.getElementById('pg-obs-list');
  if (!list) return;
  if (pgObservations.length === 0) {
    list.innerHTML = '<span class="pg-obs-empty">Run the chain to see observations…</span>';
    return;
  }
  list.innerHTML = pgObservations.map(o => `<div class="pg-obs-line">${escapeHtml(o)}</div>`).join('');
  list.scrollTop = list.scrollHeight;
}

function pgRenderChain() {
  const chainEl = document.getElementById('pg-chain');
  if (!chainEl) return;
  chainEl.innerHTML = pgSteps.map((step, idx) => `
    ${idx > 0 ? '<div class="pg-chain-arrow">→</div>' : ''}
    <div class="pg-chain-node pg-chain-node-${step.status}">
      <span class="pg-node-num">${idx + 1}</span>
      <span class="pg-node-agent">${escapeHtml(PG_AGENT_LABELS[step.agentId] ?? step.agentId)}</span>
    </div>
  `).join('');
}

function pgRenderTimeline() {
  const timeline = document.getElementById('pg-timeline');
  if (!timeline) return;

  timeline.innerHTML = pgSteps.map((step, idx) => {
    let content = '';
    if (step.status === 'pending') {
      content = `<div class="pg-prompt-preview">
        <span class="pg-prompt-label">Prompt:</span>
        <code class="pg-prompt-code">${escapeHtml(step.prompt.slice(0, 120))}${step.prompt.length > 120 ? '…' : ''}</code>
      </div>`;
    } else if (step.status === 'running') {
      content = `<div class="pg-running-indicator"><span class="pg-spinner"></span>Executing…</div>`;
    } else if (step.status === 'complete' && step.output) {
      const tools = (step.toolCallsUsed ?? []).map(t => `<span class="pg-tool-chip">${escapeHtml(t)}</span>`).join('');
      content = `
        ${tools ? `<div class="pg-tool-chips">${tools}</div>` : ''}
        <pre class="pg-step-output">${escapeHtml(step.output.slice(0, 400))}${step.output.length > 400 ? '…' : ''}</pre>`;
    } else if (step.status === 'error') {
      content = `<div class="pg-error-box">${escapeHtml(step.error ?? 'Error')}</div>`;
    }

    const chips = [
      step.latencyMs !== undefined ? `<span class="pg-meta-chip">${step.latencyMs}ms</span>` : '',
      step.model ? `<span class="pg-meta-chip">${escapeHtml(step.model)}</span>` : '',
    ].join('');
    const removeBtn = !pgRunning
      ? `<button class="pg-remove-step-btn" data-remove="${escapeHtml(step.id)}" title="Remove step">×</button>`
      : '';

    return `<div class="pg-step-card pg-step-card-${step.status}" data-step="${escapeHtml(step.id)}">
      <div class="pg-step-header">
        <div class="pg-step-identity">
          <span class="pg-status-dot pg-status-dot-${step.status}"></span>
          <span class="pg-step-num">${idx + 1}</span>
          <span class="pg-step-agent">${escapeHtml(PG_AGENT_LABELS[step.agentId] ?? step.agentId)}</span>
        </div>
        <div class="pg-step-meta">${chips}${removeBtn}</div>
      </div>
      ${content}
    </div>`;
  }).join('');

  timeline.querySelectorAll('.pg-remove-step-btn[data-remove]').forEach(btn => {
    btn.addEventListener('click', () => {
      pgSteps = pgSteps.filter(s => s.id !== btn.dataset.remove);
      pgRenderChain();
      pgRenderTimeline();
      pgUpdateControls();
    });
  });
}

function pgUpdateControls() {
  const runBtn   = document.getElementById('pg-run-btn');
  const stopBtn  = document.getElementById('pg-stop-btn');
  const resetBtn = document.getElementById('pg-reset-btn');
  const addBtn   = document.getElementById('pg-add-step-btn');
  if (runBtn)   { runBtn.disabled = pgRunning || pgSteps.length === 0; runBtn.textContent = pgRunning ? '⏳ Running…' : '▶ Run Chain'; }
  if (stopBtn)  { stopBtn.style.display = pgRunning ? '' : 'none'; }
  if (resetBtn) { resetBtn.disabled = pgRunning; }
  if (addBtn)   { addBtn.disabled = pgRunning; }
}

// ── Orchestration ─────────────────────────────────────────────────────────────
async function pgRunAll() {
  if (pgRunning || pgSteps.length === 0) return;
  pgRunning  = true;
  pgStopFlag = false;
  pgSteps = pgSteps.map(pgFreshStep);
  pgObservations = [];
  pgUpdateControls();
  pgRenderChain();
  pgRenderTimeline();
  pgLog('Chain started.');

  const model = getModel();
  for (let i = 0; i < pgSteps.length; i++) {
    if (pgStopFlag) { pgLog('Run stopped by user.'); break; }
    pgSteps[i] = { ...pgSteps[i], status: 'running' };
    pgRenderChain();
    pgRenderTimeline();
    pgLog(`Step ${i + 1}: ${pgSteps[i].agentId} — starting…`);
    try {
      const result = await pgRunStep(pgSteps[i], model);
      pgSteps[i] = {
        ...pgSteps[i],
        status:        'complete',
        output:        result.output,
        model:         result.model,
        latencyMs:     result.latencyMs,
        toolCallsUsed: result.toolCallsUsed,
      };
      pgLog(`Step ${i + 1}: ${pgSteps[i].agentId} — done in ${result.latencyMs}ms (${result.model})`);
    } catch (err) {
      pgSteps[i] = { ...pgSteps[i], status: 'error', error: String(err) };
      pgLog(`Step ${i + 1}: ${pgSteps[i].agentId} — error: ${String(err)}`);
    }
    pgRenderChain();
    pgRenderTimeline();
  }

  pgRunning = false;
  pgLog('Chain finished.');
  pgUpdateControls();
}

// ── Init ──────────────────────────────────────────────────────────────────────
function initPlaygroundSection() {
  // Re-entering: just refresh rendering, no re-build of DOM
  if (pgInited) {
    pgRenderChain();
    pgRenderTimeline();
    pgRenderObservations();
    pgUpdateControls();
    return;
  }

  pgLoadScenario('token_audit');
  const wrap = document.getElementById('eval-section-playground');
  if (!wrap) return;

  const scenarioOpts = Object.entries(PLAYGROUND_SCENARIOS)
    .map(([k, s]) => `<option value="${k}">${escapeHtml(s.name)}</option>`)
    .join('');

  const agentOpts = ['orchestrator','reader','builder','generator','style-guide']
    .map(a => `<option value="${a}">${escapeHtml(PG_AGENT_LABELS[a])}</option>`)
    .join('');

  wrap.insertAdjacentHTML('beforeend', `
    <div class="pg-layout">
      <div class="pg-header">
        <div class="pg-scenario-group">
          <label class="pg-field-label">Scenario</label>
          <select class="pg-select" id="pg-scenario-select">${scenarioOpts}</select>
          <p class="pg-scenario-desc" id="pg-scenario-desc">${escapeHtml(PLAYGROUND_SCENARIOS['token_audit'].description)}</p>
        </div>
        <div class="pg-actions">
          <button class="eval-btn eval-btn-green" id="pg-run-btn">▶ Run Chain</button>
          <button class="eval-btn" id="pg-stop-btn" style="display:none">⏹ Stop</button>
          <button class="eval-btn" id="pg-reset-btn">↺ Reset</button>
        </div>
      </div>

      <div class="pg-chain" id="pg-chain"></div>
      <div class="pg-timeline" id="pg-timeline"></div>

      <div class="pg-add-step-section">
        <div class="pg-add-step-label">Add Custom Step</div>
        <div class="pg-add-step-row">
          <select class="pg-select-sm" id="pg-custom-agent">${agentOpts}</select>
          <input class="pg-input-sm" id="pg-custom-prompt" placeholder="Enter a prompt for this step…" />
          <button class="eval-btn" id="pg-add-step-btn">+ Add Step</button>
        </div>
      </div>

      <div class="pg-observations">
        <div class="pg-add-step-label">Observations</div>
        <div class="pg-obs-list" id="pg-obs-list">
          <span class="pg-obs-empty">Run the chain to see observations…</span>
        </div>
      </div>
    </div>
  `);

  // Scenario change
  document.getElementById('pg-scenario-select').addEventListener('change', e => {
    pgLoadScenario(e.target.value);
    document.getElementById('pg-scenario-desc').textContent = PLAYGROUND_SCENARIOS[e.target.value].description;
    pgRenderChain();
    pgRenderTimeline();
    pgRenderObservations();
    pgUpdateControls();
  });

  // Run / Stop / Reset
  document.getElementById('pg-run-btn').addEventListener('click', pgRunAll);
  document.getElementById('pg-stop-btn').addEventListener('click', () => { pgStopFlag = true; });
  document.getElementById('pg-reset-btn').addEventListener('click', () => {
    if (pgRunning) return;
    pgSteps = pgSteps.map(pgFreshStep);
    pgObservations = [];
    pgRenderChain();
    pgRenderTimeline();
    pgRenderObservations();
  });

  // Add custom step
  document.getElementById('pg-add-step-btn').addEventListener('click', () => {
    const prompt = document.getElementById('pg-custom-prompt').value.trim();
    if (!prompt || pgRunning) return;
    const agentId = document.getElementById('pg-custom-agent').value;
    pgSteps.push({ id: `pg-custom-${++pgCustomStepSeq}`, agentId, prompt, status: 'pending' });
    document.getElementById('pg-custom-prompt').value = '';
    pgRenderChain();
    pgRenderTimeline();
    pgUpdateControls();
  });

  // Also allow Enter in the prompt input
  document.getElementById('pg-custom-prompt').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('pg-add-step-btn').click();
  });

  pgRenderChain();
  pgRenderTimeline();
  pgRenderObservations();
  pgUpdateControls();
  pgInited = true;
}
