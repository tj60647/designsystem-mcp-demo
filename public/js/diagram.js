/**
 * Design System MCP — System Diagram (Letterly-style interactive SVG)
 *
 * Builds an SVG flow diagram showing how a chat message travels through
 * the multi-agent system and MCP layer.  Nodes are hoverable/clickable;
 * clicking a node pins it and shows a description in the info panel below.
 */

// ── Node and edge data ──────────────────────────────────────────────────────

const NODE_TYPES = {
  'user-input':   { fill: '#1d4ed8', stroke: '#1e40af', text: '#ffffff', legendLabel: 'User Input' },
  'api':          { fill: '#334155', stroke: '#1e293b', text: '#cbd5e1', legendLabel: 'API Endpoint' },
  'orchestrator': { fill: '#7c3aed', stroke: '#6d28d9', text: '#ffffff', legendLabel: 'Orchestrator' },
  'reader':       { fill: '#2f81f7', stroke: '#1a6ee5', text: '#ffffff', legendLabel: 'DS Reader' },
  'builder':      { fill: '#d97706', stroke: '#b45309', text: '#ffffff', legendLabel: 'Component Builder' },
  'style-guide':  { fill: '#be185d', stroke: '#9d174d', text: '#ffffff', legendLabel: 'Style Guide' },
  'generator':    { fill: '#16a34a', stroke: '#15803d', text: '#ffffff', legendLabel: 'System Generator' },
  'mcp':          { fill: '#0f766e', stroke: '#115e59', text: '#ffffff', legendLabel: 'MCP Tools (agentic loop)' },
  'output':       { fill: '#f0fdf4', stroke: '#16a34a', text: '#15803d', legendLabel: 'Response Output' },
};

const NODES = [
  {
    id: 'userInput', label: 'User Input', sublabel: 'Your prompt',
    type: 'user-input', cx: 80, cy: 270, w: 120, h: 44,
    description: 'The chat message typed by the user. Every request starts here. The full conversation history is included in the POST body so the AI has context from previous turns.',
  },
  {
    id: 'chatApi', label: 'Chat API', sublabel: 'POST /api/chat',
    type: 'api', cx: 260, cy: 270, w: 135, h: 44,
    description: 'Receives the full message history, loads per-agent model and temperature settings, and hands off the latest user message to the Orchestrator for intent classification.',
  },
  {
    id: 'orchestrator', label: 'Orchestrator', sublabel: 'classify intent · 1 LLM call',
    type: 'orchestrator', cx: 460, cy: 270, w: 160, h: 52,
    description: 'Classifies the user\'s intent in exactly one LLM call using the delegate_to_agent() tool. Routes to one of four specialist agents — Reader, Builder, Style Guide, or Generator — based on what the user is asking. Never answers the user directly.',
  },
  {
    id: 'reader', label: 'DS Reader', sublabel: 'READER · up to 5 iters',
    type: 'reader', cx: 680, cy: 120, w: 158, h: 44,
    description: 'Answers questions about tokens, components, themes, icons, layout, and accessibility using read-only MCP tools. Calls up to 5 MCP tools per turn before producing a final structured response.',
  },
  {
    id: 'builder', label: 'Component Builder', sublabel: 'BUILDER · up to 6 iters',
    type: 'builder', cx: 680, cy: 225, w: 158, h: 44,
    description: 'Generates grounded HTML/CSS component code using exact design system tokens. Validates props and token values via MCP tools before emitting code. Produces JSON with a message and preview HTML. Up to 6 MCP tool iterations.',
  },
  {
    id: 'styleGuide', label: 'Style Guide', sublabel: 'STYLE-GUIDE · up to 5 iters',
    type: 'style-guide', cx: 680, cy: 330, w: 158, h: 44,
    description: 'Explains design principles, color usage rules, typography guidelines, and composition patterns. Uses MCP tools to ground answers in live style guide content and actual token values. Up to 5 iterations.',
  },
  {
    id: 'generator', label: 'System Generator', sublabel: 'GENERATOR · up to 8 iters',
    type: 'generator', cx: 680, cy: 435, w: 158, h: 44,
    description: 'Gathers brand requirements through conversation then calls the generate_design_system MCP tool to produce a complete design system (tokens, components, themes, icons). The most iteration-heavy agent — up to 8 MCP tool calls.',
  },
  {
    id: 'mcpTools', label: 'MCP Tool Calls', sublabel: '28 tools · per-agent subset',
    type: 'mcp', cx: 905, cy: 277, w: 158, h: 44, background: true,
    description: 'The live MCP server — called by whichever specialist is active. Each specialist has a curated subset of the 28 available tools. The specialist calls a tool, gets structured live data back, and decides whether to call more tools or produce a final answer. This ↺ agentic loop is what makes responses grounded in real design system data rather than guesses.',
  },
  {
    id: 'response', label: 'Response', sublabel: 'message + preview HTML',
    type: 'output', cx: 1115, cy: 270, w: 130, h: 52,
    description: 'The parsed final response from the specialist agent. Contains a message string (rendered as a markdown chat bubble) and an optional preview field (rendered as live HTML in the Live Preview iframe on the Workspace tab).',
  },
];

