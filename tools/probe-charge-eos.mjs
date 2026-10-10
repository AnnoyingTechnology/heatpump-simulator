/** Disposable scientific pilot; never imported by production. Public CoolProp boundary only. */
import factory from '../public/vendor/coolprop/coolprop.js';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';

/** Actual coupled startup flux diagnosis. No controller or geometry changes. */
export async function runOwnerStartupFlux({durationSeconds=10,initialValveOpening,roomVolumesM3}={}) {
  const {Properties}=await import('../tests/engine/build/properties.js');
  const {HeatPumpEngine}=await import('../tests/engine/build/engine.js');
  const {createHash}=await import('node:crypto');
  const sourceHashes=Object.fromEntries(await Promise.all(['charge','engine','properties','drive'].map(async name=>
    [name,createHash('sha256').update(await readFile(new URL(`../tests/engine/build/${name}.js`,import.meta.url))).digest('hex')])));
  const saved=JSON.parse(await readFile(new URL('../research/charge-pilot-results.json',import.meta.url),'utf8'));
  const config=structuredClone(saved.ownerPressureDrop.config),props=new Properties(await factory());
  if(initialValveOpening!==undefined)config.inventory.initialValveOpening=initialValveOpening;
  if(roomVolumesM3!==undefined)config.rooms.forEach((r,i)=>r.volumeM3=roomVolumesM3[i]);
  const engine=new HeatPumpEngine(props,config,{pressureDifferenceCoordinates:true}),initial=engine.snapshot();
  const accumulatorMass=o=>o.inventory.cells.find(c=>c.id==='accumulator').massKg;
  let previous=initial,failedOutput=null;const trace=[],start=performance.now();
  try {
    for(let i=0;i<durationSeconds/.25;i++) {
      const o=engine.step(.25);
      if(o.state==='fault'){failedOutput=o;break;}
      const inv=o.inventory,acc=inv.cells.find(c=>c.id==='accumulator');
      trace.push({t:o.simulatedSeconds,admitted:inv.compressorAdmitted,requestedRps:o.diagnostics.demandSpeedRps,
        actualRps:o.diagnostics.speedRps,compressorMassFlowKgs:inv.compressorMassFlowKgs,
        compressorElectricalW:o.electrical.compressorW,openings:engine.refrigerant.snapshot().openings,
        signedRoomHeatW:o.signedRoomHeatW,roomTemperaturesC:o.rooms.map(r=>r.temperatureC),
        roomMetalTemperaturesC:o.rooms.map(r=>r.metalTemperatureC),outdoorMetalC:o.outdoor.metalTemperatureC,
        valveMassFlowsKgs:Object.values(inv.fieldPorts).map(f=>f.valveMassFlowKgs),
        outdoorGasFaceMassFlowKgs:inv.coilPorts.outdoor.gasFaceMassFlowKgs,
        outdoorSmallFaceMassFlowKgs:inv.coilPorts.outdoor.smallFaceMassFlowKgs,
        accumulatorMassKg:acc.massKg,accumulatorMassRateKgs:(acc.massKg-accumulatorMass(previous))/.25,
        accumulatorQualityMass:acc.state.qualityMass,accumulatorTemperatureC:acc.state.temperatureC,
        massResidualKg:inv.massResidualKg,fluidEnergyResidualJ:inv.energyResidualJ,energyResidualJ:o.energy.residualJ,
        waterResidualKg:o.energy.waterResidualKg});previous=o;
    }
    const finalSourceHashes=Object.fromEntries(await Promise.all(['charge','engine','properties','drive'].map(async name=>
      [name,createHash('sha256').update(await readFile(new URL(`../tests/engine/build/${name}.js`,import.meta.url))).digest('hex')])));
    return {status:failedOutput?'bounded startup fault; uncommitted interval rejected':'unchanged owner-generic startup diagnostic; no installed calibration',
      checkedAt:new Date().toISOString(),sourceHashes,config,requestedSeconds:durationSeconds,acceptedSeconds:previous.simulatedSeconds,
      sourceHashesUnchanged:JSON.stringify(sourceHashes)===JSON.stringify(finalSourceHashes),
      failedOutput,lastOutput:previous,lastFluid:engine.refrigerant.snapshot(),
      initialAccumulatorMassKg:accumulatorMass(initial),wallSeconds:(performance.now()-start)/1000,trace};
  } finally {props.dispose();}
}

/** Isolated coordinate comparison, never commits to a production circuit.
 * Reuses its exact constitutive laws with independently flashed PD cells.
 * Prior physical M/U are authoritative; the snapshot is not reflashed/rebased. */
