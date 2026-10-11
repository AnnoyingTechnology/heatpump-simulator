import { createModelDiagnostics } from './chrome';
import type { Field } from './controls';
import { nextId, segmented, select, setHtml, slider } from './controls';
import { clamp, escapeHtml, fmt, html, setAttr, setText, toggleClass } from './dom';
import { OUTDOOR_MODELS, indoorModelProfile, indoorOptionsForOutdoor, outdoorModelInfo } from './equipment';
import type { OutdoorModelInfo } from './equipment';
import { defaultEngineConfig } from './engine/defaults';
import { fixtureFor } from './fixtures';
import { inspectorHtml } from './inspector';
import type { PopContent } from './popovers';
import type { EngineOutput } from './engine/types';
import { CHARGE_MODEL_AVAILABLE, PHYSICAL_FIELD_LINES_AVAILABLE, defaultLiveParameters, pipeWallMmForOd } from './runtime/config';
import type { LiveParameters } from './runtime/config';
import { activeRooms, currentReadings, indoorCleanliness, outdoorCleanliness, store } from './state';
import type { AppState, Experience, ExampleState, IndoorClass, InterzoneLink, Mode, OutdoorKind, PipeConfig, RoomConfig } from './types';
import {
  CLEANLINESS_MAX_PCT, CLEANLINESS_MIN_PCT, INDOOR_CLASSES, INTERZONE_FILM_RESISTANCE_M2KW, INTERZONE_GEOMETRY_DEFAULTS, INTERZONE_GLASS_WOOL_LAMBDA_WMK, OWNER_PORTS,
  hasInterzoneGeometry, houseEnvelopeSummary, interzoneConductance, usesBuoyancyOpening, outdoorPortCapacity, roomAverageUValue, roomEnvelopeConductanceWK,
  roomExposedEnvelopeAreaM2, roomVentilation,
} from './types';

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
  /** Visible unit text when it differs from `unit` (the accessible name keeps `unit`); '' shows none. */
  suffix?: string;
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
  const shown = o.suffix ?? o.unit;
  const val = html('span', { class: 'rp-line' }, num, ...(shown ? [html('small', {}, shown)] : []));
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

// ---------- equipment model lists (native select, grouped by manufacturer) ----------
type Maker = OutdoorModelInfo['manufacturer'];
const MAKER_LABEL: Record<Maker, string> = { daikin: 'Daikin', 'mitsubishi-electric': 'Mitsubishi Electric', generic: 'Generic' };
const MAKER_ORDER: readonly Maker[] = ['daikin', 'mitsubishi-electric', 'generic'];

/** The group label states the brand, so the option drops its repeated prefix; the full text stays in the tooltip. */
function withoutBrand(text: string, maker: Maker): string {
  const brand = `${MAKER_LABEL[maker]} `;
  if (!text.startsWith(brand)) return text;
  const rest = text.slice(brand.length);
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}

/** Native `<optgroup>`s in a fixed brand order; a brand without a model gets no group, so nothing is invented. */
function optgroups(items: ReadonlyArray<{ value: string; text: string; title: string; maker: Maker }>): HTMLElement[] {
  return MAKER_ORDER.flatMap((maker) => {
    const own = items.filter((o) => o.maker === maker);
    return own.length
      ? [html('optgroup', { label: MAKER_LABEL[maker] }, ...own.map((o) => html('option', { value: o.value, title: o.title }, withoutBrand(o.text, maker))))]
      : [];
  });
}

const indoorMaker = (value: IndoorClass): Maker => indoorModelProfile(value)?.manufacturer ?? (value.startsWith('FTXA') ? 'daikin' : 'generic');

export interface IndoorModelControl {
  root: HTMLSelectElement;
  /** Rebuilds the grouped options only when the outdoor model changes; otherwise it only follows the room's class and name. */
  sync(room: RoomConfig, outdoor: OutdoorKind): void;
}

/**
 * The one visible control of a room's indoor model: a compact native select on the room's indoor-unit block, grouped by manufacturer
 * and limited to the heads the selected outdoor unit accepts. Selection goes through the store, which applies the published profile.
 */
export function createIndoorModelSelect(index: number): IndoorModelControl {
  const select = html('select', { class: 'eq-model rp-ctl' });
  let builtFor = '';
  select.addEventListener('change', () => store.setIndoorClass(index, select.value as IndoorClass));
  isolate(select);
  return {
    root: select,
    sync(room, outdoor): void {
      if (builtFor !== outdoor) {
        builtFor = outdoor;
        select.replaceChildren(...optgroups(indoorOptionsForOutdoor(outdoor).map((o) => ({ value: o.value, text: o.text, title: o.text, maker: indoorMaker(o.value) }))));
      }
      if (select.value !== room.indoorClass) select.value = room.indoorClass;
      const label = `Indoor model for ${room.name}`;
      setAttr(select, 'aria-label', label);
      setAttr(select, 'title', `${label}: ${select.selectedOptions[0]?.title ?? room.indoorClass}`);
    },
  };
}

// ---------- envelope heat-loss guide (local, non-modal help in the scene) ----------
/** Reference bands supplied for this simulator. Their reference size, boundaries and air exchange are unspecified: never scaled or applied. */
export interface HeatLossBand { era: string; note?: string; min: number; max: number }
/** Single source of the supplied bands: the guide table shows the ranges, the house-loss ruler in the indoor header shows their midpoints. */
export const HEAT_LOSS_BANDS: ReadonlyArray<HeatLossBand> = [
  { era: 'Pre-1974', note: 'very poorly insulated', min: 650, max: 850 },
  { era: 'RT1974', min: 400, max: 600 }, { era: 'RT1982', min: 350, max: 480 }, { era: 'RT1988', min: 300, max: 400 },
  { era: 'RT2000', min: 240, max: 340 }, { era: 'RT2005', min: 200, max: 300 },
  { era: 'RT2012', min: 110, max: 180 }, { era: 'RE2020', note: 'from 2022', min: 80, max: 150 },
];
/** Band midpoint in W/K: 750, 500, 415, 350, 290, 250, 145, 115. */
const midpoint = (b: HeatLossBand): number => (b.min + b.max) / 2;

const HEAT_LOSS_SOURCES: ReadonlyArray<readonly [string, string]> = [
  ['Th-Bat general rules', 'https://rt-re-batiment.developpement-durable.gouv.fr/IMG/pdf/1-fascicule_generalites.pdf'],
  ['3CL-DPE method', 'https://rt-re-batiment.developpement-durable.gouv.fr/IMG/pdf/annexe_methode_de_calcul_3cl-dpe_v1.3.pdf'],
  ['FAQ RE2020 141', 'https://rt-re-batiment.developpement-durable.gouv.fr/faq-re2020-141-comment-calculer-la-surface-a811.html'],
];

/** Bounds [W/K] of the building reference ruler: 0–750 covers every supplied reference midpoint (Pre-1974 = 750, the right end). A larger house loss is shown as an overflow at the end, never clamped. No normative default is implied. */
export const ENVELOPE_LOSS = { min: 0, max: 750, step: 1 } as const;

/** Plot width of the single header ruler in scene units. */
const RULER_PLOT_W = 560;

/**
 * Scale metrics in px (the plot is inset 8 on each side). `charW` is a deliberately
 * conservative allowance per character for this bounded vocabulary at 650 10px system-ui: measured 42 px for the six-character
 * names and 51 px for Pre-1974 (7.0 and 6.4 per character), so 7.4 leaves about 5–8 % for font variation. Pads separate labels
 * and keep leaders clear of labels.
 */
const LS = { band: 11, pitch: 11, gap: 2, charW: 7.4, labelPad: 4, stemPad: 2 } as const;

/** `x` is the exact midpoint; the label spans [la, lb], centred on `x` unless clamped to stay inside the plot (the leader never moves). */
interface LossMark { band: HeatLossBand; mid: number; x: number; la: number; lb: number; above: boolean; tier: number }

