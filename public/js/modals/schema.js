/**
 * Renders a JSON value as a collapsible, syntax-highlighted tree inside
 * the given container element.  Objects and arrays get a toggle button
 * that collapses/expands their children.
 *
 * @param {HTMLElement} container - The element to render into.
 * @param {*}           value     - Any parsed JSON value.
 */
function renderJsonTree(container, value) {
  container.innerHTML = "";
  container.appendChild(buildNode(value, null, true));
}

function buildNode(value, key, isLast) {
  const wrapper = document.createElement("div");
  wrapper.className = "jt-node";

  const type = value === null ? "null"
    : Array.isArray(value) ? "array"
    : typeof value;

  const row = document.createElement("div");
  row.className = "jt-row";

  const toggle = document.createElement("span");
  toggle.className = "jt-toggle";

  const label = document.createElement("span");

  if (key !== null) {
    const keyEl = document.createElement("span");
    keyEl.className = "jt-key";
    keyEl.textContent = `"${key}"`;
    const colon = document.createElement("span");
    colon.className = "jt-colon";
    colon.textContent = ":";
    label.appendChild(keyEl);
    label.appendChild(colon);
  }

  const comma = isLast ? "" : ",";

  if (type === "object" || type === "array") {
    const openBrace  = type === "object" ? "{" : "[";
    const closeBrace = type === "object" ? "}" : "]";
    const entries = type === "object" ? Object.entries(value) : value.map((v, i) => [i, v]);
    const count = entries.length;

    toggle.textContent = "▾";
    toggle.title = "Collapse";
    toggle.style.cursor = "pointer";

    const openEl = document.createElement("span");
    openEl.className = "jt-brace";
    openEl.textContent = openBrace;

    const summaryEl = document.createElement("span");
    summaryEl.className = "jt-summary";
    summaryEl.style.display = "none";
    summaryEl.textContent = ` ${count} ${count === 1 ? "item" : "items"} `;

    const closeSameLine = document.createElement("span");
    closeSameLine.className = "jt-brace";
    closeSameLine.textContent = closeBrace + comma;
    closeSameLine.style.display = "none";

    label.appendChild(openEl);
    label.appendChild(summaryEl);
    label.appendChild(closeSameLine);
    row.appendChild(toggle);
    row.appendChild(label);
    wrapper.appendChild(row);

    const indent = document.createElement("div");
    indent.className = "jt-indent";
    for (let i = 0; i < entries.length; i++) {
      const [k, v] = entries[i];
      indent.appendChild(buildNode(v, type === "object" ? k : null, i === entries.length - 1));
    }

    const closeRow = document.createElement("div");
    closeRow.className = "jt-row";
    const closeEl = document.createElement("span");
    closeEl.className = "jt-brace";
    closeEl.textContent = closeBrace + comma;
    closeRow.appendChild(document.createElement("span")); // spacer for toggle column
    closeRow.appendChild(closeEl);

    wrapper.appendChild(indent);
    wrapper.appendChild(closeRow);

    toggle.addEventListener("click", () => {
      const collapsed = wrapper.classList.toggle("jt-collapsed");
      toggle.textContent = collapsed ? "▸" : "▾";
      toggle.title = collapsed ? "Expand" : "Collapse";
      summaryEl.style.display = collapsed ? "" : "none";
      closeSameLine.style.display = collapsed ? "" : "none";
      closeRow.style.display = collapsed ? "none" : "";
    });

    if (count === 0) {
      toggle.style.visibility = "hidden";
    }
  } else {
    // Leaf value
    toggle.textContent = "";
    const valEl = document.createElement("span");
    if (type === "string") {
      valEl.className = "jt-str";
      valEl.textContent = `"${value}"${comma}`;
    } else if (type === "number") {
      valEl.className = "jt-num";
      valEl.textContent = value + comma;
    } else if (type === "boolean") {
      valEl.className = "jt-bool";
      valEl.textContent = value + comma;
    } else {
      valEl.className = "jt-null";
      valEl.textContent = "null" + comma;
    }
    label.appendChild(valEl);
    row.appendChild(toggle);
    row.appendChild(label);
    wrapper.appendChild(row);
  }

  return wrapper;
}

export function initViewSchemaModal() {
  const overlay     = document.getElementById("schema-modal");
  const typeSelect  = document.getElementById("schema-modal-type");
  const loading     = document.getElementById("schema-modal-loading");
  const treeEl      = document.getElementById("schema-modal-tree");
  const closeBtn    = document.getElementById("schema-modal-close");
  const cancelBtn   = document.getElementById("schema-modal-cancel");
  const downloadBtn = document.getElementById("schema-modal-download");
  const openBtn     = document.getElementById("view-schema-btn");

  const schemaCache = {};
  let currentSchema = null;

  async function loadSchema(dataType) {
    if (schemaCache[dataType]) {
      currentSchema = schemaCache[dataType];
      showSchema(currentSchema);
      return;
    }
    loading.textContent = "Loading schema…";
    loading.style.display = "";
    treeEl.style.display = "none";
    try {
      const res = await fetch(`/api/schema/${dataType}`);
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      const formatted = JSON.stringify(json, null, 2);
      schemaCache[dataType] = { json, formatted };
      currentSchema = schemaCache[dataType];
      showSchema(currentSchema);
    } catch (err) {
      loading.textContent = "Could not load schema: " + err.message;
    }
  }

  function showSchema({ json }) {
    renderJsonTree(treeEl, json);
    loading.style.display = "none";
    treeEl.style.display = "";
  }

  async function openModal() {
    loading.textContent = "Loading schema…";
    loading.style.display = "";
    treeEl.style.display = "none";
    currentSchema = null;
    overlay.classList.add("open");
    await loadSchema(typeSelect.value);
  }

  function closeModal() { overlay.classList.remove("open"); }

  typeSelect.addEventListener("change", () => loadSchema(typeSelect.value));

  downloadBtn.addEventListener("click", () => {
    if (!currentSchema) return;
    const blob = new Blob([currentSchema.formatted], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `${typeSelect.value}.schema.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  openBtn.addEventListener("click", openModal);
  closeBtn.addEventListener("click", closeModal);
  cancelBtn.addEventListener("click", closeModal);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && overlay.classList.contains("open")) closeModal(); });
}
