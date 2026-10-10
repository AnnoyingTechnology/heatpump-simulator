import createCoolProp from './release/coolprop.js';

const fluidNames = ['R32', 'R22', 'R134a', 'n-Propane', 'R1234yf', 'R410A', 'R407C'];

export async function runProbe() {
  const started = performance.now();
  const cp = await createCoolProp();
  const initMs = performance.now() - started;
  const prop = (output, k1, v1, k2, v2, fluid) => {
    const value = cp.PropsSI(output, k1, v1, k2, v2, fluid);
    if (!Number.isFinite(value) || Math.abs(value) > 1e100) {
      throw new Error(`Invalid ${output}(${k1}=${v1}, ${k2}=${v2}) for ${fluid}`);
    }
    return value;
  };
  const state = (p, h, fluid) => {
    const quality = prop('Q', 'P', p, 'H', h, fluid);
    return {
    pPa: p, hJkg: h,
    TK: prop('T', 'P', p, 'H', h, fluid),
    sJkgK: prop('S', 'P', p, 'H', h, fluid),
    rhoKgm3: prop('D', 'P', p, 'H', h, fluid),
    quality,
    qualityBasis: 'molar; use massQuality for mass fraction',
    massQuality: quality >= 0 && quality <= 1 ? prop('Qmass', 'P', p, 'H', h, fluid) : null,
    };
  };
  const cycle = (fluid, teC, tcC, shK = 5, scK = 3, etaIs = .7) => {
    const pe = prop('P', 'T', teC + 273.15, 'Q', 1, fluid);
    const pc = prop('P', 'T', tcC + 273.15, 'Q', 0, fluid);
    const h1 = prop('H', 'P', pe, 'T', teC + 273.15 + shK, fluid);
    const s1 = prop('S', 'P', pe, 'T', teC + 273.15 + shK, fluid);
    const h2s = prop('H', 'P', pc, 'S', s1, fluid);
    const h2 = h1 + (h2s - h1) / etaIs;
    const h3 = prop('H', 'P', pc, 'T', tcC + 273.15 - scK, fluid);
    return {
      fluid, teC, tcC, shK, scK, etaIs,
      states: { suction: state(pe, h1, fluid), discharge: state(pc, h2, fluid),
        condenserOutlet: state(pc, h3, fluid), expansionOutlet: state(pe, h3, fluid) },
      specificJkg: { compressor: h2 - h1, evaporator: h1 - h3, condenser: h2 - h3 },
      pressureRatio: pc / pe,
      condenserClosureJkg: (h2 - h3) - (h1 - h3) - (h2 - h1),
      idealizedHeatingCOP: (h2 - h3) / (h2 - h1),
      idealizedCoolingCOP: (h1 - h3) / (h2 - h1),
      evaporatorBubbleTK: prop('T', 'P', pe, 'Q', 0, fluid),
      evaporatorDewTK: prop('T', 'P', pe, 'Q', 1, fluid),
      evaporatorMidQualityTK: prop('T', 'P', pe, 'Q', .5, fluid),
    };
  };
  const report = {
    capturedAt: new Date().toISOString(),
    runtime: typeof navigator === 'object' ? navigator.userAgent : `Node ${process.version}`,
    backendVersion: typeof cp.get_global_param_string === 'function' ? cp.get_global_param_string('version') : 'export unavailable',
    initMs,
    scope: 'Bounded feasibility probe. Synthetic cycle states, not manufacturer performance or a coupled heat-pump model.',
    r32Fixtures: {}, fluids: [], explicitMixtures: [],
  };
  for (const [name, te, tc] of [['heating', -5, 40], ['cooling', 7, 45], ['defrost', 0, 15]]) {
    report.r32Fixtures[name] = cycle('R32', te, tc);
  }
  for (const fluid of fluidNames) {
    try {
      const fixture = cycle(fluid, -5, 40);
      const samples = [];
      let maxRoundTripK = 0;
      for (let i = 0; i < 60; i++) {
        const t = 278.15 + (i % 20) * .1;
        const p = fixture.states.suction.pPa;
        const start = performance.now();
        const h = prop('H', 'P', p, 'T', t, fluid);
        const roundTrip = prop('T', 'P', p, 'H', h, fluid);
        const entropy = prop('S', 'P', p, 'T', t, fluid);
        prop('H', 'P', fixture.states.discharge.pPa, 'S', entropy, fluid);
        samples.push(performance.now() - start);
        maxRoundTripK = Math.max(maxRoundTripK, Math.abs(roundTrip - t));
      }
      samples.sort((a, b) => a - b);
      report.fluids.push({ fluid, fixture, fourCallBatch: { samples: samples.length,
        p50Ms: samples[Math.floor(samples.length * .5)],
        p95Ms: samples[Math.floor(samples.length * .95)],
        maxMs: samples.at(-1) }, maxRoundTripK });
    } catch (error) { report.fluids.push({ fluid, error: String(error) }); }
  }
  // Probe two explicit mole-fraction blends separately from pseudo-pure names.
  for (const fluid of ['HEOS::R32[0.697615]&R125[0.302385]', 'HEOS::R32[0.381109]&R125[0.179559]&R134a[0.439332]']) {
    const result = { fluid, coverage: {} };
    for (const [name, test] of [
      ['dewAt273K', () => prop('P', 'T', 273.15, 'Q', 1, fluid)],
      ['bubbleAt273K', () => prop('P', 'T', 273.15, 'Q', 0, fluid)],
      ['midQualityAt800kPa', () => prop('T', 'P', 800000, 'Q', .5, fluid)],
      ['fullCycle', () => cycle(fluid, -5, 40)],
    ]) {
      try { result.coverage[name] = { value: test() }; }
      catch (error) { result.coverage[name] = { error: String(error) }; }
    }
    report.explicitMixtures.push(result);
  }
  report.totalMs = performance.now() - started;
  return report;
}
