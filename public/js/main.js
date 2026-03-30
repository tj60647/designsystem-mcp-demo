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

// Wire up the global data-reload hook used by load-json and generate-from-website.
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
const aboutBtn = document.getElementById('about-btn');
if (aboutBtn) {
  aboutBtn.addEventListener('click', () => window.switchToAboutTab());
}
initComponentExplorer();
initGallery();
