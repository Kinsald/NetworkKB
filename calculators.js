// calculators.js — subnet, wildcard, and OSPF cost calculators

function calcSubnet() {
  const raw = document.getElementById('sc-input').value.trim();
  const out = document.getElementById('sc-out');
  const match = raw.match(/^(\d+\.\d+\.\d+\.\d+)\/(\d+)$/);
  if (!match) { out.innerHTML = '<span style="color:var(--red)">Enter format: 192.168.1.0/24</span>'; return; }
  const ip = match[1], prefix = parseInt(match[2]);
  if (prefix < 0 || prefix > 32) { out.innerHTML = '<span style="color:var(--red)">Prefix must be 0-32</span>'; return; }
  const parts = ip.split('.').map(Number);
  const ipInt = (parts[0]<<24)|(parts[1]<<16)|(parts[2]<<8)|parts[3];
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  const wild = (~mask) >>> 0;
  const net  = (ipInt & mask) >>> 0;
  const bcast = (net | wild) >>> 0;
  const first = prefix < 31 ? net + 1 : net;
  const last  = prefix < 31 ? bcast - 1 : bcast;
  const hosts = prefix >= 31 ? (prefix === 31 ? 2 : 1) : (bcast - net - 1);
  function i2ip(n) { return [(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255].join('.'); }
  function i2mask(n) { return i2ip(n); }
  const wc = i2mask(wild);
  out.innerHTML = [
    `<span class="lbl">Network address   </span>${i2ip(net)}/${prefix}`,
    `<span class="lbl">Subnet mask       </span>${i2mask(mask)}`,
    `<span class="lbl">Wildcard mask     </span>${wc}`,
    `<span class="lbl">First usable host </span>${i2ip(first)}`,
    `<span class="lbl">Last usable host  </span>${i2ip(last)}`,
    `<span class="lbl">Broadcast         </span>${i2ip(bcast)}`,
    `<span class="lbl">Usable hosts      </span>${hosts.toLocaleString()}`,
    `<span class="lbl">Block size        </span>${wild+1}`,
  ].join('\n');
}
function calcWildcard() {
  const raw = document.getElementById('wc-input').value.trim();
  const out = document.getElementById('wc-out');
  const match = raw.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!match) { out.innerHTML = '<span style="color:var(--red)">Enter a valid subnet mask</span>'; return; }
  const parts = [+match[1],+match[2],+match[3],+match[4]];
  const wc = parts.map(b => 255 - b).join('.');
  out.innerHTML = `<span class="lbl">Wildcard mask: </span>${wc}`;
}

// ── OSPF Cost Calculator ──
function calcOSPF() {
  const bw = parseFloat(document.getElementById('ospf-bw').value) || 0;
  const unit = document.getElementById('ospf-unit').value;
  const ref = parseFloat(document.getElementById('ospf-ref').value) || 100;
  const refUnit = document.getElementById('ospf-refunit').value;
  const bwMbps = unit === 'gbps' ? bw * 1000 : (unit === 'kbps' ? bw / 1000 : bw);
  const refMbps = refUnit === 'gbps' ? ref * 1000 : ref;
  if (!bwMbps || bwMbps <= 0) {
    document.getElementById('ospf-cost-val').textContent = '—';
    document.getElementById('ospf-fill').style.width = '0%';
    document.getElementById('ospf-note').textContent = 'Enter a link bandwidth greater than 0';
    return;
  }
  const cost = Math.min(65535, Math.max(1, Math.round(refMbps / bwMbps)));
  const pct = Math.min(100, Math.round((bwMbps / refMbps) * 100));
  document.getElementById('ospf-cost-val').textContent = cost;
  document.getElementById('ospf-fill').style.width = pct + '%';
  document.getElementById('ospf-fill').style.background = cost === 1 ? 'var(--green)' : cost <= 10 ? 'var(--blue)' : cost <= 100 ? 'var(--amber)' : 'var(--red)';
  document.getElementById('ospf-note').textContent = cost >= 65535 ? '⚠ Cost capped at 65535 — consider increasing reference bandwidth' : cost === 1 ? '✓ Minimum cost — link is at or above reference bandwidth' : '';
}