export async function runDensityCorner({dt=.25,pressureRelativeStep=1e-9,maximumIterations=24,
  branchLimitedPressure=true,coordinate='density',previousSnapshot,pressureDifference=false,savedState,
  pressureDifferenceStepPa=1e-4,boundaryOverride}={}) {
  const { Properties }=await import('../tests/engine/build/properties.js');
  const { ChargeCircuit }=await import('../tests/engine/build/charge.js');
  const saved=savedState??JSON.parse(await readFile(new URL('../research/charge-owner-debug-snapshot.json',import.meta.url),'utf8'));
  const props=new Properties(await factory()),g=saved.config.inventory.geometry,previous=previousSnapshot??saved.fluid;
  const circuit=new ChargeCircuit(props,g,{massKg:saved.config.inventory.initialMassKg,fluidTemperatureC:saved.config.inventory.initialFluidTemperatureC});
  const n=previous.cells.length,flowOffset=3+n,acc=n-1;
  const boundary=boundaryOverride??{orientation:previous.orientation,compressorSpeedRps:0,
    enabledRoomIds:g.rooms.map(r=>r.id),outdoorMetalC:saved.output.outdoor.metalTemperatureC,
    indoorMetalCById:Object.fromEntries(saved.output.rooms.map(r=>[r.id,r.metalTemperatureC]))};
  if(boundary.leak?.rateKgs>0)throw Error('This diagnostic pilot supports closed inventory only');
  const admitted=previous.compressorAdmission;
  const openings=previous.openings.map((v,i)=>{
    if(!boundary.enabledRoomIds.includes(g.rooms[i].id))return 0;
    if(!admitted)return Math.max(0,v-.1*dt);
    if(v===0&&boundary.compressorSpeedRps>0)return Math.min(.1,.1*dt);
    const sensor=previous.cells[boundary.orientation==='heating'?0:3+5*i+1].state;
    const sat=props.saturation(sensor.pPa),sh=sensor.phase==='vapor'?Math.max(0,sensor.temperatureC-sat.temperatureC):0;
    return Math.max(0,Math.min(1,v+Math.max(-.1*dt,Math.min(.1*dt,.005*dt*(sh-(boundary.operating?.superheatTargetK??g.superheatTargetK))))));
  });
  const density=coordinate==='density';
  const sourcePressure=boundary.orientation==='heating'?0:1;
  const scales=[1e6,1e6,pressureDifference?1:1e6,...Array(n).fill(density?1000:5e5),...Array(2+5*g.rooms.length).fill(.01)];
  const groups=previous.cells.map(c=>c.group==='outdoor'?0:c.group==='indoor'?1:2);
  let evaluations=0;
  const residual=x=>{
    evaluations++;const y=x.map((v,i)=>v*scales[i]);
    if(pressureDifference)y[2]+=y[sourcePressure];
    const cells=previous.cells.map((c,j)=>{
      const p=y[groups[j]],state=density?props.pd(p,y[3+j]):props.ph(p,y[3+j]);
      const M=(density?y[3+j]:state.densityKgm3)*c.volumeM3;
      return {...c,massKg:M,internalEnergyJ:M*state.hJkg-p*c.volumeM3,state};
    });
    const z=[...y.slice(0,3),...cells.map(c=>c.state.hJkg),...y.slice(flowOffset)];
    const rates=circuit.evaluation(z,boundary,openings,admitted,cells);
    const local=cells.map((c,j)=>c.massKg-previous.cells[j].massKg-dt*rates.dm[j])
      .concat(cells.map((c,j)=>c.internalEnergyJ-previous.cells[j].internalEnergyJ-dt*rates.dU[j]),[dt*rates.headerMass]);
    const f=local.map((v,i)=>v/(i<n||i===2*n?.1:50000));
    const mass=cells.reduce((s,c,j)=>s+c.massKg-previous.cells[j].massKg,0);
    const heat=Object.values(rates.heat).reduce((a,b)=>a+b,0);
    const energy=cells.reduce((s,c,j)=>s+c.internalEnergyJ-previous.cells[j].internalEnergyJ,0)-dt*(rates.work+heat);
    f[acc]=mass/.1;f[n+acc]=energy/50000;
    const mTol=previous.cells.map(c=>1e-10+1e-10*c.massKg);
    const limits=mTol.concat(previous.cells.map((c,j)=>1e-5+1e-9*Math.abs(c.internalEnergyJ)+
      Math.max(Math.abs(c.state.hJkg),Math.abs(cells[j].state.hJkg))*mTol[j]),[1e-10]);
    const normalized=Math.max(...local.map((v,i)=>Math.abs(v)/limits[i]),Math.abs(mass)/5e-11,Math.abs(energy)/1e-5);
    return {y,z,cells,rates,f,local,limits,mass,energy,normalized};
  };
  const linear=(matrix,b)=>{
    const A=matrix.map((row,i)=>[...row,b[i]]),N=b.length;
    for(let j=0;j<N;j++){
      let k=j;for(let i=j+1;i<N;i++)if(Math.abs(A[i][j])>Math.abs(A[k][j]))k=i;
      [A[j],A[k]]=[A[k],A[j]];if(Math.abs(A[j][j])<1e-15)throw Error('Density pilot singular Jacobian');
      for(let i=j+1;i<N;i++){const f=A[i][j]/A[j][j];for(let q=j;q<=N;q++)A[i][q]-=f*A[j][q];}
    }
    const x=Array(N).fill(0);for(let i=N-1;i>=0;i--)x[i]=(A[i][N]-A[i].slice(i+1,N).reduce((s,v,k)=>s+v*x[i+1+k],0))/A[i][i];return x;
  };
  const initialPressures=previous.variables.slice(0,3);
  if(pressureDifference)initialPressures[2]-=initialPressures[sourcePressure];
  let x=[...initialPressures,...previous.cells.map(c=>density?c.massKg/c.volumeM3:c.state.hJkg),...previous.variables.slice(flowOffset)]
    .map((v,i)=>v/scales[i]);
  const start=performance.now();let cur=residual(x),iterations=0,rejected=0,fault=null;
  const merit=r=>r.f.reduce((s,v)=>s+v*v,0),history=[];
  try {
    for(;iterations<maximumIterations&&cur.normalized>1;iterations++){
      history.push({iteration:iterations,normalized:cur.normalized,mass:cur.mass,energy:cur.energy});
      const J=Array.from({length:x.length},()=>Array(x.length));
      const storage=cur.cells.map(c=>circuit.storageDerivatives(c));
      for(let j=0;j<x.length;j++){
        let eps=(j<3?pressureRelativeStep:j<flowOffset?(density?1e-7:1e-6):1e-6)*Math.max(1,Math.abs(x[j]));
        if(pressureDifference&&j===2)eps=Math.max(pressureDifferenceStepPa,eps);
        if(branchLimitedPressure&&j<3){
          // Keep a local derivative on the actual upstream-fluid branch. This
          // changes a derivative interval, never the physical flux or state.
          const source=boundary.orientation==='heating'?0:1;
          const gaps=[];if(j===2||(!pressureDifference&&j===source))gaps.push(Math.abs(cur.y[source]-cur.y[2]));
          if(j===0||j===1)gaps.push(Math.abs(cur.y[0]-cur.y[1]));
          for(const gap of gaps)if(gap>0)eps=Math.min(eps,Math.max(1e-6,.2*gap)/scales[j]);
        }
        if(pressureDifference&&j===2&&cur.y[2]<cur.y[sourcePressure])eps=-eps;
        if(pressureDifference&&j<2&&cur.y[j]<cur.y[1-j])eps=-eps;
        if(!density&&j>=3&&j<flowOffset){
          const s=cur.cells[j-3].state,sat=props.saturation(s.pPa),dl=s.hJkg-sat.liquidH,dv=s.hJkg-sat.vaporH;
          const near=Math.abs(dl)<Math.abs(dv)?dl:dv;
          eps=(near<0?-1:1)*Math.min(eps*scales[j],Math.max(5e-6,.2*Math.abs(near)))/scales[j];
        }
        const trial=[...x];trial[j]+=eps;let r,delta=eps;
        try{r=residual(trial);}catch{trial[j]=x[j]-eps;delta=-eps;r=residual(trial);}
        for(let i=0;i<x.length;i++)J[i][j]=(r.f[i]-cur.f[i])/delta;
        if(storage&&j<flowOffset){
          let sumM=0,sumU=0;
          for(let k=0;k<n;k++){
            const applies=j<3?(groups[k]===j||(pressureDifference&&j===sourcePressure&&groups[k]===2)):k===j-3,q=cur.cells[k].state.qualityMass;
            let derivative=applies&&(q===0||q===1)&&r.cells[k].state.qualityMass===null?
              circuit.storageDerivatives(cur.cells[k],true):storage[k];
            if(density){
              const cell=cur.cells[k],V=cell.volumeM3,rho=cell.state.densityKgm3,h=cell.state.hJkg;
              const rhoP=derivative.massP/V,rhoH=derivative.massH/V;
              // Exact coordinate chain rule, not a fitted EOS or M/U correction.
              derivative={massP:0,massH:V,energyP:V*(-rho*rhoP/rhoH-1),energyH:V*(h+rho/rhoH),
                temperatureP:derivative.temperatureP-derivative.temperatureH*rhoP/rhoH,
                temperatureH:derivative.temperatureH/rhoH};
            }
            const correctionM=(applies?(j<3?derivative.massP:derivative.massH)*scales[j]:0)-
              (r.cells[k].massKg-cur.cells[k].massKg)/delta;
            let correctionU=(applies?(j<3?derivative.energyP:derivative.energyH)*scales[j]:0)-
              (r.cells[k].internalEnergyJ-cur.cells[k].internalEnergyJ)/delta;
            const coil=circuit.definitions[k].coil;
            if(coil){const ua=coil==='outdoor'?g.outdoorConductanceWK/3:g.rooms.find(v=>v.id===coil).refrigerantConductanceWK/3;
              const exactT=applies?(j<3?derivative.temperatureP:derivative.temperatureH)*scales[j]:0;
              correctionU+=dt*ua*(exactT-(r.cells[k].state.temperatureC-cur.cells[k].state.temperatureC)/delta);}
            if(k!==acc){J[k][j]+=correctionM/.1;J[n+k][j]+=correctionU/50000;}
            sumM+=correctionM;sumU+=correctionU;
          }
          J[acc][j]+=sumM/.1;J[n+acc][j]+=sumU/50000;
        }
      }
      const step=linear(J,cur.f.map(v=>-v));let accepted=false;
      for(let a=1;a>=1/4096;a/=2){try{const trial=x.map((v,i)=>v+a*step[i]),r=residual(trial);
        if(merit(r)<merit(cur)){x=trial;cur=r;accepted=true;break;}}catch{}rejected++;}
      if(!accepted)throw Error('Density pilot line search failed');
    }
    if(cur.normalized>1)throw Error('Density pilot iteration budget exhausted');
  }catch(error){fault=String(error);}
  const snapshot=fault?null:{...previous,timeSeconds:previous.timeSeconds+dt,variables:cur.z,cells:cur.cells,openings,
    compressorWorkJ:previous.compressorWorkJ+dt*cur.rates.work,
    coilHeatJ:previous.coilHeatJ+dt*Object.values(cur.rates.heat).reduce((a,b)=>a+b,0)};
  const result={status:fault?'rejected':'accepted isolated frozen-metal step; not production activation',coordinate:density?'p,rho':'p,h',
    snapshotSeconds:previous.timeSeconds,dt,pressureRelativeStep,branchLimitedPressure,pressureDifference,pressureDifferenceStepPa,wallMs:performance.now()-start,evaluations,iterations,rejected,
    fault,normalized:cur.normalized,aggregateMassResidualKg:cur.mass,aggregateEnergyResidualJ:cur.energy,
    maxLocalMassResidualKg:Math.max(...cur.local.slice(0,n).map(Math.abs)),maxLocalEnergyResidualJ:Math.max(...cur.local.slice(n,2*n).map(Math.abs)),
    pressuresPa:cur.y.slice(0,3),accumulator:cur.cells[acc],heatW:cur.rates.heat,history,snapshot};
  props.dispose();return result;
}

