import { loadExplorer, isExplorerLoaded } from './explorer.js';
import { loadGallery, isGalleryLoaded } from './gallery.js';

export function initRightTabs() {
  const tabPreview  = document.getElementById("tab-preview");
  const tabExplorer = document.getElementById("tab-explorer");
  const tabGallery  = document.getElementById("tab-gallery");
  const tabAbout    = document.getElementById("tab-about");
  const panelPreview  = document.getElementById("panel-preview");
  const panelExplorer = document.getElementById("panel-explorer");
  const panelGallery  = document.getElementById("panel-gallery");
  const panelAbout    = document.getElementById("panel-about");

  const allTabs   = [tabPreview, tabExplorer, tabGallery, tabAbout];
  const toolsSection = document.querySelector(".tools-section");

  function activateTab(tab) {
    const isExplorer = tab === tabExplorer;
    const isGallery  = tab === tabGallery;
    const isAbout    = tab === tabAbout;
    const isPreview  = !isExplorer && !isGallery && !isAbout;

    allTabs.forEach(t => {
      t.classList.toggle("active", t === tab);
      t.setAttribute("aria-selected", String(t === tab));
    });

    panelPreview.style.display  = isPreview  ? "" : "none";
    panelExplorer.classList.toggle("active", isExplorer);
    panelGallery.classList.toggle("active",  isGallery);
    panelAbout.classList.toggle("active",    isAbout);

    // Hide the bottom tools/notes panel on About tab — it relates to preview output
    if (toolsSection) toolsSection.style.display = isAbout ? "none" : "";

    if (isExplorer && !isExplorerLoaded()) loadExplorer();
    if (isGallery  && !isGalleryLoaded())  loadGallery();
  }

  tabPreview.addEventListener("click",  () => activateTab(tabPreview));
  tabExplorer.addEventListener("click", () => activateTab(tabExplorer));
  tabGallery.addEventListener("click",  () => activateTab(tabGallery));
  tabAbout.addEventListener("click",    () => activateTab(tabAbout));

  // Expose globally so other modules can switch tabs
  window.switchToExplorerTab = () => activateTab(tabExplorer);
  window.switchToAboutTab    = () => activateTab(tabAbout);
}
