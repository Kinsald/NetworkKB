// changelog-viewer.js — in-app changelog browser. Fetches
// data/changelog.json (generated from CHANGELOG.md by
// scripts/build_changelog_json.py — see that script for why this is a
// one-way build step rather than something parsed live in the browser)
// and renders whichever version is selected in the dropdown.

let CHANGELOG_DATA = [];

const CHANGELOG_SECTION_META = {
  New:     { icon: '✨', color: 'var(--green)' },
  Updated: { icon: '🔄', color: 'var(--blue)' },
  Fixed:   { icon: '🛠️', color: 'var(--amber)' },
  Removed: { icon: '🗑️', color: 'var(--red)' },
};

async function loadChangelog() {
  try {
    const res = await fetch('data/changelog.json');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    CHANGELOG_DATA = await res.json();
  } catch (e) {
    console.error('Could not load changelog.json — needs http(s), not file://', e);
    CHANGELOG_DATA = [];
  }
}

function initChangelogViewer() {
  const select = document.getElementById('changelog-version-select');
  if (!select) return; // panel not in the DOM yet on some pages — safe no-op

  if (!CHANGELOG_DATA.length) {
    document.getElementById('changelog-body').innerHTML =
      '<div class="search-empty">Could not load version history — this needs the page served over http(s) (e.g. <code>php -S localhost:8000</code>), not opened directly as a file.</div>';
    return;
  }

  select.innerHTML = CHANGELOG_DATA.map((r, i) =>
    `<option value="${i}">v${r.version} — ${r.date}${i === 0 ? ' (current)' : ''}</option>`
  ).join('');

  renderChangelogVersion(0);
}

function renderChangelogVersion(index) {
  const release = CHANGELOG_DATA[index];
  if (!release) return;

  const select = document.getElementById('changelog-version-select');
  if (select) select.value = String(index);

  const order = ['New', 'Updated', 'Fixed', 'Removed'];
  const sectionsHtml = order
    .filter(name => release.sections[name] && release.sections[name].length)
    .map(name => {
      const meta = CHANGELOG_SECTION_META[name];
      const items = release.sections[name].map(b => `<li>${b}</li>`).join('');
      return `
        <div class="changelog-section">
          <div class="changelog-section-title" style="color:${meta.color}">${meta.icon} ${name}</div>
          <ul class="changelog-list">${items}</ul>
        </div>`;
    }).join('');

  document.getElementById('changelog-body').innerHTML = `
    <div class="changelog-release-header">
      <span class="changelog-version-big">v${release.version}</span>
      <span class="changelog-date">${release.date}</span>
    </div>
    ${sectionsHtml || '<div class="search-empty">No changes recorded for this version.</div>'}
  `;
}

function onChangelogVersionChange() {
  const select = document.getElementById('changelog-version-select');
  renderChangelogVersion(parseInt(select.value, 10));
}
