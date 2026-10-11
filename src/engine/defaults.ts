import type { EngineConfig, RoomConfig } from './types.ts';
import { DEFAULT_INVERTER_SLEW } from './drive.ts';
/** All internal numbers are generic modeling assumptions, never Daikin calibration. */
export function defaultRoomConfig(index = 0): RoomConfig {
  return { id: `room-${index + 1}`, enabled: true, volumeM3: 60, initialTemperatureC: 20, initialRelativeHumidity: .5,
    setpointC: 21, envelopeWK: 45, fabricCapacityJK: 4e6, airFabricWK: 250, ventilationACH: .25,
    airMassFlowKgs: .15, fanPowerW: 25, airConductanceWK: 170, refrigerantConductanceWK: 350,
    naturalAirConductanceWK: 15, metalCapacityJK: 12000,
    pipe: { lengthM: 0, gasInsideDiameterM: .010, liquidInsideDiameterM: .0048, elevationM: 0, insulationConductanceWmK: .05 } };
}
export function defaultEngineConfig(roomCount = 3): EngineConfig {
  return { fluid: 'R32', mode: 'heating', outdoorTemperatureC: 3, outdoorRelativeHumidity: .85, ambientPressurePa: 101325, indoorPortCapacity: 5,
    rooms: Array.from({ length: roomCount }, (_, i) => defaultRoomConfig(i)),
    compressor: { displacementM3rev: 22e-6, speedMinRps: 18, speedMaxRps: 75, isentropicEfficiency: .70, volumetricEfficiency: .80, driveEfficiency: .93,
      superheatK: 3, subcoolK: 1, maxDischargeC: 145, maxPressureRatio: 8 },
    outdoor: { airMassFlowKgs: .90, fanPowerW: 85, airConductanceWK: 1100, refrigerantConductanceWK: 1000,
      naturalAirConductanceWK: 35, metalCapacityJK: 28000, depositionAreaM2: 2, frostDensityKgm3: 200,
      frostConductivityWmK: .15, finGapM: .002, drainageSeconds: 30 },
    control: { strategy: 'inverter', fixedSpeedRps: 40, controlsW: 15, proportionalSpeedRpsK: 20, thermostatDeadbandK: 1, minOnSeconds: 30, minOffSeconds: 30,
      inverterRampUpRpsPerSecond: DEFAULT_INVERTER_SLEW.upRpsPerSecond, inverterRampDownRpsPerSecond: DEFAULT_INVERTER_SLEW.downRpsPerSecond,
      reversalSeconds: 3, defrostMinHeatingSeconds: 300, defrostIceThresholdKg: .15, defrostMaxSeconds: 600,
      defrostTerminationMetalC: 5, drainageDwellSeconds: 10, defrostSpeedRps: 35 },
    numerics: { maxStepSeconds: .25, pressureToleranceW: .1 } };
}