// Edges: { from, to, label, dashed, path }
// Path coords calculated from node cx/cy/w/h above.
const EDGES = [
  // Main flow — solid arrows
  {
    from: 'userInput', to: 'chatApi',
    label: 'chat message',
    path: 'M 140,270 H 192',
  },
  {
    from: 'chatApi', to: 'orchestrator',
    label: 'messages[ ]',
    path: 'M 327,270 H 379',
  },
  {
    from: 'orchestrator', to: 'reader',
    label: 'delegate',
    path: 'M 540,258 C 570,258 570,120 601,120',
  },
  {
    from: 'orchestrator', to: 'builder',
    label: '',
    path: 'M 540,263 C 570,263 570,225 601,225',
  },
  {
    from: 'orchestrator', to: 'styleGuide',
    label: '',
    path: 'M 540,277 C 570,277 570,330 601,330',
  },
  {
    from: 'orchestrator', to: 'generator',
    label: '',
    path: 'M 540,282 C 570,282 570,435 601,435',
  },
  // MCP tool calls — dashed (specialist → MCP)
  {
    from: 'reader', to: 'mcpTools',
    label: 'tool calls',
    path: 'M 759,120 C 830,120 826,265 826,265',
    dashed: true,
  },
  {
    from: 'builder', to: 'mcpTools',
    label: '',
    path: 'M 759,225 C 830,225 826,270 826,270',
    dashed: true,
  },
  {
    from: 'styleGuide', to: 'mcpTools',
    label: '',
    path: 'M 759,330 C 830,330 826,282 826,282',
    dashed: true,
  },
  {
    from: 'generator', to: 'mcpTools',
    label: '',
    path: 'M 759,435 C 830,435 826,288 826,288',
    dashed: true,
  },
  // Specialist → response — dashed (final answer)
  {
    from: 'reader', to: 'response',
    label: 'response',
    path: 'M 759,108 C 950,108 950,256 1050,256',
    dashed: true,
  },
  {
    from: 'builder', to: 'response',
    label: '',
    path: 'M 759,213 C 950,213 950,262 1050,262',
    dashed: true,
  },
  {
    from: 'styleGuide', to: 'response',
    label: '',
    path: 'M 759,342 C 950,342 950,276 1050,276',
    dashed: true,
  },
  {
    from: 'generator', to: 'response',
    label: '',
    path: 'M 759,447 C 950,447 950,282 1050,282',
    dashed: true,
  },
];

// Column section labels and divider positions
const COLUMNS = [
  { x: 80,   label: 'USER' },
  { x: 260,  label: 'API' },
  { x: 460,  label: 'ROUTING' },
  { x: 680,  label: 'SPECIALISTS' },
  { x: 905,  label: 'MCP' },
  { x: 1115, label: 'OUTPUT' },
];
const DIVIDERS = [170, 358, 558, 782, 1008];

// SVG dimensions
const SVG_W = 1240;
const SVG_H = 500;

// ── SVG helpers ─────────────────────────────────────────────────────────────

function svgEl(tag, attrs = {}) {
  const NS = 'http://www.w3.org/2000/svg';
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, String(v));
  }
  return el;
}

function buildArrowMarker(id, color) {
  const marker = svgEl('marker', {
    id,
    markerWidth: '8', markerHeight: '8',
    refX: '7', refY: '3',
    orient: 'auto',
  });
  marker.appendChild(svgEl('path', {
    d: 'M0,0 L0,6 L8,3 z',
    fill: color,
  }));
  return marker;
}

// ── SVG builder ──────────────────────────────────────────────────────────────

