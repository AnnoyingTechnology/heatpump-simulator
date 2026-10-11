import {DomainError,Properties}from'./properties.ts';import type{EngineConfig,Mode}from'./types.ts';
export interface EnvelopeEstimate {available:boolean;ratio:number|null;condensingC:number|null;dischargeC:number|null;dischargeExceeded:boolean}
/** Generic thermal-boundary control estimate for start preflight and held recovery.
 * It is not a closed cycle or a sensor. Recovery must still obtain a freshly
 * closed operating point. This is a controller assumption, not a proved global
 * lower bound on real-fluid discharge temperature. No flash is made beyond the selected P/T domain. */
export function estimateHeldEnvelope(p:Properties,c:EngineConfig,mode:Mode,metals:number[],outdoor:number,active:boolean[],allocationWeights?:number[]):EnvelopeEstimate {
 const domain=p.refrigerant.domain;
 const indoor=metals.filter((_,i)=>active[i]),heating=mode==='heating';
 const te=heating?outdoor-c.compressor.superheatK-1e-5:Math.min(...indoor)-1e-5;
 let tc=Math.max((heating?Math.min(...indoor):outdoor)+1e-5,te+(heating?1:8));
 if(!indoor.length||te<domain.minEvaporatingC||te>domain.maxEvaporatingC||tc>domain.maxCondensingC||tc<domain.minCondensingC)return{available:false,ratio:null,condensingC:null,dischargeC:null,dischargeExceeded:false};
 // When minimum-lift heating cannot even place a liquid header above the
 // coldest sink, only SC-target control remains. Its mixed outlet cannot lie
 // below the weighted branch metal-equilibrium enthalpies. A hot branch above
 // saturation has a vapor limiting outlet; it cannot be represented by the
 // coldest metal alone. This pressure floor uses actual current valve weights.
 // Finite UA raises branch outlet enthalpy above these limits. The floor and
 // maximum source-side Te remain controller estimates, not a solved cycle or
 // a proof of global real-fluid discharge monotonicity.
 if(heating&&allocationWeights&&te+1<=Math.min(...indoor)&&active.every((on,i)=>!on||(c.rooms[i].pipe.lengthM===0&&c.rooms[i].pipe.elevationM===0))){
  const weights=allocationWeights.filter((_,i)=>active[i]),sum=weights.reduce((a,b)=>a+b,0);
  if(!(sum>0)||weights.some(w=>!(w>0&&Number.isFinite(w))))throw new DomainError('Invalid envelope branch allocation weight');
  let lower=Math.max(domain.minCondensingC,Math.min(...indoor)+c.compressor.subcoolK+1e-5,te+1),upper=Math.max(...indoor)+c.compressor.subcoolK+1e-5;
  if(upper>domain.maxCondensingC||indoor.some(t=>t<=domain.minTemperatureC||t>=domain.maxTemperatureC))return{available:false,ratio:null,condensingC:null,dischargeC:null,dischargeExceeded:false};
  const outletMargin=(temperature:number)=>{
   const pressure=p.pressureAtSaturationC(temperature,'bubble'),target=p.pt(pressure,temperature-c.compressor.subcoolK).hJkg;
   // Each limiting single phase is known relative to saturation. At exact
   // equality the liquid endpoint is the conservative minimum enthalpy.
   const minimum=indoor.reduce((h,t,i)=>h+weights[i]*(p.refrigerant.kind!=='pure'?p.equilibriumH(pressure,t):t===temperature?p.saturation(pressure).liquidH:p.prop('H','P',pressure,Math.abs(t-temperature)<.01?(t<temperature?'T|liquid':'T|gas'):'T',t+273.15)),0)/sum;
   return target-minimum;
  };
  if(outletMargin(lower)<0){
   for(let i=0;i<24&&upper-lower>1e-5;i++){const mid=.5*(lower+upper);if(outletMargin(mid)>=0)upper=mid;else lower=mid;}
   tc=upper;
  }else tc=lower;
 }
 const pl=p.pressureAtSaturationC(te),ph=p.pressureAtSaturationC(tc,'bubble'),suction=p.pt(pl,te+c.compressor.superheatK);
 const h2s=p.prop('H','P',ph,'S',suction.entropyJkgK),h2=suction.hJkg+(h2s-suction.hJkg)/c.compressor.isentropicEfficiency;
 const capH=p.prop('H','P',ph,'T',Math.min(c.compressor.maxDischargeC,domain.maxTemperatureC-.001)+273.15),exceeded=h2>=capH;
 // Positive superheated cp allows an enthalpy comparison before the temperature
 // inverse: an excessive prediction never constructs an out-of-envelope PH state.
 const dischargeC=exceeded?null:p.ph(ph,h2).temperatureC;
 return{available:true,ratio:ph/pl,condensingC:tc,dischargeC,dischargeExceeded:exceeded};
}
