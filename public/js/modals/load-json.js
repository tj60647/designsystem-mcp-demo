import { appendMessage, scrollToBottom } from '../chat.js';
import { openValidationModal } from './validation.js';

export function initLoadJsonModal() {
  const overlay       = document.getElementById("load-json-modal");
  const typeSelect    = document.getElementById("modal-type-select");
  const jsonInput     = document.getElementById("modal-json-input");
  const schemaHint    = document.getElementById("schema-hint");
  const schemaLoading = document.getElementById("schema-loading");
  const openBtn       = document.getElementById("load-json-btn");
  const closeBtn      = document.getElementById("modal-close-btn");
  const cancelBtn     = document.getElementById("modal-cancel-btn");
  const submitBtn     = document.getElementById("modal-submit-btn");
  const resetBtn      = document.getElementById("reset-btn");

  const schemaCache = {};

  async function fetchSchema(dataType) {
    if (schemaCache[dataType]) return schemaCache[dataType];
    try {
      schemaLoading.textContent = "(loading…)";
      const res = await fetch(`/api/schema/${dataType}`);
      schemaLoading.textContent = "";
      if (!res.ok) return "(could not load schema)";
      const json = await res.json();
      const text = JSON.stringify(json, null, 2);
      schemaCache[dataType] = text;
      return text;
    } catch {
      schemaLoading.textContent = "";
      return "(could not load schema)";
    }
  }

  async function openModal() {
    jsonInput.value = "";
    overlay.classList.add("open");
    jsonInput.focus();
    const schema = await fetchSchema(typeSelect.value);
    schemaHint.textContent = schema;
  }

  function closeModal() { overlay.classList.remove("open"); }

  typeSelect.addEventListener("change", async () => {
    const schema = await fetchSchema(typeSelect.value);
    schemaHint.textContent = schema;
  });

  openBtn.addEventListener("click", openModal);
  closeBtn.addEventListener("click", closeModal);
  cancelBtn.addEventListener("click", closeModal);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

  submitBtn.addEventListener("click", async () => {
    const raw = jsonInput.value.trim();
    if (!raw) { alert("Please paste JSON before loading."); return; }

    let parsed;
    try { parsed = JSON.parse(raw); }
    catch (e) { alert("Invalid JSON: " + e.message); return; }

    if (typeof parsed !== "object" || Array.isArray(parsed) || parsed === null) {
      alert("JSON must be an object (not an array or primitive).");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Validating…";
    try {
      const vRes = await fetch("/api/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: typeSelect.value, data: parsed }),
      });
      const vResult = await vRes.json();
      if (!vRes.ok) { alert("Validation error: " + (vResult.error ?? "Unknown error")); return; }

      if (vResult.valid && vResult.recommendations.length === 0) {
        await doLoad(parsed, typeSelect.value);
      } else {
        openValidationModal(vResult, parsed, typeSelect.value, doLoad);
      }
    } catch (err) {
      alert("Network error: " + err.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Load";
    }
  });

  async function doLoad(data, dataType) {
    try {
      const res = await fetch("/api/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: dataType, data }),
      });
      const result = await res.json();
      if (!res.ok) { alert("Error: " + (result.error ?? "Unknown error")); return; }
      closeModal();
      const msg = dataType === "design-system"
        ? `✓ Design system data loaded (${result.loaded?.join(", ") ?? "all"}). MCP tools now reflect the new data.`
        : `✓ ${dataType} data loaded. MCP tools now reflect the new data.`;
      appendMessage("assistant", msg);
      scrollToBottom();
      if (typeof window.notifyDataReloaded === "function") window.notifyDataReloaded();
    } catch (err) {
      alert("Network error: " + err.message);
    }
  }

  resetBtn.addEventListener("click", async () => {
    if (!confirm("Reset all design system data back to bundled defaults?")) return;
    resetBtn.disabled = true;
    try {
      const res = await fetch("/api/data/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const result = await res.json();
      if (!res.ok) { alert("Error: " + (result.error ?? "Unknown error")); return; }
      for (const k in schemaCache) { delete schemaCache[k]; }
      appendMessage("assistant", "✓ All data reset to bundled defaults. MCP tools now reflect the original design system.");
      scrollToBottom();
      if (typeof window.notifyDataReloaded === "function") window.notifyDataReloaded();
    } catch (err) {
      alert("Network error: " + err.message);
    } finally {
      resetBtn.disabled = false;
    }
  });
}

export function initDropZone() {
  const zone      = document.getElementById("modal-drop-zone");
  const fileInput = document.getElementById("modal-file-input");
  const jsonInput = document.getElementById("modal-json-input");

  function readFile(file) {
    if (!file || !file.name.endsWith(".json") && file.type !== "application/json") {
      alert("Please select a .json file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      jsonInput.value = e.target.result;
      jsonInput.focus();
    };
    reader.readAsText(file);
  }

  fileInput.addEventListener("change", () => {
    if (fileInput.files && fileInput.files[0]) readFile(fileInput.files[0]);
    fileInput.value = "";
  });

  zone.addEventListener("click", (e) => {
    if (e.target !== zone) return;
    fileInput.click();
  });

  zone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fileInput.click();
    }
  });

  zone.addEventListener("dragenter", (e) => { e.preventDefault(); zone.classList.add("drag-over"); });
  zone.addEventListener("dragover",  (e) => { e.preventDefault(); zone.classList.add("drag-over"); });
  zone.addEventListener("dragleave", (e) => { if (!zone.contains(e.relatedTarget)) zone.classList.remove("drag-over"); });
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.classList.remove("drag-over");
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) readFile(file);
  });
}
