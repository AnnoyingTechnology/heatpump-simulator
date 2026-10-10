import { flowMode, segKind, segState } from '../circuit.ts';
import type { FlowMode, SegState } from '../circuit.ts';
import { branchReadings, fixtureFor } from '../fixtures.ts';
import type { BranchReading, Fixture } from '../fixtures.ts';
import type { AppState, RoomConfig } from '../types.ts';
import type { EngineOutput, RefrigerantState } from '../engine/types.ts';
import { SimulationRuntime } from './controller.ts';

export const simulation = new SimulationRuntime();
export type Experience = 'live' | 'examples';
export type Readings = Omit<Fixture, 'id' | 'branchKw' | 'branchOutC' | 'branchFanKw'> & {
  id: string;
  source: Experience;
  fieldLines?: 'idealized' | 'physical';
  branchKw: number[] | null;
  branchOutC: (number | null)[] | null;
  branchFanKw: number[];
  engine: EngineOutput | null;
};

export function readingsFor(s: AppState, source: Experience): Readings {
  if (source === 'examples') return { ...fixtureFor(s.cfg.mode, s.cfg.example), source, engine: null };
  const output = simulation.status.output;
  const cycle = output?.cycle ?? null;
  const mode = s.cfg.mode;
  const example = !cycle ? 'idle' : output?.state === 'defrost' ? 'defrost' : output!.outdoor.iceKg > 0 && mode === 'heating' ? 'frost' : 'normal';
  const rooms = output?.rooms ?? [];
  const cop = mode === 'heating' ? output?.heatingCOP ?? null : output?.coolingCOP ?? null;
  const signed = output?.signedRoomHeatW;
  const electrical = output?.electrical;
  const warnings = output?.diagnostics.warnings ?? [];
  const fault = simulation.status.error ?? output?.diagnostics.fault;
  return {
    id: 'live', source, fieldLines: s.cfg.live.fieldLines, engine: output, title: `Live · ${output?.state ?? simulation.status.state}`,
    summary: fault ?? 'Generic R32 model using real refrigerant and humid-air properties; manufacturer performance is not calibrated.',
    mode, example,
    conditions: { outdoorC: s.cfg.outdoorC, outdoorRh: s.cfg.outdoorRh, roomC: rooms[0]?.temperatureC ?? s.cfg.rooms[0].airC, roomRh: (rooms[0]?.relativeHumidity ?? .5) * 100, setpointC: s.cfg.rooms[0].setpointC },
    cycle: cycle ? { pLowBarA: cycle.lowPressureBarAbs, pHighBarA: cycle.highPressureBarAbs,
      suctionC: cycle.suction.temperatureC, dischargeC: cycle.discharge.temperatureC,
      condOutC: cycle.condenserOutlet.temperatureC, expOutC: cycle.expansionOutlet.temperatureC,
      expQuality: cycle.expansionOutlet.qualityMass, hSuctionKjKg: cycle.suction.hJkg / 1000,
      hDischargeKjKg: cycle.discharge.hJkg / 1000, hCondOutKjKg: cycle.condenserOutlet.hJkg / 1000 } : null,
    mDotKgS: cycle?.totalMassFlowKgs ?? null, qCondKw: cycle ? cycle.condenserHeatW / 1000 : null,
    qEvapKw: cycle ? cycle.evaporatorHeatW / 1000 : null, pRefKw: cycle ? cycle.compressorWorkW / 1000 : null,
    driveLossKw: electrical ? electrical.driveLossW / 1000 : null, pElecKw: electrical ? electrical.totalW / 1000 : 0,
    roomKwTotal: signed === undefined ? null : (mode === 'cooling' ? -signed : signed) / 1000,
    roomKwLabel: output?.state === 'defrost' ? 'Signed room heat (defrost)' : mode === 'heating' ? 'Net room heating' : 'Net room cooling',
    cop, copLabel: output?.state === 'defrost' ? 'COP — (defrost)' : mode === 'heating' ? 'Heating COP' : 'Cooling COP',
    branchKw: output ? rooms.map(r => (mode === 'cooling' ? -r.signedRoomHeatW : r.signedRoomHeatW) / 1000) : null,
    branchOutC: output ? rooms.map(r => r.airOutletC) : null,
    branchFanKw: rooms.map(r => r.fanPowerW / 1000), outdoorFanKw: (electrical?.outdoorFanW ?? 0) / 1000,
    controlsKw: (electrical?.controlsW ?? 0) / 1000, outdoorOutletC: output?.outdoor.airOutletC ?? null,
    indoorFansOn: rooms.some(r => r.fanPowerW > 0), outdoorFanOn: (output?.outdoor.fanPowerW ?? 0) > 0,
    frostRateKgH: output ? output.outdoor.depositionKgs * 3600 : null,
    // Phase equilibrium gives net ice change; no fabricated melt-mass rate from compressor power.
    meltRateKgH: null,
    ledger: output ? [
      { label: 'Refrigerant condenser heat', value: cycle ? cycle.condenserHeatW / 1000 : null, unit: 'kW', digits: 3 },
      { label: 'Refrigerant evaporator heat', value: cycle ? cycle.evaporatorHeatW / 1000 : null, unit: 'kW', digits: 3 },
      { label: 'Electrical input', value: electrical!.totalW / 1000, unit: 'kW', digits: 3 },
      { label: 'Whole-system energy residual', value: output.energy.residualJ, unit: 'J', digits: 3 },
      { label: 'Water mass residual', value: output.energy.waterResidualKg, unit: 'kg', digits: 8 },
      { label: 'Outdoor metal temperature', value: output.outdoor.metalTemperatureC, unit: '°C', digits: 2 },
      { label: 'Ice deposition', value: output.outdoor.depositionKgs * 3600, unit: 'kg/h', digits: 3 },
      { label: 'Liquid drainage', value: output.outdoor.drainageKgs * 3600, unit: 'kg/h', digits: 3 },
      { label: 'Shared-pressure closure residual', value: output.diagnostics.algebraicResidualW, unit: 'W', digits: 3 },
    ] : [],
    notes: [fault ?? 'Generic coil, compressor, fabric and controller parameters are assumptions; model references identify casings only.', ...warnings],
  };
}

