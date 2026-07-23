// main.js — page bootstrap. Runs after all other module scripts are loaded
// (this tag must be the LAST <script> in index.html).

window.addEventListener('DOMContentLoaded', async () => {
  restoreSidebarState();
  goPage('home');
  await loadFlashcards();   // fetch data/flashcards.json (async — needs http(s), not file://)
  fcInit('all');
  calcOSPF();
  if (typeof renderBanner === 'function') renderBanner();
  if (typeof renderDnsFields === 'function') renderDnsFields();
  if (typeof renderCloudResponsibility === 'function') renderCloudResponsibility('iaas');
  if (typeof initDesignHelper === 'function') initDesignHelper();
  if (typeof loadSearchIndex === 'function') await loadSearchIndex();
  if (typeof loadChangelog === 'function') { await loadChangelog(); initChangelogViewer(); }
});
