const INFO = {
  chat: {
    title: "Chat Panel",
    body: `
      <p>This is your conversation window with the AI assistant. Type any question about the design system and the assistant will respond using live MCP tool calls to fetch accurate, up-to-date data.</p>
      <p><strong>What you can ask:</strong></p>
      <ul>
        <li>Design token values — colors, spacing, typography, shadows</li>
        <li>Component specifications, variants, and accessibility rules</li>
        <li>Token suggestions for a given intent (e.g. "error text color")</li>
        <li>Generate UI components grounded in the real token system</li>
        <li>Dark mode token overrides and theming</li>
      </ul>
      <p>Use the <strong>Quick Start</strong> chips below the chat to jump straight to common queries.</p>
    `,
  },
  preview: {
    title: "Live Preview Panel",
    body: `
      <p>When the AI generates an HTML/CSS UI component, it renders live here in a sandboxed iframe so you can see exactly what the component looks like.</p>
      <p><strong>Show Code / Show Preview toggle:</strong> Switch between the rendered visual output and the underlying HTML source code. You can copy the code directly from the code view.</p>
      <p>The preview is fully isolated — scripts and external resources are sandboxed, so only the generated HTML and inline styles are rendered.</p>
      <p>If the AI responds with analysis or token information (no UI output), this panel will show an empty state.</p>
    `,
  },
  mcp: {
    title: "Connecting to the MCP Server",
    body: `
      <p>This server exposes your design system as a set of <strong>MCP tools</strong> that any compatible AI client can call in real time — tokens, components, usage rules, color validation, and more.</p>
      <h4>Endpoint</h4>
      <pre><code id="mcp-endpoint-url">POST https://your-host/mcp</code></pre>
      <h4>Claude Desktop</h4>
      <p>Add to <code>claude_desktop_config.json</code> under <code>mcpServers</code>:</p>
      <pre><code>{
  "mcpServers": {
    "design-system": {
      "url": "https://your-host/mcp",
      "type": "http"
    }
  }
}</code></pre>
      <h4>GitHub Copilot / VS Code</h4>
      <p>Add to <code>.vscode/mcp.json</code> in your project:</p>
      <pre><code>{
  "servers": {
    "design-system": {
      "type": "http",
      "url": "https://your-host/mcp"
    }
  }
}</code></pre>
      <h4>What to expect</h4>
      <p>Once connected, your AI client can call tools like <code>get_tokens</code>, <code>get_component</code>, <code>suggest_token</code>, and <code>diff_against_system</code> automatically when answering design questions. Responses are grounded in live design system data — not the AI's training knowledge.</p>
      <p>See <a href="/health" target="_blank" rel="noopener noreferrer" style="color:var(--accent)">server status ↗</a> for the full tool list.</p>
    `,
  },
  tools: {
    title: "Design System Used",
    body: `
      <p>Every time the AI responds, it calls one or more <strong>MCP tools</strong> on the design system server to fetch real data. This panel shows which tools were called during the last response.</p>
      <p><strong>Available tools include:</strong></p>
      <ul>
        <li><code>get_tokens</code> — fetch design tokens by category</li>
        <li><code>get_component</code> — full component spec with props and constraints</li>
        <li><code>suggest_token</code> — rank tokens matching a natural-language intent</li>
        <li><code>validate_color</code> — check if a value matches a named token</li>
        <li><code>diff_against_system</code> — find CSS properties that break token compliance</li>
        <li><code>search</code> — full-text search across tokens, components, and icons</li>
        <li>…and 7 more. See <a href="/health" target="_blank" rel="noopener noreferrer" style="color:var(--accent)">MCP server ↗</a></li>
      </ul>
      <p>Because the AI always queries live data, responses stay accurate even if you load custom JSON via <strong>Load JSON</strong>.</p>
    `,
  },
};

export function initInfoModals() {
  const overlay  = document.getElementById("info-modal");
  const titleEl  = document.getElementById("info-modal-title");
  const bodyEl   = document.getElementById("info-modal-body");
  const closeBtn = document.getElementById("info-modal-close");
  const okBtn    = document.getElementById("info-modal-ok");

  function openInfo(key) {
    const info = INFO[key];
    if (!info) return;
    titleEl.textContent = info.title;
    bodyEl.innerHTML = info.body;
    overlay.classList.add("open");
  }

  function closeInfo() { overlay.classList.remove("open"); }

  document.querySelectorAll(".info-btn[data-info]").forEach(btn => {
    btn.addEventListener("click", () => openInfo(btn.dataset.info));
  });

  closeBtn.addEventListener("click", closeInfo);
  okBtn.addEventListener("click", closeInfo);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeInfo(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeInfo(); });

  // MCP server topbar button
  const mcpInfoBtn = document.getElementById("mcp-info-btn");
  if (mcpInfoBtn) {
    mcpInfoBtn.addEventListener("click", () => {
      openInfo("mcp");
      // Fill in the real host URL after the modal renders
      const el = document.getElementById("mcp-endpoint-url");
      if (el) el.textContent = `POST ${window.location.origin}/mcp`;
    });
  }
}
