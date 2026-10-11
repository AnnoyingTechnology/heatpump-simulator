import {DomainError, type Properties} from './properties.ts';
import type {RefrigerantState} from './types.ts';

/** Research-only, fixed-coordinate ordinary-tube profile. No phase-selective port. */
export type AxialProperties=Pick<Properties,'ph'|'saturation'|'prop'>;
export interface AxialCoordinates {pressurePa:number;leftEnthalpyJkg:number;rightEnthalpyJkg:number}
export interface AxialStorage {
  coordinates:AxialCoordinates;massKg:number;internalEnergyJ:number;firstEnergyMomentJ:number;
  densityMoments:[number,number,number];temperatureMoments:[number,number];
  left:RefrigerantState;right:RefrigerantState;phaseFronts:number[];
}
export interface AxialBoundary {
  /** Positive along increasing physical z, for either operating mode. */
  leftMassFlowKgs:number;rightMassFlowKgs:number;
  leftInflowEnthalpyJkg?:number;rightInflowEnthalpyJkg?:number;metalTemperatureC:number;
}
export interface AxialCandidate {
  storage:AxialStorage;acceptedSeconds:number;leftEnergyJ:number;rightEnergyJ:number;
  heatJ:number;heatMomentJ:number;nonlinearIterations:number;
  residuals:{massKg:number;energyJ:number;energyMomentJ:number};
}
const rules=[
  {nodes:[-.8611363115940526,-.3399810435848563,.3399810435848563,.8611363115940526],
   weights:[.3478548451374538,.6521451548625461,.6521451548625461,.3478548451374538]},
  {nodes:[-.9602898564975363,-.7966664774136267,-.525532409916329,-.1834346424956498,
    .1834346424956498,.525532409916329,.7966664774136267,.9602898564975363],
   weights:[.1012285362903763,.2223810344533745,.3137066458778873,.362683783378362,
    .362683783378362,.3137066458778873,.2223810344533745,.1012285362903763]},
];

/** Integrals t^n/(v0+dv*t), n=0,1,2. Series avoids near-flat cancellation. */
function reciprocalMoments(v0:number,dv:number):[number,number,number]{
  if(!(v0>0&&v0+dv>0))throw new DomainError('Invalid axial specific volume');
  const k=dv/v0;
  if(Math.abs(k)<.1){
    const values:[number,number,number]=[0,0,0];let power=1;
    for(let j=0;j<32;j++){
      for(let n=0;n<3;n++)values[n]+=power/(n+j+1)/v0;
      if(Math.abs(power)<1e-17)break;power*=-k;
    }
    return values;
  }
  const a=Math.log1p(k)/dv,b=(1-v0*a)/dv,c=(.5-v0*b)/dv;
  return [a,b,c];
}

