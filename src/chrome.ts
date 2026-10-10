import { flowMode, tempRampCss, TEMP_RAMP_MAX, TEMP_RAMP_MIN } from './circuit';
import { segmented, setHtml } from './controls';
import type { Field } from './controls';
import { escapeHtml, fmt, html, setText } from './dom';
import { FIXTURES, PREVIEW_BANNER, fixtureFor } from './fixtures';
import type { Fixture, FixtureId } from './fixtures';
import { simulation, branchesFor } from './runtime/view';
import { ICE_START_KG, activeRooms, currentReadings, liveStatus, store } from './state';
import type { Current } from './state';
import { INDOOR_CLASSES } from './types';
import type { AppState, DrawerTab, Experience, ExampleState, Mode, SpeedFactor, ZoomPreset } from './types';

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
export function fieldLinesNote(s: AppState): string {
  return s.cfg.live.fieldLines === 'idealized'
    ? 'Idealized field lines: pipe length, diameter, elevation, line pressure drop and line heat exchange are excluded'
    : 'Physical field lines (advanced, slower): uncalibrated homogeneous pipe-loss approximation with assumed bore, level elevation and outdoor-air exposure; not a prediction of installed line losses; some regimes may be unsupported and fail visibly (see Advanced pipe assumptions)';
}

export function createHeader(): Header {
  const fields: Field[] = [];
  const experience = segmented<Experience>({
    label: 'Experience',
    options: [
      { value: 'live', text: 'Live', title: 'Real engine in a worker: generic R32 model, not manufacturer-calibrated' },
      { value: 'examples', text: 'Examples', title: 'Fixed constructed snapshots, not solver output' },
    ],
    get: () => store.state.ui.experience, set: (v) => store.setExperience(v),
  });
  const mode = segmented<Mode>({
    label: 'Mode',
    options: [{ value: 'heating', text: 'Heating' }, { value: 'cooling', text: 'Cooling' }],
    get: () => store.state.cfg.mode,
    set: (m) => (store.state.ui.experience === 'live' ? store.setMode(m) : store.loadExample(m, store.state.cfg.example)),
  });
  const example = segmented<ExampleState>({
    label: 'Example state',
    options: [
      { value: 'normal', text: 'Normal' },
      { value: 'frost', text: 'Frosting', title: 'Heating-mode outdoor coil only' },
      { value: 'defrost', text: 'Defrost', title: 'Reverse-cycle defrost, heating mode only' },
      { value: 'idle', text: 'Idle' },
    ],
    get: () => store.state.cfg.example, set: (e) => store.loadExample(store.state.cfg.mode, e),
    isDisabled: (v) => store.state.cfg.mode === 'cooling' && (v === 'frost' || v === 'defrost'),
  });
  const speed = segmented<SpeedFactor>({
    label: 'Speed', compact: true,
    options: ([0.5, 1, 2, 5, 10] as SpeedFactor[]).map((v) => ({ value: v, text: `${v}×` })),
    get: () => store.state.ui.speed, set: (v) => store.update((s) => { s.ui.speed = v; }),
  });
  fields.push(experience, mode, example, speed);
  const pause = html('button', { type: 'button', class: 'btn' }, 'Pause');
  pause.addEventListener('click', () => store.update((s) => { s.ui.paused = !s.ui.paused; }));
  const reset = html('button', { type: 'button', class: 'btn ghost' }, 'Reset');
  reset.addEventListener('click', () => store.reset());
  const timeLab = html('span', { class: 'lab' }, 'Preview time');
  const SPEED_HELP = 'Requested speed. Live runs are CPU-limited with one worker task in flight, so ×10 may not be reached; the Simulation time shows what actually elapsed.';
  const speedLab = html('span', { class: 'lab', id: 'speed-lab' }, 'Requested speed');
  const speedHelp = html('span', { class: 'sr-only', id: 'speed-help' }, SPEED_HELP);
  speed.root.setAttribute('aria-describedby', 'speed-help');
  const time = html('output', { class: 'time', 'aria-label': 'Simulation time' }, '00:00.0');
  const opLab = html('span', { class: 'lab' }, 'Operating state');
  const opState = html('output', { class: 'opstate', role: 'status', 'data-kind': 'loading' }, 'Loading');
  const exampleCtl = html('div', { class: 'ctl' }, html('span', { class: 'lab' }, 'Example state'), example.root);
  const liveCtl = html('div', { class: 'ctl' }, opLab, opState);
  const brandSub = html('small', {}, 'Sandbox');
  const root = html('header', { class: 'topbar' },
    html('div', { class: 'brand' }, html('span', { class: 'mark', 'aria-hidden': 'true' }), html('div', {}, html('b', {}, 'Heatpump Simulator 2026'), brandSub)),
    html('div', { class: 'ctl' }, html('span', { class: 'lab' }, 'Experience'), experience.root),
    html('div', { class: 'ctl' }, html('span', { class: 'lab' }, 'Mode'), mode.root),
    exampleCtl, liveCtl,
    html('div', { class: 'spacer' }),
    html('div', { class: 'ctl' }, timeLab, time),
    html('div', { class: 'ctl', title: SPEED_HELP }, speedLab, speed.root, speedHelp),
    html('div', { class: 'ctl row' }, pause, reset));
  return {
    root,
    sync(s: AppState): void {
      const live = s.ui.experience === 'live';
      for (const f of fields) f.refresh();
      setText(pause, s.ui.paused ? 'Resume' : 'Pause');
      pause.setAttribute('aria-pressed', String(s.ui.paused));
      exampleCtl.hidden = live;
      liveCtl.hidden = !live;
      setText(brandSub, live ? 'Live · generic R32 model' : 'Examples · constructed snapshots');
      setText(timeLab, live ? 'Simulation time' : 'Preview time');
      if (live) {
        const st = liveStatus(s.cfg);
        setText(opState, st.label);
        opState.dataset.kind = st.kind;
        opState.title = st.detail ?? '';
      }
    },
    setTime(sec: number): void { setText(time, fmtTime(sec)); },
  };
}