export function branchesFor(readings: Readings, rooms: RoomConfig[]): BranchReading[] {
  if (readings.source === 'examples') return branchReadings(fixtureFor(readings.mode, readings.example), rooms);
  return rooms.map((_, i) => ({ roomKw: readings.branchKw?.[i] ?? 0, outletC: readings.branchOutC?.[i] ?? null, fanKw: readings.branchFanKw[i] ?? 0, fromFixture: false }));
}

export function readingFlowMode(readings: Readings): FlowMode { return flowMode(readings.mode, readings.example); }

/** Branch endpoints retain their real state; closed branches carry no animated flow. */
export function segmentFor(id: string, readings: Readings): SegState {
  const fm = readingFlowMode(readings);
  const result = segState(id, fm, readings.cycle, readings.mode);
  const cycle = readings.engine?.cycle;
  if (!cycle || !id.includes(':')) return result;
  const i = Number(id.split(':')[1]);
  if (!(cycle.branchMassFlowsKgs[i] > 0)) return { phase: 'idle', dir: 0, tempC: null };
  const kind = segKind(id), heating = fm === 'heating';
  let state: RefrigerantState | undefined;
  if (['gasField', 'inG'].includes(kind)) state = heating ? cycle.branchInlets[i] : cycle.branchOutlets[i];
  // Zero-length individual returns retain their own state until the header mixing node.
  if (kind === 'gasStub' && !heating && readings.fieldLines === 'idealized') state = cycle.branchOutlets[i];
  if (['liqField', 'fieldStub', 'inL'].includes(kind)) state = heating ? cycle.branchOutlets[i] : cycle.branchInlets[i];
  return state ? { ...result, phase: state.phase === 'two-phase' ? 'two' : state.phase, tempC: state.temperatureC } : result;
}

