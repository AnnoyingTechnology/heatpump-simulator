import { refrigerantDefinition, type RefrigerantId, type RefrigerantDefinition } from './refrigerants.ts';
import type { CoolPropModule, RefrigerantState, AbstractFluidState } from './types.ts';

export class DomainError extends Error { constructor(message: string) { super(message); this.name = 'DomainError'; } }
export class Properties {
  readonly backend: string;
  readonly refrigerant: RefrigerantDefinition;
  private cache = new Map<string, number>();
  private state: AbstractFluidState | undefined;
  private lastInput = '';
  constructor(private module: CoolPropModule, readonly fluid: RefrigerantId = 'R32') {
    this.refrigerant = refrigerantDefinition(fluid);
    this.backend = `CoolProp 8.0.0 HEOS ${fluid}`;
    if (this.refrigerant.kind === 'zeotropic' && !module.guardedStateApi) throw new DomainError('Explicit blends require the guarded fixed-composition backend');
    if (module.factory && module.input_pairs) this.state = module.factory('HEOS', this.refrigerant.backendFluid);
  }
  assertPressure(p: number): void {
    const d = this.refrigerant.domain;
    if (!(p > d.minPressurePa && p < d.maxPressurePa)) throw new DomainError(`${this.fluid} pressure outside selected ${d.minPressurePa / 1e5}–${d.maxPressurePa / 1e5} bar absolute domain`);
  }
  private assertTemperature(tK: number): void {
    const d = this.refrigerant.domain;
    if (!(tK > d.minTemperatureC + 273.15 && tK < d.maxTemperatureC + 273.15)) throw new DomainError(`${this.fluid} state outside selected ${d.minTemperatureC}…${d.maxTemperatureC}°C domain`);
  }
  dispose(): void { this.state?.delete(); this.state = undefined; this.lastInput = ''; this.cache.clear(); }
  clearCache(): void { this.cache.clear(); }
  prop(output: string, a: string, x: number, b: string, y: number): number {
    const key = `${output}:${a}:${x}:${b}:${y}`;
    const cached = this.cache.get(key); if (cached !== undefined) return cached;
    let value: number;
    try {
      const pairs: Record<string, [string, number, number]> = {
        'P:H': ['HmassP_INPUTS', y, x], 'P:T': ['PT_INPUTS', x, y],
        'P:S': ['PSmass_INPUTS', x, y], 'P:Q': ['PQ_INPUTS', x, y], 'T:Q': ['QT_INPUTS', y, x],
        'P:D': ['DmassP_INPUTS', y, x],
        'D:U': ['DmassUmass_INPUTS', x, y],
      };
      const pair = pairs[`${a}:${b}`];
      const methods: Record<string, keyof AbstractFluidState> = { T:'T', P:'p', H:'hmass', S:'smass', D:'rhomass', Q:'Q', Qmass:'Q' };
      if (this.module.guardedStateApi) Object.assign(methods, { C:'cpmass', V:'viscosity', A:'speed_sound' });
      if (this.state && pair && methods[output]) {
        const input = `${a}:${x}:${b}:${y}`;
        if (this.lastInput !== input) {
          this.lastInput = '';
          // PropsSI catches CoolProp's native exceptions inside C++. The pinned
          // embind build does not export a complete JS exception/stack lifecycle.
          // Preflight every new flash here before entering its reusable state API;
          // invalid Newton trials must never escape C++ into JavaScript.
          // Request a computed quantity: density for PH/PT/etc, pressure for DU,
          // temperature for PD. Input echoes cannot validate an EOS solve.
          if (!this.module.guardedStateApi) {
            const preflight = a === 'D' && b === 'U' ? 'P' : a === 'P' && b === 'D' ? 'T' : 'D';
            const preflightKey = `${preflight}:${a}:${x}:${b}:${y}`;
            const computed = this.cache.get(preflightKey) ?? this.module.PropsSI(preflight, a, x, b, y, this.refrigerant.backendFluid);
            if (!(Number.isFinite(computed) && computed > 0 && computed < (preflight === 'P' ? 1e8 : preflight === 'T' ? 1e4 : 1e5))) throw new DomainError(`${this.fluid} flash outside backend domain`);
            this.cache.set(preflightKey, computed);
          }
          // A guarded module catches update/getter exceptions inside C++ and
          // validates computed T/p/density before accepting its reusable state.
          this.state.update(this.module.input_pairs![pair[0]], pair[1], pair[2]);
          if (this.module.guardedStateApi) {
            // Retain the service's preflight bounds using the already flashed
            // state. This computed getter costs no second EOS solve.
            const preflight = a === 'D' && b === 'U' ? 'P' : a === 'P' && b === 'D' ? 'T' : 'D';
            const computed = (this.state[methods[preflight]] as () => number).call(this.state);
            if (!(Number.isFinite(computed) && computed > 0 && computed < (preflight === 'P' ? 1e8 : preflight === 'T' ? 1e4 : 1e5))) throw new DomainError(`${this.fluid} flash outside backend domain`);
            this.cache.set(`${preflight}:${a}:${x}:${b}:${y}`, computed);
          }
          this.lastInput = input;
        }
        // The pure/pseudo-pure backend equates Qmass and Q; an explicit blend does not.
        if (output === 'Qmass' && this.refrigerant.kind === 'zeotropic') {
          if (!this.state.Qmass) throw new DomainError('Blend backend requires an explicit mass-quality getter');
          value = this.state.Qmass();
        } else
        value = (this.state[methods[output]] as () => number).call(this.state);
      } else value = this.module.PropsSI(output, a, x, b, y, this.refrigerant.backendFluid);
    } catch {
      // A guarded getter can invalidate the native state. A subsequent read of
      // the same inputs must reflash rather than trust the previous update.
      this.lastInput = '';
      throw new DomainError(`${this.fluid} ${output}(${a}=${x},${b}=${y}) failed`);
    }
    if (!Number.isFinite(value) || Math.abs(value) > 1e30) throw new DomainError(`${this.fluid} property ${output} outside supported domain`);
    if (this.cache.size > 60000) { let removed = 0; for (const oldest of this.cache.keys()) { this.cache.delete(oldest); if (++removed >= 5000) break; } } this.cache.set(key, value); return value;
  }
  pressureAtSaturationC(t: number, endpoint: 'dew' | 'bubble' = 'dew'): number { return this.prop('P', 'T', t + 273.15, 'Q', this.refrigerant.kind === 'pure' || endpoint === 'dew' ? 1 : 0); }
  saturation(p: number): { temperatureC: number; bubbleTemperatureC: number; dewTemperatureC: number; liquidH: number; vaporH: number } {
    const dewTemperatureC = this.prop('T', 'P', p, 'Q', 1) - 273.15;
    return { temperatureC: dewTemperatureC, dewTemperatureC, bubbleTemperatureC: this.refrigerant.kind === 'pure' ? dewTemperatureC : this.prop('T', 'P', p, 'Q', 0) - 273.15, liquidH: this.prop('H', 'P', p, 'Q', 0), vaporH: this.prop('H', 'P', p, 'Q', 1) };
  }
  /** Equilibrium enthalpy at fixed pressure/temperature, resolving the blend glide with PQ flashes. */
  equilibriumH(p: number, tC: number): number {
    const sat = this.saturation(p);
    if (this.refrigerant.kind === 'pure') return this.prop('H', 'P', p,
      Math.abs(tC - sat.temperatureC) < .01 ? (tC < sat.temperatureC ? 'T|liquid' : 'T|gas') : 'T', tC + 273.15);
    if (tC < sat.bubbleTemperatureC || tC > sat.dewTemperatureC) return this.prop('H', 'P', p,
      Math.abs(tC-sat.bubbleTemperatureC)<.01 ? 'T|liquid' : Math.abs(tC-sat.dewTemperatureC)<.01 ? 'T|gas' : 'T', tC+273.15);
    if (tC === sat.bubbleTemperatureC) return sat.liquidH;
    if (tC === sat.dewTemperatureC) return sat.vaporH;
    let low = 0, high = 1;
    for (let i = 0; i < 45; i++) {
      const q = .5 * (low + high), t = this.prop('T', 'P', p, 'Q', q) - 273.15;
      if (Math.abs(t - tC) < 1e-8) return this.prop('H', 'P', p, 'Q', q);
      if (t < tC) low = q; else high = q;
    }
    throw new DomainError('Blend equilibrium temperature inverse did not converge');
  }
  ph(p: number, h: number): RefrigerantState {
    this.assertPressure(p);
    const T = this.prop('T', 'P', p, 'H', h); this.assertTemperature(T);
    // Read one PH state completely before a saturation query switches the
    // reusable backend to PQ. Two-phase classification needs no extra flash.
    const q = this.prop('Q', 'P', p, 'H', h);
    const entropy = this.prop('S', 'P', p, 'H', h), density = this.prop('D', 'P', p, 'H', h);
    const twoPhase = q >= 0 && q <= 1;
    const quality = twoPhase ? this.prop('Qmass', 'P', p, 'H', h) : null;
    return { pPa: p, pBarAbs: p / 1e5, hJkg: h, temperatureC: T - 273.15,
      entropyJkgK: entropy, densityKgm3: density, qualityMass: quality,
      phase: twoPhase ? 'two-phase' : h < this.saturation(p).liquidH ? 'liquid' : 'vapor' };
  }
  pt(p: number, tC: number): RefrigerantState { return this.ph(p, this.prop('H', 'P', p, 'T', tC + 273.15)); }
  /** Pressure/density coordinates for an implicit storage solve; computed T validates the flash before native state reuse. */
  pd(p: number, densityKgm3: number): RefrigerantState {
    this.assertPressure(p);
    if (!(Number.isFinite(densityKgm3) && densityKgm3 > 0 && densityKgm3 < 1e5)) throw new DomainError(`Nonfinite/nonpositive ${this.fluid} density`);
    const T = this.prop('T', 'P', p, 'D', densityKgm3);
    this.assertTemperature(T);
    const h = this.prop('H', 'P', p, 'D', densityKgm3), q = this.prop('Q', 'P', p, 'D', densityKgm3);
    const entropy = this.prop('S', 'P', p, 'D', densityKgm3), twoPhase = q >= 0 && q <= 1;
    return { pPa: p, pBarAbs: p / 1e5, hJkg: h, temperatureC: T - 273.15,
      entropyJkgK: entropy, densityKgm3, qualityMass: twoPhase ? this.prop('Qmass', 'P', p, 'D', densityKgm3) : null,
      phase: twoPhase ? 'two-phase' : h < this.saturation(p).liquidH ? 'liquid' : 'vapor' };
  }
  /** Conserved rigid-volume storage flash: rho=M/V, u=U/M. Same selected domain as ph(). */
  du(densityKgm3: number, internalEnergyJkg: number): RefrigerantState {
    if (!(Number.isFinite(densityKgm3) && densityKgm3 > 0 && densityKgm3 < 1e5 && Number.isFinite(internalEnergyJkg))) throw new DomainError(`Nonfinite/nonpositive ${this.fluid} storage state`);
    const p = this.prop('P', 'D', densityKgm3, 'U', internalEnergyJkg);
    this.assertPressure(p);
    const t = this.prop('T', 'D', densityKgm3, 'U', internalEnergyJkg);
    this.assertTemperature(t);
    const h = internalEnergyJkg + p / densityKgm3, q = this.prop('Q', 'D', densityKgm3, 'U', internalEnergyJkg);
    return { pPa: p, pBarAbs: p / 1e5, hJkg: h, temperatureC: t - 273.15,
      entropyJkgK: this.prop('S', 'D', densityKgm3, 'U', internalEnergyJkg), densityKgm3,
      qualityMass: q >= 0 && q <= 1 ? this.prop('Qmass', 'D', densityKgm3, 'U', internalEnergyJkg) : null,
      phase: q >= 0 && q <= 1 ? 'two-phase' : h < this.saturation(p).liquidH ? 'liquid' : 'vapor' };
  }
  humid(output: string, a: string, x: number, b: string, y: number, ambientPa: number): number {
    let value: number; try { value = this.module.HAPropsSI(output, a, x, b, y, 'P', ambientPa); } catch { throw new DomainError(`Humid air ${output}(${a},${b}) failed`); }
    if (!Number.isFinite(value) || Math.abs(value) > 1e30) throw new DomainError(`Humid air ${output} outside domain`); return value;
  }
  airH(tC: number, w: number, p: number): number { return this.humid('H', 'T', tC + 273.15, 'W', w, p); }
  /** Humid gas constant-pressure cp in J/kg dry air/K; excludes retained liquid/ice. */
  airCp(tC: number, w: number, p: number): number { return this.humid('C', 'T', tC + 273.15, 'W', w, p); }
  airT(h: number, w: number, p: number): number { return this.humid('T', 'H', h, 'W', w, p) - 273.15; }
  airW(tC: number, rh: number, p: number): number {
    if (rh < 0 || rh > 1) throw new DomainError('Relative humidity must be a fraction within 0…1');
    return this.humid('W', 'T', tC + 273.15, 'R', rh, p);
  }
  airRH(tC: number, w: number, p: number): number { return this.humid('R', 'T', tC + 273.15, 'W', w, p); }
  dryAirSpecificVolume(tC: number, w: number, p: number): number { return this.humid('V', 'T', tC + 273.15, 'W', w, p); }
}
export function createPropertyService(module: CoolPropModule, fluid: RefrigerantId = 'R32'): Properties { return new Properties(module, fluid); }
/** Root supplies an absolute/repository-relative same-origin URL for the self-hosted ESM pair. */
export async function loadPropertyService(moduleUrl: string, fluid: RefrigerantId = 'R32'): Promise<Properties> {
  const imported = await import(/* @vite-ignore */ moduleUrl);
  const module = await imported.default({ locateFile: (file: string) => new URL(file, moduleUrl).href });
  return createPropertyService(module, fluid);
}