/**
 * Places each midpoint label on the side (above or below the axis band) and tier where neither it nor its leader collides with
 * another label or leader. Labels are centred on the exact midpoint (shifted inside the plot only at the ends); a leader runs from the axis band to its label and may
 * not cross a nearer label on the same side. Markers go left to right; sides alternate in the order A0, B0, A1, B1, …
 */
function placeMarks(plotW: number): LossMark[] {
  const span = ENVELOPE_LOSS.max - ENVELOPE_LOSS.min;
  const placed: LossMark[] = [];
  const marks = HEAT_LOSS_BANDS.map((band) => {
    const mid = midpoint(band);
    const x = ((mid - ENVELOPE_LOSS.min) / span) * plotW;
    const w = band.era.length * LS.charW;
    // A label that would leave the plot (Pre-1974 at the right end) is shifted inside it; its collision bounds are the shifted ones.
    const la = Math.min(Math.max(x - w / 2, 0), plotW - w);
    return { band, mid, x, la, lb: la + w };
  }).sort((a, b) => a.x - b.x);
  for (const m of marks) {
    for (let slot = 0; ; slot++) {
      const above = slot % 2 === 0;
      const tier = slot >> 1;
      const clash = placed.some((p) => {
        if (p.above !== above) return false;
        if (p.tier === tier) return m.la < p.lb + LS.labelPad && p.la < m.lb + LS.labelPad;
        // The farther leader must clear the nearer label.
        return p.tier < tier ? m.x >= p.la - LS.stemPad && m.x <= p.lb + LS.stemPad : p.x >= m.la - LS.stemPad && p.x <= m.lb + LS.stemPad;
      });
      if (!clash) { placed.push({ ...m, above, tier }); break; }
    }
  }
  return placed;
}

/**
 * Static reference scale, built once for the whole house in the indoor header: a numeric 0…750 W/K axis band and one midpoint
 * marker per supplied band, labelled directly on the scale (no legend, no range bars). Closely spaced low values are staggered
 * above and below the band with leader lines from the exact midpoint. The `.ls-needle` and `.ls-over` elements are placed by
 * `createHouseLossRuler`; the scale itself never reacts or is rebuilt. The supplied ranges and notes stay in the help guide.
 * These are building-reference examples of unspecified size: never scaled by room size, never a default, no classification.
 */
export function createLossScale(plotW = RULER_PLOT_W): HTMLElement {
  const span = ENVELOPE_LOSS.max - ENVELOPE_LOSS.min;
  const at = (v: number): string => `${(((v - ENVELOPE_LOSS.min) / span) * 100).toFixed(3)}%`;
  const marks = placeMarks(plotW);
  const tiersAbove = Math.max(0, ...marks.filter((m) => m.above).map((m) => m.tier + 1));
  const tiersBelow = Math.max(0, ...marks.filter((m) => !m.above).map((m) => m.tier + 1));
  const bandTop = tiersAbove * LS.pitch + LS.gap;
  const bandBottom = bandTop + LS.band;
  const plot = html('div', { class: 'ls-plot' });
  plot.style.height = `${bandBottom + LS.gap + tiersBelow * LS.pitch}px`;
  plot.style.width = `${plotW}px`;
  const band = html('div', { class: 'ls-band', 'aria-hidden': 'true' }, ...[0, 250, 500, ENVELOPE_LOSS.max].map((v) => {
    const e = html('span', { class: `ls-tick${v === ENVELOPE_LOSS.max ? ' end' : ''}`, 'data-value': v }, html('span', { class: 'ls-n' }, String(v)));
    e.style.left = at(v);
    return e;
  }));
  band.style.top = `${bandTop}px`;
  band.style.height = `${LS.band}px`;
  plot.append(band);
  for (const m of marks) {
    const reach = LS.gap + m.tier * LS.pitch;
    const e = html('span', {
      class: `ls-m ${m.above ? 'up' : 'down'}`, role: 'img', 'data-era': m.band.era, 'data-midpoint': m.mid,
      'aria-label': `${m.band.era} reference midpoint ${m.mid} W/K`,
    }, html('i', { class: 'ls-stem' }), html('span', { class: 'ls-lab' }, m.band.era));
    e.style.left = at(m.mid);
    const stem = e.firstElementChild as HTMLElement;
    const lab = e.lastElementChild as HTMLElement;
    stem.style.top = `${m.above ? bandTop - reach : bandBottom}px`;
    stem.style.height = `${reach}px`;
    // Centred on the leader, or shifted by the clamp computed in placeMarks.
    lab.style.transform = `translateX(calc(-50% + ${((m.la + m.lb) / 2 - m.x).toFixed(2)}px))`;
    lab.style.top = `${m.above ? bandTop - reach - LS.pitch : bandBottom + reach}px`;
    plot.append(e);
  }
  // The current house loss: a needle across the axis band, and an off-scale label when the value passes the end.
  const needle = html('span', { class: 'ls-needle', 'aria-hidden': 'true' });
  needle.style.top = `${bandTop - 3}px`;
  needle.style.height = `${LS.band + 6}px`;
  const over = html('span', { class: 'ls-over', hidden: true });
  over.style.top = `${bandTop - 1}px`;
  plot.append(needle, over);
  return html('div', { class: 'ls', role: 'group', 'aria-label': 'Building reference midpoints, W/K, from illustrative examples' }, plot);
}

export interface HouseLossRuler {
  root: HTMLElement;
  /** Writes text and attributes only; the ruler is built once. */
  sync(cfg: AppState['cfg']): void;
}

const RULER_NOTE = 'Illustrative building references, not an RT certification or a per-room rating; the air term is an estimate.';

/**
 * Owner assumptions shown while `cfg.ventilation` is absent: dual flow, 0.5 ACH gross, 75 % sensible recovery. They are declared
 * assumptions, not measured unit specifications, and nothing is written to the configuration until the user edits a control.
 */
const VENT_DEFAULT: Ventilation = { mode: 'dual', grossACH: 0.5, sensibleEfficiencyPct: 75 };
const VENT_RECOVERY = { min: 0, max: 95, step: 1 } as const;
const VENT_ACH = { min: 0, max: 2, step: 0.05 } as const;
type Ventilation = NonNullable<AppState['cfg']['ventilation']>;

const ventilationOf = (cfg: AppState['cfg']): Ventilation => ({ ...VENT_DEFAULT, ...cfg.ventilation });

/** Merges one field into the global ventilation object through the store, so engine stores, time and room targets are untouched. */
function setVentilation(patch: Partial<Ventilation>): void {
  store.update((s) => { s.cfg.ventilation = { ...VENT_DEFAULT, ...s.cfg.ventilation, ...patch }; });
}

/**
 * The one calculated whole-house loss ruler of the indoor header: the sum of the active rooms' envelope conductances plus the
 * sensible air term after heat recovery (`houseEnvelopeSummary`), shown as a needle on the eight building references and as
 * "House loss ≈ N W/K" with its envelope / air split. Under the summary sit the global single / dual flow choice and, when dual, the
 * sensible recovery. Off heads still count. Nothing is classified, converted or applied to a room; a value past the 750 W/K end
 * keeps its real number and is marked off scale at the end instead of being clamped.
 */
