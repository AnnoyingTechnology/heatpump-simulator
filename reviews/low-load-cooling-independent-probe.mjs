// Reviewer equation reconstruction only: no production edits or changed runtime.
// Explore whether the common-suction temperature bound excludes valid local coil/field endpoints.
import {readFile,writeFile} from 'node:fs/promises';
const root='/home/julien/Documents/Scripts/Agent/heatpump-simulator';
const frozen='/tmp/heatpump-valve-science-snapshot-osvyohga';
const {Properties,solveCycle}=await import(`${frozen}/tests/engine/build/index.js`);
const {conductanceIntegral,coilOutletH}=await import(`${frozen}/tests/engine/build/cycle.js`);
const {transportPipe}=await import(`${frozen}/tests/engine/build/transport.js`);
const native=await(await import(`${frozen}/public/vendor/coolprop-safe/adapter.js`)).default();
const p=new Properties(native),base=JSON.parse(await readFile(`${root}/tests/engine/fixtures/opening-exchange-robustness/opening-owner-1C-ground17-1200.json`)).config;
function trial(outside,speed,te,tc){
  const c=structuredClone(base);c.mode='cooling';c.outdoorTemperatureC=outside;
  c.rooms[1].pipe={...c.rooms[1].pipe,lengthM:6.5,gasInsideDiameterM:.0111,liquidInsideDiameterM:.00475};
  const room=c.rooms[1],pipe=room.pipe,compressor=c.compressor,metal=10;
  const pL=p.pressureAtSaturationC(te),pH=p.pressureAtSaturationC(tc);
  const suction=p.pt(pL,te+compressor.superheatK),condenser=p.pt(pH,tc-compressor.subcoolK);
  const h2s=p.prop('H','P',pH,'S',suction.entropyJkgK);
  const discharge=p.ph(pH,suction.hJkg+(h2s-suction.hJkg)/compressor.isentropicEfficiency);
  const compressorFlow=suction.densityKgm3*compressor.displacementM3rev*speed*compressor.volumetricEfficiency;
  let flow=compressorFlow,inlet,outlet,gas,small,startP,next;
  for(let k=0;k<64;k++){
    gas=transportPipe(p,pL,suction.hJkg,flow,pipe,pipe.gasInsideDiameterM,outside,-pipe.elevationM,true);
    outlet=p.ph(gas.pPa,gas.hJkg);
    startP=gas.pPa;small=transportPipe(p,startP,condenser.hJkg,flow,pipe,pipe.liquidInsideDiameterM,outside,pipe.elevationM);
    for(let j=0;j<8&&Math.abs(small.pPa-gas.pPa)>.2;j++){
      startP+=gas.pPa-small.pPa;
      if(startP>=pH)throw Error('Valve authority exhausted');
      small=transportPipe(p,startP,condenser.hJkg,flow,pipe,pipe.liquidInsideDiameterM,outside,pipe.elevationM);
    }
    if(Math.abs(small.pPa-gas.pPa)>.2)throw Error('Small-line pressure closure failed');
    inlet=p.ph(gas.pPa,small.hJkg);
    next=room.refrigerantConductanceWK/conductanceIntegral(p,inlet.pPa,inlet.hJkg,outlet.hJkg,metal);
    if(Math.abs(next-flow)<1e-8)break;
    if(k===63)throw Error('Reviewer branch iteration failed');
    flow=next;
  }
  const massResidual=(flow-compressorFlow)*250000;
  const outdoorResidual=flow*(condenser.hJkg-coilOutletH(p,pH,discharge.hJkg,flow,c.outdoor.refrigerantConductanceWK,outside,true));
  const localSuperheat=outlet.temperatureC-p.saturation(outlet.pPa).temperatureC;
  const coilHeat=flow*(inlet.hJkg-outlet.hJkg),lineHeat=gas.heatToOutdoorW+small.heatToOutdoorW;
  const condenserHeat=flow*(discharge.hJkg-condenser.hJkg),work=flow*(discharge.hJkg-suction.hJkg);
  return {outside,speed,te,tc,residual:[massResidual,outdoorResidual],flow,compressorFlow,
    coilInletC:inlet.temperatureC,coilOutletC:outlet.temperatureC,suctionC:suction.temperatureC,
    localSuperheatK:localSuperheat,coilOutletPhase:outlet.phase,gasLineGainW:-gas.heatToOutdoorW,
    evaporatorHeatW:-coilHeat,condenserHeatW:condenserHeat,compressorElectricalW:work/compressor.driveEfficiency,
    energyClosureW:condenserHeat+coilHeat+lineHeat-work,valvePressureAuthorityPa:pH-startP,
    dischargeC:discharge.temperatureC,pressureRatio:pH/pL};
}
const results=[];
for(const outside of [35,39])for(const speed of [18,8,6,4]){
  let te=speed===18?4.3:8,tc=outside+1.1,best;
  try{
    for(let k=0;k<30;k++){
      const t=trial(outside,speed,te,tc),[a,b]=t.residual;best=t;
      if(Math.max(Math.abs(a),Math.abs(b))<=.1)break;
      const et=trial(outside,speed,te+.001,tc),ct=trial(outside,speed,te,tc+.001);
      const j00=(et.residual[0]-a)/.001,j10=(et.residual[1]-b)/.001,j01=(ct.residual[0]-a)/.001,j11=(ct.residual[1]-b)/.001;
      const det=j00*j11-j01*j10,dte=(-a*j11+j01*b)/det,dtc=(-j00*b+a*j10)/det;
      let accepted=false;
      for(const scale of [1,.5,.25,.125,.0625,.03125]){
        const nt=te+scale*dte,nc=tc+scale*dtc;
        if(!(nt<10-1e-5&&nt>=-40&&nc>outside+1&&nc<=65&&nc-nt>=8))continue;
        try{const next=trial(outside,speed,nt,nc);if(Math.hypot(...next.residual)<Math.hypot(a,b)){te=nt;tc=nc;accepted=true;break;}}catch{}
      }
      if(!accepted)throw Error('No admissible reviewer Newton step');
    }
    const final=trial(outside,speed,te,tc);
    if(Math.max(...final.residual.map(Math.abs))>.1)throw Error('Reviewer closure tolerance not reached');
    results.push({...final,status:'CLOSED',excludedByExistingCommonSuctionTemperatureBound:te>7-1e-5});
  }catch(error){results.push({outside,speed,status:'REJECTED',error:error.message,best});}
}
const receipt={scope:'Read-only equation reconstruction. Current physical cooling equations/SH3/UA/pipe/EOS are preserved; pressure search explores Te up to metal10 rather than incorrectly requiring common suction T<=metal, and seeds branch flow from compressor displacement. Not an accepted production cycle, implementation or broad validation.',results};
await writeFile(new URL('./low-load-cooling-independent-results.json',import.meta.url),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify(receipt,null,2));p.dispose();native.dispose();