// ---------- ribbon ----------
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
      const outlets = branchesFor(rd, activeRooms(s.cfg)).map((b) => b.outletC).filter((x): x is number => x !== null);
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
        `<span class="pill" data-kind="${st.kind}">${escapeHtml(st.label)}</span>`,
        `<span class="rb-t">${escapeHtml(LIVE_BASIS)}</span>`,
        `<span class="rb-t rb-note">${escapeHtml(fieldLinesNote(s))}</span>`,
      ];
      if (st.calculationMs !== null) parts.push(`<span class="rb-t rb-dim">${fmt(st.calculationMs, 1)} ms / step</span>`);
      if (st.kind === 'fault' || (st.kind === 'loading' && st.detail)) {
        parts.push(`<span class="rb-fault"><b>${st.kind === 'fault' ? 'Fault' : 'Unavailable'}:</b> ${escapeHtml(st.detail ?? '')} Readings withheld.</span>`);
      }
      st.warnings.slice(0, 3).forEach((w) => parts.push(`<span class="rb-warn" title="${escapeHtml(w)}">⚠ ${escapeHtml(w)}</span>`));
      if (st.warnings.length > 3) parts.push(`<span class="rb-warn">+${st.warnings.length - 3} more in Diagnostics</span>`);
      setHtml(strip, parts.join(''));
    },
  };
}

// ---------- scene overlay: zoom, legend, notices ----------
export interface Overlay { root: HTMLElement; sync(s: AppState): void; tick(): void }

