import type { Pt, PipeSpec } from './pipes';
import { INDOOR_CASE_MM, OUTDOOR_CASE_MM } from './types';

/**
 * Scene geometry as a function of the active room count n. One physical illustration scale for BOTH casings: 0.32 px per mm.
 * Tube routing is schematic. Up to five rooms the scene is exactly 800 high and the rooms share it; beyond five every room keeps the
 * five-room height and the scene grows (the stage scrolls vertically). The generic outdoor casing grows only below the owner
 * envelope, to hold more ports: an explicit assumption, not a published dimension.
 */
export const MM_PX = 0.32;
export const BASE_H = 800;

export const OUT = { x: 100, y: 538, w: Math.round(OUTDOOR_CASE_MM.w * MM_PX) } as const;
const OUT_BASE_H = Math.round(OUTDOOR_CASE_MM.h * MM_PX);
export const UNIT = { w: Math.round(INDOOR_CASE_MM.w * MM_PX), h: Math.round(INDOOR_CASE_MM.h * MM_PX), dx: 16, dy: 14 } as const;

export const STACK_TOP = 36;
const STACK_FIVE = 738;
const RISER_PITCH = 14;
/** Indoor zone width, constant for every n; the whole scene widens instead when the riser corridor grows. */
export const ZONE_W = 1030;
/** Horizontal budget of one room row, from the wall: pipe corridor with probes, unit, equipment block, environment block. */
export const ROOM_COLS = { corridor: 104, equip: { dx: 369, w: 322 }, env: { dx: 699, w: 323 } } as const;

/** Local (outdoor casing) → scene coordinates. */
export const L = (x: number, y: number): Pt => [OUT.x + x, OUT.y + y];

export const ygOf = (i: number): number => 116 + 22 * i;
export const ylOf = (i: number): number => ygOf(i) + 9;

/** Common liquid feeder row (local). 222 up to five ports; lower for more so every EEV stub stays above it. */
export const feederY = (n: number): number => Math.max(222, ylOf(Math.max(n, 1) - 1) + 9);
/** Casing height (local). The 734 mm catalogue envelope up to five ports, taller only for the assumed larger generic group. */
export const outdoorHeight = (n: number): number => Math.max(OUT_BASE_H, feederY(n) + 13);

export interface Layout {
  n: number;
  vbW: number;
  vbH: number;
  wall: { x0: number; x1: number };
  outH: number;
  feeder: number;
  groundY: number;
  roomH: number;
  stackBottom: number;
  /** True when the scene is taller than the base 800 and the stage must scroll. */
  tall: boolean;
}

export function layoutFor(n: number): Layout {
  const rooms = Math.max(1, n);
  const slots = Math.max(rooms, 5);
  const x0 = OUT.x + OUT.w + 13 + RISER_PITCH * (slots - 1) + 7 + 27;
  const x1 = x0 + 30;
  const roomH = rooms <= 5 ? STACK_FIVE / rooms : STACK_FIVE / 5;
  const stackBottom = STACK_TOP + roomH * rooms;
  const outH = outdoorHeight(rooms);
  const groundY = OUT.y + outH + 3;
  const vbH = Math.ceil(Math.max(BASE_H, stackBottom + 26, groundY + 24));
  return { n: rooms, vbW: x1 + ZONE_W, vbH, wall: { x0, x1 }, outH, feeder: feederY(rooms), groundY, roomH, stackBottom, tall: vbH > BASE_H };
}

export interface RoomBox {
  i: number;
  top: number;
  bottom: number;
  h: number;
  /** Left edge of the indoor zone. */
  x0: number;
  unitX: number;
  unitY: number;
  gasY: number;
  liqY: number;
  /** Riser x of the gas and liquid line, in the corridor between the outdoor casing and the wall. */
  gx: number;
  lx: number;
}

/**
 * Riser slots. A room whose line pair ends above its outdoor port band routes up; its risers step right with i, gas left of liquid.
 * A room below the band routes down; its risers step left with i, liquid left of gas. Either way no pair crosses another, and
 * the two groups occupy disjoint vertical ranges, so any n stays connected without crossings.
 */
