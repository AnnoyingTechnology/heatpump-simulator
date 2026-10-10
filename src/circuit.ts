import type { CycleStates } from './fixtures';
import type { ExampleState, Mode } from './types';

/**
 * Generic explanatory circuit (not a claim about Daikin's internal layout). Segment ids map onto drawn polylines.
 * Temperature is the primary, continuous tube colour (full interior width). Phase is a separate monochrome mark
 * pattern (dots = vapor, dashes = liquid, dash-dot = two-phase); the two encodings never share a channel.
 */
export type Phase = 'vapor' | 'liquid' | 'two' | 'idle' | 'off';
export type Dir = -1 | 0 | 1;

export interface SegState {
  phase: Phase;
  /** +1 flows along the drawn point order, −1 against it, 0 none. */
  dir: Dir;
  tempC: number | null;
}

export type FlowMode = 'heating' | 'cooling' | 'defrost' | 'idle';

export function flowMode(mode: Mode, example: ExampleState): FlowMode {
  if (example === 'idle') return 'idle';
  if (mode === 'cooling') return 'cooling';
  return example === 'defrost' ? 'defrost' : 'heating';
}

/** Reversing-valve pairs: heating D–I / O–S; cooling and defrost D–O / I–S. Compressor D/S never swap. */
export function valvePairs(fm: FlowMode, mode: Mode): { a: string; b: string } {
  const heatingConnections = fm === 'heating' || (fm === 'idle' && mode === 'heating');
  return heatingConnections ? { a: 'D–I', b: 'O–S' } : { a: 'D–O', b: 'I–S' };
}

export function segKind(id: string): string {
  const i = id.indexOf(':');
  return i < 0 ? id : id.slice(0, i);
}

const IDLE: SegState = { phase: 'idle', dir: 0, tempC: null };
const OFF: SegState = { phase: 'off', dir: 0, tempC: null };

export function segState(id: string, fm: FlowMode, c: CycleStates | null, mode: Mode = 'heating'): SegState {
  const kind = segKind(id);
  if (fm === 'idle' || !c) {
    // Idle keeps the last valve position: only the pair for the selected mode stays visible (grey).
    if (kind === 'vDI' || kind === 'vOS') return mode === 'heating' ? IDLE : OFF;
    if (kind === 'vDO' || kind === 'vIS') return mode === 'heating' ? OFF : IDLE;
    return IDLE;
  }
  const Td = c.dischargeC;
  const Ts = c.suctionC;
  const Tc = c.condOutC;
  const Tx = c.expOutC;
  const heat = fm === 'heating';
  switch (kind) {
    case 'disc': return { phase: 'vapor', dir: 1, tempC: Td };
    case 'sAcc':
    case 'accOut': return { phase: 'vapor', dir: 1, tempC: Ts };
    case 'revO': return heat ? { phase: 'vapor', dir: -1, tempC: Ts } : { phase: 'vapor', dir: 1, tempC: Td };
    case 'revI':
    case 'gasMan':
    case 'gasStub':
    case 'gasField': return heat ? { phase: 'vapor', dir: 1, tempC: Td } : { phase: 'vapor', dir: -1, tempC: Ts };
    case 'coilG': return heat ? { phase: 'vapor', dir: -1, tempC: Ts } : { phase: 'vapor', dir: 1, tempC: Td };
    case 'coilM': return { phase: 'two', dir: heat ? -1 : 1, tempC: null };
    case 'coilL': return heat ? { phase: 'two', dir: -1, tempC: Tx } : { phase: 'liquid', dir: 1, tempC: Tc };
    case 'liqHdr':
    case 'hdrStub': return heat ? { phase: 'two', dir: -1, tempC: Tx } : { phase: 'liquid', dir: 1, tempC: Tc };
    case 'fieldStub':
    case 'liqField': return heat ? { phase: 'liquid', dir: -1, tempC: Tc } : { phase: 'two', dir: 1, tempC: Tx };
    case 'inG': return heat ? { phase: 'vapor', dir: 1, tempC: Td } : { phase: 'vapor', dir: -1, tempC: Ts };
    case 'inM': return { phase: 'two', dir: heat ? 1 : -1, tempC: null };
    case 'inL': return heat ? { phase: 'liquid', dir: 1, tempC: Tc } : { phase: 'two', dir: -1, tempC: Tx };
    case 'vDI': return heat ? { phase: 'vapor', dir: 1, tempC: Td } : OFF;
    case 'vOS': return heat ? { phase: 'vapor', dir: 1, tempC: Ts } : OFF;
    case 'vDO': return heat ? OFF : { phase: 'vapor', dir: 1, tempC: Td };
    case 'vIS': return heat ? OFF : { phase: 'vapor', dir: 1, tempC: Ts };
    default: return IDLE;
  }
}

