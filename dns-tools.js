// dns-tools.js — interactive DNS record builder.
// Data-driven: each record type declares its own fields, an explanatory
// note, a worked example, and a formatter that turns the field values
// into a real zone-file line. renderDnsFields() rebuilds the form HTML
// whenever the record type changes; buildDnsRecord() reads whatever
// fields are currently on screen and regenerates the output.

const DNS_RECORD_TYPES = {
  A: {
    note: "The most common record type — maps a hostname straight to an IPv4 address. Use it for web servers, mail servers' underlying host, or any single machine that needs a name.",
    fields: [
      { id: 'name', label: 'Name (host)', placeholder: 'www', example: 'www' },
      { id: 'zone', label: 'Zone (domain)', placeholder: 'example.com', example: 'example.com' },
      { id: 'ttl', label: 'TTL (seconds)', placeholder: '3600', example: '3600' },
      { id: 'value', label: 'IPv4 address', placeholder: '192.0.2.10', example: '192.0.2.10' },
    ],
    format: v => `${v.name}.${v.zone}.\t${v.ttl}\tIN\tA\t${v.value}`,
  },
  AAAA: {
    note: "The IPv6 equivalent of an A record — same idea, just a 128-bit address instead of 32-bit. Every A record you have should eventually get an AAAA twin as IPv6 adoption grows.",
    fields: [
      { id: 'name', label: 'Name (host)', placeholder: 'www', example: 'www' },
      { id: 'zone', label: 'Zone (domain)', placeholder: 'example.com', example: 'example.com' },
      { id: 'ttl', label: 'TTL (seconds)', placeholder: '3600', example: '3600' },
      { id: 'value', label: 'IPv6 address', placeholder: '2001:db8::10', example: '2001:db8::10' },
    ],
    format: v => `${v.name}.${v.zone}.\t${v.ttl}\tIN\tAAAA\t${v.value}`,
  },
  CNAME: {
    note: "An alias — points one name at ANOTHER name (which must itself resolve via an A/AAAA record), rather than at an IP directly. Classic use: pointing ftp.example.com and mail.example.com both at the same underlying host name.",
    fields: [
      { id: 'name', label: 'Alias name', placeholder: 'ftp', example: 'ftp' },
      { id: 'zone', label: 'Zone (domain)', placeholder: 'example.com', example: 'example.com' },
      { id: 'ttl', label: 'TTL (seconds)', placeholder: '3600', example: '3600' },
      { id: 'value', label: 'Target (canonical) name', placeholder: 'webserver1.example.com', example: 'webserver1.example.com' },
    ],
    format: v => `${v.name}.${v.zone}.\t${v.ttl}\tIN\tCNAME\t${v.value}.`,
  },
  MX: {
    note: "Tells the world which server(s) handle email for a domain, and in what order of preference. Lower priority number = tried first. You can have multiple MX records for redundancy — a lower-priority backup mail server.",
    fields: [
      { id: 'zone', label: 'Zone (domain)', placeholder: 'example.com', example: 'example.com' },
      { id: 'ttl', label: 'TTL (seconds)', placeholder: '3600', example: '3600' },
      { id: 'priority', label: 'Priority (lower = preferred)', placeholder: '10', example: '10' },
      { id: 'value', label: 'Mail server (FQDN)', placeholder: 'mail.example.com', example: 'mail.example.com' },
    ],
    format: v => `${v.zone}.\t${v.ttl}\tIN\tMX\t${v.priority}\t${v.value}.`,
  },
  TXT: {
    note: "Free-form text attached to a name — used far beyond just \"notes.\" The big real-world uses: SPF (which mail servers may send for this domain), DKIM (email signing keys), and domain-ownership verification for services like Google Workspace or Microsoft 365.",
    fields: [
      { id: 'name', label: 'Name (host, or @ for the zone itself)', placeholder: '@', example: '@' },
      { id: 'zone', label: 'Zone (domain)', placeholder: 'example.com', example: 'example.com' },
      { id: 'ttl', label: 'TTL (seconds)', placeholder: '3600', example: '3600' },
      { id: 'value', label: 'Text value', placeholder: 'v=spf1 include:_spf.google.com ~all', example: 'v=spf1 include:_spf.google.com ~all' },
    ],
    format: v => `${v.name}.${v.zone}.\t${v.ttl}\tIN\tTXT\t"${v.value}"`,
  },
  NS: {
    note: "Delegates a zone (or subdomain) to a specific set of name servers — the record type that actually makes DNS a distributed, hierarchical system. Your registrar's NS records for your whole domain are what let the root/TLD servers point at your DNS provider in the first place.",
    fields: [
      { id: 'zone', label: 'Zone (domain)', placeholder: 'example.com', example: 'example.com' },
      { id: 'ttl', label: 'TTL (seconds)', placeholder: '86400', example: '86400' },
      { id: 'value', label: 'Name server (FQDN)', placeholder: 'ns1.example.com', example: 'ns1.example.com' },
    ],
    format: v => `${v.zone}.\t${v.ttl}\tIN\tNS\t${v.value}.`,
  },
  PTR: {
    note: "Reverse DNS — maps an IP address BACK to a hostname (the opposite of an A record). Lives in a special reverse zone named after the IP, reversed, ending in in-addr.arpa (IPv4) or ip6.arpa (IPv6). Mail servers commonly check this — missing reverse DNS is a common reason outbound mail gets flagged as spam.",
    fields: [
      { id: 'ip', label: 'IP address this record is for', placeholder: '192.0.2.10', example: '192.0.2.10' },
      { id: 'ttl', label: 'TTL (seconds)', placeholder: '3600', example: '3600' },
      { id: 'value', label: 'Target hostname (FQDN)', placeholder: 'www.example.com', example: 'www.example.com' },
    ],
    format: v => {
      const octets = v.ip.split('.');
      const reversed = octets.length === 4 ? octets.reverse().join('.') : v.ip;
      return `${reversed}.in-addr.arpa.\t${v.ttl}\tIN\tPTR\t${v.value}.`;
    },
  },
  SRV: {
    note: "Locates a specific SERVICE (not just a host) — advertises the hostname, port, priority, and weight for things like SIP, XMPP, or Microsoft services (Autodiscover, LDAP). The name format is strict: _service._protocol.zone.",
    fields: [
      { id: 'service', label: 'Service', placeholder: 'sip', example: 'sip' },
      { id: 'proto', label: 'Protocol', placeholder: 'tcp', example: 'tcp' },
      { id: 'zone', label: 'Zone (domain)', placeholder: 'example.com', example: 'example.com' },
      { id: 'ttl', label: 'TTL (seconds)', placeholder: '3600', example: '3600' },
      { id: 'priority', label: 'Priority', placeholder: '10', example: '10' },
      { id: 'weight', label: 'Weight', placeholder: '60', example: '60' },
      { id: 'port', label: 'Port', placeholder: '5060', example: '5060' },
      { id: 'value', label: 'Target (FQDN)', placeholder: 'sipserver.example.com', example: 'sipserver.example.com' },
    ],
    format: v => `_${v.service}._${v.proto}.${v.zone}.\t${v.ttl}\tIN\tSRV\t${v.priority}\t${v.weight}\t${v.port}\t${v.value}.`,
  },
  SOA: {
    note: "Every zone has exactly ONE of these — it's metadata about the zone itself: who's authoritative, an admin contact, and the timers secondary/slave DNS servers use to know when to re-sync. You'll edit the Serial number every time you change the zone by hand (secondaries use it to detect updates).",
    fields: [
      { id: 'zone', label: 'Zone (domain)', placeholder: 'example.com', example: 'example.com' },
      { id: 'ttl', label: 'TTL (seconds)', placeholder: '86400', example: '86400' },
      { id: 'primary', label: 'Primary name server', placeholder: 'ns1.example.com', example: 'ns1.example.com' },
      { id: 'admin', label: 'Admin email (dot instead of @)', placeholder: 'hostmaster.example.com', example: 'hostmaster.example.com' },
      { id: 'serial', label: 'Serial (usually YYYYMMDDnn)', placeholder: '2026072001', example: '2026072001' },
      { id: 'refresh', label: 'Refresh (seconds)', placeholder: '3600', example: '3600' },
      { id: 'retry', label: 'Retry (seconds)', placeholder: '900', example: '900' },
      { id: 'expire', label: 'Expire (seconds)', placeholder: '1209600', example: '1209600' },
      { id: 'minimum', label: 'Minimum/negative-cache TTL', placeholder: '3600', example: '3600' },
    ],
    format: v => `${v.zone}.\t${v.ttl}\tIN\tSOA\t${v.primary}. ${v.admin}. (\n\t\t${v.serial}\t; serial\n\t\t${v.refresh}\t\t; refresh\n\t\t${v.retry}\t\t; retry\n\t\t${v.expire}\t\t; expire\n\t\t${v.minimum} )\t; minimum TTL`,
  },
};