export function roomBoxes(n: number): RoomBox[] {
  const lay = layoutFor(n);
  const riser0 = OUT.x + OUT.w + 13;
  const boxes: RoomBox[] = Array.from({ length: lay.n }, (_, i) => {
    const top = STACK_TOP + i * lay.roomH;
    const unitX = lay.wall.x1 + ROOM_COLS.corridor;
    const unitY = top + UNIT.dy;
    return { i, top, bottom: top + lay.roomH, h: lay.roomH, x0: lay.wall.x1, unitX, unitY, gasY: unitY + 26, liqY: unitY + 62, gx: 0, lx: 0 };
  });
  const above = boxes.map((b) => b.gasY + 18 < OUT.y + ygOf(b.i) + 4.5);
  const upCount = above.filter(Boolean).length;
  boxes.forEach((b, i) => {
    const slot = above[i] ? i : upCount + (lay.n - 1 - i);
    const base = riser0 + RISER_PITCH * slot;
    if (above[i]) { b.gx = base; b.lx = base + 7; } else { b.lx = base; b.gx = base + 7; }
  });
  return boxes;
}

/** Fixed local anchor points inside the outdoor casing. */
export const A = {
  compD: [114, 150], compS: [132, 198], accIn: [225, 142], accOut: [212, 198],
  valveO: [176, 106], valveI: [236, 106], valveD: [190, 122], valveS: [224, 122],
  coilGas: [60, 22], coilLiq: [60, 198], svc: [250, 106], fan: [124, 58],
} as const satisfies Record<string, Pt>;

const COIL_ROWS = 12;
const COIL_Y0 = 22;

function outdoorCoilVerts(): Pt[] {
  const v: Pt[] = [];
  for (let k = 0; k < COIL_ROWS; k++) {
    const y = COIL_Y0 + 16 * k;
    const even = k % 2 === 0;
    v.push([even ? 60 : 18, y], [even ? 18 : 60, y]);
  }
  return v;
}

const INDOOR_V: Pt[] = [[74, 26], [190, 26], [190, 38], [74, 38], [74, 50], [190, 50], [190, 62], [74, 62]];

/**
 * Probe anchors. Outdoor values are local to the casing (the pills of the coil sit in the free margin left of it, clear of the
 * ice slab and flakes; the compressor pills sit in the free pockets under the fan and right of the compressor). Indoor values are
 * offsets from a room box: gas pill above the gas pipe, liquid pill below the liquid pipe, both just before the unit.
 */
export const PROBE_AT = {
  coilGas: { at: [-94, 15] as Pt, lead: [-24, 22] as Pt, clamp: [18, 22] as Pt },
  coilLiq: { at: [-94, 191] as Pt, lead: [-24, 198] as Pt, clamp: [18, 198] as Pt },
  coilNote: [-22, 38] as Pt,
  compD: { at: [102, 111] as Pt, lead: [126, 125] as Pt, clamp: [126, 136] as Pt },
  compS: { at: [138, 171] as Pt, lead: [176, 185] as Pt, clamp: [176, 198] as Pt },
} as const;

export function indoorProbeAt(b: RoomBox): {
  gas: { at: Pt; lead: Pt; clamp: Pt }; liq: { at: Pt; lead: Pt; clamp: Pt }; note: Pt;
} {
  const px = b.unitX - 76;
  const cx = px + 35;
  return {
    gas: { at: [px, b.gasY - 22], lead: [cx, b.gasY - 8], clamp: [cx, b.gasY] },
    liq: { at: [px, b.liqY + 8], lead: [cx, b.liqY + 8], clamp: [cx, b.liqY] },
    note: [px - 8, b.gasY + 14],
  };
}

