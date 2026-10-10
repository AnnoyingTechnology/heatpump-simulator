import { createModelDiagnostics } from './chrome';
import type { Field } from './controls';
import { nextId, segmented, select, setHtml, slider } from './controls';
import { clamp, fmt, html, setAttr, setText, toggleClass } from './dom';
import { defaultEngineConfig } from './engine/defaults';
import { fixtureFor } from './fixtures';
import { inspectorHtml } from './inspector';
import type { PopContent } from './popovers';
import type { EngineOutput } from './engine/types';
import { CHARGE_MODEL_AVAILABLE, PHYSICAL_FIELD_LINES_AVAILABLE, defaultLiveParameters, pipeWallMmForOd } from './runtime/config';
import type { LiveParameters } from './runtime/config';
import { activeRooms, currentReadings, indoorCleanliness, outdoorCleanliness, store } from './state';
import type { AppState, Experience, ExampleState, IndoorClass, Mode, OutdoorKind, PipeConfig, RoomConfig } from './types';
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

/** References only; none of these is modelled or editable yet. Charge lives in the inventory model. */
const PENDING: ReadonlyArray<{ name: string; note: string }> = [
  { name: 'Oil', note:'Pending reference · no lubricant circulation or solubility model' },
  { name: 'Other', note: 'Pending reference · moisture, non-condensables and contamination are not modelled' },
];

/** Plain positive numeric parameters on the generic 0.2×–5× helper. Cleanliness, wall, insulation, the nullable outdoor override and the mode have their own controls. */
type LiveKey = { [K in keyof LiveParameters]: LiveParameters[K] extends number ? K : never }[keyof LiveParameters];

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

// ---------- envelope heat-loss guide (local, non-modal help in the scene) ----------
/** Reference bands supplied for this simulator. Their reference size, boundaries and air exchange are unspecified: never scaled or applied. */
const HEAT_LOSS_BANDS: ReadonlyArray<readonly [string, string]> = [
  ['Before 1974', '650–850'], ['RT 1974', '400–600'], ['RT 1982', '350–480'], ['RT 1988', '300–400'],
  ['RT 2000', '240–340'], ['RT 2005', '200–300'], ['RT 2012', '110–180'], ['RE 2020 (from 2022)', '80–150'],
];

const HEAT_LOSS_SOURCES: ReadonlyArray<readonly [string, string]> = [
  ['Th-Bat general rules', 'https://rt-re-batiment.developpement-durable.gouv.fr/IMG/pdf/1-fascicule_generalites.pdf'],
  ['3CL-DPE method', 'https://rt-re-batiment.developpement-durable.gouv.fr/IMG/pdf/annexe_methode_de_calcul_3cl-dpe_v1.3.pdf'],
  ['FAQ RE2020 141', 'https://rt-re-batiment.developpement-durable.gouv.fr/faq-re2020-141-comment-calculer-la-surface-a811.html'],
];

/** Envelope loss bounds [W/K]: wide enough for raw illustrative scenarios; no normative default is implied. */
export const ENVELOPE_LOSS = { min: 0, max: 1000, step: 1 } as const;

export interface HeatLossGuide {
  /** The panel; the scene mounts it once, above every room, and places it beside the room it is open for. */
  root: HTMLElement;
  /** Room index the guide is open for, or -1. */
  readonly open: number;
  /** Help button of room `i`; one click toggles the guide for that room. */
  button(i: number): HTMLButtonElement;
  close(): void;
  /** Called after every open / close so the scene can place the panel. */
  onChange: () => void;
}

