import { DomainError, Properties } from './properties.ts';
import type { CycleOutput, EngineConfig, RefrigerantState } from './types.ts';

/** Generic refrigerant-side volumes for the quasi-steady charge-balanced closure.
 * Field-line volumes are physical (configured length) even when line transport is idealized. */
export interface BalanceGeometry {
  outdoorCoilVolumeM3: number;
  accumulatorVolumeM3: number;
  rooms: { coilVolumeM3: number; gasLineVolumeM3: number; smallLineVolumeM3: number }[];
}
export interface InventoryBreakdown {
  totalKg: number; outdoorCoilKg: number; accumulatorKg: number;
  rooms: { coilKg: number; gasLineKg: number; smallLineKg: number }[];
}
const GAUSS4 = [[-.8611363115940526,.3478548451374538],[-.3399810435848563,.6521451548625461],
  [.3399810435848563,.6521451548625461],[.8611363115940526,.3478548451374538]];

/** Zivi (1964) minimum-entropy-production slip: S=(rho_l/rho_v)^(1/3).
 * alpha(x) = x/(x+(1-x)c), c=(rho_v/rho_l)^(2/3). Declared generic holdup closure, not fitted. */
function zivi(sat: { rhoL: number; rhoV: number }) { return (sat.rhoV / sat.rhoL) ** (2 / 3); }
/** Exact ∫alpha dx for the Zivi void fraction. */
function voidIntegral(c: number, x: number): number {
  const d = c + x * (1 - c);
  return (d - c * Math.log(d)) / (1 - c) ** 2;
}
interface SaturationDensities { liquidH: number; vaporH: number; temperatureC: number; rhoL: number; rhoV: number }
function saturationDensities(properties: Properties, p: number): SaturationDensities {
  const sat = properties.saturation(p);
  return { liquidH: sat.liquidH, vaporH: sat.vaporH, temperatureC: sat.temperatureC,
    rhoL: properties.prop('D', 'P', p, 'Q', 0), rhoV: properties.prop('D', 'P', p, 'Q', 1) };
}
/** Slip-corrected mean density of a uniform stored state. */
export function storedDensity(properties: Properties, state: RefrigerantState): number {
  if (state.phase !== 'two-phase') return state.densityKgm3;
  const sat = saturationDensities(properties, state.pPa), x = (state.hJkg - sat.liquidH) / (sat.vaporH - sat.liquidH);
  const c = zivi(sat), alpha = x / (x + (1 - x) * c);
  return alpha * sat.rhoV + (1 - alpha) * sat.rhoL;
}

/** Refrigerant mass in a finite-UA coil with uniform conductance per unit length.
 * Position follows cumulative conductance: dz=(flow/UA) dh/|T(h)-Tm|. The heat-exchange
 * path occupies zUsed<=1; any remaining length holds the outlet state (pinched approach). */
export function coilInventoryKg(properties: Properties, p: number, inletH: number, outletH: number, flow: number, ua: number, metalC: number, volumeM3: number): number {
  if (properties.refrigerant.kind !== 'pure') throw new DomainError('Charge-balanced inventory is qualified for pure refrigerants only');
  if (!(flow > 0 && ua > 0 && volumeM3 > 0)) throw new DomainError('Invalid coil inventory inputs');
  const sat = saturationDensities(properties, p), low = Math.min(inletH, outletH), high = Math.max(inletH, outletH);
  const knots = [low, ...[sat.liquidH, sat.vaporH].filter(h => h > low && h < high), high];
  const temperatureC = (h: number) => properties.prop('T', 'P', p, 'H', h) - 273.15;
  let conductance = 0, massWeighted = 0;
  for (let i = 1; i < knots.length; i++) {
    const a = knots[i - 1], b = knots[i];
    if (b - a <= 0) continue;
    if (a >= sat.liquidH && b <= sat.vaporH) {
      const approach = Math.abs(sat.temperatureC - metalC), span = sat.vaporH - sat.liquidH, c = zivi(sat);
      const xa = (a - sat.liquidH) / span, xb = (b - sat.liquidH) / span;
      const alphaIntegral = voidIntegral(c, xb) - voidIntegral(c, xa);
      conductance += (b - a) / approach;
      massWeighted += span * (sat.rhoL * (xb - xa) - (sat.rhoL - sat.rhoV) * alphaIntegral) / approach;
    } else {
      // dh=cp dT; integrate cp and rho*cp in log(|T-Tm|), as in conductanceIntegral. Panel
      // boundaries sit on a fixed 0.5 grid in that coordinate, so moving endpoints changes
      // only the end panels: the inventory stays continuous for the pressure Newton solve.
      const ta = temperatureC(a), tb = temperatureC(b), direction = ta > metalC ? 1 : -1;
      if ((ta - metalC) * (tb - metalC) <= 0) throw new DomainError('Coil inventory profile crosses its metal temperature');
      const z1 = Math.log(Math.abs(ta - metalC)), z2 = Math.log(Math.abs(tb - metalC));
      const zl = Math.min(z1, z2), zh = Math.max(z1, z2), edges = [zl];
      for (let g = Math.floor(zl / .5) + 1; g * .5 < zh; g++) edges.push(g * .5);
      edges.push(zh);
      const liquid = b <= sat.liquidH, boundaryC = sat.temperatureC;
      for (let part = 1; part < edges.length; part++) {
        const za = edges[part - 1], zb = edges[part], mid = .5 * (za + zb), half = .5 * (zb - za);
        for (const [node, weight] of GAUSS4) {
          const temperatureK = metalC + direction * Math.exp(mid + node * half) + 273.15;
          const key = Math.abs(temperatureK - 273.15 - boundaryC) < .01 ? (liquid ? 'T|liquid' : 'T|gas') : 'T';
          const cp = properties.prop('C', 'P', p, key, temperatureK), rho = properties.prop('D', 'P', p, key, temperatureK);
          conductance += half * weight * cp; massWeighted += half * weight * cp * rho;
        }
      }
    }
  }
  const used = flow / ua * conductance;
  // coilOutletH bounds outlet heat to µW, but in a deep pinch (approach ~1e-5 K) its
  // enthalpy tolerance spans up to ~2e-4 of the coil length. Accept that band with margin,
  // never a materially overfull coil.
  if (!(used <= 1 + 1e-3)) throw new DomainError(`Coil profile requires ${used.toFixed(5)} of its physical length`);
  // The coil length not covered by the profile holds the outlet state. This also applies,
  // with opposite sign, to the tiny overshoot left by the outlet solver's enthalpy tolerance:
  // in a deep pinch that tolerance moves the outlet along the coil, but only through fluid at
  // the outlet density, so the stored mass is insensitive to it and stays smooth.
  return volumeM3 * (flow / ua * massWeighted + (1 - used) * storedDensity(properties, properties.ph(p, outletH)));
}

