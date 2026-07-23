// vlan-planner.js — inter-VLAN planning tool

let vlans = [];

function addVLAN() {
  const id   = document.getElementById('vl-id').value.trim();
  const name = document.getElementById('vl-name').value.trim() || `VLAN_${id}`;
  const sub  = document.getElementById('vl-sub').value.trim();
  const gw   = document.getElementById('vl-gw').value.trim();
  if (!id || isNaN(id) || +id < 1 || +id > 4094) { alert('VLAN ID must be 1–4094'); return; }
  vlans = vlans.filter(v => v.id !== id);
  vlans.push({ id, name, sub, gw });
  vlans.sort((a,b) => +a.id - +b.id);
  renderVLANs();
}
function removeVLAN(id) { vlans = vlans.filter(v => v.id !== id); renderVLANs(); }
function renderVLANs() {
  const tbl = document.getElementById('vl-table');
  const cfg = document.getElementById('vl-config');
  if (!vlans.length) {
    tbl.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text3);padding:20px">No VLANs added yet</td></tr>';
    cfg.innerHTML = '<span style="color:var(--text3)">Add VLANs to generate config...</span>';
    return;
  }
  tbl.innerHTML = vlans.map(v => `
    <tr>
      <td><span class="badge b-blue">${v.id}</span></td>
      <td style="color:var(--text)">${v.name}</td>
      <td style="font-family:var(--mono);font-size:12px;color:var(--cyan)">${v.sub||'—'}</td>
      <td style="font-family:var(--mono);font-size:12px;color:var(--green)">${v.gw||'—'}</td>
      <td><button class="btn btn-red" style="padding:3px 8px;font-size:11px" onclick="removeVLAN('${v.id}')">remove</button></td>
    </tr>`).join('');
  const lines = ['! VLAN definitions'];
  vlans.forEach(v => lines.push(`vlan ${v.id}\n name ${v.name}`));
  lines.push('!', '! Switch Virtual Interfaces (SVIs) — L3 inter-VLAN routing');
  vlans.forEach(v => {
    if (v.sub && v.gw) {
      const parts = v.sub.split('/');
      const prefix = parts[1] ? parseInt(parts[1]) : 24;
      const maskOctets = [0,0,0,0].map((_,i) => {
        const bits = Math.min(8, Math.max(0, prefix - i*8));
        return ((0xff << (8-bits)) & 0xff);
      });
      lines.push(`interface vlan ${v.id}\n description ${v.name}\n ip address ${v.gw} ${maskOctets.join('.')}\n no shutdown`);
    }
  });
  lines.push('!', '! Trunk port — allow all VLANs');
  lines.push(`interface GigabitEthernet0/1\n switchport mode trunk\n switchport trunk allowed vlan ${vlans.map(v=>v.id).join(',')}`);
  cfg.textContent = lines.join('\n');
}