export function createHeatLossGuide(): HeatLossGuide {
  const id = nextId('hl-guide');
  const buttons: HTMLButtonElement[] = [];
  let open = -1;
  const x = html('button', { type: 'button', class: 'hl-x rp-ctl', 'aria-label': 'Close heat-loss guide' }, '×');
  const link = ([text, href]: readonly [string, string]): HTMLElement =>
    html('a', { href, target: '_blank', rel: 'noopener noreferrer' }, text);
  const sources = html('p', { class: 'hl-src' }, 'Calculation basis: ');
  HEAT_LOSS_SOURCES.forEach((s, k) => sources.append(...(k ? [' · '] : []), link(s)));
  const root = html('section', { id, class: 'hl-guide rp-ctl', role: 'dialog', 'aria-label': 'Envelope heat-loss guide', hidden: true },
    html('header', { class: 'hl-head' }, html('b', {}, 'Envelope heat loss (W/K)'), x),
    html('p', { class: 'hl-eq' }, 'Heat loss [W] ≈ H [W/K] × (T indoor − T outdoor) [K]'),
    html('p', {}, 'Example: H = 200 W/K with a 20 K difference loses about 4 kW.'),
    html('p', {}, html('b', {}, 'This slider is envelope loss only'), ' (walls, glazing, roof, floor, thermal bridges). Ventilation and infiltration are modelled separately: do not add them here.'),
    html('p', {}, 'Floor area and ceiling height give the volume, not H. H depends on which surfaces are exposed, their construction and the bridges between them.'),
    html('table', { class: 'hl-tbl' },
      html('caption', {}, 'Reference bands supplied for this simulator'),
      html('thead', {}, html('tr', {}, html('th', { scope: 'col' }, 'Construction era'), html('th', { scope: 'col' }, 'Indicative H (W/K)'))),
      html('tbody', {}, ...HEAT_LOSS_BANDS.map(([era, band]) => html('tr', {}, html('th', { scope: 'row' }, era), html('td', {}, band))))),
    html('p', { class: 'hl-note' }, 'Indicative only: the room size, exposed surfaces and air exchange behind these bands are unspecified. They are not RT/RE requirements and are never applied to a room automatically.'),
    sources);
  const guide: HeatLossGuide = {
    root,
    get open(): number { return open; },
    button(i): HTMLButtonElement {
      let b = buttons[i];
      if (!b) {
        b = html('button', { type: 'button', class: 'hl-btn rp-ctl', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', 'aria-controls': id, 'aria-label': 'Envelope heat-loss guide', title: 'Envelope heat-loss guide: equation and reference bands' }, '?');
        const btn = b;
        btn.addEventListener('click', () => { open = open === i ? -1 : i; apply(); });
        btn.addEventListener('keydown', esc);
        isolate(btn);
        buttons[i] = btn;
      }
      return b;
    },
    close(): void { if (open !== -1) { open = -1; apply(); } },
    onChange: () => {},
  };
  const apply = (): void => {
    root.hidden = open === -1;
    buttons.forEach((b, k) => setAttr(b, 'aria-expanded', k === open ? 'true' : 'false'));
    guide.onChange();
  };
  x.addEventListener('click', () => { const b = buttons[open]; guide.close(); b?.focus({ preventScroll: true }); });
  // Escape closes the guide and returns focus to the button that opened it.
  const esc = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape' || open === -1) return;
    e.stopPropagation();
    const b = buttons[open];
    guide.close();
    b?.focus({ preventScroll: true });
  };
  root.addEventListener('keydown', esc);
  isolate(x, root);
  return guide;
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

// ---------- refrigerant charge (inventory model) ----------
/** The active conserved-inventory circuit as reported by the engine; null in the reference model and whenever readings are withheld. */
export type Inventory = NonNullable<EngineOutput['inventory']>;

const near = (a: number, b: number): boolean => Math.abs(a - b) <= 1e-9 + 1e-6 * Math.abs(b);

/** Start temperature draft the active circuit was created with. The engine does not echo it, so it is captured whenever a new circuit starts. */
let appliedEpoch = -1;
let appliedFluidC: number | null = null;
function trackAppliedStart(): void {
  if (store.resetEpoch === appliedEpoch) return;
  appliedEpoch = store.resetEpoch;
  appliedFluidC = store.state.cfg.live.initialFluidTemperatureC;
}

/** Start values edited since the active circuit began; they only take effect on Restart. */
function pendingStartValues(cfg: AppState['cfg'], inv: Inventory): string[] {
  const live = cfg.live;
  const g = inv.geometry;
  const out: string[] = [];
  if (!near(live.initialChargeKg, inv.initialMassKg)) out.push('charge');
  if (live.initialFluidTemperatureC !== appliedFluidC) out.push('start temperature');
  let length = false;
  let bore = false;
  let volume = !near(live.outdoorCoilVolumeL / 1000, g.outdoorCoilVolumeM3) || !near(live.accumulatorVolumeL / 1000, g.accumulatorVolumeM3);
  activeRooms(cfg).forEach((r, i) => {
    const a = g.rooms.find((x) => x.id === r.id);
    const p = cfg.pipes[i];
    if (!a || !p) return;
    if (!near(p.lengthM, a.lineLengthM)) length = true;
    const gas = (p.gasOdMm - 2 * pipeWallMmForOd(p.gasOdMm, live.pipeWallThicknessMm)) / 1000;
    const small = (p.liquidOdMm - 2 * pipeWallMmForOd(p.liquidOdMm, live.pipeWallThicknessMm)) / 1000;
    if (!near(gas, a.gasInsideDiameterM) || !near(small, a.smallInsideDiameterM)) bore = true;
    if (!near(live.indoorCoilVolumeL / 1000, a.coilVolumeM3)) volume = true;
  });
  if (length) out.push('line length');
  if (bore) out.push('bores');
  if (volume) out.push('volumes');
  return out;
}

interface ChargeArea {
  root: HTMLElement;
  sync(s: AppState, inv: Inventory | null): void;
}

/** Charge is a start value for the next scenario, applied explicitly on Restart. */
function createChargeArea(): ChargeArea {
  const live = (): LiveParameters => store.state.cfg.live;
  const initial = pairField({
    label: 'Initial charge', unit: 'kg', min: 0.2, max: 3, step: 0.01, digits: 2, layout: 'line',
    get: () => live().initialChargeKg, set: (v) => store.update((s) => { s.cfg.live.initialChargeKg = v; }),
    title: 'Scenario start value, applied on Restart. Not a factory prediction.',
  });
  const remV = html('span', { class: 'rp-v' });
  const remN1 = html('span', { class: 'rp-n' });
  const remN2 = html('span', { class: 'rp-n' });
  const enable = html('button', { type: 'button', class: 'rp-btn rp-ctl' }, 'Enable inventory');
  enable.addEventListener('click', () => store.setCircuitModel('inventory'));
  const remaining = html('div', { class: 'rp-card ou-rem' },
    html('span', { class: 'rp-k' }, 'System charge'),
    html('span', { class: 'rp-line' }, remV, html('small', {}, 'kg')),
    remN1, remN2, enable);
  const restart = html('button', { type: 'button', class: 'rp-btn rp-ctl' }, 'Restart');
  restart.addEventListener('click', () => store.restartSimulation());
  const restartNote = html('span', { class: 'ou-rnote' });
  isolate(restart, enable);

  const root = html('section', { class: 'ou-charge', 'aria-label': 'Refrigerant charge' },
    html('div', { class: 'ou-ch-title' }, 'CHARGE'),
    remaining, initial.root,
    html('div', { class: 'ou-restart-row' }, restart, restartNote));

  return {
    root,
    sync(s, inv): void {
      trackAppliedStart();
      const cfg = s.cfg;
      const model = cfg.live.circuitModel;
      const inventory = model === 'inventory';
      const isLive = s.ui.experience === 'live';
      initial.refresh();
      if (inv) {
        setText(remV, fmt(inv.massKg, 3));
        setText(remN1, `started with ${fmt(inv.initialMassKg, 3)} kg`);
        setText(remN2, '');
      } else {
        setText(remV, '—');
        setText(remN1, !inventory ? 'reference model · no inventory' : !isLive ? 'Examples · not modelled' : 'waiting for the circuit');
        setText(remN2, !inventory && !CHARGE_MODEL_AVAILABLE ? 'inventory model gated' : '');
      }
      toggleClass(remV, 'na', !inv);
      remN2.hidden = remN2.textContent === '';
      enable.hidden = inventory;
      enable.disabled = !CHARGE_MODEL_AVAILABLE;
      setAttr(enable, 'title', CHARGE_MODEL_AVAILABLE
        ? 'Switch to the conserved-inventory circuit. Starts a new circuit from the start values.'
        : 'The conserved-inventory model is gated until its science review passes.');

      const drafts = inv ? pendingStartValues(cfg, inv) : [];
      restart.disabled = !inventory;
      toggleClass(restart, 'pending', drafts.length > 0);
      const rtext = !inventory ? 'start values apply with the inventory model' : drafts.length ? `pending: ${drafts.join(', ')}` : inv ? 'start values in use' : '';
      setText(restartNote, rtext);
      restartNote.title = rtext;
      setAttr(restart, 'title', 'Start a new circuit from the current start values (charge, start temperature, line length, bores, volumes). Resets simulated time.');

    },
  };
}

// ---------- outdoor unit card (scene, beside the outdoor drawing) ----------
export interface OutdoorUnitCard {
  root: HTMLElement;
  settingsButton: HTMLButtonElement;
  sync(s: AppState, inv: Inventory | null): void;
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
    label: 'Shared coil cleanliness', unit: '% clear', min: CLEANLINESS_MIN_PCT, max: CLEANLINESS_MAX_PCT, step: 1, digits: 0, layout: 'line',
    get: () => cfg().live.cleanlinessPct, set: (v) => store.update((s) => { s.cfg.live.cleanlinessPct = v; }),
    title: 'Shared default for the outdoor coil and every indoor coil: 100 % clean, 10 % = 90 % of the clear air passage obstructed. Each coil can override it.',
  }));
  const cleanOutdoor = reg(cleanOverride({
    label: 'Outdoor coil override',
    make: pairField,
    global: () => cfg().live.cleanlinessPct,
    get: () => cfg().live.outdoorCleanlinessOverridePct,
    set: (v) => store.update((s) => { s.cfg.live.outdoorCleanlinessOverridePct = v; }),
    describe: (follows, g) => (follows ? `Outdoor coil follows shared (${fmt(g, 0)} %)` : `Outdoor coil override (shared ${fmt(g, 0)} %)`),
  }));

  const modelText = html('span', { class: 'ou-model' });
  const gear = html('button', { type: 'button', class: 'rp-btn rp-ctl', 'aria-haspopup': 'dialog', 'aria-label': 'Outdoor unit settings' }, 'Settings');
  gear.addEventListener('click', onSettings);
  const slot = html('p', { class: 'ou-slot', role: 'status' });

  // Two columns: the machine's equipment settings and readouts at left, its refrigerant charge at right.
  const charge = createChargeArea();
  const root = html('div', { class: 'rp ou' },
    html('div', { class: 'ou-head' }, html('span', { class: 'ou-title' }, 'OUTDOOR UNIT'), modelText, gear),
    html('div', { class: 'ou-cols' },
      html('div', { class: 'ou-col' },
        mode.root, model.root,
        html('div', { class: 'ou-row' }, html('span', { class: 'rp-k' }, 'Ports'), portsField.root),
        eta.root, cleanGlobal.root, cleanOutdoor.root),
      charge.root),
    slot);
  isolate(root);

  return {
    root,
    settingsButton: gear,
    sync(s: AppState, inv: Inventory | null): void {
      const c = s.cfg;
      const live = s.ui.experience === 'live';
      for (const f of fields) f.refresh();
      charge.sync(s, inv);
      setText(modelText, c.outdoorKind === 'owner' ? `Daikin 3MXM52N8 · ${OWNER_PORTS} ports` : `Generic compatible · ${outdoorPortCapacity(c)} ports assumed`);
      const scope = live
        ? 'Generic R32 · uncalibrated. Efficiency and cleanliness drive the model.'
        : `Examples: fixed readings. Efficiency and cleanliness edit configuration only (fixture ηis ${ETA_FIXTURE_PCT} %).`;
      const rd = live && inv ? currentReadings(s) : null;
      const protectedCompressor = rd?.usable && rd.engine && rd.engine.diagnostics.demandSpeedRps > 0 && !inv!.compressorAdmitted;
      const envelopeHold=rd?.usable&&rd.engine&&rd.engine.diagnostics.demandSpeedRps>0?rd.engine.diagnostics.envelopeProtection:null;
      const restartDelay=rd?.usable?rd.engine?.diagnostics.restartDelaySeconds??0:0;
      const text = envelopeHold ? `Compressor stopped · ${envelopeHold} protection` : protectedCompressor ? 'Compressor stopped · liquid carryover protection' : restartDelay>0?`Compressor waiting · restart in ${fmt(restartDelay,0)} s`:s.ui.notice ?? scope;
      setText(slot, text);
      slot.title = text;
      slot.dataset.kind = envelopeHold || protectedCompressor || restartDelay>0 || s.ui.notice ? 'notice' : 'scope';
    },
  };
}