/** Quasi-steady inventory of the solved Reference cycle. Idealized field transport carries
 * the adjacent component state; physical-line transport is not supported in this closure.
 * Off-branch states are declared: heating keeps drained saturated vapour at high pressure
 * (Daikin multi manuals describe flow through stopped units); cooling keeps vapour at low
 * pressure and the stopped coil's metal temperature. Compressor shell, oil solubility and outdoor-unit internal
 * piping are not modelled. */
export function circuitInventory(properties: Properties, config: EngineConfig, geometry: BalanceGeometry, cycle: CycleOutput,
  input: { active: boolean[]; indoorMetalC: number[]; outdoorMetalC: number }, accumulatorLiquidKg = 0, outdoorPath?: { inletH: number; outletH: number }): InventoryBreakdown {
  if (geometry.rooms.length !== config.rooms.length) throw new DomainError('Charge geometry does not match configured rooms');
  if (config.rooms.some((room, i) => input.active[i] && (room.pipe.lengthM !== 0 || room.pipe.elevationM !== 0))) throw new DomainError('Charge-balanced closure currently requires idealized field-line transport');
  const heating = cycle.mode === 'heating', pL = cycle.lowPressureBarAbs * 1e5, pH = cycle.highPressureBarAbs * 1e5;
  const outdoorIn = heating ? cycle.expansionOutlet : cycle.discharge, outdoorOut = heating ? cycle.suction : cycle.condenserOutlet;
  // During a pressure solve the published compressor states (actual mixed return) and the
  // finite-UA outdoor coil path (computed from the target suction) differ by the residual;
  // integrate the coil along the path it was actually solved on. They coincide at convergence.
  const outdoorCoilKg = coilInventoryKg(properties, heating ? pL : pH, outdoorPath?.inletH ?? outdoorIn.hJkg, outdoorPath?.outletH ?? outdoorOut.hJkg, cycle.totalMassFlowKgs,
    config.outdoor.refrigerantConductanceWK, input.outdoorMetalC, geometry.outdoorCoilVolumeM3);
  // Parked accumulator liquid is saturated at suction pressure; the rest of the vessel holds suction vapour.
  let accumulatorKg = geometry.accumulatorVolumeM3 * storedDensity(properties, cycle.suction);
  if (accumulatorLiquidKg > 0) {
    const liquidM3 = accumulatorLiquidKg / properties.prop('D', 'P', pL, 'Q', 0);
    if (!(liquidM3 < geometry.accumulatorVolumeM3)) throw new DomainError('Accumulator liquid exceeds vessel volume');
    accumulatorKg = accumulatorLiquidKg + (geometry.accumulatorVolumeM3 - liquidM3) * storedDensity(properties, cycle.suction);
  }
  const offHeatingRho = heating ? properties.prop('D', 'P', pH, 'Q', 1) : 0;
  const rooms = config.rooms.map((room, i) => {
    const g = geometry.rooms[i];
    if (!input.active[i]) {
      const rho = heating ? offHeatingRho : properties.pt(pL, Math.max(input.indoorMetalC[i], properties.saturation(pL).temperatureC + .05)).densityKgm3;
      return { coilKg: g.coilVolumeM3 * rho, gasLineKg: g.gasLineVolumeM3 * rho, smallLineKg: g.smallLineVolumeM3 * rho };
    }
    const inlet = cycle.branchInlets[i], outlet = cycle.branchOutlets[i];
    const coilKg = coilInventoryKg(properties, inlet.pPa, inlet.hJkg, outlet.hJkg, cycle.branchMassFlowsKgs[i], room.refrigerantConductanceWK,
      input.indoorMetalC[i], g.coilVolumeM3);
    // Heating: gas line carries discharge, small line the branch condensate.
    // Cooling: EEVs sit in the outdoor unit, so the small line carries flashed two-phase.
    const gasRho = storedDensity(properties, heating ? cycle.discharge : outlet);
    const smallRho = storedDensity(properties, heating ? outlet : inlet);
    return { coilKg, gasLineKg: g.gasLineVolumeM3 * gasRho, smallLineKg: g.smallLineVolumeM3 * smallRho };
  });
  const totalKg = outdoorCoilKg + accumulatorKg + rooms.reduce((sum, r) => sum + r.coilKg + r.gasLineKg + r.smallLineKg, 0);
  return { totalKg, outdoorCoilKg, accumulatorKg, rooms };
}
