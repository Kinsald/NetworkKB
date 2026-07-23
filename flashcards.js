// flashcards.js — flashcard deck, loaded from data/flashcards.json
let ALL_CARDS = [];
let fcCards = [], fcIdx = 0, fcFlipped = false, fcCorrect = 0, fcTotal = 0, fcStreak = 0;
let fcLoadFailed = false; // true only when the data/flashcards.json fetch itself failed

async function loadFlashcards() {
  try {
    const res = await fetch('data/flashcards.json');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) throw new Error('flashcards.json was empty or not an array');
    ALL_CARDS = data;
    fcLoadFailed = false;
  } catch (e) {
    // This fetch fails hard when the page is opened directly as a
    // file:// URL (browsers block fetch() of local files for security),
    // which is the #1 real-world cause of "the flashcards don't work" —
    // previously this only logged to the console, so the card area just
    // silently sat on "Loading..." forever with zero visible explanation.
    console.error('Could not load flashcards.json:', e);
    ALL_CARDS = [];
    fcLoadFailed = true;
  }
}

function fcInit(filter) {
  if (fcLoadFailed || ALL_CARDS.length === 0) {
    fcShowLoadError();
    return;
  }
  fcCards = filter && filter !== 'all' ? ALL_CARDS.filter(c => c[2] === filter) : [...ALL_CARDS];
  fcCards.sort(() => Math.random() - .5);
  fcIdx = 0; fcFlipped = false; fcCorrect = 0; fcTotal = 0; fcStreak = 0;
  fcRender();
}

// Replace the card face with a plain-language explanation instead of
// leaving it stuck on "Loading..." with no indication anything is wrong.
function fcShowLoadError() {
  const q = document.getElementById('fc-q');
  const sub = document.querySelector('.fc-sub');
  const cat = document.getElementById('fc-cat');
  if (cat) cat.textContent = 'Can\'t load flashcards';
  if (q) q.textContent = 'This page needs to be served over http(s) to load the flashcard data — it looks like it was opened directly as a file.';
  if (sub) sub.textContent = 'Run "php -S localhost:8000" in the NetworkKB-v2 folder, then open http://localhost:8000/index.html instead.';
  document.querySelectorAll('.fc-grade-btn').forEach(b => b.classList.add('fc-locked'));
}
function fcRender() {
  if (!fcCards.length) return;
  const card = fcCards[fcIdx];
  document.getElementById('fc-q').textContent = card[0];
  document.getElementById('fc-a').textContent = card[1];
  document.getElementById('fc-cat').textContent = card[2];
  document.getElementById('fc-num').textContent = `${fcIdx+1} / ${fcCards.length}`;
  document.getElementById('fc-streak').textContent = fcStreak > 0 ? `🔥 ${fcStreak}` : '';
  document.getElementById('fc-score').textContent = fcTotal > 0 ? `${fcCorrect}/${fcTotal} correct` : '';
  const el = document.getElementById('fc-card');
  el.classList.remove('flipped'); fcFlipped = false;
  fcSetGradingEnabled(false);
}
function fcFlip() {
  const el = document.getElementById('fc-card');
  el.classList.toggle('flipped'); fcFlipped = !fcFlipped;
  // Viewing the answer just unlocks grading — it does NOT itself count as
  // an attempt. Scoring only happens in fcNext(), so correct/total can
  // never drift out of sync with each other.
  fcSetGradingEnabled(fcFlipped);
}
// IMPORTANT: this is cosmetic ONLY (dims the buttons + shows a hint) — it
// deliberately does NOT set the HTML `disabled` attribute on the grade
// buttons. An earlier version did disable them for real, which meant
// clicking "Got it" before flipping did nothing at all with zero visible
// feedback — from the outside that just looks like the flashcards are
// broken. Now the buttons always respond to a click; fcNext() below
// decides what a click actually DOES depending on flip state.
function fcSetGradingEnabled(enabled) {
  document.querySelectorAll('.fc-grade-btn').forEach(b => b.classList.toggle('fc-locked', !enabled));
  const hint = document.getElementById('fc-hint');
  if (hint) hint.style.display = enabled ? 'none' : 'block';
}
function fcNext(knew) {
  if (!fcFlipped) {
    // First click before flipping: reveal the answer instead of grading —
    // the button visibly DOES something every time you click it, and a
    // second click on the same (now-highlighted) button grades for real.
    fcFlip();
    const hint = document.getElementById('fc-hint');
    if (hint) { hint.textContent = 'Answer revealed — click Got it / Didn\'t know again to grade yourself.'; }
    return;
  }
  fcTotal++;
  if (knew) { fcCorrect++; fcStreak++; } else fcStreak = 0;
  fcIdx = (fcIdx + 1) % fcCards.length;
  if (fcIdx === 0) fcCards.sort(() => Math.random() - .5);
  fcRender();
  // reset the hint wording back to its default for the next card
  const hint = document.getElementById('fc-hint');
  if (hint) hint.textContent = 'Flip the card first to unlock grading — scoring only counts answers you\'ve actually seen.';
}
