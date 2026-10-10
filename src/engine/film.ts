import type { EngineConfig, FilmDerived } from './types.ts';
export const FUSION_JKG = 333500, ICE_CP_JKGK = 2100, WATER_CP_JKGK = 4180;
/** Combined metal+film enthalpy, liquid and metal at 0°C as reference.
 * Infinite metal/film contact is a declared reduced-order closure; melting keeps common T=0°C.
 * No lost frost mass, latent energy reset or small-film explicit stiffness. */
export function deriveOutdoorFilm(combinedEnergyJ: number, massKg: number, outdoor: EngineConfig['outdoor']): FilmDerived {
  if (!(massKg >= 0 && Number.isFinite(combinedEnergyJ))) throw new Error('Invalid outdoor mass/energy');
  let temperatureC: number, iceKg: number;
  if (combinedEnergyJ < -massKg * FUSION_JKG) {
    temperatureC = (combinedEnergyJ + massKg * FUSION_JKG) / (outdoor.metalCapacityJK + massKg * ICE_CP_JKGK); iceKg = massKg;
  } else if (combinedEnergyJ <= 0 && massKg > 0) { temperatureC = 0; iceKg = -combinedEnergyJ / FUSION_JKG; }
  else { temperatureC = combinedEnergyJ / (outdoor.metalCapacityJK + massKg * WATER_CP_JKGK); iceKg = 0; }
  return { temperatureC, iceKg, liquidKg: massKg - iceKg, thicknessM: iceKg / (outdoor.frostDensityKgm3 * outdoor.depositionAreaM2) };
}
export function filmEnthalpy(combinedEnergyJ: number, temperatureC: number, metalCapacityJK: number): number { return combinedEnergyJ - metalCapacityJK * temperatureC; }
