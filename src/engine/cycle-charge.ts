import { DomainError, Properties } from './properties.ts';
import { coilOutletH, solveCycle } from './cycle.ts';
import type { CycleInput } from './cycle.ts';
import { circuitInventory, type BalanceGeometry, type InventoryBreakdown } from './charge-balance.ts';
import type { ChargeBalanceDiagnostics, ChargeRegime, CycleOutput, EngineConfig, Mode, RefrigerantState } from './types.ts';

/** Quasi-steady charge-balanced closure for idealized (allocated) branches.
 *
 * The specified refrigerant mass replaces the fixed condenser-subcooling target:
 * subcooling, condensing pressure and the EEV inlet phase follow from where the
 * charge resides. A generic EEV controller selects one regime by complementarity:
 *  - superheat: suction superheat on target (normal charge);
 *  - valve-limit: a branch EEV fully open, superheat above target (charge-starved);
 *  - minimum-lift: the existing positive lift hold (heating 1 K, cooling/defrost 8 K);
 *  - discharge-limit: the EEV opens to hold a discharge-temperature ceiling, lowering superheat;
 *  - accumulator: at zero superheat, excess liquid parks in the suction accumulator;
 *  - condensing-limit: the EEV opens to hold condensing temperature at a ceiling below the
 *    high-pressure trip, the same superheat-then-accumulator variable storing the excess
 *    (for example a multi-split charge with most branches stopped).
 * Refrigerant transients, oil solubility and the compressor shell are not modelled. */
export interface ChargeBalanceSetting {
  /** Specified charge as a percentage of the derived generic nominal inventory. */
  percentOfNominal: number;
  geometry: BalanceGeometry;
  /** Generic per-branch EEV full-open area and orifice coefficient, not OEM data. */
  valveMaxAreaM2: number;
  valveDischargeCoefficient: number;
}
/** A setting resolved to an absolute refrigerant mass for one solve. */
export interface ChargeBalanceSpec extends Omit<ChargeBalanceSetting, 'percentOfNominal'> { massKg: number }
const MINIMUM_LIFT: Record<Mode, number> = { heating: 1, cooling: 8 };
/** Declared generic EEV discharge-temperature override, below the 10 K protection band. */
export const DISCHARGE_CONTROL_MARGIN_K = 20;
/** The accumulator stops accepting parked liquid before its outlet would pick up liquid. */
export const ACCUMULATOR_LIQUID_LIMIT = .9;
/** Engine condensing-temperature protection threshold (engine.ts trips at 63 °C). */
export const CONDENSING_PROTECTION_C = 63;
/** Declared generic EEV condensing ceiling, 5 K below the trip. */
export const CONDENSING_CONTROL_C = 58;
/** Residual scales so every equation's tolerance is comparable to 0.1 W of coil heat:
 * 1 mg of inventory, 1e-6 of valve opening, 1 mK of discharge temperature. */
const MASS_SCALE = 1e5, VALVE_SCALE = 1e5, DISCHARGE_SCALE = 100;

export class ChargeProtectionError extends DomainError {
  constructor(readonly protection: 'high-side flooding' | 'refrigerant shortage', message: string) { super(message); this.name = 'ChargeProtectionError'; }
}

interface Point { te: number; tc: number; superheatK: number; liquidKg: number }
interface Trial { residual: number[]; output: CycleOutput; inventory: InventoryBreakdown; openings: number[]; point: Point }

/** Single-phase orifice law applied with the homogeneous EEV inlet density.
 * Declared generic capacity: no metastable flashing or choking correlation. */
export function valveCapacityKgs(inlet: RefrigerantState, downstreamPa: number, area: number, coefficient: number): number {
  const drop = inlet.pPa - downstreamPa;
  if (!(drop > 0)) throw new DomainError('EEV has no positive pressure drop');
  return coefficient * area * Math.sqrt(2 * inlet.densityKgm3 * drop);
}

