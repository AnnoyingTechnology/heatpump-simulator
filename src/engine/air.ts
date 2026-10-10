import { DomainError, Properties } from './properties.ts';
import { WATER_CP_JKGK } from './film.ts';
export interface AirExchange { outletC: number; outletHumidityRatio: number; signedHeatToAirW: number; heatFromAirW: number; waterToSurfaceKgs: number; drainEnthalpyW: number; sensibleToAirW: number; evaporationLimited: boolean }
/** Constant surface contact/bypass model; Lewis-number unity generic closure. No empirically fitted SHR. */
export function airExchange(properties: Properties, inletC: number, inletW: number, surfaceC: number, dryFlowKgs: number, conductanceWK: number,
  ambientPa: number, allowEvaporationKgs = 0, immediateLiquidDrain = false): AirExchange {
  if (!(dryFlowKgs > 0 && conductanceWK >= 0)) throw new DomainError('Air-side flow/conductance outside domain');
  const hIn = properties.airH(inletC, inletW, ambientPa);
  const cp = properties.humid('C', 'T', inletC + 273.15, 'W', inletW, ambientPa);
  const contact = 1 - Math.exp(-conductanceWK / (dryFlowKgs * cp));
  let wOut = inletW, evaporationLimited = false;
  const satW = properties.airW(surfaceC, 1, ambientPa); // CoolProp uses ice saturation below freezing.
  if (satW < inletW) wOut = inletW + contact * (satW - inletW);
  else if (allowEvaporationKgs > 0) {
    evaporationLimited = dryFlowKgs * contact * (satW - inletW) >= allowEvaporationKgs;
    wOut = inletW + (evaporationLimited ? allowEvaporationKgs / dryFlowKgs : contact * (satW - inletW));
  }
  const contactW = contact > 0 ? inletW + (wOut - inletW) / contact : inletW;
  const hOut = hIn + contact * (properties.airH(surfaceC, contactW, ambientPa) - hIn);
  const outletC = properties.airT(hOut, wOut, ambientPa);
  const rh = properties.airRH(outletC, wOut, ambientPa);
  if (rh > 1 + 1e-7) throw new DomainError('Air outlet supersaturation/fog is outside the contact-model domain');
  const water = evaporationLimited ? -allowEvaporationKgs : dryFlowKgs * (inletW - wOut);
  if (immediateLiquidDrain && water > 0 && surfaceC < 0) throw new DomainError('Indoor coil icing is outside the supported domain');
  const drain = immediateLiquidDrain && water > 0 ? water * WATER_CP_JKGK * surfaceC : 0;
  return { outletC, outletHumidityRatio: wOut, signedHeatToAirW: dryFlowKgs * (hOut - hIn), heatFromAirW: dryFlowKgs * (hIn - hOut), waterToSurfaceKgs: water,
    drainEnthalpyW: drain, evaporationLimited, sensibleToAirW: dryFlowKgs * (properties.airH(outletC, inletW, ambientPa) - hIn) };
}
