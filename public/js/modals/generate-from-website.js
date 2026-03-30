import { handleGeneratedDesignSystem } from '../chat.js';

export function initGenerateFromWebsiteModal() {
  const overlay   = document.getElementById("gen-from-web-modal");
  const openBtn   = document.getElementById("gen-from-web-btn");
  const closeBtn  = document.getElementById("gen-from-web-modal-close");
  const cancelBtn = document.getElementById("gen-from-web-cancel");
  const submitBtn = document.getElementById("gen-from-web-submit");
  const urlInput  = document.getElementById("gen-from-web-url");
  const hint      = document.getElementById("gen-from-web-hint");

  const DEFAULT_HINT = "Enter a public website URL. Design tokens will be extracted from its CSS and used to generate a matching design system.";

  function openModal() {
    urlInput.value = "";
    hint.textContent = DEFAULT_HINT;
    hint.style.color = "";
    overlay.classList.add("open");
    urlInput.focus();
  }

  function closeModal() {
    overlay.classList.remove("open");
  }

  openBtn.addEventListener("click", openModal);
  closeBtn.addEventListener("click", closeModal);
  cancelBtn.addEventListener("click", closeModal);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay.classList.contains("open")) closeModal();
  });

  submitBtn.addEventListener("click", async () => {
    const url = urlInput.value.trim();
    if (!url) {
      hint.textContent = "Please enter a URL.";
      hint.style.color = "var(--red)";
      urlInput.focus();
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Generating…";
    hint.textContent = "Fetching website and extracting design tokens…";
    hint.style.color = "var(--text-muted)";

    try {
      const res = await fetch("/api/generate-from-website", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      const data = await res.json();

      if (!res.ok) {
        hint.textContent = "Error: " + (data.error || "Unknown error");
        hint.style.color = "var(--red)";
        return;
      }

      closeModal();
      handleGeneratedDesignSystem(data.generatedDesignSystem);
      // Notify with loaded sections for scoped Explorer/Gallery refresh (Workstream E)
      if (typeof window.notifyDataReloaded === "function") {
        window.notifyDataReloaded({ type: "design-system", loaded: data.loaded ?? [] });
      }
    } catch (err) {
      hint.textContent = "Network error. Please check your connection and try again.";
      hint.style.color = "var(--red)";
      console.error("Generate from website error:", err);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Generate";
    }
  });
}