export async function createPilot() {
  const cp = await factory(); let calls = 0; const cache = new Map();
  const prop = (out,a,x,b,y) => {
    const key = `${out}:${a}:${x}:${b}:${y}`; if(cache.has(key)) return cache.get(key);
    calls++; const z = cp.PropsSI(out,a,x,b,y,'R32');
    if(!Number.isFinite(z) || Math.abs(z)>1e30) throw new Error(`Invalid ${out}(${a},${b})`);
    if(cache.size>60000) cache.clear(); cache.set(key,z); return z;
  };
  const du = (M,U,V) => {
    if(!(M>0 && V>0)) throw new Error('Nonpositive storage'); const rho=M/V,u=U/M;
    // D and U are input echoes. Computed P is the actual safe flash preflight.
    const p=prop('P','D',rho,'U',u); if(!(p>101325 && p<5e6)) throw new Error('Pilot pressure envelope');
    const T=prop('T','D',rho,'U',u); if(!(T>220 && T<420)) throw new Error('Pilot temperature envelope');
    const h=u+p/rho,s=prop('S','D',rho,'U',u),q=prop('Q','D',rho,'U',u);
    return {p,T,h,s,rho,u,q};
  };
  const pq = (p,q,V) => {const rho=prop('D','P',p,'Q',q),u=prop('U','P',p,'Q',q); return [rho*V,rho*V*u];};
  const suction = state => {
    if(state.q>=0 && state.q<=1) {
      const rv=prop('D','P',state.p,'Q',1),rl=prop('D','P',state.p,'Q',0);
      const alpha=(state.q/rv)/(state.q/rv+(1-state.q)/rl);
      if(alpha<.02) throw new Error('Vapor pickup submerged');
      return {h:prop('H','P',state.p,'Q',1),s:prop('S','P',state.p,'Q',1),rho:rv,alpha};
    }
    if(state.h<prop('H','P',state.p,'Q',1)) throw new Error('Liquid compressor admission');
    return {...state,alpha:1};
  };
  // Equilibrium isentropic nozzle, throat kinetic energy dissipated downstream.
  // Generic HEM approximation, not an OEM short-tube/EEV correlation.
  const nozzle = (up,pDown,area) => {
    if(pDown>=up.p || area===0) return {massFlow:0,throatPa:up.p,flux:0};
    const flux = p => {
      const h=prop('H','P',p,'S',up.s),rho=prop('D','P',p,'S',up.s);
      return rho*Math.sqrt(Math.max(0,2*(up.h-h)));
    };
    // Coarse global bracket, then bounded golden maximization; endpoints retained.
    const ps=Array.from({length:13},(_,i)=>pDown*(up.p/pDown)**(i/12));
    const gs=ps.map(flux); let k=gs.indexOf(Math.max(...gs));
    let a=ps[Math.max(0,k-1)],b=ps[Math.min(12,k+1)],bestP=ps[k],best=gs[k];
    const r=(Math.sqrt(5)-1)/2; let c=b-r*(b-a),d=a+r*(b-a),gc=flux(c),gd=flux(d);
    for(let i=0;i<14;i++){if(gc>gd){b=d;d=c;gd=gc;c=b-r*(b-a);gc=flux(c);}else{a=c;c=d;gc=gd;d=a+r*(b-a);gd=flux(d);}}
    if(gc>best){best=gc;bestP=c;} if(gd>best){best=gd;bestP=d;}
    return {massFlow:.65*area*best,throatPa:bestP,flux:best};
  };
  const geometry={lowV:.001,highV:.0005,lowUA:40,highUA:40,metalCapacity:10000,
    displacementM3:8e-6,speedRps:20,etaVol:.8,etaIs:.7,valveAreaM2:2e-7};
  const initial = (highQuality=.05) => {
    const pL=prop('P','T',273.15,'Q',1),pH=prop('P','T',313.15,'Q',1);
    return [...pq(pL,.7,geometry.lowV),...pq(pH,highQuality,geometry.highV),283.15,303.15];
  };
  const rates = (y,g=geometry) => {
    const low=du(y[0],y[1],g.lowV),high=du(y[2],y[3],g.highV),S=suction(low);
    if(high.p<=low.p) throw new Error('Compressor restart/equalization unsupported in pilot');
    const mc=S.rho*g.displacementM3*g.speedRps*g.etaVol;
    const hd=S.h+(prop('H','P',high.p,'S',S.s)-S.h)/g.etaIs;
    const valve=nozzle(high,low.p,g.valveAreaM2),me=valve.massFlow;
    const qL=g.lowUA*(y[4]-low.T),qH=g.highUA*(y[5]-high.T),work=mc*(hd-S.h);
    return {dy:[me-mc,me*high.h-mc*S.h+qL,mc-me,mc*hd-me*high.h+qH,-qL/g.metalCapacity,-qH/g.metalCapacity],
      low,high,S,mc,me,hd,qL,qH,work,valve};
  };
  const solveLinear=(A,b)=>{
    A=A.map((row,i)=>[...row,b[i]]); const n=b.length;
    for(let j=0;j<n;j++){let k=j;for(let i=j+1;i<n;i++)if(Math.abs(A[i][j])>Math.abs(A[k][j]))k=i;
      [A[j],A[k]]=[A[k],A[j]];if(Math.abs(A[j][j])<1e-15)throw new Error('Singular pilot Jacobian');
      const pivot=A[j][j];for(let l=j;l<=n;l++)A[j][l]/=pivot;
      for(let i=0;i<n;i++)if(i!==j){const f=A[i][j];for(let l=j;l<=n;l++)A[i][l]-=f*A[j][l];}}
    return A.map(row=>row[n]);
  };
  const step = (old,dt,g=geometry) => {
    const scale=[.1,50000,.1,50000,10,10]; let x=old.map((v,i)=>v/scale[i]);
    const residual = x => {const y=x.map((v,i)=>v*scale[i]),r=rates(y,g);return {r,y,f:y.map((v,i)=>(v-old[i]-dt*r.dy[i])/scale[i])};};
    let cur=residual(x),iterations=0; const norm=f=>Math.max(...f.map(Math.abs));
    for(;iterations<14 && norm(cur.f)>2e-11;iterations++) {
      const J=Array.from({length:6},()=>Array(6));
      for(let j=0;j<6;j++){const z=[...x],eps=1e-6*Math.max(1,Math.abs(x[j]));z[j]+=eps;
        const f=residual(z).f;for(let i=0;i<6;i++)J[i][j]=(f[i]-cur.f[i])/eps;}
      const d=solveLinear(J,cur.f.map(v=>-v)); let accepted=false;
      for(let a=1;a>=1/1024;a/=2){const z=x.map((v,i)=>v+a*d[i]);try{const n=residual(z);if(norm(n.f)<norm(cur.f)){x=z;cur=n;accepted=true;break;}}catch{}}
      if(!accepted)throw new Error('Pilot Newton line search failed');
    }
    if(norm(cur.f)>2e-11)throw new Error(`Pilot Newton residual ${norm(cur.f)}`);
    return {state:cur.y,rates:cur.r,iterations,residual:norm(cur.f)};
  };
  const vesselLeak = (state,V,dm) => {
    const old=du(state[0],state[1],V);if(!(dm>0 && dm<state[0]))throw new Error('Leak exhaustion');
    // Explicit local outgoing h; refinements must converge. No u substitution.
    const next=[state[0]-dm,state[1]-dm*old.h];return {state:next,before:old,after:du(...next,V),exportedH:dm*old.h};
  };
  // Idealized common-pressure finite-volume DAE: individual cell h and storage,
  // algebraic internal face flows inferred from continuity, no artificial resistance.
  const grouped = (n=3,inactiveCells=0,fixedMetals=false) => {
    const count=2*n+inactiveCells,metals=inactiveCells?3:2;
    const h0=2,f0=2+count,t0=2*count,dim=t0+metals;
    const scales=Array.from({length:dim},(_,i)=>i<2?1e6:i<f0?5e5:i<t0?.002:10);
    const start=initial(),pL=du(start[0],start[1],geometry.lowV).p,pH=du(start[2],start[3],geometry.highV).p;
    const init=[pL,pH,...Array(n).fill(prop('H','P',pL,'Q',.7)),...Array(n+inactiveCells).fill(prop('H','P',pH,'Q',.05)),
      ...Array(2*n-2).fill(.002),...Array(inactiveCells).fill(0),start[4],start[5],...(inactiveCells?[293.15]:[])];
    const evaluate = z => {
      const cells=Array.from({length:count},(_,j)=>{
        const p=z[j<n?0:1],h=z[h0+j],V=(j<n?geometry.lowV:geometry.highV)/n;
        const rho=prop('D','P',p,'H',h); if(!(rho>0&&p>101325&&p<5e6))throw new Error('Grouped domain');
        const T=prop('T','P',p,'H',h),s=prop('S','P',p,'H',h),q=prop('Q','P',p,'H',h);
        return {p,h,rho,T,s,q,M:rho*V,U:rho*V*h-p*V};
      });
      const S=suction(cells[n-1]);if(z[1]<=z[0])throw new Error('Grouped restart outside pilot');
      const mc=S.rho*geometry.displacementM3*geometry.speedRps*geometry.etaVol;
      const hd=S.h+(prop('H','P',z[1],'S',S.s)-S.h)/geometry.etaIs;
      const valve=nozzle(cells[2*n-1],z[0],geometry.valveAreaM2),me=valve.massFlow;
      const dm=Array(count).fill(0),dU=Array(count).fill(0);
      const face=(a,b,m,hPositive)=>{const h=m>=0?(hPositive??cells[a].h):cells[b].h;dm[a]-=m;dm[b]+=m;dU[a]-=m*h;dU[b]+=m*h;};
      face(2*n-1,0,me);dm[n-1]-=mc;dU[n-1]-=mc*S.h;dm[n]+=mc;dU[n]+=mc*hd;
      for(let j=0;j<n-1;j++){face(j,j+1,z[f0+j]);face(n+j,n+j+1,z[f0+n-1+j]);}
      // Closed EEV side branch: gas connection only; no prescribed throughflow.
      for(let j=0;j<inactiveCells;j++)face(j===0?n:2*n+j-1,2*n+j,z[f0+2*n-2+j]);
      const heats=Array(metals).fill(0);
      for(let j=0;j<count;j++){const metal=j<n?0:j<2*n?1:2;
        const q=40/n*(z[t0+metal]-cells[j].T);dU[j]+=q;heats[metal]+=q;}
      return {cells,dm,dU,qL:heats[0],qH:heats[1],heats,mc,me,work:mc*(hd-S.h)};
    };
    const advance=(old,dt)=>{
      const previous=evaluate(old),residual=x=>{const z=x.map((v,i)=>v*scales[i]),r=evaluate(z),f=[];
        for(let j=0;j<count;j++)f.push((r.cells[j].M-previous.cells[j].M-dt*r.dm[j])/.1);
        for(let j=0;j<count;j++)f.push((r.cells[j].U-previous.cells[j].U-dt*r.dU[j])/50000);
        for(let j=0;j<metals;j++)f.push((z[t0+j]-old[t0+j]+(fixedMetals?0:dt*r.heats[j]/10000))/10);return {z,r,f};};
      let x=old.map((v,i)=>v/scales[i]),cur=residual(x),iterations=0;const norm=f=>Math.max(...f.map(Math.abs));
      for(;iterations<18&&norm(cur.f)>2e-11;iterations++){
        const J=Array.from({length:dim},()=>Array(dim));
        for(let j=0;j<dim;j++){const z=[...x],eps=1e-6*Math.max(1,Math.abs(x[j]));z[j]+=eps;const f=residual(z).f;for(let i=0;i<dim;i++)J[i][j]=(f[i]-cur.f[i])/eps;}
        const d=solveLinear(J,cur.f.map(v=>-v));let accepted=false;
        for(let a=1;a>=1/1024;a/=2){const z=x.map((v,i)=>v+a*d[i]);try{const v=residual(z);if(norm(v.f)<norm(cur.f)){x=z;cur=v;accepted=true;break;}}catch{}}
        if(!accepted)throw new Error('Grouped Newton line search');
      }
      if(norm(cur.f)>2e-11)throw new Error(`Grouped residual ${norm(cur.f)}`);
      return {state:cur.z,rates:cur.r,iterations,residual:norm(cur.f)};
    };
    return {initial:init,evaluate,step:advance,tIndex:t0};
  };
  return {prop,du,pq,nozzle,initial,rates,step,vesselLeak,grouped,geometry,get calls(){return calls;}};
}

