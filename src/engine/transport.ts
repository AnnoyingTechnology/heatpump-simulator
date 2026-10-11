import { DomainError, Properties } from './properties.ts';
import type { RoomConfig } from './types.ts';

export interface PipeResult { pPa: number; hJkg: number; heatToOutdoorW: number; frictionPa: number }
/** Distributed homogeneous-equilibrium pipe model. Reverse integration recovers an upstream
 * state from a specified downstream state; direction always denotes the actual physical flow.
 * Smooth copper Darcy friction; two-phase density is HEOS and viscosity is McAdams harmonic.
 * Slip, fittings, oil, sonic/critical flow and refrigerant inventory transients are outside coverage. */
export function transportPipe(properties: Properties, pPa: number, hJkg: number, massFlow: number,
  pipe: RoomConfig['pipe'], diameterM: number, ambientC: number, physicalRiseM: number, reverse = false): PipeResult {
  if (!(massFlow > 0 && pipe.lengthM >= 0 && diameterM >= .002 && diameterM <= .05 && Math.abs(physicalRiseM) <= pipe.lengthM)) throw new DomainError('Pipe geometry/flow outside transport domain');
  if (pipe.lengthM === 0) return { pPa, hJkg, heatToOutdoorW: 0, frictionPa: 0 };
  const direction = reverse ? -1 : 1, segments = Math.max(2, Math.ceil(pipe.lengthM / 3)), dx = pipe.lengthM / segments;
  const dz = physicalRiseM / segments, area = Math.PI * diameterM ** 2 / 4, flux = massFlow / area;
  const originalH = hJkg, originalP = pPa;
  let frictionPa = 0;
  const data = (p: number, h: number) => {
    properties.assertPressure(p);
    const temperatureC = properties.prop('T', 'P', p, 'H', h) - 273.15;
    const density = properties.prop('D', 'P', p, 'H', h), quality = properties.prop('Q', 'P', p, 'H', h);
    const latentH = properties.saturation(p).vaporH - properties.saturation(p).liquidH;
    if (.5 * (flux / density) ** 2 > .005 * latentH) throw new DomainError('Pipe kinetic energy exceeds 0.5% of latent enthalpy; static-enthalpy transport coverage exhausted');
    if (quality >= 0 && quality <= 1) {
      const lowerDensity = properties.prop('D', 'P', p * .9999, 'H', h);
      const momentumSensitivity = flux ** 2 * (1 / lowerDensity - 1 / density) / (.0001 * p);
      if (momentumSensitivity >= .3) throw new DomainError('Homogeneous two-phase critical-flow margin exhausted');
    }
    const mu = quality >= 0 && quality <= 1 ? 1 / ((1 - quality) / properties.prop('V', 'P', p, 'Q', 0) + quality / properties.prop('V', 'P', p, 'Q', 1)) : properties.prop('V', 'P', p, 'H', h);
    if (quality < 0) {
      const sound = properties.prop('A', 'P', p, 'H', h);
      if (flux / density > .3 * sound) throw new DomainError('Pipe Mach number exceeds low-Mach transport coverage');
    }
    return { temperatureC, density, mu };
  };
  for (let i = 0; i < segments; i++) {
    const startP = pPa, startH = hJkg, start = data(startP, startH);
    let endP = startP, endH = startH, friction = 0, converged = false;
    for (let k = 0; k < 25; k++) {
      const end = data(endP, endH), density = 2 / (1 / start.density + 1 / end.density), viscosity = .5 * (start.mu + end.mu);
      const reynolds = flux * diameterM / viscosity;
      const turbulent = (-1.8 * Math.log10((1.5e-6 / diameterM / 3.7) ** 1.11 + 6.9 / reynolds)) ** -2;
      const laminar = 64 / reynolds, weight = Math.max(0, Math.min(1, (reynolds - 2000) / 2000));
      const factor = laminar * (1 - weight) + turbulent * weight;
      friction = factor * dx / diameterM * flux ** 2 / (2 * density);
      const nextH = startH + direction * (pipe.insulationConductanceWmK * dx * (ambientC - .5 * (start.temperatureC + end.temperatureC)) / massFlow - 9.80665 * dz);
      const nextP = startP - direction * (friction + density * 9.80665 * dz) - flux ** 2 * (1 / end.density - 1 / start.density);
      if (Math.abs(nextP - endP) < .2 && Math.abs(nextH - endH) < .02) { endP = nextP; endH = nextH; converged = true; break; }
      endP = nextP; endH = nextH;
    }
    if (!converged) throw new DomainError('Pipe momentum/enthalpy iteration did not converge (critical-flow or discretization domain)');
    pPa = endP; hJkg = endH; frictionPa += friction;
  }
  if (frictionPa > .2 * Math.min(originalP, pPa)) throw new DomainError('Pipe friction exceeds 20% of local pressure; homogeneous low-loss model unsupported');
  const heatToOutdoorW = -direction * massFlow * (hJkg - originalH) - massFlow * 9.80665 * physicalRiseM;
  return { pPa, hJkg, heatToOutdoorW, frictionPa };
}
