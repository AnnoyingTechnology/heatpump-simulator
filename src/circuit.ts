import type { CycleStates } from './fixtures';
import type { ExampleState, Mode } from './types';

/**
 * Generic explanatory circuit (not a claim about Daikin's internal layout). Segment ids map onto drawn polylines.
 * Phase is encoded by colour/pattern; temperature is a separate numeric value and thin core gradient.
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

/** Sequential-diverging ramp for the thin temperature core: cold blue → neutral → hot red (−10…105 °C). */
const STOPS: ReadonlyArray<readonly [number, readonly [number, number, number]]> = [
  [-10, [47, 95, 179]],
  [10, [96, 160, 205]],
  [35, [232, 226, 208]],
  [65, [240, 152, 100]],
  [105, [190, 40, 44]],
];

export const TEMP_RAMP_MIN = -10;
export const TEMP_RAMP_MAX = 105;

export function tempColor(t: number | null): string {
  if (t === null) return 'transparent';
  const x = Math.min(TEMP_RAMP_MAX, Math.max(TEMP_RAMP_MIN, t));
  for (let i = 0; i < STOPS.length - 1; i++) {
    const a = STOPS[i];
    const b = STOPS[i + 1];
    if (!a || !b) continue;
    if (x <= b[0]) {
      const f = (x - a[0]) / (b[0] - a[0]);
      const rgb = a[1].map((v, k) => Math.round(v + f * ((b[1][k] ?? v) - v)));
      return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
    }
  }
  const last = STOPS[STOPS.length - 1];
  return last ? `rgb(${last[1][0]}, ${last[1][1]}, ${last[1][2]})` : 'transparent';
}

export function tempRampCss(): string {
  const stops = STOPS.map(([t, rgb]) => `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]}) ${(((t - TEMP_RAMP_MIN) / (TEMP_RAMP_MAX - TEMP_RAMP_MIN)) * 100).toFixed(1)}%`);
  return `linear-gradient(90deg, ${stops.join(', ')})`;
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
