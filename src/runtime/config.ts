import { defaultEngineConfig, defaultRoomConfig } from '../engine/defaults.ts';
import type { EngineConfig } from '../engine/types.ts';
import type { Config } from '../types.ts';

export interface LiveParameters {
  fieldLines: 'idealized' | 'physical';
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

/** Family minimum, not a measurement of installed copper. 15.88 mm tubing has a 1 mm minimum in the cited guide. */
export function pipeWallMmForOd(odMm: number, configuredMm: number): number {
  return Math.max(configuredMm, odMm >= 15.8 ? 1 : .8);
}

export function defaultLiveParameters(): LiveParameters {
  const c = defaultEngineConfig(1), r = c.rooms[0];
  return { fieldLines: 'idealized', outdoorAirConductanceWK: c.outdoor.airConductanceWK,
    outdoorRefrigerantConductanceWK: c.outdoor.refrigerantConductanceWK,
    outdoorAirMassFlowKgs: c.outdoor.airMassFlowKgs, depositionAreaM2: c.outdoor.depositionAreaM2,
    indoorAirConductanceWK: r.airConductanceWK, indoorRefrigerantConductanceWK: r.refrigerantConductanceWK,
    indoorAirMassFlowKgs: r.airMassFlowKgs, compressorDisplacementCm3: c.compressor.displacementM3rev * 1e6,
    compressorMaxSpeedRps: c.compressor.speedMaxRps, cleanlinessPct: 100, outdoorCleanlinessOverridePct: null,
    pipeWallThicknessMm: .8, pipeInsulationConductanceWmK: .05 };
}

/** Manufacturer references select casings only. Every performance parameter below is a generic assumption. */
export function engineConfigFromUi(cfg: Config, live: LiveParameters): EngineConfig {
  const c = defaultEngineConfig(cfg.unitCount);
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
    return { ...room, id: r.id, volumeM3: r.volumeM3, initialTemperatureC: r.airC,
      setpointC: r.setpointC, envelopeWK: r.heatLossWPerK,
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
  return c;
}
