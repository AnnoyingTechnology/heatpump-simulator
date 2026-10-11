// Disposable comparison: full fixed-composition HEOS versus published R407C PPF.
import fs from 'node:fs/promises';
import Guarded from '../public/vendor/coolprop-safe/adapter.js';
import Official from '../public/vendor/coolprop/coolprop.js';
const g=await Guarded(),o=await Official(),s=g.factory('HEOS','R407C-mix');
const result={source:'CoolProp v8.0.0 ae81610e7d23efc57f9d051c8e70a4d66e87537f; full mixture mass R32/R125/R134a=23/25/52; PPF Lemmon2003',points:[],exceptions:[],timings:{},reference:null};
const snapshot=()=>{const v={p:s.p(),T:s.T(),h:s.hmass(),S:s.smass(),D:s.rhomass(),Q:s.Q()};v.Qmass=v.Q>=0&&v.Q<=1?s.Qmass():null;return v;};
const full=(pair,a,b)=>{const t=performance.now();s.update(g.input_pairs[pair],a,b);const v=snapshot();v.ms=performance.now()-t;return v;};
const pseudo=(a,x,b,y)=>Object.fromEntries(['T','H','S','D','Q'].map(k=>[k,o.PropsSI(k,a,x,b,y,'R407C')]));
const fp=full('PT_INPUTS',1e5,300),pp=pseudo('P',1e5,'T',300);
const dH=fp.h-pp.H,dS=fp.S-pp.S;result.reference={p:1e5,T:300,dH,dS,full:fp,pseudo:pp};
const ps=[5.01e4,...[-40,-20,0,20,40,65].map(t=>o.PropsSI('P','T',t+273.15,'Q',0,'R407C')),3.95e6];
for(const p of ps){
  const endpoints=[full('PQ_INPUTS',p,0),full('PQ_INPUTS',p,1)];
  for(const q of [0,.05,.25,.5,.75,.95,1]){
    try{
      const f=full('PQ_INPUTS',p,q),t=performance.now(),pph=pseudo('P',p,'H',f.h-dH),pqmass=pseudo('P',p,'Q',f.Qmass),ms=performance.now()-t;
      result.points.push({kind:'two-phase',p,q,full:f,pseudoPH:pph,pseudoSameMassParameter:pqmass,pseudoMs:ms,errors:{T:pph.T-f.T,S:pph.S+dS-f.S,Drel:pph.D/f.D-1,Qsurrogate:pph.Q-f.Qmass,TatMassParameter:pqmass.T-f.T,HatMassParameter:pqmass.H+dH-f.h}});
    }catch(e){result.exceptions.push({p,q,error:String(e)});}
  }
  for(const T of [endpoints[0].T-15,endpoints[0].T-3,endpoints[1].T+3,endpoints[1].T+15,410,433.149]){
    if(T<213.15||T>433.15)continue;
    try{
      const f=full('PT_INPUTS',p,T),pt=pseudo('P',p,'T',T),ph=pseudo('P',p,'H',f.h-dH);
      result.points.push({kind:'single-phase',p,T,full:f,pseudoPT:pt,pseudoPH:ph,errors:{T:ph.T-f.T,H:pt.H+dH-f.h,S:pt.S+dS-f.S,Drel:pt.D/f.D-1}});
      if(T>endpoints[1].T&&T<350)for(const ratio of [1.5,3])if(p*ratio<4e6){
        const fiso=full('PSmass_INPUTS',p*ratio,f.S),hiso=o.PropsSI('H','P',p*ratio,'S',pt.S,'R407C'),Tiso=o.PropsSI('T','P',p*ratio,'S',pt.S,'R407C');
        result.points.push({kind:'isentropic',p:p*ratio,inlet:f,full:fiso,pseudo:{H:hiso,T:Tiso},errors:{T:Tiso-fiso.T,workRel:(hiso-pt.H)/(fiso.h-f.h)-1}});
      }
    }catch(e){result.exceptions.push({p,T,error:String(e)});}
  }
  await fs.writeFile('reviews/r407c-properties-probe.json',JSON.stringify(result,null,2)+'\n');
  process.stdout.write(JSON.stringify({p,points:result.points.length,exceptions:result.exceptions.length})+'\n');
}
for(const kind of ['two-phase','single-phase','isentropic']){
  const rows=result.points.filter(r=>r.kind===kind),keys=[...new Set(rows.flatMap(r=>Object.keys(r.errors)))];
  result.timings[kind]={count:rows.length,fullMedianMs:rows.map(r=>r.full.ms).sort((a,b)=>a-b)[Math.floor(rows.length/2)]};
  result[kind]=Object.fromEntries(keys.map(k=>[k,{max:Math.max(...rows.map(r=>Math.abs(r.errors[k]??0))),rms:Math.sqrt(rows.reduce((v,r)=>v+(r.errors[k]??0)**2,0)/rows.length)}]));
}
await fs.writeFile('reviews/r407c-properties-probe.json',JSON.stringify(result,null,2)+'\n');
process.stdout.write(JSON.stringify({reference:result.reference,exceptions:result.exceptions,timings:result.timings,errors:Object.fromEntries(['two-phase','single-phase','isentropic'].map(k=>[k,result[k]]))},null,2)+'\n');
s.delete();g.dispose();
