import { defaultEngineConfig, defaultRoomConfig } from '../engine/defaults.ts';
import type { EngineConfig } from '../engine/types.ts';
import type { Config } from '../types.ts';
import { outdoorPortCapacity, roomVolumeM3, interzoneConductance } from '../types.ts';

export interface LiveParameters {
  fieldLines: 'idealized' | 'physical';
  circuitModel: 'reference' | 'inventory';
  initialChargeKg: number;
  initialFluidTemperatureC: number | null;
  outdoorCoilVolumeL: number;
  indoorCoilVolumeL: number;
  accumulatorVolumeL: number;
  outdoorAirConductanceWK: number;
  outdoorRefrigerantConductanceWK: number;
  outdoorAirMassFlowKgs: number;
  depositionAreaM2: number;
  indoorAirConductanceWK: number;
  indoorRefrigerantConductanceWK: number;
  indoorAirMassFlowKgs: number;
  compressorDisplacementCm3: number;
  compressorMaxSpeedRps: number;
  cleanlinessPct: number;
  outdoorCleanlinessOverridePct: number | null;
  pipeWallThicknessMm: number;
  pipeInsulationConductanceWmK: number;
}

/** Switch only after the transport implementation and independent acceptance checks pass. */
export const PHYSICAL_FIELD_LINES_AVAILABLE = true;
/** Promoted only after coupled transient acceptance. */
export const CHARGE_MODEL_AVAILABLE = false;

/** Family minimum, not a measurement of installed copper. 15.88 mm tubing has a 1 mm minimum in the cited guide. */
export function pipeWallMmForOd(odMm: number, configuredMm: number): number {
  return Math.max(configuredMm, odMm >= 15.8 ? 1 : .8);
}

export function defaultLiveParameters(): LiveParameters {
  const c = defaultEngineConfig(1), r = c.rooms[0];
  return { fieldLines: 'idealized', circuitModel: 'reference', initialChargeKg: 1.8, initialFluidTemperatureC: null,
    outdoorCoilVolumeL: Math.PI * .006 ** 2 * 40 / 4 * 1000,
    indoorCoilVolumeL: Math.PI * .006 ** 2 * 10 / 4 * 1000, accumulatorVolumeL: .6,
    outdoorAirConductanceWK: c.outdoor.airConductanceWK,
    outdoorRefrigerantConductanceWK: c.outdoor.refrigerantConductanceWK,
    outdoorAirMassFlowKgs: c.outdoor.airMassFlowKgs, depositionAreaM2: c.outdoor.depositionAreaM2,
    indoorAirConductanceWK: r.airConductanceWK, indoorRefrigerantConductanceWK: r.refrigerantConductanceWK,
    indoorAirMassFlowKgs: r.airMassFlowKgs, compressorDisplacementCm3: c.compressor.displacementM3rev * 1e6,
    compressorMaxSpeedRps: c.compressor.speedMaxRps, cleanlinessPct: 100, outdoorCleanlinessOverridePct: null,
    pipeWallThicknessMm: .8, pipeInsulationConductanceWmK: .05 };
}

