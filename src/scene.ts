import { HUMIDITY_CONVENTION } from './chrome';
import { airColor, indoorCoilProbeExample, indoorCoilProbeLive, inventoryCoilProbe, outdoorCoilProbe, segKind, valvePairs } from './circuit';
import type { CoilProbe } from './circuit';
import { clamp, fmt, html, setAttr, setText, svg, toggleClass } from './dom';
import { branchesFor, readingFlowMode, segmentFor, simulation } from './runtime/view';
import {
  A, L, LINE_CTL, INDOOR_COIL, OUT, PILL, PROBE_AT, ROOM_COLS, ROOM_PANEL_H, UNIT,
  indoorProbeAt, layoutFor, lineCtlBox, pipeSpecs, roomBoxes, ygOf, ylOf,
} from './geometry';
import type { Layout, RoomBox } from './geometry';
import { CoilNote, Pipe, Probe } from './pipes';
import type { Pt } from './pipes';
import { ENVELOPE_LOSS, createHeatLossGuide, createLineLength, createLineModelSwitch, isolate, pairField, weatherScope } from './settings';
import type { HeatLossGuide, LineLengthControl, OutdoorUnitCard, PairField } from './settings';
import type { Clock } from './state';
import { ICE_FULL_KG, ICE_START_KG, activeRooms, currentReadings, indoorCleanliness, liveStatus, outdoorCleanliness, store } from './state';
import { fixtureFor } from './fixtures';
import type { AppState, RoomConfig, ZoomPreset } from './types';
import { INDOOR_CLASSES, OWNER_PORTS, outdoorPortCapacity, roomVolumeM3 } from './types';

type G = SVGGElement;

const DIRT_BANDS = 6;
const DIRT_SPOTS = 9;

/**
 * Pure-vector fouling on a coil face: a haze, dust bands and spots that appear progressively as cleanliness falls.
 * Hidden at 100 %. Drawn below the tubes and the ice layers, so phase colours, frost and gauges stay readable.
 */
function dirtLayer(x: number, y: number, w: number, h: number): G {
  const g = svg('g', { class: 'dirt', display: 'none' }, svg('title', {}));
  g.append(svg('rect', { class: 'dirt-haze', x, y, width: w, height: h }));
  for (let b = 0; b < DIRT_BANDS; b++) {
    const k = ((b * 7) % 5) / 5;
    g.append(svg('rect', { class: 'dirt-band', x: x + w * 0.04 * k, y: y + h * ((b + 0.3) / DIRT_BANDS), width: w * (0.62 + 0.34 * ((b * 3) % 4) / 3), height: h * 0.06, opacity: 0 }));
  }
  const r = Math.min(w, h) * 0.035;
  for (let s = 0; s < DIRT_SPOTS; s++) {
    g.append(svg('circle', { class: 'dirt-spot', cx: x + w * (0.08 + 0.84 * (((s * 37) % 100) / 100)), cy: y + h * (0.06 + 0.88 * (((s * 61) % 100) / 100)), r: r * (1 + (s % 3) * 0.5), opacity: 0 }));
  }
  return g;
}

/** Fouling is proportional to the blocked fraction: 0 at 100 % clear, 1 at 10 % clear. */
function setDirt(g: G, pct: number, who: string, source: 'global' | 'override'): void {
  const d = clamp((100 - pct) / 90, 0, 1);
  setAttr(g, 'display', d > 0 ? 'inline' : 'none');
  const title = g.querySelector('title');
  if (title) setText(title, `${who} cleanliness ${fmt(pct, 0)} % clear (${source})`);
  g.querySelector('.dirt-haze')?.setAttribute('opacity', (0.3 * d).toFixed(3));
  g.querySelectorAll('.dirt-band').forEach((el, i) => setAttr(el, 'opacity', (clamp(d * DIRT_BANDS - i, 0, 1) * 0.5).toFixed(3)));
  g.querySelectorAll('.dirt-spot').forEach((el, i) => setAttr(el, 'opacity', (clamp(d * DIRT_SPOTS - i, 0, 1) * 0.6).toFixed(3)));
}

/** Hooks the scene calls for controls that open a contextual popover; the owner decides what opens and where it anchors. */
export interface SceneHooks {
  toggleRoom(i: number, anchor: HTMLElement): void;
  toggleLines(i: number, anchor: HTMLElement): void;
}

export interface Scene {
  root: SVGSVGElement;
  guideRoot: HTMLElement;
  sync(s: AppState): void;
  tick(s: AppState, clock: Clock): void;
  zoomTo(z: ZoomPreset, immediate?: boolean): void;
  /** The room's indoor-unit panel, used as the anchor of its popovers. */
  roomAnchor(i: number): HTMLElement | null;
}

type Box = [number, number, number, number];

function presetsFor(lay: Layout): Record<ZoomPreset, Box> {
  const presets: Record<ZoomPreset, Box> = {
    overview: [0, 0, lay.vbW, lay.vbH],
    outdoor: [2, OUT.y - 66, OUT.x + OUT.w + 30, lay.outH + 104],
    // The rooms view keeps the line-length column (left of the wall) so every length stays editable there.
    rooms: [lay.ctlX - 8, 0, lay.vbW - lay.ctlX + 8, lay.vbH],
  };
  for (const b of roomBoxes(lay.n)) {
    const id = store.state.cfg.rooms[b.i]?.id;
    if (id) presets[`room:${id}`] = [lay.ctlX - 8, Math.max(0, b.top - 8), lay.vbW - lay.ctlX + 8, Math.min(b.h + 16, 246)];
  }
  return presets;
}

const reduceMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function txt(x: number, y: number, s: string, cls = 'lbl', anchor: 'start' | 'middle' | 'end' = 'start'): SVGTextElement {
  const t = svg('text', { x, y, class: cls, 'text-anchor': anchor });
  t.textContent = s;
  return t;
}

function sel(id: string, label: string, box: { x: number; y: number; w: number; h: number; r?: number }, ...kids: Node[]): G {
  const g = svg('g', { class: 'sel', 'data-id': id, tabindex: 0, role: 'button', 'aria-label': label, 'aria-pressed': 'false' });
  g.append(svg('rect', { class: 'hit', x: box.x, y: box.y, width: box.w, height: box.h, rx: box.r ?? 4 }));
  g.append(...kids);
  g.append(svg('rect', { class: 'ring', x: box.x - 2, y: box.y - 2, width: box.w + 4, height: box.h + 4, rx: (box.r ?? 4) + 2 }));
  return g;
}

