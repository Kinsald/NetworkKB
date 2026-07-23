// acl-tools.js — ACL builder and config validator

let aclRules = [];

function addACLRule() {
  const action = document.getElementById('b-action').value;
  const proto  = document.getElementById('b-proto').value;
  const src    = document.getElementById('b-src').value.trim() || 'any';
  const srcw   = document.getElementById('b-srcw').value.trim();
  const dst    = document.getElementById('b-dst').value.trim() || 'any';
  const dstw   = document.getElementById('b-dstw').value.trim();
  const portop = document.getElementById('b-portop').value;
  const port   = document.getElementById('b-port').value.trim();
  const port2  = document.getElementById('b-port2').value.trim();
  const extra  = document.getElementById('b-extra').value;
  const srcPart = src === 'any' ? 'any' : (srcw ? `${src} ${srcw}` : `host ${src}`);
  const dstPart = dst === 'any' ? 'any' : (dstw ? `${dst} ${dstw}` : `host ${dst}`);
  let portPart = '';
  if (portop && port) portPart = portop === 'range' && port2 ? ` range ${port} ${port2}` : ` ${portop} ${port}`;
  aclRules.push(` ${action} ${proto} ${srcPart} ${dstPart}${portPart}${extra ? ' '+extra : ''}`);
  renderACL();
}
function renderACL() {
  const name = (document.getElementById('acl-name')||{}).value || 'MY_ACL';
  const out = document.getElementById('acl-output');
  if (!out) return;
  if (aclRules.length === 0) { out.innerHTML = '<span style="color:var(--text3)">Add rules above...</span>'; return; }
  out.textContent = `ip access-list extended ${name}\n${aclRules.join('\n')}`;
}
function clearACLRules() { aclRules = []; renderACL(); }

// ── Config Validator ──

function validateConfig() {
  const raw = document.getElementById('cfg-input').value;
  const lines = raw.split('\n');
  const out = document.getElementById('cfg-out');
  const results = [];
  let hasNatInside = false, hasNatOutside = false, hasNatSource = false;
  let hasACL = false, hasEstablished = false, hasImplicitDeny = false, hasDenyLog = false;
  let aclNames = new Set(), appliedACLs = new Set();
  let ospfProcess = false, ospfNetwork = false;
  for (let line of lines) {
    const l = line.trim().toLowerCase();
    if (l.includes('ip nat inside') && !l.includes('source')) hasNatInside = true;
    if (l.includes('ip nat outside')) hasNatOutside = true;
    if (l.includes('ip nat inside source')) hasNatSource = true;
    if (l.match(/ip access-list/)) { hasACL = true; const m = line.match(/ip access-list \w+ (\S+)/i); if(m) aclNames.add(m[1]); }
    if (l.includes('established')) hasEstablished = true;
    if (l.includes('deny ip any any log')) hasDenyLog = true;
    if (l.match(/^\s*deny ip any any\s*$/) || l.includes('deny ip any any')) hasImplicitDeny = true;
    if (l.match(/ip access-group (\S+) (in|out)/i)) { const m = line.match(/ip access-group (\S+)/i); if(m) appliedACLs.add(m[1]); }
    if (l.match(/router ospf/)) ospfProcess = true;
    if (l.match(/^\s*network /)) ospfNetwork = true;
  }
  // NAT checks
  if (hasNatSource && !hasNatInside) results.push(['err','ip nat inside missing','Add "ip nat inside" to your LAN interface — NAT will not work without it.']);
  if (hasNatSource && !hasNatOutside) results.push(['err','ip nat outside missing','Add "ip nat outside" to your WAN interface.']);
  if (hasNatInside && hasNatOutside && hasNatSource) results.push(['ok','NAT inside/outside configured','Both interface directions are marked correctly.']);
  // ACL checks
  if (hasACL && !hasEstablished) results.push(['warn','No "established" keyword found','Without "established", return TCP traffic (SYN-ACK) may be blocked on WAN inbound ACL.']);
  if (hasEstablished) results.push(['ok','"established" present','Return TCP traffic will be allowed through.']);
  if (hasDenyLog) results.push(['ok','Explicit deny with log','Good — drops will be visible in "show ip access-lists".']);
  else if (hasACL) results.push(['warn','No explicit deny with log','Add "deny ip any any log" as the last rule so you can see what gets dropped.']);
  // Applied ACL check
  for (let name of aclNames) {
    if (!appliedACLs.has(name) && !appliedACLs.has(name.toUpperCase())) {
      results.push(['warn',`ACL "${name}" defined but not applied`,'Use "ip access-group '+name+' in/out" on an interface.']);
    }
  }
  for (let name of appliedACLs) {
    if (!aclNames.has(name) && !aclNames.has(name.toUpperCase())) {
      results.push(['err',`ACL "${name}" applied but not defined`,'Define the ACL with "ip access-list extended '+name+'" before applying.']);
    }
  }
  if (ospfProcess && !ospfNetwork) results.push(['warn','OSPF process exists but no network statements','Add "network X.X.X.X Y.Y.Y.Y area Z" under router ospf.']);
  if (ospfProcess && ospfNetwork) results.push(['ok','OSPF process with network statements','Looks complete — verify with "show ip ospf neighbor".']);
  if (results.length === 0) results.push(['ok','No obvious issues found','Config looks OK based on pattern checks. Always verify on device.']);
  out.innerHTML = results.map(([type,title,msg]) =>
    `<div class="vline ${type==='ok'?'ok':type==='warn'?'warn':'err'}">
      <span class="vico">${type==='ok'?'✓':type==='warn'?'⚠':'✗'}</span>
      <div><div class="vtxt">${title}</div><div class="vmsg">${msg}</div></div>
    </div>`
  ).join('');
}