export function evaluateBalanced(properties: Properties, config: EngineConfig, spec: ChargeBalanceSpec, input: CycleInput, point: Point): Trial {
  const { te, tc, superheatK, liquidKg } = point;
  const heating = input.mode === 'heating', compressor = config.compressor, domain = properties.refrigerant.domain;
  const active = input.active.flatMap((on, i) => on ? [i] : []);
  if (!(te > domain.minEvaporatingC && te < domain.maxEvaporatingC && tc < domain.maxCondensingC && tc > domain.minCondensingC && tc > te && superheatK >= 0 && liquidKg >= 0)) throw new DomainError('Charge-balanced trial outside saturation domain');
  const pL = properties.pressureAtSaturationC(te), pH = properties.pressureAtSaturationC(tc, 'bubble');
  // Zero superheat is the saturated-vapour accumulator outlet, not an extrapolated PT state.
  const suction = properties.ph(pL, superheatK === 0 ? properties.saturation(pL).vaporH : properties.equilibriumH(pL, te + superheatK));
  const flow = suction.densityKgm3 * compressor.displacementM3rev * input.speedRps * compressor.volumetricEfficiency;
  const isentropic = properties.prop('H', 'P', pH, 'S', suction.entropyJkgK);
  const discharge = properties.ph(pH, suction.hJkg + (isentropic - suction.hJkg) / compressor.isentropicEfficiency);
  const weight = (i: number) => input.allocationWeights?.[i] ?? config.rooms[i].refrigerantConductanceWK;
  const totalWeight = active.reduce((sum, i) => sum + weight(i), 0);
  if (!(totalWeight > 0) || active.some(i => !(weight(i) > 0 && Number.isFinite(weight(i))))) throw new DomainError('Invalid generic branch allocation weight');
  const flows = config.rooms.map((_, i) => input.active[i] ? flow * weight(i) / totalWeight : 0);
  const inlets: RefrigerantState[] = [], outlets: RefrigerantState[] = [], heat = config.rooms.map(() => 0);
  const valveInlets: (RefrigerantState | null)[] = config.rooms.map(() => null), valveOutlets: (RefrigerantState | null)[] = config.rooms.map(() => null);
  let condenserOutlet: RefrigerantState, expansionOutlet: RefrigerantState, evaporatorOutletH: number, mixedH = 0;
  if (heating) {
    for (let i = 0; i < config.rooms.length; i++) {
      if (!input.active[i]) { inlets.push(discharge); outlets.push(discharge); continue; }
      const outlet = properties.ph(pH, coilOutletH(properties, pH, discharge.hJkg, flows[i], config.rooms[i].refrigerantConductanceWK, input.indoorMetalC[i], true));
      inlets.push(discharge); outlets.push(outlet); heat[i] = flows[i] * (discharge.hJkg - outlet.hJkg); mixedH += flows[i] * outlet.hJkg;
      valveInlets[i] = outlet; valveOutlets[i] = properties.ph(pL, outlet.hJkg);
    }
    mixedH /= flow;
    condenserOutlet = properties.ph(pH, mixedH);
    if (condenserOutlet.phase === 'vapor') throw new DomainError('Charge-balanced heating header is not condensed');
    expansionOutlet = properties.ph(pL, mixedH);
    evaporatorOutletH = coilOutletH(properties, pL, mixedH, flow, config.outdoor.refrigerantConductanceWK, input.outdoorMetalC, false);
  } else {
    condenserOutlet = properties.ph(pH, coilOutletH(properties, pH, discharge.hJkg, flow, config.outdoor.refrigerantConductanceWK, input.outdoorMetalC, true));
    if (condenserOutlet.phase === 'vapor') throw new DomainError('Charge-balanced outdoor condenser outlet is not condensed');
    expansionOutlet = properties.ph(pL, condenserOutlet.hJkg);
    for (let i = 0; i < config.rooms.length; i++) {
      if (!input.active[i]) { inlets.push(expansionOutlet); outlets.push(suction); continue; }
      const outlet = properties.ph(pL, coilOutletH(properties, pL, expansionOutlet.hJkg, flows[i], config.rooms[i].refrigerantConductanceWK, input.indoorMetalC[i], false));
      inlets.push(expansionOutlet); outlets.push(outlet); heat[i] = flows[i] * (expansionOutlet.hJkg - outlet.hJkg); mixedH += flows[i] * outlet.hJkg;
      valveInlets[i] = condenserOutlet; valveOutlets[i] = expansionOutlet;
    }
    evaporatorOutletH = mixedH / flow;
  }
  // Publish the actual mixed evaporator stream at the compressor (as the fixed-SC Reference
  // does), so condenser, evaporator and compressor energies close algebraically at any trial.
  let compressorInlet = suction, compressorOutlet = discharge;
  if (!heating) {
    compressorInlet = properties.ph(pL, evaporatorOutletH);
    if (compressorInlet.phase === 'liquid') throw new DomainError('Charge-balanced cooling return is liquid');
    compressorOutlet = properties.ph(pH, compressorInlet.hJkg + (properties.prop('H', 'P', pH, 'S', compressorInlet.entropyJkgK) - compressorInlet.hJkg) / compressor.isentropicEfficiency);
  }
  const openings = config.rooms.map((_, i) => input.active[i] ? flows[i] / valveCapacityKgs(valveInlets[i]!, pL, spec.valveMaxAreaM2, spec.valveDischargeCoefficient) : 0);
  const outdoorIn = heating ? expansionOutlet : compressorOutlet, outdoorOut = heating ? suction : condenserOutlet;
  const outdoorHeat = flow * (outdoorIn.hJkg - outdoorOut.hJkg), work = flow * (compressorOutlet.hJkg - compressorInlet.hJkg), electric = work / compressor.driveEfficiency;
  const roomHeat = heat.reduce((a, b) => a + b, 0);
  const output: CycleOutput = { mode: input.mode, evaporatingC: te, condensingC: tc, lowPressureBarAbs: pL / 1e5, highPressureBarAbs: pH / 1e5,
    suction: compressorInlet, discharge: compressorOutlet, condenserOutlet, expansionOutlet, totalMassFlowKgs: flow, branchMassFlowsKgs: flows, branchCoilHeatW: heat,
    outdoorCoilHeatW: outdoorHeat, branchInlets: inlets, branchOutlets: outlets, branchValveInlets: valveInlets, branchValveOutlets: valveOutlets,
    condenserHeatW: heating ? roomHeat : outdoorHeat, evaporatorHeatW: heating ? -outdoorHeat : -roomHeat,
    compressorWorkW: work, compressorElectricalW: electric, driveLossW: electric - work, massResidualKgs: 0, closureResidualW: 0, iterations: 0,
    lineHeatToOutdoorW: 0, pressureDropsPa: config.rooms.map(() => 0),
    transportMethod: 'Idealized field transport; physical line volumes hold refrigerant (charge-balanced closure)' };
  const inventory = circuitInventory(properties, config, spec.geometry, output, { active: input.active, indoorMetalC: input.indoorMetalC, outdoorMetalC: input.outdoorMetalC }, liquidKg,
    heating ? { inletH: expansionOutlet.hJkg, outletH: evaporatorOutletH } : { inletH: discharge.hJkg, outletH: condenserOutlet.hJkg });
  // Steady evaporator: its outlet stream is the compressor suction stream; parked
  // accumulator liquid exchanges no flow, so a saturated outlet must also be dry.
  const residual = [flow * (evaporatorOutletH - suction.hJkg), (inventory.totalKg - spec.massKg) * MASS_SCALE];
  return { residual, output, inventory, openings, point };
}

