// Independent shared-pressure finite-volume discretization of the same local
// mass/internal-energy PDE. Ordinary homogeneous cell donor streams, no profile
// moments or axial reconstruction. Only a test reference, not production code.
import assert from 'node:assert/strict';
import {boundedEnthalpyFaces} from './build/charge-faces.js';

function solve(matrix,rhs){
  const a=matrix.map((r,j)=>[...r,rhs[j]]),n=rhs.length;
  for(let j=0;j<n;j++){
    let k=j;for(let i=j+1;i<n;i++)if(Math.abs(a[i][j])>Math.abs(a[k][j]))k=i;
    [a[j],a[k]]=[a[k],a[j]];assert.ok(Math.abs(a[j][j])>1e-15,'FV singular Jacobian');
    const d=a[j][j];for(let k=j;k<=n;k++)a[j][k]/=d;
    for(let i=0;i<n;i++)if(i!==j){const d=a[i][j];for(let k=j;k<=n;k++)a[i][k]-=d*a[j][k];}
  }return a.map(r=>r[n]);
}
export function finiteVolumeTube(props,volume,N,p,h,conductance=0,reconstruction='constant',coordinates='enthalpy'){
  const cellV=volume/N;
  const flash=(p,h)=>{
    const state=props.ph(p,h);if(state.qualityMass!==null)return state;
    const sat=props.saturation(p);let T=state.temperatureC+273.15;
    const key=Math.abs(T-sat.temperatureC-273.15)<1e-4?(h<sat.liquidH?'P|liquid':'P|gas'):'P';
    for(let j=0;j<4;j++){
      const error=props.prop('H',key,p,'T',T)-h;if(Math.abs(error)<1e-8)break;
      const next=T-error/props.prop('C',key,p,'T',T);if(next===T)break;T=next;
    }
    return {...state,temperatureC:T-273.15,densityKgm3:props.prop('D',key,p,'T',T)};
  };
  const states=z=>Array.from({length:N},(_,j)=>{
    const state=coordinates==='density'?props.pd(z[0],z[j+1]):flash(z[0],z[j+1]),M=cellV*state.densityKgm3;
    return {state,M,U:M*state.hJkg-z[0]*cellV};
  });
  let z=[p,...Array(N).fill(coordinates==='density'?props.ph(p,h).densityKgm3:h)],cells=states(z);
  const snapshot=()=>({p:z[0],cells:structuredClone(cells),M:cells.reduce((s,c)=>s+c.M,0),U:cells.reduce((s,c)=>s+c.U,0)});
  const singleStep=(dt,b)=>{
    const prev=cells,scale=[1e6,...Array(N).fill(coordinates==='density'?500:5e5)],previousMass=prev.reduce((s,c)=>s+c.M,0);
    const evaluate=x=>{
      const nextZ=x.map((v,j)=>v*scale[j]),next=states(nextZ),flows=[b.leftMassFlowKgs];
      for(let j=0;j<N;j++)flows.push(flows[j]-(next[j].M-prev[j].M)/dt);
      const faces=reconstruction==='mc'?boundedEnthalpyFaces(next.map(c=>c.state.hJkg)):
        next.map(c=>({left:c.state.hJkg,right:c.state.hJkg}));
      const flux=flows.map((m,j)=>m===0?0:m*(j===0?(m>=0?(b.leftInflowEnthalpyJkg??next[0].state.hJkg):next[0].state.hJkg):
        j===N?(m>=0?next[N-1].state.hJkg:(b.rightInflowEnthalpyJkg??next[N-1].state.hJkg)):m>=0?faces[j-1].right:faces[j].left));
      const q=next.map((c,j)=>conductance/N*((Array.isArray(b.metalTemperatureC)?b.metalTemperatureC[j]:b.metalTemperatureC)-c.state.temperatureC));
      const mass=next.reduce((s,c)=>s+c.M,0)-previousMass-dt*(b.leftMassFlowKgs-b.rightMassFlowKgs);
      const energy=next.map((c,j)=>c.U-prev[j].U-dt*(flux[j]-flux[j+1]+q[j]));
      return {z:nextZ,cells:next,mass,energy,leftJ:dt*flux[0],rightJ:dt*flux[N],heatJ:dt*q.reduce((s,v)=>s+v,0),
        f:[mass/.1,...energy.map(v=>v/50000)]};
    };
    let x=z.map((v,j)=>v/scale[j]),r=evaluate(x),iterations=0;
    const norm=f=>Math.max(...f.map(Math.abs)),closed=()=>Math.abs(r.mass)<1e-12&&r.energy.every(v=>Math.abs(v)<5e-7/N);
    while(!closed()){
      assert.ok(iterations++<24,'FV nonlinear iteration guard');const J=r.f.map(()=>x.map(()=>0));
      for(let j=0;j<x.length;j++){
        const plus=[...x],minus=[...x],eps=1e-6;plus[j]+=eps;minus[j]-=eps;
        const a=evaluate(plus).f,b=evaluate(minus).f;for(let i=0;i<a.length;i++)J[i][j]=(a[i]-b[i])/(2*eps);
      }
      const delta=solve(J,r.f.map(v=>-v));let accepted=false;
      for(let j=0;j<24;j++){
        const trial=x.map((v,k)=>v+2**-j*delta[k]);
        try{const next=evaluate(trial);if(norm(next.f)<norm(r.f)){x=trial;r=next;accepted=true;break;}}catch(error){if(error.name!=='DomainError')throw error;}
      }
      assert.ok(accepted,`FV line search guard: iteration ${iterations}, pressure ${r.z[0]}, mass ${r.mass}, maxEnergy ${Math.max(...r.energy.map(Math.abs))}, h ${r.z.slice(1).join(',')}`);
    }
    z=r.z;cells=r.cells;return r;
  };
  // Phase/limiter switches can make a single Newton interval inadmissible.
  // Retry smaller physical intervals without committing the rejected candidate.
  const step=(dt,b,depth=0)=>{
    const previousZ=[...z],previousCells=cells;
    try{return {...singleStep(dt,b),substeps:1};}
    catch(error){
      z=previousZ;cells=previousCells;
      if(depth>=12||!String(error.message).startsWith('FV '))throw error;
      try{
        const first=step(dt/2,b,depth+1),last=step(dt/2,b,depth+1);
        return {...last,mass:first.mass+last.mass,energy:last.energy.map((v,j)=>v+first.energy[j]),
          leftJ:first.leftJ+last.leftJ,rightJ:first.rightJ+last.rightJ,heatJ:first.heatJ+last.heatJ,
          substeps:first.substeps+last.substeps};
      }catch(failure){z=previousZ;cells=previousCells;throw failure;}
    }
  };
  return {snapshot,step};
}
