import type { Field } from './controls';
import { nextId, segmented, select, setHtml, slider } from './controls';
import { clamp, fmt, html, setText, toggleClass } from './dom';
import { defaultEngineConfig } from './engine/defaults';
import { fixtureFor } from './fixtures';
import { inspectorHtml } from './inspector';
import type { PopContent } from './popovers';
import { PHYSICAL_FIELD_LINES_AVAILABLE, defaultLiveParameters, pipeWallMmForOd } from './runtime/config';
import type { LiveParameters } from './runtime/config';
import { currentReadings, indoorCleanliness, outdoorCleanliness, store } from './state';
import type { AppState, IndoorClass, Mode, OutdoorKind, PipeConfig, RoomConfig } from './types';
import { CLEANLINESS_MAX_PCT, CLEANLINESS_MIN_PCT, INDOOR_CLASSES, OWNER_PORTS, outdoorPortCapacity } from './types';

/**
 * Object-scoped controls. Every editable property has exactly one bound control instance, owned by the object it belongs to:
 * the outdoor-unit card and its settings popover, the room panel (in scene.ts) and the single room settings popover,
 * and the single line-set popover. Popover contents are indexed (room / branch) and rebind on open; their inputs are built
 * once and refresh() never rewrites a focused input.
 */

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
const ETA_FIXTURE_PCT = 70;

/** Controls embedded in the scene never reach the window shortcuts (Escape still passes so popovers can close). */
export function isolate(...els: HTMLElement[]): void {
  for (const el of els) {
    for (const ev of ['dblclick', 'keydown', 'keyup'] as const) {
      el.addEventListener(ev, (e) => { if (!(e instanceof KeyboardEvent && e.key === 'Escape')) e.stopPropagation(); });
    }
  }
}

// ---------- compact number + range pair ----------
export interface PairOpts {
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  digits: number;
  get(): number;
  set(v: number): void;
  /** block: label and note, big value, range · line: label and value on one row, range below · inline: one row. */
  layout?: 'block' | 'line' | 'inline';
  title?: string;
}

export interface PairField extends Field {
  num: HTMLInputElement;
  range: HTMLInputElement;
  /** Right-aligned note in the block layout's head row. */
  note: HTMLElement;
}

/**
 * Native number + range bound to one configuration value. The number commits valid in-range values while typing and
 * clamps on change; refresh() never rewrites a focused input.
 */
export function pairField(o: PairOpts): PairField {
  const layout = o.layout ?? 'block';
  const aria = `${o.label} [${o.unit}]`;
  const num = html('input', { type: 'number', class: 'rp-num rp-ctl', min: o.min, max: o.max, step: o.step, inputmode: 'decimal', 'aria-label': aria });
  const range = html('input', { type: 'range', class: 'rp-range rp-ctl', min: o.min, max: o.max, step: o.step, 'aria-label': aria });
  const note = html('span', { class: 'rp-n' });
  const key = html('span', { class: 'rp-k' }, o.label);
  const val = html('span', { class: 'rp-line' }, num, html('small', {}, o.unit));
  const root = layout === 'block'
    ? html('div', { class: 'pf block' }, html('div', { class: 'pf-head' }, key, note), val, range)
    : layout === 'line'
      ? html('div', { class: 'pf line' }, html('div', { class: 'pf-head' }, key, val), range)
      : html('div', { class: 'pf inline' }, key, val, range);
  if (o.title) { root.title = o.title; num.title = o.title; range.title = o.title; }
  const round = (v: number): number => Math.round(v * 10 ** o.digits) / 10 ** o.digits;
  range.addEventListener('input', () => { const v = Number(range.value); if (Number.isFinite(v)) o.set(v); });
  num.addEventListener('input', () => {
    const v = Number(num.value);
    if (num.value !== '' && Number.isFinite(v) && v >= o.min && v <= o.max) o.set(round(v));
  });
  num.addEventListener('change', () => {
    const v = Number(num.value);
    if (num.value === '' || !Number.isFinite(v)) { num.value = o.get().toFixed(o.digits); return; }
    const c = round(clamp(v, o.min, o.max));
    num.value = c.toFixed(o.digits);
    o.set(c);
  });
  isolate(num, range);
  const refresh = (): void => {
    const v = o.get();
    const t = v.toFixed(o.digits);
    if (document.activeElement !== num && num.value !== t) num.value = t;
    if (document.activeElement !== range && Number(range.value) !== v) range.value = String(v);
  };
  refresh();
  return { root, num, range, note, refresh };
}

