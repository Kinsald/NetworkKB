// design-helper.js — interactive network design calculator.
// Pure client-side logic (topology/sizing math); save/load talk to api/*.php.

let dhLastResult = null;

function initDesignHelper() {
  // nothing to pre-load yet; placeholder so main.js's optional call is safe
}

// Collapses/expands one of the detail cards under the diagram (or the
// site-requirements form itself, reusing the same class/pattern).
function toggleDhCard(cardId) {
  const card = document.getElementById(cardId);
  if (!card) return;
  const collapsed = card.classList.toggle('dh-collapsed');
  const btn = card.querySelector('.card-title .cbtn');
  if (btn) btn.textContent = collapsed ? 'expand' : 'collapse';
}

// The "Include a DMZ zone?" field only makes sense when a firewall is
// also present (a DMZ without a firewall isn't really a DMZ) — hide it
// entirely when the firewall option is turned off, rather than leaving
// a confusing field that has no effect.
function toggleDmzOption() {
  const hasFirewall = document.getElementById('dh-firewall').value === 'yes';
  document.getElementById('dh-dmz-group').style.display = hasFirewall ? '' : 'none';
}

// Same idea for WLC: it only makes sense when wireless is actually
// requested, so hide the field rather than leave a control with no effect.
function toggleWlcOption() {
  const hasWifi = document.getElementById('dh-wifi').value === 'yes';
  document.getElementById('dh-wlc-group').style.display = hasWifi ? '' : 'none';
}

// ── Core design logic ──────────────────────────────────────────────

function switchPortCounts(sizes) {
  // Prefer fewest switches, standard 24/48-port increments
  for (const s of sizes) if (s >= 1) return s;
  return 24;
}

function planPorts(totalPorts) {
  // Greedy-fill with 48s then 24s
  let remaining = totalPorts;
  let sw48 = Math.floor(remaining / 48);
  remaining -= sw48 * 48;
  let sw24 = remaining > 0 ? Math.ceil(remaining / 24) : 0;
  if (sw48 === 0 && sw24 === 0) sw24 = 1;
  return { sw48, sw24, total: sw48 + sw24 };
}

function computeDesign(inputs) {
  const { name, users, floors, redundancy, voice, wifi, growthPct, block, hasFirewall, hasDMZ, hasWLC } = inputs;

  const grownUsers = Math.ceil(users * (1 + growthPct / 100));
  // rough extra ports for AP uplinks (1 per ~15 users, min per floor) and a little buffer
  const apCount = wifi ? Math.max(floors, Math.ceil(grownUsers / 15)) : 0;
  const extraPorts = apCount; // APs consume access ports too
  const totalAccessPorts = grownUsers + extraPorts;

  const perFloorPorts = Math.ceil(totalAccessPorts / floors);
  const perFloorPlan = planPorts(perFloorPorts);

  // Topology decision
  const distributionBlocks = floors <= 4 ? 1 : Math.ceil(floors / 4);
  const collapsedCore = distributionBlocks <= 1 && grownUsers < 250;
  const topology = collapsedCore ? 'Collapsed core (two-tier)' : 'Three-tier (Access / Distribution / Core)';

  // Redundancy → device multipliers
  const distSwitchCount = redundancy === 'basic' ? 1 : 2;
  const coreSwitchCount = collapsedCore ? 0 : (redundancy === 'basic' ? 1 : 2);
  const uplinksPerAccess = redundancy === 'basic' ? 1 : 2;

  // Perimeter — firewall is a single pair-or-single device regardless of
  // site size (HA pair for standard/high redundancy, single box for basic).
  // DMZ only exists if a firewall exists to host its dedicated interface.
  const firewallCount = hasFirewall ? (redundancy === 'basic' ? 1 : 2) : 0;
  const dmzEnabled = hasFirewall && hasDMZ;
  // WLC count follows the same redundancy logic as distribution — a single
  // WLC is a single point of failure for every AP on the site.
  const wlcCount = (wifi && hasWLC) ? (redundancy === 'basic' ? 1 : 2) : 0;

  // Uplink speed sizing off oversubscription (~20:1 target access->dist)
  const accessSwitchEdgeGbps = 48; // assume GbE ports
  const targetRatio = 20;
  const neededUplinkGbps = accessSwitchEdgeGbps / targetRatio;
  const uplinkSpeed = neededUplinkGbps <= 1 ? '1 Gbps' : (neededUplinkGbps <= 10 ? '10 Gbps' : '25/40 Gbps');

  // PoE estimate (phones ~9W, APs ~20W)
  const poeWatts = (voice ? grownUsers * 9 : 0) + (wifi ? apCount * 20 : 0);

  // VLAN plan
  const vlans = [
    { id: 10, name: 'DATA', purpose: 'User data' },
  ];
  if (voice) vlans.push({ id: 20, name: 'VOICE', purpose: 'VoIP phones' });
  if (wifi)  vlans.push({ id: 30, name: 'WIFI', purpose: 'Wireless clients' });
  if (dmzEnabled) vlans.push({ id: 50, name: 'DMZ', purpose: 'Public-facing servers (web/mail/proxy)' });
  vlans.push({ id: 99, name: 'MGMT', purpose: 'Switch/AP/WLC management' });
  vlans.push({ id: 999, name: 'NATIVE', purpose: 'Unused native VLAN (trunk hygiene)' });

  // Addressing: carve /24s per VLAN out of the base block per floor
  const blockMatch = (block || '10.1.0.0/16').match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)\/(\d+)$/);
  const baseOctets = blockMatch ? [+blockMatch[1], +blockMatch[2], +blockMatch[3], +blockMatch[4]] : [10, 1, 0, 0];
  vlans.forEach((v, i) => {
    v.subnet = `${baseOctets[0]}.${baseOctets[1]}.${i + 10}.0/24`;
    v.gateway = `${baseOctets[0]}.${baseOctets[1]}.${i + 10}.1`;
  });

  return {
    name, users: grownUsers, floors, redundancy, voice, wifi, apCount,
    topology, distributionBlocks, collapsedCore,
    distSwitchCount, coreSwitchCount, uplinksPerAccess, uplinkSpeed,
    perFloorPlan, totalAccessPorts, poeWatts, vlans, block,
    hasFirewall, firewallCount, dmzEnabled, hasWLC, wlcCount
  };
}