function buildDiagramSvg() {
  const svg = svgEl('svg', {
    viewBox: `0 0 ${SVG_W} ${SVG_H}`,
    'aria-label': 'Design System MCP system diagram',
    role: 'img',
    style: 'display:block; min-width:640px; width:100%;',
  });

  const defs = svgEl('defs');
  defs.setAttribute('aria-hidden', 'true');
  // One marker per node type color, plus a dim one for dashed edges
  defs.appendChild(buildArrowMarker('arr-solid', '#94a3b8'));
  defs.appendChild(buildArrowMarker('arr-dashed', '#94a3b8'));
  for (const [type, style] of Object.entries(NODE_TYPES)) {
    defs.appendChild(buildArrowMarker(`arr-${type}`, style.stroke));
  }
  svg.appendChild(defs);

  // ── Column dividers ──
  for (const x of DIVIDERS) {
    svg.appendChild(svgEl('line', {
      x1: x, y1: 28, x2: x, y2: SVG_H - 10,
      stroke: '#30363d', 'stroke-width': 1, 'stroke-dasharray': '4 4',
    }));
  }

  // ── Column labels ──
  for (const col of COLUMNS) {
    const t = svgEl('text', {
      x: col.x, y: 18,
      'text-anchor': 'middle',
      fill: '#8b949e',
      'font-size': 10,
      'font-weight': 700,
      'font-family': 'system-ui, sans-serif',
      'letter-spacing': '0.08em',
    });
    t.textContent = col.label;
    svg.appendChild(t);
  }

  // ── Edges ──
  const edgeG = svgEl('g', { 'data-layer': 'edges' });
  for (const edge of EDGES) {
    const fromNode = NODES.find(n => n.id === edge.from);
    const stroke = edge.dashed ? '#4b5563' : '#6b7280';
    const strokeW = edge.dashed ? 1.5 : 2;
    const marker = `url(#arr-${edge.dashed ? 'dashed' : 'solid'})`;

    const g = svgEl('g');
    g.appendChild(svgEl('path', {
      d: edge.path,
      fill: 'none',
      stroke,
      'stroke-width': strokeW,
      'stroke-dasharray': edge.dashed ? '6 4' : undefined,
      'marker-end': marker,
    }));

    // Edge label (only for labeled edges)
    if (edge.label) {
      // Approximate midpoint: sample bezier at t=0.5 using simple midpoint trick
      const pts = parseMidpoint(edge.path);
      if (pts) {
        const lbl = svgEl('text', {
          x: pts.x, y: pts.y - 4,
          'text-anchor': 'middle',
          fill: '#6b7280',
          'font-size': 9,
          'font-family': 'system-ui, sans-serif',
        });
        lbl.textContent = edge.label;
        g.appendChild(lbl);
      }
    }
    edgeG.appendChild(g);
  }
  svg.appendChild(edgeG);

  // ── Nodes ──
  const nodeG = svgEl('g', { 'data-layer': 'nodes' });
  for (const node of NODES) {
    const style = NODE_TYPES[node.type];
    const x = node.cx - node.w / 2;
    const y = node.cy - node.h / 2;
    const rx = node.type === 'output' ? 22 : 7;

    const g = svgEl('g', {
      'data-node-id': node.id,
      role: 'button',
      'aria-label': `${node.label}: ${node.description}`,
      style: `cursor:pointer; opacity:${node.background ? 0.85 : 1}`,
      tabindex: 0,
    });

    // Glow rect (hidden by default, shown on hover/pin via JS)
    const glow = svgEl('rect', {
      x: x - 4, y: y - 4,
      width: node.w + 8, height: node.h + 8,
      rx: rx + 3, ry: rx + 3,
      fill: 'none',
      stroke: style.stroke,
      'stroke-width': 2.5,
      opacity: 0,
      'data-glow': 'true',
    });
    g.appendChild(glow);

    // Node box
    g.appendChild(svgEl('rect', {
      x, y, width: node.w, height: node.h, rx, ry: rx,
      fill: style.fill,
      stroke: style.stroke,
      'stroke-width': 1.5,
      'stroke-dasharray': node.background ? '5 3' : undefined,
    }));

    // Label
    const label = svgEl('text', {
      x: node.cx, y: node.cy - 5,
      'text-anchor': 'middle',
      fill: style.text,
      'font-size': 11,
      'font-weight': 700,
      'font-family': 'system-ui, sans-serif',
    });
    label.textContent = node.label;
    g.appendChild(label);

    // Sublabel
    const sub = svgEl('text', {
      x: node.cx, y: node.cy + 9,
      'text-anchor': 'middle',
      fill: style.text,
      'font-size': 8.5,
      opacity: 0.8,
      'font-family': node.type === 'output' ? 'system-ui, sans-serif' : 'SFMono-Regular, Consolas, monospace',
    });
    sub.textContent = node.sublabel;
    g.appendChild(sub);

    nodeG.appendChild(g);
  }
  svg.appendChild(nodeG);

  // ── Agentic loop annotation ──
  const loopText = svgEl('text', {
    x: 906, y: 338,
    'text-anchor': 'middle',
    fill: '#0d9488',
    'font-size': 9.5,
    'font-weight': 600,
    'font-family': 'system-ui, sans-serif',
    'letter-spacing': '0.03em',
  });
  loopText.textContent = '↺ agentic loop';
  svg.appendChild(loopText);

  return svg;
}

