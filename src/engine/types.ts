import type { ChargeCell, ChargeGeometry, ChargeCandidate } from './charge.ts';
/** SI internally; C/bar/kW fields are explicit presentation conversions. No manufacturer calibration. */
export type Mode = 'heating' | 'cooling';
export type OperatingState = 'running' | 'idle' | 'reversing' | 'defrost' | 'draining' | 'fault';
export type Phase = 'vapor' | 'liquid' | 'two-phase';
export interface RefrigerantState { pPa: number; pBarAbs: number; hJkg: number; temperatureC: number; entropyJkgK: number; densityKgm3: number; qualityMass: number | null; phase: Phase }
export interface AbstractFluidState { update(pair: unknown, a: number, b: number): void; T(): number; p(): number; hmass(): number; smass(): number; rhomass(): number; Q(): number; cpmass(): number; viscosity(): number; speed_sound(): number; delete(): void }
export interface CoolPropModule { factory?(backend: string, fluid: string): AbstractFluidState; input_pairs?: Record<string, unknown>; PropsSI(output: string, key1: string, value1: number, key2: string, value2: number, fluid: string): number; HAPropsSI(output: string, key1: string, value1: number, key2: string, value2: number, key3: string, value3: number): number }
export interface RoomConfig {
  cleanFraction?: number; // Clear-passage surrogate, 0.10…1, default1.
  id: string; enabled: boolean; volumeM3: number; initialTemperatureC: number; initialRelativeHumidity: number;
  setpointC: number; envelopeWK: number; fabricCapacityJK: number; airFabricWK: number; ventilationACH: number;
  airMassFlowKgs: number; fanPowerW: number; airConductanceWK: number; refrigerantConductanceWK: number;
  naturalAirConductanceWK: number; metalCapacityJK: number;
  pipe: { lengthM: number; gasInsideDiameterM: number; liquidInsideDiameterM: number; elevationM: number; insulationConductanceWmK: number };
}
export interface EngineConfig {
  fluid: 'R32'; mode: Mode; outdoorTemperatureC: number; outdoorRelativeHumidity: number; ambientPressurePa: number;
  /** Declared outdoor connection count; not a thermal-capacity or calibrated performance claim. */
  indoorPortCapacity: number;
  /** Optional conserved refrigerant circuit. Omitted in the inventory-free reference model. */
  inventory?: {
    initialMassKg: number;
    initialFluidTemperatureC: number;
    geometry: ChargeGeometry;
    /** An imposed local homogeneous mass-loss scenario, not an inferred hole/orifice leak. */
    leak: { physicalCellId: string; rateKgs: number };
  };
  rooms: RoomConfig[];
  compressor: { displacementM3rev: number; speedMinRps: number; speedMaxRps: number; isentropicEfficiency: number; volumetricEfficiency: number; driveEfficiency: number; superheatK: number; subcoolK: number; maxDischargeC: number; maxPressureRatio: number };
  outdoor: { cleanFraction?: number; airMassFlowKgs: number; fanPowerW: number; airConductanceWK: number; refrigerantConductanceWK: number; naturalAirConductanceWK: number; metalCapacityJK: number; depositionAreaM2: number; frostDensityKgm3: number; frostConductivityWmK: number; finGapM: number; drainageSeconds: number };
  control: { controlsW: number; proportionalSpeedRpsK: number; thermostatDeadbandK: number; minOnSeconds: number; minOffSeconds: number; reversalSeconds: number; defrostMinHeatingSeconds: number; defrostIceThresholdKg: number; defrostMaxSeconds: number; defrostTerminationMetalC: number; drainageDwellSeconds: number; defrostSpeedRps: number };
  numerics: { maxStepSeconds: number; pressureToleranceW: number };
}
export interface RoomState { dryAirMassKg: number; airEnthalpyJ: number; humidityRatio: number; fabricTemperatureC: number; metalTemperatureC: number }
export interface FilmState { massKg: number; enthalpyJ: number }
export interface FilmDerived { temperatureC: number; iceKg: number; liquidKg: number; thicknessM: number }
export interface CycleOutput {
  mode: Mode; evaporatingC: number; condensingC: number; lowPressureBarAbs: number; highPressureBarAbs: number;
  suction: RefrigerantState; discharge: RefrigerantState; condenserOutlet: RefrigerantState; expansionOutlet: RefrigerantState;
  totalMassFlowKgs: number; branchMassFlowsKgs: number[]; branchCoilHeatW: number[]; outdoorCoilHeatW: number;
  branchInlets: RefrigerantState[]; branchOutlets: RefrigerantState[]; condenserHeatW: number; evaporatorHeatW: number;
  compressorWorkW: number; compressorElectricalW: number; driveLossW: number;
  massResidualKgs: number; closureResidualW: number; iterations: number; lineHeatToOutdoorW: number;
  pressureDropsPa: number[]; // Sum of Darcy friction contributions, excluding gravity/acceleration.
  transportMethod: string;
}
export interface RoomOutput {
  id: string; temperatureC: number; relativeHumidity: number; humidityRatio: number; fabricTemperatureC: number; metalTemperatureC: number;
  setpointC: number; active: boolean; massFlowKgs: number; signedRoomHeatW: number; sensibleRoomHeatW: number; fanPowerW: number;
  airOutletC: number | null; condensateKgs: number; drainEnthalpyW: number;
}
export interface EngineOutput {
  provenance: 'live-generic-unvalidated'; simulatedSeconds: number; state: OperatingState; requestedMode: Mode; effectiveMode: Mode | null;
  cycle: CycleOutput | null; rooms: RoomOutput[];
  inventory: {
    massKg: number; initialMassKg: number; storedInternalEnergyJ: number;
    lowLiftTransfer: boolean; compressorAdmitted: boolean; compressorMassFlowKgs: number; orientation: Mode; coilHeatW: Record<string,number>;
    leakedMassKg: number; leakedEnthalpyJ: number;
    massResidualKg: number; energyResidualJ: number;
    /** Immutable active circuit geometry; edited initialization inputs can await Restart. */
    geometry: ChargeGeometry;
    cells: ChargeCell[];
    /** Physical gas/small coil ends remain real states even without circulation. */
    coilPorts: ChargeCandidate['coilPorts'];
    fieldPorts: ChargeCandidate['fieldPorts']; headers: ChargeCandidate['headers'];
    compressorSuction: RefrigerantState | null; compressorDischarge: RefrigerantState | null;
  } | null;
  outdoor: FilmDerived & { metalTemperatureC: number; filmEnthalpyJ: number; filmMassKg: number; airOutletC: number | null; fanPowerW: number; depositionKgs: number; drainageKgs: number; meltPowerW: number };
  electrical: { compressorW: number; indoorFansW: number; outdoorFanW: number; controlsW: number; totalW: number; driveLossW: number };
  signedRoomHeatW: number; heatingCOP: number | null; coolingCOP: number | null;
  energy: { electricityJ: number; signedRoomHeatJ: number; outdoorExchangeJ: number; drainageJ: number; configurationEnergyJ: number; boundaryEnergyJ: number; storedEnergyChangeJ: number; residualJ: number; waterResidualKg: number };
  diagnostics: { warnings: string[]; fault: string | null; algebraicResidualW: number; speedRps: number; demandSpeedRps: number; restartDelaySeconds: number; envelopeProtection: 'pressure ratio'|'discharge temperature'|null; filmEnergyRateW: number; metalEnergyRateW: number };
}
