// banner-generator.js — builds a Cisco IOS `banner motd/login/exec` command
// and defends against the classic mistake of picking a delimiter character
// that also appears in the message body (which truncates the banner).

// Characters offered in the UI, in the order we'll try them when
// auto-swapping away from a collision. Ordered roughly "least likely
// to appear in real prose" first.
const BANNER_SAFE_CHARS = ['#', '^', '~', '%', '@', '|', '$'];

function renderBanner() {
  const type = document.getElementById('bn-type').value;
  const chosenDelim = document.getElementById('bn-delim').value;
  const text = document.getElementById('bn-text').value;
  const warnBox = document.getElementById('bn-warning');
  const out = document.getElementById('bn-output');

  let delim = chosenDelim;
  let autoSwapped = false;

  // If the chosen delimiter shows up anywhere in the message, IOS would
  // terminate the banner at the FIRST occurrence — so find a character
  // from our safe list that truly doesn't appear in the text.
  if (text.includes(delim)) {
    const replacement = BANNER_SAFE_CHARS.find(c => !text.includes(c));
    if (replacement) {
      delim = replacement;
      autoSwapped = true;
    }
  }

  if (autoSwapped) {
    warnBox.style.display = 'block';
    warnBox.innerHTML = `<div class="alert a-amber"><strong>Delimiter collision detected</strong>"${chosenDelim}" appears inside your message text, so it can't be used as the delimiter (IOS would cut the banner short right there). Auto-switched to "${delim}" instead — feel free to pick a different one from the dropdown if you'd rather.</div>`;
  } else if (text.includes(chosenDelim)) {
    // Collision with nowhere safe left to fall back to (extremely unlikely
    // with this character set, but handle it rather than silently emit a
    // broken banner).
    warnBox.style.display = 'block';
    warnBox.innerHTML = `<div class="alert a-red"><strong>No safe delimiter available</strong>Every offered delimiter character appears somewhere in your message. Remove one of these characters from the text: ${BANNER_SAFE_CHARS.join(' ')}</div>`;
    out.textContent = '! Fix the delimiter collision above before using this banner.';
    return;
  } else {
    warnBox.style.display = 'none';
  }

  out.textContent = `banner ${type} ${delim}\n${text}\n${delim}`;
}
