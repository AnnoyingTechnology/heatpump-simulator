import {createHash} from 'node:crypto';
import {cpSync,existsSync,mkdirSync,readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {dirname,resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const frozen=resolve(process.argv[2]??'/tmp/heatpump-inverter-full-119tzqi8'),destination=resolve(process.argv[3]??`/tmp/heatpump-inverter-ui-domain-${Date.now()}`);
if(existsSync(destination))throw Error(`Refusing existing destination:${destination}`);
mkdirSync(destination,{recursive:true});const snapshot=`${destination}/snapshot`;mkdirSync(snapshot);
cpSync(`${frozen}/tests/engine/build`,`${snapshot}/build`,{recursive:true});
cpSync(`${frozen}/public/vendor/coolprop-safe`,`${snapshot}/vendor`,{recursive:true});
cpSync(`${root}/reviews/inverter-ui-domain-worker.mjs`,`${snapshot}/worker.mjs`);
writeFileSync(`${snapshot}/package.json`,'{"type":"module"}\n');
const hashes={},sha=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
function hashTree(path,prefix){for(const entry of readdirSync(path,{withFileTypes:true}))entry.isDirectory()?hashTree(`${path}/${entry.name}`,`${prefix}/${entry.name}`):hashes[`${prefix}/${entry.name}`]=sha(`${path}/${entry.name}`);}
hashTree(`${frozen}/src/engine`,'src/engine');hashTree(`${snapshot}/build`,'compiled');hashTree(`${snapshot}/vendor`,'public/vendor/coolprop-safe');
hashes['reviews/inverter-ui-domain-worker.mjs']=sha(`${snapshot}/worker.mjs`);hashes['reviews/inverter-ui-domain-replay.mjs']=sha(fileURLToPath(import.meta.url));
// Frozen actual browser worker input avoids reconstructing the UI mapper.
for(const file of readdirSync(`${frozen}/src/engine`).filter(f=>f.endsWith('.ts')))if(sha(`${root}/src/engine/${file}`)!==hashes[`src/engine/${file}`])throw Error(`Engine source drift:${file}`);
const browserReceiptPath=`${root}/reviews/inverter-continuity-browser-results.json`;
const browserReceipt=JSON.parse(readFileSync(browserReceiptPath,'utf8'));
hashes['reviews/inverter-continuity-browser-results.json']=sha(browserReceiptPath);
for(const [file,hash] of Object.entries(browserReceipt.sourceHashes))if(file.startsWith('src/engine/')&&hashes[file]!==hash)throw Error(`Browser engine source drift:${file}`);
const initial=browserReceipt.diagnostic.initialConfig;if(!initial)throw Error('Missing real browser initialConfig');
const engine=()=>structuredClone(initial),cases=[];
const add=(id,c,seconds,expectations={},operations=[])=>cases.push({id,config:c,operations:[{type:'step',seconds},...operations],expectations,provenance:{browserReceipt:'reviews/inverter-continuity-browser-results.json',base:'diagnostic.initialConfig'}});
let c=engine();c.outdoorTemperatureC=-4;c.rooms.find(r=>r.id==='ground').setpointC=16;add('ui-owner-minus4-ground16',c,1200);
c=engine();c.outdoorTemperatureC=2;c.outdoorRelativeHumidity=1;c.rooms.filter(r=>r.enabled).forEach(r=>r.setpointC=26);add('ui-natural-frost-defrost-return',c,1800,{naturalDefrostReturn:true});
c=engine();c.rooms.filter(r=>r.enabled).forEach(r=>r.setpointC=26);const cooling=structuredClone(c);cooling.mode='cooling';cooling.outdoorTemperatureC=42;cooling.rooms.forEach(r=>r.setpointC=17);cooling.compressor.speedMinRps=8;
add('ui-owner-strong-heat-to42cooling',c,300,{},[{type:'update',config:cooling},{type:'step',seconds:900}]);
c=engine();c.rooms.forEach((r,i)=>r.pipe.lengthM=browserReceipt.config.pipes[i].lengthM);add('ui-physical-owner-heating',c,1200);
c=engine();add('ui-owner-default1C-two-hour',c,7200,{continuousOrdinaryService:true});
for(const s of cases){const dir=`${destination}/${s.id}`;mkdirSync(dir);writeFileSync(`${dir}/input.json`,JSON.stringify(s,null,2)+'\n');hashes[`inputs/${s.id}.json`]=sha(`${dir}/input.json`);}
const manifest={recordedAt:new Date().toISOString(),frozenSource:frozen,destination,hashes,cases:cases.map(s=>({id:s.id,seconds:s.operations.filter(o=>o.type==='step').reduce((n,o)=>n+o.seconds,0),minimumRps:s.config.compressor.speedMinRps,timeoutSeconds:s.id.includes('two-hour')?900:600}))};
writeFileSync(`${destination}/manifest.json`,JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify({destination,cases:manifest.cases}));
const results=await Promise.all(cases.map(s=>new Promise(resolveResult=>{
 const dir=`${destination}/${s.id}`,started=Date.now(),child=spawn(process.execPath,[`${snapshot}/worker.mjs`,snapshot,`${dir}/input.json`,`${dir}/progress.json`,`${dir}/result.json`],{stdio:['ignore','pipe','pipe']});
 let stderr='',stdout='',timedOut=false;child.stderr.on('data',v=>stderr+=v);child.stdout.on('data',v=>stdout+=v);
 const limit=manifest.cases.find(v=>v.id===s.id).timeoutSeconds*1000,timer=setTimeout(()=>{timedOut=true;child.kill('SIGKILL');},limit);
 child.on('exit',(code,signal)=>{clearTimeout(timer);writeFileSync(`${dir}/stderr.log`,stderr);writeFileSync(`${dir}/stdout.log`,stdout);
  const result=existsSync(`${dir}/result.json`)?JSON.parse(readFileSync(`${dir}/result.json`)):null;
  const outcome=timedOut?'timeout':result?.outcome??'process-failure';console.log(JSON.stringify({id:s.id,outcome,simulatedSeconds:result?.simulatedSeconds,completedDefrosts:result?.completedDefrosts,wallSeconds:(Date.now()-started)/1000}));
  resolveResult({id:s.id,outcome,exitCode:code,signal,timedOut,wallSeconds:(Date.now()-started)/1000,result});
 });
})));
const receipt={...manifest,method:'Frozen126-check engine and guarded HEOS; verbatim source-pinned actual browser diagnostic.initialConfig and explicitly scoped case edits; copied original robustness invariant+rollback harness with extra observation only.',results,
 passed:results.filter(r=>r.outcome==='pass').length,failed:results.filter(r=>r.outcome!=='pass').length,
 historicalMeasurements:'Only the Home Assistant calibration README was read. Purged historical mode/targets/fans and unknown outdoor RH were not invented; no raw exports used or changed, no measured-watt fitting.',
 limitation:'Unequal physical cooling remains explicit18rps. This campaign changes no production source or physical acceptance tolerance.'};
writeFileSync(`${root}/reviews/inverter-ui-domain-robustness-results.json`,JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({passed:receipt.passed,failed:receipt.failed}));
if(receipt.failed)process.exitCode=1;
