// Qualification override is local to this disposable probe instance.
import fs from 'node:fs/promises';
import {writeFileSync} from 'node:fs';
import G from '../public/vendor/coolprop-safe/adapter.js';
import O from '../public/vendor/coolprop/coolprop.js';
import {Properties,defaultEngineConfig} from '../tests/engine/build/index.js';
import {solveCycle} from '../tests/engine/build/cycle.js';
const mode=process.argv[2]??'heating',route=process.argv[3]??'full',cacheAll=process.argv[4]==='snapshot';
const g=await G(),o=await O();
let p;
if(route==='full')p=new Properties(g,'R407C','full-mixture');else if(route==='guarded')p=new Properties(g,'R407C');else{
  // Scalar PropsSI catches native failures. Do not expose unsafe state bindings.
  p=new Properties({PropsSI:o.PropsSI,HAPropsSI:o.HAPropsSI},'R407C');
}
p.refrigerant={...p.refrigerant,qualification:{...p.refrigerant.qualification,reference:true}};
const orig=p.prop.bind(p),calls={all:0,flash:0,cacheHits:0,unique:{}};
let checkpoint=performance.now();
const base=['T','H','S','D','Q'];
p.prop=(output,a,x,b,y)=>{
  calls.all++;
  if(performance.now()-checkpoint>1000){checkpoint=performance.now();writeFileSync(`/tmp/r407c-cycle-${route}-${cacheAll?'snapshot':'original'}-progress.json`,JSON.stringify({elapsedMs:checkpoint-start,calls}));}
  const input=`${a}:${x}:${b}:${y}`,key=`${output}:${input}`;
  if(p.cache.has(key))calls.cacheHits++;
  const previous=p.lastInput,had=p.cache.has(key),v=orig(output,a,x,b,y);
  if(!had&&previous!==p.lastInput){calls.flash++;calls.unique[`${a}:${b}`]=(calls.unique[`${a}:${b}`]??0)+1;}
  if(cacheAll&&route==='full'&&!had&&p.lastInput===input){
    for(const name of base)if(!p.cache.has(`${name}:${input}`))orig(name,a,x,b,y);
    const q=p.cache.get(`Q:${input}`);if(q>=0&&q<=1)orig('Qmass',a,x,b,y);
  }
  return v;
};
const c=defaultEngineConfig(1);c.fluid='R407C';c.mode=mode;
const start=performance.now();const result={mode,route,cacheAll,start:new Date().toISOString()};
let previous;
if(process.argv.includes('seed')){const seed=JSON.parse(await fs.readFile(`reviews/r407c-cycle-${mode}-pseudo.json`,'utf8')).output;previous={evaporatingC:seed.evaporatingC,condensingC:seed.condensingC};}
try{result.output=solveCycle(p,c,{mode,indoorMetalC:[mode==='heating'?30:15],outdoorMetalC:mode==='heating'?-3:38,active:[true],speedRps:40,previous});}catch(e){result.error=String(e);}
result.elapsedMs=performance.now()-start;result.calls=calls;
await fs.writeFile(`reviews/r407c-cycle-${mode}-${route}${cacheAll?'-snapshot':''}.json`,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({mode,route,cacheAll,elapsedMs:result.elapsedMs,calls,error:result.error,output:result.output?{low:result.output.lowPressureBarAbs,high:result.output.highPressureBarAbs,work:result.output.compressorWorkW,heat:result.output.condenserHeatW,residual:result.output.closureResidualW}:null},null,2));p.dispose();g.dispose();
