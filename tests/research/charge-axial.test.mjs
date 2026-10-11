import test from 'node:test';
import assert from 'node:assert/strict';
import factory from '../engine/backend.mjs';
import {Properties,DomainError} from './build/src/engine/properties.js';
import {AxialCoil,reconstructAxial,axialAdvectiveIntegral} from './build/research/prototypes/charge-axial.js';
import {finiteVolumeTube} from '../engine/charge-axial-fv-reference.mjs';

const V=.001,p0=1e6,coordinates=(p,a,b)=>({pressurePa:p,leftEnthalpyJkg:a,rightEnthalpyJkg:b});
const relative=(a,b,tolerance)=>assert.ok(Math.abs(a-b)<=tolerance*Math.max(1,Math.abs(a),Math.abs(b)),`${a} vs ${b}`);
function solve(matrix,rhs){
  const a=matrix.map((r,j)=>[...r,rhs[j]]),n=rhs.length;
  for(let j=0;j<n;j++){
    let k=j;for(let i=j+1;i<n;i++)if(Math.abs(a[i][j])>Math.abs(a[k][j]))k=i;
    [a[j],a[k]]=[a[k],a[j]];assert.ok(Math.abs(a[j][j])>1e-14);
    const d=a[j][j];for(let k=j;k<=n;k++)a[j][k]/=d;
    for(let i=0;i<n;i++)if(i!==j){const d=a[i][j];for(let k=j;k<=n;k++)a[i][k]-=d*a[j][k];}
  }return a.map(r=>r[n]);
}
function jacobian(f,x,eps=1e-6){
  const result=f(x).map(()=>x.map(()=>0));
  for(let j=0;j<x.length;j++){
    const a=[...x],b=[...x];a[j]+=eps;b[j]-=eps;const fa=f(a),fb=f(b);
    for(let i=0;i<fa.length;i++)result[i][j]=(fa[i]-fb[i])/(2*eps);
  }return result;
}
const shiftProperties=(props,C)=>({
  ph:(p,h)=>({...props.ph(p,h-C),hJkg:h}),
  prop:(out,a,x,b,y)=>props.prop(out,a,a==='H'?x-C:x,b,b==='H'?y-C:y)+(out==='H'?C:0),
  saturation:p=>{const s=props.saturation(p);return {...s,liquidH:s.liquidH+C,vaporH:s.vaporH+C};},
});

test('analytic wet profile moments have stable flat/tiny/negative slope and agree with independent quadrature',async()=>{
  const props=new Properties(await factory());
  try{
    const s=props.saturation(p0),L=s.vaporH-s.liquidH;
    const pairs=[[.2,.2],[.2,.2+1e-12],[.2,.2-1e-12],[0,1],[1,0],[0,.2],[.999,.001]];
    // Independent composite midpoint integration, with an independent resolution
    // comparison; this targets reciprocal-profile arithmetic, not solver residuals.
    for(const [a,b] of pairs){
      const c=coordinates(p0,s.liquidH+a*L,s.liquidH+b*L),r=reconstructAxial(props,V,c);
      const integrate=n=>{
        const out=[0,0,0];for(let j=0;j<n;j++){
          const z=(j+.5)/n,rho=1/((1-a-(b-a)*z)/props.ph(p0,s.liquidH).densityKgm3+
            (a+(b-a)*z)/props.ph(p0,s.vaporH).densityKgm3);
          for(let k=0;k<3;k++)out[k]+=rho*z**k/n;
        }return out;
      };
      const coarse=integrate(32768),fine=integrate(65536);
      for(let k=0;k<3;k++){
        const estimated=Math.abs(fine[k]-coarse[k])/3;
        assert.ok(Math.abs(r.densityMoments[k]-fine[k])<2*estimated+1e-10*Math.abs(fine[k]));
      }
      assert.ok(Object.isFrozen(r));assert.ok(Object.isFrozen(r.coordinates));
    }
  }finally{props.dispose();}
});

test('reconstruction is full rank in flat/sloped single-phase/wet/front-crossing domains',async t=>{
  const props=new Properties(await factory());
  try{
    const s=props.saturation(p0),L=s.vaporH-s.liquidH,cases=[[-.12,-.12],[1.15,1.15],[.4,.4],[-.1,1.1],[1.1,-.1],[.02,.9]];
    for(const pair of cases){
      const x=[p0/1e6,(s.liquidH+pair[0]*L)/5e5,(s.liquidH+pair[1]*L)/5e5];
      const f=x=>{const r=reconstructAxial(props,V,coordinates(x[0]*1e6,x[1]*5e5,x[2]*5e5));return [r.massKg/.1,r.internalEnergyJ/50000,r.firstEnergyMomentJ/50000];};
      const J=jacobian(f,x),inverse=[0,1,2].map(i=>solve(J,[0,1,2].map(j=>i===j?1:0)));
      const norm=A=>Math.max(...A.map(row=>row.reduce((s,v)=>s+Math.abs(v),0)));
      const transposed=inverse[0].map((_,i)=>inverse.map(row=>row[i]));
      const condition=norm(J)*norm(transposed);assert.ok(Number.isFinite(condition)&&condition<1e6);
      t.diagnostic(JSON.stringify({extendedQualityEndpoints:pair,scaledInfinityCondition:condition}));
    }
  }finally{props.dispose();}
});

