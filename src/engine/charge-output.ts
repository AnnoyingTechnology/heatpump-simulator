import type { ChargeCandidate } from './charge.ts';
import type { CycleOutput, EngineConfig, Mode } from './types.ts';
import { Properties } from './properties.ts';

/** Presentation adapter only: storage changes prevent a quasi-steady heat/flow closure. */
export function inventoryCycle(properties: Properties, config: EngineConfig, candidate: ChargeCandidate,
  mode: Mode, dt: number): CycleOutput | null {
  const discharge = candidate.compressorDischarge;
  if (!discharge || candidate.compressorMassFlowKgs <= 0) return null;
  const ports = candidate.coilPorts, outside = ports.outdoor;
  const inlet = config.rooms.map(room => mode === 'heating' ? ports[room.id].gas : ports[room.id].small);
  const outlet = config.rooms.map(room => mode === 'heating' ? ports[room.id].small : ports[room.id].gas);
  const forward = config.rooms.map(room => ({ room, flow: (mode === 'heating' ? 1 : -1) * candidate.valveMassFlowsKgs[room.id] })).filter(stream => stream.flow > 0);
  if (!forward.length) return null;
  const flow = forward.reduce((total, stream) => total + stream.flow,0);
  const condenserOutlet = mode === 'cooling' ? outside.smallCellState : properties.ph(
    candidate.snapshot.cells.find(cell => cell.id === `${forward[0].room.id}:small`)!.state.pPa,
    forward.reduce((total,stream) => total + stream.flow * candidate.snapshot.cells.find(cell => cell.id === `${stream.room.id}:small`)!.state.hJkg,0) / flow);
  const downstreamPressure = mode === 'heating' ? outside.smallCellState.pPa : ports[forward[0].room.id].smallCellState.pPa;
  const expansionOutlet = properties.ph(downstreamPressure,condenserOutlet.hJkg);
  const branchHeat = config.rooms.map(room => -candidate.integratedCoilHeatJ[room.id] / dt);
  const outsideHeat = -candidate.integratedCoilHeatJ.outdoor / dt;
  const compressorWorkW = candidate.compressorWorkJ / dt;
  const electrical = compressorWorkW / config.compressor.driveEfficiency;
  const suction = candidate.compressorSuction;
  return {
    mode,
    evaporatingC: properties.prop('T', 'P', mode === 'heating' ? outside.gasCellState.pPa : ports[config.rooms[0].id].gasCellState.pPa, 'Q', 1) - 273.15,
    condensingC: properties.prop('T', 'P', discharge.pPa, 'Q', 0) - 273.15,
    lowPressureBarAbs: suction.pBarAbs, highPressureBarAbs: discharge.pBarAbs,
    suction, discharge,
    condenserOutlet, expansionOutlet,
    totalMassFlowKgs: candidate.compressorMassFlowKgs,
    // Each branch's gas face is authoritative; the EEV face can differ during accumulation.
    branchMassFlowsKgs: config.rooms.map(room => Math.abs(ports[room.id].gasFaceMassFlowKgs)),
    branchCoilHeatW: branchHeat, outdoorCoilHeatW: outsideHeat,
    branchInlets: inlet, branchOutlets: outlet,
    condenserHeatW: mode === 'heating' ? branchHeat.reduce((a,b) => a+b,0) : outsideHeat,
    evaporatorHeatW: mode === 'heating' ? -outsideHeat : -branchHeat.reduce((a,b) => a+b,0),
    compressorWorkW, compressorElectricalW: electrical, driveLossW: electrical - compressorWorkW,
    massResidualKgs: candidate.massResidualKg / dt,
    closureResidualW: candidate.energyResidualJ / dt, iterations: candidate.nonlinearIterations,
    lineHeatToOutdoorW: 0, pressureDropsPa: config.rooms.map(() => 0),
    transportMethod: 'Conserved inventory; idealized adiabatic field transport; finite generic accumulator restriction',
  };
}
