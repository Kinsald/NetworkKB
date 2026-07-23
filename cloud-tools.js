// cloud-tools.js — interactive shared responsibility model visual.
// Click a deployment model (On-Premises / IaaS / PaaS / SaaS) and the
// stack re-renders showing who manages each layer — no server calls,
// no external state, just a data table and a re-render on click.

// Standard 8-layer stack, ordered top (application-facing) to bottom
// (physical facility) — matches how most vendor shared-responsibility
// diagrams present it. 'cust' = customer manages it, 'prov' = provider
// manages it.
const CLOUD_LAYERS = [
  { id: 'data', label: 'Data & access management' },
  { id: 'apps', label: 'Applications' },
  { id: 'runtime', label: 'Runtime / middleware' },
  { id: 'os', label: 'Operating system' },
  { id: 'virt', label: 'Virtualization (hypervisor)' },
  { id: 'compute', label: 'Servers / compute' },
  { id: 'storage', label: 'Storage' },
  { id: 'network', label: 'Networking (physical)' },
  { id: 'facility', label: 'Facilities / data center' },
];

// Who owns each layer, per model. This is the actual "shared
// responsibility" data — everything else in this file is just rendering.
const CLOUD_MODELS = {
  onprem: {
    label: 'On-Premises',
    desc: "You own and run everything yourself — the traditional model this whole comparison exists to contrast against.",
    owner: { data: 'cust', apps: 'cust', runtime: 'cust', os: 'cust', virt: 'cust', compute: 'cust', storage: 'cust', network: 'cust', facility: 'cust' },
  },
  iaas: {
    label: 'IaaS',
    desc: "Infrastructure as a Service — you get raw compute/storage/networking; you still install and manage the OS upward. Examples: AWS EC2, Azure Virtual Machines, Google Compute Engine.",
    owner: { data: 'cust', apps: 'cust', runtime: 'cust', os: 'cust', virt: 'prov', compute: 'prov', storage: 'prov', network: 'prov', facility: 'prov' },
  },
  paas: {
    label: 'PaaS',
    desc: "Platform as a Service — the provider manages the OS and runtime too; you just deploy code. Examples: AWS Elastic Beanstalk, Azure App Service, Google App Engine, Heroku.",
    owner: { data: 'cust', apps: 'cust', runtime: 'prov', os: 'prov', virt: 'prov', compute: 'prov', storage: 'prov', network: 'prov', facility: 'prov' },
  },
  saas: {
    label: 'SaaS',
    desc: "Software as a Service — a complete application, ready to use. You manage your own data and who has access to it; the provider manages literally everything else. Examples: Microsoft 365, Salesforce, Google Workspace, Webex.",
    owner: { data: 'cust', apps: 'prov', runtime: 'prov', os: 'prov', virt: 'prov', compute: 'prov', storage: 'prov', network: 'prov', facility: 'prov' },
  },
};

function renderCloudResponsibility(modelKey) {
  const model = CLOUD_MODELS[modelKey];
  if (!model) return;

  // highlight the selected button
  document.querySelectorAll('.cloud-model-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.model === modelKey);
  });

  document.getElementById('cloud-model-desc').textContent = model.desc;

  const rows = CLOUD_LAYERS.map(layer => {
    const owner = model.owner[layer.id];
    return `
      <div class="cloud-row">
        <div class="cloud-row-label">${layer.label}</div>
        <div class="cloud-row-bar">
          <div class="cloud-cell ${owner === 'cust' ? 'cloud-cell-you' : 'cloud-cell-off'}">You manage</div>
          <div class="cloud-cell ${owner === 'prov' ? 'cloud-cell-them' : 'cloud-cell-off'}">Provider manages</div>
        </div>
      </div>`;
  }).join('');

  document.getElementById('cloud-responsibility-grid').innerHTML = rows;
}