function defs(): SVGDefsElement {
  const stop = (o: number, c: string, op = 1): SVGStopElement => svg('stop', { offset: `${o}%`, 'stop-color': c, 'stop-opacity': op });
  const lin = (id: string, x2: number, y2: number, stops: SVGStopElement[]): SVGLinearGradientElement =>
    svg('linearGradient', { id, x1: 0, y1: 0, x2, y2 }, ...stops);
  return svg('defs', {},
    lin('gSteel', 1, 0, [stop(0, '#aeb9c4'), stop(45, '#eef1f4'), stop(100, '#8d99a6')]),
    lin('gCopper', 1, 0, [stop(0, '#9c6a3c'), stop(50, '#e0b185'), stop(100, '#8a5a30')]),
    lin('gShell', 0, 1, [stop(0, '#fbfbfa'), stop(100, '#e3e6e8')]),
    lin('gShellGen', 0, 1, [stop(0, '#dde3e8'), stop(100, '#b9c3cc')]),
    lin('gCaseOwner', 0, 1, [stop(0, '#f4f5f4'), stop(100, '#d9dde0')]),
    lin('gCaseGen', 0, 1, [stop(0, '#c9d2da'), stop(100, '#9eabb7')]),
    svg('pattern', { id: 'pFins', width: 3, height: 10, patternUnits: 'userSpaceOnUse' },
      svg('rect', { width: 3, height: 10, fill: '#cfd6dc' }),
      svg('path', { d: 'M0.5 0V10', stroke: '#8f9ba6', 'stroke-width': 0.7 })),
    svg('pattern', { id: 'pGrille', width: 4, height: 4, patternUnits: 'userSpaceOnUse' },
      svg('path', { d: 'M0 2H4', stroke: '#9aa6b1', 'stroke-width': 0.8 })),
    // Tube interior when fluid flows but no temperature is reported: hatched neutral, never a fabricated colour.
    svg('pattern', { id: 'pTempNone', width: 3.2, height: 3.2, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' },
      svg('rect', { width: 3.2, height: 3.2, fill: '#dadee1' }),
      svg('path', { d: 'M0.4 0V3.2', stroke: '#9aa3ab', 'stroke-width': 1 })),
  );
}

/** Direction head at the end of a stream: a small open chevron pointing along `dir` (unit vector). It stays visible when motion is stopped. */
function streamHead(x: number, y: number, dir: Pt): SVGPathElement {
  const [dx, dy] = dir;
  const px = -dy;
  const py = dx;
  const p = (a: number, b: number): string => `${(x + a * px - b * dx).toFixed(1)} ${(y + a * py - b * dy).toFixed(1)}`;
  return svg('path', { class: 'head', d: `M${p(-2.8, 3.2)}L${x.toFixed(1)} ${y.toFixed(1)}L${p(2.8, 3.2)}` });
}

/**
 * Supply air under an indoor unit: five short streams falling from the outlet louvre, spreading slightly. A visual cue rather than a resolved air-flow simulation. `len` shrinks with the row height; the stylesheet shows it only while that unit's fan runs.
 */
function indoorAir(unitX: number, y0: number, len: number, inlet = false, width = UNIT.w): G {
  const g = svg('g', { class: `airflow ${inlet ? 'intake' : 'supply'}` });
  for (let k = 0; k < 9; k++) {
    const x = unitX + INDOOR_COIL.x + (Math.round(width * .95) - INDOOR_COIL.x) * k / 8;
    const dx = inlet ? 0 : (k - 4) * 1.1;
    const end = y0 + len;
    const first = inlet ? 3 : 4;
    const resume = inlet ? len - 7 : len - 8;
    g.append(svg('path', { class: 'stream', d: `M${x} ${y0}L${x} ${y0 + first}M${x + dx} ${y0 + resume}L${x + dx} ${end}` }),
      streamHead(x + dx, end + 1, [0, 1]));
  }
  return g;
}

/** Outdoor exhaust, local casing coordinates: four streams leaving the coil face to the left, two above and two below the AIR probe. */
function exhaustAir(): G {
  const g = svg('g', { class: 'airflow exhaust' });
  for (const y of [88, 96, 177, 184]) {
    const end = y + (y < 120 ? -4 : 4);
    g.append(
      svg('path', { class: 'stream', d: `M-24 ${y}C-52 ${y} -92 ${end} -124 ${end}` }),
      streamHead(-126, end, [-1, 0]));
  }
  return g;
}

/**
 * Exhaust-air temperature sensor of the outdoor unit: a rod with a bulb standing in the exhaust and plain post-fan
 * air temperature on the background, visibly distinct from refrigerant clamps on the tubes; it
 * never shows the ambient, coil metal or refrigerant temperature. Built once; update() writes text and attributes only.
 */
class AirProbe {
  readonly g: G;
  private readonly val: SVGTextElement;
  private readonly cap: SVGTextElement;
  private readonly title: SVGTitleElement;
  private readonly power: SVGTextElement;
  private readonly powerLabel: SVGTextElement;
  private lastKey = '';

  constructor(at: Pt, lead: Pt, bulb: Pt) {
    const x = at[0] + PILL.w / 2;
    this.val = svg('text', { x, y: at[1] + 19, class: 's-val a-value', 'text-anchor': 'middle' });
    this.cap = svg('text', { x, y: at[1] - 5, class: 'a-cap', 'text-anchor': 'middle' });
    this.title = svg('title');
    this.power = svg('text', { x, y: at[1] + 60, class: 'a-power', 'text-anchor': 'middle' });
    this.powerLabel = svg('text', { x, y: at[1] + 37, class: 'a-cap', 'text-anchor': 'middle' });
    this.g = svg('g', { class: 'air-probe', 'data-probe': 'outdoor-exhaust-air', role: 'img', 'aria-label': 'Outdoor exhaust air temperature and refrigerant coil heat' },
      this.title, svg('path', { class: 'a-rod', d: `M${lead[0]} ${lead[1]}H${bulb[0] - 3.4}` }),
      svg('circle', { class: 'a-bulb', cx: bulb[0], cy: bulb[1], r: 3.4 }), this.cap, this.val, this.powerLabel, this.power);
  }

  /** `tempC` null shows a dimmed dash; `caption` states why (fan off, unavailable) or what the number is. */
  update(tempC: number | null, caption: string, source: 'live' | 'example', held: boolean, detail: string, heatW: number | null): void {
    const key = `${tempC}|${caption}|${source}|${held}|${detail}|${heatW}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    const text = tempC === null ? '—' : fmt(tempC, 1);
    setText(this.val, `${text} °C`);
    setText(this.cap, caption);
    setText(this.powerLabel, heatW === null ? 'Coil heat' : heatW < 0 ? 'REF absorbed' : 'REF released');
    setText(this.power, heatW === null ? '— kW' : `${fmt(Math.abs(heatW)/1000, 2)} kW`);
    toggleClass(this.g, 'na', tempC === null);
    toggleClass(this.g, 'held', held);
    setAttr(this.g, 'data-source', source);
    setAttr(this.g, 'data-temp', tempC === null ? 'unknown' : tempC.toFixed(1));
    setAttr(this.g, 'data-exact', tempC === null ? '' : String(tempC));
    setText(this.title, `Outdoor exhaust air (post-fan) · ${tempC === null ? 'unavailable' : `${text} °C`} · ${caption} · ${detail}`);
  }
}

function snowflake(cx: number, cy: number, r: number): SVGPathElement {
  const d: string[] = [];
  for (let a = 0; a < 3; a++) {
    const t = (a * Math.PI) / 3;
    const dx = Math.cos(t) * r;
    const dy = Math.sin(t) * r;
    d.push(`M${(cx - dx).toFixed(1)} ${(cy - dy).toFixed(1)}L${(cx + dx).toFixed(1)} ${(cy + dy).toFixed(1)}`);
  }
  return svg('path', { d: d.join(''), class: 'flake' });
}

/** Static common service-isolation valve (gas stop / liquid stop). Distinct from the copper EEV bodies; no actuator. */
function stopValve(label: string, below = false): G {
  return svg('g', { class: 'stop' },
    svg('circle', { r: 6, class: 'stop-body' }),
    svg('path', { d: 'M-3.6 -3L0 0L-3.6 3zM3.6 -3L0 0L3.6 3z', class: 'stop-tie' }),
    svg('path', { d: below ? 'M3.8 4L8.4 8.6' : 'M3.8 -4L8.4 -8.6', class: 'stop-stem' }),
    svg('circle', { cx: 9.6, cy: below ? 9.8 : -9.8, r: 2.1, class: 'stop-knob' }),
    below ? txt(0, 19, label, 'dl lbl stop-lbl', 'middle') : txt(9, 3, label, 'dl lbl stop-lbl'));
}

/** Round pressure dial; value is written by update(). */
class Gauge {
  readonly g: G;
  private readonly needle: SVGLineElement;
  private readonly val: SVGTextElement;
  private readonly unit: SVGTextElement | null;
  constructor(cx: number, cy: number, tag: string, virtual: boolean, branch = false) {
    this.needle = svg('line', { x1: 0, y1: 0, x2: 0, y2: -6, class: 'g-needle' });
    this.val = svg('text', { x: branch ? 0 : 10, y: branch ? 24 : 2.5, 'text-anchor': branch ? 'middle' : 'start', class: branch ? 'g-val branch-value' : 'g-val dl' });
    this.unit = branch ? txt(0, 38, '', 'branch-unit', 'middle') : null;
    this.g = svg('g', { class: `gauge${virtual ? ' virtual' : ''}${branch ? ' branch-gauge' : ''}`, transform: `translate(${cx} ${cy})` },
      svg('circle', { r: 8, class: 'g-face' }),
      svg('path', { d: 'M-5.6 4.4A7.2 7.2 0 1 1 5.6 4.4', class: 'g-arc' }),
      this.needle, svg('circle', { r: 1.3, class: 'g-hub' }), this.val,
      txt(branch ? 0 : 10, branch ? -13 : -4.5, tag, branch ? 'g-tag branch-tag' : 'g-tag dl', branch ? 'middle' : 'start'));
    if (this.unit) this.g.append(this.unit);
  }
  set(barA: number | null, text: string): void {
    setText(this.val, this.unit ? text.split(' ')[0]! : text);
    if (this.unit) setText(this.unit, text.includes('bar(g)') ? 'bar(g)' : 'bar(a)');
    const a = barA === null ? -140 : -140 + clamp(barA / 32, 0, 1) * 280;
    setAttr(this.needle, 'transform', `rotate(${a.toFixed(1)})`);
    toggleClass(this.g, 'off', barA === null);
  }
}

/** Target bounds and step. */
const SP_MIN = 16;
const SP_MAX = 30;
const SP_STEP = 0.5;

/** Supported ambient range of the engine's outdoor-air guard. Weather sliders and number bounds follow it. */
const AMBIENT_MIN = -25;
const AMBIENT_MAX = 45;

/** Floor area and ceiling height bounds of a room; the volume is derived from them. */
const AREA = { min: 5, max: 250, step: 0.1 } as const;
const HEIGHT = { min: 2.2, max: 6, step: 0.01 } as const;
/** The heat-loss guide panel, in scene units. */

/** Weather (unboxed, floats in the OUTDOOR zone) above the outdoor-unit card, both left of the riser corridor. */
const OP = { x: 16, y: 34, w: 322, h: 100 } as const;
/** The unit card is wider than the weather: the casing and its risers start at x 140 / 459, so the card has free room up to x 440. */
const UP = { x: 16, y: 142, w: 422, h: 374 } as const;

/** Native HTML in a click-through foreignObject; only elements marked `.rp-ctl` (or an opted-in card) take pointer events. */
function overlayPanel(x: number, y: number, w: number, h: number, el: HTMLElement): SVGForeignObjectElement {
  return svg('foreignObject', { class: 'panel-fo', x, y, width: w, height: h }, el);
}

/** One labelled numeric readout: label, large value with a separate unit suffix, and a one-line note. */
function readCard(label: string, unit: string): { root: HTMLElement; k: HTMLElement; v: HTMLElement; u: HTMLElement; n: HTMLElement } {
  const k = html('span', { class: 'rp-k' }, label);
  const v = html('span', { class: 'rp-v' });
  const u = html('small', {}, unit);
  const n = html('span', { class: 'rp-n' });
  return { root: html('div', { class: 'rp-card' }, k, html('span', { class: 'rp-line' }, v, u), n), k, v, u, n };
}

/** Value text with the unavailable state kept visible as a dimmed dash, never as a zero. */
function setReading(v: HTMLElement, text: string): void {
  setText(v, text);
  toggleClass(v, 'na', text === '—');
}

interface WeatherPanel {
  root: HTMLDivElement;
  t: PairField;
  h: PairField;
  status: HTMLElement;
  match: HTMLButtonElement;
}

/** Outdoor meteorological conditions: environment, not equipment. Built once per scene; no box, no border. */
function weatherPanel(): WeatherPanel {
  const t = pairField({
    label: 'Temperature', unit: '°C', min: AMBIENT_MIN, max: AMBIENT_MAX, step: 0.5, digits: 1, layout: 'block',
    get: () => store.state.cfg.outdoorC, set: (v) => store.update((s) => { s.cfg.outdoorC = v; }),
    title: `Outdoor air temperature, supported range ${AMBIENT_MIN}…${AMBIENT_MAX} °C`,
  });
  const h = pairField({
    label: 'Humidity', unit: '% RH', min: 10, max: 100, step: 1, digits: 0, layout: 'block', title: HUMIDITY_CONVENTION,
    get: () => store.state.cfg.outdoorRh, set: (v) => store.update((s) => { s.cfg.outdoorRh = v; }),
  });
  const status = html('span', { class: 'op-status' });
  const match = html('button', { type: 'button', class: 'rp-btn rp-ctl' }, 'Match fixture');
  match.addEventListener('click', () => store.update((s) => {
    const fx = fixtureFor(s.cfg.mode, s.cfg.example);
    s.cfg.outdoorC = fx.conditions.outdoorC;
    s.cfg.outdoorRh = fx.conditions.outdoorRh;
  }));
  isolate(match);
  const root = html('div', { class: 'rp op env', 'aria-label': 'Outdoor air' },
    html('div', { class: 'op-top' }, html('div', { class: 'op-glyph' }), html('div', { class: 'op-ctls' }, t.root, h.root)),
    html('div', { class: 'op-foot' }, status, match));
  return { root, t, h, status, match };
}

/**
 * One room, split by what it is. `env` is the ROOM environment (floor area, ceiling height, derived volume, measured air and humidity,
 * envelope loss, remove): unboxed, on the room zone. `equip` is the INDOOR UNIT (requested On/Off, supplied AIR, net room kW, target,
 * settings), a quiet card beside the unit.
 */
interface RoomPanel {
  equip: HTMLDivElement;
  env: HTMLDivElement;
  /** Room id this panel last showed; a change means the index was rebound after a removal. */
  boundId: string;
  name: HTMLElement;
  air: ReturnType<typeof readCard>;
  sup: ReturnType<typeof readCard>;
  heat: ReturnType<typeof readCard>;
  sp: PairField;
  area: PairField;
  height: PairField;
  /** Derived volume readout: floor area × ceiling height. Not an input. */
  volume: HTMLElement;
  intake: HTMLElement;
  outlet: HTMLElement;
  loss: PairField;
  /** Direct indoor-unit On/Off switch (configuration `enabled`). */
  sw: HTMLInputElement;
  swText: HTMLElement;
  remove: HTMLButtonElement;
}

function roomPanel(i: number, hooks: SceneHooks, guide: HeatLossGuide): RoomPanel {
  const edit = (fn: (r: RoomConfig) => void): void => store.update((s) => { const x = s.cfg.rooms[i]; if (x) fn(x); });
  const at = (): RoomConfig | undefined => store.state.cfg.rooms[i];
  const sp = pairField({
    label: 'Target', unit: '°C', min: SP_MIN, max: SP_MAX, step: SP_STEP, digits: 1, layout: 'block',
    get: () => at()?.setpointC ?? 21, set: (v) => edit((r) => { r.setpointC = v; }),
  });
  const area = pairField({
    label: 'Floor area', unit: 'm²', ...AREA, digits: 1, layout: 'block',
    get: () => at()?.surfaceM2 ?? 20, set: (v) => edit((r) => { r.surfaceM2 = v; }),
  });
  const height = pairField({
    label: 'Ceiling height', unit: 'm', ...HEIGHT, digits: 2, layout: 'block',
    get: () => at()?.ceilingHeightM ?? 2.5, set: (v) => edit((r) => { r.ceilingHeightM = v; }),
  });
  const loss = pairField({
    label: 'Envelope loss', unit: 'W/K', ...ENVELOPE_LOSS, digits: 0, layout: 'block',
    get: () => at()?.heatLossWPerK ?? 60, set: (v) => edit((r) => { r.heatLossWPerK = v; }),
    title: 'Envelope heat-loss coefficient. Ventilation is modelled separately.',
  });
  loss.root.querySelector('.pf-head')?.append(guide.button(i));
  const volumeV = html('span', { class: 'rp-v', 'data-field': 'room-volume' });
  const volume = html('div', { class: 'env-vol', title: 'Derived volume: floor area × ceiling height. Not an input.' },
    html('span', { class: 'rp-k' }, 'Volume'), html('span', { class: 'rp-line' }, volumeV, html('small', {}, 'm³')));
  const sep = (glyph: string): HTMLElement => html('span', { class: 'env-op', 'aria-hidden': 'true' }, glyph);
  // The card is narrow: the "requested" qualifier lives in the tooltip and the accessible name, not in a clipped note.
  sp.root.title = 'Requested target temperature; compare it with the measured room air';
  const air = readCard('Room air', '°C');
  air.root.className = 'env-read flow-in';
  const sup = readCard('Supply air', '°C');
  const heat = readCard('Net heating', 'kW');
  sup.root.className = 'flow-reading';
  heat.root.className = 'flow-reading';
  const outlet = html('div', { class: 'flow-out' }, sup.root, heat.root);
  const name = html('span', { class: 'rp-name' });
  // Direct indoor-unit On/Off: edits the requested `enabled` configuration only; the target stays editable when off.
  const sw = html('input', { type: 'checkbox', role: 'switch', class: 'toggle rp-ctl' });
  const swText = html('span', { class: 'rp-sw-t' });
  const swLabel = html('label', { class: 'rp-sw rp-ctl' }, sw, swText);
  sw.addEventListener('change', () => edit((r) => { r.enabled = sw.checked; }));
  const linesBtn = html('button', { type: 'button', class: 'rp-btn rp-ctl', 'aria-haspopup': 'dialog' }, 'Lines');
  const gearBtn = html('button', { type: 'button', class: 'rp-btn rp-ctl', 'aria-haspopup': 'dialog' }, 'Settings');
  const remove = html('button', { type: 'button', class: 'rp-btn rp-ctl rp-remove' }, 'Remove room');
  remove.addEventListener('click', () => store.removeRoom(i));
  const tgt = html('div', { class: 'rp-card tgt' }, sp.root);
  const equip = html('div', { class: 'rp eq room-rp', 'data-block': 'equipment' },
    html('div', { class: 'rp-head' }, html('span', { class: 'eq-tag' }, 'Indoor unit'), swLabel, linesBtn, gearBtn),
    html('div', { class: 'rp-cards' }, tgt));
  const env = html('div', { class: 'rp env room-env', 'data-block': 'environment' },
    html('div', { class: 'rp-head' }, html('span', { class: 'env-tag' }, 'Room'), name, remove),
    html('div', { class: 'env-geo' }, area.root, sep('×'), height.root, sep('='), volume),
    html('div', { class: 'env-low' }, loss.root));
  linesBtn.addEventListener('click', () => hooks.toggleLines(i, equip));
  gearBtn.addEventListener('click', () => hooks.toggleRoom(i, equip));
  isolate(sw, swLabel, linesBtn, gearBtn, remove);
  return { equip, env, intake: air.root, outlet, boundId: '', name, air, sup, heat, sp, area, height, volume: volumeV, loss, sw, swText, remove };
}

/** Indoor-zone bar: room count against the outdoor group's port capacity, and the direct Add room action. */
interface RoomsBar {
  root: HTMLDivElement;
  count: HTMLElement;
  add: HTMLButtonElement;
  hint: HTMLElement;
}

function roomsBar(): RoomsBar {
  const count = html('span', { class: 'in-count', role: 'status' });
  const add = html('button', { type: 'button', class: 'rp-btn rp-ctl in-add' }, '+ Add room');
  add.addEventListener('click', () => store.addRoom());
  const hint = html('span', { class: 'in-hint' });
  isolate(add);
  return { root: html('div', { class: 'in-bar', 'data-block': 'rooms-bar' }, count, add, hint), count, add, hint };
}

interface RoomView {
  g: G;
  /** Inner `.room` group; carries the per-room fan state read by the stylesheet. */
  view: G;
  unit: G;
  panel: RoomPanel;
  unitLabel: SVGTextElement;
  fan: G;
  wash: SVGRectElement;
  gasProbe: Probe;
  liqProbe: Probe;
  note: CoilNote;
  gasGauge: Gauge;
  smallGauge: Gauge;
}

export function createScene(hooks: SceneHooks, unitCard: OutdoorUnitCard, film: HTMLElement): Scene {
  const first = layoutFor(3);
  const root = svg('svg', {
    class: 'scene', viewBox: `0 0 ${first.vbW} ${first.vbH}`, preserveAspectRatio: 'xMidYMid meet', role: 'group',
    'aria-label': 'Simulator workbench: outdoor zone with the outdoor unit at left, indoor zone with one row per room at right',
  });
  root.dataset.zoom = 'overview';

  let built = { n: -1, kind: '' };
  let layout: Layout = first;
  let presets = presetsFor(first);
  let pipes = new Map<string, Pipe>();
  let rooms: RoomView[] = [];
  let outLabel: SVGTextElement = txt(0, 0, '');
  let outSub: SVGTextElement = txt(0, 0, '');
  let valveLabel: SVGTextElement = txt(0, 0, '');
  let svcRole: SVGTextElement = txt(0, 0, '');
  // Panels are created once per index and re-attached by every rebuild, so controls keep their DOM identity and value.
  const weather = weatherPanel();
  const bar = roomsBar();
  // One heat-loss guide for every room, mounted above all rows and placed beside the room it is open for.
  const guide = createHeatLossGuide();
  const roomPanels: RoomPanel[] = [];
  const panelFor = (i: number): RoomPanel => (roomPanels[i] ??= roomPanel(i, hooks, guide));
  // Line-length controls (one per branch index) and the single field-line model switch live in the outdoor connection corridor.
  const lineCtls: LineLengthControl[] = [];
  const lineCtlFor = (i: number): LineLengthControl => (lineCtls[i] ??= createLineLength(i));
  const lineModel = createLineModelSwitch();
  let weatherG: G = svg('g');
  let weatherKind = '';
  let gaugeHP: Gauge | null = null;
  let gaugeLP: Gauge | null = null;
  let gaugeSvc: Gauge | null = null;
  let outDirt: G = svg('g');
  let inDirt: G[] = [];
  let iceSlab: G = svg('g');
  let frostFill: SVGRectElement = svg('rect');
  let flakes: SVGPathElement[] = [];
  let puddle: SVGEllipseElement = svg('ellipse');
  let coilGasProbe: Probe | null = null;
  let coilLiqProbe: Probe | null = null;
  let compDProbe: Probe | null = null;
  let compSProbe: Probe | null = null;
  let coilNote: CoilNote | null = null;
  let airProbe: AirProbe | null = null;
  let ambientAir = txt(0, 0, '');
  let exhaust: G = svg('g');
  let lastIce = -1;
  let lastWater = -1;
  let vb: number[] = [...presets.overview];
  let anim = 0;

  /** Tall scenes (more than five rooms) scroll vertically in the stage; the outdoor view always fits the stage. */
  function fit(z: ZoomPreset, box: ArrayLike<number>): void {
    const tall = layout.tall && (z === 'overview' || z === 'rooms');
    toggleClass(root, 'tall', tall);
    root.style.aspectRatio = tall ? `${box[2]} / ${box[3]}` : '';
  }

  /** Native help stays readable at any camera scale and inside the desktop viewport. */
  function placeGuide(): void {
    const i = guide.open;
    if (i < 0) return;
    const button = roomPanels[i]?.loss.root.querySelector('button');
    if (!button?.isConnected) { guide.close(); return; }
    const at = button.getBoundingClientRect();
    const h = Math.min(guide.root.scrollHeight, window.innerHeight - 32);
    guide.root.style.left = `${clamp(at.right - 380, 16, window.innerWidth - 396)}px`;
    guide.root.style.top = `${clamp(at.bottom + 8, 16, window.innerHeight - h - 16)}px`;
  }
  guide.onChange = placeGuide;

  function rebuild(n: number, kind: 'owner' | 'generic'): void {
    // A control the user is working in survives the rebuild: its element is re-attached, then focus is restored.
    const focused = document.activeElement instanceof HTMLElement && root.contains(document.activeElement) ? document.activeElement : null;
    root.replaceChildren(defs());
    pipes = new Map();
    rooms = [];
    inDirt = [];
    layout = layoutFor(n);
    presets = presetsFor(layout);
    const lay = layout;
    const boxes = roomBoxes(n);
    const owner = kind === 'owner';
    const wall = lay.wall;
    const zoom = store.state.ui.zoom;
    cancelAnimationFrame(anim);
    vb = [...(presets[zoom] ?? presets.overview)];
    root.setAttribute('viewBox', vb.join(' '));
    fit(zoom, vb);

    // ---- zones: flat OUTDOOR and INDOOR fields with a plain boundary strip between them ----
    root.append(
      svg('rect', { class: 'zone-out', 'data-zoom-target': 'outdoor', tabindex: 0, role: 'button', 'aria-label': 'Zoom to outdoor zone', x: 0, y: 0, width: wall.x0, height: lay.vbH }),
      svg('rect', { class: 'zone-in', 'data-zoom-target': 'rooms', tabindex: 0, role: 'button', 'aria-label': 'Zoom to indoor zone', x: wall.x1, y: 0, width: lay.vbW - wall.x1, height: lay.vbH }),
      svg('rect', { class: 'zone-edge', x: wall.x0, y: 0, width: wall.x1 - wall.x0, height: lay.vbH }),
      svg('path', { class: 'zone-base', d: `M14 ${lay.groundY}H${wall.x0 - 14}` }),
    );
    weatherG = svg('g', { class: 'weather', transform: `translate(${OP.x - 24} ${OP.y - 12})` });
    weatherKind = '';
    root.append(
      weatherG, overlayPanel(OP.x, OP.y, OP.w, OP.h, weather.root),
      overlayPanel(UP.x, UP.y, UP.w, UP.h, unitCard.root),
      svg('g', { 'data-zoom-target': 'outdoor', tabindex: 0, role: 'button', 'aria-label': 'Zoom to outdoor zone' }, txt(16, 26, 'OUTDOOR', 'zone-title')),
      svg('g', { 'data-zoom-target': 'rooms', tabindex: 0, role: 'button', 'aria-label': 'Zoom to indoor zone' }, txt(wall.x1 + 14, 26, 'INDOOR', 'zone-title')),
      overlayPanel(wall.x1 + 118, 6, 760, 26, bar.root),
      overlayPanel(lay.ctlX, 0, LINE_CTL.w, LINE_CTL.modelH, lineModel.root));

    // ---- rooms ----
    const zoneW = lay.vbW - wall.x1;
    for (const b of boxes) {
      const i = b.i;
      const view = svg('g', { class: 'room', 'data-room': i });
      // Quiet fills and light horizontal separators only: no bordered room boxes and no building architecture.
      const bg = svg('rect', { class: `room-bg${i % 2 ? ' alt' : ''}`, x: wall.x1, y: b.top, width: zoneW, height: b.h });
      const wash = svg('rect', { class: 'room-wash', x: wall.x1, y: b.top, width: zoneW, height: b.h });
      const sep = svg('path', { class: 'room-sep', d: `M${wall.x1} ${b.top}H${lay.vbW}` });
      const panel = panelFor(i);
      const unitX = b.unitX;
      const unitY = b.unitY;
      // Air crosses the full coil face; input and output values live directly in these streams.
      const intake = indoorAir(unitX, unitY - 42, 37, true);
      const supply = indoorAir(unitX, unitY + UNIT.h + 4, 65);
      const unit = svg('g', { class: `unit${INDOOR_CLASSES[activeClass(i)].generic ? ' generic' : ''}`, transform: `translate(${unitX} ${unitY})` });
      const fan = svg('g', { class: 'in-fan', transform: `translate(${INDOOR_COIL.x} 74)` },
        svg('path', { d: `M0 0H${INDOOR_COIL.end - INDOOR_COIL.x}M0 3H${INDOOR_COIL.end - INDOOR_COIL.x}M0 6H${INDOOR_COIL.end - INDOOR_COIL.x}`, class: 'slat' }));
      const label = txt(18, UNIT.h - 8, '', 'unit-label dl-ok');
      const dirt = dirtLayer(INDOOR_COIL.x, INDOOR_COIL.y, INDOOR_COIL.end - INDOOR_COIL.x, INDOOR_COIL.h);
      inDirt.push(dirt);
      unit.append(
        svg('rect', { class: 'unit-shell', x: 0, y: 0, width: UNIT.w, height: UNIT.h, rx: 14 }),
        svg('rect', { x: 8, y: 6, width: UNIT.w - 16, height: 11, rx: 5, fill: 'url(#pGrille)', opacity: 0.8 }),
        svg('rect', { class: 'coil-bay', x: INDOOR_COIL.x, y: INDOOR_COIL.y, width: INDOOR_COIL.end - INDOOR_COIL.x, height: INDOOR_COIL.h, rx: 4 }),
        svg('path', { d: `M${INDOOR_COIL.x} 20L${INDOOR_COIL.end} 70M${INDOOR_COIL.end} 20L${INDOOR_COIL.x} 70`, class: 'fin-hint' }),
        dirt,
        fan, label,
        svg('path', { d: `M${INDOOR_COIL.x} ${UNIT.h - 2}H${INDOOR_COIL.end}`, class: 'louvre' }),
        svg('path', { d: `M${INDOOR_COIL.x + 6} ${UNIT.h - 2}L${INDOOR_COIL.end - 6} ${UNIT.h + 5}`, class: 'louvre-flap' }));
      view.append(bg, wash, sep, intake, supply, unit);
      const wrapper = sel(`indoor:${i}`, `Indoor unit ${i + 1}`, { x: wall.x1 + 1, y: b.top + 1, w: zoneW - 2, h: b.h - 2, r: 2 }, view);
      setAttr(wrapper, 'data-zoom-target', `room:${store.state.cfg.rooms[i]!.id}`);
      // Panels: siblings of the selectable group (no nested interactive content), above it, click-through except their controls.
      const py = (h: number): number => b.top + clamp((b.h - h) / 2, 0, 10);
      root.append(wrapper, svg('g', { class: 'room-panel' },
        overlayPanel(unitX + 36, unitY - 44, UNIT.w - 72, 42, panel.intake),
        overlayPanel(unitX + 6, unitY + UNIT.h + 10, UNIT.w - 12, 58, panel.outlet),
        overlayPanel(b.x0 + ROOM_COLS.equip.dx, py(ROOM_PANEL_H.equip), ROOM_COLS.equip.w, ROOM_PANEL_H.equip, panel.equip),
        overlayPanel(b.x0 + ROOM_COLS.env.dx, py(ROOM_PANEL_H.env), ROOM_COLS.env.w, ROOM_PANEL_H.env, panel.env)));
      const lc = lineCtlBox(b, lay.ctlX);
      root.append(overlayPanel(lc.x, lc.y, lc.w, lc.h, lineCtlFor(i).root));
      const gasGauge = new Gauge(lay.ctlX + 39, b.top + 194, 'Gas', true, true);
      const smallGauge = new Gauge(lay.ctlX + 121, b.top + 194, 'Small', true, true);
      setAttr(gasGauge.g, 'data-branch-pressure', 'gas');
      setAttr(smallGauge.g, 'data-branch-pressure', 'small');
      setAttr(gasGauge.g, 'data-room-id', store.state.cfg.rooms[i]!.id);
      setAttr(smallGauge.g, 'data-room-id', store.state.cfg.rooms[i]!.id);
      gasGauge.g.append(svg('title', {}, 'Indoor coil gas-port pressure. Illustrative gauge connection; not a manufacturer service fitting.'));
      smallGauge.g.append(svg('title', {}, 'Indoor coil small-port pressure. Illustrative gauge connection; not a manufacturer service fitting.'));
      root.append(svg('g', { class: 'taps branch-taps' },
        svg('path', { class: 'tap-stub', d: `M${lay.ctlX - 5} ${b.gasY}V${b.top + 194}H${lay.ctlX + 31}` }),
        svg('path', { class: 'tap-stub', d: `M${lay.wall.x0 - 6} ${b.liqY}V${b.top + 194}H${lay.ctlX + 129}` }),
        svg('circle', { class: 'node virtual', cx: lay.ctlX - 5, cy: b.gasY, r: 2.2 }),
        svg('circle', { class: 'node virtual', cx: lay.wall.x0 - 6, cy: b.liqY, r: 2.2 }),
        gasGauge.g, smallGauge.g));
      const at = indoorProbeAt(b);
      rooms.push({
        g: wrapper, view, unit, panel, unitLabel: label, fan, wash, gasGauge, smallGauge,
        gasProbe: new Probe({ id: `indoor-gas-${i}`, label: `Indoor ${i + 1} gas-end refrigerant`, ...at.gas }),
        liqProbe: new Probe({ id: `indoor-liquid-${i}`, label: `Indoor ${i + 1} liquid-end refrigerant`, ...at.liq }),
        note: new CoilNote(`indoor-coil-${i}`, at.note, 'start', 12.5),
      });
    }
    if (zoneW > 0) root.append(svg('path', { class: 'room-sep', d: `M${wall.x1} ${lay.stackBottom}H${lay.vbW}` }));

    // ---- boundary pass-throughs ----
    for (const b of boxes) {
      root.append(
        svg('rect', { class: 'sleeve', x: wall.x0 - 2, y: b.gasY - 3.5, width: wall.x1 - wall.x0 + 4, height: 7, rx: 2 }),
        svg('rect', { class: 'sleeve', x: wall.x0 - 2, y: b.liqY - 3.5, width: wall.x1 - wall.x0 + 4, height: 7, rx: 2 }));
    }

    // ---- outdoor unit ----
    const og = svg('g', { class: 'outdoor', 'data-zoom-target': 'outdoor', transform: `translate(${OUT.x} ${OUT.y})` });
    const w = OUT.w;
    const h = lay.outH;
    const caseFill = owner ? 'url(#gCaseOwner)' : 'url(#gCaseGen)';
    og.append(
      svg('rect', { x: 8, y: h - 2, width: 26, height: 5, fill: '#6f7479' }),
      svg('rect', { x: w - 34, y: h - 2, width: 26, height: 5, fill: '#6f7479' }),
      svg('rect', { class: 'casing', x: 0, y: 0, width: w, height: h, rx: 8, fill: caseFill }),
      svg('rect', { class: 'casing-in', x: 5, y: 5, width: w - 10, height: h - 10, rx: 5 }),
      svg('rect', { x: 6, y: 8, width: 60, height: 219, fill: 'url(#pFins)' }),
    );
    const casing = sel('outdoor', owner ? 'Outdoor unit, Daikin 3MXM52N8' : 'Generic compatible outdoor unit', { x: 0, y: 0, w, h, r: 8 });
    casing.classList.add('casing-sel');
    og.append(casing);
    const overlay: Node[] = [];
    // frost / ice layers on the coil face
    frostFill = svg('rect', { class: 'frost-fill', x: 6, y: 8, width: 60, height: 219, opacity: 0 });
    const slabPts: string[] = ['0,8'];
    for (let y = 8; y <= 227; y += 9) slabPts.push(`${(-(8 + ((y * 7) % 11))).toFixed(1)},${y}`);
    slabPts.push('0,227');
    const icicles = [14, 30, 46, 58].map((x, k) => svg('polygon', { points: `${x - 4 - 6},227 ${x - 6 + 4},227 ${x - 6},${236 + (k % 2) * 7}`, class: 'ice' }));
    flakes = [30, 62, 96, 128, 160, 190].map((y, k) => {
      const f = snowflake(-3 - (k % 3) * 5, y, 4.2);
      return f;
    });
    iceSlab = svg('g', { class: 'ice-group' },
      svg('g', { class: 'ice-slab', transform: 'translate(6 0) scale(0 1)' }, svg('polygon', { points: slabPts.join(' '), class: 'ice' })),
      svg('g', { class: 'icicles' }, ...icicles.map((p) => p)),
      ...flakes,
    );
    outDirt = dirtLayer(6, 8, 60, 219);
    og.append(
      outDirt,
      svg('rect', { class: 'defrost-glow', x: 4, y: 6, width: 64, height: 223, rx: 4 }),
      frostFill, iceSlab,
      ...[16, 38, 56].map((x, k) => svg('path', { class: `drip d${k}`, d: `M${x} 226c-2 4 -3 6 -3 8a3 3 0 0 0 6 0c0 -2 -1 -4 -3 -8z` })),
    );
    puddle = svg('ellipse', { class: 'puddle', cx: 36, cy: h + 1, rx: 34, ry: 3 });
    og.append(puddle);

    // Exhaust air leaves to the left of the unit, in the margin below the REF note and around the AIR probe. Only exhaust is drawn.
    exhaust = exhaustAir();
    og.append(exhaust);

    // fan
    // Static axial grille only: concentric guard rings and spokes. No blade geometry and no rotation is drawn or claimed.
    og.append(sel('fan', 'Outdoor fan', { x: 82, y: 16, w: 84, h: 84, r: 42 },
      svg('g', { transform: `translate(${A.fan[0]} ${A.fan[1]})` },
        svg('circle', { r: 41, class: 'fan-guard' }), svg('circle', { r: 31, class: 'fan-guard' }), svg('circle', { r: 21, class: 'fan-guard' }),
        svg('path', { d: 'M0 -41V41M-41 0H41M-29 -29L29 29M29 -29L-29 29', class: 'fan-guard' }),
        svg('circle', { r: 5, class: 'hub' }))));
    overlay.push(txt(124, 13, 'Fan', 'dl lbl', 'middle'));

    // compressor
    og.append(sel('compressor', 'Compressor', { x: 94, y: 144, w: 40, h: 74, r: 14 },
      svg('rect', { x: 96, y: 150, width: 36, height: 64, rx: 14, fill: 'url(#gSteel)', stroke: '#6d7882', 'stroke-width': 1.4 }),
      svg('path', { d: 'M96 170H132M96 196H132', stroke: '#8a96a2', 'stroke-width': 0.8 }),
      svg('path', { d: 'M106 160c3 -5 12 -5 12 1s-8 7 -8 3', class: 'scroll' }),
      svg('path', { d: 'M104 178v14M110 178v14M116 178v14M122 178v14', class: 'windings' }),
      svg('rect', { x: 108, y: 146, width: 12, height: 6, rx: 2, fill: '#59636c' })));
    overlay.push(
      txt(114, 231, 'Compressor', 'dl lbl', 'middle'),
      svg('g', { class: 'port-badge fixed' }, svg('circle', { cx: 104, cy: 146, r: 5 }), txt(104, 148.4, 'D', 'pb', 'middle')),
      svg('g', { class: 'port-badge fixed' }, svg('circle', { cx: 140, cy: 198, r: 5 }), txt(140, 200.4, 'S', 'pb', 'middle')));

    // accumulator
    og.append(sel('accumulator', 'Accumulator', { x: 210, y: 140, w: 30, h: 76, r: 12 },
      svg('rect', { x: 212, y: 142, width: 26, height: 72, rx: 12, fill: 'url(#gSteel)', stroke: '#6d7882', 'stroke-width': 1.4 }),
      svg('path', { d: 'M219 150V196a6 6 0 0 0 12 0V150', class: 'utube' }),
      svg('path', { d: 'M213 192H237', class: 'level' })));
    overlay.push(txt(225, 231, 'Accumulator', 'dl lbl', 'middle'));

    // reversing valve
    valveLabel = txt(206, 85, '', 'valve-pair', 'middle');
    og.append(sel('reverser', 'Four-way reversing valve', { x: 172, y: 86, w: 68, h: 40, r: 8 },
      svg('rect', { x: 176, y: 90, width: 60, height: 32, rx: 9, class: 'valve-body' })));
    overlay.push(
      valveLabel,
      ...[['O', 176, 106], ['I', 236, 106], ['D', 190, 122], ['S', 224, 122]].map(([l, x, y]) =>
        svg('g', { class: `port-badge${l === 'D' || l === 'S' ? ' fixed' : ''}` }, svg('circle', { cx: Number(x), cy: Number(y), r: 5.2 }), txt(Number(x), Number(y) + 2.4, String(l), 'pb', 'middle'))),
      txt(206, 77, '4-way valve', 'dl lbl', 'middle'),
    );

    // outdoor coil selectable overlay
    og.append(sel('coil', 'Outdoor coil', { x: 4, y: 6, w: 64, h: 223, r: 4 }));
    overlay.push(txt(6, -3, 'Outdoor coil', 'dl lbl'));

    outLabel = txt(w - 10, 20, '', 'out-label', 'end');
    outSub = txt(w - 10, 31, '', 'out-sub', 'end');
    og.append(outLabel, outSub);
    root.append(og);
    root.append(overlayPanel(OUT.x, OUT.y + lay.outH + 4, OUT.w, 20, film));
    const ambientX = OUT.x + OUT.w / 2;
    ambientAir = txt(ambientX, OUT.y - 25, '', 'outdoor-ambient-value', 'middle');
    const inlet = indoorAir(OUT.x, OUT.y - 58, 52, true, OUT.w);
    inlet.classList.add('outdoor-intake');
    root.append(inlet, txt(ambientX, OUT.y - 48, 'Outdoor air', 'outdoor-ambient-label', 'middle'), ambientAir);

    // unused owner ports
    if (owner) {
      for (let i = n; i < OWNER_PORTS; i++) {
        og.append(
          svg('path', { class: 'cap-port', d: `M${w - 22} ${ygOf(i)}H${w}M${w - 22} ${ylOf(i)}H${w}` }),
          svg('rect', { class: 'cap', x: w - 4, y: ygOf(i) - 4, width: 5, height: 8, rx: 1 }),
          svg('rect', { class: 'cap', x: w - 4, y: ylOf(i) - 4, width: 5, height: 8, rx: 1 }),
        );
      }
      if (n < OWNER_PORTS) overlay.push(txt(w - 6, h - 6, `${OWNER_PORTS - n} port(s) capped`, 'dl lbl', 'end'));
    }

    // ---- pipes ----
    const pipeLayer = svg('g', { class: 'pipes' });
    const specs = pipeSpecs(n);
    for (const spec of specs) {
      const p = new Pipe(spec);
      pipes.set(spec.id, p);
      pipeLayer.append(p.g);
    }
    root.append(pipeLayer, svg('g', { class: 'ov', transform: `translate(${OUT.x} ${OUT.y})` }, ...overlay));

    // EEVs, service port, taps (above pipes)
    for (let i = 0; i < n; i++) {
      const y = ylOf(i);
      const [ex, ey] = L(286, y);
      root.append(sel(`eev:${i}`, `Outdoor expansion valve ${i + 1}`, { x: ex - 10, y: ey - 8, w: 20, h: 16, r: 3 },
        svg('g', { class: 'eev', transform: `translate(${ex} ${ey})` },
          svg('rect', { x: -8, y: -6, width: 16, height: 12, rx: 3, class: 'eev-body' }),
          svg('path', { d: 'M-5 -3.6L0 0L-5 3.6zM5 -3.6L0 0L5 3.6z', class: 'eev-tie' }),
          svg('path', { d: 'M-6 6V9M6 6V9', class: 'eev-coil' })),
        svg('g', { class: 'dl eev-num', transform: `translate(${ex - 8} ${ey + 6.5})` }, svg('circle', { r: 3.2 }), txt(0, 1.7, String(i + 1), 'eev-digit', 'middle'))));
    }
    const [bx, by] = n > 5 ? L(272, lay.feeder + 9) : L(272, 181);
    root.append(
      txt(bx, by, 'Branch EEVs', 'dl lbl eev-group'),
      txt(bx, by + 7, `1–${n}, numbered`, 'dl lbl eev-group'));

    // common service isolation valves: static, fully open, no control. Gas stop carries the service fitting.
    const [sx, sy] = L(A.svc[0], A.svc[1]);
    svcRole = txt(sx + 8, sy - 24, '', 'dl lbl svc-role');
    root.append(
      sel('service', 'Physical gas service port, fitted on the gas stop valve', { x: sx - 8, y: sy - 32, w: 16, h: 22, r: 3 },
        svg('g', { transform: `translate(${sx} ${sy})` },
          svg('path', { d: 'M0 -6V-14', class: 'svc-stub' }),
          svg('rect', { x: -4, y: -21, width: 8, height: 7, rx: 1.5, class: 'svc-cap' })), svcRole),
      sel('gasstop', 'Common gas stop valve, static and fully open', { x: sx - 9, y: sy - 9, w: 18, h: 18, r: 4 },
        svg('g', { transform: `translate(${sx} ${sy})` }, stopValve('GAS STOP'))));
    const [qx, qy] = L(190, lay.feeder); // on the common liquid feeder, upstream of every branch EEV
    root.append(sel('liqstop', 'Common liquid stop valve, static and fully open', { x: qx - 9, y: qy - 9, w: 18, h: 18, r: 4 },
      svg('g', { transform: `translate(${qx} ${qy})` }, stopValve('LIQ STOP', true))));
    gaugeSvc = new Gauge(sx, sy - 44, 'SVC', false);
    const [hx, hy] = L(150, 136);
    const [lx, ly] = L(158, 198);
    gaugeHP = new Gauge(hx, hy + 20, 'HP', true);
    gaugeLP = new Gauge(lx, ly + 13, 'LP', true);
    root.append(
      svg('g', { class: 'taps' },
        svg('path', { d: `M${hx} ${hy}V${hy + 12}`, class: 'tap-stub' }), svg('circle', { cx: hx, cy: hy, r: 2.2, class: 'node virtual' }),
        svg('path', { d: `M${lx} ${ly}V${ly + 5}`, class: 'tap-stub' }), svg('circle', { cx: lx, cy: ly, r: 2.2, class: 'node virtual' }),
        svg('path', { d: `M${sx} ${sy - 21}V${sy - 36}`, class: 'tap-stub' }),
        gaugeHP.g, gaugeLP.g, gaugeSvc.g));

    // branch line-set hit regions (selectable): at the riser, and where the pair enters the room. Both open the branch's line settings.
    for (let i = 0; i < n; i++) {
      const b = boxes[i];
      if (!b) continue;
      root.append(
        sel(`pipe:${i}`, `Refrigerant branch ${i + 1} line set`, { x: Math.min(b.gx, b.lx) - 8, y: b.gasY - 8, w: Math.abs(b.gx - b.lx) + 22, h: b.liqY - b.gasY + 16, r: 4 }),
        sel(`pipe:${i}`, `Refrigerant branch ${i + 1} line set at the indoor unit`, { x: wall.x1 + 2, y: b.gasY - 9, w: b.unitX - wall.x1 + 8, h: b.liqY - b.gasY + 18, r: 4 }));
    }

    // ---- refrigerant probes: materialised on the pipes, always visible, drawn last and click-through ----
    const P = PROBE_AT;
    coilGasProbe = new Probe({ id: 'outdoor-coil-gas', label: 'Outdoor coil gas-end refrigerant', ...P.coilGas });
    coilLiqProbe = new Probe({ id: 'outdoor-coil-liquid', label: 'Outdoor coil liquid-end refrigerant', ...P.coilLiq });
    compDProbe = new Probe({ id: 'compressor-discharge', label: 'Compressor discharge D refrigerant', ...P.compD });
    compSProbe = new Probe({ id: 'compressor-suction', label: 'Compressor suction S refrigerant', ...P.compS });
    coilNote = new CoilNote('outdoor-coil', P.coilNote, 'start', 14.5);
    airProbe = new AirProbe(P.airOut.at, P.airOut.lead, P.airOut.bulb);
    root.append(
      svg('g', { class: 'probes outdoor-probes', transform: `translate(${OUT.x} ${OUT.y})` }, coilGasProbe.g, coilLiqProbe.g, airProbe.g, compDProbe.g, compSProbe.g, coilNote.g),
      svg('g', { class: 'probes indoor-probes' }, ...rooms.flatMap((r) => [r.gasProbe.g, r.liqProbe.g, r.note.g])));
    placeGuide();

    built = { n, kind };
    lastIce = -1;
    lastWater = -1;
    if (focused?.isConnected && document.activeElement !== focused) focused.focus({ preventScroll: true });
  }

  const activeClass = (i: number) => (_state?.cfg.rooms[i]?.indoorClass ?? 'FTXA25');
  let _state: AppState | null = null;

  /** Outdoor-coil refrigerant heat [W], engine sign (negative = refrigerant absorbs). Examples derive it from the fixture ledger. */
  function outdoorHeatW(live: boolean, fm: string, engineW: number | null | undefined, qEvapKw: number | null, qCondKw: number | null): number | null {
    if (live) return engineW ?? null;
    if (fm === 'heating') return qEvapKw === null ? null : -qEvapKw * 1000;
    if (fm === 'cooling' || fm === 'defrost') return qCondKw === null ? null : qCondKw * 1000;
    return null;
  }

  function sync(s: AppState): void {
    _state = s;
    const cfg = s.cfg;
    if (built.n !== cfg.unitCount || built.kind !== cfg.outdoorKind) rebuild(cfg.unitCount, cfg.outdoorKind);
    const live = s.ui.experience === 'live';
    const rd = currentReadings(s);
    const fm = readingFlowMode(rd);
    const held = live && rd.live?.kind === 'updating';
    // Conserved-inventory circuit: physical states persist without circulation, so sensors and gauges read them even when idle.
    const inv = live && rd.usable ? rd.engine?.inventory ?? null : null;
    const act = activeRooms(cfg);
    const src: 'live' | 'example' = live ? 'live' : 'example';
    root.dataset.source = s.ui.experience;
    root.dataset.fm = fm;
    root.dataset.mode = cfg.mode;
    root.dataset.labels = s.ui.showLabels ? 'on' : 'off';
    root.dataset.taps = s.ui.showTaps ? 'on' : 'off';
    root.dataset.kind = cfg.outdoorKind;
    root.dataset.held = held ? '1' : '0';
    toggleClass(root, 'paused', s.ui.paused);
    // Phase marks are an explanatory pattern, not a measured velocity: their drift keeps a comfortable rate (at most twice the
    // 1× rate) however fast the simulated clock is requested. Pause and reduced motion are handled in the stylesheet.
    root.style.setProperty('--flow-dur', `${Math.max(1.3 / 2, 1.3 / s.ui.speed).toFixed(3)}s`);
    lineModel.refresh();
    root.dataset.fansOn = rd.outdoorFanOn ? '1' : '0';

    // pipes
    const n = cfg.unitCount;
    for (const [id, pipe] of pipes) {
      const st = segmentFor(id, rd);
      const kind = segKind(id);
      const bi = id.includes(':') ? Number(id.split(':')[1]) : 0;
      const pc = cfg.pipes[Math.min(bi, n - 1)];
      let width = 4.6;
      if (pipe.spec.cls === 'coil') width = 2.6;
      else if (kind === 'gasField' || kind === 'gasStub') width = pc ? pc.gasOdMm * 0.5 : 4.6;
      else if (kind === 'liqField' || kind === 'fieldStub') width = pc ? pc.liquidOdMm * 0.5 : 3.2;
      else if (pipe.spec.cls === 'liq') width = 3.2;
      pipe.setWidth(clamp(width, 2.4, 8));
      pipe.update(st, st.tempC === null ? 'temperature unknown' : `${fmt(st.tempC, 1)} °C${live ? '' : ' (illustrative)'}`);
    }
    const pair = valvePairs(inv ? inv.orientation : fm, inv?.orientation ?? cfg.mode);
    setText(valveLabel, fm === 'idle' ? `${pair.a} · ${pair.b} (idle)` : `${pair.a} · ${pair.b}`);
    const cap = outdoorPortCapacity(cfg);
    setText(outLabel, cfg.outdoorKind === 'owner' ? 'Daikin 3MXM52N8' : 'Generic compatible outdoor');
    setText(outSub, cfg.outdoorKind === 'owner' ? `${OWNER_PORTS} ports · R32 · suffix unknown` : `${n} of ${cap} ports used · assumed${layout.outH > 235 ? ' larger' : ''} casing`);

    // gauges
    const conv = (v: number | null): string => (v === null ? '—' : s.ui.pressure === 'abs' ? `${fmt(v, 2)} bar(a)` : `${fmt(v - 1.01325, 2)} bar(g)`);
    const svcHigh = fm === 'heating';
    if (inv) {
      // Real static pressures, also at rest. LP is the accumulator, HP the compressor discharge when it exists, otherwise the physical
      // pressure group that is high in this orientation. The service port reads the first room's gas line, which can differ from LP.
      const cellBar = (id: string | undefined): number | null => (id === undefined ? null : inv.cells.find((c) => c.id === id)?.state.pBarAbs ?? null);
      const gasLine = cellBar(act[0] && `${act[0].id}:gas`);
      const hi = inv.compressorDischarge?.pBarAbs ?? (inv.orientation === 'heating' ? gasLine : cellBar('outdoor:0'));
      const lo = inv.cells.find((c) => c.group === 'accumulator')?.state.pBarAbs ?? null;
      gaugeHP?.set(hi, conv(hi));
      gaugeLP?.set(lo, conv(lo));
      gaugeSvc?.set(gasLine, conv(gasLine));
      setText(svcRole, 'SVC · gas');
    } else {
      const hi = rd.cycle?.pHighBarA ?? null;
      const lo = rd.cycle?.pLowBarA ?? null;
      gaugeHP?.set(hi, conv(hi));
      gaugeLP?.set(lo, conv(lo));
      const svcV = fm === 'idle' ? null : svcHigh ? hi : lo;
      gaugeSvc?.set(svcV, conv(svcV));
      setText(svcRole, fm === 'idle' ? 'SVC · idle' : `SVC · ${svcHigh ? 'HIGH' : 'LOW'}`);
    }

    // refrigerant probes, outdoor side. Only a real cycle produces numbers; everything else is a dash, never a zero.
    const cyc = live && rd.usable ? rd.engine?.cycle ?? null : null;
    const basis = live ? (held ? 'last calculated step' : 'live engine') : 'illustrative fixture value';
    const outPort = inv?.coilPorts.outdoor;
    const oc = inv && outPort
      ? inventoryCoilProbe(outPort, inv.coilHeatW.outdoor ?? null)
      : outdoorCoilProbe(fm, rd.cycle, outdoorHeatW(live, fm, cyc?.outdoorCoilHeatW, rd.qEvapKw, rd.qCondKw));
    // Inventory ends are static ports (GAS / SM) at rest and IN / OUT with actual face flow.
    const ocBasis = inv ? `${basis}, physical coil port` : basis;
    coilGasProbe?.update(oc.gas.role, oc.gas.tempC, src, held, `outdoor coil gas end · ${ocBasis}`);
    coilLiqProbe?.update(oc.liquid.role, oc.liquid.tempC, src, held, `outdoor coil small end · ${ocBasis}`);
    coilNote?.update(oc.deltaK, oc.heatW, src, 'line3-illustrative');
    // Compressor ports: with inventory, suction is the real port state at rest too; discharge exists only while the compressor runs.
    compDProbe?.update('D', rd.cycle?.dischargeC ?? (inv ? inv.compressorDischarge?.temperatureC ?? null : null), src, held, `compressor discharge · ${basis}`);
    compSProbe?.update('S', rd.cycle?.suctionC ?? (inv ? inv.compressorSuction?.temperatureC ?? null : null), src, held, `compressor suction · ${basis}`);

    // rooms
    const br = branchesFor(rd, act);
    act.forEach((r, i) => {
      const v = rooms[i];
      if (!v) return;
      const info = INDOOR_CLASSES[r.indoorClass];
      const eng = rd.engine?.rooms[i] ?? null;
      toggleClass(v.unit, 'generic', info.generic);
      const p = v.panel;
      // An index rebound to another room (after a removal) must not keep a stale focused value.
      const lineCtl = lineCtlFor(i);
      if (p.boundId !== r.id) {
        if (p.boundId !== '' && [p.equip, p.env, lineCtl.root].some((el) => el.contains(document.activeElement))) (document.activeElement as HTMLElement).blur();
        p.boundId = r.id;
      }
      lineCtl.sync(s, r, inv);
      setText(p.name, r.name);
      setAttr(v.g, 'aria-label', `Zoom to ${r.name} room`);
      toggleClass(p.remove, 'off', n <= 1);
      p.remove.disabled = n <= 1;
      setAttr(p.remove, 'aria-label', `Remove room ${r.name}`);
      setAttr(p.remove, 'title', n <= 1 ? 'At least one room is required' : `Remove ${r.name} and its refrigerant line set. Its inputs are kept for re-adding.`);
      // Measured air: live engine room temperature, or the configured example input; never the live value in Examples nor the reverse.
      setReading(p.air.v, live ? fmt(eng?.temperatureC, 1) : fmt(r.airC, 1));
      setText(p.air.n, live ? (eng ? `${Math.round(eng.relativeHumidity * 100)} % RH` : '—') : 'EXAMPLE input');
      // Target, floor area, ceiling height and envelope loss are editable; a focused field is never rewritten.
      for (const f of [p.sp, p.area, p.height, p.loss]) f.refresh();
      const targetLabel = `Requested target temperature for ${r.name} (°C)`;
      setAttr(p.sp.num, 'aria-label', targetLabel);
      setAttr(p.sp.range, 'aria-label', targetLabel);
      setAttr(p.sp.range, 'aria-valuetext', `${fmt(r.setpointC, 1)} °C`);
      // The volume is derived from the stored area and height on every update, so it follows both inputs as they are edited.
      const volume = roomVolumeM3(r);
      setText(p.volume, fmt(volume, volume >= 1000 ? 0 : 1));
      for (const [f, text] of [[p.area, `Floor area of ${r.name} (m²)`], [p.height, `Ceiling height of ${r.name} (m)`], [p.loss, `Envelope heat-loss coefficient of ${r.name} (W/K)`]] as const) {
        setAttr(f.num, 'aria-label', text);
        setAttr(f.range, 'aria-label', text);
      }
      setAttr(p.area.range, 'aria-valuetext', `${fmt(r.surfaceM2, 1)} m²`);
      setAttr(p.height.range, 'aria-valuetext', `${fmt(r.ceilingHeightM, 2)} m`);
      setAttr(p.loss.range, 'aria-valuetext', `${fmt(r.heatLossWPerK, 0)} W/K`);
      guide.button(i).setAttribute('aria-label', `Envelope heat-loss guide for ${r.name}`);
      setText(v.unitLabel, r.indoorClass.startsWith('FTXA') ? r.indoorClass : `${info.label.replace('Generic wall head ', 'Generic ').replace(' class', '')}`);
      // Each indoor fan follows its own reading; a closed branch neither spins nor blows.
      const fanOn = live ? (br[i]?.fanKw ?? 0) > 0 : rd.indoorFansOn;
      v.view.dataset.fan = fanOn ? '1' : '0';
      // Requested On/Off versus the actual backend branch. Live: off is shown as settled only once the branch has no
      // refrigerant flow and no fan power. Examples: fixed snapshot flow is not recalculated, so it is labelled requested.
      const branchOpen = live && rd.usable && ((rd.engine?.cycle?.branchMassFlowsKgs[i] ?? 0) > 0 || (br[i]?.fanKw ?? 0) > 0);
      const unitState = r.enabled ? 'on' : !live ? 'requested-off' : !rd.usable ? 'applying' : branchOpen ? 'closing' : 'off';
      v.view.dataset.unit = unitState;
      if (p.sw.checked !== r.enabled) p.sw.checked = r.enabled;
      setAttr(p.sw, 'aria-label', `${r.name} indoor unit`);
      setText(p.swText, ({ on: 'On', off: 'Off', closing: 'Off · closing', applying: 'Off · applying', 'requested-off': 'Off requested' })[unitState]);
      // Examples keep the fixed snapshot; an Off request is never recomputed into it.
      const exampleNote = r.enabled ? 'EXAMPLE' : 'EXAMPLE · Off not applied';
      const exampleTitle = !live && rd.usable && !r.enabled ? 'Fixed snapshot: branch flow and these numbers are not recalculated for the Off request.' : '';
      // Supplied air: numeric, or a labelled unavailable state (fan off, unit off, withheld). Never an invented zero.
      const o = br[i]?.outletC ?? null;
      // Supply-air streams run only while this unit's fan does (an Examples unit requested Off shows none). Their hue compares the
      // supplied air with the room air: warmer, cooler, or within 1 K. Never inferred from the mode alone.
      const roomC = live ? eng?.temperatureC ?? null : r.airC;
      const dT = rd.usable && o !== null && roomC !== null ? o - roomC : null;
      setAttr(v.view, 'data-air', !fanOn || (!live && !r.enabled) ? 'off' : dT === null || Math.abs(dT) < 1 ? 'neutral' : dT > 0 ? 'warm' : 'cool');
      if (rd.usable && o !== null) {
        setReading(p.sup.v, fmt(o, 1));
        setText(p.sup.n, live ? '' : exampleNote);
      } else {
        setReading(p.sup.v, '—');
        setText(p.sup.n, !rd.usable ? 'unavailable' : !fanOn ? (unitState === 'off' ? 'unit off' : 'fan off') : '');
      }
      // Branch heat: heating output and cooling removal are positive; defrost is signed (negative = extracted).
      const kw = !rd.usable ? null : live ? rd.branchKw?.[i] ?? null : br[i]?.roomKw ?? null;
      setText(p.heat.k, fm === 'defrost' ? 'Signed kW' : cfg.mode === 'cooling' ? 'Net cooling' : 'Net heating');
      if (kw === null) {
        setReading(p.heat.v, '—');
        setText(p.heat.n, rd.usable ? '' : 'unavailable');
      } else {
        setReading(p.heat.v, fmt(kw, 2));
        setText(p.heat.n, fm === 'defrost' ? 'negative = extracted' : live ? '' : exampleNote);
      }
      setAttr(p.sup.n, 'title', exampleTitle);
      setAttr(p.heat.n, 'title', exampleTitle);
      v.wash.setAttribute('fill', airColor(live ? eng?.temperatureC ?? null : r.airC));
      v.g.setAttribute('aria-label', `${r.name}, ${r.indoorClass}`);

      // Indoor refrigerant probes: actual branch states only while that branch circulates; Examples use the illustrative common cycle.
      let ip: CoilProbe;
      const port = inv?.coilPorts[r.id];
      if (inv && port) ip = inventoryCoilProbe(port, inv.coilHeatW[r.id] ?? null);
      else if (live) {
        const inl = cyc?.branchInlets[i];
        const outl = cyc?.branchOutlets[i];
        ip = indoorCoilProbeLive(fm, cyc && inl && outl
          ? { flowKgs: cyc.branchMassFlowsKgs[i] ?? 0, inletC: inl.temperatureC, outletC: outl.temperatureC, heatW: cyc.branchCoilHeatW[i] ?? 0 }
          : null);
      } else ip = indoorCoilProbeExample(fm, rd.cycle);
      v.gasProbe.update(ip.gas.role, ip.gas.tempC, src, held, `${r.name} indoor coil gas end · ${basis}`);
      v.liqProbe.update(ip.liquid.role, ip.liquid.tempC, src, held, `${r.name} indoor coil liquid end · ${basis}`);
      v.note.update(ip.deltaK, ip.heatW, src, 'line2-illustrative');
      let gasPressure: number | null = null, smallPressure: number | null = null;
      if (port) {
        gasPressure = port.gas.pBarAbs;
        smallPressure = port.small.pBarAbs;
      } else if (live && cyc && (cyc.branchMassFlowsKgs[i] ?? 0) > 0) {
        const inlet = cyc.branchInlets[i], outlet = cyc.branchOutlets[i];
        gasPressure = (fm === 'heating' ? inlet : outlet)?.pBarAbs ?? null;
        smallPressure = (fm === 'heating' ? outlet : inlet)?.pBarAbs ?? null;
      } else if (!live && fm !== 'idle' && r.enabled) {
        gasPressure = smallPressure = (fm === 'heating' ? rd.cycle?.pHighBarA : rd.cycle?.pLowBarA) ?? null;
      }
      v.gasGauge.set(gasPressure, conv(gasPressure));
      v.smallGauge.set(smallPressure, conv(smallPressure));
      setAttr(v.gasGauge.g, 'data-pressure-absolute', gasPressure ?? '');
      setAttr(v.smallGauge.g, 'data-pressure-absolute', smallPressure ?? '');
    });

    // coil fouling: configuration-driven in both experiences; independent of the ice layer
    const oc2 = outdoorCleanliness(cfg);
    setDirt(outDirt, oc2.pct, 'Outdoor coil', oc2.source);
    act.forEach((r, i) => {
      const d = inDirt[i];
      if (!d) return;
      const ic = indoorCleanliness(cfg, i);
      setDirt(d, ic.pct, `${r.name} indoor coil`, ic.source);
    });

    // rooms bar: count against the outdoor group's capacity (owner: fixed; generic: a scenario assumption)
    const full = n >= cap;
    setText(bar.count, `${n} of ${cap} ${cfg.outdoorKind === 'owner' ? 'ports' : 'assumed ports'}`);
    bar.add.disabled = full;
    setAttr(bar.add, 'title', full
      ? (cfg.outdoorKind === 'owner' ? `The 3MXM52N8 has ${OWNER_PORTS} ports. Choose Generic on the outdoor unit to explore more.` : 'Generic port capacity (an assumption) is reached. Raise it on the outdoor unit.')
      : 'Add an indoor unit and its room on the next free port');
    setText(bar.hint, full ? (cfg.outdoorKind === 'owner' ? `Owner unit full (${OWNER_PORTS} ports): choose Generic on the outdoor unit for more.` : 'Capacity reached: raise the assumed port capacity on the outdoor unit.') : '');

    // weather
    // The glyph is redrawn only when its category changes (sun / cloud / snow cloud), never per update.
    const t = cfg.outdoorC;
    const kind = t >= 16 ? 'sun' : t <= 2 ? 'snow' : 'cloud';
    if (kind !== weatherKind) {
      weatherKind = kind;
      weatherG.replaceChildren();
      if (kind === 'sun') weatherG.append(svg('circle', { cx: 46, cy: 52, r: 14, class: 'sun' }), ...Array.from({ length: 8 }, (_, k) => svg('path', { d: 'M0 -20V-26', class: 'sun-ray', transform: `translate(46 52) rotate(${k * 45})` })));
      else {
        weatherG.append(svg('path', { class: 'cloud', d: 'M30 62a10 10 0 0 1 4 -19a14 14 0 0 1 27 2a9 9 0 0 1 -1 17z' }));
        if (kind === 'snow') for (const [fx2, fy2] of [[36, 74], [48, 78], [60, 74]] as const) weatherG.append(snowflake(fx2, fy2, 3.2));
      }
    }
    // Weather: ambient inputs only (configured values, meaningful while the engine loads). Machine readings live on the outdoor-unit card.
    weather.t.refresh();
    weather.h.refresh();
    setText(weather.t.note, live ? 'live input' : 'configured');
    setText(weather.h.note, cfg.outdoorC < 0 ? 'over ice' : 'over liquid');
    const scope = weatherScope(s);
    setText(weather.status, scope.text);
    weather.status.title = scope.text;
    toggleClass(weather.status, 'diff', scope.diff);
    weather.match.hidden = live || scope.same;

    // Outdoor-unit card: controls and machine readouts.
    unitCard.sync(s, inv);

    // Exhaust air: the post-fan air temperature (engine outdoor.airOutletC / the fixture's outdoor outlet), withheld unless usable.
    // Never the ambient, coil metal or refrigerant temperature. The stream hue compares it with the outdoor air.
    const exhaustC = rd.usable ? rd.outdoorOutletC : null;
    const exD = exhaustC === null ? null : exhaustC - cfg.outdoorC;
    setAttr(exhaust, 'data-air', exD === null || Math.abs(exD) < 1 ? 'neutral' : exD > 0 ? 'warm' : 'cool');
    airProbe?.update(
      exhaustC,
      !rd.usable ? 'Exhaust · unavailable' : exhaustC === null ? 'Exhaust · fan off' : 'Exhaust air',
      src, held, live ? (held ? 'last calculated step' : 'live engine') : 'illustrative fixture value', oc.heatW);
    setText(ambientAir, `${fmt(cfg.outdoorC, 1)} °C`);

    // selection
    for (const el of root.querySelectorAll<SVGElement>('[data-id]')) {
      const on = el.dataset.id === s.ui.selected;
      toggleClass(el, 'is-selected', on);
      setAttr(el, 'aria-pressed', el.dataset.zoomTarget ? String(s.ui.zoom === el.dataset.zoomTarget) : String(on));
    }
  }

  function tick(s: AppState, clock: Clock): void {
    // Melting drips follow actual melt this frame (false when paused or exhausted); puddle follows retained liquid.
    // Live: ice, liquid film and melting come straight from the engine's film state; nothing is advanced or invented here.
    // While the current input is pending or rejected, the last accepted outdoor film inventory stays drawn and is labelled held;
    // it never authorizes cycle readings and never animates melting.
    const out = s.ui.experience === 'live' && liveStatus(s.cfg).usable ? simulation.status.output : null;
    const liveMode = s.ui.experience === 'live';
    const held = liveMode && !out ? simulation.inventory : null;
    const film = liveMode ? (out ? out.outdoor : held?.outdoor ?? null) : null;
    setAttr(root, 'data-melting', liveMode ? (out && out.outdoor.meltPowerW > 0 ? '1' : '0') : clock.melting ? '1' : '0');
    setAttr(root, 'data-ice', liveMode ? (out ? 'live' : held ? 'held' : 'none') : 'example');
    const showIce = liveMode ? film?.iceKg ?? 0 : clock.iceKg;
    const water = liveMode ? film?.liquidKg ?? 0 : clock.retainedWaterKg;
    const ph = layout.outH;
    if (Math.abs(water - lastWater) >= 0.0004) {
      lastWater = water;
      const wk = clamp(water / ICE_START_KG, 0, 1.5);
      puddle.style.opacity = water > 0.0004 ? String(clamp(0.35 + wk * 0.5, 0, 0.9)) : '0';
      setAttr(puddle, 'transform', `translate(36 ${ph + 1}) scale(${(0.25 + Math.min(wk, 1.2) * 0.75).toFixed(3)} ${(0.6 + Math.min(wk, 1.5) * 0.9).toFixed(3)}) translate(-36 ${-(ph + 1)})`);
    }
    if (Math.abs(showIce - lastIce) < 0.0004) return;
    lastIce = showIce;
    const k = clamp(showIce / ICE_FULL_KG, 0, 1);
    iceSlab.querySelector('.ice-slab')?.setAttribute('transform', `translate(6 0) scale(${(k * 1.15).toFixed(3)} 1)`);
    iceSlab.querySelector('.icicles')?.setAttribute('transform', `translate(6 227) scale(1 ${(0.25 + k * 1.1).toFixed(3)}) translate(0 -227)`);
    iceSlab.querySelector('.icicles')?.setAttribute('opacity', showIce > 0.004 ? '1' : '0');
    flakes.forEach((f, i) => setAttr(f, 'opacity', k > (i + 1) / 8 ? 0.95 : 0));
    setAttr(frostFill, 'opacity', (clamp(showIce / 0.5, 0, 1) * 0.6).toFixed(3));
  }

  function zoomTo(z: ZoomPreset, immediate = false): void {
    if (!presets[z]) z = 'overview';
    guide.close();
    root.dataset.zoom = z;
    const target = presets[z];
    cancelAnimationFrame(anim);
    const start = [...vb];
    fit(z, target);
    root.parentElement?.scrollTo?.({ top: 0 });
    if (immediate || reduceMotion()) {
      vb = [...target];
      root.setAttribute('viewBox', vb.join(' '));
      return;
    }
    const t0 = performance.now();
    const step = (now: number): void => {
      const f = clamp((now - t0) / 520, 0, 1);
      const e = f < 0.5 ? 4 * f * f * f : 1 - Math.pow(-2 * f + 2, 3) / 2;
      vb = start.map((v, i) => v + ((target[i] ?? v) - v) * e);
      root.setAttribute('viewBox', vb.map((v) => v.toFixed(2)).join(' '));
      if (f < 1) anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
  }

  window.addEventListener('resize', placeGuide);
  return { root, guideRoot: guide.root, sync, tick, zoomTo, roomAnchor: (i) => roomPanels[i]?.equip ?? null };
}
