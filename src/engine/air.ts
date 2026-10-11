import { DomainError, Properties } from './properties.ts';
import { FUSION_JKG, ICE_CP_JKGK, WATER_CP_JKGK } from './film.ts';
export interface AirExchange { outletC: number; outletHumidityRatio: number; signedHeatToAirW: number; heatFromAirW: number; waterToSurfaceKgs: number; drainEnthalpyW: number; sensibleToAirW: number; evaporationLimited: boolean; totalOutletEnthalpyJkg: number; totalOutletWater: number; fogWater: number }
export interface ExhaustEquilibrium { temperatureC: number; vaporWater: number; fogWater: number; fogIceWater: number; totalEnthalpyJkg: number; totalWater: number }
/** Conserved lumped room gas plus retained condensate. The hypothetical gas
 * inverse only classifies the all-gas fast path; supersaturated states are flashed. */
export function equilibrateRoomAir(properties:Properties,h:number,w:number,p:number,referenceC:number):ExhaustEquilibrium {
  if(!(Number.isFinite(h)&&Number.isFinite(w)&&w>=0))throw new DomainError('Invalid room energy/water');
  const gasT=properties.airT(h,w,p),satW=properties.airW(gasT,1,p);
  if(w<=satW)return {temperatureC:gasT,vaporWater:w,fogWater:0,fogIceWater:0,totalEnthalpyJkg:h,totalWater:w};
  return equilibrateExhaust(properties,h,w,p,referenceC);
}
/** Outdoor entrained condensate exits with the air; no fictitious film deposition.
 * Humid-air enthalpy is per kg dry air; condensed water uses the film's 0 C liquid reference. */
export function equilibrateExhaust(properties: Properties, h: number, w: number, p: number, referenceC: number): ExhaustEquilibrium {
  if (!Number.isFinite(h) || !(w >= 0 && Number.isFinite(w)) || !(p>0 && Number.isFinite(p)) || !Number.isFinite(referenceC)) throw new DomainError('Invalid exhaust enthalpy/water');
  if (w === 0) return {temperatureC:properties.airT(h,0,p),vaporWater:0,fogWater:0,fogIceWater:0,totalEnthalpyJkg:h,totalWater:0};
  const dew = properties.humid('D', 'T', referenceC + 273.15, 'W', w, p) - 273.15;
  if (!Number.isFinite(dew)) throw new DomainError('Nonfinite outdoor exhaust dewpoint');
  const dewH = properties.airH(dew, w, p);
  if (h >= dewH) return { temperatureC: properties.airT(h,w,p), vaporWater:w, fogWater:0, fogIceWater:0, totalEnthalpyJkg:h,totalWater:w };
  if(dew < -60) throw new DomainError('Outdoor fog dewpoint outside supported bracket');
  const tolerance = 1e-5 + 1e-10*Math.abs(h);
  const state = (t: number, ice: boolean) => {
    const vapor = properties.airW(t,1,p), fog = w-vapor;
    const value = properties.airH(t,vapor,p)+fog*(ice ? -FUSION_JKG+ICE_CP_JKGK*t : WATER_CP_JKGK*t);
    return {temperatureC:t,vaporWater:vapor,fogWater:fog,fogIceWater:ice ? fog : 0,totalEnthalpyJkg:h,totalWater:w,value};
  };
  let low=-60, high=dew;
  if(dew>=0) {
    const liquid=state(0,false),ice=state(0,true);
    if(h>=ice.value && h<=liquid.value) {
      const iceWater=(liquid.value-h)/FUSION_JKG;
      if(!(liquid.fogWater>=0 && iceWater>=0 && iceWater<=liquid.fogWater && Number.isFinite(iceWater))) throw new DomainError('Outdoor fusion water outside domain');
      return {...liquid,fogIceWater:iceWater};
    }
    if(h<ice.value) high=0; else low=0;
  }
  const ice=high<=0;
  const left=state(low,ice),right=state(high,ice);
  if(left.value>h || right.value<h) throw new DomainError('Outdoor fog equilibrium outside bounded temperature bracket');
  for(let k=0;k<64;k++) {
    const middle=state((low+high)/2,ice);
    if(Math.abs(middle.value-h)<=tolerance) {
      if(!(middle.fogWater>=0 && Number.isFinite(middle.vaporWater))) throw new DomainError('Outdoor fog equilibrium water outside domain');
      return middle;
    }
    if(middle.value<h) low=middle.temperatureC; else high=middle.temperatureC;
  }
  throw new DomainError('Outdoor fog equilibrium did not close enthalpy');
}
/** Constant surface contact/bypass model; Lewis-number unity generic closure. No empirically fitted SHR. */
export function airExchange(properties: Properties, inletC: number, inletW: number, surfaceC: number, dryFlowKgs: number, conductanceWK: number,
  ambientPa: number, allowEvaporationKgs = 0, immediateLiquidDrain = false, exhaustFog = false): AirExchange {
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
  // Valid inlet gas warmed at unchanged water content remains a gas; no dewpoint solve.
  const exhaust = wOut === inletW && hOut >= hIn
    ? {temperatureC:properties.airT(hOut,wOut,ambientPa),vaporWater:wOut,fogWater:0}
    : equilibrateExhaust(properties,hOut,wOut,ambientPa,Math.max(inletC,surfaceC));
  if (!exhaustFog && exhaust.fogWater > 0) throw new DomainError('Indoor air outlet fog is outside the supported domain');
  const outletC = exhaust.temperatureC;
  const water = evaporationLimited ? -allowEvaporationKgs : dryFlowKgs * (inletW - wOut);
  if (immediateLiquidDrain && water > 0 && surfaceC < 0) throw new DomainError('Indoor coil icing is outside the supported domain');
  const drain = immediateLiquidDrain && water > 0 ? water * WATER_CP_JKGK * surfaceC : 0;
  return { outletC, outletHumidityRatio: exhaust.vaporWater, totalOutletEnthalpyJkg:hOut, totalOutletWater:wOut, fogWater:exhaust.fogWater, signedHeatToAirW: dryFlowKgs * (hOut - hIn), heatFromAirW: dryFlowKgs * (hIn - hOut), waterToSurfaceKgs: water,
    drainEnthalpyW: drain, evaporationLimited, sensibleToAirW: dryFlowKgs * (properties.airH(outletC, inletW, ambientPa) - hIn) };
}
