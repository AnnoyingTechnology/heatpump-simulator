import { DomainError, Properties } from './properties.ts';
import { transportPipe } from './transport.ts';
import type { CycleOutput, EngineConfig, Mode, RefrigerantState } from './types.ts';

export interface CycleInput { mode: Mode; indoorMetalC: number[]; outdoorMetalC: number; active: boolean[]; allocationWeights?: number[]; speedRps: number; defrost?: boolean; previous?: { evaporatingC: number; condensingC: number; condenserOutletC?: number; branchMassFlowsKgs?: number[]; pressureJacobian?: CycleOutput['pressureJacobian'] } }
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const GAUSS4 = [[-.8611363115940526,.3478548451374538],[-.3399810435848563,.6521451548625461],
  [.3399810435848563,.6521451548625461],[.8611363115940526,.3478548451374538]];

/** Required ref/metal conductance per kg/s, ∫dh/|T_ref(h)−T_metal|.
 * Pure-fluid latent zone is exact; sensible zones integrate real EOS cp in log(terminal approach).
 * A nonpositive terminal approach is a physical infeasibility, never an artificial minimum ΔT. */
export function conductanceIntegral(properties: Properties, pressurePa: number, h1: number, h2: number, metalC: number): number {
  const sat = properties.saturation(pressurePa), low = Math.min(h1, h2), high = Math.max(h1, h2);
  const direction = h1 > h2 ? 1 : -1;
  const endpoint = (h: number) => properties.prop('T', 'P', pressurePa, 'H', h) - 273.15;
  if (direction * (endpoint(h1) - metalC) <= 0 || direction * (endpoint(h2) - metalC) <= 0) throw new DomainError('Heat-exchanger terminal temperature pinch');
  const knots = [low, ...[sat.liquidH, sat.vaporH].filter(h => h > low && h < high), high];
  let integral = 0;
  for (let i = 1; i < knots.length; i++) {
    const a = knots[i - 1], b = knots[i];
    if (a >= sat.liquidH && b <= sat.vaporH) integral += (b - a) / Math.abs(sat.temperatureC - metalC);
    else {
      // dh=cp dT; dh/|T−Tm| = cp d(log|T−Tm|). This resolves the logarithmic endpoint singularity.
      const z1 = Math.log(Math.abs(endpoint(a) - metalC)), z2 = Math.log(Math.abs(endpoint(b) - metalC));
      const zl = Math.min(z1, z2), zh = Math.max(z1, z2), intervals = Math.max(1, Math.ceil((zh - zl) / .5));
      for (let part = 0; part < intervals; part++) {
        const za = zl + (zh - zl) * part / intervals, zb = zl + (zh - zl) * (part + 1) / intervals;
        const mid = .5 * (za + zb), half = .5 * (zb - za);
        for (const [node, weight] of GAUSS4) {
          const temperatureK = metalC + direction * Math.exp(mid + node * half) + 273.15;
          // This interval's phase is known from its enthalpy knots. Explicit
          // phase selection avoids the native PT saturation ambiguity band
          // without moving the quadrature temperature or changing the EOS.
          const phaseKey = b <= sat.liquidH ? 'T|liquid' : 'T|gas';
          // Plain PT retains the reusable native state away from saturation.
          // The broad 0.01 K query-selection band changes no physical state.
          const key = Math.abs(temperatureK-273.15-sat.temperatureC)<.01 ? phaseKey : 'T';
          integral += half * weight * properties.prop('C', 'P', pressurePa, key, temperatureK);
        }
      }
    }
  }
  if (!(integral > 0 && Number.isFinite(integral))) throw new DomainError('Invalid coil conductance integral'); return integral;
}

/** Forward condenser closure with a bounded terminal temperature error. When the exponential
 * approach is below 1e-5 K, the limiting outlet is returned: its heat error is <m cp 1e-5 K.
 * This is numerical resolution of finite-UA equilibrium, not a minimum artificial driving ΔT. */
