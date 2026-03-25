// openValidationModal is called from load-json.js after import
let _pendingData   = null;
let _pendingType   = null;
let _pendingLoadFn = null;

// DOM refs (resolved lazily on first call, after DOMContentLoaded)
let _overlay, _body, _loadBtn;

export function openValidationModal(result, data, dataType, loadFn) {
  if (!_overlay) {
    _overlay = document.getElementById("validation-modal");
    _body    = document.getElementById("validation-modal-body");
    _loadBtn = document.getElementById("validation-modal-load");
  }

  _pendingData   = data;
  _pendingType   = dataType;
  _pendingLoadFn = loadFn;

  _body.innerHTML = "";

  // Status banner
  const status = document.createElement("div");
  status.className = "validation-status " + (result.valid ? (result.recommendations.length ? "warning" : "valid") : "invalid");
  if (!result.valid) {
    status.textContent = `✗ ${result.errors.length} error${result.errors.length !== 1 ? "s" : ""} found — JSON does not fully match the ${dataType === "design-system" ? "design-system" : dataType} schema.`;
  } else if (result.recommendations.length) {
    status.textContent = `⚠ JSON is structurally valid with ${result.recommendations.length} recommendation${result.recommendations.length !== 1 ? "s" : ""}.`;
  } else {
    status.textContent = "✓ JSON is valid.";
  }
  _body.appendChild(status);

  // Errors
  if (result.errors.length) {
    const title = document.createElement("div");
    title.className = "validation-section-title";
    title.textContent = "Errors";
    _body.appendChild(title);

    const ul = document.createElement("ul");
    ul.className = "validation-list errors";
    for (const err of result.errors) {
      const li = document.createElement("li");
      li.textContent = err;
      ul.appendChild(li);
    }
    _body.appendChild(ul);
  }

  // Recommendations
  if (result.recommendations.length) {
    const title = document.createElement("div");
    title.className = "validation-section-title";
    title.textContent = "Recommendations";
    _body.appendChild(title);

    const ul = document.createElement("ul");
    ul.className = "validation-list recs";
    for (const rec of result.recommendations) {
      const li = document.createElement("li");
      li.textContent = rec;
      ul.appendChild(li);
    }
    _body.appendChild(ul);
  }

  _loadBtn.textContent = result.valid ? "Load" : "Load Anyway";
  _overlay.classList.add("open");
}

export function initValidationModal() {
  const overlay   = document.getElementById("validation-modal");
  const closeBtn  = document.getElementById("validation-modal-close");
  const cancelBtn = document.getElementById("validation-modal-cancel");
  const loadBtn   = document.getElementById("validation-modal-load");

  function closeModal() { overlay.classList.remove("open"); }

  loadBtn.addEventListener("click", async () => {
    closeModal();
    if (_pendingLoadFn) {
      await _pendingLoadFn(_pendingData, _pendingType);
    }
  });

  closeBtn.addEventListener("click", closeModal);
  cancelBtn.addEventListener("click", closeModal);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && overlay.classList.contains("open")) closeModal(); });
}