/** Exact wet-region moments; bounded phase-local EOS quadrature elsewhere. */
export function reconstructAxial(properties:AxialProperties,volumeM3:number,c:AxialCoordinates):AxialStorage{
  if(!(Number.isFinite(volumeM3)&&volumeM3>0)||
    !Object.values(c).every(Number.isFinite))throw new DomainError('Invalid axial reconstruction');
  const a=c.leftEnthalpyJkg,b=c.rightEnthalpyJkg-a,p=c.pressurePa,sat=properties.saturation(p);
  const flash=(h:number)=>{
    const state=properties.ph(p,h);if(state.qualityMass!==null)return state;
    // Public PH preflight remains authoritative. Refine its single-phase T
    // against the same EOS with dH/dT|p=cp, before strict spatial quadrature;
    // native PH inversion roundoff near saturation otherwise looks like a
    // nonsmooth spatial profile. No equation of state or phase is changed.
    let T=state.temperatureC+273.15;
    const pressureKey=Math.abs(T-sat.temperatureC-273.15)<1e-4?(h<sat.liquidH?'P|liquid':'P|gas'):'P';
    for(let j=0;j<4;j++){
      const error=properties.prop('H',pressureKey,p,'T',T)-h;if(Math.abs(error)<1e-8)break;
      const next=T-error/properties.prop('C',pressureKey,p,'T',T);if(next===T)break;T=next;
    }
    return {...state,temperatureC:T-273.15,densityKgm3:properties.prop('D',pressureKey,p,'T',T),
      entropyJkgK:properties.prop('S',pressureKey,p,'T',T)};
  };
  const left=flash(a),right=flash(a+b);
  const fronts=b===0?[]:[sat.liquidH,sat.vaporH].map(h=>(h-a)/b).filter(z=>z>0&&z<1).sort((x,y)=>x-y);
  const points=[0,...fronts,1],density:[number,number,number]=[0,0,0],temperature:[number,number]=[0,0];
  let evaluations=0;
  const sample=(z:number)=>{
    if(++evaluations>8192)throw new DomainError('Axial quadrature work budget exceeded');
    const s=flash(a+b*z);
    return [s.densityKgm3,z*s.densityKgm3,z*z*s.densityKgm3,s.temperatureC,z*s.temperatureC];
  };
  const integrate=(lo:number,hi:number,rule:number)=>{
    const values=[0,0,0,0,0],mid=(lo+hi)/2,half=(hi-lo)/2;
    rules[rule].nodes.forEach((node,j)=>sample(mid+half*node).forEach((v,n)=>values[n]+=half*rules[rule].weights[j]*v));
    return values;
  };
  const adaptive=(lo:number,hi:number,depth:number):number[]=>{
    const coarse=integrate(lo,hi,0),fine=integrate(lo,hi,1);
    if(fine.every((v,n)=>Math.abs(v-coarse[n])<=1e-9*(hi-lo)+1e-12*Math.abs(v)))return fine;
    const mid=(lo+hi)/2;
    if(depth>=16||!(mid>lo&&mid<hi))throw new DomainError('Axial quadrature unresolved error');
    const x=adaptive(lo,mid,depth+1),y=adaptive(mid,hi,depth+1);return x.map((v,n)=>v+y[n]);
  };
  for(let i=0;i<points.length-1;i++){
    const lo=points[i],hi=points[i+1],width=hi-lo,midH=a+b*(lo+hi)/2;
    if(midH>=sat.liquidH&&midH<=sat.vaporH){
      const latent=sat.vaporH-sat.liquidH;
      // Recover equilibrium specific volumes from actual saturation endpoints.
      const liquid=properties.ph(p,sat.liquidH),vapor=properties.ph(p,sat.vaporH);
      const vl=1/liquid.densityKgm3,vg=1/vapor.densityKgm3;
      const v0=vl+(vg-vl)*(a+b*lo-sat.liquidH)/latent,dv=(vg-vl)*b*width/latent;
      const [j0,j1,j2]=reciprocalMoments(v0,dv);
      density[0]+=width*j0;density[1]+=width*(lo*j0+width*j1);
      density[2]+=width*(lo*lo*j0+2*lo*width*j1+width*width*j2);
      temperature[0]+=width*sat.temperatureC;temperature[1]+=(hi*hi-lo*lo)/2*sat.temperatureC;
    }else{
      const values=adaptive(lo,hi,0);for(let n=0;n<3;n++)density[n]+=values[n];
      temperature[0]+=values[3];temperature[1]+=values[4];
    }
  }
  return freeze({coordinates:{...c},massKg:volumeM3*density[0],
    internalEnergyJ:volumeM3*(a*density[0]+b*density[1]-p),
    firstEnergyMomentJ:volumeM3*(a*(2*density[1]-density[0])+b*(2*density[2]-density[1])),
    densityMoments:density,temperatureMoments:temperature,left,right,phaseFronts:fronts});
}

/** Internal advective integral, derived from pointwise mass continuity. */
export function axialAdvectiveIntegral(volumeM3:number,dt:number,previous:AxialStorage,next:AxialStorage,leftFlow:number):number{
  const a=next.coordinates.leftEnthalpyJkg,b=next.coordinates.rightEnthalpyJkg-a;
  const d=next.densityMoments.map((v,n)=>v-previous.densityMoments[n]);
  return leftFlow*(a+b/2)-volumeM3/dt*((a+b/2)*d[0]-a*d[1]-b/2*d[2]);
}

