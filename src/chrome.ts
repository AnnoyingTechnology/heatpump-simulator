import { createLanguageControl } from './language';
import { powerSymbol } from './measurement-symbols';
import { AIR_RAMP_MAX, AIR_RAMP_MIN, TEMP_RAMP_MAX, TEMP_RAMP_MIN, TEMP_RAMP_TICKS, airRampCss, flowMode, tempRampCss } from './circuit';
import { setHtml } from './controls';
import type { Field } from './controls';
import { escapeHtml, fmt, html, setAttr, setText, svg } from './dom';
import { TrendHistory } from './trends';
import { PREVIEW_BANNER, fixtureFor } from './fixtures';
import { simulation } from './runtime/view';
import { ICE_START_KG, currentReadings, liveStatus, store } from './state';
import { createThemeControl } from './theme';
import brandSvg from './brand.svg?raw';
import { INDOOR_CLASSES } from './types';
import type { AppState, SpeedFactor } from './types';

export interface Header {
  root: HTMLElement;
  sync(s: AppState): void;
  setTime(sec: number): void;
  setSpeedRate(actual: number | null, paused: boolean, requested: number): void;
}

const fmtTime = (sec: number): string => {
  const wholeSeconds = Math.floor(sec);
  const h = Math.floor(wholeSeconds / 3600);
  const m = Math.floor(wholeSeconds / 60) % 60;
  const s = wholeSeconds % 60;
  return [h, m, s].map(value => String(value).padStart(2, '0')).join(':');
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

const SPEED_HELP = 'Requested simulation speed. The reading beside the status and clock shows actual completed physical time per wall second. High speeds are limited by calculation throughput; physical timesteps stay unchanged.';

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

export function createHeader(): Header {
  const history = new TrendHistory();
  /** Independent bounded history of the since-restart COP (series index 0 of its own instance). */
  const sessionHistory = new TrendHistory();
  const energyHistory = new TrendHistory();
  let historyEpoch = store.resetEpoch;
  const fields: Field[] = [];
  const speed = pick<SpeedFactor>({
    label: 'Requested speed',
    options: ([0.5, 1, 2, 5, 10, 50] as SpeedFactor[]).map((v) => ({ value: v, text: `${v}×` })),
    get: () => store.state.ui.speed,
    set: (v) => store.update((s) => { s.ui.speed = Number(v) as SpeedFactor; }),
  });
  fields.push(speed);
  const speedHelp = html('span', { class: 'sr-only', id: 'speed-help' }, SPEED_HELP);
  speed.sel.setAttribute('aria-describedby', 'speed-help');
  setAttr(speed.sel, 'title', SPEED_HELP);
  const speedRate = html('output',{class:'hd-speed-rate','aria-label':'Actual simulation speed'},'…');
  const speedControl = html('div',{class:'hd-speed'},speed.root);

  // Action select: choosing an option applies it once and returns to the placeholder, so the control never claims a preset
  // still matches after later manual edits. Only mode, outdoor temperature, room targets and enabled flags change.
  type Season = 'winter' | 'summer';
  const preset = pick<Season | ''>({
    label: 'Quick preset',
    options: [
      { value: '', text: 'Presets' },
      { value: 'winter', text: 'Owner\'s winter · 1 °C' },
      { value: 'summer', text: 'Owner\'s summer · 39 °C' },
    ],
    get: () => '',
    isDisabled: (v) => v === '',
    set: (v) => { if (v) store.applyOwnerSeason(v); },
  });
  preset.sel.addEventListener('change', () => { preset.sel.value = ''; });
  fields.push(preset);
  preset.sel.classList.add('hd-preset');
  setAttr(preset.sel, 'title', 'Quick preset (applied once). Owner\'s winter: heating, 1 °C outdoors, ground 17 °C, upstairs 21.5 °C, attic off, extra rooms 21 °C. Owner\'s summer: cooling, 39 °C outdoors, all indoor units on, targets 24 °C. Kept: edited equipment, geometry, humidity, solar and background gains, and the clock, energy and accepted state; physical time is not reset.');

  const pause = html('button', { type: 'button', class: 'btn hd-pause' }, 'Pause');
  pause.addEventListener('click', () => store.update((s) => { s.ui.paused = !s.ui.paused; }));
  // Reset restarts the simulation from the CURRENT inputs: clocks, ice inventory and room state start over, and the initial room
  // temperatures you set are applied. Edited settings are kept (the factory defaults are not restored).
  const resetHelp = 'Restart the simulation from the current inputs: clock, ice and room state start over; your edited settings and initial room temperatures are kept and applied.';
  const reset = html('button', { type: 'button', class: 'btn ghost hd-reset', 'aria-label': 'Reset simulation', title: resetHelp }, 'Reset');
  reset.addEventListener('click', () => store.restartSimulation());
  const time = html('output', { class: 'time', 'aria-label': 'Simulation time' }, '00:00:00');

  // Headline readings: value with its trend to the right, label below the value, fixed-width cells so the header does not reflow
  // as numbers change. The plot fills most of the header height and stretches to its cell width (non-uniform viewBox, non-scaling strokes); its
  // time ends are HTML laid over the empty strip under the baseline, so the text is never distorted.
  const metric = (unit: string | null, lineClass = 'trend-line') => {
    const k = html('span', { class: 'k' }, '');
    const v = html('b', { class: 'v' }, '—');
    const trendTitle = svg('title', {}, 'Last 2 hours of simulated time; latest reading in each 10-second bin; no history yet');
    const trendPath = svg('path', { class: lineClass, d: '' });
    const trend = svg('svg', { class: 'hm-trend', viewBox: '0 0 112 44', preserveAspectRatio: 'none', role: 'img', 'aria-label': 'Last 2 hours of simulated time' },
      trendTitle, svg('path', { class: 'trend-baseline', d: 'M1 34H111' }), trendPath);
    const plot = html('span', { class: 'hm-plot' }, trend, html('span', { class: 'hm-ends', 'aria-hidden': 'true' }, html('span', {}, '−2h'), html('span', {}, 'now')));
    const root = html('div', { class: 'hm' }, k, html('span', { class: 'vl' }, v, ...(unit ? [html('i', {}, unit)] : [])), plot);
    return { root, k, v, trend, trendTitle, trendPath };
  };
  const mCop = metric('COP');
  mCop.root.classList.add('hm-cop');
  // Since-restart COP: the engine's cumulative useful service heat over cumulative HVAC electricity. Its own plot (not one of the
  // three headline `.trend-line` series) keeps a constant series across mode changes and is cleared only by Restart.
  const mSession = metric(null, 'session-line');
  mSession.root.classList.add('hm-session-cop');
  setText(mSession.k, 'Since start');
  setAttr(mSession.root, 'title', 'COP since restart: cumulative useful heating and cooling service divided by all HVAC electricity (compressor, fans, controls), including defrost and reversal penalties; excludes background gains and room-to-room links. Cleared only by Restart.');
  const mHeat = metric('kW');
  mHeat.root.classList.add('hm-heat');
  const mElec = metric('kW');
  mElec.root.classList.add('hm-elec');
  const mEnergy = metric('kWh', 'energy-line');
  mEnergy.root.classList.add('hm-energy');
  setText(mEnergy.k, 'Since start');
  setAttr(mEnergy.root, 'title', 'Electrical energy since start: cumulative compressor, fan and control electricity from the engine ledger. Kept across settings and mode changes; cleared on Reset.');
  const icon = (): SVGSVGElement => svg('svg', { class: 'hm-icon', viewBox: '0 0 24 24', 'aria-hidden': 'true' });
  const plug = icon();
  plug.append(svg('path', { d: 'M8 3v5M16 3v5M6 8h12v3a6 6 0 0 1-6 6v4M12 17v-1' }));
  mElec.root.querySelector('.vl')!.prepend(plug);
  const thermal = powerSymbol();
  thermal.root.classList.add('hm-icon');
  mHeat.root.querySelector('.vl')!.prepend(thermal.root);
  setText(mElec.k, 'Electrical input');
  const metrics = html('div', { class: 'hd-metrics', role: 'group', 'aria-label': 'Headline readings' }, mCop.root, mSession.root, mHeat.root, mElec.root, mEnergy.root);

  // Status cell: persistent badge plus one ellipsised line; full detail on hover and in outdoor settings.
  const opState = html('output', { class: 'opstate', role: 'status', 'data-kind': 'loading' }, 'Loading');
  const exTag = html('span', { class: 'hd-ex' }, 'Examples · fixed');
  const note = html('span', { class: 'hd-note' }, '');
  const status = html('div', { class: 'hd-status' }, html('div', { class: 'hd-badges' }, opState, exTag, speedRate), note);
  const run = html('div', { class: 'hd-run' }, status, time);

  const brand = html('div', { class: 'brand' });
  setHtml(brand, brandSvg);
  const root = html('header', { class: 'topbar' },
    html('div', { class: 'hd-id' },
      brand,
      createThemeControl()),
    html('div', { class: 'hd-group' }, preset.root, speedControl, pause, reset, run, speedHelp),
    html('div', { class: 'spacer' }),
    metrics);

  return {
    root,
    sync(s: AppState): void {
      const live = s.ui.experience === 'live';
      for (const f of fields) f.refresh();
      setText(pause, s.ui.paused ? 'Resume' : 'Pause');
      pause.setAttribute('aria-pressed', String(s.ui.paused));
      opState.hidden = !live;
      exTag.hidden = live;
      const scenario = fixtureFor(s.cfg.mode, s.cfg.example).title;
      setText(exTag, scenario ? `Examples · ${scenario}` : 'Examples');
      setAttr(time, 'title', live ? 'Simulation time' : 'Preview time');
      setAttr(time, 'aria-label', live ? 'Simulation time' : 'Preview time');

      metrics.dataset.mode = s.cfg.mode;
      note.hidden = live && s.ui.experience === 'live' && currentReadings(s).live?.usable === true && currentReadings(s).live?.kind !== 'updating';
      const rd = currentReadings(s);
      thermal.update(rd.roomKwTotal === null ? null : rd.roomKwTotal < 0 ? 'cooling' : s.cfg.mode);
      const cleared = historyEpoch !== store.resetEpoch;
      if (cleared) { history.clear(); sessionHistory.clear(); energyHistory.clear(); historyEpoch = store.resetEpoch; }
      const output = simulation.status.output;
      // Since-restart COP from the engine's own cumulative ledger; never an average of instantaneous COP, never clipped (negative
      // defrost/reversal service stays), undefined without electricity. Mode edits do not touch it; only Restart clears it.
      const sessionOf = (e: { usefulServiceHeatJ: number; electricityJ: number } | null | undefined): number | null =>
        e && Number.isFinite(e.electricityJ) && e.electricityJ > 0 && Number.isFinite(e.usefulServiceHeatJ) ? e.usefulServiceHeatJ / e.electricityJ : null;
      const sessionCop = live ? sessionOf(rd.engine?.energy) : null;
      const accepted = live && simulation.status.state === 'ready' && output && output.state !== 'fault';
      const changed = accepted ? history.accept(output.simulatedSeconds, [rd.cop, rd.roomKwTotal, rd.electricalKw], s.cfg.mode) : false;
      const sessionChanged = accepted ? sessionHistory.accept(output.simulatedSeconds, [sessionOf(output.energy), null, null], 'session') : false;
      const electricityKwh = live && output && Number.isFinite(output.energy.electricityJ) ? output.energy.electricityJ / 3_600_000 : null;
      const energyChanged = accepted ? energyHistory.accept(output.simulatedSeconds, [electricityKwh, null, null], 'electricity') : false;
      const plots: Array<[typeof mCop, TrendHistory, 0 | 1 | 2, boolean, string, string]> = [
        [mCop, history, 0, changed, rd.copLabel, 'COP'],
        [mHeat, history, 1, changed, rd.roomKwLabel, 'kW'],
        [mElec, history, 2, changed, 'Electrical input', 'kW'],
        [mSession, sessionHistory, 0, sessionChanged, 'COP since restart', 'COP'],
        [mEnergy, energyHistory, 0, energyChanged, 'Electrical energy since start', 'kWh'],
      ];
      for (const [m, hist, series, fresh, label, unit] of plots) {
        if (cleared || fresh || !live || !m.trend.dataset.source || m.trend.dataset.source !== s.ui.experience) {
          const plot = hist.plot(series, unit === 'kWh' ? .001 : 1);
          setAttr(m.trendPath, 'd', live ? plot.path : '');
          setText(m.trendTitle, live
            ? `${label}: last 2 hours of simulated time, latest reading in each 10-second bin. ${plot.count ? `Scale ${fmt(plot.minimum, unit === 'kWh' ? 4 : 2)}…${fmt(plot.maximum, unit === 'kWh' ? 4 : 2)} ${unit}.` : 'No accepted history yet.'} Missing readings are gaps.`
            : 'Illustrative snapshot; no simulated history.');
          m.trend.dataset.source = s.ui.experience;
        }
      }
      setText(mSession.v, sessionCop === null ? '—' : fmt(sessionCop, 2));
      setText(mEnergy.v, electricityKwh === null ? '—' : fmt(electricityKwh, electricityKwh < 10 ? 3 : 2));
      mEnergy.root.dataset.exactKwh = electricityKwh === null ? '' : String(electricityKwh);
      setText(mCop.k, rd.copLabel);
      setText(mHeat.k, rd.roomKwLabel);
      setText(mCop.v, rd.cop === null ? '—' : fmt(rd.cop, 2));
      setText(mHeat.v, rd.roomKwTotal === null ? '—' : fmt(rd.roomKwTotal, 2));
      setText(mElec.v, rd.electricalKw === null ? '—' : fmt(rd.electricalKw, 2));
      setAttr(mCop.root, 'title', rd.copLabel);
      setAttr(mHeat.root, 'title', rd.roomKwLabel);
      setAttr(mElec.root, 'title', 'Electrical input');

      if (!live) {
        metrics.dataset.held = '0';
        pause.classList.remove('attn');
        note.dataset.tone = 'warn';
        setText(note, 'Fixed illustrative readings');
        setAttr(status, 'title', PREVIEW_BANNER);
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
        setText(note, st.kind === 'fault' ? 'Stopped · state retained' : 'Readings withheld');
        setAttr(status, 'title', `${st.label}: ${st.detail ?? ''} Readings withheld.`);
      } else if (held) {
        note.dataset.tone = 'info';
        setText(note, s.ui.paused ? 'Resume to recalculate' : 'Awaiting calculation');
        setAttr(status, 'title', `${st.detail ?? ''}\n${LIVE_BASIS}`);
      } else {
        note.dataset.tone = 'warn';
        setText(note, '');
        setAttr(status, 'title', `${st.detail ? `${st.detail}\n` : ''}${LIVE_BASIS}\n${fieldLinesNote(s)}`);
      }
    },
    setTime(sec: number): void { setText(time, fmtTime(sec)); },
    setSpeedRate(actual: number | null, paused: boolean, requested: number): void {
      const limited = !paused && actual !== null && actual < .9*requested;
      setText(speedRate,paused ? 'Paused' : actual === null ? '…' : `${actual.toFixed(1)}×`);
      speedRate.dataset.actualRate = actual === null ? '' : String(actual);
      speedRate.dataset.limited = String(limited);
      setAttr(speedRate, 'title', paused ? 'Physical time is paused' : actual === null ? 'Measuring completed simulation time' :
        `${actual.toFixed(2)} simulated seconds per wall second${limited ? '; requested speed is limited by calculation throughput' : ''}`);
    },
  };
}

// ---------- scene overlay: one slim row (notices left, view presets right), legend below ----------
export interface Overlay { root: HTMLElement; film: HTMLElement; sync(s: AppState): void; tick(): void }

export function createOverlay(): Overlay {
  const unzoom = html('button', { type: 'button', class: 'zoom-out', 'aria-label': 'Zoom out to all zones (Escape)' }, '↙ Zoom out');
  unzoom.addEventListener('click', () => store.update(s => { s.ui.zoom = 'overview'; }));
  const iceHead = html('span', { class: 'ice-head' });
  const ice = html('summary', {
    class: 'chip-ice', 'aria-label': 'Outdoor coil ice and liquid film, and total drained water; show details',
    title: 'Ice and film: the outdoor coil now. Water total: cumulative whole-system water actually drained (indoor condensate plus outdoor liquid drainage) since restart, kept across mode changes; frost deposition and melting are not counted until drained. Kilograms (about litres).',
  }, iceHead);
  const iceNote = html('p', { class: 'ice-note' });
  const film = html('details', { class: 'coil-film rp-ctl' }, ice, iceNote);
  const mismatchText = html('span', { class: 'mm-text' });
  // Fault banner only: a local, self-contained JSON of the configuration, recent requests, last accepted output and error. Nothing is
  // uploaded and nothing is claimed to be recovered; the retained state and offline readings stay as the banner states.
  const download = html('button', { type: 'button', class: 'ov-more dl-diag', title: 'Save a diagnostic JSON file locally (no upload)' }, 'Download diagnostic');
  download.hidden = true;
  download.addEventListener('click', () => {
    const report = (simulation as unknown as { diagnosticReport?: () => unknown }).diagnosticReport?.();
    try {
      const blob = new Blob([JSON.stringify(report ?? { unavailable: 'diagnostic report not available in this build' }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = html('a', { href: url, download: `heatpump-diagnostic-${new Date().toISOString().slice(0, 10)}.json` });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      setText(download, 'Diagnostic unavailable');
    }
  });
  const mismatch = html('div', { class: 'mismatch', role: 'status' }, mismatchText, download);
  const mismatchDetail = html('p', { class: 'mm-detail' });
  const moreBtn = html('button', { type: 'button', class: 'ov-more', 'aria-expanded': 'false', 'aria-controls': 'ov-detail' }, 'Details') as HTMLButtonElement;
  const detail = html('div', { class: 'ov-detail', id: 'ov-detail' }, mismatchDetail);
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
      detailsBtn, createLanguageControl()),
    html('p', { class: 'lg-sentence' }, `Pipe colour and probe swatches use this fixed scale and saturate beyond ${String(TEMP_RAMP_MIN).replace('-', '−')} / ${TEMP_RAMP_MAX} °C; probe numbers stay exact. 105 °C and above is hot discharge vapour, not a liquid temperature. Heat can be absorbed at constant temperature during evaporation (ΔT = 0 is valid).`),
    legendNote);
  const top = html('div', { class: 'ov-top' }, mismatch, moreBtn, html('span', { class: 'spacer' }), unzoom, detail);
  const root = html('div', { class: 'overlay' }, top,
    legend);
  return {
    root, film,
    sync(s: AppState): void {
      unzoom.hidden = s.ui.zoom === 'overview';
      const fault = s.ui.experience === 'live' && liveStatus(s.cfg).kind === 'fault';
      top.hidden = s.ui.experience === 'live' && unzoom.hidden && !fault;
      mismatch.classList.toggle('fault', fault);
      download.hidden = !fault || typeof (simulation as unknown as { diagnosticReport?: unknown }).diagnosticReport !== 'function';
      mismatch.setAttribute('role', fault ? 'alert' : 'status');
      root.dataset.zoom = s.ui.zoom;
      if (s.ui.experience === 'live') {
        setText(legendNote, 'The tube interior colour is the reported temperature. Thin white marks over it show phase and drift in the flow direction; they never replace the colour. Hatched = fluid flows but no temperature is reported (e.g. mid-coil passes); solid grey = no flow (idle, closed or switched-off branch, or readings withheld). Arrows show flow direction. Pills on the pipes are refrigerant probes (IN/OUT at each coil, D/S at the compressor): exact computed values rounded to 0.1 °C, a dash while no cycle or branch circulates. ΔT is OUT − IN; coil heat is the refrigerant\'s, not the room\'s net kW. Live engine: outdoor air, setpoints, heat-loss coefficients, ηis and generic parameters drive the model; initial room temperature applies on Reset.');
        mismatch.hidden = !fault;
        if (fault) {
          setText(mismatchText, `Calculation stopped: ${liveStatus(s.cfg).detail ?? 'Engine fault.'} Accepted time and thermal state are retained; operating readings are unavailable.`);
        }
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
      if (ui.experience === 'live') {
        const st = liveStatus(cfg);
        const out = st.usable ? simulation.status.output : null;
        const held = out ? null : simulation.inventory;
        const lastStep = !!held || st.kind === 'updating';
        // Mass values come from the engine's own film state; the preview ledger is not involved.
        // A held inventory is the last accepted film state, not a reading of the current input.
        const film = out?.outdoor ?? held?.outdoor ?? null;
        // Whole-system drained water from the engine's cumulative ledger; a dash while the field is absent, never an invented zero.
        const drained = simulation.status.output?.energy?.drainedWaterKg;
        const water = typeof drained === 'number' && Number.isFinite(drained) ? `${fmt(drained, 3)} kg` : '—';
        setText(iceHead, film
          ? `${lastStep ? 'Last step · ' : ''}Ice ${fmt(film.iceKg, 3)} kg · film ${fmt(film.liquidKg, 3)} kg · Water total ${water}`
          : `Ice — · film — · Water total ${water}`);
        ice.dataset.held = lastStep ? '1' : '0';
        setText(iceNote, held ? `Held: last accepted outdoor ice state at simulated ${fmtTime(held.simulatedSeconds)}. Current input: ${st.label.toLowerCase()}; no melting is animated.` : 'Ice and liquid water retained on the outdoor coil, from the live energy and water balances.');
      } else {
        const c = store.clock;
        ice.dataset.held = '0';
        const fm = flowMode(cfg.mode, cfg.example);
        setText(iceHead, `Scene ice ${fmt(c.iceKg, 3)} kg · retained ${fmt(c.retainedWaterKg, 3)} kg · Water total —`);
        const notes: string[] = [];
        if (c.seeded) notes.push(`Started from an arbitrary ${ICE_START_KG.toFixed(2)} kg example ice load.`);
        if (fm === 'defrost' && c.iceKg <= 0) notes.push('Ice exhausted: melt and drips stopped. Snapshot readings do not change; this is not a predicted defrost duration.');
        const framed = cfg.mode === 'heating' && (cfg.example === 'frost' || cfg.example === 'defrost');
        if ((c.iceKg > 0 || c.retainedWaterKg > 0) && !framed) notes.push('Retained mass carried through a synthetic snapshot transition; no thaw, drainage or refreezing is modelled.');
        setText(iceNote, `Illustrative example ice and retained water. ${notes.join(' ')}`);
      }
      film.dataset.source = ui.experience;
      const anyDetail = ui.experience === 'examples';
      moreBtn.hidden = !anyDetail;
      if (!anyDetail && !detail.hidden) {
        detail.hidden = true;
        moreBtn.setAttribute('aria-expanded', 'false');
      }
    },
  };
}

/** Only measurements without a permanent diagram counterpart, inside outdoor settings. */
export function createModelDiagnostics(): { root: HTMLDetailsElement; sync(s: AppState): void } {
  const body = html('div', { class: 'fold-body' });
  const root = html('details', { class: 'fold model-diagnostics' }, html('summary', {}, 'Model diagnostics'), body);
  root.addEventListener('toggle', () => { if (root.open) sync(store.state); });
  function sync(s: AppState): void {
    if (!root.open) return;
    const rd = currentReadings(s);
    const st = rd.live;
    const e = rd.engine;
    const rows: Array<[string, string]> = [];
    if (e) {
      const en = e.energy;
      const kwh = (j: number): string => `${fmt(j / 3.6e6, 4)} kWh`;
      rows.push(['Electricity consumed', kwh(en.electricityJ)], ['Signed room heat', kwh(en.signedRoomHeatJ)],
        ['Outdoor exchange', kwh(en.outdoorExchangeJ)], ['Drainage enthalpy', kwh(en.drainageJ)],
        ['Boundary energy', kwh(en.boundaryEnergyJ)], ['Stored energy change', kwh(en.storedEnergyChangeJ)],
        ['Whole-system energy residual', `${fmt(en.residualJ, 3)} J`], ['Water residual', `${fmt(en.waterResidualKg, 8)} kg`],
        ['Shared-pressure closure', `${fmt(e.diagnostics.algebraicResidualW, 3)} W`],
        ['Thermostat speed demand', `${fmt(e.diagnostics.demandSpeedRps, 1)} rps`],
        ['Controller speed request', `${fmt(e.diagnostics.speedRps, 1)} rps`]);
      if (e.cycle) rows.push(['Cycle closure residual', `${fmt(e.cycle.closureResidualW, 3)} W`],
        ['Mass flow residual', `${fmt(e.cycle.massResidualKgs, 8)} kg/s`], ['Solver iterations', String(e.cycle.iterations)]);
      if (e.inventory) rows.push(['Compressor admission latch', e.inventory.compressorAdmitted ? 'Armed' : 'Liquid carryover protection']);
    }
    if (st?.calculationMs !== null && st?.calculationMs !== undefined) rows.push(['Last step CPU', `${fmt(st.calculationMs, 2)} ms`]);
    setHtml(body, `<p class="hint">${escapeHtml(s.ui.experience === 'live' ? LIVE_BASIS : PREVIEW_BANNER)}</p>
      <p class="hint">${escapeHtml(fieldLinesNote(s))}</p>
      ${st?.detail ? `<p class="status">${escapeHtml(st.detail)}</p>` : ''}
      ${st?.warnings.map(w => `<p class="status">${escapeHtml(w)}</p>`).join('') ?? ''}
      ${rows.length ? `<table class="tbl"><tbody>${rows.map(([k,v]) => `<tr><td>${escapeHtml(k)}</td><td class="n">${escapeHtml(v)}</td></tr>`).join('')}</tbody></table>` : ''}
      <p class="hint">Accounting values are reported by the engine; no pass/fail threshold is applied here. Generic coil conductances, air flows, compressor displacement and control laws are assumptions. Calibration against installed equipment is unknown.</p>`);
  }
  return { root, sync };
}