/** Manufacturer references select casings only. Every performance parameter below is a generic assumption. */
export type InventoryInitialization = Omit<NonNullable<EngineConfig['inventory']>, 'leak'>;
export function engineConfigFromUi(cfg: Config, live: LiveParameters, activeInitialization?: InventoryInitialization): EngineConfig {
  const c = defaultEngineConfig(cfg.unitCount);
  c.indoorPortCapacity = outdoorPortCapacity(cfg);
  c.mode = cfg.mode;
  c.outdoorTemperatureC = cfg.outdoorC;
  c.outdoorRelativeHumidity = cfg.outdoorRh / 100;
  c.compressor.isentropicEfficiency = cfg.etaIsPct / 100;
  c.compressor.displacementM3rev = live.compressorDisplacementCm3 * 1e-6;
  c.compressor.speedMaxRps = live.compressorMaxSpeedRps;
  c.outdoor.airConductanceWK = live.outdoorAirConductanceWK;
  c.outdoor.refrigerantConductanceWK = live.outdoorRefrigerantConductanceWK;
  c.outdoor.airMassFlowKgs = live.outdoorAirMassFlowKgs;
  c.outdoor.depositionAreaM2 = live.depositionAreaM2;
  c.outdoor.cleanFraction = (live.outdoorCleanlinessOverridePct ?? live.cleanlinessPct) / 100;
  c.rooms = cfg.rooms.slice(0, cfg.unitCount).map((r, i) => {
    const room = defaultRoomConfig(i), p = cfg.pipes[i];
    return { ...room, id: r.id, enabled: r.enabled, volumeM3: roomVolumeM3(r), initialTemperatureC: r.airC,
      setpointC: r.setpointC, envelopeWK: r.heatLossWPerK,
      internalGainW: r.internalGainW ?? 0, ventilationACH: r.ventilationACH ?? room.ventilationACH,
      airConductanceWK: live.indoorAirConductanceWK, refrigerantConductanceWK: live.indoorRefrigerantConductanceWK,
      airMassFlowKgs: live.indoorAirMassFlowKgs,
      cleanFraction: (r.cleanlinessOverridePct ?? live.cleanlinessPct) / 100,
      pipe: { ...room.pipe,
        // The idealized reference is an explicit UI choice. It makes no prediction about installed field lines.
        lengthM: live.fieldLines === 'physical' ? p.lengthM : 0,
        gasInsideDiameterM: (p.gasOdMm - 2 * pipeWallMmForOd(p.gasOdMm, live.pipeWallThicknessMm)) / 1000,
        liquidInsideDiameterM: (p.liquidOdMm - 2 * pipeWallMmForOd(p.liquidOdMm, live.pipeWallThicknessMm)) / 1000,
        insulationConductanceWmK: live.pipeInsulationConductanceWmK } };
  });
  const activeIds = new Set(c.rooms.map(r => r.id));
  c.interzoneLinks = (cfg.interzoneLinks ?? []).filter(link => activeIds.has(link.roomA) && activeIds.has(link.roomB)).map(link => ({ roomA: link.roomA, roomB: link.roomB, conductanceWK: interzoneConductance(link) }));
  if (live.circuitModel === 'inventory') {
    c.inventory = { ...(activeInitialization ?? {
      initialMassKg: live.initialChargeKg, initialFluidTemperatureC: live.initialFluidTemperatureC ?? cfg.outdoorC,
      geometry: {
        rooms: c.rooms.map((room,i) => ({ id: room.id, coilVolumeM3: live.indoorCoilVolumeL / 1000,
          refrigerantConductanceWK: room.refrigerantConductanceWK, lineLengthM: cfg.pipes[i].lengthM,
          gasInsideDiameterM: room.pipe.gasInsideDiameterM, smallInsideDiameterM: room.pipe.liquidInsideDiameterM,
          maximumValveAreaM2: 5e-7 })),
        outdoorCoilVolumeM3: live.outdoorCoilVolumeL / 1000, outdoorConductanceWK: c.outdoor.refrigerantConductanceWK,
        accumulatorVolumeM3: live.accumulatorVolumeL / 1000, accumulatorInletAreaM2: 1e-4,
        displacementM3rev: c.compressor.displacementM3rev, volumetricEfficiency: c.compressor.volumetricEfficiency,
        isentropicEfficiency: c.compressor.isentropicEfficiency, dischargeCoefficient: .65,
        superheatTargetK: c.compressor.superheatK, maximumDischargeC: c.compressor.maxDischargeC,
        maximumPressureRatio: c.compressor.maxPressureRatio,
      },
    }) };
    // This inventory formulation stores real field volume but currently idealizes its transport.
    // Reject the unsupported combination explicitly rather than ignore physical transport.
    if (live.fieldLines === 'physical') throw new Error('Physical field transport is available in the quasi-steady reference model; the conserved-inventory circuit currently requires idealized transport.');
  }
  return c;
}