/** Parked liquid per kelvin of the continued EEV variable below zero superheat. */
const LIQUID_PER_K = .02;
/** Regime unknowns map to a cycle point; extra residuals encode the held controller quantity.
 * The discharge-limit EEV variable s is superheat for s>0 and parked accumulator liquid for s<0,
 * so one continuous controller opening first wets the suction, then fills the accumulator. */
/** massUnknown: the unknown the nested solve brackets for the mass equation. nestedFirst: the
 * other equations do not depend on it, so the nested solve is the natural first method. */
interface RegimeDefinition { point: (x: number[]) => Point; start: (seed: Point) => number[]; steps: number[]; limits: number[]; extra: ((trial: Trial) => number) | null; massUnknown: number; nestedFirst?: boolean }
function regimeDefinition(regime: ChargeRegime, mode: Mode, target: number, dischargeCeilingC: number, condensingCeilingC: number): RegimeDefinition {
  const lift = MINIMUM_LIFT[mode], ceiling = (trial: Trial) => (trial.output.discharge.temperatureC - dischargeCeilingC) * DISCHARGE_SCALE;
  switch (regime) {
    case 'superheat': return { point: ([te, tc]) => ({ te, tc, superheatK: target, liquidKg: 0 }), start: s => [s.te, s.tc], steps: [.01, .01], limits: [8, 8], extra: null, massUnknown: 1 };
    case 'valve-limit': return { point: ([te, tc, sh]) => ({ te, tc, superheatK: sh, liquidKg: 0 }), start: s => [s.te, s.tc, Math.max(s.superheatK, target)], steps: [.01, .01, .01], limits: [8, 8, 8],
      extra: trial => (Math.max(...trial.openings) - 1) * VALVE_SCALE, massUnknown: 1 };
    case 'minimum-lift': return { point: ([te, sh]) => ({ te, tc: te + lift, superheatK: sh, liquidKg: 0 }), start: s => [s.te, Math.max(s.superheatK, target)], steps: [.01, .01], limits: [8, 8], extra: null, massUnknown: 0 };
    case 'condensing-limit': return {
      point: ([te, v]) => ({ te, tc: condensingCeilingC, superheatK: Math.max(v, 0), liquidKg: Math.max(-v, 0) * LIQUID_PER_K }),
      start: s => [s.te, s.liquidKg > 0 ? -s.liquidKg / LIQUID_PER_K : Math.min(s.superheatK, target)], steps: [.01, -.01], limits: [8, 4], extra: null, massUnknown: 1,
      // With condensing held, the evaporator closure is a 1-D problem in te (independent of
      // parked liquid), and pinches sharply near the outdoor metal temperature; coupled Newton
      // misjudges that step. Mass is nearly linear in the EEV variable, so bracketing closes it.
      nestedFirst: true };
    case 'discharge-limit': case 'accumulator': return {
      point: ([te, tc, v]) => ({ te, tc, superheatK: Math.max(v, 0), liquidKg: Math.max(-v, 0) * LIQUID_PER_K }),
      start: s => [s.te, s.tc, s.liquidKg > 0 ? -s.liquidKg / LIQUID_PER_K : Math.min(s.superheatK, target)], steps: [.01, .01, -.01], limits: [8, 8, 4], extra: ceiling, massUnknown: 1 };
  }
}
function solveLinear(a: number[][], b: number[]): number[] | null {
  const n = b.length, m = a.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let pivot = c; for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[pivot][c])) pivot = r;
    if (!(Math.abs(m[pivot][c]) > 1e-12)) return null;
    [m[c], m[pivot]] = [m[pivot], m[c]];
    for (let r = c + 1; r < n; r++) { const f = m[r][c] / m[c][c]; for (let k = c; k <= n; k++) m[r][k] -= f * m[c][k]; }
  }
  const x = Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) { let s = m[r][n]; for (let k = r + 1; k < n; k++) s -= m[r][k] * x[k]; x[r] = s / m[r][r]; }
  return x.every(Number.isFinite) ? x : null;
}

/** Damped finite-difference Newton on scaled residuals (every |r_i| <= tolerance at a root).
 * Probes take the opposite side when one leaves the feasible domain; the line search halves
 * the clamped step down to 1/256 and accepts only a decrease of the residual norm. */
interface NewtonProblem<T> { evaluate: (x: number[]) => T; residual: (value: T) => number[]; steps: number[]; limits: number[]; tolerance: number }
type NewtonResult<T> = { value: T; x: number[]; iterations: number } | { error: string; iterations: number; best: { value: T; x: number[] } | null };
/** Scale a Newton step uniformly so no component exceeds its limit. Clamping components
 * separately would change the step direction, which then need not descend at any length. */