type Stops = ReadonlyArray<readonly [number, readonly [number, number, number]]>;

/**
 * Fixed absolute REFRIGERANT scale, −40…145 °C, never rescaled. Cold blue → pale neutral at 20 °C → amber → red → dark wine.
 * The common −20…65 °C region holds six of the eight stops; 105 and 145 °C are the superheated hot-vapour tail, not a liquid cap.
 * Colour is temperature only: phase is the separate monochrome mark. Values beyond the ends saturate; exact numbers never do.
 */
const STOPS: Stops = [
  [-40, [43, 36, 107]],
  [-20, [44, 92, 178]],
  [0, [88, 168, 212]],
  [20, [226, 228, 205]],
  [40, [244, 190, 110]],
  [65, [226, 96, 58]],
  [105, [160, 28, 48]],
  [145, [92, 10, 56]],
];

export const TEMP_RAMP_MIN = -40;
export const TEMP_RAMP_MAX = 145;
/** Stop temperatures of the refrigerant scale, for the legend ticks. */
export const TEMP_RAMP_TICKS: ReadonlyArray<number> = STOPS.map((s) => s[0]);

/** Separate AIR scale for room and ambient fills: −30…50 °C covers outdoor extremes and 17…26 °C room targets. */
const AIR_STOPS: Stops = [
  [-30, [52, 74, 160]],
  [-10, [70, 130, 196]],
  [5, [128, 188, 214]],
  [17, [190, 224, 216]],
  [22, [236, 230, 196]],
  [30, [244, 190, 120]],
  [40, [230, 120, 70]],
  [50, [190, 44, 44]],
];

export const AIR_RAMP_MIN = -30;
export const AIR_RAMP_MAX = 50;
export const AIR_RAMP_TICKS: ReadonlyArray<number> = AIR_STOPS.map((s) => s[0]);

function rampColor(stops: Stops, t: number | null): string {
  if (t === null) return 'transparent';
  const first = stops[0];
  const last = stops[stops.length - 1];
  if (!first || !last) return 'transparent';
  const x = Math.min(last[0], Math.max(first[0], t));
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    if (!a || !b) continue;
    if (x <= b[0]) {
      const f = (x - a[0]) / (b[0] - a[0]);
      const rgb = a[1].map((v, k) => Math.round(v + f * ((b[1][k] ?? v) - v)));
      return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
    }
  }
  return `rgb(${last[1][0]}, ${last[1][1]}, ${last[1][2]})`;
}

function rampCss(stops: Stops): string {
  const lo = stops[0]?.[0] ?? 0;
  const hi = stops[stops.length - 1]?.[0] ?? 1;
  const parts = stops.map(([t, rgb]) => `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]}) ${(((t - lo) / (hi - lo)) * 100).toFixed(2)}%`);
  return `linear-gradient(90deg, ${parts.join(', ')})`;
}

/** Refrigerant temperature colour (tubes, probe swatches). */
export function tempColor(t: number | null): string { return rampColor(STOPS, t); }
export function tempRampCss(): string { return rampCss(STOPS); }
/** Air temperature colour (room and ambient fills). Deliberately a different scale from the refrigerant one. */
export function airColor(t: number | null): string { return rampColor(AIR_STOPS, t); }
export function airRampCss(): string { return rampCss(AIR_STOPS); }

// ---------- refrigerant probes: which engine or fixture state each materialised sensor reads ----------

/** Refrigerant side of a coil end: whether the fluid enters or leaves there, and its exact temperature (null = unavailable). */
export interface CoilEnd { role: 'IN' | 'OUT' | 'GAS' | 'SM'; tempC: number | null }

export interface CoilProbe {
  /** Gas-pipe end and liquid-pipe end of the coil, in physical position. */
  gas: CoilEnd;
  liquid: CoilEnd;
  /** OUT − IN [K] from the exact values, or null when either is unavailable. */
  deltaK: number | null;
  /** Refrigerant-side coil heat [W], engine sign: negative = the refrigerant absorbs heat, positive = it releases heat. */
  heatW: number | null;
}

const NO_END = (role: 'IN' | 'OUT'): CoilEnd => ({ role, tempC: null });

