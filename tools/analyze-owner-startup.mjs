/** Read-only historical trace analysis and legal fixed-M/U phase-allocation construction.
 * No engine steps, source edits, calibration or evolving-state repair. */
import factory from '../public/vendor/coolprop/coolprop.js';
import {readFile,writeFile} from 'node:fs/promises';
const saved=JSON.parse(await readFile(new URL('../research/charge-pilot-results.json',import.meta.url),'utf8'));
const cases=saved.ownerValveInitializationComparison.cases;
const config=saved.ownerStartupFlux.config,g=config.inventory.geometry,mass=config.inventory.initialMassKg;
const module=await factory(),prop=(out,a,x,b,y)=>module.PropsSI(out,a,x,b,y,'R32');
const volumes={outdoor:g.outdoorCoilVolumeM3,accumulator:g.accumulatorVolumeM3,
  indoorCoils:g.rooms.reduce((s,r)=>s+r.coilVolumeM3,0),
  gasLines:g.rooms.reduce((s,r)=>s+Math.PI*r.gasInsideDiameterM**2*r.lineLengthM/4,0),
  smallLines:g.rooms.reduce((s,r)=>s+Math.PI*r.smallInsideDiameterM**2*r.lineLengthM/4,0)};
const volume=Object.values(volumes).reduce((a,b)=>a+b,0),rho=mass/volume,T=config.inventory.initialFluidTemperatureC+273.15;
const p=prop('P','T',T,'D',rho),u=prop('U','T',T,'D',rho),rl=prop('D','P',p,'Q',0),rv=prop('D','P',p,'Q',1);
const hl=prop('H','P',p,'Q',0),hv=prop('H','P',p,'Q',1),alpha=(rl-rho)/(rl-rv),quality=alpha*rv/rho;
const upstream=volumes.gasLines+volumes.outdoor/3,remaining=volume-upstream-volumes.accumulator;
const remainderAlpha=(alpha*volume-upstream-alpha*volumes.accumulator)/remaining;
const groups=[{id:'gasLines',V:volumes.gasLines,alpha:1},{id:'outdoorGasCell',V:volumes.outdoor/3,alpha:1},
  {id:'accumulator',V:volumes.accumulator,alpha},
  {id:'remainingCoilsAndSmallLines',V:remaining,alpha:remainderAlpha}];
const redistributed=groups.map(c=>{
  const density=(1-c.alpha)*rl+c.alpha*rv,M=c.V*density,x=c.alpha*rv/density,h=(1-x)*hl+x*hv;
  return {...c,massKg:M,qualityMass:x,hJkg:h,internalEnergyJ:M*h-p*c.V};
});
const sourceOnlyRemainingAlpha=(alpha*volume-volumes.outdoor/3-alpha*(volumes.gasLines+volumes.accumulator))/remaining;
const sourceOnlyGroups=[{id:'gasLines',V:volumes.gasLines,alpha},{id:'outdoorGasCell',V:volumes.outdoor/3,alpha:1},
  {id:'accumulator',V:volumes.accumulator,alpha},
  {id:'remainingCoilsAndSmallLines',V:remaining,alpha:sourceOnlyRemainingAlpha}];
