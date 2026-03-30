import { initChat } from './chat.js';
import { initPreview } from './preview.js';
import { initComponentExplorer } from './explorer.js';
import { initGallery } from './gallery.js';
import { initRightTabs } from './tabs.js';
import { isExplorerLoaded, resetAndReloadExplorer } from './explorer.js';
import { isGalleryLoaded, resetAndReloadGallery } from './gallery.js';
import { initInfoModals } from './modals/info.js';
import { initLoadJsonModal, initDropZone } from './modals/load-json.js';
import { initViewSchemaModal } from './modals/schema.js';
import { initValidationModal } from './modals/validation.js';
import { initAgentsModal } from './modals/agents.js';
import { initGenerateFromWebsiteModal } from './modals/generate-from-website.js';
import { initDsOpsPanel, notifyDsOpsResult } from './dsOps.js';

// ── Product-level section navigation ─────────────────────────────────────
// Manages top-level sections: Workspace, Design System Ops, Agent Sandbox, About.
// Each section is a full-page view; only one is visible at a time.
// ─────────────────────────────────────────────────────────────────────────
const SECTION_IDS = ['section-workspace', 'section-ds-ops', 'section-agent-sandbox', 'section-about'];

function switchSection(sectionId) {
  SECTION_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('active', id === sectionId);
  });
  document.querySelectorAll('.product-nav-btn').forEach(btn => {
    const active = btn.dataset.section === sectionId;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', String(active));
  });
}

// Expose globally so modals and other modules can switch sections.
window.switchSection = switchSection;
window.switchToWorkspace = () => switchSection('section-workspace');
window.switchToDsOps = () => switchSection('section-ds-ops');
window.switchToAgentSandbox = () => switchSection('section-agent-sandbox');
window.switchToAbout = () => switchSection('section-about');

// Expose DS Ops result notifier globally so modal modules can call it after ingest.
window.notifyDsOpsResult = notifyDsOpsResult;

function initProductNav() {
  document.querySelectorAll('.product-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchSection(btn.dataset.section));
  });

  // Inline navigation links within content sections
  const sandboxGotoWorkspace = document.getElementById('sandbox-goto-workspace');
  if (sandboxGotoWorkspace) sandboxGotoWorkspace.addEventListener('click', () => switchSection('section-workspace'));

  const aboutGotoWorkspace = document.getElementById('about-goto-workspace');
  if (aboutGotoWorkspace) aboutGotoWorkspace.addEventListener('click', () => switchSection('section-workspace'));

  const aboutGotoDsOps = document.getElementById('about-goto-ds-ops');
  if (aboutGotoDsOps) aboutGotoDsOps.addEventListener('click', () => switchSection('section-ds-ops'));
}

// ── Wire up the global data-reload hook used by load-json and generate-from-website.
// The payload is optional and lets callers scope refreshes to affected UI panels.
window.notifyDataReloaded = (payload = {}) => {
  const type = payload?.type;
  const loaded = Array.isArray(payload?.loaded) ? payload.loaded : [];

  const includesLoaded = (section) => loaded.includes(section);

  // Explorer depends on components only.
  const shouldRefreshExplorer =
    type === "components" ||
    (type === "design-system" && includesLoaded("components")) ||
    !type;

  // Gallery depends on components (cards) and tokens (preview styling).
  const shouldRefreshGallery =
    type === "components" ||
    type === "tokens" ||
    (type === "design-system" && (includesLoaded("components") || includesLoaded("tokens"))) ||
    !type;

  if (shouldRefreshExplorer && isExplorerLoaded()) resetAndReloadExplorer();
  if (shouldRefreshGallery && isGalleryLoaded())  resetAndReloadGallery();

  // Sync the ds-ops download button visibility with the topbar download button
  const topbarDownload = document.getElementById('download-ds-btn');
  const dsOpsDownload = document.getElementById('ds-ops-download-btn');
  if (topbarDownload && dsOpsDownload) {
    dsOpsDownload.style.display = topbarDownload.style.display;
  }
};

// Boot
initPreview();
initChat();
initInfoModals();
initDropZone();
initLoadJsonModal();
initViewSchemaModal();
initAgentsModal();
initValidationModal();
initGenerateFromWebsiteModal();
initRightTabs();
initProductNav();
initDsOpsPanel();

// Wire DS Ops card buttons to hidden trigger buttons (attached by modal modules)
const dsOpsLoadJsonBtn = document.getElementById('ds-ops-load-json-btn');
if (dsOpsLoadJsonBtn) {
  dsOpsLoadJsonBtn.addEventListener('click', () => document.getElementById('load-json-btn')?.click());
}
const dsOpsGenFromWebBtn = document.getElementById('ds-ops-gen-from-web-btn');
if (dsOpsGenFromWebBtn) {
  dsOpsGenFromWebBtn.addEventListener('click', () => document.getElementById('gen-from-web-btn')?.click());
}
const dsOpsViewSchemaBtn = document.getElementById('ds-ops-view-schema-btn');
if (dsOpsViewSchemaBtn) {
  dsOpsViewSchemaBtn.addEventListener('click', () => document.getElementById('view-schema-btn')?.click());
}
const dsOpsViewAgentsBtn = document.getElementById('ds-ops-view-agents-btn');
if (dsOpsViewAgentsBtn) {
  dsOpsViewAgentsBtn.addEventListener('click', () => document.getElementById('view-agents-btn')?.click());
}
const dsOpsResetBtn = document.getElementById('ds-ops-reset-btn');
if (dsOpsResetBtn) {
  dsOpsResetBtn.addEventListener('click', () => document.getElementById('reset-btn')?.click());
}
const dsOpsDownloadBtn = document.getElementById('ds-ops-download-btn');
if (dsOpsDownloadBtn) {
  dsOpsDownloadBtn.addEventListener('click', () => document.getElementById('download-ds-btn')?.click());
}

// Keep DS Ops download button in sync with the topbar download button visibility.
// chat.js shows the topbar button directly (downloadDsBtn.style.display = ""); we
// mirror that via a MutationObserver so the DS Ops panel stays consistent.
const topbarDownloadBtn = document.getElementById('download-ds-btn');
if (topbarDownloadBtn && dsOpsDownloadBtn) {
  const syncDownloadVisibility = () => {
    dsOpsDownloadBtn.style.display = topbarDownloadBtn.style.display;
  };
  new MutationObserver(syncDownloadVisibility).observe(topbarDownloadBtn, {
    attributes: true,
    attributeFilter: ['style'],
  });
}

initComponentExplorer();
initGallery();
