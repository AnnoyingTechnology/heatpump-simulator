import { Properties, DomainError } from './properties.ts';
import { solveCycle } from './cycle.ts';
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
  private lastCycle: { evaporatingC: number; condensingC: number; condenserOutletC: number; branchMassFlowsKgs: number[] } | undefined;
  private fault: string | null = null;
  private initialEnergy = 0;
  private initialWater = 0;
  private boundaryWater = 0;
  private ledgers = { electricityJ: 0, signedRoomHeatJ: 0, outdoorExchangeJ: 0, drainageJ: 0, configurationEnergyJ: 0, boundaryEnergyJ: 0 };
  private lastOutput!: EngineOutput;
  private warnings: string[] = [];
  constructor(private properties: Properties, config: EngineConfig) { this.config = structuredClone(config); this.reset(); }
  getConfig(): EngineConfig { return structuredClone(this.config); }
  reset(config: EngineConfig = this.config): EngineOutput {
    this.validateConfig(config); this.config = structuredClone(config);
    this.rooms = config.rooms.map(room => this.newRoom(room));
    this.outdoorWaterKg = 0; this.outdoorEnergyJ = config.outdoor.metalCapacityJK * config.outdoorTemperatureC;
    this.time = 0; this.state = 'idle'; this.stateTime = 0; this.heatingRuntime = 0; this.onTime = 0; this.offTime = Infinity;
    this.active = config.rooms.map(() => false); this.cycle = null; this.lastCycle = undefined; this.fault = null;
    this.ledgers = { electricityJ: 0, signedRoomHeatJ: 0, outdoorExchangeJ: 0, drainageJ: 0, configurationEnergyJ: 0, boundaryEnergyJ: 0 };
    this.boundaryWater = 0; this.initialEnergy = this.totalEnergy(); this.initialWater = this.totalWater();
    this.warnings = ['Generic component parameters and control assumptions; not manufacturer calibrated.', 'Outdoor metal and retained water/ice share one equilibrium temperature.', 'Ice sublimation is excluded; retained ice melts or receives deposition.', 'Dirt uses clear-passage scaling of air flow/air-side conductance; forced fan power is constant without a measured fan curve.', 'Pipe model assumes smooth copper, homogeneous two-phase flow and outdoor ambient along the whole field line; slip, fittings and oil are excluded.', 'Reported common condenser outlet is a control target; heating branch outlet states and mixed expansion enthalpy are authoritative with field lines.'];
    this.lastOutput = this.makeOutput(this.passiveRoomOutputs(), null, 0, 0, 0, null, 0, 0); return this.snapshot();
  }
  /** Preserve local temperatures/RH and outdoor ice through structural edits, account inventory impulses explicitly.
   * Initial temperature/RH values apply on reset only; newly added rooms use their own initial values. */
  updateConfig(config: EngineConfig): EngineOutput {
    this.validateConfig(config);
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
    this.lastOutput = this.makeOutput(this.passiveRoomOutputs(), null, 0, 0, 0, null, 0, 0); return this.snapshot();
  }
  snapshot(): EngineOutput { return structuredClone(this.lastOutput); }
  step(simulatedSeconds: number): EngineOutput {
    if (!(Number.isFinite(simulatedSeconds) && simulatedSeconds >= 0 && simulatedSeconds <= 60)) throw new DomainError('step requires finite 0…60 simulated seconds; caller supplies bounded time accumulator');
    let remaining = simulatedSeconds;
    while (remaining > 1e-10 && this.state !== 'fault') {
      const dt = Math.min(remaining, this.config.numerics.maxStepSeconds);
      try { this.advance(dt); } catch (error) { this.fault = error instanceof Error ? error.message : 'Physics failed'; this.state = 'fault'; this.cycle = null;
        let stopped: RoomOutput[];
        try { stopped = this.passiveRoomOutputs(); }
        catch { stopped = this.lastOutput.rooms.map(room => ({ ...room, active: false, massFlowKgs: 0, signedRoomHeatW: 0, sensibleRoomHeatW: 0, fanPowerW: 0, airOutletC: null, condensateKgs: 0, drainEnthalpyW: 0 })); }
        this.lastOutput = this.makeOutput(stopped, null, 0, 0, 0, null, 0, 0); }
      remaining -= dt;
    }
    return this.snapshot();
  }
  private newRoom(room: EngineConfig['rooms'][number], p = this.config.ambientPressurePa): RoomState {
    const w = this.properties.airW(room.initialTemperatureC, room.initialRelativeHumidity, p), mass = room.volumeM3 / this.properties.dryAirSpecificVolume(room.initialTemperatureC, w, p);
    return { dryAirMassKg: mass, airEnthalpyJ: mass * this.properties.airH(room.initialTemperatureC, w, p), humidityRatio: w, fabricTemperatureC: room.initialTemperatureC, metalTemperatureC: room.initialTemperatureC };
  }
  private validateConfig(config: EngineConfig): void {
    if (config.mode !== 'heating' && config.mode !== 'cooling') throw new DomainError('Unsupported operating mode');
    if (config.fluid !== 'R32') throw new DomainError('Only R32 has implemented live model coverage');
    if (config.rooms.length < 1 || config.rooms.length > 5 || new Set(config.rooms.map(r => r.id)).size !== config.rooms.length) throw new DomainError('Need one to five uniquely identified rooms');
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
    // Reject nonfinite configuration values recursively; JSON null/NaN cannot become plausible physics.
    const finite = (value: unknown): void => { if (typeof value === 'number' && !Number.isFinite(value)) throw new DomainError('Nonfinite scenario parameter'); if (value && typeof value === 'object') for (const v of Object.values(value)) finite(v); }; finite(config);
  }
  private totalEnergy(): number { return this.outdoorEnergyJ + sum(this.rooms.map((room, i) => room.airEnthalpyJ + this.config.rooms[i].fabricCapacityJK * room.fabricTemperatureC + this.config.rooms[i].metalCapacityJK * room.metalTemperatureC)); }
  private totalWater(): number { return this.outdoorWaterKg + sum(this.rooms.map(room => room.dryAirMassKg * room.humidityRatio)); }
  private passiveRoomOutputs(): RoomOutput[] {
    return this.rooms.map((room, i) => { const c = this.config.rooms[i], t = this.properties.airT(room.airEnthalpyJ / room.dryAirMassKg, room.humidityRatio, this.config.ambientPressurePa);
      return { id: c.id, temperatureC: t, relativeHumidity: this.properties.airRH(t, room.humidityRatio, this.config.ambientPressurePa), humidityRatio: room.humidityRatio, fabricTemperatureC: room.fabricTemperatureC, metalTemperatureC: room.metalTemperatureC,
        setpointC: c.setpointC, active: false, massFlowKgs: 0, signedRoomHeatW: 0, sensibleRoomHeatW: 0, fanPowerW: 0, airOutletC: null, condensateKgs: 0, drainEnthalpyW: 0 }; });
  }
  private transition(state: OperatingState): void { this.state = state; this.stateTime = 0; this.lastCycle = undefined; }
  private advance(dt: number): void {
    const config = this.config, outdoor = config.outdoor, p = config.ambientPressurePa;
    const before = deriveOutdoorFilm(this.outdoorEnergyJ, this.outdoorWaterKg, outdoor);
    const tRooms = this.rooms.map(r => this.properties.airT(r.airEnthalpyJ / r.dryAirMassKg, r.humidityRatio, p));
    const previousActive = [...this.active];
    const errors = config.rooms.map((room, i) => config.mode === 'heating' ? room.setpointC - tRooms[i] : tRooms[i] - room.setpointC);
    this.active = config.rooms.map((room, i) => room.enabled && errors[i] > (this.active[i] ? -config.control.thermostatDeadbandK : config.control.thermostatDeadbandK));
    if (this.state === 'reversing' && this.stateTime >= config.control.reversalSeconds) this.transition(config.mode === 'heating' && before.iceKg > config.control.defrostIceThresholdKg ? 'defrost' : 'idle');
    if (this.state === 'draining' && this.stateTime >= config.control.drainageDwellSeconds) { this.transition('reversing'); this.heatingRuntime = 0; }
    if (this.state === 'defrost') {
      this.active = config.rooms.map(room => room.enabled);
      if (before.iceKg < 1e-6 && before.temperatureC >= config.control.defrostTerminationMetalC) this.transition('draining');
      else if (this.stateTime >= config.control.defrostMaxSeconds) throw new DomainError('Defrost timeout: retained ice/energy conserved; generic source cannot finish');
    }
    if (this.state === 'running' && config.mode === 'heating' && before.iceKg >= config.control.defrostIceThresholdKg && this.heatingRuntime >= config.control.defrostMinHeatingSeconds) this.transition('reversing');
    if (this.state === 'idle' && this.active.some(Boolean) && this.offTime >= config.control.minOffSeconds) this.transition('running');
    if (this.state === 'running' && !this.active.some(Boolean) && this.onTime < config.control.minOnSeconds) this.active = previousActive.map((active, i) => active && config.rooms[i].enabled);
    if (this.state === 'running' && !config.rooms.some(room => room.enabled)) { this.transition('idle'); this.offTime = 0; }
    if (this.state === 'running' && !this.active.some(Boolean) && this.onTime >= config.control.minOnSeconds) { this.transition('idle'); this.offTime = 0; }
    const running = this.state === 'running' && this.active.some(Boolean), defrost = this.state === 'defrost';
    const effectiveMode: Mode | null = running ? config.mode : defrost ? 'cooling' : null;
    const activeErrors = errors.filter((_, i) => this.active[i]);
    const speed = defrost ? config.control.defrostSpeedRps : running ? bounded(config.compressor.speedMinRps + config.control.proportionalSpeedRpsK * Math.max(0, ...activeErrors), config.compressor.speedMinRps, config.compressor.speedMaxRps) : 0;
    let cycle: CycleOutput | null = null;
    if (effectiveMode) {
      cycle = solveCycle(this.properties, config, { mode: effectiveMode, indoorMetalC: this.rooms.map(room => room.metalTemperatureC), outdoorMetalC: before.temperatureC, active: this.active, speedRps: speed, defrost, previous: this.lastCycle });
      this.lastCycle = { evaporatingC: cycle.evaporatingC, condensingC: cycle.condensingC, condenserOutletC: cycle.condenserOutlet.temperatureC, branchMassFlowsKgs: cycle.branchMassFlowsKgs };
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
      const qRef = cycle?.branchCoilHeatW[i] ?? 0;
      const metalRate = qRef + air.heatFromAirW - air.drainEnthalpyW;
      const next: RoomState = { ...room, airEnthalpyJ: room.airEnthalpyJ + dt * (useful + qFabric + qEnvelope + qVent),
        humidityRatio: room.humidityRatio + dt * (waterVent - air.waterToSurfaceKgs) / room.dryAirMassKg,
        fabricTemperatureC: room.fabricTemperatureC - dt * qFabric / c.fabricCapacityJK,
        metalTemperatureC: room.metalTemperatureC + dt * metalRate / c.metalCapacityJK };
      const nextT = this.properties.airT(next.airEnthalpyJ / next.dryAirMassKg, next.humidityRatio, p), nextRH = this.properties.airRH(nextT, next.humidityRatio, p);
      if (next.humidityRatio < 0 || nextRH > 1 + 1e-7) throw new DomainError(`Room ${c.id} supersaturation/negative water inventory outside model domain`);
      const outlet = forced ? this.properties.airT(this.properties.airH(air.outletC, air.outletHumidityRatio, p) + fan / md, air.outletHumidityRatio, p) : null;
      outputs.push({ id: c.id, temperatureC: nextT, relativeHumidity: nextRH, humidityRatio: next.humidityRatio, fabricTemperatureC: next.fabricTemperatureC, metalTemperatureC: next.metalTemperatureC,
        setpointC: c.setpointC, active: !!cycle && this.active[i], massFlowKgs: cycle?.branchMassFlowsKgs[i] ?? 0, signedRoomHeatW: useful, sensibleRoomHeatW: air.sensibleToAirW + fan,
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
    const outdoorRate = (cycle?.outdoorCoilHeatW ?? 0) + outdoorAir.heatFromAirW - drainEnergy;
    const candidateEnergy = this.outdoorEnergyJ + dt * outdoorRate;
    const after = deriveOutdoorFilm(candidateEnergy, candidateMass, outdoor);
    const compElectric = cycle?.compressorElectricalW ?? 0, driveLoss = cycle?.driveLossW ?? 0;
    const electric = compElectric + indoorFans + fanOutside + config.control.controlsW;
    const outward = outdoorAir.signedHeatToAirW + (cycle?.lineHeatToOutdoorW ?? 0) + fanOutside + driveLoss + config.control.controlsW;
    const filmRate = (filmEnthalpy(candidateEnergy, after.temperatureC, outdoor.metalCapacityJK) - filmEnthalpy(this.outdoorEnergyJ, before.temperatureC, outdoor.metalCapacityJK)) / dt;
    const outMetalRate = outdoor.metalCapacityJK * (after.temperatureC - before.temperatureC) / dt;
    const meltedKg = Math.max(0, before.iceKg - after.iceKg); // diagnostic only; evolution is determined by energy, never by this value.
    const outdoorOutlet = forcedOutside ? this.properties.airT(this.properties.airH(outdoorAir.outletC, outdoorAir.outletHumidityRatio, p) + fanOutside / mdOut, outdoorAir.outletHumidityRatio, p) : null;
    this.rooms = candidateRooms; this.outdoorWaterKg = candidateMass; this.outdoorEnergyJ = candidateEnergy; this.cycle = cycle;
    this.time += dt; this.stateTime += dt;
    if (running || defrost) this.onTime += dt; else { this.offTime += dt; this.onTime = 0; }
    if (running && config.mode === 'heating') this.heatingRuntime += dt;
    this.ledgers.electricityJ += electric * dt; this.ledgers.signedRoomHeatJ += roomPower * dt;
    this.ledgers.outdoorExchangeJ += outward * dt; this.ledgers.drainageJ += (indoorDrain + drainEnergy) * dt;
    this.ledgers.boundaryEnergyJ += dt * (electric - outward - indoorDrain - drainEnergy + ventilationEnergy + envelopeEnergy);
    this.boundaryWater += dt * (roomWaterBoundary + outdoorAir.waterToSurfaceKgs - drain);
    this.lastOutput = this.makeOutput(outputs, cycle, indoorFans, fanOutside, roomPower, outdoorOutlet,
      outdoorAir.waterToSurfaceKgs, drain, meltedKg * FUSION_JKG / dt, speed, filmRate, indoorMetalRate + outMetalRate);
  }
  private makeOutput(rooms: RoomOutput[], cycle: CycleOutput | null, indoorFansW: number, outdoorFanW: number, roomHeatW: number, outdoorOutlet: number | null,
    depositionKgs: number, drainageKgs: number, meltPowerW = 0, speedRps = 0, filmEnergyRateW = 0, metalEnergyRateW = 0): EngineOutput {
    const film = deriveOutdoorFilm(this.outdoorEnergyJ, this.outdoorWaterKg, this.config.outdoor), comp = cycle?.compressorElectricalW ?? 0;
    const electrical = { compressorW: comp, indoorFansW, outdoorFanW, controlsW: this.config.control.controlsW, totalW: comp + indoorFansW + outdoorFanW + this.config.control.controlsW, driveLossW: cycle?.driveLossW ?? 0 };
    return { provenance: 'live-generic-unvalidated', simulatedSeconds: this.time, state: this.state, requestedMode: this.config.mode, effectiveMode: cycle?.mode ?? null, cycle, rooms,
      outdoor: { ...film, metalTemperatureC: film.temperatureC, filmEnthalpyJ: filmEnthalpy(this.outdoorEnergyJ, film.temperatureC, this.config.outdoor.metalCapacityJK), filmMassKg: this.outdoorWaterKg,
        airOutletC: outdoorOutlet, fanPowerW: outdoorFanW, depositionKgs, drainageKgs, meltPowerW }, electrical,
      signedRoomHeatW: roomHeatW,
      heatingCOP: this.state === 'running' && this.config.mode === 'heating' && roomHeatW > 0 ? roomHeatW / electrical.totalW : null,
      coolingCOP: this.state === 'running' && this.config.mode === 'cooling' && roomHeatW < 0 ? -roomHeatW / electrical.totalW : null,
      energy: { ...this.ledgers, storedEnergyChangeJ: this.totalEnergy() - this.initialEnergy, residualJ: this.totalEnergy() - this.initialEnergy - this.ledgers.boundaryEnergyJ,
        waterResidualKg: this.totalWater() - this.initialWater - this.boundaryWater },
      diagnostics: { warnings: [...new Set(this.warnings)], fault: this.fault, algebraicResidualW: cycle?.closureResidualW ?? 0, speedRps, filmEnergyRateW, metalEnergyRateW } };
  }
}