function limitedStep(delta: number[], limits: number[]): number[] {
  const factor = Math.min(1, ...delta.map((d, j) => Math.abs(d) > limits[j] ? limits[j] / Math.abs(d) : 1));
  return delta.map(d => d * factor);
}
/** Forward-difference Jacobian; a probe leaving the feasible domain takes the opposite side. */
function finiteJacobian<T>(problem: NewtonProblem<T>, x: number[], r: number[]): number[][] | null {
  const jacobian: number[][] = r.map(() => Array(x.length).fill(0));
  for (let j = 0; j < x.length; j++) {
    let probe: number[] | null = null, step = problem.steps[j];
    for (const sign of [1, -1]) {
      const y = [...x]; y[j] += sign * problem.steps[j];
      try { probe = problem.residual(problem.evaluate(y)); step = sign * problem.steps[j]; break; } catch { probe = null; }
    }
    if (!probe) return null;
    for (let i = 0; i < r.length; i++) jacobian[i][j] = (probe[i] - r[i]) / step;
  }
  return jacobian;
}
function newton<T>(problem: NewtonProblem<T>, start: number[], initial?: T): NewtonResult<T> {
  let x = start, current: T, iterations = 0, best: { value: T; x: number[]; norm: number } | null = null, lastError = '', previousNorm = Infinity, crawl = 0;
  if (initial !== undefined) current = initial;
  else try { current = problem.evaluate(x); } catch (error) { return { error: error instanceof Error ? error.message : String(error), iterations, best: null }; }
  for (let k = 0; k < 40; k++) {
    iterations++;
    const r = problem.residual(current), norm = Math.hypot(...r);
    if (!best || norm < best.norm) best = { value: current, x, norm };
    if (r.every(v => Math.abs(v) <= problem.tolerance)) return { value: current, x, iterations };
    // Newton converges superlinearly near a regular root; four consecutive steps that each gain
    // less than 10% mean a kink, a boundary or no root here. Stop and let the caller move on.
    crawl = norm > .9 * previousNorm ? crawl + 1 : 0; previousNorm = norm;
    if (crawl >= 4) return { error: `stagnated at residual ${norm.toFixed(3)}`, iterations, best };
    const jacobian = finiteJacobian(problem, x, r);
    if (!jacobian) return { error: 'finite-difference probe rejected on both sides', iterations, best };
    const delta = solveLinear(jacobian, r.map(v => -v));
    if (!delta) return { error: 'singular charge-balance Jacobian', iterations, best };
    const step = limitedStep(delta, problem.limits), along = (scale: number) => x.map((v, j) => v + step[j] * scale);
    let accepted = false, overshoot: { x: number[]; r: number[] } | null = null;
    try {
      const y = along(1), candidate = problem.evaluate(y), ry = problem.residual(candidate);
      if (Math.hypot(...ry) < norm) { x = y; current = candidate; accepted = true; } else overshoot = { x: y, r: ry };
    } catch (error) { lastError = error instanceof Error ? error.message : String(error); }
    // Piecewise-smooth residuals (inventory kinks where a coil outlet crosses saturation): a
    // full step that overshoots usually lands on the side of the kink holding the root, where
    // the local Jacobian differs. One Newton step from there, with that side's Jacobian, is
    // tried before the line search falls back to shorter steps on the original linearization.
    if (!accepted && overshoot) {
      const side = finiteJacobian(problem, overshoot.x, overshoot.r), ys = overshoot.x;
      const correction = side && solveLinear(side, overshoot.r.map(v => -v));
      if (correction) {
        const limited = limitedStep(correction, problem.limits), y = ys.map((v, j) => v + limited[j]);
        try { const candidate = problem.evaluate(y); if (Math.hypot(...problem.residual(candidate)) < norm) { x = y; current = candidate; accepted = true; } }
        catch (error) { lastError = error instanceof Error ? error.message : String(error); }
      }
    }
    for (let scale = .5; !accepted && scale >= 1 / 256; scale /= 2) {
      const y = along(scale);
      try { const candidate = problem.evaluate(y); if (Math.hypot(...problem.residual(candidate)) < norm) { x = y; current = candidate; accepted = true; } }
      catch (error) { lastError = error instanceof Error ? error.message : String(error); }
    }
    if (!accepted) return { error: `line search stalled at residual ${norm.toFixed(3)}${lastError ? ` (${lastError})` : ''}`, iterations, best };
  }
  return { error: 'iteration limit', iterations, best };
}

/** Kink-robust fallback. Stored mass has a slope discontinuity where a coil outlet crosses
 * saturation: Zivi holdup falls steeply with quality just inside the dome. A full Newton step can
 * then alternate between the two sides. Here the mass equation (residual 1) is solved by a
 * bracketed Illinois iteration on one pressure unknown; the remaining equations, smooth in the
 * other unknowns, are solved by Newton at each trial value. Bracketing needs only continuity. */