export function coilOutletH(properties: Properties, p: number, inletH: number, flow: number, ua: number, metalC: number, condensing: boolean): number {
  const sat = properties.saturation(p);
  // A parallel heating branch may only desuperheat when its metal is above
  // saturation; colder branches can still close a liquid mixed header. The
  // finite-UA integral determines crossed phases, rather than requiring every
  // branch to change phase. Each branch must retain its intended heat direction.
  const inletC = properties.prop('T', 'P', p, 'H', inletH) - 273.15;
  if ((condensing ? 1 : -1) * (inletC - metalC) <= 0) throw new DomainError('Coil inlet cannot exchange heat in the intended direction');
  if (!(flow > 0 && ua > 0 && Number.isFinite(flow) && Number.isFinite(ua))) throw new DomainError('Invalid coil flow or conductance');
  const terminalC = metalC + (condensing ? 1e-5 : -1e-5);
  const sensibleH = (tC: number) => properties.prop('H', 'P', p, Math.abs(tC-sat.temperatureC)<.01 ? (tC < sat.temperatureC ? 'T|liquid' : 'T|gas') : 'T', tC + 273.15);
  const terminal = sensibleH(terminalC);
  const direction = condensing ? -1 : 1;
  const low = Math.min(inletH, terminal), high = Math.max(inletH, terminal);
  const phaseBoundaries = [sat.liquidH, sat.vaporH].filter(h => h > low && h < high).sort((a,b) => direction * (a-b));
  let origin = inletH, target = ua / flow;
  const ends = [...phaseBoundaries, terminal];
  let panels = 0;
  while (ends.length) {
    if (++panels > 128) throw new DomainError('Coil outlet integration exceeded work limit');
    let end = ends[0];
    // Walk the final sensible zone in the integral's existing <=0.5 logarithmic
    // panels. Usually the outlet is reached long before the limiting 1e-5 K
    // approach; evaluating that whole tail for every pressure trial is unnecessary.
    if (end === terminal) {
      const approach = Math.abs(properties.prop('T','P',p,'H',origin)-273.15-metalC);
      if (approach > 1e-5 * Math.exp(.5))
        end = sensibleH(metalC - direction * approach * Math.exp(-.5));
    }
    const required = conductanceIntegral(properties, p, origin, end, metalC);
    if (target >= required) { target -= required; origin = end; if (end === ends[0]) ends.shift(); continue; }
    // The pure-fluid latent interval is linear in enthalpy and can be inverted exactly.
    if (Math.min(origin,end) >= sat.liquidH && Math.max(origin,end) <= sat.vaporH)
      return origin + direction * target * Math.abs(sat.temperatureC - metalC);
    // A sensible interval is monotone. Safeguarded Newton uses dI/dh=1/|T-Tmetal|;
    // no repeated integration over previously crossed phases is needed.
    const span = end - origin;
    const maxApproach = Math.max(...[origin,end].map(h => Math.abs(properties.prop('T','P',p,'H',h)-273.15-metalC)));
    let lower = 0, upper = 1, fraction = .5;
    for (let i = 0; i < 60; i++) {
      const h = origin + fraction * span;
      const residual = conductanceIntegral(properties,p,origin,h,metalC) - target;
      // Positive cp makes temperature monotone on this single-phase interval.
      // |dh_error| <= |I_error| max|T-Tmetal| bounds outlet heat error to 1 µW.
      if (Math.abs(residual) * maxApproach * flow <= 1e-6) return h;
      if (residual > 0) upper = fraction; else lower = fraction;
      if ((upper-lower) * Math.abs(span) * flow <= 2e-6) return origin + .5*(lower+upper)*span;
      const approach = Math.abs(properties.prop('T','P',p,'H',h)-273.15-metalC);
      const next = fraction - residual * approach / Math.abs(span);
      fraction = next > lower && next < upper ? next : .5*(lower+upper);
    }
    throw new DomainError('Coil outlet enthalpy closure did not converge');
  }
  return terminal;
}
export function condenserOutletH(properties: Properties, p: number, inletH: number, flow: number, ua: number, metalC: number): number { return coilOutletH(properties,p,inletH,flow,ua,metalC,true); }

