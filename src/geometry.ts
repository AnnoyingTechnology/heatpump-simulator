import type { Pt, PipeSpec } from './pipes';
import { INDOOR_CASE_MM, OUTDOOR_CASE_MM } from './types';

/** One physical illustration scale for BOTH casings: 0.32 px per mm. Tube routing is schematic. */
export const MM_PX = 0.32;
export const VB_W = 1100;
export const VB_H = 860;
export const GROUND_Y = 776;

export const OUT = { x: 30, y: 538, w: Math.round(OUTDOOR_CASE_MM.w * MM_PX), h: Math.round(OUTDOOR_CASE_MM.h * MM_PX) } as const;
export const UNIT = { w: Math.round(INDOOR_CASE_MM.w * MM_PX), h: Math.round(INDOOR_CASE_MM.h * MM_PX), dx: 16, dy: 14 } as const;

export const WALL = { x0: 440, x1: 470 } as const;
export const ROOM_X1 = 1100;
export const STACK_TOP = 100;
export const STACK_BOTTOM = 770;

export interface RoomBox { i: number; top: number; bottom: number; h: number; unitX: number; unitY: number; gasY: number; liqY: number }

export function roomBoxes(n: number): RoomBox[] {
  const h = (STACK_BOTTOM - STACK_TOP) / n;
  return Array.from({ length: n }, (_, i) => {
    const top = STACK_TOP + i * h;
    const unitX = WALL.x1 + UNIT.dx;
    const unitY = top + UNIT.dy;
    return { i, top, bottom: top + h, h, unitX, unitY, gasY: unitY + 26, liqY: unitY + 62 };
  });
}

/** Local (outdoor casing) → scene coordinates. */
export const L = (x: number, y: number): Pt => [OUT.x + x, OUT.y + y];

export const ygOf = (i: number): number => 116 + 22 * i;
export const ylOf = (i: number): number => ygOf(i) + 9;
export const riserG = (i: number): number => 350 + 14 * i;
export const riserL = (i: number): number => riserG(i) + 7;

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

export function pipeSpecs(n: number): PipeSpec[] {
  const l = (pts: Pt[]): Pt[] => pts.map((p) => L(p[0], p[1]));
  const specs: PipeSpec[] = [];
  const add = (s: PipeSpec): void => { specs.push(s); };
  const cv = outdoorCoilVerts();
  const last = ygOf(n - 1);

  add({ id: 'disc', cls: 'gas', title: 'Compressor discharge D → reverser D', pts: l([A.compD, [114, 136], [190, 136], A.valveD]) });
  add({ id: 'sAcc', cls: 'gas', title: 'Reverser S → accumulator', pts: l([A.valveS, A.accIn]) });
  add({ id: 'accOut', cls: 'gas', title: 'Accumulator → compressor suction S', pts: l([A.accOut, A.compS]) });
  add({ id: 'revO', cls: 'gas', title: 'Reverser O ↔ outdoor-coil gas header', pts: l([A.valveO, [72, 106], [72, 22], A.coilGas]) });
  add({ id: 'revI', cls: 'gas', title: 'Reverser I ↔ common gas node', pts: l([A.valveI, A.svc]) });
  add({ id: 'gasMan', cls: 'gas', title: 'Common gas manifold', pts: l([A.svc, [250, last]]) });
  add({ id: 'coilG', cls: 'coil', title: 'Outdoor coil · gas end', pts: l(cv.slice(0, 6)) });
  add({ id: 'coilM', cls: 'coil', title: 'Outdoor coil · middle passes', pts: l(cv.slice(5, 18)) });
  add({ id: 'coilL', cls: 'coil', title: 'Outdoor coil · liquid end', pts: l(cv.slice(17, 24)) });
  add({ id: 'liqHdr', cls: 'liq', title: 'Outdoor liquid header', pts: l([A.coilLiq, [78, 198], [78, 222], [268, 222], [268, ylOf(0)]]) });
  add({ id: 'vDO', cls: 'gas', title: 'Reverser internal link D–O', pts: l([A.valveD, [190, 106], A.valveO]) });
  add({ id: 'vIS', cls: 'gas', title: 'Reverser internal link I–S', pts: l([A.valveI, [224, 106], A.valveS]) });
  add({ id: 'vDI', cls: 'gas', title: 'Reverser internal link D–I', pts: l([A.valveD, [190, 114], [230, 114], [230, 106], A.valveI]) });
  add({ id: 'vOS', cls: 'gas', title: 'Reverser internal link O–S', pts: l([A.valveO, [184, 98], [224, 98], A.valveS]) });

  const boxes = roomBoxes(n);
  for (let i = 0; i < n; i++) {
    const yg = ygOf(i);
    const yl = ylOf(i);
    const b = boxes[i];
    if (!b) continue;
    add({ id: `gasStub:${i}`, cls: 'gas', title: `Branch ${i + 1} gas stub`, halo: true, pts: l([[250, yg], [OUT.w, yg]]) });
    add({ id: `hdrStub:${i}`, cls: 'liq', title: `Branch ${i + 1} liquid stub (header side of EEV)`, pts: l([[268, yl], [279, yl]]) });
    add({ id: `fieldStub:${i}`, cls: 'liq', title: `Branch ${i + 1} liquid stub (field side of EEV)`, pts: l([[293, yl], [OUT.w, yl]]) });
    add({
      id: `gasField:${i}`, cls: 'gas', insul: true, title: `Branch ${i + 1} gas field line`,
      pts: [L(OUT.w, yg), [riserG(i), OUT.y + yg], [riserG(i), b.gasY], [b.unitX + 74, b.gasY]],
    });
    add({
      id: `liqField:${i}`, cls: 'liq', insul: true, title: `Branch ${i + 1} liquid field line`,
      pts: [L(OUT.w, yl), [riserL(i), OUT.y + yl], [riserL(i), b.liqY], [b.unitX + 74, b.liqY]],
    });
    const iv = INDOOR_V.map((p): Pt => [b.unitX + p[0], b.unitY + p[1]]);
    add({ id: `inG:${i}`, cls: 'coil', title: `Indoor ${i + 1} coil · gas end`, pts: iv.slice(0, 2) });
    add({ id: `inM:${i}`, cls: 'coil', title: `Indoor ${i + 1} coil · middle passes`, pts: iv.slice(1, 6) });
    add({ id: `inL:${i}`, cls: 'coil', title: `Indoor ${i + 1} coil · liquid end`, pts: iv.slice(5, 8) });
  }
  return specs;
}