export function createHouseLossRuler(guide: HeatLossGuide): HouseLossRuler {
  const scale = createLossScale();
  const needle = scale.querySelector<HTMLElement>('.ls-needle')!;
  const over = scale.querySelector<HTMLElement>('.ls-over')!;
  const total = html('b', { class: 'hl-total' });
  const parts = html('span', { class: 'hl-parts' });
  const modeTip = 'Ventilation type. Single flow: no heat recovery. Dual flow: the exhaust air preheats the supply air (sensible recovery).';
  const mode = html('select', { class: 'hl-mode rp-ctl', 'aria-label': 'Ventilation type', title: modeTip },
    html('option', { value: 'single' }, 'Single flow'), html('option', { value: 'dual' }, 'Dual flow'));
  mode.addEventListener('change', () => setVentilation({ mode: mode.value === 'single' ? 'single' : 'dual' }));
  const recovery = pairField({
    label: 'Recovery', unit: '%', ...VENT_RECOVERY, digits: 0, layout: 'inline',
    get: () => ventilationOf(store.state.cfg).sensibleEfficiencyPct, set: (v) => setVentilation({ sensibleEfficiencyPct: v }),
    title: 'Sensible heat-recovery efficiency of the dual-flow unit (assumed 75 %, not a measured unit specification). Sensible only: outdoor humidity still enters. Frost protection, bypass and fan power are not modelled.',
  });
  const vent = html('div', { class: 'hl-vent' }, mode, recovery.root);
  const sum = html('div', { class: 'hl-sum rp-ctl', title: RULER_NOTE },
    html('div', { class: 'hl-line' }, 'House loss ≈ ', total, html('small', {}, 'W/K'), guide.button(0)), parts, vent);
  const root = html('div', { class: 'rp env hl-ruler', 'data-block': 'house-loss', role: 'group' }, sum, scale);
  let last = '';
  isolate(sum, mode);
  return {
    root,
    sync(cfg): void {
      // Controls follow the configuration on every call (a focused input is never rewritten); the text below is diffed.
      const v = ventilationOf(cfg);
      if (mode.value !== v.mode) mode.value = v.mode;
      recovery.root.hidden = v.mode !== 'dual';
      recovery.refresh();
      const h = houseEnvelopeSummary(cfg);
      const key = `${h.envelopeWK}|${h.ventilationWK}|${v.mode}`;
      if (key === last) return;
      last = key;
      const envelope = Math.round(h.envelopeWK);
      const sumWK = Math.round(h.totalWK);
      const air = sumWK - envelope;
      const off = h.totalWK > ENVELOPE_LOSS.max;
      setText(total, fmt(sumWK, 0));
      setText(parts, `envelope ${fmt(envelope, 0)} + air ~${fmt(air, 0)}`);
      needle.style.left = `${(clamp(h.totalWK / ENVELOPE_LOSS.max, 0, 1) * 100).toFixed(3)}%`;
      toggleClass(needle, 'over', off);
      over.hidden = !off;
      setText(over, off ? `${fmt(sumWK, 0)} W/K` : '');
      for (const [k, v] of [['data-total-wk', h.totalWK], ['data-envelope-wk', h.envelopeWK], ['data-ventilation-wk', h.ventilationWK]] as const) setAttr(root, k, String(v));
      setAttr(root, 'data-off-scale', off ? '1' : '0');
      const text = `House loss about ${fmt(sumWK, 0)} W/K: envelope ${fmt(envelope, 0)} plus air about ${fmt(air, 0)}${off ? ', beyond the 750 W/K end of the scale' : ''}. ${RULER_NOTE}`;
      setAttr(root, 'aria-label', text);
      setAttr(parts, 'title', `Envelope: sum of every active room's average U × exposed envelope area. Air: sensible loss of the gross ventilation rate, 0.34 × volume × ACH × (1 − sensible recovery); ${v.mode === 'dual' ? `dual flow recovers ${fmt(v.sensibleEfficiencyPct, 0)} % of the sensible heat` : 'single flow has no recovery'}. Outdoor humidity exchange is not reduced. ${RULER_NOTE}`);
    },
  };
}

/** Average U bounds [W/(m²·K)]: lower is better. */
export const AVERAGE_U = { min: 0, max: 3, step: 0.01 } as const;

export interface AverageUControl {
  root: HTMLElement;
  field: PairField;
  /** Rebinds labels and the derived exposed area and whole-room W/K; never rewrites a focused input. */
  sync(room: RoomConfig, cfg: AppState['cfg']): void;
}

const AVERAGE_U_TIP = 'Average U: effective envelope transmittance, W/(m²·K), lower is better. It includes windows and thermal bridges as an average. The exposed area is a square-box estimate from floor area and height, with surfaces shared through room links deducted; correct it in Thermal. Whole-room envelope loss = average U × exposed area. Ventilation and room links are separate.';

/**
 * A room's Average U: one effective transmittance for the whole exposed envelope, the primary envelope control. The exposed area is
 * derived (square box, shared linked faces deducted) unless corrected in Thermal, so U stays fixed when size, height or links change
 * and only the derived W/K follows. The stored value is never rounded by rendering. Built once per room index; edits go through
 * `store.setRoomAverageU` by room id.
 */
export function createAverageUControl(index: number): AverageUControl {
  const room = (): RoomConfig | undefined => store.state.cfg.rooms[index];
  const field = pairField({
    label: 'Average U', unit: 'W/(m²·K)', ...AVERAGE_U, digits: 2, layout: 'block',
    get: () => { const r = room(); return r ? roomAverageUValue(r, store.state.cfg) : 0; },
    set: (v) => { const r = room(); if (r) store.setRoomAverageU(r.id, v); },
    title: AVERAGE_U_TIP,
  });
  const ends = html('div', { class: 'ie-ends', 'aria-hidden': 'true' }, html('span', {}, '0 · better'), html('span', {}, `poorer · ${AVERAGE_U.max}`));
  const envelope = html('div', { class: 'env-heat', 'data-field': 'room-envelope-wk', title: AVERAGE_U_TIP });
  const root = html('div', { class: 'ie' }, field.root, ends, envelope);
  return {
    root,
    field,
    sync(r, cfg): void {
      field.refresh();
      const u = roomAverageUValue(r, cfg);
      const label = `Average U of ${r.name} (W/(m²·K), lower is better)`;
      setAttr(field.num, 'aria-label', label);
      setAttr(field.range, 'aria-label', label);
      setAttr(field.range, 'aria-valuetext', `${fmt(u, 2)} W/(m²·K)`);
      const area = roomExposedEnvelopeAreaM2(r, cfg);
      const h = roomEnvelopeConductanceWK(r, cfg);
      const set = r.envelopeAreaOverrideM2 != null;
      setText(envelope, `${set ? '' : '≈ '}${fmt(area, 0)} m² exposed${set ? ' (set)' : ''} · ${fmt(h, 0)} W/K`);
      setAttr(envelope, 'data-wk', String(h));
      setAttr(envelope, 'data-area-m2', String(area));
    },
  };
}