// ---------- outdoor unit settings popover ----------
export function createOutdoorSettings(): PopContent {
  const cfg = () => store.state.cfg;
  const fields: Field[] = [];
  const reg = <T extends Field>(f: T): T => { fields.push(f); return f; };
  const folds = new Map<string, HTMLDetailsElement>();
  const keyed = (key: string, d: HTMLDetailsElement): HTMLDetailsElement => { folds.set(key, d); return d; };

  const source = reg(select<Experience>({ label: 'Simulation source',
    options: [{ value: 'live', text: 'Live engine' }, { value: 'examples', text: 'Fixed examples' }],
    get: () => store.state.ui.experience, set: v => store.setExperience(v),
  }));
  const scenario = reg(select<ExampleState>({ label: 'Example scenario',
    options: [{ value: 'normal', text: 'Normal' }, { value: 'frost', text: 'Frosting' },
      { value: 'defrost', text: 'Defrost' }, { value: 'idle', text: 'Idle' }],
    get: () => cfg().example, set: v => store.loadExample(cfg().mode, v),
  }));
  const sourceSection = html('section', { class: 'sec' }, html('h3', {}, 'Simulation source'), source.root, scenario.root,
    html('p', { class: 'hint' }, 'Live uses the physical engine. Examples are fixed illustrative snapshots; their readings do not respond to settings. Switching sources preserves settings. Selecting an example loads its illustrative conditions.'));
  const diagnostics = createModelDiagnostics();

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
    html('label', { class: 'check', for: 'opt-taps' }, taps, 'Show pressure taps'),
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
  const pending = keyed('pending', fold('Oil and other (pending)', false, list(PENDING, true)));

  // Refrigerant charge model. Initial charge is edited on the outdoor-unit card; line length and bores on the line sets.
  const circuit = reg(segmented<LiveParameters['circuitModel']>({
    label: 'Refrigerant circuit model', compact: true,
    options: [
      { value: 'reference', text: 'Reference', title: 'Quasi-steady cycle without refrigerant inventory' },
      { value: 'inventory', text: 'Inventory', title: 'Conserved-mass circuit with charge and idealized field transport', disabled: !CHARGE_MODEL_AVAILABLE },
    ],
    get: () => cfg().live.circuitModel, set: (v) => store.setCircuitModel(v),
  }));
  const modelStatus = note();
  const draftStatus = note();
  const fluidAuto = html('input', { type: 'checkbox', id: 'opt-fluid-auto', class: 'rp-ctl' });
  const fluidAutoLabel = html('label', { class: 'check', for: 'opt-fluid-auto' }, fluidAuto, 'Start at outdoor air temperature');
  const fluidT = reg(slider({
    label: 'Initial fluid temperature', unit: '°C', min: -30, max: 60, step: 0.5, digits: 1,
    get: () => cfg().live.initialFluidTemperatureC ?? cfg().outdoorC,
    set: (v) => store.update((s) => { s.cfg.live.initialFluidTemperatureC = v; }),
  }));
  fluidAuto.addEventListener('change', () => store.update((s) => { s.cfg.live.initialFluidTemperatureC = fluidAuto.checked ? null : s.cfg.outdoorC; }));
  const guidance = html('p', { class: 'hint' });
  const charge = keyed('charge', fold('Refrigerant charge and circuit volumes', false,
    html('p', { class: 'hint' }, 'Inventory is a generic conserved-mass R32 circuit. Volumes, bores and start temperature are scenario assumptions, not OEM internals. The 1.8 kg default is documented for the specific 3MXM52N2V1B8 SKU; the full suffix and nameplate of the owner unit are unknown. Initial charge is a scenario setting, not a factory prediction.'),
    html('div', { class: 'field' }, html('div', { class: 'field-head' }, html('span', { class: 'lab' }, 'Circuit model')), circuit.root),
    modelStatus,
    html('p', { class: 'hint' }, 'Changing the model, or adding or removing a room while Inventory runs, starts a new circuit. Turning rooms On or Off never resets it.'),
    html('h3', {}, 'Start values (apply on Restart)'),
    draftStatus,
    liveField('outdoorCoilVolumeL', 'Outdoor coil volume', 'L').root,
    liveField('indoorCoilVolumeL', 'Indoor coil volume (each head)', 'L', 'The same value for every head.').root,
    liveField('accumulatorVolumeL', 'Accumulator volume', 'L').root,
    fluidAutoLabel, fluidT.root,
    html('p', { class: 'hint' }, 'Line volumes follow each branch\'s length and bores and are stored even though field transport is idealized. A start state that floods the circuit is rejected by the model.'),
    guidance));

  const root = html('div', { class: 'pop-settings' }, outdoorNote, sourceSection, coil, charge, comp, clean, shared, display, refrigerant, pending, diagnostics.root);

  return {
    root,
    heading: (s) => ({ kicker: 'Outdoor unit settings', title: s.cfg.outdoorKind === 'owner' ? 'Daikin 3MXM52N8' : 'Generic compatible outdoor' }),
    reveal(key: string): void { const d = folds.get(key); if (d) d.open = true; },
    sync(s: AppState): void {
      const c = s.cfg;
      const live = s.ui.experience === 'live';
      for (const f of fields) f.refresh();
      scenario.root.hidden = live;
      for (const option of scenario.sel.options) option.disabled = c.mode === 'cooling' && (option.value === 'frost' || option.value === 'defrost');
      diagnostics.sync(s);
      taps.checked = s.ui.showTaps;
      labels.checked = s.ui.showLabels;
      const model = c.live.circuitModel;
      const rd = live && model === 'inventory' ? currentReadings(s) : null;
      const inv = rd?.usable ? rd.engine?.inventory ?? null : null;
      const drafts = inv ? pendingStartValues(c, inv) : [];
      setText(modelStatus, model === 'inventory' ? 'Inventory model active.'
        : CHARGE_MODEL_AVAILABLE ? 'Reference model active: no refrigerant inventory.'
          : 'Reference model active. The Inventory model is gated until its science review passes.');
      setText(draftStatus, model !== 'inventory' ? 'Stored for the Inventory model.'
        : drafts.length ? `Pending, applied on Restart: ${drafts.join(', ')}.` : 'No pending start values.');
      toggleClass(draftStatus, 'diff', drafts.length > 0);
      fluidAuto.checked = c.live.initialFluidTemperatureC === null;
      fluidT.root.hidden = fluidAuto.checked;
      if (c.outdoorKind === 'owner') {
        const total = c.pipes.slice(0, c.unitCount).reduce((a, p) => a + p.lengthM, 0);
        const extra = total > 30 ? Math.min(2.2, Math.round((total - 30) * 20 / 100) / 10) : 0;
        setText(guidance, `Reference only, published N8 family guidance (verify the actual nameplate; not applied to the model): no additional charge up to 30 m, beyond that 20 g/m rounded to 0.1 kg, family maximum 2.2 kg. Total one-way length now ${fmt(total, 1)} m → ${fmt(extra, 1)} kg additional.`);
      } else setText(guidance, 'Generic group: no published charge guidance attached.');
      guidance.hidden = false;
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
        ? 'Target, floor area, ceiling height and envelope heat loss drive the live model and are on the room card. Initial room temperature is applied when you press Reset.'
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
  const lengthHint = html('p', { class: 'hint' }, 'One-way length is edited with the number and slider under this branch\'s line pair, between the outdoor unit and the wall.');
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
    lead, html('div', { class: 'chips' }, chip), lengthHint, html('div', { class: 'two' }, liq.root, gas.root), totals,
    fold('Field-line model (all branches)', false, html('p', { class: 'hint' }, 'Switch it with the Idealized / Physical control above the line-length column.'), modeNote),
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
      setText(lead, live && c.live.circuitModel === 'inventory'
        ? 'Inventory model: length and bores set the line volume that holds refrigerant. They are start values and apply on Restart. Field transport itself stays idealized: no line pressure drop, heat exchange or elevation.'
        : live && c.live.fieldLines === 'idealized'
        ? 'In this reference mode, line length and outside diameter configure the illustration and the installation-guidance check only; they do not change engine results. Owner-preset defaults are the historical blog values 7.5 / 6.5 / 14 m (ground / first / attic); the as-built survey is unknown.'
        : 'Physical line length is separate from the drawn route. Stored defaults for the owner preset are the historical blog values 7.5 / 6.5 / 14 m (ground / first / attic); the as-built survey and diameters are unknown. Diameter changes redraw tube width only.');
      setText(modeNote, c.live.circuitModel === 'inventory'
        ? 'Physical field transport is available in the reference model only. The Inventory model stores each line\'s real volume and idealizes its transport.'
        : c.live.fieldLines === 'idealized'
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

// ---------- permanent line controls (scene, outdoor connection corridor) ----------
/** One-way physical length bounds (m). The family guidance band applies to the owner preset only. */
const LENGTH = { min: 1, max: 40, step: 0.5 } as const;
const GUIDE = { min: 3, max: 25 } as const;

export interface LineLengthControl {
  root: HTMLElement;
  /** Rebinds labels and the transport note to the branch's room; never rewrites a focused input. */
  sync(s: AppState, room: RoomConfig, inv: Inventory | null): void;
}

/**
 * The canonical editor of one branch's one-way length: number + native slider, built once per branch index. Editing marks the
 * length `edited`. The note states what the length does in the current model; it never claims an effect idealized lines do not have.
 */
export function createLineLength(i: number): LineLengthControl {
  const pipe = (): PipeConfig | undefined => store.state.cfg.pipes[i];
  const len = pairField({
    label: 'Line length', unit: 'm', ...LENGTH, digits: 1, layout: 'line',
    get: () => pipe()?.lengthM ?? 10,
    set: (v) => store.update((s) => { const p = s.cfg.pipes[i]; if (p) { p.lengthM = v; p.lengthSource = 'edited'; } }),
  });
  len.num.classList.add('ln-num');
  len.range.classList.add('ln-range');
  const name = html('span', { class: 'ln-name' });
  len.root.querySelector('.rp-k')?.replaceChildren(name, html('span', { class: 'ln-tail' }, 'line'));
  const note = html('span', { class: 'ln-note' });
  const root = html('div', { class: 'rp ln', 'data-block': 'line-length', 'data-branch': String(i) }, len.root, note);
  return {
    root,
    sync(s, room, inv): void {
      const c = s.cfg;
      const live = s.ui.experience === 'live';
      const p = c.pipes[i];
      const stored = live && c.live.circuitModel === 'inventory';
      len.refresh();
      setText(name, room.name);
      const label = `One-way line length of ${room.name} (m)`;
      for (const el of [len.num, len.range]) setAttr(el, 'aria-label', label);
      if (!p) return;
      setAttr(len.range, 'aria-valuetext', `${fmt(p.lengthM, 1)} m`);
      const physical = c.live.fieldLines === 'physical';
      // Inventory: the length sets the stored line volume. It is a start value, so an edited length differs from the active one until Restart.
      const active = stored ? inv?.geometry.rooms.find((g) => g.id === room.id)?.lineLengthM : undefined;
      const pending = active !== undefined && !near(active, p.lengthM);
      setText(note, !live ? 'Examples: not applied' : stored ? (pending ? `active ${fmt(active, 1)} m · Restart` : 'line volume stored') : physical ? 'physical transport' : 'transport idealized');
      toggleClass(root, 'pending', pending);
      const source = p.lengthSource === 'owner-reported' ? 'owner-reported, historical' : p.lengthSource === 'edited' ? 'edited by you' : 'default, no source';
      const outside = c.outdoorKind === 'owner' && (p.lengthM < GUIDE.min || p.lengthM > GUIDE.max);
      const effect = !live ? 'Examples show fixed readings: length is stored for Live only.'
        : stored ? `Inventory model: the length sets the line volume that holds refrigerant. It is a start value${pending ? `; the running circuit uses ${fmt(active, 1)} m until Restart` : ''}. Transport stays idealized.`
        : physical ? 'Physical field lines: this length is passed to the finite-pipe model.'
          : 'Idealized field lines: the engine receives zero-length lines, so this length does not change results. Choose Physical to apply it.';
      root.title = `${room.name} one-way length, ${source}. ${effect}${outside ? ` Outside the ${GUIDE.min}–${GUIDE.max} m family guidance (2019, N2 variant).` : ''}`;
      root.dataset.source = p.lengthSource;
      toggleClass(root, 'warn', outside);
      toggleClass(root, 'ideal', live && !physical && !stored);
    },
  };
}

const PHYSICAL_TITLE = 'Finite-pipe model: slower, uncalibrated assumptions, some regimes unsupported';

/** The one field-line model switch (all branches), shown once above the line-length column. Idealized is the default reference. */
export function createLineModelSwitch(): Field {
  const seg = segmented<LiveParameters['fieldLines']>({
    label: 'Field-line model (all branches)', compact: true,
    options: [
      { value: 'idealized', text: 'Idealized', title: 'Zero-length lines: no pipe effects; faster reference default' },
      { value: 'physical', text: 'Physical', title: PHYSICAL_TITLE, disabled: !PHYSICAL_FIELD_LINES_AVAILABLE },
    ],
    // Physical transport exists in the reference model only; the inventory circuit stores line volume with idealized transport.
    isDisabled: (v) => v === 'physical' && store.state.cfg.live.circuitModel === 'inventory',
    get: () => store.state.cfg.live.fieldLines, set: (v) => store.update((s) => { s.cfg.live.fieldLines = v; }),
  });
  for (const b of seg.buttons) b.classList.add('rp-ctl');
  isolate(...seg.buttons);
  const key = html('span', { class: 'rp-k' }, 'Field-line model');
  const root = html('div', { class: 'rp ln-model', 'data-block': 'line-model' }, key, seg.root);
  return {
    root,
    refresh(): void {
      seg.refresh();
      const inventory = store.state.cfg.live.circuitModel === 'inventory';
      setText(key, inventory ? 'Field lines · ideal only' : 'Field-line model');
      setAttr(seg.buttons[1] as HTMLElement, 'title', inventory ? 'Physical field transport is available in the reference model only. Inventory stores line volume with idealized transport.' : PHYSICAL_TITLE);
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
