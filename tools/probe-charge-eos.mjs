/** Disposable scientific pilot; never imported by production. Public CoolProp boundary only. */
import factory from '../public/vendor/coolprop/coolprop.js';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { writeFile } from 'node:fs/promises';

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
  const result=await runPilot();if(process.argv.includes('--write'))await writeFile(new URL('../research/charge-pilot-results.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
}
