const CHANNELS = 24;
const STORAGE_KEY = 'hirochan-tactile-calibration-v1';

const DEFAULTS = () => Array.from({ length: CHANNELS }, (_, i) => ({
  sensor: i + 1, region: '', category: 'unassigned', behavior: 'normal',
  baseline: null, noise: null, min: null, max: null,
  touchThreshold: null, status: 'not_calibrated'
}));

export class TactileCalibration {
  constructor({ regions = [], onSample = null } = {}) {
    this.regions = regions;
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

  buildUI() {
    const style = document.createElement('style');
    style.textContent = `
      #hiro-cal-toggle{position:fixed;right:16px;top:16px;z-index:10020;padding:10px 14px;border:1px solid #456;color:#fff;background:#17324a;border-radius:8px;cursor:pointer;font-weight:700}
      #hiro-cal{position:fixed;z-index:10019;right:12px;top:60px;bottom:12px;width:min(510px,calc(100vw - 24px));display:none;overflow:auto;background:#111923;color:#edf3fa;border:1px solid #3b4b5d;border-radius:12px;padding:14px;box-shadow:0 10px 35px #000a;font:13px system-ui,sans-serif}
      #hiro-cal.open{display:block} #hiro-cal h2{font-size:17px;margin:0 0 8px} #hiro-cal p{color:#aebdca;line-height:1.45}
      #hiro-cal button,#hiro-cal select,#hiro-cal input{font:inherit;border-radius:6px;padding:7px;border:1px solid #526274;background:#202d3a;color:#fff}
      #hiro-cal button{cursor:pointer} #hiro-cal button:disabled{opacity:.45;cursor:not-allowed}
      #hiro-cal .actions{display:flex;flex-wrap:wrap;gap:6px;margin:9px 0} #hiro-cal .status{padding:8px;background:#1d2b38;border-radius:6px;margin:8px 0}
      #hiro-cal .table-wrap{overflow:auto} #hiro-cal table{width:100%;border-collapse:collapse;min-width:470px} #hiro-cal th,#hiro-cal td{padding:6px 4px;border-bottom:1px solid #344352;text-align:left} #hiro-cal td select{max-width:150px;width:100%;padding:5px} #hiro-cal .meter{height:7px;background:#33404d;border-radius:9px;overflow:hidden;min-width:55px} #hiro-cal .meter span{display:block;height:100%;background:#36c78a}
      #hiro-cal .small{font-size:11px;color:#9eacb9} #hiro-cal .danger{background:#512b2b;border-color:#a85b5b}
    `;
    document.head.appendChild(style);
    this.toggle = document.createElement('button');
    this.toggle.id = 'hiro-cal-toggle'; this.toggle.textContent = 'Tactile Calibration';
    this.panel = document.createElement('section'); this.panel.id = 'hiro-cal';
    this.panel.innerHTML = `
      <h2>Hiro-chan · Tactile Calibration</h2>
      <p>24 live channels. Capture baseline with Hiro-chan untouched, then record each sensor's response while pressing it. Region assignments are one-to-one.</p>
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
      <p class="small">Baseline capture: keep the robot in its normal resting pose and do not touch it. Touch capture: press only one physical sensor at a time, then stop. Repeat separately for every sensor. The software does not guess final thresholds.</p>
      <div class="table-wrap"><table><thead><tr><th>Ch.</th><th>Live</th><th>Baseline</th><th>Noise</th><th>Max</th><th>Region (1:1)</th></tr></thead><tbody id="hc-rows"></tbody></table></div>
      <p class="small">Category and behavior are editable in each row. A region can be assigned to only one channel. Save the JSON after calibration; local browser storage is only a convenience backup.</p>
    `;
    document.body.append(this.toggle, this.panel);
    this.toggle.addEventListener('click', () => this.panel.classList.toggle('open'));
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
      : 'Touch capture active — press exactly one physical sensor at a time, then stop.';
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
      this.status.textContent = `Baseline captured from ${this.samples.length} samples. Keep the same resting pose for comparable readings.`;
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
      this.status.textContent = `Touch response recorded from ${this.samples.length} samples. Verify the channel-to-physical-sensor relationship before assigning regions.`;
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
        this.status.textContent = `Cannot assign ${value}: it is already assigned to channel ${conflict + 1}.`;
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
    this.rows.innerHTML = this.data.map((row, i) => `
      <tr><td>${i+1}</td><td data-live="${i}">${Number.isFinite(this.latest[i]) ? this.latest[i].toFixed(5) : '—'}</td>
      <td>${row.baseline == null ? '—' : row.baseline.toFixed(5)}</td><td>${row.noise == null ? '—' : row.noise.toFixed(5)}</td><td>${row.max == null ? '—' : row.max.toFixed(5)}</td>
      <td><select data-region="${i}"><option value="">Unassigned</option>${this.regions.map(name=>`<option value="${this.escape(name)}" ${row.region===name?'selected':''}>${this.escape(name)}</option>`).join('')}</select>
      <select data-category="${i}">${categories.map(x=>`<option ${row.category===x?'selected':''}>${x}</option>`).join('')}</select>
      <select data-behavior="${i}">${behaviors.map(x=>`<option ${row.behavior===x?'selected':''}>${x}</option>`).join('')}</select></td></tr>`).join('');
    for (const select of this.rows.querySelectorAll('select')) {
      const key = ['region','category','behavior'].find(k => select.dataset[k] !== undefined);
      select.addEventListener('change', () => this.assign(Number(select.dataset[key]), key, select.value));
    }
  }

  escape(value) { return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  payload() { return { schemaVersion: 1, createdAt: new Date().toISOString(), channelCount: CHANNELS, mappingRule: 'one_sensor_to_one_region', sensors: this.data }; }
  persist() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.payload())); } catch (e) { console.warn('Could not save calibration locally', e); } }
  loadLocal() { try { const d=JSON.parse(localStorage.getItem(STORAGE_KEY)); if (d?.channelCount===CHANNELS && Array.isArray(d.sensors) && d.sensors.length===CHANNELS) this.data=d.sensors; } catch {} }
  downloadJSON() { this.download('hiro-tactile-calibration.json', JSON.stringify(this.payload(), null, 2), 'application/json'); }
  downloadCSV() {
    const cols=['sensor','region','category','behavior','baseline','noise','min','max','touchThreshold','status'];
    const lines=[cols.join(','),...this.data.map(r=>cols.map(k=>`"${String(r[k] ?? '').replaceAll('"','""')}"`).join(','))];
    this.download('hiro-tactile-calibration.csv', lines.join('\n'), 'text/csv');
  }
  download(name, content, type) { const a=document.createElement('a'); const url=URL.createObjectURL(new Blob([content],{type})); a.href=url; a.download=name; a.click(); URL.revokeObjectURL(url); }
  async readJSON(file) {
    if (!file) return;
    try {
      const d=JSON.parse(await file.text());
      if (d.channelCount!==CHANNELS || !Array.isArray(d.sensors) || d.sensors.length!==CHANNELS) throw new Error('Expected exactly 24 sensor records.');
      const used=d.sensors.map(x=>x.region).filter(Boolean);
      if (new Set(used).size!==used.length) throw new Error('File violates one-sensor-to-one-region assignment.');
      this.data=d.sensors; this.persist(); this.render(); this.status.textContent='Calibration JSON loaded.';
    } catch (e) { this.status.textContent=`Load failed: ${e.message}`; }
  }
}