function renderTopology(r) {
  const el = document.getElementById('dh-topology');
  el.innerHTML = `
    <div class="rlist">
      <div class="rrow i"><div class="rico" style="background:#e0b0ff">1</div><div><div class="rtxt">${r.topology}</div>
        <div class="rsub">${r.collapsedCore
          ? 'One distribution block handles routing + gateway duties directly — no dedicated core needed at this size.'
          : `${r.distributionBlocks} distribution block(s) feeding a dedicated core layer — recommended once floors/users pass the collapsed-core threshold.`}</div></div></div>
      <div class="rrow i"><div class="rico" style="background:var(--cyan)">2</div><div><div class="rtxt">Redundancy: ${r.redundancy}</div>
        <div class="rsub">${r.distSwitchCount} distribution switch(es), ${r.coreSwitchCount > 0 ? r.coreSwitchCount + ' core switch(es), ' : ''}${r.uplinksPerAccess} uplink(s) per access switch${r.uplinksPerAccess > 1 ? ' (bundle as EtherChannel)' : ''}.</div></div></div>
      <div class="rrow i"><div class="rico" style="background:var(--amber)">3</div><div><div class="rtxt">Uplink speed: ${r.uplinkSpeed}</div>
        <div class="rsub">Sized to keep access→distribution oversubscription near the ~20:1 target for GbE access ports.</div></div></div>
    </div>`;
}

function renderDevices(r) {
  const el = document.getElementById('dh-devices');
  el.innerHTML = `
    <table class="tbl"><thead><tr><th>Item</th><th>Count</th><th>Notes</th></tr></thead><tbody>
      <tr><td>Access switches — 48-port</td><td>${r.perFloorPlan.sw48} <span style="color:var(--text3)">per floor</span></td><td style="color:var(--text2)">× ${r.floors} floor(s) = ${r.perFloorPlan.sw48 * r.floors} total</td></tr>
      <tr><td>Access switches — 24-port</td><td>${r.perFloorPlan.sw24} <span style="color:var(--text3)">per floor</span></td><td style="color:var(--text2)">× ${r.floors} floor(s) = ${r.perFloorPlan.sw24 * r.floors} total</td></tr>
      <tr><td>Distribution switches</td><td>${r.distSwitchCount}</td><td style="color:var(--text2)">${r.distSwitchCount === 2 ? 'Redundant pair with FHRP' : 'Single — no gateway redundancy'}</td></tr>
      <tr><td>Core switches</td><td>${r.coreSwitchCount}</td><td style="color:var(--text2)">${r.collapsedCore ? 'Not needed — collapsed into distribution' : 'Dedicated high-speed backbone'}</td></tr>
      <tr><td>Access ports needed</td><td>${r.totalAccessPorts}</td><td style="color:var(--text2)">Includes growth headroom${r.wifi ? ' + AP uplinks' : ''}</td></tr>
      <tr><td>Access points (est.)</td><td>${r.apCount}</td><td style="color:var(--text2)">${r.wifi ? '~1 per 15 users, min 1 per floor' : 'Wireless not requested'}</td></tr>
      <tr><td>Estimated PoE budget</td><td>${r.poeWatts} W</td><td style="color:var(--text2)">Phones ~9W + APs ~20W each — verify against actual switch PoE budget</td></tr>
    </tbody></table>`;
}

function renderVlans(r) {
  const el = document.getElementById('dh-vlans');
  el.innerHTML = `
    <table class="tbl"><thead><tr><th>VLAN</th><th>Name</th><th>Purpose</th><th>Subnet</th><th>Gateway</th></tr></thead><tbody>
      ${r.vlans.map(v => `<tr><td><span class="badge b-blue">${v.id}</span></td><td>${v.name}</td><td style="color:var(--text2)">${v.purpose}</td><td style="font-family:var(--mono);font-size:12px;color:var(--cyan)">${v.subnet}</td><td style="font-family:var(--mono);font-size:12px;color:var(--green)">${v.gateway}</td></tr>`).join('')}
    </tbody></table>`;
}

function buildStarterConfig(r) {
  const lines = [];
  lines.push(`! ===== Starter config — ${r.name} =====`);
  lines.push(`! Generated by NetworkKB Design Helper — review before deploying`);
  lines.push(`! Topology: ${r.topology} | Redundancy: ${r.redundancy}`);
  lines.push('!');
  lines.push('! ── VLANs ──');
  r.vlans.forEach(v => lines.push(`vlan ${v.id}\n name ${v.name}`));
  lines.push('!');
  lines.push('! ── Distribution switch: SVIs + HSRP (repeat priority swap on peer) ──');
  r.vlans.filter(v => v.id !== 999).forEach((v, i) => {
    lines.push(`interface vlan ${v.id}`);
    lines.push(` description ${v.name}`);
    lines.push(` ip address ${v.gateway} 255.255.255.0`);
    if (r.distSwitchCount > 1) {
      lines.push(` standby version 2`);
      lines.push(` standby ${v.id} ip ${v.gateway}`);
      lines.push(` standby ${v.id} priority 110`);
      lines.push(` standby ${v.id} preempt`);
    }
    lines.push(` no shutdown`);
  });
  lines.push('!');
  lines.push('! ── Access switch: uplink trunk ──');
  lines.push(`interface range GigabitEthernet1/0/1${r.uplinksPerAccess > 1 ? ' - 2' : ''}`);
  if (r.uplinksPerAccess > 1) {
    lines.push(' channel-group 1 mode active');
    lines.push('interface port-channel 1');
  }
  lines.push(' switchport mode trunk');
  lines.push(` switchport trunk allowed vlan ${r.vlans.map(v => v.id).join(',')}`);
  lines.push(' switchport trunk native vlan 999');
  lines.push('!');
  lines.push('! ── Access port template (repeat per port, adjust VLAN) ──');
  lines.push('interface GigabitEthernet1/0/10');
  lines.push(' switchport mode access');
  lines.push(' switchport access vlan 10');
  if (r.voice) lines.push(' switchport voice vlan 20');
  lines.push(' spanning-tree portfast');
  lines.push(' spanning-tree bpduguard enable');
  lines.push('!');
  lines.push('! ── STP baseline ──');
  lines.push('spanning-tree mode rapid-pvst');
  lines.push(`spanning-tree vlan ${r.vlans.map(v => v.id).join(',')} root primary`);
  lines.push('!');
  lines.push('! ── Review against: Switching > STP, Routing > Inter-VLAN, Design > Checklist ──');
  return lines.join('\n');
}

