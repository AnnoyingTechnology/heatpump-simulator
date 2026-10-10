import type { Field } from './controls';
import { nextId, segmented, select, slider } from './controls';
import { fmt, html } from './dom';
import { defaultEngineConfig } from './engine/defaults';
import { fixtureFor } from './fixtures';
import { PHYSICAL_FIELD_LINES_AVAILABLE, defaultLiveParameters, pipeWallMmForOd } from './runtime/config';
import type { LiveParameters } from './runtime/config';
import { currentReadings, store } from './state';
import type { IndoorClass, PipeConfig, RoomConfig, SidebarTab } from './types';
import { CLEANLINESS_MAX_PCT, CLEANLINESS_MIN_PCT, INDOOR_CASE_MM, INDOOR_CLASSES, MAX_UNITS, OUTDOOR_CASE_MM, OWNER_PORTS } from './types';

const TABS: ReadonlyArray<{ id: SidebarTab; label: string }> = [
  { id: 'rooms', label: 'Rooms' },
  { id: 'equipment', label: 'Equipment' },
  { id: 'pipes', label: 'Pipes' },
  { id: 'advanced', label: 'Advanced' },
];

const LIQUID_OD = [6.35, 9.52];
const GAS_OD = [9.52, 12.7, 15.88];

const FLUIDS: ReadonlyArray<{ name: string; note: string; selected?: boolean }> = [
  { name: 'R32', note: 'Selected · pure fluid · real property backend (Live) · pinned EOS probe (Examples)', selected: true },
  { name: 'R410A', note: 'Research only · blend, glide ≈ 0 · validation pending' },
  { name: 'R454B', note: 'Research only · blend with glide · validation pending' },
  { name: 'R290', note: 'Research only · propane, flammable · validation pending' },
  { name: 'R1234yf', note: 'Research only · validation pending' },
  { name: 'R134a', note: 'Research only · validation pending' },
  { name: 'R407C', note: 'Research only · zeotropic blend · validation pending' },
  { name: 'R22', note: 'Research only · legacy · validation pending' },
];

/** References only; none of these is modelled or editable yet. */
const PENDING: ReadonlyArray<{ name: string; note: string }> = [
  { name: 'Charge', note: 'Pending reference · refrigerant inventory is not modelled' },
  { name: 'Leaks', note: 'Pending reference · no leak or charge-loss model' },
  { name: 'Oil', note: 'Pending reference · no lubricant circulation or solubility model' },
  { name: 'Other', note: 'Pending reference · moisture, non-condensables and contamination are not modelled' },
];

/** Plain positive numeric parameters on the generic 0.2×–5× helper. Cleanliness, wall, insulation, the nullable outdoor override and the mode have their own controls. */
type LiveKey = Exclude<keyof LiveParameters,
  'fieldLines' | 'cleanlinessPct' | 'outdoorCleanlinessOverridePct' | 'pipeWallThicknessMm' | 'pipeInsulationConductanceWmK'>;

const WALL_MIN_MM = 0.8;
const WALL_MAX_MM = 1.5;
const INSULATION_MAX = 1;

/**
 * "Use global" checkbox plus an override slider. The override value is stored as null while inheriting.
 * Both inputs are created once; refresh() never rebuilds them, and the slider stays mounted (hidden) while inheriting.
 */
function cleanlinessOverride(o: { label: string; global(): number; get(): number | null; set(v: number | null): void }): Field {
  const id = nextId('c');
  const box = html('input', { type: 'checkbox', id });
  const text = html('span', {});
  const range = slider({
    label: o.label, unit: '% clear', min: CLEANLINESS_MIN_PCT, max: CLEANLINESS_MAX_PCT, step: 1, digits: 0,
    get: () => o.get() ?? o.global(), set: (v) => o.set(v),
  });
  box.addEventListener('change', () => o.set(box.checked ? null : o.global()));
  const root = html('div', { class: 'field clean-override' }, html('label', { class: 'check', for: id }, box, text), range.root);
  return {
    root,
    refresh(): void {
      const inherit = o.get() === null;
      box.checked = inherit;
      const t = `Use global cleanliness (${fmt(o.global(), 0)} % clear)`;
      if (text.textContent !== t) text.textContent = t;
      range.root.hidden = inherit;
      range.refresh();
    },
  };
}