export interface HeatLossGuide {
  /** The panel; the scene mounts it once and places it beside the house-loss ruler's help button. */
  root: HTMLElement;
  /** Anchor index the guide is open for (0, the header ruler), or -1. */
  readonly open: number;
  /** Help button for anchor `i`; one click toggles the guide. The ruler uses anchor 0 only. */
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
    html('p', {}, html('b', {}, 'Average U sets each room\'s envelope loss'), ': one effective W/(m²·K), lower is better. Envelope H = average U × exposed area. U averages walls, glazing, roof, floor and thermal bridges; it is not the thickness of a wool layer. The area is a square-box estimate from floor area and height minus the surfaces shared through room links; correct it in the room\'s Thermal settings when buried or roof geometry differs. U stays fixed when size or links change; H follows.'),
    html('p', {}, html('b', {}, 'House loss'), ' on the ruler = every active room\'s envelope H + the sensible air term 0.34 × volume × gross ACH × (1 − sensible recovery). Single flow has no recovery. Recovery is sensible only: the outdoor humidity exchange remains. Exchanger frost protection, bypass and fan power are not modelled. Rooms count even when their unit is Off.'),
    html('table', { class: 'hl-tbl' },
      html('caption', {}, 'Illustrative building references'),
      html('thead', {}, html('tr', {}, html('th', { scope: 'col' }, 'Construction era'), html('th', { scope: 'col' }, 'Indicative H (W/K)'))),
      html('tbody', {}, ...HEAT_LOSS_BANDS.map((b) => html('tr', {}, html('th', { scope: 'row' }, b.note ? `${b.era} (${b.note})` : b.era), html('td', {}, `${b.min}–${b.max}`))))),
    html('p', { class: 'hl-note' }, `${RULER_NOTE} The size, exposed surfaces and ventilation behind these bands are unspecified; they are not RT/RE requirements, are never applied or converted to a room, and the ruler marks them by band midpoint.`),
    sources);
  const guide: HeatLossGuide = {
    root,
    get open(): number { return open; },
    button(i): HTMLButtonElement {
      let b = buttons[i];
      if (!b) {
        b = html('button', { type: 'button', class: 'hl-btn rp-ctl', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', 'aria-controls': id, 'aria-label': 'Envelope heat-loss guide', title: 'Heat-loss guide: equation, average U, ventilation loss and the illustrative building references' }, '?');
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


function relabel(f: Field, text: string, unit: string): void {
  const l = f.root.querySelector('label');
  if (l && l.textContent !== text) l.textContent = text;
  f.root.querySelector('input.num')?.setAttribute('aria-label', `${text} [${unit}]`);
}

function fold(title: string, open: boolean, ...kids: Node[]): HTMLDetailsElement {
  return html('details', { class: 'fold', open: open ? '' : undefined }, html('summary', {}, title), html('div', { class: 'fold-body' }, ...kids));
}

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
  // The outdoor unit is a native select of the researched references, grouped by manufacturer (owner Daikin, catalogue Mitsubishi
  // Electric units, the editable generic group). Options are static; selection goes through the store, which applies the published topology.
  const modelSel = html('select', { class: 'ou-model-select rp-ctl', 'aria-label': 'Outdoor model' },
    ...optgroups(OUTDOOR_MODELS.map((m) => ({
      value: m.id, text: m.label, maker: m.manufacturer,
      title: `${m.label} · ${m.ports === null ? 'user-declared ports' : `${m.ports} port${m.ports === 1 ? '' : 's'}`} · case ${m.caseMm.w} × ${m.caseMm.h} × ${m.caseMm.d} mm`,
    }))));
  modelSel.addEventListener('change', () => store.setOutdoorKind(modelSel.value as OutdoorKind));
  const model: Field = {
    root: modelSel,
    refresh(): void {
      const info = outdoorModelInfo(cfg());
      if (modelSel.value !== info.id) modelSel.value = info.id;
      modelSel.title = info.label;
    },
  };
  fields.push(model);

  // Port capacity is an equipment specification, distinct from how many rooms are connected (rooms are added and removed in the
  // indoor zone). Published models: fixed. Generic: a native integer field, no arbitrary upper limit, a scenario assumption.
  const capInput = html('input', {
    type: 'number', class: 'rp-num rp-ctl ou-cap', min: 1, step: 1, inputmode: 'numeric',
    'aria-label': 'Generic outdoor port capacity (assumption)', title: 'Assumed number of refrigerant ports of the generic group. A scenario assumption, not manufacturer data.',
  });
  const capFixed = html('span', { class: 'ou-fixed' });
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
      const info = outdoorModelInfo(cfg());
      const generic = info.ports === null;
      capInput.hidden = !generic;
      capFixed.hidden = generic;
      if (document.activeElement !== capInput) capInput.value = String(cfg().genericPortCapacity);
      setText(capFixed, `${info.ports ?? ''} · ${info.acceptance === 'owner-reference' ? 'declared' : 'published'}`);
      capFixed.title = `${info.label}: ${info.ports} refrigerant port${info.ports === 1 ? '' : 's'}, fixed. Choose the generic editable outdoor to explore other connection counts.`;
      setText(capNote, generic ? 'assumed' : 'fixed');
    },
  };
  fields.push(portsField);
  const cleanGlobal = reg(pairField({
    label: 'Shared coil cleanliness', unit: '% clear', min: CLEANLINESS_MIN_PCT, max: CLEANLINESS_MAX_PCT, step: 1, digits: 0, layout: 'line',
    get: () => cfg().live.cleanlinessPct, set: (v) => store.update((s) => { s.cfg.live.cleanlinessPct = v; }),
    title: 'All outdoor and indoor coils use this shared setting: 100 % clean, 10 % = 90 % of the clear air passage obstructed.',
  }));


  const modelText = html('span', { class: 'ou-model' });
  const gear = html('button', { type: 'button', class: 'rp-btn rp-ctl', 'aria-haspopup': 'dialog', 'aria-label': 'Outdoor unit settings' }, 'Settings');
  gear.addEventListener('click', onSettings);
  const slot = html('p', { class: 'ou-slot', role: 'status' });

  // Two columns: the machine's equipment settings and readouts at left, its refrigerant charge at right.
  const charge = createChargeArea();
  const root = html('div', { class: 'rp ou' },
    html('div', { class: 'ou-head' }, html('span', { class: 'ou-title' }, 'OUTDOOR UNIT'), modelText, gear),
    html('div', { class: 'ou-modes' }, mode.root, modelSel),
    html('div', { class: 'ou-cols' },
      html('div', { class: 'ou-col' },
        html('div', { class: 'ou-row' }, html('span', { class: 'rp-k' }, 'Ports'), portsField.root),
        cleanGlobal.root),
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
      const info = outdoorModelInfo(c);
      const caps = outdoorPortCapacity(c);
      setText(modelText, `${caps} port${caps === 1 ? '' : 's'}${info.ports === null ? ' assumed' : ''}`);
      const published = info.coolingHighFanFlowM3h !== undefined && c.outdoorVolumetricAirFlowM3s !== undefined;
      const scope = live
        ? `${published ? 'Published airflow · generic cycle.' : 'Generic R32 · uncalibrated.'} Efficiency and cleanliness drive the model.`
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
      get: () => cfg().live[key], set: (v) => store.update((s) => {
        s.cfg.live[key] = v;
        // A manual air mass flow replaces the selected published volume flow, so the edit is never quietly ignored.
        if (key === 'outdoorAirMassFlowKgs') delete s.cfg.outdoorVolumetricAirFlowM3s;
        if (key === 'indoorAirMassFlowKgs') for (const r of s.cfg.rooms) delete r.volumetricAirFlowM3s;
      }),
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
  const outAir = liveField('outdoorAirMassFlowKgs', 'Outdoor air mass flow', 'kg/s');
  const inAir = liveField('indoorAirMassFlowKgs', 'Indoor air mass flow (each unit)', 'kg/s');
  const outAirNote = html('p', { class: 'hint' });
  const inAirNote = html('p', { class: 'hint' });

  // Published model profile: concise facts, one click away. Airflow is the only published input applied; the cycle stays generic.
  const profileText = html('p', { class: 'hint' });
  const profileFacts = html('ul', { class: 'taps-list' });
  const reapply = html('button', { type: 'button', class: 'btn ghost small' }, 'Reapply published airflow');
  reapply.addEventListener('click', () => {
    const m = outdoorModelInfo(cfg());
    store.update((s) => { if (m.coolingHighFanFlowM3h !== undefined) s.cfg.outdoorVolumetricAirFlowM3s = m.coolingHighFanFlowM3h / 3600; });
    // Indoor profiles are applied by the store, never by assigning the class here.
    cfg().rooms.slice(0, cfg().unitCount).forEach((r, i) => store.setIndoorClass(i, r.indoorClass));
  });
  const profile = keyed('profile', fold('Published model profile', false, profileText, profileFacts, reapply));

  const coil = keyed('coil', fold('Outdoor coil and air (generic assumptions)', true,
    html('p', { class: 'hint' }, 'Heat-engine assumptions, not measured values and not manufacturer data. Conductances are UA in W/K, not areas. Most numeric bounds are 0.2×–5× the engine default, with physical exceptions (for example the compressor speed floor); they are generic assumptions, not manufacturer limits.'),
    html('p', { class: 'hint' }, 'Bounded generic coverage: outdoor air −25…45 °C (the weather inputs\' range). Inside it the subcritical R32 cycle needs evaporating ≥ −40 °C and condensing ≤ 65 °C, within generic discharge-temperature and pressure-ratio caps; outside them the run fails visibly instead of extrapolating. The diagram\'s temperature colours (−40…145 °C refrigerant, −30…50 °C air) are display ranges, not operating limits, and 105 °C and above is hot discharge vapour, not a liquid temperature.'),
    coilStatus,
    liveField('outdoorAirConductanceWK', 'Outdoor coil air-side UA', 'W/K').root,
    liveField('outdoorRefrigerantConductanceWK', 'Outdoor coil refrigerant-side UA', 'W/K').root,
    outAirNote, outAir.root,
    liveField('depositionAreaM2', 'Outdoor frost deposition area', 'm²', 'Generic assumption for the frost model; not the manufacturer finned area.').root));
  const eta = reg(pairField({
    label: 'Compressor efficiency ηis', unit: '%', min: ETA.min, max: ETA.max, step: 1, digits: 0, layout: 'line',
    get: () => cfg().etaIsPct, set: (v) => store.update((s) => { s.cfg.etaIsPct = v; }),
    title: 'Ratio of ideal isentropic to actual compression work. Motor and drive losses are separate.',
  }));
  const comp = keyed('compressor', fold('Compressor assumptions', false,
    eta.root, etaStatus, compStatus,
    liveField('compressorDisplacementCm3', 'Compressor displacement', 'cm³/rev').root,
    liveField('compressorMaxSpeedRps', 'Compressor maximum speed', 'rps', `Not below the engine minimum speed (${fmt(SPEED_MIN_RPS, 0)} rps).`, SPEED_MIN_RPS).root));
  const clean = keyed('clean', fold('Heat-exchanger cleanliness', false,
    html('p', { class: 'hint' }, 'One shared cleanliness control on the outdoor-unit card applies to every indoor and outdoor coil. 100 % = clean coil; 10 % = only 10 % of the clear air passage remains (90 % obstructed).'),
    cleanStatus, cleanNote));
  const shared = keyed('shared', fold('Shared by all indoor units', false,
    html('p', { class: 'hint' }, 'One value applies to every indoor unit. These are not independent per-room physics, and model references never change them.'),
    sharedStatus,
    liveField('indoorAirConductanceWK', 'Indoor coil air-side UA (each unit)', 'W/K').root,
    liveField('indoorRefrigerantConductanceWK', 'Indoor coil refrigerant-side UA (each unit)', 'W/K').root,
    inAirNote, inAir.root));

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

  const root = html('div', { class: 'pop-settings' }, outdoorNote, sourceSection, profile, coil, charge, comp, clean, shared, display, refrigerant, pending, diagnostics.root);

  return {
    root,
    heading: (s) => ({ kicker: 'Outdoor unit settings', title: outdoorModelInfo(s.cfg).label }),
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
      const info = outdoorModelInfo(c);
      setText(outdoorNote, info.acceptance === 'owner-reference'
        ? `Declared by owner; exact suffix and nameplate unknown. ${OWNER_PORTS} refrigerant ports (fixed), factory R32. Choose the generic editable outdoor to explore more connections.`
        : info.ports === null
          ? `Illustrative generic compatible group. Its port capacity (${c.genericPortCapacity}) is a scenario assumption, not manufacturer data; rooms are added and removed in the indoor zone. Up to five ports it keeps the owner casing envelope; beyond that the casing is an assumed larger drawing, not a published dimension.`
          : `${info.label}: published ${info.ports}-port model. Its matched indoor units, ports and cooling high-fan airflow are applied; the cycle, compressor, coil conductance and fan watts remain generic assumptions, not an OEM performance map.`);
      // Published model profile (facts, no performance claim) and the airflow provenance next to the two mass-flow fields.
      setText(profileText, info.profileNote);
      const flowText = info.coolingHighFanFlowM3h === undefined ? 'no published airflow'
        : `${fmt(info.coolingHighFanFlowM3h, 0)} m³/h cooling high fan (reused in heating as an assumption)`;
      const facts = [`Ports: ${info.ports ?? `${c.genericPortCapacity} (assumed)`}`, `Case: ${info.caseMm.w} × ${info.caseMm.h} × ${info.caseMm.d} mm (the drawing is a generic illustration)`, `Airflow: ${flowText}`];
      const range = info.publishedOperatingRangesC;
      if (range) facts.push(`Published operating range: cooling ${range.cooling.minimum}…${range.cooling.maximum} °C, heating ${range.heating.minimum}…${range.heating.maximum} °C (information only, not applied)`);
      setHtml(profileFacts, facts.map((f) => `<li>${escapeHtml(f)}</li>`).join(''));
      reapply.hidden = info.coolingHighFanFlowM3h === undefined;
      const outProfile = c.outdoorVolumetricAirFlowM3s !== undefined;
      setText(outAirNote, outProfile
        ? `Published volume flow ${fmt(c.outdoorVolumetricAirFlowM3s! * 3600, 0)} m³/h is applied. The mass flow below is a fallback / manual override: editing it replaces the published flow (Reapply in Published model profile restores it).`
        : 'Generic mass flow in use (manual or no published airflow for this model).');
      relabel(outAir, outProfile ? 'Outdoor air mass flow (fallback / manual override)' : 'Outdoor air mass flow', 'kg/s');
      const profiled = c.rooms.slice(0, c.unitCount).filter((r) => r.volumetricAirFlowM3s !== undefined);
      setText(inAirNote, profiled.length
        ? `Published volume flow applies to ${profiled.length} of ${c.unitCount} indoor units (${profiled.map((r) => `${r.name} ${fmt(r.volumetricAirFlowM3s! * 3600, 0)} m³/h`).join(', ')}). The mass flow below is a fallback / manual override; editing it clears every published indoor flow.`
        : 'Generic mass flow in use for every indoor unit.');
      relabel(inAir, profiled.length ? 'Indoor air mass flow (fallback / manual override)' : 'Indoor air mass flow (each unit)', 'kg/s');
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
  const offNote = html('p', { class: 'hint' });
  // The indoor model is chosen with the select on the room's unit block (one canonical control); here it is a read-only fact.
  const modelFact = html('p', { class: 'hint' });
  const modelHint = html('p', { class: 'hint' });
  const dirtStatus = html('p', { class: 'status' });
  const shareBtn = html('button', { type: 'button', class: 'btn ghost small' }, 'Open shared indoor assumptions');
  shareBtn.addEventListener('click', openShared);
  const detailBody = html('div', { class: 'fold-body' });
  const details = html('details', { class: 'fold' }, html('summary', {}, 'Details and readings'), detailBody);

  const root = html('div', { class: 'pop-settings' },
    lead, offNote,
    html('section', { class: 'sec' }, html('h3', {}, 'Indoor unit'), modelFact, modelHint),
    html('section', { class: 'sec' }, html('h3', {}, 'Heat-exchanger cleanliness'), dirtStatus,
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
      const cls = r?.indoorClass;
      const profile = cls ? indoorModelProfile(cls) : undefined;
      const known = cls ? indoorOptionsForOutdoor(s.cfg.outdoorKind).find((o) => o.value === cls) : undefined;
      setText(modelFact, `Model: ${known?.text ?? cls ?? '—'}. Change it with the model list on the room's unit block.`);
      const nominal = cls ? (INDOOR_CLASSES[cls].nominalKw === null ? 'Capacity depends on the matched system; no individual output map is accepted.' : `Nominal ${INDOOR_CLASSES[cls].nominalKw} kW is a class label, not an output map.`) : '';
      setText(modelHint, profile && r?.volumetricAirFlowM3s !== undefined
        ? `Published airflow · generic cycle: ${fmt(r.volumetricAirFlowM3s * 3600, 0)} m³/h (cooling high fan; reused in heating as an assumption). Fan watts, coil UA and compressor stay generic. ${nominal}`
        : profile
          ? `Published model, but its airflow was replaced by a manual mass flow (shared indoor assumptions); select the model again or use Reapply to restore it. ${nominal}`
          : `Generic mass flow (shared indoor assumptions). ${nominal}`);
      setText(lead, live
        ? 'Target, floor area, ceiling height and average U drive the live model and are on the room card. Initial room temperature, background gains, ventilation rate, exposed area and links to other rooms are in the room\'s Thermal settings.'
        : 'Configuration inputs. Fixture supply-air readings do not respond to them. Initial room temperature is in the room\'s Thermal settings.');
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

// ---------- room thermal popover (advanced house parameters; one instance, rebinds to the opened room) ----------
const GAIN = { min: 0, max: 1000, step: 10 } as const;
/** Effective sensible heat admitted through glazing [W]; entered by hand, never derived from weather or sun position. */
const WINDOW_SOLAR = { min: 0, max: 5000, step: 25 } as const;
/** Direct whole-room envelope conductance [W/K]; the primary control is the Average U on the room card. */
const ENVELOPE_H = { min: 0, max: 1500, step: 1 } as const;
/** Exposed envelope area correction [m²]; absent follows the square-box estimate. */
const ENVELOPE_AREA = { min: 1, max: 1500, step: 1 } as const;

/**
 * House parameters of one room, deliberately separate from the indoor unit's settings: initial room temperature, sensible background
 * gains, the ventilation rate (house-wide gross rate and this room's optional override), the exposed envelope area correction, the
 * direct whole-room envelope conductance (advanced twin of the room card's Average U) and
 * a read-only summary of the link to each OTHER active room (geometry is edited in the link editor). Links are addressed by
 * room id (never by index) and built once per topology signature, not on input; no field is rebuilt while it is being edited.
 * The owner-house defaults mix reported facts with provisional assumptions; the text says which is which.
 */
export function createRoomThermal(openLink: (roomA: string, roomB: string) => void): PopContent {
  let idx = 0;
  const cfg = () => store.state.cfg;
  const room = (): RoomConfig | undefined => cfg().rooms[idx];
  const edit = (fn: (r: RoomConfig) => void): void => store.update((s) => { const r = s.cfg.rooms[idx]; if (r) fn(r); });
  const fields: Field[] = [];
  const reg = <T extends Field>(f: T): T => { fields.push(f); return f; };

  const now = html('p', { class: 'hint' });
  const air = reg(slider({
    label: 'Room air temperature (input)', unit: '°C', min: 5, max: 35, step: 0.5, digits: 1,
    get: () => room()?.airC ?? 20, set: (v) => edit((r) => { r.airC = v; }),
  }));
  const gain = reg(pairField({
    label: 'Background sensible gains', unit: 'W', ...GAIN, digits: 0, layout: 'line',
    get: () => room()?.internalGainW ?? 0, set: (v) => edit((r) => { r.internalGainW = v; }),
    title: 'Sensible heat from appliances and occupants in this room, separate from the indoor unit.',
  }));
  const sun = reg(pairField({
    label: 'Sun from windows', unit: 'W', ...WINDOW_SOLAR, digits: 0, layout: 'line',
    get: () => room()?.windowSolarGainW ?? 0, set: (v) => { const r = room(); if (r) store.setRoomWindowSolarGain(r.id, v); },
    title: 'Effective sensible heat admitted through the glazing of this room, in W. Not incident irradiance. Entered by hand: no sun position or weather is calculated, and the default 0 is uncalibrated.',
  }));
  const houseAch = reg(pairField({
    label: 'House rate (all rooms)', unit: 'ACH', ...VENT_ACH, digits: 2, layout: 'line',
    get: () => ventilationOf(cfg()).grossACH, set: (v) => setVentilation({ grossACH: v }),
    title: 'Gross outdoor-air exchange of the whole house, in air changes per hour (assumed 0.5, not a measured unit specification). Rooms follow it unless they carry their own rate.',
  }));
  const ach = reg(pairField({
    label: 'Ventilation rate', unit: 'ACH', ...VENT_ACH, digits: 2, layout: 'line',
    get: () => { const r = room(); return r ? roomVentilation(r, cfg()).grossACH : 0; }, set: (v) => edit((r) => { r.ventilationACH = v; }),
    title: 'Gross outdoor-air exchange of this room, in air changes per hour. Editing it gives the room its own rate; otherwise it follows the house rate.',
  }));
  const useHouse = html('button', { type: 'button', class: 'btn ghost small' }, 'Use house rate');
  useHouse.addEventListener('click', () => edit((r) => { delete r.ventilationACH; }));
  const achNote = html('p', { class: 'hint' });
  const area = reg(pairField({
    label: 'Exposed envelope area', unit: 'm²', ...ENVELOPE_AREA, digits: 0, layout: 'line',
    get: () => { const r = room(); return r ? roomExposedEnvelopeAreaM2(r, cfg()) : 0; },
    set: (v) => { const r = room(); if (r) store.setRoomEnvelopeAreaOverride(r.id, v); },
    title: 'Envelope surface facing outdoors or unheated space. Estimated as a square box from floor area and height, with surfaces shared through room links deducted. Correct it for buried floors, roofs or party walls; average U stays fixed.',
  }));
  const useEstimate = html('button', { type: 'button', class: 'btn ghost small' }, 'Use estimated area');
  useEstimate.addEventListener('click', () => { const r = room(); if (r) store.setRoomEnvelopeAreaOverride(r.id, null); });
  isolate(useHouse, useEstimate);
  const envelope = reg(pairField({
    label: 'Whole-room envelope conductance', unit: 'W/K', ...ENVELOPE_H, digits: 0, layout: 'line',
    get: () => { const r = room(); return r ? roomEnvelopeConductanceWK(r, cfg()) : 0; },
    set: (v) => { const r = room(); if (r) store.setRoomEnvelopeConductance(r.id, v); },
    title: 'Direct whole-room envelope H. Equivalent to the room card\'s average U × the exposed area; editing either changes the same envelope.',
  }));
  const envelopeNote = html('p', { class: 'hint' });
  const findLink = (a: string, b: string): InterzoneLink | undefined =>
    cfg().interzoneLinks?.find((l) => (l.roomA === a && l.roomB === b) || (l.roomA === b && l.roomB === a));
  const linkBox = html('div', { class: 'th-links' });
  let linkSig = '';
  let links: Array<{ value: HTMLElement; btn: HTMLButtonElement; other: string; self: string }> = [];
  /** One summary row per other active room, rebuilt only when the topology (this room or the room list) changes. */
  function bindLinks(s: AppState, i: number): void {
    const self = s.cfg.rooms[i];
    if (!self) return;
    const others = activeRooms(s.cfg).filter((r) => r.id !== self.id);
    const sig = `${self.id}|${others.map((r) => `${r.id}:${r.name}`).join('|')}`;
    if (sig === linkSig) return;
    linkSig = sig;
    links = others.map((o) => {
      const value = html('output', { class: 'th-h', 'aria-label': `Link conductance between ${self.name} and ${o.name}` });
      // The same shared editor as the drawn link: opening area, solid contact area, glass wool and direction live there, not here.
      const btn = html('button', { type: 'button', class: 'btn ghost small', title: `Characterize the link between ${self.name} and ${o.name}: opening area, solid contact area, glass wool, direction` }, 'Edit link');
      btn.addEventListener('click', () => openLink(self.id, o.id));
      return { value, btn, other: o.id, self: self.id };
    });
    linkBox.replaceChildren(...(links.length
      ? links.map((l, k) => html('div', { class: 'th-link' }, html('span', { class: 'th-name' }, `Link to ${others[k]?.name ?? ''}`), l.value, l.btn))
      : [html('p', { class: 'hint' }, 'No other active room.')]));
  }

  const root = html('div', { class: 'pop-settings' },
    html('p', { class: 'hint lead' }, 'Advanced house parameters of this room, separate from its indoor unit. In the owner-house defaults the unit targets, the attic being Off and the winter temperatures (about 18 °C ground, 17.5–19 °C attic at 1 °C outdoors) are owner-reported; the gains, ventilation, exposed areas and links below are provisional assumptions, not measurements.'),
    html('section', { class: 'sec' }, html('h3', {}, 'Initial state'), now, air.root),
    html('section', { class: 'sec' }, html('h3', {}, 'Background and solar gains'), gain.root,
      html('p', { class: 'hint' }, 'Assumed allocation; the owner\'s notes give roughly 100–200 W of baseline and audio-video heat, here placed on the ground floor.'),
      sun.root,
      html('p', { class: 'hint' }, 'Effective sensible heat admitted through the glazing, not incident irradiance. Set by hand: no sun or weather is calculated, it is not changed by the season preset, and the default 0 W is uncalibrated. It adds to the room\'s sensible gains and is excluded from HVAC output and COP.')),
    html('section', { class: 'sec' }, html('h3', {}, 'Ventilation'), houseAch.root, ach.root, html('div', { class: 'th-reset' }, useHouse), achNote,
      html('p', { class: 'hint' }, 'Gross rate; single or dual flow and the sensible recovery are set under the house-loss ruler. Recovery is sensible only: the outdoor humidity exchange remains. Frost protection, bypass and fan power are not modelled.')),
    html('section', { class: 'sec' }, html('h3', {}, 'Envelope (advanced)'), area.root, html('div', { class: 'th-reset' }, useEstimate), envelope.root, envelopeNote),
    html('section', { class: 'sec' }, html('h3', {}, 'Links to other rooms'), linkBox,
      html('p', { class: 'hint' }, 'Each link combines an open passage and an insulated solid contact, both acting at once: effective sensible heat transfer, not resolved airflow. Turning a unit off keeps links active. The default links are assumed, not measured. Edit areas and glass wool in the link editor (also on the drawn link).')));

  return {
    root,
    heading: (s, i) => ({ kicker: 'Room thermal settings', title: s.cfg.rooms[i]?.name ?? 'Room' }),
    sync(s: AppState, i: number): void {
      idx = i;
      bindLinks(s, i);
      const live = s.ui.experience === 'live';
      for (const f of fields) f.refresh();
      for (const l of links) {
        const link = findLink(l.self, l.other);
        const t = currentReadings(s).engine?.interzoneTransfers?.find(t => t.roomA === l.self && t.roomB === l.other || t.roomA === l.other && t.roomB === l.self);
        setText(l.value, link ? usesBuoyancyOpening(link) ? t?.effectiveConductanceWK !== undefined ? `${fmt(t.effectiveConductanceWK, 0)} W/K now` : 'buoyancy link' : `${fmt(interzoneConductance(link), 0)} W/K` : 'no link');
        setText(l.btn, link ? 'Edit link' : 'Add link');
      }
      const self = room();
      if (self) {
        const c = cfg();
        const own = self.ventilationACH !== undefined;
        const set = self.envelopeAreaOverrideM2 != null;
        const estimate = roomExposedEnvelopeAreaM2({ ...self, envelopeAreaOverrideM2: null }, c);
        useHouse.hidden = !own;
        useEstimate.hidden = !set;
        setText(useEstimate, `Use estimated area (${fmt(estimate, 0)} m²)`);
        setText(achNote, own ? `Own rate; the house rate is ${fmt(ventilationOf(c).grossACH, 2)} ACH.` : 'Follows the house rate.');
        for (const [f, text] of [[ach, `Ventilation rate of ${self.name} [ACH]`], [area, `Exposed envelope area of ${self.name} [m²]`], [envelope, `Whole-room envelope conductance of ${self.name} [W/K]`]] as const) {
          setAttr(f.num, 'aria-label', text);
          setAttr(f.range, 'aria-label', text);
        }
        setText(envelopeNote, `Average U ${fmt(roomAverageUValue(self, c), 2)} W/(m²·K) × ${fmt(roomExposedEnvelopeAreaM2(self, c), 0)} m² (${set ? 'set' : 'estimated'}). Ventilation is separate.`);
      }
      relabel(air, live ? 'Initial room temperature (on Reset)' : 'Room air temperature (input)', '°C');
      const eng = currentReadings(s).engine?.rooms[i];
      now.hidden = !live;
      setText(now, eng ? `Now ${fmt(eng.temperatureC, 1)} °C · ${fmt(eng.relativeHumidity * 100, 0)} % RH` : 'Now — °C · — % RH');
    },
  };
}

// ---------- room link popover (one instance, rebinds to the opened link by room pair) ----------
const LINK_OPENING = { min: 0, max: 20, step: 0.1 } as const;
const LINK_CONTACT = { min: 0, max: 150, step: 1 } as const;
const LINK_WOOL = { min: 45, max: 180, step: 5 } as const;
const LINK_COEFF = { min: 0, max: 100, step: 1 } as const;

interface LinkGeometry { opening: number; contact: number; mm: number; coeff: number }

/** The four geometry values a link shows. A legacy single-path link maps onto the matching path; the first edit then converts it. */
function geometryOf(l: InterzoneLink): LinkGeometry {
  const d = INTERZONE_GEOMETRY_DEFAULTS;
  if (hasInterzoneGeometry(l)) {
    return { opening: l.openingAreaM2 ?? 0, contact: l.contactAreaM2 ?? 0, mm: l.insulationMm ?? d.insulationMm, coeff: l.openingTransferWm2K ?? d.openingTransferWm2K };
  }
  const partition = l.kind === 'partition';
  const area = l.areaM2 ?? l.conductanceWK / (l.transferWm2K ?? (partition ? 1.5 : d.openingTransferWm2K));
  return { opening: partition ? 0 : area, contact: partition ? area : 0, mm: d.insulationMm, coeff: partition ? d.openingTransferWm2K : l.transferWm2K ?? d.openingTransferWm2K };
}

/** Signed sensible heat [W] from room A to room B reported by the accepted live engine state; null in Examples, while readings are withheld, or when absent. */
export function linkHeatW(s: AppState, roomA: string, roomB: string): number | null {
  if (s.ui.experience !== 'live') return null;
  for (const t of currentReadings(s).engine?.interzoneTransfers ?? []) {
    if (t.roomA === roomA && t.roomB === roomB) return t.heatFromAToBW;
    if (t.roomA === roomB && t.roomB === roomA) return -t.heatFromAToBW;
  }
  return null;
}

/** The room boundary owns geometry; the accepted engine owns dynamic heat/flow diagnostics. */
export function createLinkSettings(): PopContent {
  let idx = 0, lowerOptions = '';
  const link = (): InterzoneLink | undefined => store.state.cfg.interzoneLinks?.[idx];
  const edit = (patch: Parameters<typeof store.setInterzoneLink>[2]): void => {
    const l = link(); if (l) store.setInterzoneLink(l.roomA, l.roomB, patch);
  };
  const geometry = (change: Partial<LinkGeometry>): void => {
    const l = link(); if (!l) return;
    const g = { ...geometryOf(l), ...change };
    edit({ openingAreaM2: g.opening, contactAreaM2: g.contact, insulationMm: g.mm });
  };
  const fields: Field[] = [];
  const reg = <T extends Field>(f: T): T => { fields.push(f); return f; };
  const opening = reg(pairField({ label: 'Opening area', unit: 'm²', ...LINK_OPENING, digits: 1, layout: 'line',
    get: () => link() ? geometryOf(link()!).opening : 4, set: v => geometry({ opening: v }),
    title: 'Free area of the stairwell or doorway, excluded from solid contact area.' }));
  const contact = reg(pairField({ label: 'Solid contact area', unit: 'm²', ...LINK_CONTACT, digits: 0, layout: 'line',
    get: () => link() ? geometryOf(link()!).contact : 45, set: v => geometry({ contact: v }),
    title: 'Insulated floor or wall area between rooms, excluding the opening.' }));
  const wool = reg(pairField({ label: 'Glass wool', unit: 'mm', ...LINK_WOOL, digits: 0, layout: 'line',
    get: () => link() ? geometryOf(link()!).mm : 120, set: v => geometry({ mm: v }) }));
  const orientation = reg(segmented<'horizontal' | 'vertical'>({ label: 'Connection direction', compact: true,
    options: [{ value: 'horizontal', text: 'Horizontal', title: 'Doorway in a wall, between rooms on one level' },
      { value: 'vertical', text: 'Vertical', title: 'Opening in a floor, between levels' }],
    get: () => link()?.orientation ?? 'vertical', set: v => edit({ orientation: v }) }));
  const height = reg(pairField({ label: 'Opening height', unit: 'm', min: .1, max: 6, step: .1, digits: 1, layout: 'line',
    get: () => link()?.openingHeightM ?? 2, set: v => edit({ openingHeightM: v }),
    title: 'Vertical height of the wall opening. Default 2 m is an editable assumption, independent of room ceiling height.' }));
  const lower = reg(select<string>({ label: 'Lower room', options: [],
    get: () => link()?.lowerRoomId ?? link()?.roomA ?? '', set: v => edit({ lowerRoomId: v }) }));
  const model = reg(segmented<'buoyancy' | 'prescribed'>({ label: 'Opening model', compact: true,
    options: [{ value: 'buoyancy', text: 'Buoyancy' }, { value: 'prescribed', text: 'Constant H' }],
    get: () => link()?.openingModel ?? 'buoyancy', set: v => edit({ openingModel: v }) }));
  const coeff = reg(pairField({ label: 'Opening coefficient', unit: 'W/(m²·K)', ...LINK_COEFF, digits: 0, layout: 'line',
    get: () => link() ? geometryOf(link()!).coeff : 40, set: v => edit({ openingTransferWm2K: v, openingModel: 'prescribed' }) }));
  const background = reg(pairField({ label: 'Background mixing', unit: 'W/K', min: 0, max: 200, step: 1, digits: 0, layout: 'line',
    get: () => link()?.backgroundConductanceWK ?? 0, set: v => edit({ backgroundConductanceWK: v }),
    title: 'Optional extra sensible mixing through an open passage. Zero by default; no forced mixing inferred from unit fan flow. Inactive when opening area is zero.' }));
  const floor = reg(pairField({ label: 'Floor opening coefficient', unit: '', min: 0, max: .1, step: .001, digits: 3, layout: 'line',
    get: () => link()?.floorCoefficient ?? .055, set: v => edit({ floorCoefficient: v }),
    title: 'Dimensionless coefficient 0.055 for a zero-pressure square opening; actual stairwell geometry may differ.' }));
  const wall = reg(pairField({ label: 'Wall discharge coefficient', unit: '', min: 0, max: 1, step: .01, digits: 2, layout: 'line',
    get: () => link()?.wallDischargeCoefficient ?? .6, set: v => edit({ wallDischargeCoefficient: v }),
    title: 'Generic doorway discharge coefficient, default 0.60, not measured.' }));
  const total = html('p', { class: 'status lk-total' }), now = html('p', { class: 'hint' }), stability = html('p', { class: 'hint' });
  const overrideNote = html('p', { class: 'status diff' });
  const useGeometry = html('button', { type: 'button', class: 'btn ghost small' }, 'Use geometry');
  useGeometry.addEventListener('click', () => geometry({}));
  const overrideBox = html('section', { class: 'sec lk-override', hidden: true }, overrideNote, useGeometry);
  const remove = html('button', { type: 'button', class: 'btn ghost small' }, 'Remove link');
  remove.addEventListener('click', () => { const l = link(); if (l) store.removeInterzoneLink(l.roomA, l.roomB); });
  const geo = html('section', { class: 'sec lk-geo' }, opening.root, contact.root, wool.root, orientation.root, height.root, total, now, stability);
  const root = html('div', { class: 'pop-settings' },
    html('p', { class: 'hint lead' }, 'Opening and insulated contact act together. A warm lower room drives rising-air exchange; warm air above cooler air is stable. Heat still conducts through the solid contact in either direction.'),
    overrideBox, geo,
    html('section', { class: 'sec' }, html('details', { class: 'fold' }, html('summary', {}, 'Advanced: model'),
      html('div', { class: 'fold-body' }, model.root, lower.root, background.root, floor.root, wall.root, coeff.root,
        html('p', { class: 'hint' }, 'Buoyancy is a sensible-heat equivalent of counterflow, not simulated air or humidity transport. Floor openings use a temperature-only, square-aperture, zero-pressure approximation; stair angle and forced airflow are unresolved. Background mixing defaults to zero.'),
        html('p', { class: 'hint' }, `Solid H = area ÷ (${INTERZONE_FILM_RESISTANCE_M2KW} + thickness ÷ ${INTERZONE_GLASS_WOOL_LAMBDA_WMK.toFixed(3)}), with thickness in metres and glass-wool λ in W/(m·K). Constant-H opening mode retains explicit legacy scenarios.`)))),
    html('section', { class: 'sec' }, remove));
  return { root,
    heading: (s, i) => { const l = s.cfg.interzoneLinks?.[i], name = (id: string): string => s.cfg.rooms.find(r => r.id === id)?.name ?? id;
      return { kicker: 'Room link', title: l ? `${name(l.roomA)} ↔ ${name(l.roomB)}` : 'Room link' }; },
    sync(s: AppState, i: number): void {
      idx = i; const l = s.cfg.interzoneLinks?.[i]; if (!l) return;
      const name = (id: string): string => s.cfg.rooms.find(r => r.id === id)?.name ?? id;
      const signature = `${l.roomA}:${name(l.roomA)}|${l.roomB}:${name(l.roomB)}`;
      if (signature !== lowerOptions) { lowerOptions = signature; lower.sel.replaceChildren(...[l.roomA, l.roomB].map(id => html('option', { value: id }, name(id)))); }
      for (const f of fields) f.refresh();
      const g = geometryOf(l), overridden = l.conductanceOverrideWK !== undefined, buoyant = usesBuoyancyOpening(l), vertical = (l.orientation ?? 'vertical') === 'vertical';
      const t = currentReadings(s).engine?.interzoneTransfers?.find(t => t.roomA === l.roomA && t.roomB === l.roomB || t.roomA === l.roomB && t.roomB === l.roomA);
      overrideBox.hidden = !overridden; toggleClass(geo, 'overridden', overridden);
      setText(overrideNote, overridden ? `Fixed-H override: ${fmt(l.conductanceOverrideWK!, 0)} W/K. Use geometry to restore the opening model.` : '');
      toggleClass(wool.root, 'dim', g.contact === 0);
      height.root.hidden = !buoyant || vertical; lower.root.hidden = !buoyant || !vertical;
      floor.root.hidden = !buoyant || !vertical; wall.root.hidden = !buoyant || vertical;
      background.root.hidden = !buoyant; coeff.root.hidden = l.openingModel !== 'prescribed';
      const effectiveH = buoyant ? t?.effectiveConductanceWK : interzoneConductance(l);
      setText(total, effectiveH === undefined ? `Base H: ${fmt(interzoneConductance(l), 1)} W/K + buoyancy (live value pending)`
        : `H now: ${fmt(effectiveH, 1)} W/K${overridden ? ' · fixed override' : buoyant ? ' · varies with temperatures' : ' · prescribed'}`);
      const q = linkHeatW(s, l.roomA, l.roomB);
      setText(now, q === null ? 'Heat: — (live engine value unavailable)' : `${fmt(Math.abs(q) / 1000, 2)} kW from ${name(q >= 0 ? l.roomA : l.roomB)} to ${name(q >= 0 ? l.roomB : l.roomA)}`);
      setText(stability, buoyant && t?.buoyancyState ? `${t.buoyancyState === 'stable' ? 'Stable: warm air above cooler air' : t.buoyancyState === 'unstable' ? 'Rising-air exchange: warm air below' : t.buoyancyState === 'neutral' ? 'No temperature difference' : 'Doorway counterflow'} · solid ${fmt(Math.abs(t.solidHeatFromAToBW ?? 0), 0)} W · opening ${fmt(Math.abs((t.buoyancyHeatFromAToBW ?? 0) + (t.backgroundHeatFromAToBW ?? 0)), 0)} W` : buoyant && vertical ? `Lower room: ${name(l.lowerRoomId ?? l.roomA)}` : '');
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
