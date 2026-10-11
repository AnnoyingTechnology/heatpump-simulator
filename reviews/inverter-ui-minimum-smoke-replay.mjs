import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const original=process.argv[2]??'/tmp/heatpump-inverter-smoke-20261011',snapshot=process.argv[3]??'/tmp/heatpump-inverter-ui-domain-final4/snapshot',destination=process.argv[4]??`/tmp/heatpump-ui-minimum-smoke-${Date.now()}`;
if(existsSync(destination))throw Error(`Refusing existing destination:${destination}`);mkdirSync(destination);
const sha=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const hashes={'reviews/inverter-ui-minimum-smoke-replay.mjs':sha(fileURLToPath(import.meta.url)),worker:sha(`${snapshot}/worker.mjs`)},cases=[];
for(const id of readdirSync(original).filter(id=>existsSync(`${original}/${id}/input.json`)).sort()){
 const originalPath=`${original}/${id}/input.json`,s=JSON.parse(readFileSync(originalPath));hashes[`originalInputs/${id}`]=sha(originalPath);
 const apply=config=>{config.compressor.speedMinRps=config.inventory!==undefined||config.mode==='cooling'&&config.rooms.some(r=>r.pipe.lengthM>0)?18:8;};
 apply(s.config);for(const op of s.operations)if(op.type==='update')apply(op.config);
 mkdirSync(`${destination}/${id}`);writeFileSync(`${destination}/${id}/input.json`,JSON.stringify(s,null,2)+'\n');hashes[`qualifiedInputs/${id}`]=sha(`${destination}/${id}/input.json`);cases.push(s);
}
const results=[];let cursor=0;
async function run(s){return new Promise(done=>{const dir=`${destination}/${s.id}`,child=spawn(process.execPath,[`${snapshot}/worker.mjs`,snapshot,`${dir}/input.json`,`${dir}/progress.json`,`${dir}/result.json`],{stdio:['ignore','ignore','pipe']});let stderr='',timeout=false;child.stderr.on('data',x=>stderr+=x);const timer=setTimeout(()=>{timeout=true;child.kill('SIGKILL');},120000);child.on('exit',(code,signal)=>{clearTimeout(timer);writeFileSync(`${dir}/stderr.log`,stderr);const result=existsSync(`${dir}/result.json`)?JSON.parse(readFileSync(`${dir}/result.json`)):null;const outcome=timeout?'timeout':result?.outcome??'process-failure';console.log(JSON.stringify({id:s.id,outcome,error:result?.error?.message}));done({id:s.id,outcome,exitCode:code,signal,minimumRps:s.config.compressor.speedMinRps,result});});});}
await Promise.all(Array.from({length:2},async()=>{while(cursor<cases.length)results.push(await run(cases[cursor++]));}));
const receipt={recordedAt:new Date().toISOString(),original,snapshot,destination,hashes,method:'Replay exact existing25smoke inputs, changing only each initial/updated compressor minimum to declared UI policy: Reference idealized heating/cooling and physical heating8, physical cooling/inventory18 (the original25inputs exercise idealized Reference only). Every original operation, house input, tolerance and guarded native invariant retained.',results,passed:results.filter(r=>r.outcome==='pass').length,failed:results.filter(r=>r.outcome!=='pass').length};
writeFileSync(`${root}/reviews/inverter-ui-minimum-smoke-results.json`,JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({passed:receipt.passed,failed:receipt.failed}));if(receipt.failed)process.exitCode=1;