interface Trial { residual: [number, number]; output: Omit<CycleOutput, 'iterations'> }
/** Two shared saturation-pressure unknowns; branch flows are eliminated using coil UA closures. */
export function solveCycle(properties: Properties, config: EngineConfig, input: CycleInput): CycleOutput {
  if(input.mode==='heating'){
    // The idealized shared-header controller can release SC at its existing
    // positive minimum lift. This is a declared alternate controller regime;
    // both regimes must freshly close the same actual EOS/UA balances.
    const idealized=input.active.every((on,i)=>!on||(config.rooms[i].pipe.lengthM===0&&config.rooms[i].pipe.elevationM===0));
    if(!idealized)return solvePressureRegime(properties,config,input,false);
    const floatingFirst=input.previous?.pressureJacobian?.floatingCondenser??false;
    let first:unknown;
    try{return solvePressureRegime(properties,config,input,floatingFirst);}catch(error){first=error;}
    try{return solvePressureRegime(properties,config,input,!floatingFirst);}catch(error){throw new DomainError(`Neither heating SC-target nor minimum-lift controller closes: ${first instanceof Error?first.message:first}; alternate: ${error instanceof Error?error.message:error}`);}
  }
  // Complementary controller regimes: SC target with >=8 K lift, or minimum lift with floating SC.
  // The second regime releases subcooling only when the fixed target has no feasible pressure closure.
  const floatingFirst = !!input.defrost || !!(input.previous && Math.abs(input.previous.condensingC-input.previous.evaporatingC-8)<.001);
  let first: unknown;
  try { return solvePressureRegime(properties, config, input, floatingFirst); } catch(error) { first=error; }
  try { return solvePressureRegime(properties, config, input, !floatingFirst); } catch(error) { throw new DomainError(`Neither SC-target nor minimum-lift controller closes: ${first instanceof Error ? first.message : first}; alternate: ${error instanceof Error ? error.message : error}`); }
}
function solvePressureRegime(properties: Properties, config: EngineConfig, input: CycleInput, floatingCondenser: boolean): CycleOutput {
  const activeIndices = input.active.flatMap((a, i) => a ? [i] : []);
  if (!activeIndices.length || !(input.speedRps > 0)) throw new DomainError('No active refrigerant circuit');
  const compressor = config.compressor, heating = input.mode === 'heating';
  const idealizedBranches = activeIndices.every(i=>config.rooms[i].pipe.lengthM===0 && config.rooms[i].pipe.elevationM===0);
  const allocatedCooling = !heating && idealizedBranches, allocatedHeating = heating && idealizedBranches;
  const sourceMetal = heating ? [input.outdoorMetalC] : activeIndices.map(i => input.indoorMetalC[i]);
  const sinkMetal = heating ? activeIndices.map(i => input.indoorMetalC[i]) : [input.outdoorMetalC];
  const lowMax = Math.min(45, Math.min(...sourceMetal) - (allocatedCooling ? 0 : compressor.superheatK) - 1e-5);
  const floatSink=heating?Math.min(...sinkMetal):input.outdoorMetalC;
  // Allocated heating constrains the mixed liquid outlet, not each branch's
  // phase: its target must remain above the coldest sink. Physical field-line
  // heating still prescribes per-branch subcooling against the hottest sink.
  const highMin = floatingCondenser ? floatSink + 1e-5 : Math.max(-5, (allocatedHeating ? Math.min(...sinkMetal) : Math.max(...sinkMetal)) + compressor.subcoolK + 1e-5);
  if (lowMax <= -40 || highMin >= 65) throw new DomainError('Coil temperatures exceed selected subcritical R32 operating envelope');
  const evaluate = (te: number, second: number): Trial => {
    // The alternate controller holds the declared positive saturation lift
    // (heating1K, cooling/defrost8K);
    // condenser outlet enthalpy and subcooling follow actual finite UA.
    const tc = floatingCondenser ? te + (heating?1:8) : second;
    const condenserOutletC = floatingCondenser ? second : tc - compressor.subcoolK;
    if (!(te >= -40 && te <= lowMax && second >= highMin && tc <= 65 && (floatingCondenser || tc - te >= (heating ? 1 : 8)) && condenserOutletC < tc - .001 && (!floatingCondenser || condenserOutletC > floatSink))) throw new DomainError('Pressure-solve point outside coil/domain bounds');
    const pL = properties.pressureAtSaturationC(te), pH = properties.pressureAtSaturationC(tc);
    let suction = properties.pt(pL, te + compressor.superheatK);
    const targetSuctionH = suction.hJkg, allocatedFlow = suction.densityKgm3 * compressor.displacementM3rev * input.speedRps * compressor.volumetricEfficiency;
    const weight=(i:number)=>input.allocationWeights?.[i]??config.rooms[i].refrigerantConductanceWK;
    const allocationWeight = activeIndices.reduce((total,i)=>total+weight(i),0);
    if(!(allocationWeight>0)||activeIndices.some(i=>!(weight(i)>0&&Number.isFinite(weight(i)))))throw new DomainError('Invalid generic branch allocation weight');
    const h2s = properties.prop('H', 'P', pH, 'S', suction.entropyJkgK);
    let discharge = properties.ph(pH, suction.hJkg + (h2s - suction.hJkg) / compressor.isentropicEfficiency);
    if (discharge.temperatureC > compressor.maxDischargeC || pH / pL > compressor.maxPressureRatio) throw new DomainError('Generic compressor discharge/pressure-ratio envelope exceeded');
    let condenserOutlet = properties.pt(pH, condenserOutletC);
    const targetCondenserH = condenserOutlet.hJkg;
    let expansionOutlet = properties.ph(pL, condenserOutlet.hJkg);
    const flows = config.rooms.map(() => 0), branchHeat = config.rooms.map(() => 0), pressureDrops = config.rooms.map(() => 0);
    const inlets: RefrigerantState[] = [], outlets: RefrigerantState[] = [];
    let lineHeat = 0, mixedReturnH = 0;
    for (let i = 0; i < config.rooms.length; i++) {
      const room = config.rooms[i], pipe = room.pipe;
      let inlet = heating ? discharge : expansionOutlet, outlet = heating ? condenserOutlet : suction;
      if (input.active[i] && allocatedHeating) {
        // Declared generic UA-proportional allocation; branch outlets follow finite UA.
        flows[i] = allocatedFlow * weight(i) / allocationWeight;
        outlet = properties.ph(pH, coilOutletH(properties, pH, discharge.hJkg, flows[i], room.refrigerantConductanceWK, input.indoorMetalC[i], true));
        branchHeat[i] = flows[i] * (discharge.hJkg - outlet.hJkg);
        mixedReturnH += flows[i] * outlet.hJkg;
      } else if (input.active[i] && allocatedCooling) {
        flows[i] = allocatedFlow * weight(i) / allocationWeight;
        inlet = properties.ph(pL, condenserOutlet.hJkg);
        outlet = properties.ph(pL, coilOutletH(properties, pL, inlet.hJkg, flows[i], room.refrigerantConductanceWK, input.indoorMetalC[i], false));
        branchHeat[i] = flows[i] * (inlet.hJkg - outlet.hJkg);
      } else if (input.active[i]) {
        let flow = input.previous?.branchMassFlowsKgs?.[i] || room.refrigerantConductanceWK / conductanceIntegral(properties, heating ? pH : pL, inlet.hJkg, outlet.hJkg, input.indoorMetalC[i]);
        let returnH = outlet.hJkg, heat = 0, drop = 0, converged = false;
        for (let k = 0; k < 16; k++) {
          if (heating) {
            const gas = transportPipe(properties, pH, discharge.hJkg, flow, pipe, pipe.gasInsideDiameterM, config.outdoorTemperatureC, pipe.elevationM);
            inlet = properties.ph(gas.pPa, gas.hJkg);
            const localSat = properties.saturation(gas.pPa);
            outlet = properties.pt(gas.pPa, localSat.temperatureC - compressor.subcoolK);
            const liquid = transportPipe(properties, outlet.pPa, outlet.hJkg, flow, pipe, pipe.liquidInsideDiameterM, config.outdoorTemperatureC, -pipe.elevationM);
            if (liquid.pPa <= pL) throw new DomainError('Heating liquid line has no expansion-valve pressure authority');
            returnH = liquid.hJkg; heat = gas.heatToOutdoorW + liquid.heatToOutdoorW; drop = gas.frictionPa + liquid.frictionPa;
          } else {
            // Generic EEV target: every returning branch reaches the shared suction superheat.
            const gas = transportPipe(properties, pL, suction.hJkg, flow, pipe, pipe.gasInsideDiameterM, config.outdoorTemperatureC, -pipe.elevationM, true);
            outlet = properties.ph(gas.pPa, gas.hJkg);
            let startP = gas.pPa, small = transportPipe(properties, startP, condenserOutlet.hJkg, flow, pipe, pipe.liquidInsideDiameterM, config.outdoorTemperatureC, pipe.elevationM);
            for (let j = 0; j < 8 && Math.abs(small.pPa - gas.pPa) > .2; j++) {
              startP += gas.pPa - small.pPa;
              if (startP >= pH) throw new DomainError('Cooling small-line pressure loss exhausts expansion-valve authority');
              small = transportPipe(properties, startP, condenserOutlet.hJkg, flow, pipe, pipe.liquidInsideDiameterM, config.outdoorTemperatureC, pipe.elevationM);
            }
            if (Math.abs(small.pPa - gas.pPa) > .2) throw new DomainError('Cooling EEV/field-line pressure closure did not converge');
            inlet = properties.ph(gas.pPa, small.hJkg); returnH = suction.hJkg;
            heat = gas.heatToOutdoorW + small.heatToOutdoorW; drop = gas.frictionPa + small.frictionPa;
          }
          if (heating ? inlet.hJkg <= outlet.hJkg : outlet.hJkg <= inlet.hJkg) throw new DomainError('Field-line heat/pressure effects reverse the intended indoor coil heat direction');
          const next = room.refrigerantConductanceWK / conductanceIntegral(properties, inlet.pPa, inlet.hJkg, outlet.hJkg, input.indoorMetalC[i]);
          if (Math.abs(next - flow) < 1e-8) { converged = true; break; }
          flow = next;
        }
        if (!converged) throw new DomainError('Branch flow/pipe/coil coupled closure did not converge');
        flows[i] = flow; branchHeat[i] = flow * (inlet.hJkg - outlet.hJkg);
        pressureDrops[i] = drop; lineHeat += heat; mixedReturnH += flow * returnH;
      }
      inlets.push(inlet); outlets.push(outlet);
    }
    const totalFlow = flows.reduce((a, b) => a + b, 0);
    let superheatResidual = 0, subcoolResidual = 0;
    if (allocatedHeating) {
      const mixedH = mixedReturnH / totalFlow;
      subcoolResidual = totalFlow * (mixedH - targetCondenserH);
      condenserOutlet = properties.ph(pH, mixedH);
    }
    if (allocatedCooling) {
      const mixedH = flows.reduce((total,flow,i)=>total+flow*outlets[i].hJkg,0)/totalFlow;
      superheatResidual = totalFlow * (mixedH-targetSuctionH);
      suction = properties.ph(pL,mixedH);
      const actualIsentropicH = properties.prop('H','P',pH,'S',suction.entropyJkgK);
      discharge = properties.ph(pH,suction.hJkg+(actualIsentropicH-suction.hJkg)/compressor.isentropicEfficiency);
      if (discharge.temperatureC>compressor.maxDischargeC) throw new DomainError('Actual mixed-return compressor discharge envelope exceeded');
    }
    if (heating) expansionOutlet = properties.ph(pL, mixedReturnH / totalFlow);
    const compressorFlow = suction.densityKgm3 * compressor.displacementM3rev * input.speedRps * compressor.volumetricEfficiency;
    const outdoorIn = heating ? expansionOutlet : discharge, outdoorOut = heating ? suction : condenserOutlet;
    const outdoorHeat = totalFlow * (outdoorIn.hJkg - outdoorOut.hJkg);
    const compressorWork = totalFlow * (discharge.hJkg - suction.hJkg), electric = compressorWork / compressor.driveEfficiency;
    const massResidual = totalFlow - compressorFlow;
    const outdoorResidual = totalFlow * (outdoorOut.hJkg - coilOutletH(properties, heating ? pL : pH, outdoorIn.hJkg, totalFlow, config.outdoor.refrigerantConductanceWK, input.outdoorMetalC, !heating));
    const residual: [number, number] = [allocatedCooling ? superheatResidual : allocatedHeating ? subcoolResidual : massResidual * 250000, outdoorResidual];
    return { residual, output: { mode: input.mode, evaporatingC: te, condensingC: tc, lowPressureBarAbs: pL / 1e5, highPressureBarAbs: pH / 1e5,
      suction, discharge, condenserOutlet, expansionOutlet, totalMassFlowKgs: totalFlow, branchMassFlowsKgs: flows, branchCoilHeatW: branchHeat,
      outdoorCoilHeatW: outdoorHeat, branchInlets: inlets, branchOutlets: outlets,
      condenserHeatW: heating ? branchHeat.reduce((a, b) => a + b, 0) : outdoorHeat,
      evaporatorHeatW: heating ? -outdoorHeat : -branchHeat.reduce((a, b) => a + b, 0),
      compressorWorkW: compressorWork, compressorElectricalW: electric, driveLossW: electric - compressorWork,
      massResidualKgs: massResidual, closureResidualW: Math.max(...residual.map(Math.abs)), lineHeatToOutdoorW: lineHeat,
      pressureDropsPa: pressureDrops, transportMethod: 'Distributed Darcy/HEOS homogeneous-equilibrium field lines; generic smooth copper, no slip/fittings/oil' } };
  };
  const rejections = new Set<string>();
  let lastRejection = '';
  let best: { te: number; tc: number; trial: Trial; norm: number } | null = null;
  const seeds = floatingCondenser ? [input.previous?.condenserOutletC !== undefined ? [input.previous.evaporatingC, input.previous.condenserOutletC] : null, [heating?Math.min(lowMax-.1,Math.max(...sinkMetal)+2):Math.min(lowMax-4,input.outdoorMetalC+5),floatSink+.1], [heating?lowMax-.01:Math.min(lowMax-8,input.outdoorMetalC),floatSink+.01], [lowMax-(heating?1:8),floatSink+1]].filter((s): s is number[] => !!s) : [input.previous ? [input.previous.evaporatingC, input.previous.condensingC] : null,
    [lowMax-.1,highMin+.1], [lowMax-.01,highMin+2], [lowMax - 5, highMin + 8], [lowMax - 12, highMin + 5], [lowMax - 3, Math.max(highMin + 18, lowMax + 5)], [Math.min(lowMax - 5, highMin - 8), highMin + 6],
    [Math.min(lowMax - 15, highMin - 12), Math.max(highMin + 3, lowMax - 10)]].filter((s): s is number[] => !!s);
  let iterations = 0;
  for (const seed of seeds) {
    let te = clamp(seed[0], -39.8, lowMax - .01), tc = clamp(seed[1], highMin + 1e-8, 64.8);
    let jacobian = seed === seeds[0] ? input.previous?.pressureJacobian : undefined;
    if (jacobian?.mode !== input.mode || jacobian.floatingCondenser !== floatingCondenser) jacobian = undefined;
    for (let k = 0; k < 35; k++) {
      iterations++;
      let current: Trial; try { current = evaluate(te, tc); } catch(error) { lastRejection = error instanceof Error ? error.message : String(error); rejections.add(lastRejection); break; }
      const norm = Math.hypot(...current.residual);
      if (!best || norm < best.norm) best = { te, tc, trial: current, norm };
      if (Math.max(...current.residual.map(Math.abs)) <= config.numerics.pressureToleranceW && Math.abs(current.output.massResidualKgs)*250000 <= config.numerics.pressureToleranceW && current.output.suction.phase === 'vapor' && (!floatingCondenser||!heating||current.output.condenserOutlet.phase==='liquid') && current.output.compressorWorkW>0) return { ...current.output, iterations, pressureJacobian: jacobian };
      // A lightly fed hot branch can finish condensation within millikelvins
      // of its metal temperature. Keep pressure differences on the current
      // side of each branch saturation boundary so the local slope resolves
      // that transition instead of averaging it with sensible-only cooling.
      const phaseDistance = allocatedHeating ? sinkMetal.map(t => floatingCondenser ? t-(te+1) : tc-t).filter(d => d > 0) : [];
      const dt = Math.min(.025, Math.max(1e-9, .2 * Math.min(lowMax-te, ...(floatingCondenser ? phaseDistance : []))));
      const dc = floatingCondenser ? .025 : -Math.min(.025, Math.max(1e-9, .2 * Math.min(tc-highMin, ...phaseDistance)));
      let accepted = false;
      // Continuation can reuse the previous local slope for its first correction.
      // Failed/invalid cached directions retry a fresh finite-difference Jacobian.
      for (const cached of k === 0 && jacobian ? [true,false] : [false]) {
        if (!cached) {
          let tTrial: Trial, cTrial: Trial, deltaT=dt, deltaC=dc;
          // At the declared minimum lift, forward Te/backward Tc probes cross
          // the feasible boundary. Try the opposite one-sided derivative before
          // abandoning a valid seed; every probe still obeys evaluate's bounds.
          try { try { tTrial=evaluate(te+dt,tc); } catch { deltaT=-dt;tTrial=evaluate(te-dt,tc); }
            try { cTrial=evaluate(te,tc+dc); } catch { deltaC=-dc;cTrial=evaluate(te,tc-dc); }
          } catch { break; }
          jacobian = { mode: input.mode, floatingCondenser, matrix: [(tTrial.residual[0]-current.residual[0])/deltaT, (cTrial.residual[0]-current.residual[0])/deltaC,
            (tTrial.residual[1]-current.residual[1])/deltaT, (cTrial.residual[1]-current.residual[1])/deltaC] };
        }
        const [a,b,c,e] = jacobian!.matrix;
        const determinant = a * e - b * c; if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-10) continue;
        const stepT = (-e * current.residual[0] + b * current.residual[1]) / determinant;
        const stepC = (c * current.residual[0] - a * current.residual[1]) / determinant;
        for (let scale = 1; scale >= 1 / 128; scale /= 2) {
          const candidateT = clamp(te + clamp(stepT, -12, 12) * scale, -39.9, lowMax - 1e-9);
          const candidateC = clamp(tc + clamp(stepC, -12, 12) * scale, highMin + 1e-9, 64.9);
          try { const candidate = evaluate(candidateT, candidateC); if (Math.hypot(...candidate.residual) < norm) { te = candidateT; tc = candidateC; accepted = true; break; } } catch { /* bounded line-search rejection */ }
        }
        if (accepted) break;
      }
      if (!accepted) break;
    }
  }
  throw new DomainError(`No feasible shared-pressure operating point (${best ? `best residual ${best.norm.toFixed(1)} W at ${best.te.toFixed(6)},${best.tc.toFixed(6)}; equations ${best.trial.residual.map(x=>x.toFixed(3)).join(",")}` : `all starts rejected: ${[...rejections].join("; ")}`})`);
}
