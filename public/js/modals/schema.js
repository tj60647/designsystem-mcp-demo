export function initViewSchemaModal() {
  const overlay     = document.getElementById("schema-modal");
  const typeSelect  = document.getElementById("schema-modal-type");
  const loading     = document.getElementById("schema-modal-loading");
  const pre         = document.getElementById("schema-modal-pre");
  const code        = document.getElementById("schema-modal-code");
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
    pre.style.display = "none";
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

  function showSchema({ formatted }) {
    code.textContent = formatted;
    loading.style.display = "none";
    pre.style.display = "";
  }

  async function openModal() {
    loading.textContent = "Loading schema…";
    loading.style.display = "";
    pre.style.display = "none";
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