test('flat adiabatic finite tube develops the inlet profile in either direction while retaining exact total ledgers',async t=>{
  const props=new Properties(await factory());
  try{
    const s=props.saturation(p0),L=s.vaporH-s.liquidH,h=s.liquidH+.1*L,inflow=s.vaporH+.05*L;
    for(const direction of [1,-1]){
      const c=new AxialCoil(props,V,0,coordinates(p0,h,h)),start=c.snapshot();let energy=0;
      const boundary={leftMassFlowKgs:direction*.01,rightMassFlowKgs:direction*.01,
        leftInflowEnthalpyJkg:inflow,rightInflowEnthalpyJkg:inflow,metalTemperatureC:20};
      for(let j=0;j<20;j++){
        const before=c.snapshot(),r=c.prepare(.05,boundary);assert.deepEqual(c.snapshot(),before);
        energy+=r.leftEnergyJ-r.rightEnergyJ+r.heatJ;c.commit(r);
        assert.ok(Math.abs(r.residuals.massKg)<=5e-11);assert.ok(Math.abs(r.residuals.energyJ)<=1e-5);
        assert.ok(Math.abs(r.residuals.energyMomentJ)<=1e-5);
      }
      const end=c.snapshot();assert.ok(direction*(end.coordinates.leftEnthalpyJkg-end.coordinates.rightEnthalpyJkg)>1000);
      assert.ok(Math.abs(end.massKg-start.massKg)<1e-9);
      assert.ok(Math.abs(end.internalEnergyJ-start.internalEnergyJ-energy)<2e-4);
      t.diagnostic(JSON.stringify({direction,leftH:end.left.hJkg,rightH:end.right.hJkg,pressurePa:end.coordinates.pressurePa}));
    }
  }finally{props.dispose();}
});

test('storage-derived local continuity makes the exact energy moment invariant to EOS reference shifts',async()=>{
  const props=new Properties(await factory());
  try{
    const s=props.saturation(p0),L=s.vaporH-s.liquidH;
    const a=coordinates(p0,s.liquidH+.15*L,s.liquidH+.7*L),b=coordinates(p0*1.001,s.liquidH+.17*L,s.liquidH+.72*L);
    const old=reconstructAxial(props,V,a),next=reconstructAxial(props,V,b),dt=.05,mL=.01,mR=mL-(next.massKg-old.massKg)/dt;
    for(const C of [-1e6,1e6]){
      const shifted=shiftProperties(props,C),shift=c=>({...c,leftEnthalpyJkg:c.leftEnthalpyJkg+C,rightEnthalpyJkg:c.rightEnthalpyJkg+C});
      const oldC=reconstructAxial(shifted,V,shift(a)),nextC=reconstructAxial(shifted,V,shift(b));
      relative(nextC.massKg,next.massKg,1e-12);
      relative(nextC.internalEnergyJ-next.internalEnergyJ,C*next.massKg,1e-12);
      const R=x=>V*(2*x.densityMoments[1]-x.densityMoments[0]);
      relative(nextC.firstEnergyMomentJ-next.firstEnergyMomentJ,C*R(next),1e-11);
      const I=axialAdvectiveIntegral(V,dt,old,next,mL),Ic=axialAdvectiveIntegral(V,dt,oldC,nextC,mL);
      const gained=(nextC.firstEnergyMomentJ-oldC.firstEnergyMomentJ)-(next.firstEnergyMomentJ-old.firstEnergyMomentJ);
      const flux=dt*(-C*mR-C*mL+2*(Ic-I));relative(gained,flux,2e-10);
      const c=new AxialCoil(props,V,150,a),d=new AxialCoil(shifted,V,150,shift(a));
      const boundary={leftMassFlowKgs:.01,rightMassFlowKgs:.01,leftInflowEnthalpyJkg:s.vaporH,metalTemperatureC:20};
      const r=c.prepare(.05,boundary),rc=d.prepare(.05,{...boundary,leftInflowEnthalpyJkg:s.vaporH+C});
      relative(r.storage.coordinates.pressurePa,rc.storage.coordinates.pressurePa,1e-9);
      relative(r.storage.left.hJkg,rc.storage.left.hJkg-C,1e-9);
      relative(r.storage.right.hJkg,rc.storage.right.hJkg-C,1e-9);
    }
  }finally{props.dispose();}
});