function renderDnsFields() {
  const type = document.getElementById('dns-type').value;
  const def = DNS_RECORD_TYPES[type];
  const container = document.getElementById('dns-fields');

  container.innerHTML = '<div class="g2">' + def.fields.map(f =>
    `<div class="fgroup"><label class="flabel">${f.label}</label>
      <input class="finput" id="dns-f-${f.id}" placeholder="${f.placeholder}" oninput="buildDnsRecord()"></div>`
  ).join('') + '</div>';

  document.getElementById('dns-note').innerHTML =
    `<div class="tool-hint-body" style="padding-top:0">${def.note}</div>`;

  buildDnsRecord();
}

// Fills every field for the current record type with its example value —
// the "easy to follow along" example the record type's note refers to.
function loadDnsExample() {
  const type = document.getElementById('dns-type').value;
  const def = DNS_RECORD_TYPES[type];
  def.fields.forEach(f => {
    const el = document.getElementById('dns-f-' + f.id);
    if (el) el.value = f.example;
  });
  buildDnsRecord();
}

function buildDnsRecord() {
  const type = document.getElementById('dns-type').value;
  const def = DNS_RECORD_TYPES[type];
  const values = {};
  let allFilled = true;
  def.fields.forEach(f => {
    const el = document.getElementById('dns-f-' + f.id);
    const val = el ? el.value.trim() : '';
    values[f.id] = val || f.placeholder; // fall back to placeholder so the
    if (!val) allFilled = false;          // preview stays readable while typing
  });
  const out = document.getElementById('dns-output');
  out.textContent = def.format(values);
  out.style.opacity = allFilled ? '1' : '.6'; // dim while still using placeholders
}
