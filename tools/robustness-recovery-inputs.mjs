import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Derive bounded recovery scenarios from an immutable, completed broad campaign.
// Every patch and source configuration remains visible in its saved input.
const args = process.argv.slice(2);
const value = (name, fallback) => { const i=args.indexOf(`--${name}`); return i<0?fallback:args[i+1]; };
const baseline = resolve(value('baseline', '/tmp/heatpump-robustness-final-in-domain-FD-75'));
const destination = resolve(value('output', '/tmp/heatpump-recovery-inputs-20261014'));
if (existsSync(destination)) throw new Error(`Refusing to overwrite inputs: ${destination}`);
const seed=Number(value('seed','20261014'));
if (!(Number.isInteger(seed)&&seed>=0&&seed<=0xffffffff)) throw new Error('Seed must be uint32');
const manifest=JSON.parse(readFileSync(`${baseline}/manifest.json`,'utf8'));
const {defaultEngineConfig}=await import(pathToFileURL(`${baseline}/snapshot/build/defaults.js`));
mkdirSync(destination,{recursive:true});
const scenarios=[];
const source = id => JSON.parse(readFileSync(`${baseline}/${id}/input.json`,'utf8'));
const saved = (scenario, patches, baseScenarioId=null) => {
  scenario.seed=seed;
  scenario.derivation={baselineDirectory:baseline,baselineSourceHashes:manifest.sourceHashes,baseScenarioId,patches};
  scenarios.push(scenario);
};
const ventilation = (scenario,eta=.8) => {
  for(const c of [scenario.config,...scenario.operations.filter(o=>o.type==='update').map(o=>o.config)])
    c.rooms.forEach(r=>Object.assign(r,{ventilationACH:.5,ventilationRecoveryEfficiency:eta}));
};
const linkConductance=4*40+45/(.26+.12/.040);
for(const name of ['winter-house','old-generic'])for(const direction of ['heat-to-cool','cool-to-heat']){
  const baseId=`reported-owner-reversal-${name}`,s=source(baseId);
  s.id=`dual-owner-${name}-${direction}`;ventilation(s);
  if(name==='winter-house')for(const c of [s.config,...s.operations.filter(o=>o.type==='update').map(o=>o.config)])
    c.interzoneLinks.forEach(l=>l.conductanceWK=linkConductance);
  if(direction==='cool-to-heat'){
    s.config.mode='cooling';s.config.outdoorTemperatureC=42;
    s.config.rooms.forEach(r=>{r.initialTemperatureC=30;r.setpointC=17;});
    const changed=s.operations.find(o=>o.type==='update').config;
    changed.mode='heating';changed.outdoorTemperatureC=1;
    changed.rooms.forEach(r=>r.setpointC=26);
  }
  saved(s,['All rooms grossACH=.5 and sensible eta=.8',...(name==='winter-house'?['Both links:4m² opening at40W/m²K +45m² solid,120mm glass wool lambda.040,films.26']:[]),...(direction==='cool-to-heat'?['Reverse initial mode/weather/targets;initial air30°C;retain stores at300s switch']:[])],baseId);
}
for(const id of ['reported-friend-cold-cooling','endurance-hot-wet-cooling','endurance-humid-frost-defrost']){
  const s=source(id);s.id=`dual-${id}`;ventilation(s);saved(s,['All rooms grossACH=.5 and sensible eta=.8'],id);
}
const owner=source('reported-owner-reversal-winter-house');
owner.id='actual-owner-default-dual-75pct-clean95';
owner.operations=[{type:'step',seconds:1200}];ventilation(owner,.75);
owner.config.outdoor.cleanFraction=.95;
owner.config.rooms.forEach((r,i)=>Object.assign(r,{setpointC:[21,21.5,17][i],cleanFraction:.95}));
owner.config.interzoneLinks.forEach(l=>l.conductanceWK=linkConductance);
saved(owner,['GrossACH=.5, sensible eta=.75, outdoor and all indoor coils95%clear','Winter targets attic21/off;up21.5;ground17;initial18.3/21.5/18°C;weather1°C RH35%','Current both links4m² opening +45m² solid with120mm glass wool;generic reference performance retained'],'reported-owner-reversal-winter-house');

let randomState=seed;
const random=()=>{randomState+=0x6d2b79f5;let t=randomState;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};
const range=(a,b)=>a+random()*(b-a);
for(const heads of [1,3,5,8])for(const eta of [0,.8,1]){
  const config=defaultEngineConfig(heads);config.indoorPortCapacity=Math.max(heads,5);
  const heating=(heads+Math.round(eta*10))%2===1;
  config.mode=heating?'heating':'cooling';config.outdoorTemperatureC=heating?-25:45;
  config.outdoorRelativeHumidity=1;config.outdoor.cleanFraction=[.1,.95,1][Math.floor(random()*3)];
  config.rooms.forEach((r,i)=>Object.assign(r,{initialTemperatureC:heating?17:30,setpointC:heating?26:17,
    volumeM3:range(11,600),envelopeWK:range(0,750),internalGainW:range(0,1000),
    ventilationACH:.5,ventilationRecoveryEfficiency:eta,cleanFraction:[.1,.95,1][i%3]}));
  config.interzoneLinks=config.rooms.slice(1).map((r,i)=>({roomA:config.rooms[i].id,roomB:r.id,conductanceWK:range(0,2000)}));
  const changed=structuredClone(config);changed.mode=heating?'cooling':'heating';
  changed.outdoorTemperatureC=heating?45:-.5;
  changed.rooms.forEach((r,i)=>Object.assign(r,{enabled:i===0||random()>.25,setpointC:changed.mode==='heating'?26:17}));
  saved({id:`seeded-dual-${heads}-heads-eta-${eta}`,config,operations:[{type:'step',seconds:120},{type:'update',config:changed},{type:'step',seconds:120}]},
    ['Deterministic seeded volumes/losses/gains/links and10/95/100%clear coils','GrossACH=.5 and explicit eta0/.8/1;RH100%;cold/hot saturated edges','Retained-state mode/weather/target/on-off edit at120s']);
}
for(const s of scenarios)writeFileSync(`${destination}/${s.id}.json`,JSON.stringify(s,null,2)+'\n');
console.log(JSON.stringify({destination,seed,scenarios:scenarios.length,requestedSeconds:scenarios.reduce((n,s)=>n+s.operations.filter(o=>o.type==='step').reduce((t,o)=>t+o.seconds,0),0),linkConductanceWK:linkConductance}));
