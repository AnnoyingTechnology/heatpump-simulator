import type { ExampleState, IndoorClass, Mode, RoomConfig } from './types';
import { INDOOR_CLASSES } from './types';

/**
 * Constructed illustrative fixtures (research/model-validation-plan.md §6). These are NOT solver output.
 * R32 thermodynamic states came from a pinned EOS probe; flows, fans and allocations are chosen examples.
 * Fixtures never react to configuration edits; the UI shows a mismatch notice instead.
 */
export const PREVIEW_BANNER = 'Interface preview · illustrative readings · model not validated';

export type FixtureId = 'heating-normal' | 'heating-frost' | 'heating-defrost' | 'heating-idle' | 'cooling-normal' | 'cooling-idle';

export interface CycleStates {
  pLowBarA: number;
  pHighBarA: number;
  suctionC: number;
  dischargeC: number;
  condOutC: number;
  expOutC: number;
  expQuality: number | null;
  hSuctionKjKg: number;
  hDischargeKjKg: number;
  hCondOutKjKg: number;
}

export interface LedgerRow {
  label: string;
  value: number | null;
  unit: string;
  digits: number;
  note?: string;
}

export interface Fixture {
  id: FixtureId;
  title: string;
  summary: string;
  mode: Mode;
  example: ExampleState;
  conditions: { outdoorC: number; outdoorRh: number; roomC: number; roomRh: number; setpointC: number };
  cycle: CycleStates | null;
  mDotKgS: number | null;
  qCondKw: number | null;
  qEvapKw: number | null;
  pRefKw: number | null;
  driveLossKw: number | null;
  pElecKw: number;
  /** Net useful room heat (signed; negative in defrost) or net room cooling for cooling mode. */
  roomKwTotal: number | null;
  roomKwLabel: string;
  cop: number | null;
  copLabel: string;
  /** Reference (25/35/25) branch arrays. */
  branchKw: [number, number, number] | null;
  branchOutC: [number, number, number] | null;
  branchFanKw: [number, number, number];
  outdoorFanKw: number;
  controlsKw: number;
  outdoorOutletC: number | null;
  indoorFansOn: boolean;
  outdoorFanOn: boolean;
  /** Short flags for the scene. */
  frostRateKgH: number | null;
  meltRateKgH: number | null;
  ledger: LedgerRow[];
  notes: string[];
}

const heatingCycle: CycleStates = {
  pLowBarA: 6.9058, pHighBarA: 24.7831, suctionC: 0, dischargeC: 100.25, condOutC: 37, expOutC: -5,
  expQuality: 0.2412, hSuctionKjKg: 520.1, hDischargeKjKg: 597.33, hCondOutKjKg: 269.23,
};
const coolingCycle: CycleStates = {
  pLowBarA: 10.115, pHighBarA: 27.9478, suctionC: 12, dischargeC: 92.14, condOutC: 42, expOutC: 7,
  expQuality: 0.2212, hSuctionKjKg: 522.79, hDischargeKjKg: 582.61, hCondOutKjKg: 279.61,
};
const defrostCycle: CycleStates = {
  pLowBarA: 8.131, pHighBarA: 12.8081, suctionC: 5, dischargeC: 38.87, condOutC: 12, expOutC: 0,
  expQuality: 0.0677, hSuctionKjKg: 521.37, hDischargeKjKg: 547.04, hCondOutKjKg: 221.35,
};

const idleBase = {
  cycle: null, mDotKgS: null, qCondKw: null, qEvapKw: null, pRefKw: null, driveLossKw: null,
  pElecKw: 0.015, roomKwTotal: 0, cop: null, copLabel: 'COP — (idle)',
  branchKw: [0, 0, 0] as [number, number, number], branchOutC: null,
  branchFanKw: [0, 0, 0] as [number, number, number], outdoorFanKw: 0, controlsKw: 0.015,
  outdoorOutletC: null, indoorFansOn: false, outdoorFanOn: false, frostRateKgH: null, meltRateKgH: null,
};

