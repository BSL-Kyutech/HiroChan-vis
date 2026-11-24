cat << 'EOF' > ~/threejs-project/tactile-calibration.js
const CHANNELS = 24;

const DEFAULTS = () => Array.from({ length: CHANNELS }, (_, i) => ({
  sensor: i + 1, region: '', category: 'unassigned', behavior: 'normal',
  baseline: null, noise: null, min: null, max: null,
  touchThreshold: null, status: 'not_calibrated'
}));

export class TactileCalibration {
  constructor({ regions = [], onSample = null } = {}) {
    // Sort all 40 regions from JSON by their trailing sensor number (1 to 40)
    this.allRegions = [...regions].sort((a, b) => {
      const numA = Number(a.match(/(\d+)\s*$/)?.[1] ?? 999);
      const numB = Number(b.match(/(\d+)\s*$/)?.[1] ?? 999);
      return numA - numB;
    });

    // Sensors 1-20 are Front, Sensors 21-40 are Back
    this.frontRegions = this.allRegions.filter(name => {
      const n = Number(name.match(/(\d+)\s*$/)?.[1] ?? 0);
      return n >= 1 && n <= 20;
    });
    this.backRegions = this.allRegions.filter(name => {
      const n = Number(name.match(/(\d+)\s*$/)?.[1] ?? 0);
      return n >= 21 && n <= 40;
    });

    this.side = 'front'; // 'front' or 'back' breadboard storage
    this.showAll = false;
    this.regions = this.frontRegions;

    this.onSample = onSample;
    this.samples = [];
    this.data = DEFAULTS();
    this.mode = 'idle';
    this.captureStarted = 0;
    this.captureDuration = 5000;
    this.latest = Array(CHANNELS).fill(0);
    this.buildUI();
    this.loadLocal();
    this.render();
  }

  updateRegionList() {
    if (this.showAll) {
      this.regions = this.allRegions;
    } else {
      this.regions = this.side === 'front' ? this.frontRegions : this.backRegions;
    }
  }

  switchSide(side) {
    this.side = side;
    this.updateRegionList();
    this.data = DEFAULTS();
    this.loadLocal();
    this.render();

    const fBtn = this.panel.querySelector('#hc-side-front');
    const bBtn = this.panel.querySelector('#hc-side-back');
    if (fBtn && bBtn) {
      fBtn.style.background = side === 'front' ? '#2b6cb0' : '#202d3a';
      bBtn.style.background = side === 'back' ? '#2b6cb0' : '#202d3a';
    }
    this.status.textContent = `Switched to ${side.toUpperCase()} breadboard (${this.regions.length} regions shown in dropdowns).`;
  }

  toggleShowAll() {
    this.showAll = !this.showAll;
    this.updateRegionList();
    this.render();
    const allBtn = this.panel.querySelector('#hc-show-all');
    if (allBtn) {
      allBtn.style.background = this.showAll ? '#2e7d32' : '#202d3a';
      allBtn.textContent = this.showAll ? 'Showing All 40 (Click to Filter)' : 'Show All 40 Regions';
    }
  }

