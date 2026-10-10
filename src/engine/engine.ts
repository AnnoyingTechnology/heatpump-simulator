import { Properties, DomainError } from './properties.ts';
import { solveCycle } from './cycle.ts';
import { ChargeCircuit, type ChargeCandidate, type ChargeBoundary, type ChargeNumerics } from './charge.ts';
import { driveStep, driveRatioThresholds, newDriveState, type DriveState } from './drive.ts';
import { inventoryCycle } from './charge-output.ts';
import { airExchange } from './air.ts';
import { deriveOutdoorFilm, filmEnthalpy, FUSION_JKG, WATER_CP_JKGK } from './film.ts';
import type { EngineConfig, EngineOutput, RoomState, RoomOutput, CycleOutput, OperatingState, Mode } from './types.ts';

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
const bounded = (x: number, low: number, high: number) => Math.max(low, Math.min(high, x));
/** Generic lumped energy/moisture model, with genuine shared-pressure EOS cycle. Not equipment calibrated. */
export class HeatPumpEngine {
  private config: EngineConfig;
  private rooms: RoomState[] = [];
  private outdoorEnergyJ = 0;
  private outdoorWaterKg = 0;
  private time = 0;
  private state: OperatingState = 'idle';
  private stateTime = 0;
  private heatingRuntime = 0;
  private onTime = 0;
  private offTime = Infinity;
  private active: boolean[] = [];
  private cycle: CycleOutput | null = null;
  private refrigerant: ChargeCircuit | null = null;
  private chargeCandidate: ChargeCandidate | null = null;
  private inventoryDrive: DriveState = newDriveState();
  private lastCycle: { evaporatingC: number; condensingC: number; condenserOutletC: number; branchMassFlowsKgs: number[]; pressureJacobian?: CycleOutput['pressureJacobian'] } | undefined;
  private fault: string | null = null;
  private initialEnergy = 0;
  private initialWater = 0;
  private boundaryWater = 0;
  private ledgers = { electricityJ: 0, signedRoomHeatJ: 0, outdoorExchangeJ: 0, drainageJ: 0, configurationEnergyJ: 0, boundaryEnergyJ: 0 };
  private lastOutput!: EngineOutput;
  private warnings: string[] = [];
  private readonly chargeNumerics: ChargeNumerics;
  constructor(private properties: Properties, config: EngineConfig, chargeNumerics:ChargeNumerics={}) {
    this.chargeNumerics=Object.freeze({...chargeNumerics});this.config = structuredClone(config); this.reset();
  }
  getConfig(): EngineConfig { return structuredClone(this.config); }
  reset(config: EngineConfig = this.config): EngineOutput {
    this.validateConfig(config); this.config = structuredClone(config);
    this.rooms = config.rooms.map(room => this.newRoom(room));
    this.outdoorWaterKg = 0; this.outdoorEnergyJ = config.outdoor.metalCapacityJK * config.outdoorTemperatureC;
    this.time = 0; this.state = 'idle'; this.stateTime = 0; this.heatingRuntime = 0; this.onTime = 0; this.offTime = Infinity;
    this.active = config.rooms.map(() => false); this.cycle = null; this.lastCycle = undefined; this.fault = null;
    this.ledgers = { electricityJ: 0, signedRoomHeatJ: 0, outdoorExchangeJ: 0, drainageJ: 0, configurationEnergyJ: 0, boundaryEnergyJ: 0 };
    this.refrigerant = config.inventory ? new ChargeCircuit(this.properties, config.inventory.geometry, { massKg: config.inventory.initialMassKg, fluidTemperatureC: config.inventory.initialFluidTemperatureC, orientation: config.mode, valveOpening: config.inventory.initialValveOpening },this.chargeNumerics) : null;
    this.chargeCandidate = null;
    this.inventoryDrive = newDriveState();
    this.boundaryWater = 0; this.initialEnergy = this.totalEnergy(); this.initialWater = this.totalWater();
    this.warnings = ['Generic component parameters and control assumptions; not manufacturer calibrated.', 'Outdoor metal and retained water/ice share one equilibrium temperature.', 'Ice sublimation is excluded; retained ice melts or receives deposition.', 'Dirt uses clear-passage scaling of air flow/air-side conductance; forced fan power is constant without a measured fan curve.', ...(this.refrigerant ? ['Conserved R32 charge uses three bulk refrigerant cells per coil, shared outdoor/indoor pressures and a finite accumulator restriction; internal geometry and EEV/compressor maps are generic assumptions.', 'Field lines store actual refrigerant volume but are hydraulically idealized and adiabatic; friction, ambient line heat, elevation, slip and oil are excluded in this formulation.', 'Superheat is controlled by finite EEV movement; subcooling and exchanged heat emerge from the stored charge, rather than fixed charge multipliers.', 'Generic inverter control starts at minimum speed, holds 10 s, then accelerates at 0.5 rps/s; pressure/temperature supervision and restart dwell override demand. Stopped discharge predictions are control estimates, not sensor states.'] : ['Pipe model assumes smooth copper, homogeneous two-phase flow and outdoor ambient along the whole field line; slip, fittings and oil are excluded.', 'Idealized parallel indoor coils use generic UA-proportional refrigerant flow and actual branch outlets; the mixed header meets the shared outlet target. Physical field-line heating retains per-branch subcooling control.', 'Generic inverter startup, ramp, envelope supervision and restart dwell override demand; stopped forecasts are control estimates, not sensor states.'])];
    this.lastOutput = this.makeOutput(this.passiveRoomOutputs(), null, 0, 0, 0, null, 0, 0); return this.snapshot();
  }
  /** Preserve local temperatures/RH and outdoor ice through structural edits, account inventory impulses explicitly.
   * Initial temperature/RH values apply on reset only; newly added rooms use their own initial values. */
  updateConfig(config: EngineConfig): EngineOutput {
    this.validateConfig(config);
    if (JSON.stringify(config.inventory && { ...config.inventory, leak: undefined }) !== JSON.stringify(this.config.inventory && { ...this.config.inventory, leak: undefined })) throw new DomainError('Charge initialization/geometry changes require Restart');
    const beforeEnergy = this.totalEnergy(), beforeWater = this.totalWater(), old = this.config;
    const priorActive = new Map(old.rooms.map((room, i) => [room.id, this.active[i]]));
    const oldStates = new Map(old.rooms.map((room, i) => [room.id, { state: this.rooms[i], config: room }]));
    const previousOutdoor = deriveOutdoorFilm(this.outdoorEnergyJ, this.outdoorWaterKg, old.outdoor);
    this.rooms = config.rooms.map(room => {
      const previous = oldStates.get(room.id); if (!previous) return this.newRoom(room, config.ambientPressurePa);
      const state = { ...previous.state };
      const currentC = this.properties.airT(state.airEnthalpyJ / state.dryAirMassKg, state.humidityRatio, old.ambientPressurePa);
      if (room.volumeM3 !== previous.config.volumeM3) state.dryAirMassKg = room.volumeM3 / this.properties.dryAirSpecificVolume(currentC, state.humidityRatio, config.ambientPressurePa);
      state.airEnthalpyJ = state.dryAirMassKg * this.properties.airH(currentC, state.humidityRatio, config.ambientPressurePa);
      return state;
    });
    this.outdoorEnergyJ += (config.outdoor.metalCapacityJK - old.outdoor.metalCapacityJK) * previousOutdoor.temperatureC;
    this.config = structuredClone(config); this.active = config.rooms.map(room => room.enabled && (priorActive.get(room.id) ?? false));
    const energyImpulse = this.totalEnergy() - beforeEnergy, waterImpulse = this.totalWater() - beforeWater;
    this.ledgers.boundaryEnergyJ += energyImpulse; this.ledgers.configurationEnergyJ += energyImpulse; this.boundaryWater += waterImpulse;
    if (Math.abs(energyImpulse) > 1e-5 || Math.abs(waterImpulse) > 1e-10) this.warnings.push('Scenario edit added/removed stored energy and water; recorded as a configuration boundary impulse.');
    if (config.mode !== old.mode) { this.state = 'reversing'; this.stateTime = 0; this.cycle = null; this.lastCycle = undefined; }
    this.fault = null; if (this.state === 'fault') { this.state = 'idle'; this.offTime = Infinity; }
    if (!config.rooms.some(room => room.enabled)) this.abortUnavailableCircuit();
    this.lastOutput = this.makeOutput(this.passiveRoomOutputs(), null, 0, 0, 0, null, 0, 0); return this.snapshot();
  }
  snapshot(): EngineOutput { return structuredClone(this.lastOutput); }
  step(simulatedSeconds: number): EngineOutput {
    if (!(Number.isFinite(simulatedSeconds) && simulatedSeconds >= 0 && simulatedSeconds <= 60)) throw new DomainError('step requires finite 0…60 simulated seconds; caller supplies bounded time accumulator');
    let remaining = simulatedSeconds;
    while (remaining > 1e-10 && this.state !== 'fault') {
      const dt = Math.min(remaining, this.config.numerics.maxStepSeconds, this.refrigerant ? .25 : .5);
      const checkpoint = this.checkpoint();
      try { this.advance(dt); } catch (error) { this.restoreCheckpoint(checkpoint); this.fault = error instanceof Error ? error.message : 'Physics failed'; this.state = 'fault'; this.cycle = null;
        let stopped: RoomOutput[];
        try { stopped = this.passiveRoomOutputs(); }
        catch { stopped = this.lastOutput.rooms.map(room => ({ ...room, active: false, massFlowKgs: 0, signedRoomHeatW: 0, sensibleRoomHeatW: 0, fanPowerW: 0, airOutletC: null, condensateKgs: 0, drainEnthalpyW: 0 })); }
        this.lastOutput = this.makeOutput(stopped, null, 0, 0, 0, null, 0, 0); }
      remaining -= dt;
    }
    return this.snapshot();
  }
  /** Fluid, thermal stores, controls, timers and diagnostics form one accepted transaction. */
  private checkpoint() {
    return { rooms: this.rooms, outdoorEnergyJ: this.outdoorEnergyJ, outdoorWaterKg: this.outdoorWaterKg,
      time: this.time, state: this.state, stateTime: this.stateTime, heatingRuntime: this.heatingRuntime,
      onTime: this.onTime, offTime: this.offTime, active: [...this.active], cycle: this.cycle,
      lastCycle: this.lastCycle, ledgers: { ...this.ledgers }, boundaryWater: this.boundaryWater,
      chargeCandidate: this.chargeCandidate, inventoryDrive: {...this.inventoryDrive}, fluid: this.refrigerant?.snapshot(), lastOutput: this.lastOutput };
  }
  private restoreCheckpoint(saved: ReturnType<HeatPumpEngine['checkpoint']>): void {
    const { fluid, ...values } = saved;
    Object.assign(this, values);
    if (fluid) this.refrigerant!.restore(fluid);
  }
  private newRoom(room: EngineConfig['rooms'][number], p = this.config.ambientPressurePa): RoomState {
    const w = this.properties.airW(room.initialTemperatureC, room.initialRelativeHumidity, p), mass = room.volumeM3 / this.properties.dryAirSpecificVolume(room.initialTemperatureC, w, p);
    return { dryAirMassKg: mass, airEnthalpyJ: mass * this.properties.airH(room.initialTemperatureC, w, p), humidityRatio: w, fabricTemperatureC: room.initialTemperatureC, metalTemperatureC: room.initialTemperatureC };
  }
  private validateConfig(config: EngineConfig): void {
    const initialValve=config.inventory?.initialValveOpening;
    if(initialValve!==undefined&&(!Number.isFinite(initialValve)||initialValve<0||initialValve>1))throw new DomainError('Initial EEV opening must be finite in [0,1]');
    if (config.mode !== 'heating' && config.mode !== 'cooling') throw new DomainError('Unsupported operating mode');
    if (config.fluid !== 'R32') throw new DomainError('Only R32 has implemented live model coverage');
    if (!(Number.isFinite(config.indoorPortCapacity) && Number.isInteger(config.indoorPortCapacity) && config.indoorPortCapacity > 0)) throw new DomainError('Declared indoor port capacity must be a positive finite integer');
    if (config.rooms.length < 1 || config.rooms.length > config.indoorPortCapacity) throw new DomainError('Room count must be at least one and within declared indoor port capacity');
    if (new Set(config.rooms.map(r => r.id)).size !== config.rooms.length) throw new DomainError('Room IDs must be unique');
    if (config.outdoorTemperatureC < -25 || config.outdoorTemperatureC > 45 || config.outdoorRelativeHumidity < 0 || config.outdoorRelativeHumidity > 1) throw new DomainError('Outdoor inputs outside supported −25…45°C /0…100% RH domain');
    if (config.ambientPressurePa < 70000 || config.ambientPressurePa > 110000) throw new DomainError('Ambient pressure outside supported psychrometric domain');
    const c = config.compressor;
    for (const efficiency of [c.isentropicEfficiency, c.volumetricEfficiency, c.driveEfficiency]) if (!(efficiency > 0 && efficiency <= 1)) throw new DomainError('Efficiencies must be greater than zero and at most one');
    if (!(c.superheatK > 0 && c.subcoolK > 0 && c.displacementM3rev > 0 && c.speedMinRps > 0 && c.speedMaxRps >= c.speedMinRps)) throw new DomainError('Compressor/idealized control parameters outside domain');
    if (!(config.numerics.maxStepSeconds > 0 && config.numerics.maxStepSeconds <= .5)) throw new DomainError('Maximum physics step must be in (0,.5] seconds');
    const ctl = config.control;
    if (!(ctl.controlsW >= 0 && ctl.proportionalSpeedRpsK >= 0 && ctl.thermostatDeadbandK >= 0 && ctl.defrostSpeedRps > 0 && ctl.defrostSpeedRps <= c.speedMaxRps && ctl.defrostIceThresholdKg > 0 && ctl.defrostMaxSeconds > 0 && ctl.defrostTerminationMetalC >= 0 && config.numerics.pressureToleranceW > 0 && config.numerics.pressureToleranceW <= 1 && c.maxPressureRatio > 1 && c.maxDischargeC > 0 && c.maxDischargeC <= 160)) throw new DomainError('Control powers/thresholds outside domain');
    for (const duration of [ctl.minOnSeconds, ctl.minOffSeconds, ctl.reversalSeconds, ctl.defrostMinHeatingSeconds, ctl.drainageDwellSeconds]) if (duration < 0) throw new DomainError('Control times must be nonnegative');
    const o = config.outdoor;
    if (!((o.cleanFraction ?? 1) >= .1 && (o.cleanFraction ?? 1) <= 1)) throw new DomainError('Outdoor clear passage must be 0.1…1');
    if (o.fanPowerW < 0) throw new DomainError('Outdoor fan power must be nonnegative');
    if (!(o.metalCapacityJK > 0 && o.airMassFlowKgs > 0 && o.refrigerantConductanceWK > 0 && o.airConductanceWK >= 0 && o.naturalAirConductanceWK >= 0 && o.depositionAreaM2 > 0 && o.frostDensityKgm3 > 0 && o.frostDensityKgm3 < 917 && o.frostConductivityWmK > 0 && o.finGapM > 0 && o.drainageSeconds > 0)) throw new DomainError('Outdoor physical parameters outside domain');
    for (const room of config.rooms) {
      if (!((room.cleanFraction ?? 1) >= .1 && (room.cleanFraction ?? 1) <= 1)) throw new DomainError('Indoor clear passage must be 0.1…1');
      if (!(room.pipe.lengthM >= 0 && room.pipe.lengthM <= 50 && Math.abs(room.pipe.elevationM) <= room.pipe.lengthM && room.pipe.insulationConductanceWmK >= 0)) throw new DomainError('Pipe parameters outside domain');
      if (!(room.volumeM3 > 0 && room.fabricCapacityJK > 0 && room.metalCapacityJK > 0 && room.airFabricWK >= 0 && room.envelopeWK >= 0 && room.ventilationACH >= 0 && room.airMassFlowKgs > 0 && room.airConductanceWK >= 0 && room.refrigerantConductanceWK > 0 && room.naturalAirConductanceWK >= 0 && room.fanPowerW >= 0)) throw new DomainError(`Room ${room.id} physical parameters outside domain`);
    }
    if (config.inventory && (config.inventory.geometry.rooms.length !== config.rooms.length || config.rooms.some((r,i) => r.id !== config.inventory!.geometry.rooms[i].id))) throw new DomainError('Inventory and room topology must agree');
    // Reject nonfinite configuration values recursively; JSON null/NaN cannot become plausible physics.
    const finite = (value: unknown): void => { if (typeof value === 'number' && !Number.isFinite(value)) throw new DomainError('Nonfinite scenario parameter'); if (value && typeof value === 'object') for (const v of Object.values(value)) finite(v); }; finite(config);
  }
  private totalEnergy(): number { return (this.refrigerant?.snapshot().cells.reduce((total, cell) => total + cell.internalEnergyJ, 0) ?? 0) + this.outdoorEnergyJ + sum(this.rooms.map((room, i) => room.airEnthalpyJ + this.config.rooms[i].fabricCapacityJK * room.fabricTemperatureC + this.config.rooms[i].metalCapacityJK * room.metalTemperatureC)); }
  private totalWater(): number { return this.outdoorWaterKg + sum(this.rooms.map(room => room.dryAirMassKg * room.humidityRatio)); }
  private passiveRoomOutputs(): RoomOutput[] {
    return this.rooms.map((room, i) => { const c = this.config.rooms[i], t = this.properties.airT(room.airEnthalpyJ / room.dryAirMassKg, room.humidityRatio, this.config.ambientPressurePa);
      return { id: c.id, temperatureC: t, relativeHumidity: this.properties.airRH(t, room.humidityRatio, this.config.ambientPressurePa), humidityRatio: room.humidityRatio, fabricTemperatureC: room.fabricTemperatureC, metalTemperatureC: room.metalTemperatureC,
        setpointC: c.setpointC, active: false, massFlowKgs: 0, signedRoomHeatW: 0, sensibleRoomHeatW: 0, fanPowerW: 0, airOutletC: null, condensateKgs: 0, drainEnthalpyW: 0 }; });
  }
  private transition(state: OperatingState): void { this.state = state; this.stateTime = 0; this.lastCycle = undefined; }
  /** User Off removes every refrigerant path, including during reversal/defrost.
   * Passive heat/moisture exchange continues; no stored inventory is reset. */
  private abortUnavailableCircuit(): void {
    if (this.state !== 'idle') {
      if (this.state === 'draining') this.heatingRuntime = 0;
      this.transition('idle'); this.offTime = 0;
    }
    this.onTime = 0; this.active = this.config.rooms.map(() => false); this.cycle = null;
    this.inventoryDrive.speedRps=0;this.inventoryDrive.startupSeconds=0;
  }
  private advance(dt: number): void {
    const config = this.config, outdoor = config.outdoor, p = config.ambientPressurePa;
    const previousDriveOffSeconds=this.inventoryDrive.offSeconds;
    const before = deriveOutdoorFilm(this.outdoorEnergyJ, this.outdoorWaterKg, outdoor);
    const tRooms = this.rooms.map(r => this.properties.airT(r.airEnthalpyJ / r.dryAirMassKg, r.humidityRatio, p));
    const previousActive = [...this.active];
    const errors = config.rooms.map((room, i) => config.mode === 'heating' ? room.setpointC - tRooms[i] : tRooms[i] - room.setpointC);
    this.active = config.rooms.map((room, i) => room.enabled && errors[i] > (this.active[i] ? -config.control.thermostatDeadbandK : config.control.thermostatDeadbandK));
    if (!config.rooms.some(room => room.enabled)) this.abortUnavailableCircuit();
    if (this.state === 'reversing' && this.stateTime >= config.control.reversalSeconds) this.transition(config.mode === 'heating' && before.iceKg > config.control.defrostIceThresholdKg ? 'defrost' : 'idle');
    if (this.state === 'draining' && this.stateTime >= config.control.drainageDwellSeconds) { this.transition('reversing'); this.heatingRuntime = 0; }
    if (this.state === 'defrost') {
      this.active = config.rooms.map(room => room.enabled);
      if (before.iceKg < 1e-6 && before.temperatureC >= config.control.defrostTerminationMetalC) this.transition('draining');
      else if (this.stateTime >= config.control.defrostMaxSeconds) throw new DomainError('Defrost timeout: retained ice/energy conserved; generic source cannot finish');
    }
    if (this.state === 'running' && config.mode === 'heating' && before.iceKg >= config.control.defrostIceThresholdKg && this.heatingRuntime >= config.control.defrostMinHeatingSeconds) this.transition('reversing');
    if (this.state === 'idle' && this.active.some(Boolean) && this.offTime >= config.control.minOffSeconds) {
      // Retained frost after an Off override may still require reverse defrost.
      // Do not briefly start a forced heating cycle against an obstructed coil.
      const frostPending = config.mode === 'heating' && before.iceKg >= config.control.defrostIceThresholdKg && this.heatingRuntime >= config.control.defrostMinHeatingSeconds;
      this.transition(frostPending ? 'reversing' : 'running');
    }
    if (this.state === 'running' && !this.active.some(Boolean) && this.onTime < config.control.minOnSeconds) this.active = previousActive.map((active, i) => active && config.rooms[i].enabled);
    // A soft thermostat crossing can retain an enabled prior path for minimum-on.
    // Explicit Off may remove that last path even while other rooms remain enabled.
    if (this.state === 'running' && !this.active.some(Boolean)) { this.transition('idle'); this.offTime = 0; }
    const running = this.state === 'running' && this.active.some(Boolean), defrost = this.state === 'defrost';
    const effectiveMode: Mode | null = running ? config.mode : defrost ? 'cooling' : null;
    const activeErrors = errors.filter((_, i) => this.active[i]);
    const demandSpeed = defrost ? config.control.defrostSpeedRps : running ? bounded(config.compressor.speedMinRps + config.control.proportionalSpeedRpsK * Math.max(0, ...activeErrors), config.compressor.speedMinRps, config.compressor.speedMaxRps) : 0;
    let speed=demandSpeed;
    let cycle: CycleOutput | null = null;
    let charge: ChargeCandidate | null = null;
    if (this.refrigerant) {
      const orientation=effectiveMode ?? (this.state === 'reversing' && config.mode === 'heating' && before.iceKg >= config.control.defrostIceThresholdKg ? 'cooling' : config.mode);
      const physical=this.refrigerant.snapshot();
      const accumulator=physical.cells.find(cell=>cell.group==='accumulator')!.state;
      const destination=physical.cells.find(cell=>cell.group===(orientation==='heating'?'indoor':'outdoor'))!.state;
      let vaporFraction=accumulator.phase==='vapor'?1:0;
      if(accumulator.qualityMass!==null) {
        const x=accumulator.qualityMass,rv=this.properties.prop('D','P',accumulator.pPa,'Q',1),rl=this.properties.prop('D','P',accumulator.pPa,'Q',0);
        vaporFraction=(x/rv)/(x/rv+(1-x)/rl);
      }
      const pickupAvailable=physical.compressorAdmission?vaporFraction>.0200001:vaporFraction>=.0399999;
      let predictedDischargeC:number|null=null;
      if(pickupAvailable) {
        const suction=accumulator.qualityMass===null?accumulator:this.properties.ph(accumulator.pPa,this.properties.saturation(accumulator.pPa).vaporH);
        const h=destination.pPa<=suction.pPa?suction.hJkg:suction.hJkg+
          (this.properties.prop('H','P',destination.pPa,'S',suction.entropyJkgK)-suction.hJkg)/config.compressor.isentropicEfficiency;
        // An envelope prediction is not a materialized stopped discharge sensor.
        predictedDischargeC=this.properties.prop('T','P',destination.pPa,'H',h)-273.15;
      }
      this.inventoryDrive=driveStep(this.inventoryDrive,dt,{demandRps:demandSpeed,
        minimumRps:config.compressor.speedMinRps,maximumRps:config.compressor.speedMaxRps,
        maximumRatio:config.compressor.maxPressureRatio,maximumDischargeC:config.compressor.maxDischargeC,
        minimumOffSeconds:config.control.minOffSeconds,pressureRatio:destination.pPa/accumulator.pPa,
        predictedDischargeC,pickupAvailable});
      speed=this.inventoryDrive.speedRps;
      const boundary:ChargeBoundary={
        orientation,
        compressorSpeedRps: speed, enabledRoomIds: config.rooms.filter((_,i) => this.active[i]).map(room => room.id),
        outdoorMetalC: before.temperatureC, indoorMetalCById: Object.fromEntries(config.rooms.map((room,i) => [room.id,this.rooms[i].metalTemperatureC])),
        leak: config.inventory!.leak, ambientPressurePa: p, operating: { outdoorConductanceWK: outdoor.refrigerantConductanceWK,
          indoorConductanceWKById: Object.fromEntries(config.rooms.map(room => [room.id,room.refrigerantConductanceWK])),
          displacementM3rev: config.compressor.displacementM3rev, volumetricEfficiency: config.compressor.volumetricEfficiency,
          isentropicEfficiency: config.compressor.isentropicEfficiency, superheatTargetK: config.compressor.superheatK,
          maximumDischargeC: config.compressor.maxDischargeC, maximumPressureRatio: config.compressor.maxPressureRatio } };
      charge = this.refrigerant.prepareStep(dt,boundary);
      // Forecast feedback: reject a feasible control proposal that crosses the
      // supervisor's stop threshold, then prepare a passive interval from the
      // unchanged circuit. Unexplained solver errors still propagate as faults.
      const discharge=charge.compressorDischarge;
      if(discharge&&(discharge.pPa/charge.compressorSuction.pPa>=driveRatioThresholds(config.compressor.maxPressureRatio).stop||
        discharge.temperatureC>=config.compressor.maxDischargeC-10)) {
        this.inventoryDrive={speedRps:0,startupSeconds:0,offSeconds:dt,
          protection:discharge.temperatureC>=config.compressor.maxDischargeC-10?'discharge temperature':'pressure ratio'};
        speed=0;charge=this.refrigerant.prepareStep(dt,{...boundary,compressorSpeedRps:0});
      }
      if (effectiveMode) cycle = inventoryCycle(this.properties, config, charge, effectiveMode, dt);
    } else {
      const proposal = (rps: number) => solveCycle(this.properties, config, { mode: effectiveMode!,
        indoorMetalC: this.rooms.map(room => room.metalTemperatureC), outdoorMetalC: before.temperatureC,
        active: this.active, speedRps: rps, defrost, previous: this.lastCycle });
      // Reference pressures are quasi-steady, not stored stopped sensor states.
      // Predict a restart at minimum speed from the current thermal boundaries;
      // a stale hot discharge would otherwise keep its protection latched forever.
      const observed = effectiveMode && this.cycle?.mode === effectiveMode && this.active.every((enabled,i)=>enabled === (this.cycle!.branchMassFlowsKgs[i] > 0)) ? this.cycle : null;
      const forecast = effectiveMode && !observed ? proposal(config.compressor.speedMinRps) : null;
      const feedback = observed ?? forecast;
      this.inventoryDrive = driveStep(this.inventoryDrive, dt, { demandRps: demandSpeed,
        minimumRps: config.compressor.speedMinRps, maximumRps: config.compressor.speedMaxRps,
        maximumRatio: config.compressor.maxPressureRatio, maximumDischargeC: config.compressor.maxDischargeC,
        minimumOffSeconds: config.control.minOffSeconds,
        pressureRatio: feedback ? feedback.highPressureBarAbs / feedback.lowPressureBarAbs : 1,
        predictedDischargeC: feedback?.discharge.temperatureC ?? null, pickupAvailable: !!effectiveMode });
      speed = this.inventoryDrive.speedRps;
      if (effectiveMode && speed > 0) {
        cycle = forecast && speed === config.compressor.speedMinRps ? forecast : proposal(speed);
        // Only an independently closed, in-domain cycle is envelope evidence.
        // Solver failures propagate; no arbitrary lower-speed retry hides them.
        if (cycle.discharge.temperatureC >= config.compressor.maxDischargeC - 10 ||
          cycle.highPressureBarAbs / cycle.lowPressureBarAbs >= driveRatioThresholds(config.compressor.maxPressureRatio).stop) {
          this.inventoryDrive = { speedRps: 0, startupSeconds: 0, offSeconds: dt,
            protection: cycle.discharge.temperatureC >= config.compressor.maxDischargeC - 10 ? 'discharge temperature' : 'pressure ratio' };
          speed = 0; cycle = null; this.lastCycle = undefined;
        } else this.lastCycle = { evaporatingC: cycle.evaporatingC, condensingC: cycle.condensingC,
          condenserOutletC: cycle.condenserOutlet.temperatureC, branchMassFlowsKgs: cycle.branchMassFlowsKgs,
          pressureJacobian: cycle.pressureJacobian };
      }
    }
    const outW = this.properties.airW(config.outdoorTemperatureC, config.outdoorRelativeHumidity, p), outH = this.properties.airH(config.outdoorTemperatureC, outW, p);
    const outputs: RoomOutput[] = [];
    let roomPower = 0, indoorFans = 0, indoorDrain = 0, ventilationEnergy = 0, envelopeEnergy = 0, roomWaterBoundary = 0, indoorMetalRate = 0;
    // Compute all candidate states transactionally before accepting the substep.
    const candidateRooms = this.rooms.map((room, i) => {
      const c = config.rooms[i], forced = running && this.active[i], fan = forced ? c.fanPowerW : 0;
      const clear = c.cleanFraction ?? 1;
      const md = (forced ? c.airMassFlowKgs : Math.max(.005, c.naturalAirConductanceWK / 1006)) * clear;
      const air = airExchange(this.properties, tRooms[i], room.humidityRatio, room.metalTemperatureC, md,
        (forced ? c.airConductanceWK : c.naturalAirConductanceWK) * clear, p, 0, true);
      const useful = air.signedHeatToAirW + fan, ventilation = room.dryAirMassKg * c.ventilationACH / 3600;
      const qFabric = c.airFabricWK * (room.fabricTemperatureC - tRooms[i]);
      // Simple envelope maps entirely to the air node; H is distinct from fabric coupling and ventilation.
      const qEnvelope = c.envelopeWK * (config.outdoorTemperatureC - tRooms[i]);
      const qVent = ventilation * (outH - room.airEnthalpyJ / room.dryAirMassKg);
      const waterVent = ventilation * (outW - room.humidityRatio);
      const qRef = charge ? -charge.integratedCoilHeatJ[c.id] / dt : cycle?.branchCoilHeatW[i] ?? 0;
      const metalRate = qRef + air.heatFromAirW - air.drainEnthalpyW;
      const next: RoomState = { ...room, airEnthalpyJ: room.airEnthalpyJ + dt * (useful + qFabric + qEnvelope + qVent),
        humidityRatio: room.humidityRatio + dt * (waterVent - air.waterToSurfaceKgs) / room.dryAirMassKg,
        fabricTemperatureC: room.fabricTemperatureC - dt * qFabric / c.fabricCapacityJK,
        metalTemperatureC: room.metalTemperatureC + dt * metalRate / c.metalCapacityJK };
      const nextT = this.properties.airT(next.airEnthalpyJ / next.dryAirMassKg, next.humidityRatio, p), nextRH = this.properties.airRH(nextT, next.humidityRatio, p);
      if (next.humidityRatio < 0 || nextRH > 1 + 1e-7) throw new DomainError(`Room ${c.id} supersaturation/negative water inventory outside model domain`);
      const outlet = forced ? this.properties.airT(this.properties.airH(air.outletC, air.outletHumidityRatio, p) + fan / md, air.outletHumidityRatio, p) : null;
      outputs.push({ id: c.id, temperatureC: nextT, relativeHumidity: nextRH, humidityRatio: next.humidityRatio, fabricTemperatureC: next.fabricTemperatureC, metalTemperatureC: next.metalTemperatureC,
        setpointC: c.setpointC, active: running && this.active[i], massFlowKgs: cycle?.branchMassFlowsKgs[i] ?? 0, signedRoomHeatW: useful, sensibleRoomHeatW: air.sensibleToAirW + fan,
        fanPowerW: fan, airOutletC: outlet, condensateKgs: Math.max(0, air.waterToSurfaceKgs), drainEnthalpyW: air.drainEnthalpyW });
      roomPower += useful; indoorFans += fan; indoorDrain += air.drainEnthalpyW; ventilationEnergy += qVent; envelopeEnergy += qEnvelope;
      roomWaterBoundary += waterVent - air.waterToSurfaceKgs; indoorMetalRate += metalRate;
      return next;
    });
    const forcedOutside = running;
    const blockage = bounded(before.thicknessM / outdoor.finGapM, 0, 1); // generic fin-passage geometry, not resolved bridging.
    const clear = (outdoor.cleanFraction ?? 1) * (1 - blockage);
    if (forcedOutside && clear === 0) throw new DomainError('Outdoor frost fully obstructs forced airflow; defrost control did not clear the passage');
    const resistance = before.thicknessM / (outdoor.frostConductivityWmK * outdoor.depositionAreaM2 * (outdoor.cleanFraction ?? 1));
    const uaAir = forcedOutside ? 1 / (1 / Math.max(outdoor.airConductanceWK * clear, 1e-12) + resistance) : outdoor.naturalAirConductanceWK * (outdoor.cleanFraction ?? 1);
    const mdOut = forcedOutside ? outdoor.airMassFlowKgs * clear : Math.max(.005, outdoor.naturalAirConductanceWK / 1006) * (outdoor.cleanFraction ?? 1);
    const fanOutside = forcedOutside ? outdoor.fanPowerW : 0;
    const drain = Math.min(before.liquidKg / outdoor.drainageSeconds, before.liquidKg / dt);
    const evaporationAvailable = Math.max(0, before.liquidKg - drain * dt) / dt;
    const outdoorAir = airExchange(this.properties, config.outdoorTemperatureC, outW, before.temperatureC, mdOut, uaAir, p, evaporationAvailable, false);
    const candidateMass = outdoorAir.evaporationLimited ? before.iceKg : (this.outdoorWaterKg - dt * drain) + dt * outdoorAir.waterToSurfaceKgs;
    if (candidateMass < -1e-12) throw new DomainError('Outdoor film water exhausted inside substep');
    const drainEnergy = drain * WATER_CP_JKGK * before.temperatureC;
    const outdoorRate = (charge ? -charge.integratedCoilHeatJ.outdoor / dt : cycle?.outdoorCoilHeatW ?? 0) + outdoorAir.heatFromAirW - drainEnergy;
    const candidateEnergy = this.outdoorEnergyJ + dt * outdoorRate;
    const after = deriveOutdoorFilm(candidateEnergy, candidateMass, outdoor);
    const work = charge ? charge.compressorWorkJ / dt : cycle?.compressorWorkW ?? 0;
    const compElectric = work / config.compressor.driveEfficiency, driveLoss = compElectric - work;
    const electric = compElectric + indoorFans + fanOutside + config.control.controlsW;
    const outward = outdoorAir.signedHeatToAirW + (cycle?.lineHeatToOutdoorW ?? 0) + fanOutside + driveLoss + config.control.controlsW;
    const filmRate = (filmEnthalpy(candidateEnergy, after.temperatureC, outdoor.metalCapacityJK) - filmEnthalpy(this.outdoorEnergyJ, before.temperatureC, outdoor.metalCapacityJK)) / dt;
    const outMetalRate = outdoor.metalCapacityJK * (after.temperatureC - before.temperatureC) / dt;
    const meltedKg = Math.max(0, before.iceKg - after.iceKg); // diagnostic only; evolution is determined by energy, never by this value.
    const outdoorOutlet = forcedOutside ? this.properties.airT(this.properties.airH(outdoorAir.outletC, outdoorAir.outletHumidityRatio, p) + fanOutside / mdOut, outdoorAir.outletHumidityRatio, p) : null;
    // Accept the fluid only after every air/metal/film candidate has passed its domain checks.
    if (charge) { this.refrigerant!.commit(charge); this.chargeCandidate = charge; }
    this.rooms = candidateRooms; this.outdoorWaterKg = candidateMass; this.outdoorEnergyJ = candidateEnergy; this.cycle = cycle;
    this.time += dt; this.stateTime += dt;
    const compressorRan=charge?charge.compressorMassFlowKgs>0||charge.compressorWorkJ>0:!!cycle;
    if (compressorRan) {
      this.onTime += dt;this.offTime=0;
      this.inventoryDrive.offSeconds=0;
    } else {
      this.offTime += dt;this.onTime=0;
      if(charge) {
        this.inventoryDrive.offSeconds=previousDriveOffSeconds+dt;
        this.inventoryDrive.speedRps=0;this.inventoryDrive.startupSeconds=0;
      }
    }
    if (running && config.mode === 'heating' && compressorRan) this.heatingRuntime += dt;
    this.ledgers.electricityJ += electric * dt; this.ledgers.signedRoomHeatJ += roomPower * dt;
    this.ledgers.outdoorExchangeJ += outward * dt; this.ledgers.drainageJ += (indoorDrain + drainEnergy) * dt;
    this.ledgers.boundaryEnergyJ += dt * (electric - outward - indoorDrain - drainEnergy + ventilationEnergy + envelopeEnergy) - (charge?.leakEnthalpyJ ?? 0);
    this.boundaryWater += dt * (roomWaterBoundary + outdoorAir.waterToSurfaceKgs - drain);
    this.lastOutput = this.makeOutput(outputs, cycle, indoorFans, fanOutside, roomPower, outdoorOutlet,
      outdoorAir.waterToSurfaceKgs, drain, meltedKg * FUSION_JKG / dt, speed, filmRate, indoorMetalRate + outMetalRate, charge ? work : undefined, demandSpeed);
  }
  private inventoryOutput(): EngineOutput['inventory'] {
    if (!this.refrigerant) return null;
    const snapshot = this.refrigerant.snapshot(), cells = snapshot.cells;
    const ports = this.chargeCandidate?.coilPorts ?? Object.fromEntries(['outdoor', ...this.config.rooms.map(room => room.id)].map(id => {
      const gas = cells.find(cell => cell.id === (id === 'outdoor' ? 'outdoor:0' : `${id}:coil:0`))!.state;
      const small = cells.find(cell => cell.id === (id === 'outdoor' ? 'outdoor:2' : `${id}:coil:2`))!.state;
      return [id, { gas, small, gasCellState: gas, smallCellState: small, gasFaceMassFlowKgs: 0, smallFaceMassFlowKgs: 0, flowFromGasKgs: 0 }];
    }));
    return { massKg: sum(cells.map(cell => cell.massKg)), initialMassKg: snapshot.initialMassKg,
      storedInternalEnergyJ: sum(cells.map(cell => cell.internalEnergyJ)),
      lowLiftTransfer: this.chargeCandidate?.lowLiftTransfer ?? false, compressorAdmitted: snapshot.compressorAdmission, compressorMassFlowKgs: this.chargeCandidate?.compressorMassFlowKgs ?? 0, orientation: snapshot.orientation, coilHeatW: Object.fromEntries(Object.entries(this.chargeCandidate?.integratedCoilHeatJ ?? {}).map(([id,energy]) => [id,-energy / this.chargeCandidate!.acceptedSeconds])),
      leakedMassKg: snapshot.leakedMassKg, leakedEnthalpyJ: snapshot.leakedEnthalpyJ,
      massResidualKg: sum(cells.map(cell => cell.massKg)) - snapshot.initialMassKg + snapshot.leakedMassKg,
      energyResidualJ: sum(cells.map(cell => cell.internalEnergyJ)) - snapshot.initialEnergyJ - snapshot.compressorWorkJ - snapshot.coilHeatJ + snapshot.leakedEnthalpyJ,
      geometry: this.refrigerant.geometry, cells, coilPorts: ports,
      fieldPorts: this.chargeCandidate?.fieldPorts ?? Object.fromEntries(this.config.rooms.map(room => [room.id, { gasHeader: null, gasHeaderMassFlowKgs: 0, gasLine: cells.find(cell => cell.id === `${room.id}:gas`)!.state, smallLine: cells.find(cell => cell.id === `${room.id}:small`)!.state, valveMassFlowKgs: 0 }])),
      headers: this.chargeCandidate?.headers ?? { indoorGas: null, outdoorSmall: null },
      compressorSuction: this.chargeCandidate?.compressorSuction ?? null,
      compressorDischarge: this.chargeCandidate?.compressorDischarge ?? null };
  }
  private makeOutput(rooms: RoomOutput[], cycle: CycleOutput | null, indoorFansW: number, outdoorFanW: number, roomHeatW: number, outdoorOutlet: number | null,
    depositionKgs: number, drainageKgs: number, meltPowerW = 0, speedRps = 0, filmEnergyRateW = 0, metalEnergyRateW = 0, compressorWorkW?: number, demandSpeedRps=speedRps): EngineOutput {
    const film = deriveOutdoorFilm(this.outdoorEnergyJ, this.outdoorWaterKg, this.config.outdoor), comp = compressorWorkW === undefined ? cycle?.compressorElectricalW ?? 0 : compressorWorkW / this.config.compressor.driveEfficiency;
    const inventory = this.inventoryOutput();
    const effectiveMode = inventory && (this.state === 'running' || this.state === 'defrost') ? inventory.orientation : cycle?.mode ?? null;
    const electrical = { compressorW: comp, indoorFansW, outdoorFanW, controlsW: this.config.control.controlsW, totalW: comp + indoorFansW + outdoorFanW + this.config.control.controlsW, driveLossW: compressorWorkW === undefined ? cycle?.driveLossW ?? 0 : comp - compressorWorkW };
    return { provenance: 'live-generic-unvalidated', simulatedSeconds: this.time, state: this.state, requestedMode: this.config.mode, effectiveMode, cycle, rooms,
      inventory,
      outdoor: { ...film, metalTemperatureC: film.temperatureC, filmEnthalpyJ: filmEnthalpy(this.outdoorEnergyJ, film.temperatureC, this.config.outdoor.metalCapacityJK), filmMassKg: this.outdoorWaterKg,
        airOutletC: outdoorOutlet, fanPowerW: outdoorFanW, depositionKgs, drainageKgs, meltPowerW }, electrical,
      signedRoomHeatW: roomHeatW,
      heatingCOP: this.state === 'running' && this.config.mode === 'heating' && roomHeatW > 0 && (inventory ? inventory.compressorAdmitted && !inventory.lowLiftTransfer && comp > 0 : !!cycle && comp > 0) ? roomHeatW / electrical.totalW : null,
      coolingCOP: this.state === 'running' && this.config.mode === 'cooling' && roomHeatW < 0 && (inventory ? inventory.compressorAdmitted && !inventory.lowLiftTransfer && comp > 0 : !!cycle && comp > 0) ? -roomHeatW / electrical.totalW : null,
      energy: { ...this.ledgers, storedEnergyChangeJ: this.totalEnergy() - this.initialEnergy, residualJ: this.totalEnergy() - this.initialEnergy - this.ledgers.boundaryEnergyJ,
        waterResidualKg: this.totalWater() - this.initialWater - this.boundaryWater },
      diagnostics: { warnings: [...new Set([...this.warnings,...(this.chargeCandidate?.diagnostics ?? []), ...(this.inventoryDrive.protection&&demandSpeedRps>0?[`Generic compressor protection hold: ${this.inventoryDrive.protection}.`]:[]), ...(this.refrigerant && !cycle && speedRps > 0 ? ['No complete forward circulation summary: inspect physical face flows and stored refrigerant energy.'] : [])])], fault: this.fault, algebraicResidualW: cycle?.closureResidualW ?? 0, speedRps, demandSpeedRps,
        restartDelaySeconds:demandSpeedRps>0&&speedRps===0?Math.max(0,this.config.control.minOffSeconds-this.inventoryDrive.offSeconds):0,
        envelopeProtection:this.inventoryDrive.protection, filmEnergyRateW, metalEnergyRateW } };
  }
}