export const FIXTURES: Record<FixtureId, Fixture> = {
  'heating-normal': {
    id: 'heating-normal', title: 'Heating · normal', mode: 'heating', example: 'normal',
    summary: 'Dry (non-frosting) heating point, 7 °C / 35 % RH, cold coil surface −3 °C.',
    conditions: { outdoorC: 7, outdoorRh: 35, roomC: 20, roomRh: 50, setpointC: 21 },
    cycle: heatingCycle, mDotKgS: 0.018, qCondKw: 5.905783, qEvapKw: 4.515682, pRefKw: 1.390101, driveLossKw: 0.104631,
    pElecKw: 1.674732, roomKwTotal: 5.980783, roomKwLabel: 'Net room heating', cop: 3.571187, copLabel: 'Heating COP',
    branchKw: [1.791735, 2.397313, 1.791735], branchOutC: [33.511, 34.688, 33.511],
    branchFanKw: [0.02, 0.035, 0.02], outdoorFanKw: 0.09, controlsKw: 0.015, outdoorOutletC: 2.13,
    indoorFansOn: true, outdoorFanOn: true, frostRateKgH: null, meltRateKgH: null,
    ledger: [
      { label: 'Refrigerant Q condenser', value: 5.905783, unit: 'kW', digits: 3 },
      { label: 'Refrigerant Q evaporator', value: 4.515682, unit: 'kW', digits: 3 },
      { label: 'Compressor refrigerant work', value: 1.390101, unit: 'kW', digits: 3 },
      { label: 'Compressor drive loss', value: 0.104631, unit: 'kW', digits: 3 },
      { label: 'Indoor fans (sum)', value: 0.075, unit: 'kW', digits: 3 },
      { label: 'Outdoor fan', value: 0.09, unit: 'kW', digits: 3 },
      { label: 'Controls', value: 0.015, unit: 'kW', digits: 3 },
      { label: 'Total electrical input', value: 1.674732, unit: 'kW', digits: 3 },
      { label: 'Outdoor coil air outlet (coil)', value: 2.031, unit: '°C', digits: 1 },
      { label: 'Ice deposition', value: 0, unit: 'kg/h', digits: 2, note: 'dry point' },
    ],
    notes: ['Qcond − Qevap = refrigerant work. Net room heat adds indoor-fan heat.', 'Single-cycle example; does not predict manufacturer performance.'],
  },
  'heating-frost': {
    id: 'heating-frost', title: 'Heating · frosting', mode: 'heating', example: 'frost',
    summary: 'Synthetic frosting snapshot, 3 °C / 85 % RH, film surface −3 °C. Not a demonstrated UA response.',
    conditions: { outdoorC: 3, outdoorRh: 85, roomC: 20, roomRh: 50, setpointC: 21 },
    cycle: heatingCycle, mDotKgS: 0.015, qCondKw: 4.921486, qEvapKw: 3.763068, pRefKw: 1.158418, driveLossKw: 0.087193,
    pElecKw: 1.37561, roomKwTotal: 4.976486, roomKwLabel: 'Net room heating', cop: 3.617656, copLabel: 'Heating COP',
    branchKw: [1.491446, 1.993594, 1.491446], branchOutC: [31.247, 32.215, 31.247],
    branchFanKw: [0.015, 0.025, 0.015], outdoorFanKw: 0.06, controlsKw: 0.015, outdoorOutletC: 0.297,
    indoorFansOn: true, outdoorFanOn: true, frostRateKgH: 1.569604, meltRateKgH: null,
    ledger: [
      { label: 'Refrigerant Q condenser', value: 4.921486, unit: 'kW', digits: 3 },
      { label: 'Refrigerant Q evaporator', value: 3.763068, unit: 'kW', digits: 3 },
      { label: 'Compressor refrigerant work', value: 1.158418, unit: 'kW', digits: 3 },
      { label: 'Compressor drive loss', value: 0.087193, unit: 'kW', digits: 3 },
      { label: 'Outdoor-air enthalpy removal to film', value: 3.614915, unit: 'kW', digits: 3 },
      { label: 'Film enthalpy storage rate', value: -0.148153, unit: 'kW', digits: 3, note: 'new ice at −3 °C' },
      { label: 'Ice deposition', value: 1.569604, unit: 'kg/h', digits: 2 },
      { label: 'Contact effectiveness', value: 0.461984, unit: '—', digits: 3 },
      { label: 'Outdoor coil air outlet (coil)', value: 0.231, unit: '°C', digits: 1 },
      { label: 'Total electrical input', value: 1.37561, unit: 'kW', digits: 3 },
    ],
    notes: [
      'The COP here is NOT evidence that frost improves performance; flow and fan values were chosen freely.',
      'Scene ice starts at an explicitly arbitrary 0.10 kg only when the scene holds no ice or retained liquid, then grows at the listed instantaneous rate.',
    ],
  },
  'heating-defrost': {
    id: 'heating-defrost', title: 'Reverse-cycle defrost', mode: 'heating', example: 'defrost',
    summary: 'Reverser on cooling connections; fans off; fixture example assumes 0.10 kg of ice (the scene amount may differ). No controller modelled.',
    conditions: { outdoorC: 3, outdoorRh: 85, roomC: 20, roomRh: 50, setpointC: 21 },
    cycle: defrostCycle, mDotKgS: 0.003, qCondKw: 0.977049, qEvapKw: 0.900044, pRefKw: 0.077006, driveLossKw: 0.005796,
    pElecKw: 0.097802, roomKwTotal: -0.600044, roomKwLabel: 'Signed room heat (extracted)', cop: null, copLabel: 'Heating COP — (defrost)',
    branchKw: [-0.180013, -0.240017, -0.180013], branchOutC: null,
    branchFanKw: [0, 0, 0], outdoorFanKw: 0, controlsKw: 0.015, outdoorOutletC: null,
    indoorFansOn: false, outdoorFanOn: false, frostRateKgH: null, meltRateKgH: 8.095952,
    ledger: [
      { label: 'Indoor refrigerant evaporation', value: 0.900044, unit: 'kW', digits: 3 },
      { label: 'Outdoor refrigerant condensation', value: 0.977049, unit: 'kW', digits: 3 },
      { label: 'Compressor refrigerant work', value: 0.077006, unit: 'kW', digits: 3 },
      { label: 'Signed useful indoor heating', value: -0.600044, unit: 'kW', digits: 3 },
      { label: 'Indoor metal storage rate', value: -0.3, unit: 'kW', digits: 3, note: 'extra source to evaporator' },
      { label: 'Outdoor coil → ice melt', value: 0.75, unit: 'kW', digits: 3 },
      { label: 'Outdoor coil → metal warming', value: 0.127049, unit: 'kW', digits: 3 },
      { label: 'Outdoor coil → ambient loss', value: 0.1, unit: 'kW', digits: 3 },
      { label: 'Ice melt rate (plateau)', value: 8.095952, unit: 'kg/h', digits: 2 },
      { label: 'Total electrical input', value: 0.097802, unit: 'kW', digits: 3, note: 'incl. 0.015 controls' },
    ],
    notes: [
      'Fixture example only: melt at 0.75 kW would take ~44 s for 0.10 kg. Not a predicted defrost duration and NOT a manufacturer defrost timer.',
      'The scene ledger moves ice to retained liquid at the fixed melt rate until the ice is gone; readings never change.',
      'Forced-air outlet temperatures are not presented; fans are off.',
    ],
  },
  'heating-idle': {
    id: 'heating-idle', title: 'Heating · idle', mode: 'heating', example: 'idle',
    summary: 'Compressor and fans off, controls only; local equilibrium; off-state inventory not modelled.',
    conditions: { outdoorC: 7, outdoorRh: 35, roomC: 20, roomRh: 50, setpointC: 21 },
    ...idleBase,
    roomKwLabel: 'Net room heating',
    ledger: [{ label: 'Controls (standby)', value: 0.015, unit: 'kW', digits: 3 }, { label: 'Pressures, quality', value: null, unit: '', digits: 0, note: 'off-state inventory not modelled' }],
    notes: ['Pipes grey, no arrows. Retained ice and liquid from earlier states stay in the scene ledger (synthetic snapshot transition).'],
  },
  'cooling-normal': {
    id: 'cooling-normal', title: 'Cooling · wet coil', mode: 'cooling', example: 'normal',
    summary: 'Outdoor 32 °C / 50 % RH, rooms 27 °C / 55 % RH; indoor coil dehumidifies.',
    conditions: { outdoorC: 32, outdoorRh: 50, roomC: 27, roomRh: 55, setpointC: 24 },
    cycle: coolingCycle, mDotKgS: 0.02, qCondKw: 6.060004, qEvapKw: 4.863579, pRefKw: 1.196425, driveLossKw: 0.090054,
    pElecKw: 1.466479, roomKwTotal: 4.821269, roomKwLabel: 'Net room cooling', cop: 3.287647, copLabel: 'Cooling COP',
    branchKw: [1.448881, 1.923507, 1.448881], branchOutC: [12.901, 13.004, 12.901],
    branchFanKw: [0.02, 0.035, 0.02], outdoorFanKw: 0.09, controlsKw: 0.015, outdoorOutletC: 38.602,
    indoorFansOn: true, outdoorFanOn: true, frostRateKgH: null, meltRateKgH: null,
    ledger: [
      { label: 'Refrigerant Q evaporator', value: 4.863579, unit: 'kW', digits: 3 },
      { label: 'Refrigerant Q condenser', value: 6.060004, unit: 'kW', digits: 3 },
      { label: 'Compressor refrigerant work', value: 1.196425, unit: 'kW', digits: 3 },
      { label: 'Compressor drive loss', value: 0.090054, unit: 'kW', digits: 3 },
      { label: 'Room enthalpy removal before fans', value: 4.896269, unit: 'kW', digits: 3, note: '= Qevap + drain energy' },
      { label: 'Condensate drain', value: 2.815395, unit: 'kg/h', digits: 2 },
      { label: 'Drain liquid energy', value: 0.03269, unit: 'kW', digits: 3 },
      { label: 'Coil outlet air (indoor)', value: 12.569, unit: '°C', digits: 1 },
      { label: 'Total electrical input', value: 1.466479, unit: 'kW', digits: 3 },
    ],
    notes: ['Net room cooling excludes fan heat. Indoor-coil wet ADP 10 °C and bypass 0.15 are chosen, not manufacturer values.'],
  },
  'cooling-idle': {
    id: 'cooling-idle', title: 'Cooling · idle', mode: 'cooling', example: 'idle',
    summary: 'Compressor and fans off, controls only.',
    conditions: { outdoorC: 32, outdoorRh: 50, roomC: 27, roomRh: 55, setpointC: 24 },
    ...idleBase,
    roomKwLabel: 'Net room cooling',
    ledger: [{ label: 'Controls (standby)', value: 0.015, unit: 'kW', digits: 3 }],
    notes: ['Pipes grey, no arrows.'],
  },
};