function solveNested(problem: NewtonProblem<Trial>, massUnknown: number, start: number[]): NewtonResult<Trial> {
  const others = start.map((_, j) => j).filter(j => j !== massUnknown);
  const compose = (t: number, y: number[]) => { const x = [...start]; x[massUnknown] = t; others.forEach((j, k) => { x[j] = y[k]; }); return x; };
  let inner = others.map(j => start[j]), iterations = 0, lastError = 'no bracket';
  type Sample = { t: number; value: number; trial: Trial; x: number[] };
  const at = (t: number): Sample | null => {
    const result = newton<Trial>({ evaluate: y => problem.evaluate(compose(t, y)), residual: trial => problem.residual(trial).filter((_, i) => i !== 1),
      steps: others.map(j => problem.steps[j]), limits: others.map(j => problem.limits[j]), tolerance: problem.tolerance }, inner);
    iterations += result.iterations;
    if ('error' in result) { lastError = result.error; return null; }
    inner = result.x;
    return { t, value: problem.residual(result.value)[1], trial: result.value, x: compose(t, result.x) };
  };
  const done = (p: { trial: Trial; x: number[] }) => ({ value: p.trial, x: p.x, iterations });
  const first = at(start[massUnknown]);
  if (!first) return { error: `nested: ${lastError}`, iterations, best: null };
  let a: Sample = first;
  if (Math.abs(a.value) <= problem.tolerance) return done(a);
  // Step against the mass excess along the local slope sign, doubling up to 32 units.
  const slopeProbe = at(a.t + problem.steps[massUnknown]);
  if (!slopeProbe || slopeProbe.value === a.value) return { error: `nested: ${lastError || 'flat mass response'}`, iterations, best: { value: a.trial, x: a.x } };
  const rising = (slopeProbe.value - a.value) / problem.steps[massUnknown] > 0;
  let b: Sample | null = null, step = .25 * (a.value > 0 === rising ? -1 : 1);
  for (let k = 0; k < 8 && !b; k++, step *= 2) {
    const probe = at(a.t + step);
    if (!probe) { step /= 4; continue; }
    if (Math.abs(probe.value) <= problem.tolerance) return done(probe);
    if (Math.sign(probe.value) !== Math.sign(a.value)) b = probe; else a = probe;
  }
  if (!b) return { error: `nested: ${lastError}`, iterations, best: { value: a.trial, x: a.x } };
  let side = 0;
  for (let k = 0; k < 60; k++) {
    const t = (a.t * b.value - b.t * a.value) / (b.value - a.value);
    const c = at(t);
    if (!c) return { error: `nested: ${lastError}`, iterations, best: { value: a.trial, x: a.x } };
    if (Math.abs(c.value) <= problem.tolerance) return done(c);
    if (Math.sign(c.value) === Math.sign(b.value)) { b = c; if (side === -1) a = { ...a, value: a.value / 2 }; side = -1; }
    else { a = c; if (side === 1) b = { ...b, value: b.value / 2 }; side = 1; }
    if (Math.abs(b.t - a.t) < 1e-9) break;
  }
  return { error: 'nested: bracket collapsed without closing mass', iterations, best: { value: a.trial, x: a.x } };
}

type RegimeResult = { trial: Trial; iterations: number } | { error: string; iterations: number; best: Trial | null };
function solveRegime(properties: Properties, config: EngineConfig, spec: ChargeBalanceSpec, input: CycleInput, regime: ChargeRegime, seeds: Point[], dischargeCeilingC: number, thorough: boolean): RegimeResult {
  const definition = regimeDefinition(regime, input.mode, config.compressor.superheatK, dischargeCeilingC, condensingCeiling(properties));
  const problem: NewtonProblem<Trial> = { evaluate: x => evaluateBalanced(properties, config, spec, input, definition.point(x)),
    residual: trial => definition.extra ? [...trial.residual, definition.extra(trial)] : trial.residual,
    steps: definition.steps, limits: definition.limits, tolerance: config.numerics.pressureToleranceW };
  let iterations = 0, lastError = 'no seed evaluated', best: { value: Trial; x: number[]; norm: number } | null = null;
  // Try the seed closest to this regime's root first: after a regime change the warm and
  // neighbour states can sit on opposite sides of an inventory kink, and Newton started on the
  // far side crawls before it gives up. One evaluation per seed buys the better start.
  const starts = seeds.map(seed => {
    const x = definition.start(seed);
    try { const value = problem.evaluate(x); return { x, value, norm: Math.hypot(...problem.residual(value)) }; }
    catch (error) { lastError = error instanceof Error ? error.message : String(error); return null; }
  }).filter((s): s is { x: number[]; value: Trial; norm: number } => s !== null).sort((a, b) => a.norm - b.norm);
  for (const start of starts) {
    if (definition.nestedFirst) {
      const nested = solveNested(problem, definition.massUnknown, start.x);
      iterations += nested.iterations;
      if (!('error' in nested)) return { trial: nested.value, iterations };
      lastError = nested.error;
    }
    const result = newton(problem, start.x, start.value);
    iterations += result.iterations;
    if (!('error' in result)) return { trial: result.value, iterations };
    lastError = result.error;
    if (result.best) { const norm = Math.hypot(...problem.residual(result.best.value)); if (!best || norm < best.norm) best = { ...result.best, norm }; }
  }
  if (best && thorough) {
    const nested = solveNested(problem, definition.massUnknown, best.x);
    iterations += nested.iterations;
    if (!('error' in nested)) return { trial: nested.value, iterations };
    lastError = `${lastError}; ${nested.error}`;
  }
  return { error: lastError, iterations, best: best?.value ?? null };
}

/** The EEV condensing ceiling, kept inside the fluid's qualified condensing domain and 1 K below
 * the drive's condensing-hold release (domain maximum − 6 K, drive.ts), so an operating point at
 * the ceiling always releases a latched hold. */
function condensingCeiling(properties: Properties): number { return Math.min(CONDENSING_CONTROL_C, properties.refrigerant.domain.maxCondensingC - 7); }
/** Complementarity: each released controller quantity must stay on its feasible side.
 * A rejection names the neighbouring regime whose held quantity was violated. */
