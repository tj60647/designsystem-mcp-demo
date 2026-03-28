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
import { initTestLabModal } from './modals/testlab.js';

// Wire up the global data-reload hook used by load-json and generate-from-website
window.notifyDataReloaded = () => {
  if (isExplorerLoaded()) resetAndReloadExplorer();
  if (isGalleryLoaded())  resetAndReloadGallery();
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
initTestLabModal();
initRightTabs();
document.getElementById('about-btn').addEventListener('click', () => window.switchToAboutTab());
initComponentExplorer();
initGallery();