/**
 * "Follow the shared default" checkbox plus an override control. The override is stored as null while following.
 * Both inputs are built once; the override stays mounted (hidden) while following.
 */
function cleanOverride(o: {
  label: string;
  make: (p: PairOpts) => Field;
  global(): number;
  get(): number | null;
  set(v: number | null): void;
  describe(follows: boolean, globalPct: number): string;
}): Field {
  const id = nextId('c');
  const box = html('input', { type: 'checkbox', id, class: 'rp-ctl' });
  const text = html('span', {});
  const label = html('label', { class: 'check rp-ctl', for: id }, box, text);
  const range = o.make({
    label: o.label, unit: '% clear', min: CLEANLINESS_MIN_PCT, max: CLEANLINESS_MAX_PCT, step: 1, digits: 0, layout: 'line',
    get: () => o.get() ?? o.global(), set: (v) => o.set(v),
  });
  box.addEventListener('change', () => o.set(box.checked ? null : o.global()));
  isolate(box, label);
  const root = html('div', { class: 'field clean-override' }, label, range.root);
  return {
    root,
    refresh(): void {
      const follows = o.get() === null;
      box.checked = follows;
      setText(text, o.describe(follows, o.global()));
      range.root.hidden = follows;
      range.refresh();
    },
  };
}

function relabel(f: Field, text: string, unit: string): void {
  const l = f.root.querySelector('label');
  if (l && l.textContent !== text) l.textContent = text;
  f.root.querySelector('input.num')?.setAttribute('aria-label', `${text} [${unit}]`);
}

function fold(title: string, open: boolean, ...kids: Node[]): HTMLDetailsElement {
  return html('details', { class: 'fold', open: open ? '' : undefined }, html('summary', {}, title), html('div', { class: 'fold-body' }, ...kids));
}

const classOptions = (): { value: IndoorClass; text: string; disabled?: boolean }[] =>
  (Object.keys(INDOOR_CLASSES) as IndoorClass[]).map((k) => ({
    value: k, text: INDOOR_CLASSES[k].label,
    disabled: store.state.cfg.outdoorKind === 'owner' && INDOOR_CLASSES[k].generic,
  }));

// ---------- outdoor unit card (scene, beside the outdoor drawing) ----------
export interface OutdoorUnitCard {
  root: HTMLElement;
  settingsButton: HTMLButtonElement;
  sync(s: AppState): void;
  setOutlet(value: string, note: string): void;
  setIce(value: string, note: string, held: boolean): void;
}

const ETA = { min: 40, max: 90 } as const;