const sourceOnly=sourceOnlyGroups.map(c=>{
  const density=(1-c.alpha)*rl+c.alpha*rv,x=c.alpha*rv/density,h=(1-x)*hl+x*hv;
  const eosDensity=prop('D','P',p,'H',h),M=c.V*eosDensity;
  return {...c,densityKgm3:eosDensity,densityDifferenceKgm3:eosDensity-density,
    massKg:M,qualityMass:prop('Q','P',p,'H',h),hJkg:h,internalEnergyJ:M*h-p*c.V};
});
const result={checkedAt:new Date().toISOString(),status:'read-only diagnosis; historical trajectories, proposed new-scenario initial phase allocation only',
  geometryVolumesM3:volumes,initial:{massKg:mass,volumeM3:volume,temperatureC:T-273.15,pPa:p,
    densityKgm3:rho,qualityMass:quality,vaporVolumeFraction:alpha,internalEnergyJ:mass*u,
    liquidMassKg:mass*(1-quality),gasLineLiquidKg:volumes.gasLines*rho*(1-quality)},
  pairedHistoricalCases:cases.map(c=>{
    const first=c.trace.find(r=>r.t===.25),one=c.trace.find(r=>r.t===1),last=c.trace.at(-1);
    const report=r=>({t:r.t,admitted:r.admitted,EEVFlowKgs:r.valveMassFlowsKgs.reduce((a,b)=>a+b,0),
      sourceInletFlowKgs:-r.outdoorGasFaceMassFlowKgs,compressorPickupKgs:r.compressorMassFlowKgs,
      accumulatorMassKg:r.accumulatorMassKg,openings:r.openings});
    const pressure=prop('P','T',last.accumulatorTemperatureC+273.15,'Q',1),rhoV=prop('D','P',pressure,'Q',1);
    return {checkedAt:c.checkedAt,sourceHashes:c.sourceHashes,initialValveOpening:c.config.inventory.initialValveOpening,
      roomVolumesM3:c.config.rooms.map(r=>r.volumeM3),initialAccumulatorMassKg:c.initialAccumulatorMassKg,
      first:report(first),oneSecond:report(one),last:report(last),
      lastAccumulatorVaporVolumeFraction:last.accumulatorQualityMass*last.accumulatorMassKg/g.accumulatorVolumeM3/rhoV,
      openingSequence:c.trace.slice(0,10).map(r=>({t:r.t,opening:r.openings[0]}))};
  }),
  proposedSourceCellAllocation:{assumption:'saturated vapor only in outdoor gas-end cell; gas lines and accumulator unchanged; redistribute phase among other coils and small lines',
    groups:sourceOnly,totalMassKg:sourceOnly.reduce((s,c)=>s+c.massKg,0),
    totalEnergyJ:sourceOnly.reduce((s,c)=>s+c.internalEnergyJ,0),
    massDifferenceKg:sourceOnly.reduce((s,c)=>s+c.massKg,0)-mass,
    energyDifferenceJ:sourceOnly.reduce((s,c)=>s+c.internalEnergyJ,0)-mass*u,
    feasible:sourceOnlyGroups.every(c=>c.alpha>=0&&c.alpha<=1)},
  proposedAllocation:{assumption:'saturated vapor in gas lines and outdoor gas-end cell; accumulator unchanged; uniform remaining phase volume fraction',
    groups:redistributed,totalMassKg:redistributed.reduce((s,c)=>s+c.massKg,0),
    totalEnergyJ:redistributed.reduce((s,c)=>s+c.internalEnergyJ,0),
    massDifferenceKg:redistributed.reduce((s,c)=>s+c.massKg,0)-mass,
    energyDifferenceJ:redistributed.reduce((s,c)=>s+c.internalEnergyJ,0)-mass*u,
    feasible:groups.every(c=>c.alpha>=0&&c.alpha<=1),
    disclaimer:'A legal equilibrium initial-condition sensitivity test; no measured stopped phase distribution or OEM behavior claimed.'}};
await writeFile(new URL('../research/owner-startup-diagnosis.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log({initial:result.initial,allocation:{feasible:result.proposedAllocation.feasible,
  remainderAlpha,sourceOnlyRemainingAlpha,sourceOnlyMassDifference:result.proposedSourceCellAllocation.massDifferenceKg,sourceOnlyEnergyDifference:result.proposedSourceCellAllocation.energyDifferenceJ,massDifferenceKg:result.proposedAllocation.massDifferenceKg,energyDifferenceJ:result.proposedAllocation.energyDifferenceJ},
  historicalCases:result.pairedHistoricalCases.map(c=>({opening:c.initialValveOpening,
    first:c.first,last:c.last,lastAlpha:c.lastAccumulatorVaporVolumeFraction}))});