export function pipeSpecs(n: number): PipeSpec[] {
  const lay = layoutFor(n);
  const l = (pts: Pt[]): Pt[] => pts.map((p) => L(p[0], p[1]));
  const specs: PipeSpec[] = [];
  const add = (s: PipeSpec): void => { specs.push(s); };
  const cv = outdoorCoilVerts();
  const last = ygOf(lay.n - 1);
  const feeder = lay.feeder;

  add({ id: 'disc', cls: 'gas', title: 'Compressor discharge D → reverser D', pts: l([A.compD, [114, 136], [190, 136], A.valveD]) });
  add({ id: 'sAcc', cls: 'gas', title: 'Reverser S → accumulator', pts: l([A.valveS, A.accIn]) });
  add({ id: 'accOut', cls: 'gas', title: 'Accumulator → compressor suction S', pts: l([A.accOut, A.compS]) });
  add({ id: 'revO', cls: 'gas', title: 'Reverser O ↔ outdoor-coil gas header', pts: l([A.valveO, [72, 106], [72, 22], A.coilGas]) });
  add({ id: 'revI', cls: 'gas', title: 'Reverser I ↔ common gas node', pts: l([A.valveI, A.svc]) });
  add({ id: 'gasMan', cls: 'gas', title: 'Common gas manifold', pts: l([A.svc, [250, last]]) });
  add({ id: 'coilG', cls: 'coil', title: 'Outdoor coil · gas end', pts: l(cv.slice(0, 6)) });
  add({ id: 'coilM', cls: 'coil', title: 'Outdoor coil · middle passes', pts: l(cv.slice(5, 18)) });
  add({ id: 'coilL', cls: 'coil', title: 'Outdoor coil · liquid end', pts: l(cv.slice(17, 24)) });
  add({ id: 'liqHdr', cls: 'liq', title: 'Outdoor liquid header', pts: l([A.coilLiq, [78, 198], [78, feeder], [268, feeder], [268, ylOf(0)]]) });
  add({ id: 'vDO', cls: 'gas', title: 'Reverser internal link D–O', pts: l([A.valveD, [190, 106], A.valveO]) });
  add({ id: 'vIS', cls: 'gas', title: 'Reverser internal link I–S', pts: l([A.valveI, [224, 106], A.valveS]) });
  add({ id: 'vDI', cls: 'gas', title: 'Reverser internal link D–I', pts: l([A.valveD, [190, 114], [230, 114], [230, 106], A.valveI]) });
  add({ id: 'vOS', cls: 'gas', title: 'Reverser internal link O–S', pts: l([A.valveO, [184, 98], [224, 98], A.valveS]) });

  const boxes = roomBoxes(lay.n);
  for (let i = 0; i < lay.n; i++) {
    const yg = ygOf(i);
    const yl = ylOf(i);
    const b = boxes[i];
    if (!b) continue;
    add({ id: `gasStub:${i}`, cls: 'gas', title: `Branch ${i + 1} gas stub`, halo: true, pts: l([[250, yg], [OUT.w, yg]]) });
    add({ id: `hdrStub:${i}`, cls: 'liq', title: `Branch ${i + 1} liquid stub (header side of EEV)`, pts: l([[268, yl], [279, yl]]) });
    add({ id: `fieldStub:${i}`, cls: 'liq', title: `Branch ${i + 1} liquid stub (field side of EEV)`, pts: l([[293, yl], [OUT.w, yl]]) });
    add({
      id: `gasField:${i}`, cls: 'gas', insul: true, title: `Branch ${i + 1} gas field line`,
      pts: [L(OUT.w, yg), [b.gx, OUT.y + yg], [b.gx, b.gasY], [b.unitX + 74, b.gasY]],
    });
    add({
      id: `liqField:${i}`, cls: 'liq', insul: true, title: `Branch ${i + 1} liquid field line`,
      pts: [L(OUT.w, yl), [b.lx, OUT.y + yl], [b.lx, b.liqY], [b.unitX + 74, b.liqY]],
    });
    const iv = INDOOR_V.map((p): Pt => [b.unitX + p[0], b.unitY + p[1]]);
    add({ id: `inG:${i}`, cls: 'coil', title: `Indoor ${i + 1} coil · gas end`, pts: iv.slice(0, 2) });
    add({ id: `inM:${i}`, cls: 'coil', title: `Indoor ${i + 1} coil · middle passes`, pts: iv.slice(1, 6) });
    add({ id: `inL:${i}`, cls: 'coil', title: `Indoor ${i + 1} coil · liquid end`, pts: iv.slice(5, 8) });
  }
  return specs;
}
