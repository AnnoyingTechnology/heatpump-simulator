import { HUMIDITY_CONVENTION } from './chrome';
import { segKind, tempColor, valvePairs } from './circuit';
import { clamp, fmt, html, setAttr, setText, svg, toggleClass } from './dom';
import { branchesFor, readingFlowMode, segmentFor, simulation } from './runtime/view';
import {
  A, GROUND_Y, L, OUT, ROOM_X1, UNIT, VB_H, VB_W, WALL,
  pipeSpecs, riserG, roomBoxes, ygOf, ylOf,
} from './geometry';
import { Pipe } from './pipes';
import type { Clock } from './state';
import { ICE_FULL_KG, ICE_START_KG, activeRooms, currentReadings, indoorCleanliness, liveStatus, outdoorCleanliness, store } from './state';
import type { AppState, ZoomPreset } from './types';
import { INDOOR_CLASSES, OWNER_PORTS } from './types';

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

export interface Scene {
  root: SVGSVGElement;
  sync(s: AppState): void;
  tick(s: AppState, clock: Clock): void;
  zoomTo(z: ZoomPreset, immediate?: boolean): void;
}

const VIEWBOXES: Record<ZoomPreset, [number, number, number, number]> = {
  overview: [0, 0, VB_W, VB_H],
  outdoor: [4, 500, 346, 310],
  rooms: [434, 0, 666, 790],
};

const reduceMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Simulated time of a held inventory as m:ss (h:mm:ss from one hour). */
function heldClock(sec: number): string {
  const t = Math.max(0, Math.floor(sec));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const ss = String(t % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

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
    svg('linearGradient', { id: 'gPlumeWarm', x1: 0, y1: 0, x2: 0, y2: 1 }, stop(0, '#f0a06e', 0.5), stop(100, '#f0a06e', 0)),
    svg('linearGradient', { id: 'gPlumeCool', x1: 0, y1: 0, x2: 0, y2: 1 }, stop(0, '#78b4dc', 0.5), stop(100, '#78b4dc', 0)),
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

function arrowLines(cls: string, paths: string[]): G {
  return svg('g', { class: cls }, ...paths.map((d) => svg('path', { d })));
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
  constructor(cx: number, cy: number, tag: string, virtual: boolean) {
    this.needle = svg('line', { x1: 0, y1: 0, x2: 0, y2: -6, class: 'g-needle' });
    this.val = svg('text', { x: 10, y: 2.5, class: 'g-val dl' });
    this.g = svg('g', { class: `gauge${virtual ? ' virtual' : ''}`, transform: `translate(${cx} ${cy})` },
      svg('circle', { r: 8, class: 'g-face' }),
      svg('path', { d: 'M-5.6 4.4A7.2 7.2 0 1 1 5.6 4.4', class: 'g-arc' }),
      this.needle, svg('circle', { r: 1.3, class: 'g-hub' }), this.val,
      txt(10, -4.5, tag, 'g-tag dl'));
  }
  set(barA: number | null, text: string): void {
    setText(this.val, text);
    const a = barA === null ? -140 : -140 + clamp(barA / 32, 0, 1) * 280;
    setAttr(this.needle, 'transform', `rotate(${a.toFixed(1)})`);
    toggleClass(this.g, 'off', barA === null);
  }
}

/** Setpoint bounds and step shared with the Rooms sidebar slider. */
const SP_MIN = 16;
const SP_MAX = 30;
const SP_STEP = 0.5;

/** Corner readout panel of one room: built once, refreshed in place so focused controls survive engine updates. */
interface RoomPanel {
  root: HTMLDivElement;
  name: HTMLElement;
  vol: HTMLElement;
  airV: HTMLElement;
  airN: HTMLElement;
  spNum: HTMLInputElement;
  spRange: HTMLInputElement;
  /** Direct indoor-unit On/Off switch (configuration `enabled`). */
  sw: HTMLInputElement;
  swText: HTMLElement;
  supply: HTMLElement;
  power: HTMLElement;
  tag: HTMLElement;
}

/** Controls never reach the scene's selection or the window shortcuts. */
function isolate(...els: HTMLElement[]): void {
  for (const el of els) {
    for (const ev of ['click', 'dblclick', 'pointerdown', 'keydown', 'keyup'] as const) el.addEventListener(ev, (e) => e.stopPropagation());
  }
}

interface PairOpts { min: number; max: number; digits: number; get(): number | undefined; set(v: number): void }

/**
 * Native number + range pair bound to one configuration value. The number commits valid in-range values while typing
 * and clamps on change; sync (below) never rewrites a focused input.
 */
function bindPair(num: HTMLInputElement, range: HTMLInputElement, o: PairOpts): void {
  const round = (v: number): number => Math.round(v * 10 ** o.digits) / 10 ** o.digits;
  range.addEventListener('input', () => { const v = Number(range.value); if (Number.isFinite(v)) o.set(v); });
  num.addEventListener('input', () => {
    const v = Number(num.value);
    if (num.value !== '' && Number.isFinite(v) && v >= o.min && v <= o.max) o.set(round(v));
  });
  num.addEventListener('change', () => {
    const v = Number(num.value);
    if (num.value === '' || !Number.isFinite(v)) { num.value = (o.get() ?? o.min).toFixed(o.digits); return; }
    const c = round(clamp(v, o.min, o.max));
    num.value = c.toFixed(o.digits);
    o.set(c);
  });
  isolate(num, range);
}

function syncPair(num: HTMLInputElement, range: HTMLInputElement, v: number, digits: number): void {
  const t = v.toFixed(digits);
  if (document.activeElement !== num && num.value !== t) num.value = t;
  if (document.activeElement !== range && Number(range.value) !== v) range.value = String(v);
}

interface RoomView {
  g: G;
  /** Inner `.room` group; carries the per-room fan state read by the stylesheet. */
  view: G;
  unit: G;
  panel: RoomPanel;
  unitLabel: SVGTextElement;
  airWarm: G;
  plume: SVGEllipseElement;
  fan: G;
}

/** Room corner panel box, right-aligned inside the 614-wide room card; clear of the unit, plume, air paths and dimension text. */
const RP = { x: 816, w: 268, h: 112 } as const;

/**
 * Outdoor corner card box. The weather glyph sits in its left 64 px; the editable controls and readouts fill the rest.
 * Clear of the OUTDOOR title (y 26), the branch risers (x ≥ 345) and every equipment label (y ≥ 520).
 */
const OP = { x: 16, y: 38, w: 322, h: 194 } as const;
/** Outdoor-air bounds and steps, identical to the pinned sidebar sliders. */
const OT = { min: -20, max: 40, step: 0.5 } as const;
const OH = { min: 10, max: 100, step: 1 } as const;

interface OutdoorPanel {
  root: HTMLDivElement;
  tNum: HTMLInputElement;
  tRange: HTMLInputElement;
  tN: HTMLElement;
  hNum: HTMLInputElement;
  hRange: HTMLInputElement;
  hN: HTMLElement;
  outV: HTMLElement;
  outN: HTMLElement;
  iceV: HTMLElement;
  iceN: HTMLElement;
}

/** Built once per scene (not per rebuild) so a focused control and its value survive layout rebuilds. */
function outdoorPanel(): OutdoorPanel {
  const tN = html('span', { class: 'rp-n' });
  const hN = html('span', { class: 'rp-n' });
  const outV = html('span', { class: 'rp-v' });
  const outN = html('span', { class: 'rp-n' });
  const iceV = html('span', { class: 'rp-v' });
  const iceN = html('span', { class: 'rp-n' });
  const pair = (label: string, b: { min: number; max: number; step: number }): { num: HTMLInputElement; range: HTMLInputElement } => ({
    num: html('input', { type: 'number', class: 'rp-num rp-ctl', min: b.min, max: b.max, step: b.step, inputmode: 'decimal', 'aria-label': label }),
    range: html('input', { type: 'range', class: 'rp-range rp-ctl', min: b.min, max: b.max, step: b.step, 'aria-label': label }),
  });
  const t = pair('Outdoor temperature (°C)', OT);
  const h = pair('Outdoor relative humidity (% RH)', OH);
  h.num.title = HUMIDITY_CONVENTION;
  h.range.title = HUMIDITY_CONVENTION;
  bindPair(t.num, t.range, {
    min: OT.min, max: OT.max, digits: 1, get: () => store.state.cfg.outdoorC,
    set: (v) => store.update((s) => { s.cfg.outdoorC = v; }),
  });
  bindPair(h.num, h.range, {
    min: OH.min, max: OH.max, digits: 0, get: () => store.state.cfg.outdoorRh,
    set: (v) => store.update((s) => { s.cfg.outdoorRh = v; }),
  });
  const ctl = (k: string, p: { num: HTMLInputElement; range: HTMLInputElement }, unit: string, note: HTMLElement): HTMLElement =>
    html('div', { class: 'op-ctl' },
      html('div', { class: 'op-ctl-head' }, html('span', { class: 'rp-k' }, k), note),
      html('span', { class: 'rp-line' }, p.num, html('small', {}, unit)),
      p.range);
  const cell = (k: string, v: HTMLElement, unit: string, n: HTMLElement): HTMLElement =>
    html('div', { class: 'rp-cell' }, html('span', { class: 'rp-k' }, k), html('span', { class: 'rp-line' }, v, html('small', {}, unit)), n);
  const hCtl = ctl('Humidity', h, '% RH', hN);
  hCtl.title = HUMIDITY_CONVENTION;
  const root = html('div', { class: 'rp op' },
    html('div', { class: 'op-top' }, html('div', { class: 'op-glyph' }), html('div', { class: 'op-ctls' }, ctl('Temperature', t, '°C', tN), hCtl)),
    html('div', { class: 'rp-grid op-bottom' }, cell('Fan air out', outV, '°C', outN), cell('Coil ice', iceV, 'kg', iceN)));
  return { root, tNum: t.num, tRange: t.range, tN, hNum: h.num, hRange: h.range, hN, outV, outN, iceV, iceN };
}

/** Native HTML in a click-through foreignObject; only elements marked `.rp-ctl` take pointer events. */
function overlayPanel(x: number, y: number, w: number, h: number, el: HTMLElement): SVGForeignObjectElement {
  return svg('foreignObject', { class: 'panel-fo', x, y, width: w, height: h }, el);
}

function roomPanel(i: number): RoomPanel {
  const name = html('span', { class: 'rp-name' });
  const vol = html('span', { class: 'rp-vol' });
  const airV = html('span', { class: 'rp-v' });
  const airN = html('span', { class: 'rp-n' });
  const spNum = html('input', { type: 'number', class: 'rp-num rp-ctl', min: SP_MIN, max: SP_MAX, step: SP_STEP, inputmode: 'decimal' });
  const spRange = html('input', { type: 'range', class: 'rp-range rp-ctl', min: SP_MIN, max: SP_MAX, step: SP_STEP });
  const supply = html('span', { class: 'rp-supply' });
  const power = html('span', { class: 'rp-power' });
  const tag = html('span', { class: 'rp-tag' });
  bindPair(spNum, spRange, {
    min: SP_MIN, max: SP_MAX, digits: 1, get: () => store.state.cfg.rooms[i]?.setpointC,
    set: (v) => store.update((s) => { const x = s.cfg.rooms[i]; if (x) x.setpointC = v; }),
  });
  // Direct indoor-unit On/Off: edits the requested `enabled` configuration only; setpoint stays editable when off.
  const sw = html('input', { type: 'checkbox', role: 'switch', class: 'toggle rp-ctl' });
  const swText = html('span', { class: 'rp-sw-t' });
  const swLabel = html('label', { class: 'rp-sw rp-ctl' }, sw, swText);
  sw.addEventListener('change', () => store.update((s) => { const x = s.cfg.rooms[i]; if (x) x.enabled = sw.checked; }));
  isolate(sw, swLabel);
  const root = html('div', { class: 'rp' },
    html('div', { class: 'rp-head' }, name, vol, swLabel),
    html('div', { class: 'rp-grid' },
      html('div', { class: 'rp-cell' }, html('span', { class: 'rp-k' }, 'Air'), html('span', { class: 'rp-line' }, airV, html('small', {}, '°C')), airN),
      html('div', { class: 'rp-cell' }, html('span', { class: 'rp-k' }, 'Setpoint'), html('span', { class: 'rp-line' }, spNum, html('small', {}, '°C')),
        html('span', { class: 'rp-n' }, 'requested'))),
    spRange,
    html('div', { class: 'rp-foot' }, html('span', { class: 'rp-k' }, 'Supply'), supply, power, tag));
  return { root, name, vol, airV, airN, spNum, spRange, sw, swText, supply, power, tag };
}

export function createScene(): Scene {
  const root = svg('svg', {
    class: 'scene', viewBox: `0 0 ${VB_W} ${VB_H}`, preserveAspectRatio: 'xMidYMid meet', role: 'group',
    'aria-label': 'Simulator workbench: outdoor zone with the outdoor unit at left, indoor zone with one card per room at right',
  });
  root.dataset.zoom = 'overview';

  let built = { n: -1, kind: '' };
  let pipes = new Map<string, Pipe>();
  let rooms: RoomView[] = [];
  let outLabel: SVGTextElement = txt(0, 0, '');
  let outSub: SVGTextElement = txt(0, 0, '');
  let valveLabel: SVGTextElement = txt(0, 0, '');
  let svcRole: SVGTextElement = txt(0, 0, '');
  const outPanel: OutdoorPanel = outdoorPanel();
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
  let lastIce = -1;
  let lastWater = -1;
  let vb = [...VIEWBOXES.overview] as number[];
  let anim = 0;

  function rebuild(n: number, kind: 'owner' | 'generic'): void {
    root.replaceChildren(defs());
    pipes = new Map();
    rooms = [];
    inDirt = [];
    const boxes = roomBoxes(n);
    const owner = kind === 'owner';

    // ---- zones: flat OUTDOOR and INDOOR fields with a plain boundary strip between them ----
    root.append(
      svg('rect', { class: 'zone-out', x: 0, y: 0, width: WALL.x0, height: VB_H }),
      svg('rect', { class: 'zone-in', x: WALL.x1, y: 0, width: VB_W - WALL.x1, height: VB_H }),
      svg('rect', { class: 'zone-edge', x: WALL.x0, y: 0, width: WALL.x1 - WALL.x0, height: VB_H }),
      svg('path', { class: 'zone-base', d: `M14 ${GROUND_Y}H${WALL.x0 - 14}` }),
      svg('rect', { class: 'zone-card', x: OP.x, y: OP.y, width: OP.w, height: OP.h, rx: 10 }),
    );
    weatherG = svg('g', { class: 'weather', transform: 'translate(0 40)' });
    weatherKind = '';
    root.append(
      weatherG, overlayPanel(OP.x, OP.y, OP.w, OP.h, outPanel.root),
      txt(16, 26, 'OUTDOOR', 'zone-title'), txt(WALL.x1 + 14, 26, 'INDOOR', 'zone-title'));

    // ---- rooms ----
    for (const b of boxes) {
      const i = b.i;
      const view = svg('g', { class: 'room', 'data-room': i });
      const bg = svg('rect', { class: 'room-bg', x: WALL.x1 + 8, y: b.top + 5, width: ROOM_X1 - WALL.x1 - 16, height: b.h - 10, rx: 10 });
      const wash = svg('rect', { class: 'room-wash', x: WALL.x1 + 8, y: b.top + 5, width: ROOM_X1 - WALL.x1 - 16, height: b.h - 10, rx: 10 });
      const panel = roomPanel(i);
      const unitX = b.unitX;
      const unitY = b.unitY;
      const plume = svg('ellipse', { cx: unitX + 190, cy: unitY + UNIT.h + 38, rx: 70, ry: 40, class: 'plume' });
      const air = arrowLines('air', [
        `M${unitX + 150} ${unitY + UNIT.h + 2}C${unitX + 160} ${unitY + UNIT.h + 36} ${unitX + 205} ${unitY + UNIT.h + 52} ${unitX + 300} ${unitY + UNIT.h + 52}`,
        `M${unitX + 180} ${unitY + UNIT.h + 2}C${unitX + 190} ${unitY + UNIT.h + 30} ${unitX + 225} ${unitY + UNIT.h + 40} ${unitX + 310} ${unitY + UNIT.h + 36}`,
        `M${unitX + 210} ${unitY + UNIT.h + 2}C${unitX + 220} ${unitY + UNIT.h + 22} ${unitX + 250} ${unitY + UNIT.h + 28} ${unitX + 320} ${unitY + UNIT.h + 22}`,
      ]);
      const supply = txt(unitX + 150, unitY + UNIT.h + Math.min(66, b.bottom - unitY - UNIT.h - 12), '', 'supply');

      // indoor unit (casing only; coil tubes are pipes drawn later)
      const unit = svg('g', { class: `unit${INDOOR_CLASSES[activeClass(i)].generic ? ' generic' : ''}`, transform: `translate(${unitX} ${unitY})` });
      // Wall heads use a tangential blower: a quiet static horizontal outlet slot with louvre slats, no round wheel.
      const fan = svg('g', { class: 'in-fan', transform: 'translate(216 58)' },
        svg('rect', { x: -20, y: -13, width: 40, height: 26, rx: 5, class: 'fan-well' }),
        svg('path', { d: 'M-15 -6H15M-15 0H15M-15 6H15', class: 'slat' }));
      const label = txt(18, UNIT.h - 8, '', 'unit-label dl-ok');
      const dirt = dirtLayer(66, 20, 134, 50);
      inDirt.push(dirt);
      unit.append(
        svg('rect', { class: 'unit-shell', x: 0, y: 0, width: UNIT.w, height: UNIT.h, rx: 14 }),
        svg('rect', { x: 8, y: 6, width: UNIT.w - 16, height: 11, rx: 5, fill: 'url(#pGrille)', opacity: 0.8 }),
        svg('rect', { class: 'coil-bay', x: 66, y: 20, width: 134, height: 50, rx: 4 }),
        svg('path', { d: 'M66 20L200 70M200 20L66 70', class: 'fin-hint' }),
        dirt,
        fan, label,
        svg('path', { d: `M120 ${UNIT.h - 2}H${UNIT.w - 14}`, class: 'louvre' }),
        svg('path', { d: `M126 ${UNIT.h - 2}L${UNIT.w - 22} ${UNIT.h + 7}`, class: 'louvre-flap' }));
      view.append(bg, wash, plume, air, unit);
      const wrapper = sel(`indoor:${i}`, `Indoor unit ${i + 1}`, { x: WALL.x1 + 1, y: b.top + 1, w: ROOM_X1 - WALL.x1 - 2, h: b.h - 2, r: 2 }, view);
      // Corner panel: a sibling of the selectable group (no nested interactive content), above it, click-through except its controls.
      root.append(wrapper, svg('g', { class: 'room-panel' }, overlayPanel(RP.x, b.top + 10, RP.w, RP.h, panel.root)));
      rooms.push({ g: wrapper, view, unit, panel, unitLabel: label, airWarm: air, plume, fan });
    }

    // ---- boundary pass-throughs ----
    for (const b of boxes) {
      root.append(
        svg('rect', { class: 'sleeve', x: WALL.x0 - 2, y: b.gasY - 3.5, width: WALL.x1 - WALL.x0 + 4, height: 7, rx: 2 }),
        svg('rect', { class: 'sleeve', x: WALL.x0 - 2, y: b.liqY - 3.5, width: WALL.x1 - WALL.x0 + 4, height: 7, rx: 2 }));
    }

    // ---- outdoor unit ----
    const og = svg('g', { class: 'outdoor', transform: `translate(${OUT.x} ${OUT.y})` });
    const w = OUT.w;
    const h = OUT.h;
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

    // outdoor air arrows
    og.append(
      arrowLines('air out-in', ['M-34 60H-4', 'M-34 110H-4', 'M-34 160H-4']),
      arrowLines('air out-out', ['M96 6C110 -12 140 -16 170 -4', 'M120 3C136 -9 160 -10 184 -2']),
    );

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
    const [bx, by] = L(272, 181);
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
    const [qx, qy] = L(190, 222); // on the common liquid feeder (78,222)→(268,222), upstream of all five branches
    root.append(sel('liqstop', 'Common liquid stop valve, static and fully open', { x: qx - 9, y: qy - 9, w: 18, h: 18, r: 4 },
      svg('g', { transform: `translate(${qx} ${qy})` }, stopValve('LIQ STOP', true))));
    gaugeSvc = new Gauge(sx, sy - 44, 'physical SVC', false);
    const [hx, hy] = L(150, 136);
    const [lx, ly] = L(158, 198);
    gaugeHP = new Gauge(hx, hy + 20, 'virtual HP tap', true);
    gaugeLP = new Gauge(lx, ly + 13, 'virtual LP tap', true);
    root.append(
      svg('g', { class: 'taps' },
        svg('path', { d: `M${hx} ${hy}V${hy + 12}`, class: 'tap-stub' }), svg('circle', { cx: hx, cy: hy, r: 2.2, class: 'node virtual' }),
        svg('path', { d: `M${lx} ${ly}V${ly + 5}`, class: 'tap-stub' }), svg('circle', { cx: lx, cy: ly, r: 2.2, class: 'node virtual' }),
        svg('path', { d: `M${sx} ${sy - 21}V${sy - 36}`, class: 'tap-stub' }),
        gaugeHP.g, gaugeLP.g, gaugeSvc.g));

    // branch pipe hit regions (selectable)
    for (let i = 0; i < n; i++) {
      const b = boxes[i];
      if (!b) continue;
      const gx = riserG(i);
      root.append(sel(`pipe:${i}`, `Refrigerant branch ${i + 1} line set`, { x: gx - 8, y: b.gasY - 8, w: 30, h: b.liqY - b.gasY + 16, r: 4 }));
    }

    built = { n, kind };
    lastIce = -1;
    lastWater = -1;
  }

  const activeClass = (i: number) => (_state?.cfg.rooms[i]?.indoorClass ?? 'FTXA25');
  let _state: AppState | null = null;

  function sync(s: AppState): void {
    _state = s;
    const cfg = s.cfg;
    if (built.n !== cfg.unitCount || built.kind !== cfg.outdoorKind) rebuild(cfg.unitCount, cfg.outdoorKind);
    const live = s.ui.experience === 'live';
    const rd = currentReadings(s);
    const fm = readingFlowMode(rd);
    root.dataset.source = s.ui.experience;
    root.dataset.fm = fm;
    root.dataset.mode = cfg.mode;
    root.dataset.labels = s.ui.showLabels ? 'on' : 'off';
    root.dataset.taps = s.ui.showTaps ? 'on' : 'off';
    root.dataset.kind = cfg.outdoorKind;
    toggleClass(root, 'paused', s.ui.paused);
    root.style.setProperty('--flow-dur', `${(1.3 / s.ui.speed).toFixed(3)}s`);
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
    const pair = valvePairs(fm, cfg.mode);
    setText(valveLabel, fm === 'idle' ? `${pair.a} · ${pair.b} (idle)` : `${pair.a} · ${pair.b}`);
    setText(outLabel, cfg.outdoorKind === 'owner' ? 'Daikin 3MXM52N8' : 'Generic compatible outdoor');
    setText(outSub, cfg.outdoorKind === 'owner' ? `${OWNER_PORTS} ports · R32 · suffix unknown` : `${cfg.unitCount} ports · illustrative casing`);

    // gauges
    const hi = rd.cycle?.pHighBarA ?? null;
    const lo = rd.cycle?.pLowBarA ?? null;
    const conv = (v: number | null): string => (v === null ? '—' : s.ui.pressure === 'abs' ? `${fmt(v, 2)} bar(a)` : `${fmt(v - 1.01325, 2)} bar(g)`);
    gaugeHP?.set(hi, conv(hi));
    gaugeLP?.set(lo, conv(lo));
    const svcHigh = fm === 'heating';
    const svcV = fm === 'idle' ? null : svcHigh ? hi : lo;
    gaugeSvc?.set(svcV, conv(svcV));
    setText(svcRole, fm === 'idle' ? 'SVC · idle' : `SVC · ${svcHigh ? 'HIGH' : 'LOW'}`);

    // rooms
    const act = activeRooms(cfg);
    const br = branchesFor(rd, act);
    act.forEach((r, i) => {
      const v = rooms[i];
      if (!v) return;
      const info = INDOOR_CLASSES[r.indoorClass];
      const eng = rd.engine?.rooms[i] ?? null;
      toggleClass(v.unit, 'generic', info.generic);
      const p = v.panel;
      setText(p.name, r.name);
      setText(p.vol, `${r.volumeM3} m³`);
      // Air: live engine room temperature, or the configured example input; never the live value in Examples nor the reverse.
      setText(p.airV, live ? fmt(eng?.temperatureC, 1) : fmt(r.airC, 1));
      setText(p.airN, live ? (eng ? `${Math.round(eng.relativeHumidity * 100)} % RH` : '—') : 'EXAMPLE input');
      const spLabel = `Setpoint for ${r.name} (°C)`;
      setAttr(p.spNum, 'aria-label', spLabel);
      setAttr(p.spRange, 'aria-label', spLabel);
      setAttr(p.spRange, 'aria-valuetext', `${fmt(r.setpointC, 1)} °C`);
      // The focused number field is never rewritten; the range mirrors external edits (its own drags already match).
      syncPair(p.spNum, p.spRange, r.setpointC, 1);
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
      const o = br[i]?.outletC ?? null;
      // Branch heat from branchesFor: heating output and cooling removal are positive; defrost is signed (negative = extracted).
      const kw = !rd.usable ? null : live ? rd.branchKw?.[i] ?? null : br[i]?.roomKw ?? null;
      const kwWord = fm === 'defrost' ? 'signed heat' : cfg.mode === 'cooling' ? 'cooling' : 'heating';
      setText(p.supply, !rd.usable || o === null ? (rd.usable && !fanOn ? (unitState === 'off' ? '— (unit off)' : '— (fan off)') : '—') : `${fmt(o, 1)} °C`);
      setText(p.power, kw === null ? '' : `${fmt(kw, 2)} kW ${kwWord}`);
      setText(p.tag, rd.usable && !live ? 'EXAMPLE' : '');
      setAttr(p.tag, 'title', rd.usable && !live && !r.enabled ? 'Fixed snapshot: branch flow and these numbers are not recalculated for the Off request.' : '');
      v.g.querySelector('.room-wash')?.setAttribute('fill', tempColor(live ? eng?.temperatureC ?? null : r.airC));
      v.g.setAttribute('aria-label', `${r.name}, ${r.indoorClass}`);
    });

    // coil fouling: configuration-driven in both experiences; independent of the ice layer
    const oc = outdoorCleanliness(cfg);
    setDirt(outDirt, oc.pct, 'Outdoor coil', oc.source);
    act.forEach((r, i) => {
      const d = inDirt[i];
      if (!d) return;
      const ic = indoorCleanliness(cfg, i);
      setDirt(d, ic.pct, `${r.name} indoor coil`, ic.source);
    });

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
    // Outdoor corner card: the editable temperature and humidity mirror the pinned sidebar both ways (configured inputs,
    // meaningful while the engine loads); the fan outlet is withheld unless usable.
    const op = outPanel;
    syncPair(op.tNum, op.tRange, cfg.outdoorC, 1);
    syncPair(op.hNum, op.hRange, cfg.outdoorRh, 0);
    setText(op.tN, live ? 'drives live model' : 'configured');
    setText(op.hN, cfg.outdoorC < 0 ? 'over ice' : 'over liquid');
    setText(op.outV, fmt(rd.outdoorOutletC, 1));
    setText(op.outN, !rd.usable ? 'unavailable' : live ? (rd.outdoorOutletC === null ? 'fan off' : 'live') : 'EXAMPLE');

    // selection
    for (const el of root.querySelectorAll<SVGElement>('[data-id]')) {
      const on = el.dataset.id === s.ui.selected;
      toggleClass(el, 'is-selected', on);
      setAttr(el, 'aria-pressed', on ? 'true' : 'false');
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
    setText(outPanel.iceV, liveMode && !film ? '—' : fmt(showIce, 3));
    setText(outPanel.iceN, liveMode
      ? (out ? 'live film state' : held ? `held · t ${heldClock(held.simulatedSeconds)}` : 'unavailable')
      : 'example clock');
    toggleClass(outPanel.iceN, 'held', !!held);
    if (Math.abs(water - lastWater) >= 0.0004) {
      lastWater = water;
      const wk = clamp(water / ICE_START_KG, 0, 1.5);
      puddle.style.opacity = water > 0.0004 ? String(clamp(0.35 + wk * 0.5, 0, 0.9)) : '0';
      setAttr(puddle, 'transform', `translate(36 ${OUT.h + 1}) scale(${(0.25 + Math.min(wk, 1.2) * 0.75).toFixed(3)} ${(0.6 + Math.min(wk, 1.5) * 0.9).toFixed(3)}) translate(-36 ${-(OUT.h + 1)})`);
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
    root.dataset.zoom = z;
    const target = VIEWBOXES[z];
    cancelAnimationFrame(anim);
    const start = [...vb];
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

  return { root, sync, tick, zoomTo };
}