export function fixtureFor(mode: Mode, example: ExampleState): Fixture {
  if (example === 'idle') return mode === 'heating' ? FIXTURES['heating-idle'] : FIXTURES['cooling-idle'];
  if (mode === 'cooling') return FIXTURES['cooling-normal'];
  if (example === 'frost') return FIXTURES['heating-frost'];
  if (example === 'defrost') return FIXTURES['heating-defrost'];
  return FIXTURES['heating-normal'];
}

export interface BranchReading {
  roomKw: number;
  outletC: number | null;
  fanKw: number;
  /** True when the split reuses the fixture's own 25/35/25 arrays rather than a generic weighted share. */
  fromFixture: boolean;
}

const REFERENCE: IndoorClass[] = ['FTXA25', 'FTXA35', 'FTXA25'];

/**
 * Re-allocates the fixture's TOTALS across the active rooms so branch sums stay equal to the system values.
 * Generic shares are illustrative, not a load-allocation control law.
 */
export function branchReadings(fix: Fixture, rooms: RoomConfig[]): BranchReading[] {
  const total = fix.roomKwTotal ?? 0;
  const fanTotal = fix.branchFanKw[0] + fix.branchFanKw[1] + fix.branchFanKw[2];
  const matchesReference =
    rooms.length === 3 &&
    rooms.every((r, i) => INDOOR_CLASSES[r.indoorClass].nominalKw === INDOOR_CLASSES[REFERENCE[i] as IndoorClass].nominalKw);
  if (matchesReference && fix.branchKw) {
    return rooms.map((_, i) => ({
      roomKw: fix.branchKw?.[i] ?? 0,
      outletC: fix.branchOutC?.[i] ?? null,
      fanKw: fix.branchFanKw[i] ?? 0,
      fromFixture: true,
    }));
  }
  const weights = rooms.map((r) => INDOOR_CLASSES[r.indoorClass].weight);
  const wSum = weights.reduce((a, b) => a + b, 0) || 1;
  return rooms.map((r, i) => {
    const share = (weights[i] ?? 0) / wSum;
    const nominalKw = INDOOR_CLASSES[r.indoorClass].nominalKw;
    const big = nominalKw !== null && nominalKw >= 3;
    return {
      roomKw: total * share,
      outletC: fix.branchOutC ? (fix.branchOutC[big ? 1 : 0] ?? null) : null,
      fanKw: fanTotal * share,
      fromFixture: false,
    };
  });
}