function rejection(regime: ChargeRegime, trial: Trial, mode: Mode, target: number, dischargeCeilingC: number, condensingCeilingC: number): { reason: string; next: ChargeRegime | null } | null {
  const opening = Math.max(...trial.openings), { superheatK, liquidKg, te, tc } = trial.point, tol = 1e-6;
  const suction = trial.output.suction, held = regime === 'discharge-limit' || regime === 'accumulator' || regime === 'condensing-limit';
  // At zero superheat the published cooling return is the actual mixed stream, which matches
  // the saturated target only within the 0.1 W evaporator tolerance (quality within ~1e-4).
  if (!(suction.phase === 'vapor' || (held && (suction.qualityMass ?? 0) >= 1 - 1e-3)) || !(trial.output.compressorWorkW > 0)) return { reason: 'suction not dry vapour', next: null };
  if (regime !== 'valve-limit' && opening > 1 + tol) return { reason: `EEV demand ${(opening * 100).toFixed(1)}% exceeds full opening`, next: 'valve-limit' };
  if (regime !== 'minimum-lift' && tc - te < MINIMUM_LIFT[mode] - tol) return { reason: `lift ${(tc - te).toFixed(3)} K below minimum`, next: 'minimum-lift' };
  // Condensing first: holding condensing pressure down also lowers discharge temperature.
  if (regime !== 'condensing-limit' && tc > condensingCeilingC + 1e-3) return { reason: `condensing ${tc.toFixed(2)} °C above EEV ceiling`, next: 'condensing-limit' };
  // A fully open EEV can no longer lower discharge temperature: in valve-limit it is free and
  // only the compressor's own discharge protection (engine) applies.
  if (!held && regime !== 'valve-limit' && trial.output.discharge.temperatureC > dischargeCeilingC + 1e-3) return { reason: `discharge ${trial.output.discharge.temperatureC.toFixed(2)} °C above EEV ceiling`, next: 'discharge-limit' };
  // Both ceilings act on the same EEV variable: the more restrictive (more open) one governs.
  // Once liquid is parked the suction is saturated and opening further cannot cool discharge.
  if (regime === 'condensing-limit' && superheatK > 0 && trial.output.discharge.temperatureC > dischargeCeilingC + 1e-3) return { reason: `discharge ${trial.output.discharge.temperatureC.toFixed(2)} °C above EEV ceiling`, next: 'discharge-limit' };
  if ((regime === 'valve-limit' || regime === 'minimum-lift') && superheatK < target - tol) return { reason: `superheat ${superheatK.toFixed(3)} K below target`, next: 'superheat' };
  if (held && liquidKg === 0 && superheatK > target + tol) return { reason: `superheat ${superheatK.toFixed(3)} K above target`, next: 'superheat' };
  return null;
}

/** Inventory with the superheat target held at a fixed condensing temperature (evaporator
 * closure solved in te). Inventory rises with condensing temperature as liquid fills the
 * condenser, so comparing it with the specified charge locates the superheat-regime root on
 * either side of tcC without solving it. Null when the held state cannot be closed. */
function superheatInventoryAt(properties: Properties, config: EngineConfig, spec: ChargeBalanceSpec, input: CycleInput, tcC: number, te0: number): { kg: number; te: number } | null {
  const held = newton<Trial>({ evaluate: ([te]) => evaluateBalanced(properties, config, spec, input, { te, tc: tcC, superheatK: config.compressor.superheatK, liquidKg: 0 }),
    residual: trial => [trial.residual[0]], steps: [-.01], limits: [4], tolerance: config.numerics.pressureToleranceW }, [Math.min(te0, tcC - MINIMUM_LIFT[input.mode] - .5)]);
  return 'error' in held ? null : { kg: held.value.inventory.totalKg, te: held.value.point.te };
}

/** The most refrigerant any controlled regime can hold: condensing at the EEV ceiling,
 * saturated suction and the accumulator at its liquid limit (evaporator closure solved in te).
 * Inventory rises with condensing temperature and parked liquid and falls with superheat, so a
 * charge above this has no operating point in any regime. Null when it cannot be closed. */
function maximumHeldKg(properties: Properties, config: EngineConfig, spec: ChargeBalanceSpec, input: CycleInput, ceilingC: number, te0: number): number | null {
  const capacityKg = (te: number) => ACCUMULATOR_LIQUID_LIMIT * spec.geometry.accumulatorVolumeM3 * properties.prop('D', 'P', properties.pressureAtSaturationC(te), 'Q', 0);
  const held = newton<Trial>({ evaluate: ([te]) => evaluateBalanced(properties, config, spec, input, { te, tc: ceilingC, superheatK: 0, liquidKg: capacityKg(te) }),
    residual: trial => [trial.residual[0]], steps: [-.01], limits: [4], tolerance: config.numerics.pressureToleranceW }, [Math.min(te0, ceilingC - MINIMUM_LIFT[input.mode] - .5)]);
  return 'error' in held ? null : held.value.inventory.totalKg;
}

