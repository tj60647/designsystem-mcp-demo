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
  'reader':       { fill: '#2f81f7', stroke: '#1a6ee5', text: '#ffffff', legendLabel: 'Design System Reader' },
  'builder':      { fill: '#d97706', stroke: '#b45309', text: '#ffffff', legendLabel: 'Component Builder' },
  'style-guide':  { fill: '#be185d', stroke: '#9d174d', text: '#ffffff', legendLabel: 'Style Guide' },
  'generator':    { fill: '#16a34a', stroke: '#15803d', text: '#ffffff', legendLabel: 'System Generator' },
  'mcp':          { fill: '#0f766e', stroke: '#115e59', text: '#ffffff', legendLabel: 'MCP Tools (agentic loop)' },
  'output':       { fill: '#f0fdf4', stroke: '#16a34a', text: '#15803d', legendLabel: 'Response Output' },
};

const NODES = [
  {
    id: 'userInput', label: 'User Input', sublabel: 'Your prompt',
    type: 'user-input', cx: 80, cy: 228, w: 120, h: 44,
    description: 'The chat message you type. Every request starts here. The full conversation history travels with it so the AI remembers what was said earlier in the chat.',
  },
  {
    id: 'chatApi', label: 'Chat API', sublabel: 'POST /api/chat',
    type: 'api', cx: 260, cy: 228, w: 135, h: 44,
    description: 'The server endpoint that receives your message. It loads the right AI model settings and passes the conversation to the Orchestrator, which decides which specialist should handle it.',
  },
  {
    id: 'orchestrator', label: 'Orchestrator', sublabel: 'classify intent · 1 LLM call',
    type: 'orchestrator', cx: 460, cy: 228, w: 160, h: 52,
    description: 'A lightweight AI "traffic director" that reads your message and decides which specialist should handle it — in exactly one AI call. It only has one tool: delegate_to_agent(), which routes to Reader, Builder, Style Guide, or Generator. It never answers questions itself and has no access to design system data.',
  },
  {
    id: 'reader', label: 'Design System Reader', sublabel: 'READER · up to 5 tool calls',
    type: 'reader', cx: 680, cy: 100, w: 158, h: 44,
    description: 'Answers questions about tokens, components, themes, icons, layout, and accessibility. It has access to 25 read-only MCP tools and can call up to 5 of them per turn before writing its final answer.',
  },
  {
    id: 'builder', label: 'Component Builder', sublabel: 'BUILDER · up to 6 tool calls',
    type: 'builder', cx: 680, cy: 185, w: 158, h: 44,
    description: 'Generates HTML/CSS component code grounded in real design system tokens. It has access to 14 MCP tools covering components, tokens, validation, and accessibility — and can make up to 6 tool calls to look up and verify values before producing the final code.',
  },
  {
    id: 'styleGuide', label: 'Style Guide', sublabel: 'STYLE-GUIDE · up to 4 tool calls',
    type: 'style-guide', cx: 680, cy: 270, w: 158, h: 44,
    description: 'Explains design principles, color usage rules, typography guidelines, and composition patterns. Has access to 4 focused MCP tools (style guide content, token lookup, and contrast checking) and can make up to 4 tool calls per turn.',
  },
  {
    id: 'generator', label: 'System Generator', sublabel: 'GENERATOR · up to 8 tool calls',
    type: 'generator', cx: 680, cy: 355, w: 158, h: 44,
    description: 'Gathers brand requirements through a short conversation, then calls the generate_design_system MCP tool to produce a complete design system (tokens, components, themes, icons). It has access to 1 MCP tool and may use up to 8 tool calls to gather inputs, generate, and confirm the result — the highest budget of any specialist.',
  },
  {
    id: 'readerMcp', label: 'Reader MCP', sublabel: '25 read-only tools',
    type: 'mcp', cx: 905, cy: 100, w: 158, h: 44,
    description: 'The Design System Reader\'s MCP toolkit — 25 read-only tools covering token lookup, component specs, theme data, icon catalog, layout rules, and accessibility guidelines. The agent calls these tools iteratively (↺ agentic loop), receiving real design system data each time, before composing its final answer.',
  },
  {
    id: 'builderMcp', label: 'Builder MCP', sublabel: '14 tools · build + validate',
    type: 'mcp', cx: 905, cy: 185, w: 158, h: 44,
    description: 'The Component Builder\'s MCP toolkit — 14 tools for component specs, token values, validation, and accessibility checks. Each call returns real design system data the agent uses to ground its generated HTML/CSS before writing the final code.',
  },
  {
    id: 'styleGuideMcp', label: 'Style Guide MCP', sublabel: '4 tools',
    type: 'mcp', cx: 905, cy: 270, w: 158, h: 44,
    description: 'The Style Guide\'s MCP toolkit — 4 focused tools: style guide content retrieval, token lookup, contrast checking, and color palette queries. The tight set keeps the specialist on-topic and avoids over-fetching.',
  },
  {
    id: 'generatorMcp', label: 'Generator MCP', sublabel: '1 tool · generate_design_system',
    type: 'mcp', cx: 905, cy: 355, w: 158, h: 44,
    description: 'The System Generator\'s MCP toolkit — a single powerful tool: generate_design_system(). The agent may invoke it up to 8 times across the conversation to gather brand requirements, trigger generation, and confirm the result. Highest call budget of any specialist.',
  },
  {
    id: 'response', label: 'Response', sublabel: 'message + preview + metadata',
    type: 'output', cx: 1115, cy: 228, w: 130, h: 52,
    description: 'The final structured response from the specialist. It contains three parts: a message (shown as a chat bubble, supports markdown), an optional preview (raw HTML rendered live in the Preview pane on the Workspace tab), and optional metadata notes (machine-readable fields like agent name and intent, used internally).',
  },
];