// ── Approximate midpoint of a path string for label placement ───────────────
function parseMidpoint(pathStr) {
  try {
    // Simple heuristic: average of start and end coords in the path
    const nums = pathStr.match(/-?\d+(?:\.\d+)?/g);
    if (!nums || nums.length < 4) return null;
    const n = nums.map(Number);
    // Take first two (start) and last two (end)
    const mx = (n[0] + n[n.length - 2]) / 2;
    const my = (n[1] + n[n.length - 1]) / 2;
    return { x: mx, y: my };
  } catch {
    return null;
  }
}

// ── Interaction ──────────────────────────────────────────────────────────────

export function initDiagram() {
  const wrap = document.getElementById('diagram-svg-wrap');
  if (!wrap) return;

  const svg = buildDiagramSvg();
  wrap.appendChild(svg);

  const infoPanel = document.getElementById('diag-info-panel');
  const infoBadge = document.getElementById('diag-info-badge');
  const infoText  = document.getElementById('diag-info-text');
  const infoPin   = document.getElementById('diag-info-pin');

  let hoveredId = null;
  let pinnedId  = null;

  const nodeById = Object.fromEntries(NODES.map(n => [n.id, n]));

  function setGlow(id, on, isPinned = false) {
    const g = wrap.querySelector(`[data-node-id="${id}"]`);
    if (!g) return;
    const glow = g.querySelector('[data-glow]');
    if (!glow) return;
    glow.setAttribute('opacity', on ? (isPinned ? 0.7 : 0.45) : 0);
  }

  function updateInfo(id) {
    const node = id ? nodeById[id] : null;
    if (!infoPanel) return;
    if (!node) {
      if (infoBadge) infoBadge.textContent = '';
      if (infoText) infoText.textContent = 'Hover over a node to learn more · click to pin';
      if (infoText) infoText.style.fontStyle = 'italic';
      if (infoText) infoText.style.color = '';
      if (infoBadge) infoBadge.style.cssText = '';
      if (infoPin) infoPin.style.display = 'none';
      return;
    }
    const style = NODE_TYPES[node.type];
    if (infoBadge) {
      infoBadge.textContent = node.sublabel;
      infoBadge.style.cssText = `background:${style.fill}; color:${style.text}; border:1px solid ${style.stroke}; display:inline-block; padding:2px 9px; border-radius:5px; font-size:11px; font-family:monospace; font-weight:600; letter-spacing:.02em; flex-shrink:0; margin-top:1px`;
    }
    if (infoText) {
      infoText.textContent = node.description;
      infoText.style.fontStyle = 'normal';
      infoText.style.color = '';
    }
    if (infoPin) {
      infoPin.style.display = pinnedId === id ? '' : 'none';
    }
  }

  // Wire events to each node group
  for (const node of NODES) {
    const g = wrap.querySelector(`[data-node-id="${node.id}"]`);
    if (!g) continue;

    g.addEventListener('mouseenter', () => {
      hoveredId = node.id;
      setGlow(node.id, true, pinnedId === node.id);
      updateInfo(node.id);
    });

    g.addEventListener('mouseleave', () => {
      hoveredId = null;
      if (pinnedId !== node.id) setGlow(node.id, false);
      updateInfo(pinnedId);
    });

    g.addEventListener('click', () => {
      if (pinnedId === node.id) {
        // unpin
        pinnedId = null;
        setGlow(node.id, hoveredId === node.id, false);
        updateInfo(hoveredId);
      } else {
        // unpin previous
        if (pinnedId) setGlow(pinnedId, hoveredId === pinnedId, false);
        pinnedId = node.id;
        setGlow(node.id, true, true);
        updateInfo(node.id);
      }
    });

    g.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        g.dispatchEvent(new MouseEvent('click'));
      }
    });
  }

  // Build the legend
  const legendWrap = document.getElementById('diag-legend');
  if (legendWrap) {
    for (const [type, style] of Object.entries(NODE_TYPES)) {
      const item = document.createElement('div');
      item.className = 'diag-legend-item';
      const swatch = document.createElement('span');
      swatch.className = 'diag-legend-swatch';
      if (type === 'mcp') {
        swatch.style.cssText = `background:${style.fill}; border:1.5px dashed ${style.stroke}`;
      } else {
        swatch.style.cssText = `background:${style.fill}; border:1.5px solid ${style.stroke}`;
      }
      const label = document.createElement('span');
      label.className = 'diag-legend-label';
      label.textContent = style.legendLabel;
      item.appendChild(swatch);
      item.appendChild(label);
      legendWrap.appendChild(item);
    }
    // Dashed arrow legend
    const dashItem = document.createElement('div');
    dashItem.className = 'diag-legend-item';
    dashItem.innerHTML = '<span class="diag-legend-dash"></span><span class="diag-legend-label">Background / on-demand</span>';
    legendWrap.appendChild(dashItem);
  }
}