export function createOverlay(zoomTo: (z: ZoomPreset) => void): Overlay {
  const zoomSeg = segmented<ZoomPreset>({
    label: 'View',
    options: [{ value: 'overview', text: 'Overview' }, { value: 'outdoor', text: 'Outdoor unit' }, { value: 'rooms', text: 'Rooms' }],
    get: () => store.state.ui.zoom,
    set: (z) => store.update((s) => { s.ui.zoom = z; }),
  });
  void zoomTo;
  const iceHead = html('div', { class: 'ice-head' });
  const iceNote = html('div', { class: 'ice-note' });
  const ice = html('div', { class: 'chip-ice', role: 'status' }, iceHead, iceNote);
  const mismatch = html('div', { class: 'mismatch', role: 'status' });
  const swatch = (cls: string, label: string): HTMLElement => html('li', {}, html('i', { class: `sw ${cls}` }), label);
  const ramp = html('i', { class: 'ramp' });
  ramp.style.background = tempRampCss();
  const legendNote = html('p', {}, '');
  legendNote.hidden = true;
  legendNote.id = 'legend-details';
  const detailsBtn = html('button', { type: 'button', class: 'lg-more', 'aria-expanded': 'false', 'aria-controls': 'legend-details' }, 'Details') as HTMLButtonElement;
  detailsBtn.addEventListener('click', () => {
    legendNote.hidden = !legendNote.hidden;
    detailsBtn.setAttribute('aria-expanded', String(!legendNote.hidden));
  });
  const legend = html('div', { class: 'legend', role: 'group', 'aria-label': 'Phase and temperature legend' },
    html('div', { class: 'lg-row' },
      html('div', { class: 'lg-col' }, html('span', { class: 'lg-h' }, 'Phase'),
        html('ul', {}, swatch('vapor', 'Vapor'), swatch('liquid', 'Liquid'), swatch('two', 'Two-phase'), swatch('idle', 'Idle'))),
      html('div', { class: 'lg-col' }, html('span', { class: 'lg-h' }, 'Core temp.'),
        html('span', { class: 'lg-ramp' }, html('span', {}, `${TEMP_RAMP_MIN} °C`), ramp, html('span', {}, `${TEMP_RAMP_MAX} °C`))),
      detailsBtn),
    legendNote);
  const root = html('div', { class: 'overlay' },
    html('div', { class: 'ov-top' }, mismatch, html('div', { class: 'ov-right' }, zoomSeg.root, ice)),
    legend);
  return {
    root,
    sync(s: AppState): void {
      zoomSeg.refresh();
      root.dataset.zoom = s.ui.zoom;
      if (s.ui.experience === 'live') {
        setText(legendNote, 'Colour and stripes show phase; the thin core line shows temperature separately. No core line = temperature unavailable (idle, closed branch or withheld). Arrows show flow direction.');
        setHtml(mismatch, `<b>Live engine.</b> Outdoor air, setpoints, heat-loss coefficients, ηis and generic parameters drive the model. Initial room temperature applies on Reset.`);
        mismatch.classList.remove('diff');
        return;
      }
      setText(legendNote, 'Colour and stripes show phase (striped amber = two-phase); the thin core line shows temperature separately. No core line = temperature not in the fixture. Arrows show flow direction.');
      const fx = fixtureFor(s.cfg.mode, s.cfg.example);
      const diffs: string[] = [];
      if (s.cfg.outdoorC !== fx.conditions.outdoorC || s.cfg.outdoorRh !== fx.conditions.outdoorRh) diffs.push('outdoor air');
      if (s.cfg.etaIsPct !== 70) diffs.push('ηis');
      if (s.cfg.rooms.slice(0, s.cfg.unitCount).some((r) => r.airC !== fx.conditions.roomC || r.setpointC !== fx.conditions.setpointC)) diffs.push('room temperatures');
      if (s.cfg.unitCount !== 3) diffs.push('unit count (totals reallocated)');
      const fixtureClasses = [2.5, 3.5, 2.5];
      if (s.cfg.rooms.slice(0, Math.min(s.cfg.unitCount, 3)).some((r, i) => INDOOR_CLASSES[r.indoorClass].nominalKw !== fixtureClasses[i])) diffs.push('indoor capacity classes (2.5/3.5/2.5 in fixture)');
      if (s.cfg.outdoorKind === 'generic') diffs.push('generic outdoor unit (fixture is the owner-declared one)');
      const lead = 'Examples: fixed illustrative snapshot readings.';
      const frostNote = s.cfg.mode === 'heating' && s.cfg.example === 'frost'
        ? '<span class="fnote">Frosting COP 3.62 vs normal 3.57 comes from unrelated, freely chosen flows and fans — not evidence that frost improves performance.</span>'
        : '';
      setHtml(mismatch, (diffs.length
        ? `<b>${lead}</b> Differs from fixture: ${escapeHtml(diffs.join(', '))}; readings are not recomputed.`
        : `<b>${lead}</b> Fixture conditions match; other inputs only edit configuration.`) + frostNote);
      mismatch.classList.toggle('diff', diffs.length > 0);
    },
    tick(): void {
      const { cfg, ui } = store.state;
      if (ui.experience === 'live') {
        const st = liveStatus(cfg);
        const out = st.usable ? simulation.status.output : null;
        const held = out ? null : simulation.inventory;
        // Mass values come from the engine's own film state; the preview ledger is not involved.
        // A held inventory is the last accepted film state, not a reading of the current input.
        const film = out?.outdoor ?? held?.outdoor ?? null;
        setText(iceHead, film
          ? `${held ? 'Held ' : ''}Outdoor ice ${fmt(film.iceKg, 3)} kg · liquid film ${fmt(film.liquidKg, 3)} kg`
          : 'Outdoor ice — · liquid film —');
        ice.dataset.held = held ? '1' : '0';
        setText(iceNote, held ? `Held: last accepted state at simulated ${fmtTime(held.simulatedSeconds)}. Current input: ${st.label.toLowerCase()}; no melting is animated.` : '');
        iceNote.hidden = !held;
        return;
      }
      const c = store.clock;
      ice.dataset.held = '0';
      const fm = flowMode(cfg.mode, cfg.example);
      setText(iceHead, `Scene ice ${fmt(c.iceKg, 3)} kg · retained liquid ${fmt(c.retainedWaterKg, 3)} kg`);
      const notes: string[] = [];
      if (c.seeded) notes.push(`Started from an arbitrary ${ICE_START_KG.toFixed(2)} kg example ice load.`);
      if (fm === 'defrost' && c.iceKg <= 0) notes.push('Ice exhausted: melt and drips stopped. Snapshot readings do not change; this is not a predicted defrost duration.');
      const framed = cfg.mode === 'heating' && (cfg.example === 'frost' || cfg.example === 'defrost');
      if ((c.iceKg > 0 || c.retainedWaterKg > 0) && !framed) notes.push('Retained mass carried through a synthetic snapshot transition; no thaw, drainage or refreezing is modelled.');
      setText(iceNote, notes.join(' '));
      iceNote.hidden = notes.length === 0;
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
  ['Outdoor casing', '734 × 958 × 340 mm', 'manufacturer catalogue family data (2019–20)'],
  ['Indoor casing', '295 × 798 × 189 mm', 'catalogue; FTXA25/35 share it'],
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
  const toggle = html('button', { type: 'button', class: 'drawer-toggle', 'aria-expanded': 'false', 'aria-controls': 'drawer-body' }, 'Diagnostics and examples');
  toggle.addEventListener('click', () => store.update((s) => { s.ui.drawerOpen = !s.ui.drawerOpen; }));
  const tabBtns = tabs.map((t) => {
    const b = html('button', { type: 'button', class: 'tab small', role: 'tab' }, t.label);
    b.addEventListener('click', () => store.update((s) => { s.ui.drawerTab = t.id; s.ui.drawerOpen = true; }));
    return b;
  });
  const bodyEl = html('div', { class: 'drawer-body', id: 'drawer-body' });
  const bannerS = html('span', { class: 'banner-s' }, PREVIEW_BANNER);
  const root = html('section', { class: 'drawer', 'aria-label': 'Diagnostics and examples' },
    html('div', { class: 'drawer-bar' }, toggle, html('div', { class: 'tabs', role: 'tablist' }, ...tabBtns), html('span', { class: 'spacer' }), bannerS),
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
      setText(bannerS, live ? LIVE_BASIS : PREVIEW_BANNER);
      tabs.forEach((t, i) => {
        tabBtns[i]?.setAttribute('aria-selected', String(s.ui.drawerTab === t.id));
        tabBtns[i]?.classList.toggle('on', s.ui.drawerTab === t.id);
      });
      bodyEl.hidden = !open;
      if (!open) return;
      let markup: string;
      if (s.ui.drawerTab === 'diagnostics') {
        const rd = currentReadings(s);
        markup = live ? liveDiagnostics(s, rd) : fixtureDiagnostics(s, rd);
      } else markup = s.ui.drawerTab === 'fixtures' ? examplesList(s) : provenance();
      setHtml(bodyEl, markup);
    },
  };
}
