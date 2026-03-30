import { loadExplorer, isExplorerLoaded } from './explorer.js';
import { loadGallery, isGalleryLoaded } from './gallery.js';

export function initRightTabs() {
  const tabPreview  = document.getElementById("tab-preview");
  const tabExplorer = document.getElementById("tab-explorer");
  const tabGallery  = document.getElementById("tab-gallery");
  const panelPreview  = document.getElementById("panel-preview");
  const panelExplorer = document.getElementById("panel-explorer");
  const panelGallery  = document.getElementById("panel-gallery");

  const allTabs   = [tabPreview, tabExplorer, tabGallery];
  const toolsSection = document.querySelector(".tools-section");

  function activateTab(tab) {
    const isExplorer = tab === tabExplorer;
    const isGallery  = tab === tabGallery;
    const isPreview  = !isExplorer && !isGallery;

    allTabs.forEach(t => {
      t.classList.toggle("active", t === tab);
      t.setAttribute("aria-selected", String(t === tab));
    });

    panelPreview.style.display  = isPreview  ? "" : "none";
    panelPreview.setAttribute("aria-hidden", String(!isPreview));
    panelExplorer.classList.toggle("active", isExplorer);
    panelGallery.classList.toggle("active",  isGallery);

    // Show the bottom tools/notes panel on all workspace tabs.
    // (It was previously hidden only on the old About tab; About is now a top-level section.)
    if (toolsSection) {
      toolsSection.style.display = "";
      toolsSection.setAttribute("aria-hidden", "false");
    }

    if (isExplorer && !isExplorerLoaded()) loadExplorer();
    if (isGallery  && !isGalleryLoaded())  loadGallery();
  }

  tabPreview.addEventListener("click",  () => activateTab(tabPreview));
  tabExplorer.addEventListener("click", () => activateTab(tabExplorer));
  tabGallery.addEventListener("click",  () => activateTab(tabGallery));

  // Activate preview tab by default (About is now a top-level section)
  activateTab(tabPreview);

  // Expose globally so other modules can switch workspace tabs
  window.switchToPreviewTab  = () => activateTab(tabPreview);
  window.switchToExplorerTab = () => activateTab(tabExplorer);
  window.switchToGalleryTab  = () => activateTab(tabGallery);
}
