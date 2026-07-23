// util.js — small shared helpers

function toggleHint(id) {
  const el = document.getElementById(id);
  if (el) el.classList.toggle('collapsed');
}
function copyCode(btn) {
  const pre = btn.closest('.cw').querySelector('pre');
  navigator.clipboard.writeText(pre.innerText).then(() => {
    btn.textContent = 'copied ✓'; btn.classList.add('ok');
    setTimeout(() => { btn.textContent = 'copy'; btn.classList.remove('ok'); }, 2000);
  });
}
function copyEl(btn, elId) {
  const el = document.getElementById(elId);
  if (!el) return;
  navigator.clipboard.writeText(el.innerText).then(() => {
    btn.textContent = 'copied ✓'; btn.classList.add('ok');
    setTimeout(() => { btn.textContent = 'copy'; btn.classList.remove('ok'); }, 2000);
  });
}
