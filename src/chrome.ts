import { AIR_RAMP_MAX, AIR_RAMP_MIN, TEMP_RAMP_MAX, TEMP_RAMP_MIN, TEMP_RAMP_TICKS, airRampCss, flowMode, tempRampCss } from './circuit';
import { segmented, setHtml } from './controls';
import type { Field } from './controls';
import { escapeHtml, fmt, html, setText, svg } from './dom';
import { FIXTURES, PREVIEW_BANNER, fixtureFor } from './fixtures';
import type { Fixture, FixtureId } from './fixtures';
import { simulation, branchesFor } from './runtime/view';
import { ICE_START_KG, activeRooms, currentReadings, liveStatus, store } from './state';
import type { Current } from './state';
import { INDOOR_CLASSES } from './types';
import type { AppState, DrawerTab, Experience, ExampleState, SpeedFactor, ZoomPreset } from './types';

export interface Header {
  root: HTMLElement;
  sync(s: AppState): void;
  setTime(sec: number): void;
}

const fmtTime = (sec: number): string => {
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`;
};

/** Shared one-line statements so every surface says the same thing about the live model. */
export const LIVE_BASIS = 'Live · generic R32 · real property backend · performance not manufacturer-calibrated';
/** Shared by the weather card's humidity control and its tooltip. */
export const HUMIDITY_CONVENTION = 'Relative humidity follows CoolProp: saturation over ice below 0 °C, over liquid water above. Convert weather readings that use a different convention.';
export function fieldLinesNote(s: AppState): string {
  return s.cfg.live.fieldLines === 'idealized'
    ? 'Idealized field lines: pipe length, diameter, elevation, line pressure drop and line heat exchange are excluded'
    : 'Physical field lines (advanced, slower): uncalibrated homogeneous pipe-loss approximation with assumed bore, level elevation and outdoor-air exposure; not a prediction of installed line losses; some regimes may be unsupported and fail visibly (see Advanced pipe assumptions)';
}

const SPEED_HELP = 'Requested speed. Live runs are CPU-limited with one worker task in flight, so ×10 or ×50 may not be reached; the Simulation time shows what actually elapsed. ×50 is for reaching steady state quickly.';

/** Compact native select for the header. Built once; refresh() never steals an open or focused control. */
function pick<T extends string | number>(o: {
  label: string;
  options: ReadonlyArray<{ value: T; text: string; title?: string }>;
  get(): T;
  set(v: T): void;
  isDisabled?(v: T): boolean;
}): Field & { sel: HTMLSelectElement } {
  const sel = html('select', { class: 'hd-select', 'aria-label': o.label, title: o.label });
  const opts = o.options.map((op) => html('option', { value: String(op.value), title: op.title }, op.text));
  sel.append(...opts);
  sel.addEventListener('change', () => {
    const op = o.options.find((x) => String(x.value) === sel.value);
    if (op) o.set(op.value);
  });
  return {
    root: sel, sel,
    refresh(): void {
      const cur = String(o.get());
      if (sel.value !== cur) sel.value = cur;
      o.options.forEach((op, i) => {
        const off = o.isDisabled?.(op.value) ?? false;
        const el = opts[i];
        if (el && el.disabled !== off) el.disabled = off;
      });
    },
  };
}

export function createHeader(readings: Ribbon): Header {
  const fields: Field[] = [];
  const experience = pick<Experience>({
    label: 'Source',
    options: [
      { value: 'live', text: 'Live', title: 'Real engine in a worker: generic R32 model, not manufacturer-calibrated' },
      { value: 'examples', text: 'Examples', title: 'Fixed constructed snapshots, not solver output' },
    ],
    get: () => store.state.ui.experience, set: (v) => store.setExperience(v),
  });
  const example = pick<ExampleState>({
    label: 'Example scenario',
    options: [
      { value: 'normal', text: 'Normal' },
      { value: 'frost', text: 'Frosting', title: 'Heating-mode outdoor coil only' },
      { value: 'defrost', text: 'Defrost', title: 'Reverse-cycle defrost, heating mode only' },
      { value: 'idle', text: 'Idle' },
    ],
    get: () => store.state.cfg.example, set: (e) => store.loadExample(store.state.cfg.mode, e),
    isDisabled: (v) => store.state.cfg.mode === 'cooling' && (v === 'frost' || v === 'defrost'),
  });
  const speed = pick<SpeedFactor>({
    label: 'Requested speed',
    options: ([0.5, 1, 2, 5, 10, 50] as SpeedFactor[]).map((v) => ({ value: v, text: `${v}×` })),
    get: () => store.state.ui.speed,
    set: (v) => store.update((s) => { s.ui.speed = Number(v) as SpeedFactor; }),
  });
  fields.push(experience, example, speed);
  const speedHelp = html('span', { class: 'sr-only', id: 'speed-help' }, SPEED_HELP);
  speed.sel.setAttribute('aria-describedby', 'speed-help');
  speed.sel.title = SPEED_HELP;

  const pause = html('button', { type: 'button', class: 'btn hd-pause' }, 'Pause');
  pause.addEventListener('click', () => store.update((s) => { s.ui.paused = !s.ui.paused; }));
  // Reset restarts the simulation from the CURRENT inputs: clocks, ice inventory and room state start over, and the initial room
  // temperatures you set are applied. Edited settings are kept (the factory defaults are not restored).
  const resetHelp = 'Restart the simulation from the current inputs: clock, ice and room state start over; your edited settings and initial room temperatures are kept and applied.';
  const reset = html('button', { type: 'button', class: 'btn ghost hd-reset', 'aria-label': 'Reset simulation', title: resetHelp }, 'Reset');
  reset.addEventListener('click', () => store.restartSimulation());
  const time = html('output', { class: 'time', 'aria-label': 'Simulation time' }, '00:00.0');

  // Headline readings: label above value, fixed-width cells so the header does not reflow as numbers change.
  const metric = (unit: string | null): { root: HTMLElement; k: HTMLElement; v: HTMLElement } => {
    const k = html('span', { class: 'k' }, '');
    const v = html('b', { class: 'v' }, '—');
    const root = html('div', { class: 'hm' }, k, html('span', { class: 'vl' }, v, ...(unit ? [html('i', {}, unit)] : [])));
    return { root, k, v };
  };
  const mCop = metric(null);
  const mHeat = metric('kW');
  const mElec = metric('kW');
  mElec.k.textContent = 'Electrical input';
  const metrics = html('div', { class: 'hd-metrics', role: 'group', 'aria-label': 'Headline readings' }, mCop.root, mHeat.root, mElec.root);

  // Status cell: persistent badge plus one ellipsised line; full detail on hover and in Readings.
  const opState = html('output', { class: 'opstate', role: 'status', 'data-kind': 'loading' }, 'Loading');
  const exTag = html('span', { class: 'hd-ex' }, 'Examples · fixed');
  const note = html('span', { class: 'hd-note' }, '');
  const status = html('div', { class: 'hd-status' }, html('div', { class: 'hd-badges' }, opState, exTag), note);

  const rdBtn = html('button', { type: 'button', class: 'btn ghost hd-readings', 'aria-expanded': 'false', 'aria-controls': 'readings-pop' }, 'Readings');
  readings.root.id = 'readings-pop';
  // Source and scenario live one click away in the popover, above the readings; built once, native selects.
  const labelled = (text: string, f: Field & { sel: HTMLSelectElement }): HTMLElement =>
    html('label', { class: 'rb-pick' }, html('span', {}, text), f.sel);
  const examplePick = labelled('Example scenario', example);
  readings.root.prepend(html('div', { class: 'rb-source' }, labelled('Source', experience), examplePick));
  readings.root.hidden = true;
  const setPop = (open: boolean): void => {
    readings.root.hidden = !open;
    rdBtn.setAttribute('aria-expanded', String(open));
    // The embedded diagnostics are rendered only while this popover is open; refresh them now.
    if (open) store.emit();
  };
  rdBtn.addEventListener('click', () => setPop(readings.root.hidden === true));
  document.addEventListener('click', (e) => {
    if (!readings.root.hidden && !root.contains(e.target as Node)) setPop(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || readings.root.hidden) return;
    e.stopPropagation();
    setPop(false);
    rdBtn.focus();
  });

  const root = html('header', { class: 'topbar' },
    html('div', { class: 'brand' }, html('span', { class: 'mark', 'aria-hidden': 'true' }), html('b', {}, 'Heatpump Simulator 2026')),
    html('div', { class: 'hd-group' }, pause, speed.root, time, speedHelp),
    html('div', { class: 'spacer' }),
    metrics, status,
    html('div', { class: 'hd-group' }, rdBtn, reset),
    readings.root);

  return {
    root,
    sync(s: AppState): void {
      const live = s.ui.experience === 'live';
      for (const f of fields) f.refresh();
      setText(pause, s.ui.paused ? 'Resume' : 'Pause');
      pause.setAttribute('aria-pressed', String(s.ui.paused));
      examplePick.hidden = live;
      opState.hidden = !live;
      exTag.hidden = live;
      const scenario = example.sel.selectedOptions[0]?.textContent ?? '';
      setText(exTag, scenario ? `Examples · ${scenario}` : 'Examples');
      time.title = live ? 'Simulation time' : 'Preview time';
      time.setAttribute('aria-label', live ? 'Simulation time' : 'Preview time');

      const rd = currentReadings(s);
      setText(mCop.k, rd.copLabel);
      setText(mHeat.k, rd.roomKwLabel);
      setText(mCop.v, rd.cop === null ? '—' : fmt(rd.cop, 2));
      setText(mHeat.v, rd.roomKwTotal === null ? '—' : fmt(rd.roomKwTotal, 2));
      setText(mElec.v, rd.electricalKw === null ? '—' : fmt(rd.electricalKw, 2));
      mCop.root.title = rd.copLabel;
      mHeat.root.title = rd.roomKwLabel;
      mElec.root.title = 'Electrical input';

      const warnings = rd.live?.warnings.length ?? 0;
      setText(rdBtn, warnings ? `Readings ⚠ ${warnings}` : 'Readings');
      rdBtn.setAttribute('aria-label', warnings ? `Readings, ${warnings} warning${warnings > 1 ? 's' : ''}` : 'Readings');

      if (!live) {
        metrics.dataset.held = '0';
        pause.classList.remove('attn');
        note.dataset.tone = 'warn';
        setText(note, 'Fixed illustrative readings');
        status.title = PREVIEW_BANNER;
        return;
      }
      const st = rd.live!;
      const held = st.kind === 'updating';
      metrics.dataset.held = held ? '1' : '0';
      pause.classList.toggle('attn', held && s.ui.paused);
      setText(opState, held ? 'Last calculated step' : st.label);
      opState.dataset.kind = st.kind;
      if (!st.usable) {
        note.dataset.tone = 'bad';
        setText(note, 'Readings withheld');
        status.title = `${st.label}: ${st.detail ?? ''} Readings withheld.`;
      } else if (held) {
        note.dataset.tone = 'info';
        setText(note, s.ui.paused ? 'Resume to recalculate' : 'Awaiting calculation');
        status.title = `${st.detail ?? ''}\n${LIVE_BASIS}`;
      } else {
        note.dataset.tone = 'warn';
        setText(note, 'Generic R32 · uncalibrated');
        status.title = `${LIVE_BASIS}\n${fieldLinesNote(s)}`;
      }
    },
    setTime(sec: number): void { setText(time, fmtTime(sec)); },
  };
}

// ---------- readings popover (the full ribbon) ----------
export interface Ribbon { root: HTMLElement; sync(s: AppState): void }

export function createRibbon(): Ribbon {
  const cells: Record<string, { root: HTMLElement; k: HTMLElement; v: HTMLElement }> = {};
  const cell = (key: string, label: string): HTMLElement => {
    const k = html('span', { class: 'k' }, label);
    const v = html('b', { class: 'v' }, '—');
    const root = html('div', { class: 'cell' }, k, v);
    cells[key] = { root, k, v };
    return root;
  };
  const strip = html('div', { class: 'rb-status', role: 'status' });
  const root = html('div', { class: 'ribbon', role: 'group', 'aria-label': 'Readings' },
    html('div', { class: 'rb-cells' },
      cell('outair', 'Outdoor air'), cell('room', 'Room air'),
      cell('heat', 'Room heat'), cell('elec', 'Electrical input'), cell('cop', 'COP'),
      cell('plo', 'Low pressure'), cell('phi', 'High pressure'),
      cell('indoor', 'Indoor supply air'), cell('outdoor', 'Outdoor air outlet')),
    strip);
  const put = (key: string, label: string, value: string): void => {
    const c = cells[key];
    if (!c) return;
    setText(c.k, label);
    if (c.v.innerHTML !== value) c.v.innerHTML = value;
  };
  return {
    root,
    sync(s: AppState): void {
      const live = s.ui.experience === 'live';
      const rd = currentReadings(s);
      const p = (v: number | null | undefined): string => {
        if (v === null || v === undefined) return '—';
        return s.ui.pressure === 'abs' ? `${fmt(v, 2)}<i>bar(a)</i>` : `${fmt(v - 1.01325, 2)}<i>bar(g)</i>`;
      };
      // Live: only units whose own fan runs contribute a supply temperature (a closed or switched-off branch blows nothing).
      const outlets = branchesFor(rd, activeRooms(s.cfg))
        .filter((b) => !live || b.fanKw > 0).map((b) => b.outletC).filter((x): x is number => x !== null);
      put('outair', live ? 'Outdoor air · drives model' : 'Outdoor air · configured', `${fmt(s.cfg.outdoorC, 1)}<i>°C</i> · ${Math.round(s.cfg.outdoorRh)}<i>% RH</i>`);
      cells['room']!.root.hidden = !live;
      const temps = rd.engine?.rooms.slice(0, s.cfg.unitCount).map((r) => r.temperatureC) ?? [];
      put('room', 'Room air · actual', temps.length ? `${fmt(Math.min(...temps), 1)}${Math.max(...temps) - Math.min(...temps) >= 0.05 ? `–${fmt(Math.max(...temps), 1)}` : ''}<i>°C</i>` : '—');
      put('heat', rd.roomKwLabel, rd.roomKwTotal === null ? '—' : `${fmt(rd.roomKwTotal, 2)}<i>kW</i>`);
      put('elec', 'Electrical input', rd.electricalKw === null ? '—' : `${fmt(rd.electricalKw, 2)}<i>kW</i>`);
      put('cop', rd.copLabel, rd.cop === null ? '—' : fmt(rd.cop, 2));
      put('plo', 'Low pressure', p(rd.cycle?.pLowBarA));
      put('phi', 'High pressure', p(rd.cycle?.pHighBarA));
      put('indoor', 'Indoor supply air', outlets.length && rd.indoorFansOn ? `${fmt(Math.min(...outlets), 1)}–${fmt(Math.max(...outlets), 1)}<i>°C</i>` : '—');
      put('outdoor', 'Outdoor air outlet', rd.outdoorOutletC === null ? '—' : `${fmt(rd.outdoorOutletC, 1)}<i>°C</i>`);

      if (!live) {
        setHtml(strip, `<span class="rb-banner"><span class="dot" aria-hidden="true"></span>${escapeHtml(PREVIEW_BANNER)}</span>`);
        return;
      }
      const st = rd.live!;
      const parts = [
        `<span class="pill" data-kind="${st.kind}">${escapeHtml(st.kind === 'updating' ? 'Last calculated step' : st.label)}</span>`,
        `<span class="rb-t">${escapeHtml(LIVE_BASIS)}</span>`,
        `<span class="rb-t rb-note">${escapeHtml(fieldLinesNote(s))}</span>`,
      ];
      if (st.calculationMs !== null) parts.push(`<span class="rb-t rb-dim">${fmt(st.calculationMs, 1)} ms / step</span>`);
      if (st.kind === 'fault' || (st.kind === 'loading' && st.detail)) {
        parts.push(`<span class="rb-fault"><b>${st.kind === 'fault' ? 'Fault' : 'Unavailable'}:</b> ${escapeHtml(st.detail ?? '')} Readings withheld.</span>`);
      } else if (st.usable && st.detail) {
        // Soft input edit: previous completed step stays displayed and tagged until the next physical step lands.
        parts.push(`<span class="rb-upd"><b>Last calculated step:</b> ${escapeHtml(st.detail)}</span>`);
      }
      st.warnings.forEach((w) => parts.push(`<span class="rb-warn">⚠ ${escapeHtml(w)}</span>`));
      setHtml(strip, parts.join(''));
    },
  };
}

// ---------- scene overlay: one slim row (notices left, view presets right), legend below ----------
export interface Overlay { root: HTMLElement; sync(s: AppState): void; tick(): void }

export function createOverlay(zoomTo: (z: ZoomPreset) => void): Overlay {
  const zoomSeg = segmented<ZoomPreset>({
    label: 'View',
    compact: true,
    options: [{ value: 'overview', text: 'Overview' }, { value: 'outdoor', text: 'Outdoor' }, { value: 'rooms', text: 'Rooms' }],
    get: () => store.state.ui.zoom,
    set: (z) => store.update((s) => { s.ui.zoom = z; }),
  });
  void zoomTo;
  const iceHead = html('span', { class: 'ice-head' });
  const ice = html('div', { class: 'chip-ice', role: 'status' }, iceHead);
  const iceNote = html('p', { class: 'ice-note' });
  const mismatchText = html('span', { class: 'mm-text' });
  const mismatch = html('div', { class: 'mismatch', role: 'status' }, mismatchText);
  const mismatchDetail = html('p', { class: 'mm-detail' });
  const moreBtn = html('button', { type: 'button', class: 'ov-more', 'aria-expanded': 'false', 'aria-controls': 'ov-detail' }, 'Details') as HTMLButtonElement;
  const detail = html('div', { class: 'ov-detail', id: 'ov-detail' }, mismatchDetail, iceNote);
  detail.hidden = true;
  moreBtn.addEventListener('click', () => {
    detail.hidden = !detail.hidden;
    moreBtn.setAttribute('aria-expanded', String(!detail.hidden));
  });
  // Phase samples reuse the tube's own mark classes over a neutral-to-warm backdrop, so the legend cannot drift from the scene.
  const phaseSample = (phase: 'vapor' | 'liquid' | 'two', label: string): HTMLElement => {
    const mark = svg('path', { class: 'p-mk', d: 'M4 5H34', 'stroke-width': 1.3 });
    const back = svg('path', { class: 'p-mkd', d: 'M4 5H34', 'stroke-width': 2.1 });
    const g = svg('g', { class: 'pipe', 'data-phase': phase }, back, mark);
    const tube = html('span', { class: 'lg-tube' }, svg('svg', { viewBox: '0 0 38 10', width: 38, height: 10, 'aria-hidden': 'true' }, g));
    tube.style.background = tempRampCss();
    return html('li', {}, tube, label);
  };
  // Refrigerant scale: a wide ramp with a tick and label at every colour stop, a bracket for the common region and one for the
  // hot-vapour tail. Air has its own short, separate ramp. Both are fixed; neither rescales to the current data.
  const span = TEMP_RAMP_MAX - TEMP_RAMP_MIN;
  const at = (t: number): string => `${(((t - TEMP_RAMP_MIN) / span) * 100).toFixed(2)}%`;
  const ramp = html('i', { class: 'ramp' });
  ramp.style.background = tempRampCss();
  const ticks = html('span', { class: 'lg-ticks' },
    ...TEMP_RAMP_TICKS.map((t) => {
      const e = html('span', { class: 'lg-tick' }, String(t).replace('-', '−'));
      e.style.left = at(t);
      return e;
    }));
  const bracket = (from: number, to: number, cls: string, text: string): HTMLElement => {
    const e = html('span', { class: `lg-span ${cls}` }, text);
    e.style.left = at(from);
    e.style.width = `${(((to - from) / span) * 100).toFixed(2)}%`;
    return e;
  };
  const scale = html('div', { class: 'lg-scale' }, ramp, ticks,
    html('span', { class: 'lg-spans' }, bracket(-20, 65, 'common', 'common −20…65'), bracket(105, TEMP_RAMP_MAX, 'hot', 'hot vapour')));
  const airRamp = html('i', { class: 'ramp air' });
  airRamp.style.background = airRampCss();
  const neutral = (cls: string, label: string): HTMLElement => html('li', {}, html('i', { class: `sw ${cls}` }), label);
  const legendNote = html('p', {}, '');
  legendNote.hidden = true;
  legendNote.id = 'legend-details';
  const detailsBtn = html('button', { type: 'button', class: 'lg-more', 'aria-expanded': 'false', 'aria-controls': 'legend-details' }, 'Details') as HTMLButtonElement;
  detailsBtn.addEventListener('click', () => {
    legendNote.hidden = !legendNote.hidden;
    detailsBtn.setAttribute('aria-expanded', String(!legendNote.hidden));
  });
  const legend = html('div', { class: 'legend', role: 'group', 'aria-label': 'Temperature and phase legend' },
    html('div', { class: 'lg-row' },
      html('div', { class: 'lg-col lg-main' }, html('span', { class: 'lg-h' }, 'Refrigerant °C'), scale),
      html('div', { class: 'lg-col lg-side' },
        html('div', { class: 'lg-stack' }, html('span', { class: 'lg-h' }, 'Marks = phase'),
          html('ul', {}, phaseSample('vapor', 'vapor: dots'), phaseSample('liquid', 'liquid: dashes'), phaseSample('two', 'two-phase: dash-dot'))),
        html('div', { class: 'lg-stack' }, html('span', { class: 'lg-h' }, 'Tube states'),
          html('ul', {}, neutral('unknown', 'unknown'), neutral('idle', 'no flow'))),
        html('div', { class: 'lg-stack' }, html('span', { class: 'lg-h' }, 'Air °C (room fills)'),
          html('span', { class: 'lg-ramp' }, html('span', {}, String(AIR_RAMP_MIN).replace('-', '−')), airRamp, html('span', {}, String(AIR_RAMP_MAX))))),
      detailsBtn),
    html('p', { class: 'lg-sentence' }, `Pipe colour and probe swatches use this fixed scale and saturate beyond ${String(TEMP_RAMP_MIN).replace('-', '−')} / ${TEMP_RAMP_MAX} °C; probe numbers stay exact. 105 °C and above is hot discharge vapour, not a liquid temperature. Heat can be absorbed at constant temperature during evaporation (ΔT = 0 is valid).`),
    legendNote);
  const root = html('div', { class: 'overlay' },
    html('div', { class: 'ov-top' }, mismatch, ice, moreBtn, html('span', { class: 'spacer' }), zoomSeg.root, detail),
    legend);
  return {
    root,
    sync(s: AppState): void {
      zoomSeg.refresh();
      root.dataset.zoom = s.ui.zoom;
      if (s.ui.experience === 'live') {
        setText(legendNote, 'The tube interior colour is the reported temperature. Thin white marks over it show phase and drift in the flow direction; they never replace the colour. Hatched = fluid flows but no temperature is reported (e.g. mid-coil passes); solid grey = no flow (idle, closed or switched-off branch, or readings withheld). Arrows show flow direction. Pills on the pipes are refrigerant probes (IN/OUT at each coil, D/S at the compressor): exact computed values rounded to 0.1 °C, a dash while no cycle or branch circulates. ΔT is OUT − IN; coil heat is the refrigerant\'s, not the room\'s net kW. Live engine: outdoor air, setpoints, heat-loss coefficients, ηis and generic parameters drive the model; initial room temperature applies on Reset.');
        mismatch.hidden = true;
        mismatch.classList.remove('diff');
        mismatchDetail.hidden = true;
        return;
      }
      setText(legendNote, 'The tube interior colour is the illustrative fixture temperature. Thin white marks over it show phase (dots vapor, dashes liquid, dash-dot two-phase) and drift in the flow direction. Hatched = no temperature in the fixture (e.g. mid-coil passes); solid grey = no flow. Arrows show flow direction. Probe pills show the fixture\'s illustrative common-cycle endpoints (not per-branch solver states); no per-branch coil heat exists in a fixture.');
      const fx = fixtureFor(s.cfg.mode, s.cfg.example);
      const diffs: string[] = [];
      if (s.cfg.outdoorC !== fx.conditions.outdoorC || s.cfg.outdoorRh !== fx.conditions.outdoorRh) diffs.push('outdoor air');
      if (s.cfg.etaIsPct !== 70) diffs.push('ηis');
      if (s.cfg.rooms.slice(0, s.cfg.unitCount).some((r) => r.airC !== fx.conditions.roomC || r.setpointC !== fx.conditions.setpointC)) diffs.push('room temperatures');
      if (s.cfg.unitCount !== 3) diffs.push('unit count (totals reallocated)');
      const offRequested = s.cfg.rooms.slice(0, s.cfg.unitCount).some((r) => !r.enabled);
      if (offRequested) diffs.push('indoor units requested off (branch flow in the snapshot is not recalculated)');
      const fixtureClasses = [2.5, 3.5, 2.5];
      if (s.cfg.rooms.slice(0, Math.min(s.cfg.unitCount, 3)).some((r, i) => INDOOR_CLASSES[r.indoorClass].nominalKw !== fixtureClasses[i])) diffs.push('indoor capacity classes (2.5/3.5/2.5 in fixture)');
      if (s.cfg.outdoorKind === 'generic') diffs.push('generic outdoor unit (fixture is the owner-declared one)');
      const frostNote = s.cfg.mode === 'heating' && s.cfg.example === 'frost'
        ? ' Frosting COP 3.62 vs normal 3.57 comes from unrelated, freely chosen flows and fans — not evidence that frost improves performance.'
        : '';
      mismatch.hidden = false;
      const tail = offRequested ? ' · Off requests do not recompute flow' : diffs.length ? ' · inputs differ, not recomputed' : '';
      setHtml(mismatchText, `<b>Examples: fixed illustrative readings</b>${escapeHtml(tail)}`);
      setText(mismatchDetail, (diffs.length
        ? `Examples: fixed illustrative snapshot readings. Differs from fixture: ${diffs.join(', ')}; readings are not recomputed.`
        : 'Examples: fixed illustrative snapshot readings. Fixture conditions match; other inputs only edit configuration.') + frostNote);
      mismatchDetail.hidden = false;
      mismatch.classList.toggle('diff', diffs.length > 0);
    },
    tick(): void {
      const { cfg, ui } = store.state;
      let hasNote: boolean;
      if (ui.experience === 'live') {
        const st = liveStatus(cfg);
        const out = st.usable ? simulation.status.output : null;
        const held = out ? null : simulation.inventory;
        // Mass values come from the engine's own film state; the preview ledger is not involved.
        // A held inventory is the last accepted film state, not a reading of the current input.
        const film = out?.outdoor ?? held?.outdoor ?? null;
        setText(iceHead, film
          ? `${held ? 'Held ' : ''}Ice ${fmt(film.iceKg, 3)} kg · film ${fmt(film.liquidKg, 3)} kg`
          : 'Ice — · film —');
        ice.dataset.held = held ? '1' : '0';
        setText(iceNote, held ? `Held: last accepted outdoor ice state at simulated ${fmtTime(held.simulatedSeconds)}. Current input: ${st.label.toLowerCase()}; no melting is animated.` : '');
        hasNote = !!held;
      } else {
        const c = store.clock;
        ice.dataset.held = '0';
        const fm = flowMode(cfg.mode, cfg.example);
        setText(iceHead, `Scene ice ${fmt(c.iceKg, 3)} kg · retained ${fmt(c.retainedWaterKg, 3)} kg`);
        const notes: string[] = [];
        if (c.seeded) notes.push(`Started from an arbitrary ${ICE_START_KG.toFixed(2)} kg example ice load.`);
        if (fm === 'defrost' && c.iceKg <= 0) notes.push('Ice exhausted: melt and drips stopped. Snapshot readings do not change; this is not a predicted defrost duration.');
        const framed = cfg.mode === 'heating' && (cfg.example === 'frost' || cfg.example === 'defrost');
        if ((c.iceKg > 0 || c.retainedWaterKg > 0) && !framed) notes.push('Retained mass carried through a synthetic snapshot transition; no thaw, drainage or refreezing is modelled.');
        setText(iceNote, notes.join(' '));
        hasNote = notes.length > 0;
      }
      iceNote.hidden = !hasNote;
      const anyDetail = ui.experience === 'examples' || hasNote;
      moreBtn.hidden = !anyDetail;
      if (!anyDetail && !detail.hidden) {
        detail.hidden = true;
        moreBtn.setAttribute('aria-expanded', 'false');
      }
    },
  };
}

// ---------- drawer ----------
export interface Drawer { root: HTMLElement; sync(s: AppState): void }

const PROVENANCE: ReadonlyArray<[string, string, string]> = [
  ['Live engine', 'Generic R32, real refrigerant and humid-air property backend', 'Coil conductances, air flows, compressor displacement and speed are generic assumptions; not manufacturer-calibrated'],
  ['Field lines', 'Idealized in the reference mode', 'Pipe length and diameter do not reach the engine; no line pressure drop or heat exchange'],
  ['Outdoor unit', 'Daikin 3MXM52N8', 'declared by owner · suffix and nameplate unknown'],
  ['Indoor units', 'FTXA25 · FTXA35 · FTXA25', 'owner-reported; complete suffixes unknown'],
  ['Model references', 'Casing and label selection only', 'They never change live performance'],
  ['Branch lengths', '7.5 (ground) / 6.5 (first) / 14 m (attic)', 'historical owner blog; as-built survey unknown'],
  ['Elevation sum', '15.05 m reported', 'not the manufacturer criterion; do not allocate or pass/fail'],
  ['Casing proportions', 'Both casings drawn to one scale from catalogue family data', 'Daikin Central Europe 2019–20; not tape measurements; dimensions are not annotated'],
  ['Refrigerant', 'R32, factory charge 1.80 kg', 'catalogue family; installed nameplate unchecked'],
  ['Line sizes', '6.35 / 9.5 mm', 'catalogue family; as-built unknown'],
  ['Internal circuit', 'generic explanatory', 'N8 circuit schematic not opened; do not read as Daikin layout'],
  ['Stop valves', 'common gas stop (p) and liquid stop (q), static open', 'N2-family manual legend, printed page 31; N8 positions unknown'],
  ['Pipe guidance', '3–25 m per branch, ≤ 50 m total', 'family guidance (2019, N2 variant); not verified N8 installation compliance; heights unknown'],
  ['Examples', 'constructed R32 snapshots', 'EOS-derived states, freely chosen flows and fans; no manufacturer map'],
];

const kwh = (j: number): string => fmt(j / 3.6e6, 4);

export function createDrawer(): Drawer {
  const tabs: ReadonlyArray<{ id: DrawerTab; label: string }> = [
    { id: 'diagnostics', label: 'Diagnostics' }, { id: 'fixtures', label: 'Examples' }, { id: 'provenance', label: 'Provenance' },
  ];
  const toggle = html('button', { type: 'button', class: 'drawer-toggle', 'aria-expanded': 'false', 'aria-controls': 'drawer-body' }, 'Diagnostics, examples and provenance');
  toggle.addEventListener('click', () => store.update((s) => { s.ui.drawerOpen = !s.ui.drawerOpen; }));
  const tabBtns = tabs.map((t) => {
    const b = html('button', { type: 'button', class: 'tab small', role: 'tab' }, t.label);
    b.addEventListener('click', () => store.update((s) => { s.ui.drawerTab = t.id; s.ui.drawerOpen = true; }));
    return b;
  });
  const bodyEl = html('div', { class: 'drawer-body', id: 'drawer-body' });
  // A disclosure at the end of the Readings popover, not a permanent bar: it reserves no row of the application grid.
  const root = html('section', { class: 'drawer diag', 'aria-label': 'Diagnostics, examples and provenance' },
    html('div', { class: 'drawer-bar' }, toggle, html('div', { class: 'tabs', role: 'tablist' }, ...tabBtns)),
    bodyEl);
  bodyEl.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-fixture]');
    if (!b) return;
    const f = FIXTURES[b.dataset.fixture as FixtureId];
    if (f) store.loadExample(f.mode, f.example);
  });

  const check = (label: string, resid: number | null, tol = 0.0006): string =>
    resid === null ? `<tr><td>${label}</td><td>—</td><td>not applicable</td></tr>`
      : `<tr><td>${label}</td><td>${fmt(resid, 4)} kW</td><td class="${Math.abs(resid) <= tol ? 'ok' : 'bad'}">${Math.abs(resid) <= tol ? 'closes' : 'does not close'}</td></tr>`;

  const ledgerRows = (rows: Fixture['ledger']): string => rows.map((r) => `<tr><td>${escapeHtml(r.label)}</td><td class="n">${r.value === null ? '—' : fmt(r.value, r.digits)} <i>${escapeHtml(r.unit)}</i></td><td>${escapeHtml(r.note ?? '')}</td></tr>`).join('');

  function fixtureDiagnostics(s: AppState, rd: Current): string {
    const br = branchesFor(rd, activeRooms(s.cfg));
    const sum = br.reduce((a, b) => a + b.roomKw, 0);
    const fanSum = br.reduce((a, b) => a + b.fanKw, 0);
    const work = rd.qCondKw !== null && rd.qEvapKw !== null && rd.pRefKw !== null ? rd.qCondKw - rd.qEvapKw - rd.pRefKw : null;
    const branchResid = rd.roomKwTotal === null ? null : sum - rd.roomKwTotal;
    const elec = rd.pRefKw !== null && rd.driveLossKw !== null ? rd.pRefKw + rd.driveLossKw + fanSum + rd.outdoorFanKw + rd.controlsKw - rd.pElecKw : null;
    return `<div class="cols">
      <div><h4>Ledger · ${escapeHtml(rd.title)}</h4><table class="tbl"><tbody>${ledgerRows(rd.ledger)}</tbody></table></div>
      <div><h4>Closure checks (arithmetic on fixture values)</h4>
        <table class="tbl"><tbody>
          ${check('Qcond − Qevap − refrigerant work', work)}
          ${check('Σ branch heat − system total', branchResid)}
          ${check('Σ electrical parts − total input', elec)}
        </tbody></table>
        <h4>Not established</h4>
        <ul class="plain"><li>Heat-exchanger UA and coil surface: —</li><li>EEV opening and manufacturer control: —</li><li>Calibration against measurements: unknown</li></ul>
        ${rd.notes.map((n) => `<p class="muted">${escapeHtml(n)}</p>`).join('')}
      </div></div>`;
  }

  function liveDiagnostics(s: AppState, rd: Current): string {
    const st = rd.live!;
    const e = rd.engine;
    const warnings = st.warnings.map((w) => `<li class="bad-t">${escapeHtml(w)}</li>`).join('');
    const notEstablished = `<h4>Not established</h4><ul class="plain"><li>Calibration against measurements: unknown</li><li>${escapeHtml(fieldLinesNote(s))}</li><li>EEV opening and manufacturer control: —</li></ul>`;
    if (!rd.usable || !e) {
      return `<div class="cols"><div><h4>Engine · ${escapeHtml(st.label)}</h4><p class="bad-t">${escapeHtml(st.detail ?? 'Unavailable.')}</p>
        <p class="muted">Readings are withheld rather than shown stale. Idle and unknown quantities are unavailable, not zero.</p>
        ${warnings ? `<ul class="plain">${warnings}</ul>` : ''}</div><div>${notEstablished}</div></div>`;
    }
    const en = e.energy;
    const roomRows = e.rooms.slice(0, s.cfg.unitCount).map((r, i) => `<tr><td>${escapeHtml(s.cfg.rooms[i]?.name ?? r.id)}</td>
      <td class="n">${fmt(r.temperatureC, 2)}</td><td class="n">${fmt(r.relativeHumidity * 100, 1)}</td><td class="n">${fmt(r.humidityRatio * 1000, 2)}</td>
      <td class="n">${fmt(r.metalTemperatureC, 1)}</td><td class="n">${fmt(r.fabricTemperatureC, 1)}</td><td class="n">${fmt(r.massFlowKgs, 3)}</td><td class="n">${fmt(r.condensateKgs * 3.6e6, 1)}</td></tr>`).join('');
    const acct: Array<[string, string]> = [
      ['Electricity in', `${kwh(en.electricityJ)} kWh`], ['Signed room heat', `${kwh(en.signedRoomHeatJ)} kWh`],
      ['Outdoor exchange', `${kwh(en.outdoorExchangeJ)} kWh`], ['Drainage enthalpy', `${kwh(en.drainageJ)} kWh`],
      ['Boundary energy', `${kwh(en.boundaryEnergyJ)} kWh`], ['Stored energy change', `${kwh(en.storedEnergyChangeJ)} kWh`],
      ['Whole-system residual', `${fmt(en.residualJ, 3)} J`], ['Water residual', `${fmt(en.waterResidualKg, 8)} kg`],
      ['Shared-pressure closure', `${fmt(e.diagnostics.algebraicResidualW, 3)} W`],
      ...(e.cycle ? [['Cycle closure residual', `${fmt(e.cycle.closureResidualW, 3)} W`], ['Refrigerant mass residual', `${fmt(e.cycle.massResidualKgs, 8)} kg/s`], ['Solver iterations', String(e.cycle.iterations)]] as Array<[string, string]> : []),
      ['Compressor speed', `${fmt(e.diagnostics.speedRps, 1)} rps`], ['Simulated time', `${fmt(e.simulatedSeconds, 1)} s`],
      ['Last step CPU', st.calculationMs === null ? '—' : `${fmt(st.calculationMs, 2)} ms`],
    ];
    return `<div class="cols">
      <div><h4>Ledger · Live engine · ${escapeHtml(st.label)}</h4><table class="tbl"><tbody>${ledgerRows(rd.ledger)}</tbody></table>
        <h4>Rooms (engine state)</h4>
        <table class="tbl"><thead><tr><th>Room</th><th>T °C</th><th>RH %</th><th>w g/kg</th><th>Metal °C</th><th>Fabric °C</th><th>Refrigerant kg/s</th><th>Cond. g/h</th></tr></thead><tbody>${roomRows}</tbody></table></div>
      <div><h4>Accounting and closure (reported by the engine; no pass/fail threshold applied here)</h4>
        <table class="tbl"><tbody>${acct.map(([k, v]) => `<tr><td>${k}</td><td class="n">${v}</td></tr>`).join('')}</tbody></table>
        ${warnings ? `<h4>Warnings</h4><ul class="plain">${warnings}</ul>` : ''}
        ${notEstablished}
        ${rd.notes.map((n) => `<p class="muted">${escapeHtml(n)}</p>`).join('')}
      </div></div>`;
  }

  function examplesList(s: AppState): string {
    const cur = s.ui.experience === 'examples' ? fixtureFor(s.cfg.mode, s.cfg.example).id : null;
    return `<div class="fix-grid">${(Object.values(FIXTURES) as Fixture[]).map((f) => `
      <button type="button" class="fix${f.id === cur ? ' on' : ''}" data-fixture="${f.id}" aria-pressed="${f.id === cur}">
        <b>${escapeHtml(f.title)}</b><span>${escapeHtml(f.summary)}</span>
        <em>${f.conditions.outdoorC} °C / ${f.conditions.outdoorRh} % RH outdoor · rooms ${f.conditions.roomC} °C</em>
      </button>`).join('')}</div>
      <p class="muted">Selecting an example switches to the Examples experience and loads its conditions into the configuration. Examples never interpolate: this is not a solver.</p>`;
  }

  function provenance(): string {
    return `<table class="tbl prov"><thead><tr><th>Item</th><th>Value</th><th>Status</th></tr></thead><tbody>${PROVENANCE.map(([a, b, c]) => `<tr><td>${escapeHtml(a)}</td><td>${escapeHtml(b)}</td><td>${escapeHtml(c)}</td></tr>`).join('')}</tbody></table>
      <p class="muted">Sources: owner article “Sizing of my heat pump (Daikin 3MXM52)”; Daikin Central Europe 2019–20 split catalogue; Daikin 3MXM-N installer reference guide (2019, family-level). Details in research/owner-installation.md.</p>`;
  }

  return {
    root,
    sync(s: AppState): void {
      const open = s.ui.drawerOpen;
      const live = s.ui.experience === 'live';
      root.classList.toggle('open', open);
      toggle.setAttribute('aria-expanded', String(open));
      tabs.forEach((t, i) => {
        tabBtns[i]?.setAttribute('aria-selected', String(s.ui.drawerTab === t.id));
        tabBtns[i]?.classList.toggle('on', s.ui.drawerTab === t.id);
      });
      bodyEl.hidden = !open;
      // The tables are rebuilt only while the Readings popover that hosts them is open.
      if (!open || root.closest('.ribbon')?.hasAttribute('hidden')) return;
      let markup: string;
      if (s.ui.drawerTab === 'diagnostics') {
        const rd = currentReadings(s);
        markup = live ? liveDiagnostics(s, rd) : fixtureDiagnostics(s, rd);
      } else markup = s.ui.drawerTab === 'fixtures' ? examplesList(s) : provenance();
      setHtml(bodyEl, markup);
    },
  };
}