  buildUI() {
    const style = document.createElement('style');
    style.textContent = `
      #hiro-cal-toggle{position:fixed;right:16px;top:16px;z-index:10020;padding:10px 14px;border:1px solid #456;color:#fff;background:#17324a;border-radius:8px;cursor:pointer;font-weight:700}
      #hiro-cal{position:fixed;z-index:10019;right:12px;top:60px;bottom:12px;width:min(530px,calc(100vw - 24px));display:none;overflow:auto;background:#111923;color:#edf3fa;border:1px solid #3b4b5d;border-radius:12px;padding:14px;box-shadow:0 10px 35px #000a;font:13px system-ui,sans-serif}
      #hiro-cal.open{display:block} #hiro-cal h2{font-size:17px;margin:0 0 8px} #hiro-cal p{color:#aebdca;line-height:1.45}
      #hiro-cal button,#hiro-cal select,#hiro-cal input{font:inherit;border-radius:6px;padding:7px;border:1px solid #526274;background:#202d3a;color:#fff}
      #hiro-cal button{cursor:pointer} #hiro-cal button:disabled{opacity:.45;cursor:not-allowed}
      #hiro-cal .actions{display:flex;flex-wrap:wrap;gap:6px;margin:9px 0} #hiro-cal .status{padding:8px;background:#1d2b38;border-radius:6px;margin:8px 0}
      #hiro-cal .table-wrap{overflow:auto} #hiro-cal table{width:100%;border-collapse:collapse;min-width:470px} #hiro-cal th,#hiro-cal td{padding:6px 4px;border-bottom:1px solid #344352;text-align:left} #hiro-cal td select{max-width:155px;width:100%;padding:5px}
      #hiro-cal .small{font-size:11px;color:#9eacb9} #hiro-cal .danger{background:#512b2b;border-color:#a85b5b}
    `;
    document.head.appendChild(style);
    this.toggle = document.createElement('button');
    this.toggle.id = 'hiro-cal-toggle';
    this.toggle.textContent = 'Tactile Calibration';
    this.panel = document.createElement('section');
    this.panel.id = 'hiro-cal';
    this.panel.innerHTML = `
      <h2>Hiro-chan · Tactile Calibration</h2>
      <div class="actions">
        <button id="hc-side-front" style="background:#2b6cb0;font-weight:700">Front Breadboard (1–20)</button>
        <button id="hc-side-back" style="font-weight:700">Back Breadboard (21–40)</button>
        <button id="hc-show-all">Show All 40 Regions</button>
      </div>
      <div class="status" id="hc-status">Waiting for sensor stream…</div>
      <div class="actions">
        <button id="hc-baseline">Capture baseline (5 s)</button>
        <button id="hc-touch">Record touch min/max</button>
        <button id="hc-stop" class="danger">Stop capture</button>
      </div>
      <div class="actions">
        <button id="hc-save">Download calibration JSON</button>
        <button id="hc-export">Export CSV</button>
        <button id="hc-load">Load JSON</button>
        <input id="hc-file" type="file" accept="application/json,.json" hidden>
      </div>
      <div class="table-wrap"><table><thead><tr><th>Ch.</th><th>Live</th><th>Baseline</th><th>Noise</th><th>Max</th><th>Region (1:1)</th></tr></thead><tbody id="hc-rows"></tbody></table></div>
    `;
    document.body.append(this.toggle, this.panel);
    this.toggle.addEventListener('click', () => this.panel.classList.toggle('open'));
    this.panel.querySelector('#hc-side-front').onclick = () => this.switchSide('front');
    this.panel.querySelector('#hc-side-back').onclick = () => this.switchSide('back');
    this.panel.querySelector('#hc-show-all').onclick = () => this.toggleShowAll();
    this.panel.querySelector('#hc-baseline').onclick = () => this.startCapture('baseline');
    this.panel.querySelector('#hc-touch').onclick = () => this.startCapture('touch');
    this.panel.querySelector('#hc-stop').onclick = () => this.stopCapture();
    this.panel.querySelector('#hc-save').onclick = () => this.downloadJSON();
    this.panel.querySelector('#hc-export').onclick = () => this.downloadCSV();
    this.panel.querySelector('#hc-load').onclick = () => this.panel.querySelector('#hc-file').click();
    this.panel.querySelector('#hc-file').onchange = e => this.readJSON(e.target.files?.[0]);
    this.rows = this.panel.querySelector('#hc-rows');
    this.status = this.panel.querySelector('#hc-status');
  }

  startCapture(mode) {
    this.mode = mode; this.samples = []; this.captureStarted = performance.now();
    this.status.textContent = mode === 'baseline'
      ? 'Capturing baseline for 5 seconds — leave all sensors untouched.'
      : 'Touch capture active — press one physical sensor at a time, then stop.';
  }

  stopCapture() {
    if (this.mode === 'idle') return;
    const mode = this.mode; this.mode = 'idle';
    if (!this.samples.length) { this.status.textContent = 'No samples captured.'; return; }
    if (mode === 'baseline') {
      for (let i = 0; i < CHANNELS; i++) {
        const values = this.samples.map(s => s[i]).filter(Number.isFinite);
        if (!values.length) continue;
        const mean = values.reduce((a,b)=>a+b,0)/values.length;
        const variance = values.reduce((a,b)=>a+(b-mean)**2,0)/values.length;
        this.data[i].baseline = mean;
        this.data[i].noise = Math.sqrt(variance);
        this.data[i].min = Math.min(...values);
        this.data[i].status = 'baseline_captured';
      }
      this.status.textContent = `Baseline captured from ${this.samples.length} samples.`;
    } else {
      for (let i = 0; i < CHANNELS; i++) {
        const values = this.samples.map(s => s[i]).filter(Number.isFinite);
        if (!values.length) continue;
        const peak = Math.max(...values);
        this.data[i].max = this.data[i].max == null ? peak : Math.max(this.data[i].max, peak);
        if (this.data[i].baseline != null) {
          this.data[i].touchThreshold = Math.max(this.data[i].noise || 0, (this.data[i].max - this.data[i].baseline) * 0.15);
        }
        this.data[i].status = this.data[i].baseline == null ? 'touch_only' : 'captured';
      }
      this.status.textContent = `Touch response recorded from ${this.samples.length} samples.`;
    }
    this.persist(); this.render();
  }