export function createOutdoorUnitCard(onSettings: () => void): OutdoorUnitCard {
  const cfg = () => store.state.cfg;
  const fields: Field[] = [];
  const reg = <T extends Field>(f: T): T => { fields.push(f); return f; };

  // Heating / Cooling belongs to the exterior unit. Semantics are the former header's: Live edits the mode only,
  // Examples load that mode's fixture conditions once.
  const mode = reg(segmented<Mode>({
    label: 'Mode', compact: true,
    options: [{ value: 'heating', text: 'Heating' }, { value: 'cooling', text: 'Cooling' }],
    get: () => cfg().mode,
    set: (m) => (store.state.ui.experience === 'live' ? store.setMode(m) : store.loadExample(m, store.state.cfg.example)),
  }));
  const model = reg(segmented<OutdoorKind>({
    label: 'Outdoor model', compact: true,
    options: [
      { value: 'owner', text: '3MXM52N8', title: `Daikin 3MXM52N8, owner preset (${OWNER_PORTS} ports)` },
      { value: 'generic', text: 'Generic', title: 'Generic compatible multi-split outdoor with an assumed port capacity' },
    ],
    get: () => cfg().outdoorKind, set: (v) => store.setOutdoorKind(v),
  }));

  // Port capacity is an equipment specification, distinct from how many rooms are connected (rooms are added and removed in the
  // indoor zone). Owner: fixed at the declared 3. Generic: a native integer field, no arbitrary upper limit, a scenario assumption.
  const capInput = html('input', {
    type: 'number', class: 'rp-num rp-ctl ou-cap', min: 1, step: 1, inputmode: 'numeric',
    'aria-label': 'Generic outdoor port capacity (assumption)', title: 'Assumed number of refrigerant ports of the generic group. A scenario assumption, not manufacturer data.',
  });
  const capFixed = html('span', { class: 'ou-fixed', title: 'Owner-declared port count of the 3MXM52N8; fixed. Choose Generic to explore more connections.' }, `${OWNER_PORTS} · declared`);
  const capNote = html('span', { class: 'rp-n ou-cap-note' });
  const commitCap = (strict: boolean): void => {
    const v = Number(capInput.value);
    if (capInput.value === '' || !Number.isSafeInteger(v) || v < 1) return;
    // While typing, never shrink the connected rooms on a half-typed number ("1" on the way to "12"); Enter or blur commits it.
    if (!strict && v < cfg().unitCount) return;
    if (v !== cfg().genericPortCapacity) store.setGenericPortCapacity(v);
  };
  capInput.addEventListener('input', () => commitCap(false));
  capInput.addEventListener('change', () => {
    commitCap(true);
    capInput.value = String(cfg().genericPortCapacity);
  });
  isolate(capInput);
  const portsField: Field = {
    root: html('span', { class: 'ou-ports' }, capInput, capFixed, capNote),
    refresh(): void {
      const generic = cfg().outdoorKind === 'generic';
      capInput.hidden = !generic;
      capFixed.hidden = generic;
      if (document.activeElement !== capInput) capInput.value = String(cfg().genericPortCapacity);
      setText(capNote, generic ? 'assumed' : 'fixed');
    },
  };
  fields.push(portsField);
  const eta = reg(pairField({
    label: 'Compressor efficiency ηis', unit: '%', min: ETA.min, max: ETA.max, step: 1, digits: 0, layout: 'line',
    get: () => cfg().etaIsPct, set: (v) => store.update((s) => { s.cfg.etaIsPct = v; }),
    title: 'Ratio of ideal isentropic to actual compression work. Motor and drive losses are separate.',
  }));
  const cleanGlobal = reg(pairField({
    label: 'Cleanliness, shared by all coils', unit: '% clear', min: CLEANLINESS_MIN_PCT, max: CLEANLINESS_MAX_PCT, step: 1, digits: 0, layout: 'line',
    get: () => cfg().live.cleanlinessPct, set: (v) => store.update((s) => { s.cfg.live.cleanlinessPct = v; }),
    title: 'Shared default for the outdoor coil and every indoor coil: 100 % clean, 10 % = 90 % of the clear air passage obstructed. Each coil can override it.',
  }));
  const cleanOutdoor = reg(cleanOverride({
    label: 'Outdoor coil override',
    make: pairField,
    global: () => cfg().live.cleanlinessPct,
    get: () => cfg().live.outdoorCleanlinessOverridePct,
    set: (v) => store.update((s) => { s.cfg.live.outdoorCleanlinessOverridePct = v; }),
    describe: (follows, g) => (follows ? `Outdoor coil follows the shared default (${fmt(g, 0)} %)` : `Outdoor coil override (shared default ${fmt(g, 0)} %)`),
  }));

  const readCell = (k: string, unit: string): { root: HTMLElement; v: HTMLElement; n: HTMLElement } => {
    const v = html('span', { class: 'rp-v' });
    const n = html('span', { class: 'rp-n' });
    return { root: html('div', { class: 'rp-card' }, html('span', { class: 'rp-k' }, k), html('span', { class: 'rp-line' }, v, html('small', {}, unit)), n), v, n };
  };
  const outlet = readCell('Fan air out', '°C');
  const ice = readCell('Coil ice', 'kg');

  const modelText = html('span', { class: 'ou-model' });
  const gear = html('button', { type: 'button', class: 'rp-btn rp-ctl', 'aria-haspopup': 'dialog', 'aria-label': 'Outdoor unit settings' }, 'Settings');
  gear.addEventListener('click', onSettings);
  const slot = html('p', { class: 'ou-slot', role: 'status' });

  const row = (k: string, f: Field): HTMLElement => html('div', { class: 'ou-row' }, html('span', { class: 'rp-k' }, k), f.root);
  const root = html('div', { class: 'rp ou' },
    html('div', { class: 'ou-head' }, html('span', { class: 'ou-title' }, 'OUTDOOR UNIT'), modelText, gear),
    row('Mode', mode), row('Model', model), row('Ports', portsField),
    eta.root, cleanGlobal.root, cleanOutdoor.root,
    slot,
    html('div', { class: 'ou-read' }, outlet.root, ice.root));
  isolate(root);

  return {
    root,
    settingsButton: gear,
    sync(s: AppState): void {
      const c = s.cfg;
      const live = s.ui.experience === 'live';
      for (const f of fields) f.refresh();
      setText(modelText, c.outdoorKind === 'owner' ? `Daikin 3MXM52N8 · ${OWNER_PORTS} ports` : `Generic compatible · ${outdoorPortCapacity(c)} ports assumed`);
      const scope = live
        ? 'Live: efficiency and cleanliness drive the model.'
        : `Examples: fixed readings. Efficiency and cleanliness edit configuration only (fixture ηis ${ETA_FIXTURE_PCT} %).`;
      const text = s.ui.notice ?? scope;
      setText(slot, text);
      slot.title = text;
      slot.dataset.kind = s.ui.notice ? 'notice' : 'scope';
    },
    setOutlet(value, note): void { setText(outlet.v, value); setText(outlet.n, note); },
    setIce(value, note, held): void { setText(ice.v, value); setText(ice.n, note); toggleClass(ice.n, 'held', held); },
  };
}