export async function runPilot() {
  const pilot=await createPilot(),roundtrips=[];
  for(const [name,a,x,b,y] of [['vapor','P',800000,'T',278.15],['liquid','P',2500000,'T',303.15],['two-phase','P',800000,'Q',.5]]){
    const rho=pilot.prop('D',a,x,b,y),u=pilot.prop('U',a,x,b,y),T=pilot.prop('T',a,x,b,y),p=pilot.prop('P',a,x,b,y);
    const start=performance.now(),s=pilot.du(rho*.001,rho*.001*u,.001);
    roundtrips.push({name,TErrorK:s.T-T,pErrorPa:s.p-p,wallMs:performance.now()-start});
  }
  const loops=[];
  for(const quality of [.05,.15]){
    let state=pilot.initial(quality);const start=performance.now(),old=[...state],callStart=pilot.calls;
    let work=0,maxMass=0,maxEnergy=0,maxIterations=0;const timings=[];
    for(let i=0;i<20;i++){const t=performance.now(),r=pilot.step(state,.25);timings.push(performance.now()-t);
      state=r.state;work+=.25*r.rates.work;maxIterations=Math.max(maxIterations,r.iterations);
      maxMass=Math.max(maxMass,Math.abs(state[0]+state[2]-old[0]-old[2]));
      maxEnergy=Math.max(maxEnergy,Math.abs(state[1]+state[3]+pilot.geometry.metalCapacity*(state[4]+state[5])-old[1]-old[3]-pilot.geometry.metalCapacity*(old[4]+old[5])-work));}
    const r=pilot.rates(state),sorted=[...timings].sort((a,b)=>a-b);
    loops.push({initialHighQuality:quality,initialMassKg:old[0]+old[2],durationS:5,wallMs:performance.now()-start,calls:pilot.calls-callStart,
      stepMedianMs:sorted[10],stepMaxMs:sorted.at(-1),maxIterations,maxMassResidualKg:maxMass,maxEnergyResidualJ:maxEnergy,
      lowBar:r.low.p/1e5,highBar:r.high.p/1e5,lowQuality:r.low.q,highQuality:r.high.q,compressorFlow:r.mc,valveFlow:r.me,workJ:work});
  }
  const leaks=[];
  for(const q of [.5,1]){let state=pilot.pq(800000,q,.001),exported=0;const old=[...state];
    for(let i=0;i<100;i++){const r=pilot.vesselLeak(state,.001,old[0]*.001);state=r.state;exported+=r.exportedH;}
    const s=pilot.du(...state,.001);leaks.push({initialQuality:q,massLossKg:old[0]-state[0],energyResidualJ:state[1]-old[1]+exported,
      finalTemperatureC:s.T-273.15,finalPressureBar:s.p/1e5,finalQuality:s.q});}
  const spatialLoops=[];
  for(const [n,inactiveCells] of [[3,0],[3,3]]){
    const g=pilot.grouped(n,inactiveCells);let y=g.initial;const old=g.evaluate(y);
    const sumM=r=>r.cells.reduce((s,c)=>s+c.M,0),sumE=(r,z)=>r.cells.reduce((s,c)=>s+c.U,0)+10000*z.slice(g.tIndex).reduce((a,b)=>a+b);
    const t=performance.now(),callStart=pilot.calls;let work=0,maxM=0,maxE=0;const times=[];
    for(let i=0;i<120;i++){const t0=performance.now(),r=g.step(y,.25);times.push(performance.now()-t0);y=r.state;work+=.25*r.rates.work;
      maxM=Math.max(maxM,Math.abs(sumM(r.rates)-sumM(old)));maxE=Math.max(maxE,Math.abs(sumE(r.rates,y)-sumE(old,g.initial)-work));}
    const r=g.evaluate(y);times.sort((a,b)=>a-b);
    spatialLoops.push({cellsPerCoil:n,inactiveCells,durationS:30,wallMs:performance.now()-t,calls:pilot.calls-callStart,stepMedianMs:times[60],stepMaxMs:times.at(-1),
      pBar:y.slice(0,2).map(v=>v/1e5),temperaturesC:r.cells.map(c=>c.T-273.15),qualities:r.cells.map(c=>c.q),enthalpiesJkg:r.cells.map(c=>c.h),
      inactiveMassChangeKg:inactiveCells?r.cells.slice(2*n).reduce((s,c)=>s+c.M,0)-old.cells.slice(2*n).reduce((s,c)=>s+c.M,0):null,
      maxMassResidualKg:maxM,maxEnergyResidualJ:maxE});
  }
  return {status:'bounded disposable grouped M/U pilot; not production model',backend:'CoolProp 8.0.0 public PropsSI',geometry:pilot.geometry,roundtrips,loops,leaks,spatialLoops};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  if(process.argv.includes('--owner-valve-initialization-comparison')){
    const cases=[];
    for(const initialValveOpening of [.65,0])cases.push(await runOwnerStartupFlux({initialValveOpening,roomVolumesM3:[84,155,100]}));
    const url=new URL('../research/charge-pilot-results.json',import.meta.url),saved=JSON.parse(await readFile(url,'utf8'));
    saved.ownerValveInitializationComparison={status:'closed-system initial actuator comparison; current owner room volumes',
      roomVolumesM3:{attic:84,upstairs:155,ground:100},cases};
    await writeFile(url,JSON.stringify(saved,null,2)+'\n');
    process.stdout.write(JSON.stringify(cases.map(c=>({initialValveOpening:c.config.inventory.initialValveOpening,
      wallSeconds:c.wallSeconds,last:c.trace.at(-1)})),null,2)+'\n');
  }
  else if(process.argv.includes('--owner-startup-flux')){
    const result=await runOwnerStartupFlux();
    const url=new URL('../research/charge-pilot-results.json',import.meta.url),saved=JSON.parse(await readFile(url,'utf8'));
    saved.ownerStartupFlux=result;await writeFile(url,JSON.stringify(saved,null,2)+'\n');
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
  }
  else if(process.argv.includes('--density-corner')){process.stdout.write(JSON.stringify(await runDensityCorner(),null,2)+'\n');}
  else {
  const result=await runPilot();if(process.argv.includes('--write'))await writeFile(new URL('../research/charge-pilot-results.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
  }
}