  update(values) {
    if (!Array.isArray(values) || values.length < CHANNELS) return;
    this.latest = values.slice(0, CHANNELS).map(Number);
    if (this.mode !== 'idle') {
      this.samples.push(this.latest.slice());
      if (this.mode === 'baseline' && performance.now() - this.captureStarted >= this.captureDuration) this.stopCapture();
    }
    this.renderLiveOnly();
    this.onSample?.(this.latest);
  }

  assign(index, field, value) {
    if (field === 'region' && value) {
      const conflict = this.data.findIndex((row, i) => i !== index && row.region === value);
      if (conflict >= 0) {
        this.status.textContent = `Cannot assign ${value}: already assigned to channel ${conflict + 1}.`;
        this.render(); return;
      }
    }
    this.data[index][field] = value;
    this.persist();
  }

  renderLiveOnly() {
    for (let i = 0; i < CHANNELS; i++) {
      const cell = this.rows.querySelector(`[data-live="${i}"]`);
      if (cell) cell.textContent = Number.isFinite(this.latest[i]) ? this.latest[i].toFixed(5) : '—';
    }
  }

  render() {
    const categories = ['unassigned','head','ears','front_body','back','left_arm','right_arm','left_leg','right_leg','feet'];
    const behaviors = ['normal','high_baseline','noisy','low_sensitivity','faulty_candidate'];
    this.rows.innerHTML = this.data.map((row, i) => {
      // Ensure any already-selected region stays visible in the dropdown even if filtered
      const optionsList = row.region && !this.regions.includes(row.region)
        ? [row.region, ...this.regions]
        : this.regions;

      return `
      <tr>
        <td>${i+1}</td>
        <td data-live="${i}">${Number.isFinite(this.latest[i]) ? this.latest[i].toFixed(5) : '—'}</td>
        <td>${row.baseline == null ? '—' : row.baseline.toFixed(5)}</td>
        <td>${row.noise == null ? '—' : row.noise.toFixed(5)}</td>
        <td>${row.max == null ? '—' : row.max.toFixed(5)}</td>
        <td>
          <select data-region="${i}">
            <option value="">Unassigned</option>
            ${optionsList.map(name => `<option value="${name}" ${row.region === name ? 'selected' : ''}>${name}</option>`).join('')}
          </select>
          <select data-category="${i}">
            ${categories.map(x => `<option value="${x}" ${row.category === x ? 'selected' : ''}>${x}</option>`).join('')}
          </select>
          <select data-behavior="${i}">
            ${behaviors.map(x => `<option value="${x}" ${row.behavior === x ? 'selected' : ''}>${x}</option>`).join('')}
          </select>
        </td>
      </tr>`;
    }).join('');

    for (const select of this.rows.querySelectorAll('select')) {
      const key = ['region','category','behavior'].find(k => select.dataset[k] !== undefined);
      select.addEventListener('change', () => this.assign(Number(select.dataset[key]), key, select.value));
    }
  }

  storageKey() { return `hirochan-tactile-cal-${this.side}-v3`; }
  payload() { return { schemaVersion: 1, side: this.side, createdAt: new Date().toISOString(), channelCount: CHANNELS, mappingRule: 'one_sensor_to_one_region', sensors: this.data }; }
  persist() { try { localStorage.setItem(this.storageKey(), JSON.stringify(this.payload())); } catch (e) {} }
  loadLocal() { try { const d = JSON.parse(localStorage.getItem(this.storageKey())); if (d?.channelCount === CHANNELS && Array.isArray(d.sensors) && d.sensors.length === CHANNELS) this.data = d.sensors; } catch {} }
  downloadJSON() { this.download(`hiro-tactile-calibration-${this.side}.json`, JSON.stringify(this.payload(), null, 2), 'application/json'); }
  downloadCSV() {
    const cols = ['sensor','region','category','behavior','baseline','noise','min','max','touchThreshold','status'];
    const lines = [cols.join(','), ...this.data.map(r => cols.map(k => `"${String(r[k] ?? '').replaceAll('"','""')}"`).join(','))];
    this.download(`hiro-tactile-calibration-${this.side}.csv`, lines.join('\n'), 'text/csv');
  }
  download(name, content, type) { const a = document.createElement('a'); const url = URL.createObjectURL(new Blob([content], {type})); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url); }
  async readJSON(file) {
    if (!file) return;
    try {
      const d = JSON.parse(await file.text());
      if (d.channelCount !== CHANNELS || !Array.isArray(d.sensors) || d.sensors.length !== CHANNELS) throw new Error('Expected 24 sensor records.');
      this.data = d.sensors; this.persist(); this.render(); this.status.textContent = 'Calibration JSON loaded.';
    } catch (e) { this.status.textContent = `Load failed: ${e.message}`; }
  }
}
EOF