// ---------- outdoor unit settings popover ----------
export function createOutdoorSettings(): PopContent {
  const cfg = () => store.state.cfg;
  const fields: Field[] = [];
  const reg = <T extends Field>(f: T): T => { fields.push(f); return f; };
  const folds = new Map<string, HTMLDetailsElement>();
  const keyed = (key: string, d: HTMLDetailsElement): HTMLDetailsElement => { folds.set(key, d); return d; };

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
  const note = (): HTMLElement => html('p', { class: 'status' });
  const outdoorNote = html('p', { class: 'hint lead' });
  const coilStatus = note();
  const compStatus = note();
  const sharedStatus = note();
  const cleanStatus = note();
  const cleanNote = html('p', { class: 'hint' });
  const etaStatus = note();

  const coil = keyed('coil', fold('Outdoor coil and air (generic assumptions)', true,
    html('p', { class: 'hint' }, 'Heat-engine assumptions, not measured values and not manufacturer data. Conductances are UA in W/K, not areas. Most numeric bounds are 0.2×–5× the engine default, with physical exceptions (for example the compressor speed floor); they are generic assumptions, not manufacturer limits.'),
    html('p', { class: 'hint' }, 'Bounded generic coverage: outdoor air −25…45 °C (the weather inputs\' range). Inside it the subcritical R32 cycle needs evaporating ≥ −40 °C and condensing ≤ 65 °C, within generic discharge-temperature and pressure-ratio caps; outside them the run fails visibly instead of extrapolating. The diagram\'s temperature colours (−40…145 °C refrigerant, −30…50 °C air) are display ranges, not operating limits, and 105 °C and above is hot discharge vapour, not a liquid temperature.'),
    coilStatus,
    liveField('outdoorAirConductanceWK', 'Outdoor coil air-side UA', 'W/K').root,
    liveField('outdoorRefrigerantConductanceWK', 'Outdoor coil refrigerant-side UA', 'W/K').root,
    liveField('outdoorAirMassFlowKgs', 'Outdoor air mass flow', 'kg/s').root,
    liveField('depositionAreaM2', 'Outdoor frost deposition area', 'm²', 'Generic assumption for the frost model; not the manufacturer finned area.').root));
  const comp = keyed('compressor', fold('Compressor assumptions', false,
    html('p', { class: 'hint' }, 'Isentropic efficiency ηis is edited on the outdoor-unit card.'), etaStatus, compStatus,
    liveField('compressorDisplacementCm3', 'Compressor displacement', 'cm³/rev').root,
    liveField('compressorMaxSpeedRps', 'Compressor maximum speed', 'rps', `Not below the engine minimum speed (${fmt(SPEED_MIN_RPS, 0)} rps).`, SPEED_MIN_RPS).root));
  const clean = keyed('clean', fold('Heat-exchanger cleanliness', false,
    html('p', { class: 'hint' }, 'The shared default and the outdoor-coil override are on the outdoor-unit card; each indoor coil overrides it in its own room settings. 100 % = clean coil; 10 % = only 10 % of the clear air passage remains (90 % obstructed).'),
    cleanStatus, cleanNote));
  const shared = keyed('shared', fold('Shared by all indoor units', false,
    html('p', { class: 'hint' }, 'One value applies to every indoor unit. These are not independent per-room physics, and model references never change them.'),
    sharedStatus,
    liveField('indoorAirConductanceWK', 'Indoor coil air-side UA (each unit)', 'W/K').root,
    liveField('indoorRefrigerantConductanceWK', 'Indoor coil refrigerant-side UA (each unit)', 'W/K').root,
    liveField('indoorAirMassFlowKgs', 'Indoor air mass flow (each unit)', 'kg/s').root));

  const pressure = reg(segmented({
    label: 'Pressure convention', compact: true,
    options: [{ value: 'abs', text: 'bar(a)', title: 'Absolute pressure' }, { value: 'gauge', text: 'bar(g)', title: 'Gauge = absolute − 1.01325 bar ambient' }],
    get: () => store.state.ui.pressure, set: (v) => store.update((s) => { s.ui.pressure = v; }),
  }));
  const taps = html('input', { type: 'checkbox', id: 'opt-taps' });
  const labels = html('input', { type: 'checkbox', id: 'opt-labels' });
  taps.addEventListener('change', () => store.update((s) => { s.ui.showTaps = taps.checked; }));
  labels.addEventListener('change', () => store.update((s) => { s.ui.showLabels = labels.checked; }));
  const display = keyed('display', fold('Display and pressure taps', false,
    html('div', { class: 'field' }, html('div', { class: 'field-head' }, html('span', { class: 'lab' }, 'Pressure convention')), pressure.root),
    html('label', { class: 'check', for: 'opt-taps' }, taps, 'Show pressure taps (physical service port and virtual taps)'),
    html('label', { class: 'check', for: 'opt-labels' }, labels, 'Component labels at outdoor zoom'),
    html('ul', { class: 'taps-list' },
      html('li', {}, html('b', {}, 'Physical service port'), ' — common gas node, fitted on the static gas stop valve. Role changes: HIGH side in heating, LOW side in cooling and defrost.'),
      html('li', {}, html('b', {}, 'Virtual HP tap'), ' — explanatory, at compressor discharge. Not a manufacturer service port.'),
      html('li', {}, html('b', {}, 'Virtual LP tap'), ' — explanatory, at compressor suction. Not a manufacturer service port.'))));

  const list = (items: ReadonlyArray<{ name: string; note: string; selected?: boolean }>, pending: boolean): HTMLElement =>
    html('ul', { class: 'fluids' }, ...items.map((f) =>
      html('li', { class: `${f.selected ? 'on' : 'off'}${pending ? ' pending' : ''}`, 'aria-disabled': f.selected ? undefined : 'true' },
        html('span', { class: 'fl-name' }, f.name), html('span', { class: 'fl-note' }, f.note))));
  const refrigerant = keyed('refrigerant', fold('Refrigerant (research gating)', false, list(FLUIDS, false)));
  const pending = keyed('pending', fold('Charge, leaks, oil and other (pending)', false, list(PENDING, true)));

  const root = html('div', { class: 'pop-settings' }, outdoorNote, coil, comp, clean, shared, display, refrigerant, pending);

  return {
    root,
    heading: (s) => ({ kicker: 'Outdoor unit settings', title: s.cfg.outdoorKind === 'owner' ? 'Daikin 3MXM52N8' : 'Generic compatible outdoor' }),
    reveal(key: string): void { const d = folds.get(key); if (d) d.open = true; },
    sync(s: AppState): void {
      const c = s.cfg;
      const live = s.ui.experience === 'live';
      for (const f of fields) f.refresh();
      taps.checked = s.ui.showTaps;
      labels.checked = s.ui.showLabels;
      setText(outdoorNote, c.outdoorKind === 'owner'
        ? `Declared by owner; exact suffix and nameplate unknown. ${OWNER_PORTS} refrigerant ports (fixed), factory R32. Choose Generic on the outdoor unit to explore more connections.`
        : `Illustrative generic compatible group. Its port capacity (${c.genericPortCapacity}) is a scenario assumption, not manufacturer data; rooms are added and removed in the indoor zone. Up to five ports it keeps the owner casing envelope; beyond that the casing is an assumed larger drawing, not a published dimension.`);
      const driven = live ? 'Drives live model.' : 'Stored for Live; the Examples ignore these values.';
      for (const p of [coilStatus, compStatus, sharedStatus]) { setText(p, driven); toggleClass(p, 'diff', !live); }
      setText(etaStatus, live ? 'ηis drives live model.'
        : c.etaIsPct === ETA_FIXTURE_PCT ? `Matches the fixture value (${ETA_FIXTURE_PCT} %).` : `Differs from the fixture's ${ETA_FIXTURE_PCT} %. Edits configuration only; readings do not respond.`);
      toggleClass(etaStatus, 'diff', !live && c.etaIsPct !== ETA_FIXTURE_PCT);
      const oc = outdoorCleanliness(c);
      setText(cleanStatus, `${live ? 'Drives live model.' : 'Configuration and illustration only; fixed example readings do not change.'} Outdoor coil effective: ${fmt(oc.pct, 0)} % clear (${oc.source === 'global' ? 'shared default' : 'override'}).`);
      toggleClass(cleanStatus, 'diff', !live);
      setText(cleanNote, live
        ? 'Generic clear-area surrogate: scales coil air-side conductance and air mass flow. Refrigerant-side UA is unchanged. Forced fans draw their rated constant power because no fan or system curve is calibrated. No manufacturer lookup; protection or model-domain limits may appear at heavy fouling, and operation at 10 % is not guaranteed.'
        : 'Stored for Live. The Examples ignore it: their readings are fixed snapshots, and only the coil illustration follows it.');
    },
  };
}