function generateDesign() {
  const inputs = {
    name: document.getElementById('dh-name').value.trim() || 'My Site',
    users: Math.max(1, parseInt(document.getElementById('dh-users').value) || 1),
    floors: Math.max(1, parseInt(document.getElementById('dh-floors').value) || 1),
    redundancy: document.getElementById('dh-redundancy').value,
    voice: document.getElementById('dh-voice').value === 'yes',
    wifi: document.getElementById('dh-wifi').value === 'yes',
    growthPct: parseInt(document.getElementById('dh-growth').value) || 20,
    block: document.getElementById('dh-block').value.trim() || '10.1.0.0/16',
    hasFirewall: document.getElementById('dh-firewall').value === 'yes',
    hasDMZ: document.getElementById('dh-dmz').value === 'yes',
    hasWLC: document.getElementById('dh-wlc').value === 'yes',
  };
  const r = computeDesign(inputs);
  dhLastResult = r;

  document.getElementById('dh-output').style.display = 'block';
  renderTopologyDiagram(r);   // the visual SVG diagram + layer toggles
  renderWhyExplanation(r);    // plain-language "why this design" callouts
  renderTopology(r);          // existing text/table summary (kept as-is)
  renderDevices(r);
  renderVlans(r);
  document.getElementById('dh-config').textContent = buildStarterConfig(r);

  // Collapse the input form now that it's done its job — reclaims vertical
  // space for the diagram, which is the whole point of the collapsible
  // sections. The expand button stays hidden until the first generate so
  // it doesn't appear next to a form nobody's touched yet.
  document.getElementById('dh-requirements-card').classList.add('dh-collapsed');
  const reqToggle = document.getElementById('dh-req-toggle');
  reqToggle.style.display = '';
  reqToggle.textContent = 'expand';

  document.getElementById('dh-output').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function downloadConfigs() {
  if (!dhLastResult) { alert('Generate a design first.'); return; }
  const text = buildStarterConfig(dhLastResult);
  const blob = new Blob([text], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${dhLastResult.name.replace(/\s+/g, '_')}_starter_config.txt`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── Save / load via PHP + SQLite backend ────────────────────────────
// Requires the site to be served over http(s) (php -S, Apache, etc.) —
// silently explains itself if fetch fails (e.g. opened via file://).

async function saveDesign() {
  const inputs = {
    name: document.getElementById('dh-name').value.trim() || 'My Site',
    users: document.getElementById('dh-users').value,
    floors: document.getElementById('dh-floors').value,
    redundancy: document.getElementById('dh-redundancy').value,
    voice: document.getElementById('dh-voice').value,
    wifi: document.getElementById('dh-wifi').value,
    growth: document.getElementById('dh-growth').value,
    block: document.getElementById('dh-block').value,
  };
  try {
    const res = await fetch('api/save_design.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(inputs),
    });
    const data = await res.json();
    if (data.ok) {
      alert('Saved "' + inputs.name + '" (id ' + data.id + ')');
    } else {
      alert('Save failed: ' + (data.error || 'unknown error'));
    }
  } catch (e) {
    alert('Could not reach the save API. This feature needs the site served over ' +
          'http(s) — e.g. run "php -S localhost:8000" in this folder — not opened as a file:// page.\n\n' + e);
  }
}

async function loadDesignList() {
  const box = document.getElementById('dh-saved-list');
  const items = document.getElementById('dh-saved-items');
  box.style.display = 'block';
  items.innerHTML = '<div style="color:var(--text3)">Loading…</div>';
  try {
    const res = await fetch('api/list_designs.php');
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'unknown error');
    if (!data.designs.length) {
      items.innerHTML = '<div style="color:var(--text3)">No saved designs yet.</div>';
      return;
    }
    items.innerHTML = data.designs.map(d => `
      <div class="rrow i">
        <div class="rico">📄</div>
        <div style="flex:1"><div class="rtxt">${d.name}</div><div class="rsub">${d.users} users · ${d.floors} floor(s) · ${d.redundancy} redundancy · saved ${d.created_at}</div></div>
        <div style="display:flex;gap:6px">
          <button class="btn btn-blue" style="padding:4px 10px;font-size:11px" onclick="applyDesign(${d.id})">load</button>
          <button class="btn btn-red" style="padding:4px 10px;font-size:11px" onclick="deleteDesign(${d.id})">delete</button>
        </div>
      </div>`).join('');
  } catch (e) {
    items.innerHTML = '<div style="color:var(--red)">Could not reach the API — is this served via a local web server? (' + e.message + ')</div>';
  }
}

async function applyDesign(id) {
  try {
    const res = await fetch('api/list_designs.php?id=' + encodeURIComponent(id));
    const data = await res.json();
    if (!data.ok || !data.design) throw new Error(data.error || 'not found');
    const d = data.design;
    document.getElementById('dh-name').value = d.name;
    document.getElementById('dh-users').value = d.users;
    document.getElementById('dh-floors').value = d.floors;
    document.getElementById('dh-redundancy').value = d.redundancy;
    document.getElementById('dh-voice').value = d.voice;
    document.getElementById('dh-wifi').value = d.wifi;
    document.getElementById('dh-growth').value = d.growth;
    document.getElementById('dh-block').value = d.block;
    generateDesign();
  } catch (e) {
    alert('Could not load design: ' + e.message);
  }
}

async function deleteDesign(id) {
  if (!confirm('Delete this saved design?')) return;
  try {
    const res = await fetch('api/delete_design.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    const data = await res.json();
    if (data.ok) loadDesignList();
    else alert('Delete failed: ' + (data.error || 'unknown error'));
  } catch (e) {
    alert('Could not reach the API: ' + e.message);
  }
}

// ══════════════════════════════════════════════════════════════════
// VISUAL TOPOLOGY DIAGRAM
// ══════════════════════════════════════════════════════════════════
// Everything below builds an inline SVG diagram from the same `r` result
// object computeDesign() already produces — no separate data model, so
// the diagram, the text summary, and the generated config can never
// drift out of sync with each other.
//
// Layout convention (top to bottom, all coordinates in SVG user units):
//   Core row        (only drawn if r.collapsedCore === false)
//   Distribution row (always drawn)
//   Access rows      (one row per floor shown, capped at MAX_FLOOR_ROWS
//                      so a 40-floor building doesn't render a mile-long
//                      diagram — anything beyond the cap collapses into
//                      a single "+N more floors" label)
//
// Every drawn element that a layer checkbox controls carries a
// data-layer="access|dist|core|ap|ip|uplink" attribute. toggleDiagramLayer()
// just flips display:none/inline on everything matching that attribute —
// nothing gets rebuilt, so toggling is instant and never touches dhLastResult.

const MAX_FLOOR_ROWS = 5; // cap drawn floor rows to keep the SVG readable

function renderTopologyDiagram(r) {
  const svgWidth = 700;
  const nodeW = 108, nodeH = 46;
  const rowGap = 92;
  let y = 26;

  // Four layers, painted in this order so each sits correctly behind/in
  // front of the others: zone backgrounds (bottom) → connector lines →
  // device boxes (top). zoneParts holds the big Internal/DMZ/External
  // bordered rectangles — added new for the firewall/DMZ/zone-split work.
  const zoneParts = [];
  const lineParts = [];
  const nodeParts = [];

  const defs = `
    <defs>
      <marker id="dhArrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
        <path d="M0,0 L8,4 L0,8 Z" fill="var(--text3)"/>
      </marker>
    </defs>`;

  // ── helper: one device box as a clickable <g> ──
  // type/index are echoed back into openDeviceModal() so the modal knows
  // which slice of dhLastResult / buildStarterConfig() to show. `icon`
  // is an optional small SVG glyph drawn in the box's top-left corner —
  // this is the "modern icon" pass: simple geometric glyphs instead of
  // plain text-only boxes, kept lightweight (a few path/line elements)
  // rather than a full icon font or external image set.
  function deviceNode(cx, cy, label, sublabel, color, bg, layer, type, index, icon) {
    const x = cx - nodeW / 2, yTop = cy - nodeH / 2;
    const iconSvg = icon ? icon(x + 14, cy) : '';
    nodeParts.push(`
      <g class="dh-device" data-layer="${layer}" onclick="openDeviceModal('${type}',${index})">
        <rect x="${x}" y="${yTop}" width="${nodeW}" height="${nodeH}" rx="7" fill="${bg}" stroke="${color}"/>
        ${iconSvg}
        <text x="${cx + (icon ? 8 : 0)}" y="${cy - 4}" text-anchor="middle" fill="${color}" font-size="11.5" font-weight="700">${label}</text>
        <text x="${cx + (icon ? 8 : 0)}" y="${cy + 12}" text-anchor="middle" fill="var(--text3)" font-size="9.5">${sublabel}</text>
      </g>`);
  }

  // ── Small icon glyphs — self-contained SVG paths, no external assets ──
  const ICONS = {
    firewall: (cx, cy) => `<g stroke="var(--red)" stroke-width="1.6" fill="none">
        <path d="M${cx-6},${cy-9} L${cx+6},${cy-9} L${cx+6},${cy+3} Q${cx},${cy+11} ${cx-6},${cy+3} Z"/>
        <line x1="${cx-3}" y1="${cy-5}" x2="${cx-3}" y2="${cy+2}"/>
        <line x1="${cx}" y1="${cy-5}" x2="${cx}" y2="${cy+4}"/>
        <line x1="${cx+3}" y1="${cy-5}" x2="${cx+3}" y2="${cy+2}"/>
      </g>`,
    wlc: (cx, cy) => `<g stroke="var(--purple)" stroke-width="1.6" fill="none">
        <path d="M${cx-8},${cy+2} A8,8 0 0 1 ${cx+8},${cy+2}"/>
        <path d="M${cx-5},${cy+4} A5,5 0 0 1 ${cx+5},${cy+4}"/>
        <circle cx="${cx}" cy="${cy+6}" r="1.6" fill="var(--purple)" stroke="none"/>
      </g>`,
    server: (cx, cy) => `<g stroke="var(--amber)" stroke-width="1.4" fill="none">
        <rect x="${cx-8}" y="${cy-9}" width="16" height="6" rx="1"/>
        <rect x="${cx-8}" y="${cy-1}" width="16" height="6" rx="1"/>
        <circle cx="${cx+4}" cy="${cy-6}" r="0.9" fill="var(--amber)" stroke="none"/>
        <circle cx="${cx+4}" cy="${cy+2}" r="0.9" fill="var(--amber)" stroke="none"/>
      </g>`,
    switch: (cx, cy) => `<g stroke-width="1.4" fill="none">
        <rect x="${cx-9}" y="${cy-3}" width="18" height="7" rx="1" stroke="var(--text3)"/>
        <circle cx="${cx-6}" cy="${cy+0.5}" r="1" fill="var(--text3)" stroke="none"/>
        <circle cx="${cx-1}" cy="${cy+0.5}" r="1" fill="var(--text3)" stroke="none"/>
        <circle cx="${cx+4}" cy="${cy+0.5}" r="1" fill="var(--text3)" stroke="none"/>
      </g>`,
  };

  // A cloud outline (built from overlapping circles) used for the
  // External/WAN zone instead of a plain rectangle — the one place a more
  // literal icon reads better than a generic box+label.
  function cloudShape(cx, cy, scale) {
    const s = scale || 1;
    return `<g transform="translate(${cx},${cy}) scale(${s})" fill="var(--surface3)" stroke="var(--text3)" stroke-width="1.2">
      <circle cx="-18" cy="4" r="12"/><circle cx="0" cy="-6" r="15"/><circle cx="18" cy="4" r="12"/>
      <rect x="-24" y="4" width="48" height="14" rx="7"/>
    </g>`;
  }

  // Connector between two node CENTERS — see prior comments (unchanged):
  // shortens to each box's near edge regardless of which point is above.
  function link(x1, y1, x2, y2, label, layer, dashed) {
    const upper = y1 <= y2 ? { x: x1, y: y1 } : { x: x2, y: y2 };
    const lower = y1 <= y2 ? { x: x2, y: y2 } : { x: x1, y: y1 };
    const sy = upper.y + nodeH / 2;
    const ey = lower.y - nodeH / 2;
    const layerAttr = layer ? ` data-layer="${layer}"` : '';
    const dash = dashed ? ' stroke-dasharray="4,3"' : '';
    let s = `<line${layerAttr} x1="${upper.x}" y1="${sy}" x2="${lower.x}" y2="${ey}" stroke="var(--border2)" stroke-width="1.5"${dash} marker-end="url(#dhArrow)"/>`;
    if (label) {
      const mx = (upper.x + lower.x) / 2, my = (sy + ey) / 2;
      s += `<text data-layer="uplink" x="${mx}" y="${my}" text-anchor="middle" fill="var(--amber)" font-size="9" font-weight="600" style="paint-order:stroke" stroke="var(--bg)" stroke-width="3">${label}</text>`;
    }
    lineParts.push(s);
  }

  // ── External / WAN zone + Firewall + DMZ (only when firewall is on) ──
  // This is the strict-split zone work: a labeled, bordered background
  // rectangle per zone, with the firewall sitting ON the boundary between
  // External and Internal (its natural position — the choke point), and
  // the DMZ drawn as its own smaller side zone off the firewall's third
  // interface, the way a real 3-legged firewall design works.
  let firewallY = null, firewallX = [], dmzNodeX = null, dmzNodeY = null;
  if (r.hasFirewall) {
    const extTop = y - 16;
    const extY = y + 14;
    nodeParts.push(`<g data-layer="external">${cloudShape(svgWidth / 2 - (r.dmzEnabled ? 60 : 0), extY, 1.3)}
      <text data-layer="external" x="${svgWidth / 2 - (r.dmzEnabled ? 60 : 0)}" y="${extY + 34}" text-anchor="middle" fill="var(--text2)" font-size="10.5" font-weight="700">Internet / WAN</text></g>`);
    y += rowGap - 6;

    firewallY = y;
    const fwN = r.firewallCount;
    const fwSpacing = 130;
    const fwCenterX = svgWidth / 2 - (r.dmzEnabled ? 60 : 0);
    for (let i = 0; i < fwN; i++) {
      const cx = fwCenterX + (i - (fwN - 1) / 2) * fwSpacing;
      firewallX.push(cx);
      deviceNode(cx, firewallY, fwN > 1 ? `Firewall ${i + 1}` : 'Firewall', fwN > 1 ? (i === 0 ? 'active' : 'standby') : 'perimeter', 'var(--red)', 'var(--red-bg)', 'firewall', 'firewall', i, ICONS.firewall);
    }
    const extTopEdge = extY + 18;
    firewallX.forEach(cx => link(cx, firewallY, svgWidth / 2 - (r.dmzEnabled ? 60 : 0), extTopEdge - nodeH / 2 + 8, null, 'firewall'));

    const extBottom = extY + 22;
    zoneParts.push(`<g data-layer="external"><rect x="16" y="${extTop}" width="${svgWidth - 32}" height="${extBottom - extTop}" rx="8" fill="none" stroke="var(--text3)" stroke-width="1.5" stroke-dasharray="5,4"/>
      <text x="30" y="${extTop + 14}" fill="var(--text3)" font-size="9.5" font-weight="700">EXTERNAL</text></g>`);

    if (r.dmzEnabled) {
      dmzNodeX = fwCenterX + 190;
      dmzNodeY = firewallY;
      deviceNode(dmzNodeX, dmzNodeY, 'DMZ Server', 'public-facing', 'var(--amber)', 'var(--amber-bg)', 'dmz', 'dmz', 0, ICONS.server);
      link(firewallX[0], firewallY, dmzNodeX, dmzNodeY, null, 'dmz');
      zoneParts.push(`<g data-layer="dmz"><rect x="${dmzNodeX - nodeW/2 - 14}" y="${dmzNodeY - nodeH/2 - 14}" width="${nodeW + 28}" height="${nodeH + 28}" rx="8" fill="var(--amber-bg)" stroke="var(--amber)" stroke-width="1.5" stroke-dasharray="5,4" opacity="0.5"/>
        <text x="${dmzNodeX - nodeW/2 - 6}" y="${dmzNodeY - nodeH/2 - 20}" fill="var(--amber)" font-size="9.5" font-weight="700">DMZ</text></g>`);
    }
    y += rowGap;
  }

  // ── Internal zone starts here — everything below is inside one big
  //    bordered box. We track its top now and its bottom once we know
  //    where the last access row lands. ──
  // nodeH/2 clears the top edge of whatever row is about to be drawn
  // (core or distribution); the extra 12px is breathing room so the
  // zone border doesn't hug the boxes right up against their edge.
  const internalTop = y - nodeH / 2 - 12;

  // ── Core row (only if this design isn't collapsed-core) ──
  let coreY = null, coreX = [];
  if (!r.collapsedCore && r.coreSwitchCount > 0) {
    coreY = y;
    const n = r.coreSwitchCount;
    const spacing = 170;
    for (let i = 0; i < n; i++) {
      const cx = svgWidth / 2 + (i - (n - 1) / 2) * spacing;
      coreX.push(cx);
      deviceNode(cx, coreY, `Core ${i + 1}`, '10G backbone', 'var(--red)', 'var(--red-bg)', 'core', 'core', i, ICONS.switch);
    }
    if (firewallX.length) firewallX.forEach(fx => coreX.forEach(cx => link(fx, firewallY, cx, coreY, null, 'firewall')));
    y += rowGap;
  }

  // ── Distribution row (always present) ──
  const distY = y;
  const distX = [];
  {
    const n = r.distSwitchCount;
    const spacing = 200;
    for (let i = 0; i < n; i++) {
      const cx = svgWidth / 2 + (i - (n - 1) / 2) * spacing;
      distX.push(cx);
      const label = n > 1 ? `Distribution ${i + 1}` : 'Distribution';
      const sub = n > 1 ? (i === 0 ? 'HSRP active' : 'HSRP standby') : 'no FHRP redundancy';
      deviceNode(cx, distY, label, sub, 'var(--orange)', 'var(--orange-bg)', 'dist', 'dist', i, ICONS.switch);
      const dataVlan = r.vlans.find(v => v.name === 'DATA');
      if (dataVlan) {
        nodeParts.push(`<text data-layer="ip" x="${cx}" y="${distY + nodeH/2 + 14}" text-anchor="middle" fill="var(--cyan)" font-size="9" font-family="var(--mono)">${dataVlan.gateway}</text>`);
      }
    }
    if (coreY !== null) {
      coreX.forEach(cx => distX.forEach(dx => link(cx, coreY, dx, distY, null, 'core')));
    } else if (firewallX.length) {
      firewallX.forEach(fx => distX.forEach(dx => link(fx, firewallY, dx, distY, null, 'firewall')));
    }
  }

  // ── WLC — centralized, drawn beside distribution rather than a whole
  //    extra row (a WLC isn't per-floor, so it doesn't need one). ──
  if (r.wlcCount > 0) {
    const wlcX = distX[distX.length - 1] + 190;
    for (let i = 0; i < r.wlcCount; i++) {
      const wy = distY + (i - (r.wlcCount - 1) / 2) * 56;
      deviceNode(wlcX, wy, r.wlcCount > 1 ? `WLC ${i + 1}` : 'WLC', 'wireless controller', 'var(--purple)', 'var(--purple-bg)', 'wlc', 'wlc', i, ICONS.wlc);
      link(distX[distX.length - 1], distY, wlcX, wy, null, 'wlc');
    }
  }
  y += rowGap;

  // ── Access rows — one per floor, capped at MAX_FLOOR_ROWS ──
  const floorsToDraw = Math.min(r.floors, MAX_FLOOR_ROWS);
  for (let f = 0; f < floorsToDraw; f++) {
    const rowY = y;
    const accessCount = r.uplinksPerAccess > 1 ? 2 : 1;
    const baseX = svgWidth / 2 - (accessCount - 1) * 90 - (r.wifi ? 70 : 0);
    const nodeXs = [];
    for (let i = 0; i < accessCount; i++) {
      const cx = baseX + i * 180;
      nodeXs.push(cx);
      deviceNode(cx, rowY, `Floor ${f + 1} Access`, i === 0 ? 'primary uplink' : 'secondary uplink', 'var(--cyan)', 'var(--cyan-bg)', 'access', 'access', f + 1, ICONS.switch);
    }
    if (r.wifi) {
      const apX = baseX + accessCount * 180;
      deviceNode(apX, rowY, '📶 AP', 'wireless', '#c586c0', 'rgba(197,134,192,.12)', 'ap', 'ap', f + 1);
      link(apX, rowY, nodeXs[0], rowY, null, 'ap');
    }
    nodeXs.forEach(ax => distX.forEach(dx => link(ax, rowY, dx, distY, r.uplinkSpeed, 'access')));
    y += rowGap;
  }

  let extraNote = '';
  if (r.floors > MAX_FLOOR_ROWS) {
    extraNote = `<text x="${svgWidth/2}" y="${y - rowGap + 70}" text-anchor="middle" fill="var(--text3)" font-size="10" font-style="italic">+ ${r.floors - MAX_FLOOR_ROWS} more floor(s), same access/uplink pattern</text>`;
    y += 20;
  }

  // ── Internal zone background — now that we know its full extent ──
  const internalBottom = y - rowGap + nodeH / 2 + 22;
  zoneParts.unshift(`<g data-layer="core"><rect x="16" y="${internalTop}" width="${svgWidth - 32}" height="${internalBottom - internalTop}" rx="8" fill="none" stroke="var(--green)" stroke-width="1.5" stroke-dasharray="5,4" opacity="0.55"/>
    <text x="30" y="${internalTop + 15}" fill="var(--green)" font-size="9.5" font-weight="700">INTERNAL NETWORK</text></g>`);

  const svgHeight = y + 10;
  const svg = `
    <svg viewBox="0 0 ${svgWidth} ${svgHeight}" style="width:100%;max-width:${svgWidth}px;height:auto;display:block;margin:0 auto" xmlns="http://www.w3.org/2000/svg">
      ${defs}
      ${zoneParts.join('\n')}
      ${lineParts.join('\n')}
      ${nodeParts.join('\n')}
      ${extraNote}
    </svg>`;

  document.getElementById('dh-diagram').innerHTML = svg;

  // Re-apply whatever toggle state the checkboxes are currently in — if
  // the user unchecked "IP labels" before regenerating, keep it unchecked
  // after the new SVG is dropped in, rather than resetting every toggle.
  document.querySelectorAll('#dh-layer-toggles input[type="checkbox"]').forEach(cb => {
    toggleDiagramLayer(cb.dataset.layer, cb.checked);
  });
}

// Flip visibility for every element tagged data-layer="<layer>" inside the
// current diagram. Called both by the checkbox onchange handlers and by
// renderTopologyDiagram() itself (to restore prior toggle state on redraw).
function toggleDiagramLayer(layer, visible) {
  document.querySelectorAll('#dh-diagram [data-layer="' + layer + '"]').forEach(el => {
    el.style.display = visible ? '' : 'none';
  });
}

// Plain-language "why this design" callouts under the diagram — a light
// rule-based explanation engine (no external AI call; just if/else over
// the same inputs computeDesign() already used).
function renderWhyExplanation(r) {
  const reasons = [];

  reasons.push(r.collapsedCore
    ? `<b>Collapsed core</b> was chosen because this site has ${r.distributionBlocks} distribution block and ${r.users} users — small enough that a dedicated core layer would add cost and latency without a real benefit. The distribution pair handles routing directly.`
    : `<b>A dedicated core</b> was added because this site spans ${r.floors} floors (${r.distributionBlocks} distribution blocks) — past that point, meshing every distribution switch directly to every other one gets messy, so a core aggregates them instead.`);

  reasons.push(r.redundancy === 'basic'
    ? `<b>Basic redundancy</b> means a single distribution switch and single uplinks per access switch — cheapest option, but any one failure takes down that segment. Fine for a cost-sensitive or non-critical site.`
    : `<b>${r.redundancy === 'high' ? 'High' : 'Standard'} redundancy</b> gives you a distribution pair running FHRP (HSRP) so there's always an active gateway, plus ${r.uplinksPerAccess} uplinks per access switch (bundle them as EtherChannel) so a single failed link or switch doesn't take the floor offline.`);

  if (r.wifi) {
    reasons.push(`<b>${r.apCount} access point(s)</b> were estimated from ~1 AP per 15 users (minimum 1 per floor) — a rough coverage rule, not a real RF survey. Treat this as a starting budget number.`);
  }

  reasons.push(`<b>${r.uplinkSpeed} uplinks</b> were chosen to keep access→distribution oversubscription near the ~20:1 rule of thumb for GbE access ports — see the Sizing &amp; Capacity reference page for the full math.`);

  document.getElementById('dh-why').innerHTML = `
    <div class="alert a-blue"><strong>Why this design</strong>
      <ul style="margin:6px 0 0 18px;padding:0;line-height:1.7">
        ${reasons.map(r => `<li>${r}</li>`).join('')}
      </ul>
    </div>`;
}

// ══════════════════════════════════════════════════════════════════
// DEVICE VIEWER MODAL — "click a device, see its config"
// ══════════════════════════════════════════════════════════════════
// Deliberately NOT just a raw dump of buildStarterConfig() — each device
// type gets its own short, relevant slice plus a one-line explanation of
// what it's showing, so it reads like a friendly device screen rather
// than a wall of undifferentiated config.

function openDeviceModal(type, index) {
  if (!dhLastResult) return;
  const r = dhLastResult;
  const title = document.getElementById('dh-modal-title');
  const screen = document.getElementById('dh-modal-screen');

  let heading = '', body = '';

  if (type === 'core') {
    heading = `Core ${index + 1}`;
    body = `! Core switches in a collapsed-core-free design are pure L3\n`
         + `! forwarding — no policy, no ACLs, just fast routing between\n`
         + `! distribution blocks.\n\n`
         + `interface TenGigabitEthernet1/0/1\n description Link to Distribution\n no switchport\n ip address 10.255.255.${index * 4 + 1} 255.255.255.252\n no shutdown\n\n`
         + `router ospf 1\n network 10.255.255.0 0.0.0.3 area 0\n`
         + `<span class="dh-screen-note">This is a generic backbone template — real core config depends on your chosen routing protocol and how many distribution blocks it connects.</span>`;
  } else if (type === 'dist') {
    heading = r.distSwitchCount > 1 ? `Distribution ${index + 1}` : 'Distribution';
    const vlanLines = r.vlans.filter(v => v.id !== 999).map(v => {
      let l = `interface vlan ${v.id}\n description ${v.name}\n ip address ${v.gateway} 255.255.255.0\n`;
      if (r.distSwitchCount > 1) {
        l += ` standby version 2\n standby ${v.id} ip ${v.gateway}\n standby ${v.id} priority ${index === 0 ? 110 : 100}\n standby ${v.id} preempt\n`;
      }
      l += ` no shutdown`;
      return l;
    }).join('\n');
    body = `! This is where inter-VLAN routing and the default gateway for\n! every VLAN live. ${r.distSwitchCount > 1 ? 'Priority ' + (index === 0 ? '110 (active)' : '100 (standby)') + ' — the higher priority switch answers as the gateway.' : 'No HSRP peer — this is the only gateway (single point of failure).'}\n\n${vlanLines}`;
  } else if (type === 'access') {
    heading = `Floor ${index} — Access switch`;
    body = `! Every access switch on this floor uses the same template:\n! an uplink trunk to distribution, plus access ports per user.\n\n`
         + `interface range GigabitEthernet1/0/1${r.uplinksPerAccess > 1 ? ' - 2' : ''}\n`
         + (r.uplinksPerAccess > 1 ? ` channel-group 1 mode active\ninterface port-channel 1\n` : '')
         + ` switchport mode trunk\n switchport trunk allowed vlan ${r.vlans.map(v => v.id).join(',')}\n switchport trunk native vlan 999\n\n`
         + `interface GigabitEthernet1/0/10\n switchport mode access\n switchport access vlan 10\n`
         + (r.voice ? ` switchport voice vlan 20\n` : '')
         + ` spanning-tree portfast\n spanning-tree bpduguard enable\n`
         + `<span class="dh-screen-note">Repeat the access-port block for each port, changing the VLAN as needed.</span>`;
  } else if (type === 'ap') {
    heading = `Floor ${index} — Access point`;
    body = `! Lightweight APs don't hold a full running-config themselves —\n! they join a WLC over CAPWAP and pull their config from there.\n! The switch port they plug into just needs to trunk (or access,\n! depending on your WLC model) the wireless VLAN and supply PoE:\n\n`
         + `interface GigabitEthernet1/0/24\n switchport mode access\n switchport access vlan ${r.vlans.find(v => v.name === 'WIFI') ? r.vlans.find(v => v.name === 'WIFI').id : 30}\n power inline auto\n spanning-tree portfast\n\n`
         + `<span class="dh-screen-note">See the Wireless section (WLC &amp; CAPWAP) for the controller-side config this AP will actually run.</span>`;
  } else if (type === 'firewall') {
    heading = r.firewallCount > 1 ? `Firewall ${index + 1}` : 'Firewall';
    const dataVlan = r.vlans.find(v => v.name === 'DATA');
    body = `! Sits at the perimeter — the choke point between your internal\n! network and the outside world. Every packet crossing in or out\n! passes through here first.\n\n`
         + `interface GigabitEthernet0/0\n description OUTSIDE (${'\u2192'} Internet/WAN)\n nameif outside\n\ninterface GigabitEthernet0/1\n description INSIDE (${'\u2192'} internal network)\n nameif inside\n ip address ${dataVlan ? dataVlan.gateway.replace(/\.1$/, '.254') : '10.1.10.254'} 255.255.255.0\n`
         + (r.dmzEnabled ? `\ninterface GigabitEthernet0/2\n description DMZ (${'\u2192'} public-facing servers)\n nameif dmz\n\n` : '\n')
         + `! Default posture: deny inbound from outside, allow outbound from inside\naccess-list OUTSIDE_IN deny ip any any log\n`
         + (r.firewallCount > 1 ? `\n! HA pair — this box is ${index === 0 ? 'primary/active' : 'secondary/standby'}\nfailover\nfailover lan interface fover GigabitEthernet0/3\n` : '')
         + `<span class="dh-screen-note">This is a skeleton, not a real security policy — see the NGFW reference pages for what actually belongs in a production rule set (App-ID, IPS, TLS inspection).</span>`;
  } else if (type === 'dmz') {
    heading = 'DMZ Server';
    const dmzVlan = r.vlans.find(v => v.name === 'DMZ');
    body = `! Public-facing services (web, mail relay, reverse proxy) live\n! here — reachable from the outside, but isolated from your\n! internal network by the firewall's DMZ interface policy.\n\n`
         + `interface GigabitEthernet0/1\n description DMZ uplink\n switchport access vlan ${dmzVlan ? dmzVlan.id : 50}\n\n`
         + `! Firewall rules for this zone (conceptual):\n!   outside -> dmz : permit only the specific ports this server needs (80/443/etc)\n!   dmz -> inside   : deny by default — a compromised DMZ host should NOT reach internal hosts\n!   inside -> dmz   : permit admin/management access only\n`
         + `<span class="dh-screen-note">The whole point of a DMZ: if this host gets compromised, the attacker still hits a wall trying to reach your internal network.</span>`;
  } else if (type === 'wlc') {
    heading = r.wlcCount > 1 ? `WLC ${index + 1}` : 'WLC';
    body = `! The Wireless LAN Controller — every AP on the site joins this\n! over CAPWAP and pulls its config (SSIDs, security, RF settings)\n! from here instead of being configured individually.\n\n`
         + `interface vlan 99\n description WLC management\n ip address dhcp\n\nwlan ${r.name.replace(/\s+/g,'-')}-Corp 1 ${r.name.replace(/\s+/g,'-')}-Corp\n security wpa akm dot1x\n no shutdown\n`
         + (r.wlcCount > 1 ? `\n! HA pair — ${index === 0 ? 'primary' : 'secondary (N+1 or SSO, depending on model)'}\n` : '')
         + `<span class="dh-screen-note">See the Wireless section (WLC &amp; CAPWAP, Security: WPA2/3) for full controller configuration.</span>`;
  } else if (type === 'external') {
    heading = 'Internet / WAN';
    body = `! Not a device you configure — this represents everything\n! outside your perimeter. Traffic to/from here passes through\n! the firewall's "outside" interface.\n\n`
         + `<span class="dh-screen-note">Click the Firewall icon to see the perimeter config that actually controls what's allowed to/from this zone.</span>`;
  }

  title.textContent = heading;
  screen.innerHTML = body;
  document.getElementById('dh-modal-overlay').style.display = 'flex';
}

function closeDeviceModal() {
  document.getElementById('dh-modal-overlay').style.display = 'none';
}
