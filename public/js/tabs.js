import { loadExplorer, isExplorerLoaded } from './explorer.js';
import { loadGallery, isGalleryLoaded } from './gallery.js';

export function initRightTabs() {
  const tabPreview  = document.getElementById("tab-preview");
  const tabExplorer = document.getElementById("tab-explorer");
  const tabGallery  = document.getElementById("tab-gallery");
  const panelPreview  = document.getElementById("panel-preview");
  const panelExplorer = document.getElementById("panel-explorer");
  const panelGallery  = document.getElementById("panel-gallery");

  function activateTab(tab) {
    const isExplorer = tab === tabExplorer;
    const isGallery  = tab === tabGallery;
    tabPreview.classList.toggle("active", !isExplorer && !isGallery);
    tabExplorer.classList.toggle("active", isExplorer);
    tabGallery.classList.toggle("active", isGallery);
    tabPreview.setAttribute("aria-selected", String(!isExplorer && !isGallery));
    tabExplorer.setAttribute("aria-selected", String(isExplorer));
    tabGallery.setAttribute("aria-selected", String(isGallery));
    panelPreview.style.display   = (!isExplorer && !isGallery) ? "" : "none";
    panelExplorer.classList.toggle("active", isExplorer);
    panelGallery.classList.toggle("active", isGallery);
    if (isExplorer && !isExplorerLoaded()) loadExplorer();
    if (isGallery  && !isGalleryLoaded())  loadGallery();
  }

  tabPreview.addEventListener("click",  () => activateTab(tabPreview));
  tabExplorer.addEventListener("click", () => activateTab(tabExplorer));
  tabGallery.addEventListener("click",  () => activateTab(tabGallery));

  // Expose globally so handleGeneratedDesignSystem can switch tabs
  window.switchToExplorerTab = () => activateTab(tabExplorer);
}