// ---------- room settings popover (one instance, rebinds to the opened room) ----------
export function createRoomSettings(openShared: () => void): PopContent {
  let idx = 0;
  const cfg = () => store.state.cfg;
  const room = (): RoomConfig | undefined => cfg().rooms[idx];
  const edit = (fn: (r: RoomConfig) => void): void => store.update((s) => { const r = s.cfg.rooms[idx]; if (r) fn(r); });
  const fields: Field[] = [];
  const reg = <T extends Field>(f: T): T => { fields.push(f); return f; };

  const lead = html('p', { class: 'hint lead' });
  const now = html('p', { class: 'live-now' });
  const offNote = html('p', { class: 'hint' });
  const air = reg(slider({
    label: 'Room air temperature (input)', unit: '°C', min: 5, max: 35, step: 0.5, digits: 1,
    get: () => room()?.airC ?? 20, set: (v) => edit((r) => { r.airC = v; }),
  }));
  const model = reg(select<IndoorClass>({
    label: 'Model reference (casing and label only)', options: classOptions(),
    get: () => room()?.indoorClass ?? 'FTXA25', set: (v) => edit((r) => { r.indoorClass = v; }),
  }));
  const modelHint = html('p', { class: 'hint' }, 'A model reference selects the drawn casing and its label only. It never changes live performance; capacity-class shares apply to the examples alone.');
  const dirt = reg(cleanOverride({
    label: 'Indoor coil override',
    make: slider,
    global: () => cfg().live.cleanlinessPct,
    get: () => room()?.cleanlinessOverridePct ?? null,
    set: (v) => edit((r) => { r.cleanlinessOverridePct = v; }),
    describe: (follows, g) => (follows ? `Follows the shared default (${fmt(g, 0)} % clear)` : `Own override (shared default ${fmt(g, 0)} %)`),
  }));
  const dirtStatus = html('p', { class: 'status' });
  const shareBtn = html('button', { type: 'button', class: 'btn ghost small' }, 'Open shared indoor assumptions');
  shareBtn.addEventListener('click', openShared);
  const detailBody = html('div', { class: 'fold-body' });
  const details = html('details', { class: 'fold' }, html('summary', {}, 'Details and readings'), detailBody);

  const root = html('div', { class: 'pop-settings' },
    lead, now, offNote, air.root,
    html('section', { class: 'sec' }, html('h3', {}, 'Indoor unit'), model.root, modelHint),
    html('section', { class: 'sec' }, html('h3', {}, 'Heat-exchanger cleanliness'), dirt.root, dirtStatus,
      html('p', { class: 'hint' }, 'Indoor coil air-side UA, refrigerant-side UA and air flow are shared assumptions: one value applies to every unit.'), shareBtn),
    details);

  return {
    root,
    heading: (s, i) => {
      const r = s.cfg.rooms[i];
      return { kicker: `Indoor unit ${i + 1} settings`, title: r ? `${r.name} · ${r.indoorClass}` : 'Indoor unit' };
    },
    sync(s: AppState, i: number): void {
      idx = i;
      const live = s.ui.experience === 'live';
      const r = s.cfg.rooms[i];
      for (const f of fields) f.refresh();
      const opts = classOptions();
      Array.from(model.sel.options).forEach((o, k) => { o.disabled = !!opts[k]?.disabled; });
      relabel(air, live ? 'Initial room temperature (on Reset)' : 'Room air temperature (input)', '°C');
      setText(lead, live
        ? 'Target, volume and heat loss drive the live model and are on the room card. Initial room temperature is applied when you press Reset.'
        : 'Configuration inputs. Fixture supply-air readings do not respond to them.');
      const eng = currentReadings(s).engine?.rooms[i];
      now.hidden = !live;
      setText(now, eng ? `Now ${fmt(eng.temperatureC, 1)} °C · ${fmt(eng.relativeHumidity * 100, 0)} % RH` : 'Now — °C · — % RH');
      offNote.hidden = !r || r.enabled;
      setText(offNote, live
        ? 'Heating/cooling for this room is requested off. The room still exchanges heat with outdoors and keeps its stored heat and moisture; the target stays editable.'
        : 'Requested off. Fixed snapshot readings, including this branch flow, are not recalculated.');
      const ic = indoorCleanliness(s.cfg, i);
      setText(dirtStatus, `${live ? 'Drives live model.' : 'Configuration and illustration only; fixed example readings do not change.'} Effective ${fmt(ic.pct, 0)} % clear (${ic.source === 'global' ? 'shared default' : 'override'}).`);
      toggleClass(dirtStatus, 'diff', !live);
      setHtml(detailBody, inspectorHtml(`indoor:${i}`, s));
    },
  };
}

