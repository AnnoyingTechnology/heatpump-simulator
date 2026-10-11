import type { ChargeCell, ChargeGeometry, ChargeCandidate } from './charge.ts';
/** SI internally; C/bar/kW fields are explicit presentation conversions. No manufacturer calibration. */
export type Mode = 'heating' | 'cooling';
export type OperatingState = 'running' | 'idle' | 'reversing' | 'defrost' | 'draining' | 'fault';
export type Phase = 'vapor' | 'liquid' | 'two-phase';
export interface RefrigerantState { pPa: number; pBarAbs: number; hJkg: number; temperatureC: number; entropyJkgK: number; densityKgm3: number; qualityMass: number | null; phase: Phase }
export interface AbstractFluidState { update(pair: unknown, a: number, b: number): void; T(): number; p(): number; hmass(): number; smass(): number; rhomass(): number; Q(): number; cpmass(): number; viscosity(): number; speed_sound(): number; delete(): void }
export interface CoolPropModule { readonly guardedStateApi?: true; factory?(backend: string, fluid: string): AbstractFluidState; input_pairs?: Record<string, unknown>; PropsSI(output: string, key1: string, value1: number, key2: string, value2: number, fluid: string): number; HAPropsSI(output: string, key1: string, value1: number, key2: string, value2: number, key3: string, value3: number): number }
export interface RoomConfig {
  cleanFraction?: number; // Clear-passage surrogate, 0.10…1, default1.
  /** Prescribed sensible gains to room air; separate from HVAC output/electricity. Default zero. */
  internalGainW?: number;
  /** Balanced ventilation sensible effectiveness, 0…1; no vapor recovery. Omitted means zero. */
  ventilationRecoveryEfficiency?: number;
  id: string; enabled: boolean; volumeM3: number; initialTemperatureC: number; initialRelativeHumidity: number;
  setpointC: number; envelopeWK: number; fabricCapacityJK: number; airFabricWK: number; ventilationACH: number;
  volumetricAirFlowM3s?: number; airMassFlowKgs: number; fanPowerW: number; airConductanceWK: number; refrigerantConductanceWK: number;
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
    /** Initial actuator fraction only; fluid M/U are unchanged. Generic reference default .65. */
    initialValveOpening?: number;
    geometry: ChargeGeometry;
    /** An imposed local homogeneous mass-loss scenario, not an inferred hole/orifice leak. */
    leak?: { physicalCellId: string; rateKgs: number };
  };
  rooms: RoomConfig[];
  /** Effective sensible conductances between air nodes, without air/moisture transport or resolved buoyancy. */
  interzoneLinks?: { roomA: string; roomB: string; conductanceWK: number }[];
  compressor: { displacementM3rev: number; speedMinRps: number; speedMaxRps: number; isentropicEfficiency: number; volumetricEfficiency: number; driveEfficiency: number; superheatK: number; subcoolK: number; maxDischargeC: number; maxPressureRatio: number };
  outdoor: { cleanFraction?: number; volumetricAirFlowM3s?: number; airMassFlowKgs: number; fanPowerW: number; airConductanceWK: number; refrigerantConductanceWK: number; naturalAirConductanceWK: number; metalCapacityJK: number; depositionAreaM2: number; frostDensityKgm3: number; frostConductivityWmK: number; finGapM: number; drainageSeconds: number };
  control: { strategy?: 'inverter' | 'on-off'; fixedSpeedRps?: number; controlsW: number; proportionalSpeedRpsK: number;
    /** Symmetric per-room thermostat call/stop margin in either mode. */
    thermostatDeadbandK: number;
    minOnSeconds: number; minOffSeconds: number; reversalSeconds: number; defrostMinHeatingSeconds: number; defrostIceThresholdKg: number; defrostMaxSeconds: number; defrostTerminationMetalC: number; drainageDwellSeconds: number; defrostSpeedRps: number };
  numerics: { maxStepSeconds: number; pressureToleranceW: number };
}
export interface RoomState {
  /** Generic retained mist/condensate in thermal equilibrium with room gas; no wall model. */
  retainedWaterKg?: number; retainedIceKg?: number;
  dryAirMassKg: number; airEnthalpyJ: number; humidityRatio: number; fabricTemperatureC: number; metalTemperatureC: number }
export interface FilmState { massKg: number; enthalpyJ: number }
export interface FilmDerived { temperatureC: number; iceKg: number; liquidKg: number; thicknessM: number }
export interface CycleOutput {
  /** Numerical warm start only; every returned cycle still satisfies fresh EOS residuals. */
  pressureJacobian?: { mode: Mode; floatingCondenser: boolean; matrix: [number, number, number, number] };
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
  retainedWaterKg?: number; retainedIceKg?: number;
  /** Last accepted substep powers into room air; excluded from HVAC heat and COP. */
  interzoneHeatW?: number; internalGainW?: number;
  id: string; temperatureC: number; relativeHumidity: number; humidityRatio: number; fabricTemperatureC: number; metalTemperatureC: number;
  setpointC: number; active: boolean; massFlowKgs: number; signedRoomHeatW: number; sensibleRoomHeatW: number; fanPowerW: number;
  /** Comfort demand is distinct from defrost refrigerant paths and protection holds. */
  thermostatCalling?: boolean;
  /** Accepted commanded fraction of the configured high-fan airflow, before dirt. */
  fanSpeedFraction?: number;
  airOutletC: number | null; condensateKgs: number; drainEnthalpyW: number;
}
export interface InterzoneTransfer {
  roomA: string; roomB: string;
  /** Instantaneous sensible heat at accepted temperatures/canonical conductance; positive A → B. */
  heatFromAToBW: number;
}
export interface EngineOutput {
  provenance: 'live-generic-unvalidated'; simulatedSeconds: number; state: OperatingState; requestedMode: Mode; effectiveMode: Mode | null;
  cycle: CycleOutput | null; rooms: RoomOutput[];
  interzoneTransfers?: InterzoneTransfer[];
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
  energy: {
    /** Integrates requested heating: +HVAC room heat; requested cooling: -HVAC room heat.
     * Mode changes preserve service history; defrost/reversal heat of the wrong sign subtracts.
     * Excludes prescribed internal gains and interzone exchange. Session COP divides by
     * cumulative electricityJ, including fans/controls while Off; undefined at zero electricity. */
    usefulServiceHeatJ: number;
    /** Cumulative positive indoor condensate drains plus actual outdoor liquid
     * drainage; excludes retained/deposited frost, melting and evaporation. */
    drainedWaterKg: number;
    electricityJ: number; signedRoomHeatJ: number; outdoorExchangeJ: number; drainageJ: number; configurationEnergyJ: number; boundaryEnergyJ: number; storedEnergyChangeJ: number; residualJ: number; waterResidualKg: number;
  };
  diagnostics: { warnings: string[]; fault: string | null; algebraicResidualW: number; speedRps: number; demandSpeedRps: number; restartDelaySeconds: number; envelopeProtection: 'pressure ratio'|'discharge temperature'|'indoor antifreeze'|'condensing temperature'|'thermal boundary'|null; filmEnergyRateW: number; metalEnergyRateW: number };
}