test('closed heat/Off/reversal retains finite storage, exact physical endpoints and transactional rollback',async()=>{
  const props=new Properties(await factory());
  try{
    const s=props.saturation(p0),L=s.vaporH-s.liquidH,c=new AxialCoil(props,V,100,coordinates(p0,s.liquidH+.1*L,s.liquidH+.8*L));
    const start=c.snapshot();let energy=0;
    for(const metal of [20,-10,20])for(let j=0;j<4;j++){
      const r=c.prepare(.05,{leftMassFlowKgs:0,rightMassFlowKgs:0,metalTemperatureC:metal});energy+=r.heatJ;c.commit(r);
    }
    const end=c.snapshot();assert.ok(Math.abs(end.massKg-start.massKg)<1e-9);assert.ok(Math.abs(end.internalEnergyJ-start.internalEnergyJ-energy)<1e-4);
    const before=c.snapshot(),r=c.prepare(.05,{leftMassFlowKgs:-.01,rightMassFlowKgs:-.01,rightInflowEnthalpyJkg:s.liquidH,metalTemperatureC:20});
    assert.deepEqual(c.snapshot(),before);assert.equal(r.rightEnergyJ,-.0005*s.liquidH);
    props.ph=()=>{throw new DomainError('Injected axial EOS failure');};
    assert.throws(()=>c.prepare(.05,{leftMassFlowKgs:0,rightMassFlowKgs:0,metalTemperatureC:20}),/Injected axial EOS failure/);
    assert.deepEqual(c.snapshot(),before);c.restore(before);assert.deepEqual(c.snapshot(),before);
    assert.throws(()=>c.commit(r),/Stale/);assert.throws(()=>c.restore(structuredClone(before)),/Foreign/);
  }finally{props.dispose();}
});

test('qualification rejects whole-coil P1 outlet undershoot against independently refined finite-volume transport',async t=>{
  const props=new Properties(await factory());
  try{
    const s=props.saturation(p0),L=s.vaporH-s.liquidH,h=s.liquidH+.1*L,inflow=s.vaporH+.05*L,dt=.025,duration=1;
    for(const direction of [1,-1]){
      const b={leftMassFlowKgs:direction*.01,rightMassFlowKgs:direction*.01,
        leftInflowEnthalpyJkg:inflow,rightInflowEnthalpyJkg:inflow,metalTemperatureC:20};
      const profile=new AxialCoil(props,V,0,coordinates(p0,h,h)),start=profile.snapshot();
      const fv=[3,6,12].map(N=>({N,tube:finiteVolumeTube(props,V,N,p0,h),outletEnergy:0}));
      for(const {tube} of fv){assert.ok(Math.abs(tube.snapshot().M-start.massKg)<1e-10);assert.ok(Math.abs(tube.snapshot().U-start.internalEnergyJ)<1e-5);}
      let profileOutletEnergy=0,minProfileOutlet=h;
      for(let step=0;step<Math.round(duration/dt);step++){
        const r=profile.prepare(dt,b);profile.commit(r);
        const outlet=direction>0?r.storage.right:r.storage.left;minProfileOutlet=Math.min(minProfileOutlet,outlet.hJkg);
        profileOutletEnergy+=direction>0?r.rightEnergyJ:-r.leftEnergyJ;
        for(const f of fv){const r=f.tube.step(dt,b);f.outletEnergy+=direction>0?r.rightJ:-r.leftJ;}
      }
      const p=profile.snapshot(),actualOutlet=direction>0?p.right:p.left;
      const comparisons=fv.map(f=>{const end=f.tube.snapshot(),out=end.cells[direction>0?f.N-1:0].state;
        return {cells:f.N,pressurePa:end.p,outletH:out.hJkg,outletEnergyJ:f.outletEnergy,
          profileOutletErrorJkg:actualOutlet.hJkg-out.hJkg,profileIntegratedOutletErrorJ:profileOutletEnergy-f.outletEnergy};});
      t.diagnostic(JSON.stringify({direction,profileOutletH:actualOutlet.hJkg,minProfileOutletH:minProfileOutlet,initialH:h,profileOutletEnergyJ:profileOutletEnergy,comparisons}));
      // This is a qualification assertion, not an output calibration: a hot
      // adiabatic incoming stream cannot create an outlet colder than the initial
      // state. Detect low-order profile undershoot before coupled adoption.
      const qualified=minProfileOutlet>=h-1e-3;
      assert.equal(qualified,false,'retained receipt must detect the unqualified whole-coil profile');
      assert.ok(comparisons[2].outletH>=h);
      assert.ok(Math.abs(comparisons[2].outletH-comparisons[1].outletH)<Math.abs(comparisons[1].outletH-comparisons[0].outletH));
      t.diagnostic(JSON.stringify({direction,qualified,reason:'adiabatic hot-inlet outlet undershoot',coupledAdoption:false}));
      const timeRefinement=[];
      for(const stepDt of [.05,.025,.0125]){
        const c=new AxialCoil(props,V,0,coordinates(p0,h,h));let integratedOutlet=0;
        for(let j=0;j<Math.round(duration/stepDt);j++){
          const r=c.prepare(stepDt,b);c.commit(r);integratedOutlet+=direction>0?r.rightEnergyJ:-r.leftEnergyJ;
        }
        const end=c.snapshot(),outlet=direction>0?end.right:end.left;
        assert.ok(outlet.hJkg<h-1000,'undershoot survives independent temporal refinement');
        timeRefinement.push({dt:stepDt,outletH:outlet.hJkg,integratedOutletJ:integratedOutlet});
      }
      t.diagnostic(JSON.stringify({direction,timeRefinement,qualified:false}));
    }
  }finally{props.dispose();}
});