// ---------- line-set popover (one instance, rebinds to the opened branch) ----------
export function createLinesSettings(): PopContent {
  let idx = 0;
  const cfg = () => store.state.cfg;
  const pipe = (): PipeConfig | undefined => cfg().pipes[idx];
  const edit = (fn: (p: PipeConfig) => void): void => store.update((s) => { const p = s.cfg.pipes[idx]; if (p) fn(p); });
  const fields: Field[] = [];
  const reg = <T extends Field>(f: T): T => { fields.push(f); return f; };

  const lead = html('p', { class: 'hint lead' });
  const chip = html('span', { class: 'chip' });
  const len = reg(slider({
    label: 'One-way line length', unit: 'm', min: 1, max: 40, step: 0.5, digits: 1, get: () => pipe()?.lengthM ?? 10,
    set: (v) => edit((p) => { p.lengthM = v; p.lengthSource = 'edited'; }),
  }));
  const liq = reg(select<string>({
    label: 'Liquid line OD [mm]', options: LIQUID_OD.map((d) => ({ value: String(d), text: `${d} mm` })),
    get: () => String(pipe()?.liquidOdMm ?? LIQUID_OD[0]), set: (v) => edit((p) => { p.liquidOdMm = Number(v); }),
  }));
  const gas = reg(select<string>({
    label: 'Gas line OD [mm]', options: GAS_OD.map((d) => ({ value: String(d), text: `${d} mm` })),
    get: () => String(pipe()?.gasOdMm ?? GAS_OD[0]), set: (v) => edit((p) => { p.gasOdMm = Number(v); }),
  }));
  const totals = html('div', { class: 'compare' });
  const stateBody = html('div', { class: 'fold-body' });

  const modeSeg = reg(segmented<LiveParameters['fieldLines']>({
    label: 'Field-line model', compact: true,
    options: [
      { value: 'idealized', text: 'Idealized (reference)', title: 'Zero-length lines: no pipe effects; faster default' },
      { value: 'physical', text: 'Physical (advanced)', title: 'Finite-pipe model: slower, uncalibrated assumptions, some regimes unsupported', disabled: !PHYSICAL_FIELD_LINES_AVAILABLE },
    ],
    get: () => cfg().live.fieldLines, set: (v) => store.update((s) => { s.cfg.live.fieldLines = v; }),
  }));
  const modeNote = html('p', { class: 'hint' });
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

  const root = html('div', { class: 'pop-settings' },
    lead, html('div', { class: 'chips' }, chip), len.root, html('div', { class: 'two' }, liq.root, gas.root), totals,
    fold('Field-line model (all branches)', false, modeSeg.root, modeNote),
    fold('Advanced pipe assumptions (all branches)', false, wall.root, insulation.root, wallReadout,
      html('p', { class: 'hint' }, 'Wall minimums are declared family assumptions from the installation guide, not installed-copper measurements and not verified for this N8 unit. Every line with non-zero heat transfer is modelled in outdoor air by assumption; unknown elevation is treated as level, not as the real geometry. Physical mode only: the model is a bounded homogeneous approximation that omits kinetic energy, slip, fittings, oil return and line charge, and is slower than the reference. In cooling, the controller targets each returning branch at a common suction superheat after line heat; this is separate from the idealized mode\'s conductance-weighted branch allocation and mixed-return control. Some unequal-coil transients and high-loss regimes may be unsupported: the run then fails visibly with conserved inventory rather than being made feasible silently. Results are not an accurate prediction of the installed line losses.')),
    html('details', { class: 'fold' }, html('summary', {}, 'State now'), stateBody));

  return {
    root,
    heading: (s, i) => ({ kicker: `Branch ${i + 1} line set`, title: `${s.cfg.rooms[i]?.name ?? 'Branch'} line set` }),
    sync(s: AppState, i: number): void {
      idx = i;
      const c = s.cfg;
      const live = s.ui.experience === 'live';
      for (const f of fields) f.refresh();
      const p = c.pipes[i];
      if (p) {
        const owner = p.lengthSource === 'owner-reported';
        setText(chip, owner ? 'owner-reported · historical' : p.lengthSource === 'edited' ? 'edited by you' : 'default · no source');
        chip.className = `chip ${owner ? 'src' : p.lengthSource === 'edited' ? 'edit' : 'def'}`;
      }
      setText(lead, live && c.live.fieldLines === 'idealized'
        ? 'In this reference mode, line length and outside diameter configure the illustration and the installation-guidance check only; they do not change engine results. Owner-preset defaults are the historical blog values 7.5 / 6.5 / 14 m (ground / first / attic); the as-built survey is unknown.'
        : 'Physical line length is separate from the drawn route. Stored defaults for the owner preset are the historical blog values 7.5 / 6.5 / 14 m (ground / first / attic); the as-built survey and diameters are unknown. Diameter changes redraw tube width only.');
      setText(modeNote, c.live.fieldLines === 'idealized'
        ? 'Idealized field lines: the engine receives zero-length lines, so pipe effects (line pressure drop, heat exchange, elevation) are explicitly excluded. This is the default reference; Physical is an optional, slower finite-pipe model.'
        : 'Physical field lines (advanced, slower): finite pipes with an uncalibrated homogeneous loss approximation, assumed bore, level elevation and outdoor-air exposure. Not a prediction of the installed line losses; some unequal-coil or high-loss cases may be unsupported and fail visibly. Details under Advanced pipe assumptions.');
      const wallLine = (label: string, od: number): string => {
        const w = pipeWallMmForOd(od, c.live.pipeWallThicknessMm);
        return `${label} OD ${fmt(od, 2)} → wall ${fmt(w, 2)}, bore ${fmt(od - 2 * w, 2)}`;
      };
      setText(wallReadout, `Effective wall (mm, max of configured and declared family minimum; not measured): ${
        c.pipes.slice(0, c.unitCount).map((q, k) => `${c.rooms[k]?.name ?? `Branch ${k + 1}`}: ${wallLine('liquid', q.liquidOdMm)}; ${wallLine('gas', q.gasOdMm)}`).join(' | ')}. ${
        c.live.fieldLines === 'idealized' ? 'No effect while lines are idealized.' : 'Bore is OD − 2 × wall.'}${live ? '' : ' Stored for Live only.'}`);

      let total = 0;
      const issues: string[] = [];
      c.pipes.slice(0, c.unitCount).forEach((q, k) => {
        total += q.lengthM;
        const name = c.rooms[k]?.name ?? `Branch ${k + 1}`;
        if (q.lengthM < 3) issues.push(`${name} ${fmt(q.lengthM, 1)} m is below the 3 m minimum`);
        else if (q.lengthM > 25) issues.push(`${name} ${fmt(q.lengthM, 1)} m exceeds the 25 m maximum`);
      });
      if (total > 50) issues.push(`total ${fmt(total, 1)} m exceeds 50 m`);
      const owner = c.outdoorKind === 'owner';
      totals.replaceChildren(html('p', { class: `status${issues.length && owner ? ' diff' : ''}` },
        `Total one-way length ${fmt(total, 1)} m. ` + (owner
          ? `Family guidance (2019, N2 variant; not verified exact N8 installation compliance): 3–25 m per branch, ≤ 50 m total, standard charge to 30 m. ${issues.length ? `Outside the guidance: ${issues.join('; ')}.` : 'Lengths are inside these ranges.'} Heights unknown.`
          : 'Generic group: no published limits attached.')));
      setHtml(stateBody, inspectorHtml(`pipe:${i}`, s));
    },
  };
}

/** Fixture comparison for the weather card, shared so the wording lives with the other outdoor scope text. */
export function weatherScope(s: AppState): { text: string; diff: boolean; same: boolean } {
  const live = s.ui.experience === 'live';
  const fx = fixtureFor(s.cfg.mode, s.cfg.example);
  const same = s.cfg.outdoorC === fx.conditions.outdoorC && s.cfg.outdoorRh === fx.conditions.outdoorRh;
  return live
    ? { text: 'Drives the live model: changes reach the engine.', diff: false, same }
    : { text: `Fixture ${fmt(fx.conditions.outdoorC, 1)} °C / ${fx.conditions.outdoorRh} % RH — ${same ? 'matches.' : 'differs; readings unchanged.'}`, diff: !same, same };
}
