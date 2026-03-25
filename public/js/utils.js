export function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderMarkdown(text) {
  let html = escapeHtml(text);

  // Headings
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");

  // Bold / italic
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Code blocks
  html = html.replace(/```[\w]*\n([\s\S]*?)```/g, "<pre><code>$1</code></pre>");

  // Inline code
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Horizontal rule
  html = html.replace(/^---$/gm, "<hr>");

  // Unordered lists
  html = html.replace(/^[*\-] (.+)$/gm, "<li>$1</li>");
  html = html.replace(/(<li>(?:.*?)<\/li>\n?)+/gs, (block) => `<ul>${block}</ul>`);

  // Ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, "<li>$1</li>");

  // Paragraphs
  html = html.split("\n").map(line => {
    const trimmed = line.trim();
    if (!trimmed) return "";
    if (/^<(h[1-3]|ul|ol|li|pre|hr)/.test(trimmed)) return trimmed;
    return `<p>${trimmed}</p>`;
  }).filter(Boolean).join("\n");

  return html;
}

export function highlightTokens(container) {
  const tokenRegex = /\b(color|spacing|typography|borderRadius|shadow|motion|layout)\.[a-zA-Z0-9_.]+/g;

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
  const toReplace = [];
  let node;
  while ((node = walker.nextNode())) {
    if (tokenRegex.test(node.textContent)) toReplace.push(node);
    tokenRegex.lastIndex = 0;
  }

  for (const textNode of toReplace) {
    const parent = textNode.parentNode;
    if (!parent || parent.tagName === "CODE" || parent.tagName === "PRE") continue;

    const fragment = document.createDocumentFragment();
    let lastIdx = 0;
    let m;
    tokenRegex.lastIndex = 0;
    const str = textNode.textContent;

    while ((m = tokenRegex.exec(str)) !== null) {
      if (m.index > lastIdx) {
        fragment.appendChild(document.createTextNode(str.slice(lastIdx, m.index)));
      }
      const chip = document.createElement("span");
      chip.className = "token-chip";
      if (m[0].startsWith("color.")) {
        const swatch = document.createElement("span");
        swatch.className = "token-chip-swatch";
        swatch.style.background = "linear-gradient(135deg, #2f81f7, #bc8cff)";
        chip.appendChild(swatch);
      }
      chip.appendChild(document.createTextNode(m[0]));
      fragment.appendChild(chip);
      lastIdx = tokenRegex.lastIndex;
    }
    if (lastIdx < str.length) {
      fragment.appendChild(document.createTextNode(str.slice(lastIdx)));
    }
    parent.replaceChild(fragment, textNode);
    tokenRegex.lastIndex = 0;
  }
}