/** Research transaction: no public engine enables this closure yet. */
export class AxialCoil {
  private current:AxialStorage;
  private revision=0;
  private candidates=new WeakMap<AxialCandidate,number>();
  private snapshots=new WeakSet<AxialStorage>();
  constructor(private properties:AxialProperties,readonly volumeM3:number,readonly conductanceWK:number,initial:AxialCoordinates){
    if(!(Number.isFinite(conductanceWK)&&conductanceWK>=0))throw new DomainError('Invalid axial conductance');
    this.current=reconstructAxial(properties,volumeM3,initial);
  }
  snapshot():AxialStorage{const copy=freeze(structuredClone(this.current));this.snapshots.add(copy);return copy;}
  restore(s:AxialStorage):void{
    if(!this.snapshots.has(s))throw new DomainError('Foreign axial snapshot');
    this.current=s;this.revision++;
  }
  prepare(dt:number,boundary:AxialBoundary):AxialCandidate{
    if(!(Number.isFinite(dt)&&dt>0&&dt<=.25)||
      ![boundary.leftMassFlowKgs,boundary.rightMassFlowKgs,boundary.metalTemperatureC].every(Number.isFinite)||
      (boundary.leftMassFlowKgs>0&&!Number.isFinite(boundary.leftInflowEnthalpyJkg))||
      (boundary.rightMassFlowKgs<0&&!Number.isFinite(boundary.rightInflowEnthalpyJkg)))throw new DomainError('Invalid axial boundary');
    const previous=this.current,V=this.volumeM3,scale=[1e6,5e5,5e5];
    const evaluate=(x:number[])=>{
      const storage=reconstructAxial(this.properties,V,{pressurePa:x[0]*scale[0],leftEnthalpyJkg:x[1]*scale[1],rightEnthalpyJkg:x[2]*scale[2]});
      const leftH=boundary.leftMassFlowKgs>0?boundary.leftInflowEnthalpyJkg!:storage.left.hJkg;
      const rightH=boundary.rightMassFlowKgs<0?boundary.rightInflowEnthalpyJkg!:storage.right.hJkg;
      const leftEnergyJ=dt*boundary.leftMassFlowKgs*leftH,rightEnergyJ=dt*boundary.rightMassFlowKgs*rightH;
      const heatJ=dt*this.conductanceWK*(boundary.metalTemperatureC-storage.temperatureMoments[0]);
      const heatMomentJ=-dt*this.conductanceWK*(2*storage.temperatureMoments[1]-storage.temperatureMoments[0]);
      const integral=axialAdvectiveIntegral(V,dt,previous,storage,boundary.leftMassFlowKgs);
      const residuals={massKg:storage.massKg-previous.massKg-dt*(boundary.leftMassFlowKgs-boundary.rightMassFlowKgs),
        energyJ:storage.internalEnergyJ-previous.internalEnergyJ-leftEnergyJ+rightEnergyJ-heatJ,
        energyMomentJ:storage.firstEnergyMomentJ-previous.firstEnergyMomentJ+leftEnergyJ+rightEnergyJ-2*dt*integral-heatMomentJ};
      return {storage,leftEnergyJ,rightEnergyJ,heatJ,heatMomentJ,residuals,
        f:[residuals.massKg/.1,residuals.energyJ/50000,residuals.energyMomentJ/50000]};
    };
    const c=previous.coordinates;let x=[c.pressurePa,c.leftEnthalpyJkg,c.rightEnthalpyJkg].map((v,n)=>v/scale[n]),r=evaluate(x),iterations=0;
    const norm=(f:number[])=>Math.max(...f.map(Math.abs));
    const closed=()=>Math.abs(r.residuals.massKg)<=5e-11&&Math.abs(r.residuals.energyJ)<=1e-5&&Math.abs(r.residuals.energyMomentJ)<=1e-5;
    while(!closed()){
      if(iterations++>=24)throw new DomainError('Axial nonlinear iteration work budget exceeded');
      const matrix=r.f.map(()=>[0,0,0]);
      for(let j=0;j<3;j++){
        const plus=[...x],minus=[...x],epsilon=1e-6;plus[j]+=epsilon;minus[j]-=epsilon;
        const a=evaluate(plus).f,b=evaluate(minus).f;
        for(let i=0;i<3;i++)matrix[i][j]=(a[i]-b[i])/(2*epsilon);
      }
      const delta=linearSolve(matrix,r.f.map(v=>-v));let accepted=false;
      for(let search=0;search<24;search++){
        const fraction=2**-search,trial=x.map((v,j)=>v+fraction*delta[j]);
        try{const next=evaluate(trial);if(norm(next.f)<norm(r.f)){x=trial;r=next;accepted=true;break;}}catch(error){if(!(error instanceof DomainError))throw error;}
      }
      if(!accepted)throw new DomainError('Axial line search failed');
    }
    const {f,...physical}=r,candidate=freeze({...physical,acceptedSeconds:dt,nonlinearIterations:iterations});
    this.candidates.set(candidate,this.revision);return candidate;
  }
  commit(c:AxialCandidate):void{
    if(this.candidates.get(c)!==this.revision)throw new DomainError('Stale/foreign axial candidate');
    this.current=c.storage;this.candidates.delete(c);this.revision++;
  }
}

function linearSolve(matrix:number[][],rhs:number[]):number[]{
  const a=matrix.map((row,j)=>[...row,rhs[j]]);
  for(let j=0;j<rhs.length;j++){
    let pivot=j;for(let k=j+1;k<rhs.length;k++)if(Math.abs(a[k][j])>Math.abs(a[pivot][j]))pivot=k;
    [a[j],a[pivot]]=[a[pivot],a[j]];
    if(Math.abs(a[j][j])<1e-15)throw new DomainError('Singular axial reconstruction');
    const d=a[j][j];for(let k=j;k<=rhs.length;k++)a[j][k]/=d;
    for(let i=0;i<rhs.length;i++)if(i!==j){const d=a[i][j];for(let k=j;k<=rhs.length;k++)a[i][k]-=d*a[j][k];}
  }
  return a.map(row=>row[rhs.length]);
}
function freeze<T>(value:T):T{
  if(value&&typeof value==='object'){for(const nested of Object.values(value))freeze(nested);Object.freeze(value);}return value;
}