export interface Sidebar {
  root: HTMLElement;
  sync(): void;
  setTab(t: SidebarTab): void;
}

function section(title: string, ...kids: Node[]): HTMLElement {
  return html('section', { class: 'group' }, html('h3', {}, title), ...kids);
}

function relabel(f: Field, text: string, unit: string): void {
  const l = f.root.querySelector('label');
  if (l && l.textContent !== text) l.textContent = text;
  f.root.querySelector('input.num')?.setAttribute('aria-label', `${text} [${unit}]`);
}

export function createSidebar(): Sidebar {
  const fields: Field[] = [];
  const reg = <T extends Field>(f: T): T => { fields.push(f); return f; };
  const cfg = () => store.state.cfg;
  const isLive = () => store.state.ui.experience === 'live';
  let lastSelected: string | null = null;

  // ---------- Pinned outdoor air (always visible, outside the tab panels) ----------
  const dry = reg(slider({
    label: 'Outdoor temperature', unit: '°C', min: -20, max: 40, step: 0.5, digits: 1,
    get: () => cfg().outdoorC, set: (v) => store.update((s) => { s.cfg.outdoorC = v; }),
  }));
  const rh = reg(slider({
    label: 'Outdoor humidity', unit: '% RH', min: 10, max: 100, step: 1, digits: 0,
    get: () => cfg().outdoorRh, set: (v) => store.update((s) => { s.cfg.outdoorRh = v; }),
  }));
  const envCompare = html('div', { class: 'env-status' });
  const matchBtn = html('button', { type: 'button', class: 'btn ghost small' }, 'Match fixture');
  matchBtn.addEventListener('click', () => store.update((s) => {
    const fx = fixtureFor(s.cfg.mode, s.cfg.example);
    s.cfg.outdoorC = fx.conditions.outdoorC;
    s.cfg.outdoorRh = fx.conditions.outdoorRh;
  }));
  const pressure = reg(segmented({
    label: 'Pressure convention', compact: true,
    options: [{ value: 'abs', text: 'bar(a)', title: 'Absolute pressure' }, { value: 'gauge', text: 'bar(g)', title: 'Gauge = absolute − 1.01325 bar ambient' }],
    get: () => store.state.ui.pressure, set: (v) => store.update((s) => { s.ui.pressure = v; }),
  }));
  const taps = html('input', { type: 'checkbox', id: 'opt-taps' });
  const labels = html('input', { type: 'checkbox', id: 'opt-labels' });
  taps.addEventListener('change', () => store.update((s) => { s.ui.showTaps = taps.checked; }));
  labels.addEventListener('change', () => store.update((s) => { s.ui.showLabels = labels.checked; }));
  const envStatus = html('p', { class: 'status' });
  envCompare.append(envStatus, matchBtn);
  const pinnedNote = html('i', {}, '');
  const pinned = html('section', { class: 'pinned', 'aria-label': 'Outdoor air' },
    html('h3', {}, 'Outdoor air ', pinnedNote),
    dry.root, rh.root, envCompare);

  // ---------- Equipment ----------
  const eqPanel = html('div', { class: 'panel', id: 'panel-equipment', role: 'tabpanel' });
  const outdoorSel = reg(select({
    label: 'Outdoor unit',
    options: [
      { value: 'owner', text: 'Daikin 3MXM52N8 (owner preset)' },
      { value: 'generic', text: 'Generic compatible multi-split outdoor' },
    ],
    get: () => cfg().outdoorKind, set: (v) => store.setOutdoorKind(v),
  }));
  const outdoorNote = html('p', { class: 'hint' });
  const countSeg = reg(segmented({
    label: 'Indoor units', compact: true,
    options: Array.from({ length: MAX_UNITS }, (_, i) => ({ value: i + 1, text: String(i + 1) })),
    get: () => cfg().unitCount, set: (v) => store.setUnitCount(v),
  }));
  const notice = html('p', { class: 'notice', role: 'status', hidden: true });
  const unitHost = html('div', { class: 'unit-selects' });
  const unitSelects: ReturnType<typeof select<IndoorClass>>[] = [];
  const classOptions = (): { value: IndoorClass; text: string; disabled?: boolean }[] =>
    (Object.keys(INDOOR_CLASSES) as IndoorClass[]).map((k) => ({
      value: k, text: INDOOR_CLASSES[k].label,
      disabled: cfg().outdoorKind === 'owner' && INDOOR_CLASSES[k].generic,
    }));
  for (let i = 0; i < MAX_UNITS; i++) {
    const s = select<IndoorClass>({
      label: `Indoor ${i + 1}`,
      options: classOptions(),
      get: () => cfg().rooms[i]?.indoorClass ?? 'FTXA25',
      set: (v) => store.update((st) => { const r = st.cfg.rooms[i]; if (r) r.indoorClass = v; }),
    });
    unitSelects.push(s);
    unitHost.append(s.root);
  }
  const eta = reg(slider({
    label: 'Compressor isentropic efficiency ηis', unit: '%', min: 40, max: 90, step: 1, digits: 0,
    get: () => cfg().etaIsPct, set: (v) => store.update((s) => { s.cfg.etaIsPct = v; }),
    hint: 'Ratio of ideal isentropic to actual compression work. Motor and drive losses are separate.',
  }));
  const etaStatus = html('p', { class: 'status' });
  const dims = html('table', { class: 'kv' },
    html('tbody', {},
      html('tr', {}, html('th', {}, 'Outdoor H×W×D'), html('td', {}, `${OUTDOOR_CASE_MM.h} × ${OUTDOOR_CASE_MM.w} × ${OUTDOOR_CASE_MM.d} mm`)),
      html('tr', {}, html('th', {}, 'Indoor H×W×D'), html('td', {}, `${INDOOR_CASE_MM.h} × ${INDOOR_CASE_MM.w} × ${INDOOR_CASE_MM.d} mm`)),
      html('tr', {}, html('th', {}, 'Source'), html('td', {}, 'Daikin Central Europe 2019–20 catalogue (family data). FTXA25 and FTXA35 share one casing.')),
      html('tr', {}, html('th', {}, 'Coil surface'), html('td', {}, 'Manufacturer air-side finned surface [m²]: — (not estimated). The live deposition area is a separate generic assumption.'))));
  const fluidList = html('ul', { class: 'fluids' }, ...FLUIDS.map((f) =>
    html('li', { class: f.selected ? 'on' : 'off', 'aria-disabled': f.selected ? undefined : 'true' },
      html('span', { class: 'fl-name' }, f.name), html('span', { class: 'fl-note' }, f.note))));
  const pendingList = html('ul', { class: 'fluids' }, ...PENDING.map((f) =>
    html('li', { class: 'off pending', 'aria-disabled': 'true' },
      html('span', { class: 'fl-name' }, f.name), html('span', { class: 'fl-note' }, f.note))));
  const cleanGlobal = reg(slider({
    label: 'Heat-exchanger cleanliness (global)', unit: '% clear', min: CLEANLINESS_MIN_PCT, max: CLEANLINESS_MAX_PCT, step: 1, digits: 0,
    get: () => cfg().live.cleanlinessPct, set: (v) => store.update((s) => { s.cfg.live.cleanlinessPct = v; }),
    hint: '100 % = clean coil; 10 % = only 10 % of the clear air passage remains (90 % obstructed). Default for the outdoor coil and every indoor coil.',
  }));
  const cleanOutdoor = reg(cleanlinessOverride({
    label: 'Outdoor coil cleanliness override',
    global: () => cfg().live.cleanlinessPct,
    get: () => cfg().live.outdoorCleanlinessOverridePct,
    set: (v) => store.update((s) => { s.cfg.live.outdoorCleanlinessOverridePct = v; }),
  }));
  const cleanStatus = html('p', { class: 'status' });
  const cleanNote = html('p', { class: 'hint' });
  eqPanel.append(
    section('Installation', countSeg.root, outdoorSel.root, outdoorNote, notice),
    section('Heat-exchanger cleanliness', cleanGlobal.root, cleanOutdoor.root, cleanStatus, cleanNote,
      html('p', { class: 'hint' }, 'Each indoor unit can override the global value in its Rooms card.')),
    section('Indoor unit models', unitHost,
      html('p', { class: 'hint' }, 'A model reference selects the drawn casing and its label only. It never changes live performance; capacity-class shares apply to the examples alone.')),
  );

  // ---------- Advanced ----------
  const advPanel = html('div', { class: 'panel', id: 'panel-advanced', role: 'tabpanel' });
  const fold = (title: string, open: boolean, ...kids: Node[]): HTMLElement =>
    html('details', { class: 'fold', open: open ? '' : undefined }, html('summary', {}, title), html('div', { class: 'fold-body' }, ...kids));

  // Generic live parameters. Bounds are 0.2×–5× the engine default (always positive, always containing the default),
  // except where a physical floor applies: the maximum compressor speed may not fall below the engine's minimum speed.
  const D = defaultLiveParameters();
  const SPEED_MIN_RPS = defaultEngineConfig(1).compressor.speedMinRps;
  const liveField = (key: LiveKey, label: string, unit: string, hint?: string, floor = 0): Field => {
    const d = D[key];
    const digits = d >= 100 ? 0 : d >= 10 ? 1 : d >= 1 ? 2 : 3;
    return reg(slider({
      label, unit, min: Math.max(d * 0.2, floor), max: d * 5, step: 10 ** -digits, digits, hint,
      get: () => cfg().live[key], set: (v) => store.update((s) => { s.cfg.live[key] = v; }),
    }));
  };
  const liveStatusNote = html('p', { class: 'status' });
  const liveParams = [
    liveField('outdoorAirConductanceWK', 'Outdoor coil air-side UA', 'W/K'),
    liveField('outdoorRefrigerantConductanceWK', 'Outdoor coil refrigerant-side UA', 'W/K'),
    liveField('outdoorAirMassFlowKgs', 'Outdoor air mass flow', 'kg/s'),
    liveField('depositionAreaM2', 'Outdoor frost deposition area', 'm²', 'Generic assumption for the frost model; not the manufacturer finned area.'),
    liveField('indoorAirConductanceWK', 'Indoor coil air-side UA (per unit)', 'W/K'),
    liveField('indoorRefrigerantConductanceWK', 'Indoor coil refrigerant-side UA (per unit)', 'W/K'),
    liveField('indoorAirMassFlowKgs', 'Indoor air mass flow (per unit)', 'kg/s'),
    liveField('compressorDisplacementCm3', 'Compressor displacement', 'cm³/rev'),
    liveField('compressorMaxSpeedRps', 'Compressor maximum speed', 'rps', `Not below the engine minimum speed (${fmt(SPEED_MIN_RPS, 0)} rps).`, SPEED_MIN_RPS),
  ];
  advPanel.append(
    fold('Display', true,
      html('div', { class: 'field' }, html('div', { class: 'field-head' }, html('span', { class: 'lab' }, 'Pressure convention')), pressure.root),
      html('label', { class: 'check', for: 'opt-taps' }, taps, 'Show pressure taps (physical service port and virtual taps)'),
      html('label', { class: 'check', for: 'opt-labels' }, labels, 'Component labels at outdoor zoom')),
    fold('Compressor', true, eta.root, etaStatus),
    fold('Generic model parameters', true,
      html('p', { class: 'hint' }, 'Heat-engine assumptions, not measured values and not manufacturer data. Conductances are UA in W/K, not areas. Most numeric bounds are 0.2×–5× the engine default, with physical exceptions (for example the compressor speed floor); they are generic assumptions, not manufacturer limits. Cleanliness and pipe wall/insulation have their own controls.'),
      liveStatusNote, ...liveParams.map((f) => f.root)),
    fold('Refrigerant', false, fluidList),
    fold('Charge, leaks, oil and other (pending)', false, pendingList),
    fold('Casings and dimensions', false, dims),
  );

  // ---------- Rooms ----------
  const roomsPanel = html('div', { class: 'panel', id: 'panel-rooms', role: 'tabpanel' });
  const roomCards: HTMLElement[] = [];
  const airFields: Field[] = [];
  const nowLines: HTMLElement[] = [];
  for (let i = 0; i < MAX_UNITS; i++) {
    const r = (): RoomConfig => cfg().rooms[i] as RoomConfig;
    const vol = reg(slider({ label: 'Volume', unit: 'm³', min: 15, max: 200, step: 1, digits: 0, get: () => r().volumeM3, set: (v) => store.update((s) => { const x = s.cfg.rooms[i]; if (x) x.volumeM3 = v; }) }));
    const loss = reg(slider({ label: 'Heat-loss coefficient', unit: 'W/K', min: 10, max: 250, step: 1, digits: 0, get: () => r().heatLossWPerK, set: (v) => store.update((s) => { const x = s.cfg.rooms[i]; if (x) x.heatLossWPerK = v; }) }));
    const sp = reg(slider({ label: 'Setpoint', unit: '°C', min: 16, max: 30, step: 0.5, digits: 1, get: () => r().setpointC, set: (v) => store.update((s) => { const x = s.cfg.rooms[i]; if (x) x.setpointC = v; }) }));
    const air = reg(slider({ label: 'Room air temperature (input)', unit: '°C', min: 5, max: 35, step: 0.5, digits: 1, get: () => r().airC, set: (v) => store.update((s) => { const x = s.cfg.rooms[i]; if (x) x.airC = v; }) }));
    airFields.push(air);
    const title = html('h4', {}, '');
    const pick = html('button', { type: 'button', class: 'btn ghost small' }, 'Select in diagram');
    pick.addEventListener('click', () => store.update((s) => { s.ui.selected = `indoor:${i}`; }));
    const now = html('p', { class: 'live-now' });
    nowLines.push(now);
    const dirt = reg(cleanlinessOverride({
      label: 'Indoor coil cleanliness override',
      global: () => cfg().live.cleanlinessPct,
      get: () => cfg().rooms[i]?.cleanlinessOverridePct ?? null,
      set: (v) => store.update((s) => { const x = s.cfg.rooms[i]; if (x) x.cleanlinessOverridePct = v; }),
    }));
    const card = html('section', { class: 'group room-card', 'data-room': i }, html('div', { class: 'card-head' }, title, pick), now, vol.root, loss.root, sp.root, air.root, dirt.root);
    card.dataset.title = '';
    roomCards.push(card);
    roomsPanel.append(card);
    (card as HTMLElement & { titleEl?: HTMLElement }).titleEl = title;
  }
  const roomsLead = html('p', { class: 'hint lead' });
  roomsPanel.prepend(roomsLead);

  // ---------- Pipes ----------
  const pipesPanel = html('div', { class: 'panel', id: 'panel-pipes', role: 'tabpanel' });
  const pipeCards: HTMLElement[] = [];
  const pipeChips: HTMLElement[] = [];
  const pipeTitles: HTMLElement[] = [];
  const pipeSelects: Field[] = [];
  for (let i = 0; i < MAX_UNITS; i++) {
    const p = (): PipeConfig => cfg().pipes[i] as PipeConfig;
    const len = reg(slider({
      label: 'One-way line length', unit: 'm', min: 1, max: 40, step: 0.5, digits: 1, get: () => p().lengthM,
      set: (v) => store.update((s) => { const x = s.cfg.pipes[i]; if (x) { x.lengthM = v; x.lengthSource = 'edited'; } }),
    }));
    const liq = reg(select<string>({
      label: 'Liquid line OD [mm]', options: LIQUID_OD.map((d) => ({ value: String(d), text: `${d} mm` })),
      get: () => String(p().liquidOdMm), set: (v) => store.update((s) => { const x = s.cfg.pipes[i]; if (x) x.liquidOdMm = Number(v); }),
    }));
    const gas = reg(select<string>({
      label: 'Gas line OD [mm]', options: GAS_OD.map((d) => ({ value: String(d), text: `${d} mm` })),
      get: () => String(p().gasOdMm), set: (v) => store.update((s) => { const x = s.cfg.pipes[i]; if (x) x.gasOdMm = Number(v); }),
    }));
    pipeSelects.push(liq, gas);
    const chip = html('span', { class: 'chip' });
    const title = html('h4', {});
    const pick = html('button', { type: 'button', class: 'btn ghost small' }, 'Select in diagram');
    pick.addEventListener('click', () => store.update((s) => { s.ui.selected = `pipe:${i}`; }));
    const card = html('section', { class: 'group pipe-card' }, html('div', { class: 'card-head' }, title, pick), html('div', { class: 'chips' }, chip), len.root,
      html('div', { class: 'two' }, liq.root, gas.root));
    pipeCards.push(card);
    pipeChips.push(chip);
    pipeTitles.push(title);
    pipesPanel.append(card);
  }
  const pipeTotals = html('div', { class: 'compare' });
  const modeSeg = reg(segmented<LiveParameters['fieldLines']>({
    label: 'Field-line model', compact: true,
    options: [
      { value: 'idealized', text: 'Idealized (reference)', title: 'Zero-length lines: no pipe effects' },
      { value: 'physical', text: 'Physical', title: PHYSICAL_FIELD_LINES_AVAILABLE ? 'Distributed homogeneous pipe model' : 'Not available until the runtime owner enables it', disabled: !PHYSICAL_FIELD_LINES_AVAILABLE },
    ],
    get: () => cfg().live.fieldLines, set: (v) => store.update((s) => { s.cfg.live.fieldLines = v; }),
  }));
  const pipeMode = html('section', { class: 'group' }, html('h3', {}, 'Field-line model'), modeSeg.root);
  const pipeModeNote = html('p', { class: 'hint' });
  pipeMode.append(pipeModeNote);
  const wall = reg(slider({
    label: 'Configured pipe wall thickness', unit: 'mm', min: WALL_MIN_MM, max: WALL_MAX_MM, step: 0.05, digits: 2,
    get: () => cfg().live.pipeWallThicknessMm, set: (v) => store.update((s) => { s.cfg.live.pipeWallThicknessMm = v; }),
    hint: 'A floor, not a measurement: each line uses the larger of this value and its declared family minimum.',
  }));
  const insulation = reg(slider({
    label: 'Insulation conductance', unit: 'W/(m·K)', min: 0, max: INSULATION_MAX, step: 0.01, digits: 2,
    get: () => cfg().live.pipeInsulationConductanceWmK, set: (v) => store.update((s) => { s.cfg.live.pipeInsulationConductanceWmK = v; }),
    hint: 'Generic per-length conductance to outdoor air; 0 is adiabatic. Not a measured insulation value.',
  }));
  const wallReadout = html('p', { class: 'status' });
  const pipeAdvanced = fold('Advanced pipe assumptions', false, wall.root, insulation.root, wallReadout,
    html('p', { class: 'hint' }, 'Wall minimums are declared family assumptions from the installation guide, not installed-copper measurements and not verified for this N8 unit. Every line with non-zero heat transfer is modelled in outdoor air by assumption; unknown elevation is treated as level, not as the real geometry. Fittings, oil, charge, slip and sonic regimes are not modelled; a high-loss operating point fails visibly.'));
  const pipesLead = html('p', { class: 'hint lead' });
  pipesPanel.prepend(pipeMode, pipesLead, pipeTotals);
  pipesPanel.append(pipeAdvanced);
  pipesPanel.append(section('Pressure tap nodes',
    html('ul', { class: 'taps-list' },
      html('li', {}, html('b', {}, 'Physical service port'), ' — common gas node, fitted on the static gas stop valve. Role changes: HIGH side in heating, LOW side in cooling and defrost.'),
      html('li', {}, html('b', {}, 'Virtual HP tap'), ' — explanatory, at compressor discharge. Not a manufacturer service port.'),
      html('li', {}, html('b', {}, 'Virtual LP tap'), ' — explanatory, at compressor suction. Not a manufacturer service port.'))));

  // ---------- tabs ----------
  const panels: Record<SidebarTab, HTMLElement> = { rooms: roomsPanel, equipment: eqPanel, pipes: pipesPanel, advanced: advPanel };
  const tabBtns = TABS.map((t) => {
    const b = html('button', { type: 'button', role: 'tab', id: `tab-${t.id}`, 'aria-controls': `panel-${t.id}`, class: 'tab' }, t.label);
    b.addEventListener('click', () => store.update((s) => { s.ui.tab = t.id; }));
    b.addEventListener('keydown', (e) => {
      const idx = TABS.findIndex((x) => x.id === t.id);
      const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (step === 0) return;
      const target = TABS[(idx + step + TABS.length) % TABS.length];
      if (!target) return;
      e.preventDefault();
      store.update((s) => { s.ui.tab = target.id; });
      document.getElementById(`tab-${target.id}`)?.focus();
    });
    return b;
  });
  const root = html('aside', { class: 'sidebar', 'aria-label': 'Configuration' },
    pinned,
    html('div', { class: 'tabs', role: 'tablist' }, ...tabBtns),
    html('div', { class: 'panels' }, roomsPanel, eqPanel, pipesPanel, advPanel));

  function sync(): void {
    const { cfg: c, ui } = store.state;
    const live = isLive();
    const rd = currentReadings(store.state);
    const fx = fixtureFor(c.mode, c.example);
    TABS.forEach((t, i) => {
      const on = ui.tab === t.id;
      tabBtns[i]?.setAttribute('aria-selected', String(on));
      tabBtns[i]?.setAttribute('tabindex', on ? '0' : '-1');
      panels[t.id].hidden = !on;
    });
    for (const f of fields) f.refresh();
    (taps as HTMLInputElement).checked = ui.showTaps;
    (labels as HTMLInputElement).checked = ui.showLabels;

    // Weather: always visible. Live states what it drives; only the examples compare against a fixture.
    const same = c.outdoorC === fx.conditions.outdoorC && c.outdoorRh === fx.conditions.outdoorRh;
    pinnedNote.textContent = live ? 'drives live model' : 'configured · readings stay fixture';
    envStatus.textContent = live
      ? 'Drives live model: changes reach the engine.'
      : `Fixture: ${fmt(fx.conditions.outdoorC, 1)} °C / ${fx.conditions.outdoorRh} % RH — ${same ? 'matches.' : 'differs; readings unchanged.'}`;
    envStatus.classList.toggle('diff', !live && !same);
    matchBtn.hidden = live || same;

    outdoorNote.textContent = c.outdoorKind === 'owner'
      ? `Declared by owner; exact suffix and nameplate unknown. ${OWNER_PORTS} refrigerant ports, factory R32. Selecting more than ${OWNER_PORTS} units switches to a generic outdoor group.`
      : 'Illustrative generic compatible group with one port per indoor unit. Casing drawn at the same envelope for comparison; not a catalogue product.';
    notice.hidden = !ui.notice;
    notice.textContent = ui.notice ?? '';
    unitSelects.forEach((s, i) => {
      s.root.hidden = i >= c.unitCount;
      const opts = classOptions();
      Array.from(s.sel.options).forEach((o, k) => { o.disabled = !!opts[k]?.disabled; });
      s.refresh();
    });
    etaStatus.textContent = live ? 'Drives live model.'
      : c.etaIsPct === 70 ? 'Matches the fixture value (70 %).' : `Differs from the fixture's 70 %. Edits configuration only; readings do not respond.`;
    etaStatus.classList.toggle('diff', !live && c.etaIsPct !== 70);
    cleanStatus.textContent = live ? 'Drives live model.' : 'Configuration and illustration only; fixed example readings do not change.';
    cleanStatus.classList.toggle('diff', !live);
    cleanNote.textContent = live
      ? 'Generic clear-area surrogate: scales coil air-side conductance and air mass flow. Refrigerant-side UA is unchanged. Forced fans draw their rated constant power because no fan or system curve is calibrated. No manufacturer lookup; protection or model-domain limits may appear at heavy fouling, and operation at 10 % is not guaranteed.'
      : 'Stored for Live. The Examples ignore it: their readings are fixed snapshots, and only the coil illustration follows it.';
    liveStatusNote.textContent = live ?'Drives live model.' : 'Stored for Live; the Examples ignore these values.';
    liveStatusNote.classList.toggle('diff', !live);

    roomsLead.textContent = live
      ? 'Volume, heat-loss coefficient and setpoint drive the live model. Initial room temperature is applied when you press Reset.'
      : 'Configuration inputs. Fixture supply-air readings do not respond to them.';
    airFields.forEach((f) => relabel(f, live ? 'Initial room temperature (on Reset)' : 'Room air temperature (input)', '°C'));
    roomCards.forEach((card, i) => {
      card.hidden = i >= c.unitCount;
      const r = c.rooms[i];
      const t = (card as HTMLElement & { titleEl?: HTMLElement }).titleEl;
      if (r && t) t.textContent = `${r.name} · ${r.indoorClass}`;
      card.classList.toggle('picked', ui.selected === `indoor:${i}`);
      const eng = rd.engine?.rooms[i];
      const now = nowLines[i];
      if (now) {
        now.hidden = !live;
        now.textContent = eng ? `Now ${fmt(eng.temperatureC, 1)} °C · ${fmt(eng.relativeHumidity * 100, 0)} % RH` : 'Now — °C · — % RH';
      }
    });
    if (ui.selected !== lastSelected) {
      lastSelected = ui.selected;
      const m = /^indoor:(\d+)$/.exec(ui.selected ?? '');
      if (m && ui.tab === 'rooms') roomCards[Number(m[1])]?.scrollIntoView({ block: 'nearest' });
    }

    pipeModeNote.textContent = c.live.fieldLines === 'idealized'
      ? `Idealized field lines: the engine receives zero-length lines, so pipe effects (line pressure drop, heat exchange, elevation) are explicitly excluded.${PHYSICAL_FIELD_LINES_AVAILABLE ? '' : ' The physical option is disabled until the runtime owner enables it.'}`
      : 'Physical field lines: actual distributed homogeneous pipe model with assumed bore and outdoor-air exposure. Fittings, oil, charge, slip and sonic regimes are not modelled; a high-loss operating point fails visibly.';
    const wallLine = (label: string, od: number): string => {
      const w = pipeWallMmForOd(od, c.live.pipeWallThicknessMm);
      return `${label} OD ${fmt(od, 2)} → wall ${fmt(w, 2)}, bore ${fmt(od - 2 * w, 2)}`;
    };
    wallReadout.textContent = `Effective wall (mm, max of configured and declared family minimum; not measured): ${
      c.pipes.slice(0, c.unitCount).map((p, k) => `${c.rooms[k]?.name ?? `Branch ${k + 1}`}: ${wallLine('liquid', p.liquidOdMm)}; ${wallLine('gas', p.gasOdMm)}`).join(' | ')}. ${
      c.live.fieldLines === 'idealized' ? 'No effect while lines are idealized.' : 'Bore is OD − 2 × wall.'}${live ? '' : ' Stored for Live only.'}`;
    pipesLead.textContent = live && c.live.fieldLines === 'idealized'
      ? 'In this reference mode, line length and outside diameter configure the illustration and the installation-guidance check only; they do not change engine results. Owner-preset defaults are the historical blog values 7.5 / 6.5 / 14 m (ground / first / attic); the as-built survey is unknown.'
      : 'Physical line length is separate from the drawn route. Stored defaults for the owner preset are the historical blog values 7.5 / 6.5 / 14 m (ground / first / attic); the as-built survey and diameters are unknown. Diameter changes redraw tube width only.';
    let total = 0;
    pipeCards.forEach((card, i) => {
      card.hidden = i >= c.unitCount;
      const p = c.pipes[i];
      const r = c.rooms[i];
      if (!p || !r) return;
      if (i < c.unitCount) total += p.lengthM;
      pipeTitles[i]!.textContent = `${r.name} line set`;
      const owner = p.lengthSource === 'owner-reported';
      const chip = pipeChips[i]!;
      chip.textContent = owner ? 'owner-reported · historical' : p.lengthSource === 'edited' ? 'edited by you' : 'default · no source';
      chip.className = `chip ${owner ? 'src' : p.lengthSource === 'edited' ? 'edit' : 'def'}`;
      card.classList.toggle('picked', ui.selected === `pipe:${i}`);
    });
    const issues: string[] = [];
    c.pipes.slice(0, c.unitCount).forEach((p, i) => {
      const name = c.rooms[i]?.name ?? `Branch ${i + 1}`;
      if (p.lengthM < 3) issues.push(`${name} ${fmt(p.lengthM, 1)} m is below the 3 m minimum`);
      else if (p.lengthM > 25) issues.push(`${name} ${fmt(p.lengthM, 1)} m exceeds the 25 m maximum`);
    });
    if (total > 50) issues.push(`total ${fmt(total, 1)} m exceeds 50 m`);
    const owner = c.outdoorKind === 'owner';
    pipeTotals.replaceChildren(html('p', { class: `status${issues.length && owner ? ' diff' : ''}` },
      `Total one-way length ${fmt(total, 1)} m. ` + (owner
        ? `Family guidance (2019, N2 variant; not verified exact N8 installation compliance): 3–25 m per branch, ≤ 50 m total, standard charge to 30 m. ${issues.length ? `Outside the guidance: ${issues.join('; ')}.` : 'Lengths are inside these ranges.'} Heights unknown.`
        : 'Generic group: no published limits attached.')));
  }

  return { root, sync, setTab: (t) => store.update((s) => { s.ui.tab = t; }) };
}