const EDGES = [
  // Main flow — solid arrows
  {
    from: 'userInput', to: 'chatApi',
    label: 'chat message',
    path: 'M 140,228 H 192',
  },
  {
    from: 'chatApi', to: 'orchestrator',
    label: 'messages[ ]',
    path: 'M 327,228 H 379',
  },
  {
    from: 'orchestrator', to: 'reader',
    label: 'delegate',
    path: 'M 540,216 C 570,216 570,100 601,100',
  },
  {
    from: 'orchestrator', to: 'builder',
    label: '',
    path: 'M 540,221 C 570,221 570,185 601,185',
  },
  {
    from: 'orchestrator', to: 'styleGuide',
    label: '',
    path: 'M 540,235 C 570,235 570,270 601,270',
  },
  {
    from: 'orchestrator', to: 'generator',
    label: '',
    path: 'M 540,240 C 570,240 570,355 601,355',
  },
  // MCP tool calls — dashed, bidirectional (specialist ⇄ MCP), straight horizontal paths
  {
    from: 'reader', to: 'readerMcp',
    label: 'call / result',
    path: 'M 759,100 H 826',
    dashed: true, bidir: true,
  },
  {
    from: 'builder', to: 'builderMcp',
    label: '',
    path: 'M 759,185 H 826',
    dashed: true, bidir: true,
  },
  {
    from: 'styleGuide', to: 'styleGuideMcp',
    label: '',
    path: 'M 759,270 H 826',
    dashed: true, bidir: true,
  },
  {
    from: 'generator', to: 'generatorMcp',
    label: '',
    path: 'M 759,355 H 826',
    dashed: true, bidir: true,
  },
  // Specialist → response — solid arrows (specialist composes the final answer;
  // paths route below the MCP column to avoid visual confusion with tool calls)
  {
    from: 'reader', to: 'response',
    label: 'response',
    path: 'M 759,100 H 795 V 395 H 1010 C 1010,395 1010,214 1050,214',
  },
  {
    from: 'builder', to: 'response',
    label: '',
    path: 'M 759,185 H 795 V 395 H 1010 C 1010,395 1010,220 1050,220',
  },
  {
    from: 'styleGuide', to: 'response',
    label: '',
    path: 'M 759,270 H 795 V 395 H 1010 C 1010,395 1010,228 1050,228',
  },
  {
    from: 'generator', to: 'response',
    label: '',
    path: 'M 759,355 H 795 V 395 H 1010 C 1010,395 1010,234 1050,234',
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
const SVG_H = 420;

// ── SVG helpers ─────────────────────────────────────────────────────────────

function svgEl(tag, attrs = {}) {
  const NS = 'http://www.w3.org/2000/svg';
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, String(v));
  }
  return el;
}

function buildArrowMarker(id, color, orient = 'auto') {
  const marker = svgEl('marker', {
    id,
    markerWidth: '8', markerHeight: '8',
    refX: '7', refY: '3',
    orient,
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
  defs.appendChild(buildArrowMarker('arr-dashed-rev', '#94a3b8', 'auto-start-reverse'));
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
    const stroke = edge.dashed ? '#4b5563' : '#6b7280';
    const strokeW = edge.dashed ? 1.5 : 2;
    const markerEnd = `url(#arr-${edge.dashed ? 'dashed' : 'solid'})`;
    const markerStart = edge.bidir ? 'url(#arr-dashed-rev)' : undefined;

    const g = svgEl('g');
    g.appendChild(svgEl('path', {
      d: edge.path,
      fill: 'none',
      stroke,
      'stroke-width': strokeW,
      'stroke-dasharray': edge.dashed ? '6 4' : undefined,
      'marker-end': markerEnd,
      'marker-start': markerStart,
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
}