export function solveChargeBalancedCycle(properties: Properties, config: EngineConfig, spec: ChargeBalanceSpec, input: CycleInput): CycleOutput {
  if (properties.refrigerant.kind !== 'pure') throw new DomainError('Charge-balanced closure is qualified for pure refrigerants only');
  if (input.active.some((on, i) => on && (config.rooms[i].pipe.lengthM !== 0 || config.rooms[i].pipe.elevationM !== 0))) throw new DomainError('Charge-balanced closure currently requires idealized field-line transport');
  if (!input.active.some(Boolean) || !(input.speedRps > 0)) throw new DomainError('No active refrigerant circuit');
  if (!(spec.massKg > 0 && Number.isFinite(spec.massKg))) throw new DomainError('Specified refrigerant charge must be positive');
  const heating = input.mode === 'heating', target = config.compressor.superheatK, lift = MINIMUM_LIFT[input.mode];
  const dischargeCeilingC = config.compressor.maxDischargeC - DISCHARGE_CONTROL_MARGIN_K;
  const activeMetals = input.indoorMetalC.filter((_, i) => input.active[i]);
  const source = heating ? input.outdoorMetalC : Math.max(...activeMetals), sink = heating ? Math.min(...activeMetals) : input.outdoorMetalC;
  const previous = input.previous;
  const generic = (depth: number, rise: number): Point => ({ te: source - target - depth, tc: Math.max(sink + rise, source - target - depth + lift + .5), superheatK: target, liquidKg: 0 });
  const genericSeeds: Point[] = [generic(3, 6), generic(8, 12), generic(1, 2), generic(15, 20)];
  const warm: Point | null = previous ? { te: previous.evaporatingC, tc: previous.condensingC, superheatK: previous.superheatK ?? target, liquidKg: previous.accumulatorLiquidKg ?? 0 } : null;
  const fallback: ChargeRegime[] = input.defrost ? ['minimum-lift', 'superheat', 'discharge-limit', 'condensing-limit', 'valve-limit'] : ['superheat', 'discharge-limit', 'condensing-limit', 'valve-limit', 'minimum-lift'];
  const canonical = (regime: ChargeRegime): ChargeRegime => regime === 'accumulator' ? 'discharge-limit' : regime;
  let notes: string[] = [], neighbour: Point | null = null, iterations = 0, floodedKg: number | null = null, bestSuperheat: Trial | null = null;
  // Cold start: a flooded circuit is decided by one bound instead of a failed regime walk.
  if (!previous) {
    const ceilingC = condensingCeiling(properties), maximumKg = maximumHeldKg(properties, config, spec, input, ceilingC, source - target - 3);
    if (maximumKg !== null && spec.massKg > maximumKg)
      throw new ChargeProtectionError('high-side flooding', `Charge ${spec.massKg.toFixed(3)} kg exceeds the ${maximumKg.toFixed(3)} kg the circuit holds at the ${ceilingC.toFixed(0)} °C condensing ceiling with a full accumulator`);
  }
  // Pass 1 walks the regimes with nearby seeds and plain Newton only, so a regime change costs a
  // few evaluations. Pass 2 (only if pass 1 found nothing) adds generic seeds and the nested
  // kink-robust fallback to every regime.
  for (const thorough of [false, true]) {
    const tried = new Set<ChargeRegime>();
    let next: ChargeRegime | null = previous?.chargeRegime ? canonical(previous.chargeRegime) : fallback[0];
    notes = [];
    while (next) {
      const regime: ChargeRegime = next; tried.add(regime);
      // Warm and neighbour seeds first; generic seeds only when no nearby state exists.
      const nearby: Point[] = [neighbour, warm].filter((s): s is Point => !!s);
      // Cold superheat entry: if the circuit still holds less than the charge with condensing at
      // the EEV ceiling, the superheat root lies above it; go straight to the condensing limit.
      if (regime === 'superheat' && !nearby.length && !tried.has('condensing-limit')) {
        const ceilingC = condensingCeiling(properties), held = superheatInventoryAt(properties, config, spec, input, ceilingC, source - target - 3);
        if (held !== null && held.kg < spec.massKg) {
          notes.push(`superheat: holds ${held.kg.toFixed(3)} kg at the ${ceilingC.toFixed(0)} °C ceiling`);
          // The held state seeds the condensing limit: the missing mass parks as liquid.
          neighbour = { te: held.te, tc: ceilingC, superheatK: 0, liquidKg: spec.massKg - held.kg };
          next = 'condensing-limit'; continue;
        }
      }
      const result = solveRegime(properties, config, spec, input, regime, nearby.length ? nearby : genericSeeds, dischargeCeilingC, thorough);
      const retry: RegimeResult | null = thorough && 'error' in result && nearby.length ? solveRegime(properties, config, spec, input, regime, genericSeeds, dischargeCeilingC, true) : null;
      const final: RegimeResult = retry && !('error' in retry) ? retry : result;
      iterations += result.iterations + (retry?.iterations ?? 0);
      let hint: ChargeRegime | null = null;
      if ('error' in final) {
        notes.push(`${regime}: ${final.error}`);
        if (regime === 'superheat') bestSuperheat = final.best;
        // A failed solve still points somewhere: the limit its closest trial violates names the
        // next regime (for example condensing running out of domain -> condensing-limit).
        if (final.best) { hint = rejection(regime, final.best, input.mode, target, dischargeCeilingC, condensingCeiling(properties))?.next ?? null; neighbour = final.best.point; }
      } else {
        const verdict = rejection(regime, final.trial, input.mode, target, dischargeCeilingC, condensingCeiling(properties));
        const { output, inventory, openings, point }: Trial = final.trial;
        const capacityKg = ACCUMULATOR_LIQUID_LIMIT * spec.geometry.accumulatorVolumeM3 * properties.prop('D', 'P', output.lowPressureBarAbs * 1e5, 'Q', 0);
        if (!verdict && point.liquidKg > capacityKg) { floodedKg = point.liquidKg; notes.push(`${regime}: ${point.liquidKg.toFixed(3)} kg parked liquid exceeds ${capacityKg.toFixed(3)} kg`); }
        else if (!verdict) {
          const saturationC = properties.saturation(output.highPressureBarAbs * 1e5).temperatureC;
          const reported: ChargeRegime = regime === 'discharge-limit' && point.liquidKg > 0 ? 'accumulator' : regime;
          const diagnostics: ChargeBalanceDiagnostics = { regime: reported, specifiedKg: spec.massKg, inventoryKg: inventory.totalKg, superheatK: point.superheatK,
            condenserSubcoolK: output.condenserOutlet.phase === 'liquid' ? saturationC - output.condenserOutlet.temperatureC : 0,
            condenserOutletQuality: output.condenserOutlet.qualityMass, valveOpenings: openings, accumulatorLiquidKg: point.liquidKg,
            distribution: { outdoorCoilKg: inventory.outdoorCoilKg, accumulatorKg: inventory.accumulatorKg,
              indoorCoilsKg: inventory.rooms.reduce((s, r) => s + r.coilKg, 0), fieldLinesKg: inventory.rooms.reduce((s, r) => s + r.gasLineKg + r.smallLineKg, 0) } };
          return { ...output, iterations, closureResidualW: Math.max(...final.trial.residual.map(Math.abs)), charge: diagnostics };
        } else { notes.push(`${regime}: ${verdict.reason}`); hint = verdict.next; neighbour = point; }
        if (regime === 'superheat') bestSuperheat = final.trial;
      }
      next = hint && !tried.has(hint) ? hint : fallback.find(r => !tried.has(r)) ?? null;
    }
    if (floodedKg !== null) break;
  }
  if (floodedKg === null) {
    const onsetKg = condensationOnsetKg(properties, config, spec, input, bestSuperheat?.point ?? genericSeeds[0]);
    if (onsetKg !== null && spec.massKg < onsetKg)
      throw new ChargeProtectionError('refrigerant shortage', `Charge ${spec.massKg.toFixed(3)} kg is below the ${onsetKg.toFixed(3)} kg needed to condense any liquid at these conditions`);
  }
  if (floodedKg !== null) throw new ChargeProtectionError('high-side flooding', `Charge ${spec.massKg.toFixed(3)} kg floods the circuit: ${floodedKg.toFixed(3)} kg would park in the accumulator`);
  const capC = Math.min(CONDENSING_PROTECTION_C, properties.refrigerant.domain.maxCondensingC - .5);
  const atCap = superheatInventoryAt(properties, config, spec, input, capC, bestSuperheat?.point.te ?? source - target - 3);
  if (atCap !== null && atCap.kg < spec.massKg)
    throw new ChargeProtectionError('high-side flooding', `Charge ${spec.massKg.toFixed(3)} kg exceeds what the circuit holds below ${capC.toFixed(0)} °C condensing`);
  throw new DomainError(`No charge-balanced operating point for ${spec.massKg.toFixed(3)} kg (${notes.join('; ')})`);
}

