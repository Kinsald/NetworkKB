// nav.js — top-nav / sidebar / panel switching (single canonical source —
// the old single-file build had two competing goPage() definitions; this
// is the fixed, merged version from that cleanup).

function goPage(id) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.sb-content').forEach(s => s.style.display = 'none');
  document.querySelectorAll('.nav-link[data-page="' + id + '"]').forEach(n => n.classList.add('active'));

  const sidebar = document.getElementById('sidebar');
  if (id === 'home') {
    // Home has no sidebar of its own — its old shortcut list is fully
    // redundant now with the 14 home cards plus global search, so we
    // just hide the whole sidebar column and let the home content use
    // that width instead, rather than showing an empty or irrelevant one.
    sidebar.style.display = 'none';
  } else {
    sidebar.style.display = '';           // restore (undoes the Home hide)
    const sb = document.getElementById('sb-' + id);
    if (sb) sb.style.display = 'block';   // every non-home page has a matching sb-<id> now
  }

  // Activate the panel whose id matches this page (e.g. home, flashcards, quickref, design)
  const ownPanel = document.getElementById(id);
  if (ownPanel && ownPanel.classList.contains('panel')) {
    ownPanel.classList.add('active');
  }
  document.querySelector('.main').scrollTo(0, 0);
}

function goSub(id) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.sb-item').forEach(n => n.classList.remove('active'));
  const panel = document.getElementById(id);
  if (panel) {
    panel.classList.add('active');
    document.querySelector('.main').scrollTo(0, 0);
    const parentPage = panel.getAttribute('data-parent');
    if (parentPage) {
      document.querySelectorAll('.nav-link').forEach(n => n.classList.remove('active'));
      document.querySelectorAll('.nav-link[data-page="' + parentPage + '"]').forEach(n => n.classList.add('active'));
      document.querySelectorAll('.sb-content').forEach(s => s.style.display = 'none');
      const sb = document.getElementById('sb-' + parentPage);
      if (sb) sb.style.display = 'block';
    }
  }
  document.querySelectorAll('.sb-item[data-sub="' + id + '"]').forEach(n => n.classList.add('active'));
}

// ── Collapsible sidebar ──────────────────────────────────────────
function toggleSidebar() {
  const sb = document.getElementById('sidebar');
  const btn = document.getElementById('sb-toggle-btn');
  const collapsed = sb.classList.toggle('collapsed');
  btn.textContent = collapsed ? '▶' : '◀';
  btn.title = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
  try { localStorage.setItem('nkb-sidebar-collapsed', collapsed ? '1' : '0'); } catch (e) { /* ignore (e.g. private browsing) */ }
}

function restoreSidebarState() {
  let collapsed = false;
  try { collapsed = localStorage.getItem('nkb-sidebar-collapsed') === '1'; } catch (e) { /* ignore */ }
  if (collapsed) {
    document.getElementById('sidebar').classList.add('collapsed');
    const btn = document.getElementById('sb-toggle-btn');
    btn.textContent = '▶';
    btn.title = 'Expand sidebar';
  }
}