function coilProbe(gas: CoilEnd, liquid: CoilEnd, heatW: number | null): CoilProbe {
  const inT = gas.role === 'IN' ? gas.tempC : liquid.tempC;
  const outT = gas.role === 'OUT' ? gas.tempC : liquid.tempC;
  return { gas, liquid, deltaK: inT === null || outT === null ? null : outT - inT, heatW };
}

/** Physical charge-aware sensors: terminal bulk state persists without circulation.
 * Accumulating coils may have both faces entering/leaving, so a single ΔT can be undefined. */
export function inventoryCoilProbe(port: import('./engine/charge').ChargeCandidate['coilPorts'][string], heatW: number | null): CoilProbe {
  const role = (flow: number, physical: 'GAS' | 'SM'): CoilEnd['role'] => Math.abs(flow) < 1e-10 ? physical : flow > 0 ? 'IN' : 'OUT';
  const gas: CoilEnd = { role: role(port.gasFaceMassFlowKgs,'GAS'), tempC: port.gas.temperatureC };
  const liquid: CoilEnd = { role: role(port.smallFaceMassFlowKgs,'SM'), tempC: port.small.temperatureC };
  const opposite = (gas.role === 'IN' && liquid.role === 'OUT') || (gas.role === 'OUT' && liquid.role === 'IN');
  return { ...coilProbe(gas,liquid,heatW), deltaK: opposite ? (gas.role === 'OUT' ? gas.tempC! - liquid.tempC! : liquid.tempC! - gas.tempC!) : null };
}

/**
 * Outdoor coil. Heating: the coil is the evaporator, refrigerant enters at the liquid end (expansion outlet) and leaves at the gas end
 * (suction). Cooling and defrost: it is the condenser, refrigerant enters at the gas end (discharge) and leaves at the liquid end
 * (condenser outlet). No cycle (idle, fault, reversing, draining, withheld) → nothing is invented.
 */
export function outdoorCoilProbe(fm: FlowMode, c: CycleStates | null, heatW: number | null): CoilProbe {
  if (fm === 'idle' || !c) return coilProbe(NO_END('OUT'), NO_END('IN'), null);
  return fm === 'heating'
    ? coilProbe({ role: 'OUT', tempC: c.suctionC }, { role: 'IN', tempC: c.expOutC }, heatW)
    : coilProbe({ role: 'IN', tempC: c.dischargeC }, { role: 'OUT', tempC: c.condOutC }, heatW);
}

/**
 * Indoor coil, live: the actual branch inlet and outlet states, only while the branch circulates (mass flow > 0).
 * Heating: gas end IN, liquid end OUT. Cooling and defrost: liquid end IN, gas end OUT.
 */
export function indoorCoilProbeLive(fm: FlowMode, b: { flowKgs: number; inletC: number; outletC: number; heatW: number } | null): CoilProbe {
  const heating = fm === 'heating';
  if (fm === 'idle' || !b || !(b.flowKgs > 0)) return coilProbe(NO_END(heating ? 'IN' : 'OUT'), NO_END(heating ? 'OUT' : 'IN'), null);
  return heating
    ? coilProbe({ role: 'IN', tempC: b.inletC }, { role: 'OUT', tempC: b.outletC }, b.heatW)
    : coilProbe({ role: 'OUT', tempC: b.outletC }, { role: 'IN', tempC: b.inletC }, b.heatW);
}

/** Indoor coil, Examples: the fixture's explicitly illustrative common-cycle endpoints; no per-branch refrigerant heat exists. */
export function indoorCoilProbeExample(fm: FlowMode, c: CycleStates | null): CoilProbe {
  if (fm === 'idle' || !c) return coilProbe(NO_END(fm === 'heating' ? 'IN' : 'OUT'), NO_END(fm === 'heating' ? 'OUT' : 'IN'), null);
  return fm === 'heating'
    ? coilProbe({ role: 'IN', tempC: c.dischargeC }, { role: 'OUT', tempC: c.condOutC }, null)
    : coilProbe({ role: 'OUT', tempC: c.suctionC }, { role: 'IN', tempC: c.expOutC }, null);
}

export function phaseLabel(p: Phase): string {
  switch (p) {
    case 'vapor': return 'Vapor';
    case 'liquid': return 'Liquid';
    case 'two': return 'Two-phase';
    case 'idle': return 'Idle (no flow)';
    default: return 'Not connected';
  }
}