/** Refrigerant-shortage test. With the superheat target held, the circuit inventory at the
 * onset of condensation (condenser/header outlet just reaching saturated vapour) is the least
 * charge that still delivers any liquid to the EEVs. Below it no condensing operating point
 * exists, and a generic gas-shortage supervisor (low-charge detection) stops the compressor.
 * Returns null when the onset point itself cannot be located, so the failure stays a fault. */
const ONSET_QUALITY = .999, QUALITY_SCALE = 1e4;
function condensationOnsetKg(properties: Properties, config: EngineConfig, spec: ChargeBalanceSpec, input: CycleInput, seed: Point): number | null {
  const target = config.compressor.superheatK, tolerance = config.numerics.pressureToleranceW;
  const quality = (trial: Trial) => { const outlet = trial.output.condenserOutlet; return outlet.qualityMass ?? (outlet.phase === 'liquid' ? 0 : 1); };
  const onset = (trial: Trial) => [trial.residual[0], (quality(trial) - ONSET_QUALITY) * QUALITY_SCALE];
  const evaluate = (te: number, tc: number, superheatK: number) => evaluateBalanced(properties, config, spec, input, { te, tc, superheatK, liquidKg: 0 });
  const held = newton({ evaluate: ([te, tc]) => evaluate(te, tc, target), residual: onset, steps: [.01, .01], limits: [4, 4], tolerance }, [seed.te, seed.tc]);
  if ('error' in held) return null;
  if (Math.max(...held.value.openings) <= 1) return held.value.inventory.totalKg;
  // The EEV saturates before onset: superheat is released with the valve fully open.
  const open = newton({ evaluate: ([te, tc, sh]) => evaluate(te, tc, sh), residual: trial => [...onset(trial), (Math.max(...trial.openings) - 1) * VALVE_SCALE],
    steps: [.01, .01, .01], limits: [4, 4, 4], tolerance }, [held.value.point.te, held.value.point.tc, target]);
  return 'error' in open || open.value.point.superheatK < target ? null : open.value.inventory.totalKg;
}

/** Declared rating points defining the generic nominal charge: all branches on,
 * midpoint compressor speed, fixed coil-metal temperatures. Nominal is the larger
 * of the heating and cooling fixed-subcooling inventories, so neither mode starts
 * undercharged; the other mode holds the excess as subcooling or accumulator liquid. */
export const NOMINAL_RATING_POINTS = {
  heating: { indoorMetalC: 35, outdoorMetalC: 0 },
  cooling: { indoorMetalC: 12, outdoorMetalC: 42 },
} as const;
export function nominalChargeKg(properties: Properties, config: EngineConfig, geometry: BalanceGeometry): { kg: number; heatingKg: number; coolingKg: number } {
  const reference: EngineConfig = { ...config, rooms: config.rooms.map(room => ({ ...room, pipe: { ...room.pipe, lengthM: 0, elevationM: 0 } })) };
  const speedRps = .5 * (config.compressor.speedMinRps + config.compressor.speedMaxRps), n = config.rooms.length;
  const kg = (mode: Mode) => {
    const point = NOMINAL_RATING_POINTS[mode], active = Array(n).fill(true), indoorMetalC = Array(n).fill(point.indoorMetalC);
    const cycle = solveCycle(properties, { ...reference, mode }, { mode, indoorMetalC, outdoorMetalC: point.outdoorMetalC, active, speedRps });
    return circuitInventory(properties, reference, geometry, cycle, { active, indoorMetalC, outdoorMetalC: point.outdoorMetalC }).totalKg;
  };
  const heatingKg = kg('heating'), coolingKg = kg('cooling');
  return { kg: Math.max(heatingKg, coolingKg), heatingKg, coolingKg };
}
