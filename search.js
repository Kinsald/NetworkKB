// search.js — global quick-search. Press "/" anywhere (outside a text
// field) to open it, type to filter, arrow keys + Enter to navigate,
// Escape to close.
//
// Matches against a pre-built index (data/search-index.json) rather than
// scanning the live DOM — the index is built at authoring time by
// build_search_index.py from every panel's title/description/headings/
// table cells/dropdown options, so it stays fast even as content grows,
// and it's a static file with no runtime cost beyond one fetch.

let SEARCH_INDEX = [];
let searchActiveIndex = -1; // which result row is keyboard-highlighted

async function loadSearchIndex() {
  try {
    const res = await fetch('data/search-index.json');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    SEARCH_INDEX = await res.json();
  } catch (e) {
    console.error('Could not load search-index.json — search needs http(s), not file://', e);
    SEARCH_INDEX = [];
  }
}

function openSearch() {
  const overlay = document.getElementById('search-overlay');
  overlay.style.display = 'flex';
  const input = document.getElementById('search-input');
  input.value = '';
  input.focus();
  renderSearchResults(''); // show a few defaults / recent sections
}

function closeSearch() {
  document.getElementById('search-overlay').style.display = 'none';
  searchActiveIndex = -1;
}

// Very small scoring function — no external fuzzy-search library. Splits
// the query into words and requires EVERY word to appear somewhere in
// the entry (title, headings, terms, or description) — this is what
// makes "SOA record" match an entry whose actual text is "SOA — Start
// of authority" even though that exact phrase never appears verbatim.
//
// `headings` (real card/concept titles) count for much more than `terms`
// (table cells, dropdown options, form labels) — a page whose heading
// literally IS "HSRP on a distribution pair" should outrank a page that
// only mentions HSRP once inside a parenthetical aside, even though both
// technically "contain" the word.
function scoreEntry(entry, qLower) {
  const title = entry.title.toLowerCase();
  const desc = entry.desc.toLowerCase();
  const headings = entry.headings.toLowerCase();
  const terms = entry.terms.toLowerCase();
  const section = entry.section.toLowerCase();
  const combined = title + ' ' + headings + ' ' + terms + ' ' + desc + ' ' + section;

  const words = qLower.split(/\s+/).filter(Boolean);
  if (!words.length) return 0;
  for (const w of words) {
    if (!combined.includes(w)) return 0; // every word must appear SOMEWHERE, or this entry doesn't match at all
  }

  let score = 0;
  if (title.startsWith(qLower)) score += 100;
  else if (title.includes(qLower)) score += 50;
  words.forEach(w => { if (title.includes(w)) score += 15; });
  if (headings.includes(qLower)) score += 35;
  words.forEach(w => { if (headings.includes(w)) score += 12; });
  if (terms.includes(qLower)) score += 15;
  words.forEach(w => { if (terms.includes(w)) score += 4; });
  if (desc.includes(qLower)) score += 10;
  if (section.includes(qLower)) score += 5;
  return score;
}

function renderSearchResults(query) {
  const list = document.getElementById('search-results');
  const q = query.trim().toLowerCase();

  let results;
  if (!q) {
    // Nothing typed yet — show a lightweight starting point rather than
    // an empty box: the first few panels of each top-level section.
    const seen = new Set();
    results = SEARCH_INDEX.filter(e => {
      if (seen.has(e.parent)) return false;
      seen.add(e.parent);
      return true;
    }).slice(0, 8);
  } else {
    results = SEARCH_INDEX
      .map(e => ({ entry: e, score: scoreEntry(e, q) }))
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12)
      .map(r => r.entry);
  }

  searchActiveIndex = results.length ? 0 : -1;

  if (!results.length) {
    list.innerHTML = '<div class="search-empty">No matches. Try a different term — e.g. "HSRP", "SOA record", "DMZ".</div>';
    return;
  }

  list.innerHTML = results.map((e, i) => `
    <div class="search-result${i === 0 ? ' active' : ''}" data-idx="${i}" data-page="${e.parent}" data-sub="${e.id}" onclick="goToSearchResult('${e.parent}','${e.id}')">
      <div class="search-result-section">${e.section}</div>
      <div class="search-result-title">${e.title}</div>
      <div class="search-result-desc">${e.desc}</div>
    </div>`).join('');
}

function goToSearchResult(parent, id) {
  closeSearch();
  goPage(parent);
  goSub(id);
}

function moveSearchSelection(delta) {
  const rows = document.querySelectorAll('.search-result');
  if (!rows.length) return;
  rows[searchActiveIndex]?.classList.remove('active');
  searchActiveIndex = (searchActiveIndex + delta + rows.length) % rows.length;
  const row = rows[searchActiveIndex];
  row.classList.add('active');
  row.scrollIntoView({ block: 'nearest' });
}

function activateSelectedResult() {
  const row = document.querySelector('.search-result.active');
  if (row) goToSearchResult(row.dataset.page, row.dataset.sub);
}

// Global key handling: "/" opens search from anywhere EXCEPT while
// already typing in a text input/textarea/select (so it doesn't hijack
// normal typing in, say, the DNS builder's text fields). Escape closes;
// arrows + Enter navigate results while the search box has focus.
document.addEventListener('keydown', (e) => {
  const overlay = document.getElementById('search-overlay');
  const isOpen = overlay && overlay.style.display !== 'none';

  if (!isOpen && e.key === '/' ) {
    const tag = document.activeElement?.tagName;
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.activeElement?.isContentEditable;
    if (!typing) {
      e.preventDefault();
      openSearch();
    }
    return;
  }
  if (!isOpen) return;

  if (e.key === 'Escape') { closeSearch(); }
  else if (e.key === 'ArrowDown') { e.preventDefault(); moveSearchSelection(1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); moveSearchSelection(-1); }
  else if (e.key === 'Enter') { e.preventDefault(); activateSelectedResult(); }
});
