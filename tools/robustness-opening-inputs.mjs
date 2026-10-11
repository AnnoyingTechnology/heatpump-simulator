import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2),value=(name,fallback)=>{const i=args.indexOf(`--${name}`);return i<0?fallback:args[i+1];};
const baseline=resolve(value('baseline','/tmp/heatpump-indoor-comfort-final-21'));
const destination=resolve(value('output','/tmp/heatpump-opening-inputs-20261016'));
if(existsSync(destination))throw new Error(`Refusing to overwrite inputs:${destination}`);
const {defaultEngineConfig}=await import(pathToFileURL(`${baseline}/snapshot/build/defaults.js`));
const source=id=>JSON.parse(readFileSync(`${root}/tests/engine/fixtures/robustness-recovery-20261014/${id}.json`,'utf8'));
const solid=45/(.26+.12/.040),opening=(lower,orientation='vertical',area=4)=>({orientation,areaM2:area,...(orientation==='vertical'?{lowerRoomId:lower}:{}),heightM:2,backgroundConductanceWK:0,floorCoefficient:.055,wallDischargeCoefficient:.6});
const cases=[],allConfigs=s=>[s.config,...s.operations.filter(o=>o.type==='update').map(o=>o.config)];
const ownerGeometry=c=>{
  c.rooms.forEach((r,i)=>r.id=['attic','first','ground'][i]);
  c.interzoneLinks=[{roomA:'ground',roomB:'first',conductanceWK:solid,openingExchange:opening('ground')},
    {roomA:'first',roomB:'attic',conductanceWK:solid,openingExchange:opening('first')}];
};
const chainGeometry=c=>{c.interzoneLinks=c.rooms.slice(1).map((r,i)=>({roomA:c.rooms[i].id,roomB:r.id,conductanceWK:solid,openingExchange:opening(c.rooms[i].id,i%2?'horizontal':'vertical')}));};
const record=(s,patches)=>{s.derivation={...(s.derivation??{}),openingPatches:patches};cases.push(s);};
for(const outdoor of [0,1])for(const alone of [false,true]){
  const s=source('actual-owner-default-dual-75pct-clean95');s.id=`opening-owner-${outdoor}C-${alone?'up-alone-ground16':'ground17'}-1200`;
  ownerGeometry(s.config);s.config.outdoorTemperatureC=outdoor;
  if(alone)Object.assign(s.config.rooms[2],{enabled:false,setpointC:16});
  record(s,['Actual owner IDs/volumes/H45/25/15/gain200ground/.5ACH/.75dual/.95coils','Both floor paths solid13.803681W/K +CandidateA4m²opening;physical lower IDsground/first',`Outdoor${outdoor}°C;${alone?'upstairs only;groundOff,target16':'groundOn,target17;atticOff'}`]);
}
{
  const s=source('actual-owner-default-dual-75pct-clean95');s.id='opening-owner-minus4-ground16-1200';ownerGeometry(s.config);
  s.config.outdoorTemperatureC=-4;s.config.rooms[2].setpointC=16;
  record(s,['Current CandidateA owner geometry','.5ACH/.75dual/.95coils;groundOn16,up21.5,atticOff;outdoor−4°C']);
}
for(const direction of ['heat-to-cool','cool-to-heat']){
  const s=source(`dual-owner-winter-house-${direction}`);s.id=`opening-owner-${direction}-42C-1200`;
  allConfigs(s).forEach(ownerGeometry);s.requestedUiSpeed=50;
  record(s,['Retained300s/900s owner reversal;42°Ccooling and1°Cheating','Actual quarter-second physical calls;50×is pacing only','Current CandidateAowner floor geometry;source room targets/dual.8 preserved']);
}
for(const id of ['dual-endurance-humid-frost-defrost','dual-endurance-hot-wet-cooling','dual-reported-friend-cold-cooling']){
  const s=source(id);s.id=`opening-${id}`;allConfigs(s).forEach(chainGeometry);
  record(s,['Replace every legacy link/add chain with CandidateA floor/wall paths','Preserve exact weather,rooms,humidity,dual ventilation,duration andcontrols']);
}
const isolated=(temperatures,volume=11)=>{
  const c=defaultEngineConfig(temperatures.length);c.outdoorTemperatureC=20;c.outdoorRelativeHumidity=.1;c.outdoor.naturalAirConductanceWK=0;
  c.rooms.forEach((r,i)=>Object.assign(r,{enabled:false,volumeM3:volume,initialTemperatureC:temperatures[i],initialRelativeHumidity:.1,envelopeWK:0,ventilationACH:0,airFabricWK:0,naturalAirConductanceWK:0,fanPowerW:0}));
  return c;
};
for(const kind of ['vertical-stable','vertical-unstable','wall-height2']){
  const temperatures=kind==='vertical-stable'?[16,24]:[24,16],c=isolated(temperatures);
  c.interzoneLinks=[{roomA:c.rooms[0].id,roomB:c.rooms[1].id,conductanceWK:solid,openingExchange:opening(c.rooms[0].id,kind==='wall-height2'?'horizontal':'vertical')}];
  record({id:`opening-isolated-${kind}-1200`,config:c,operations:[{type:'step',seconds:1200}],expectations:{roomTemperatureBoundsC:[16,24],isolatedRoomWaterConservation:true}},['Passive isolated11m³rooms;noexternalroomheat/water;initial16/24or24/16','Explicit stable/unstable physical floor identity orwall apertureheight2m','Roomtemperatureconvexbounds andper-roomwaterconstancy checked']);
}
for(const maxStep of [.25,.05,.025]){
  const c=isolated([30,10,20],.1);c.numerics.maxStepSeconds=maxStep;
  c.interzoneLinks=[{roomA:'room-1',roomB:'room-2',conductanceWK:solid,openingExchange:opening('room-1','vertical',16)},
    {roomA:'room-2',roomB:'room-3',conductanceWK:200,openingExchange:opening(null,'horizontal',8)},
    {roomA:'room-1',roomB:'room-3',conductanceWK:100}];
  record({id:`opening-large-aperture-small-room-maxdt-${maxStep}`,config:c,operations:[{type:'step',seconds:1}],expectations:{roomTemperatureBoundsC:[10,30],isolatedRoomWaterConservation:true}},['Passive.1m³three-roomnetwork,floor16m²/wall8m²,height2m;physicalQnotclipped',`Maxinternaldt${maxStep}s;productionadaptiveboundactive;publiccalls.25s`]);
}
for(const maxStep of [.1,.05,.025]){
  const c=isolated([26,14],1);c.numerics.maxStepSeconds=maxStep;
  c.interzoneLinks=[{roomA:'room-1',roomB:'room-2',conductanceWK:solid,openingExchange:opening('room-1')}];
  record({id:`opening-refinement-one-m3-maxdt-${maxStep}`,config:c,operations:[{type:'step',seconds:1}],expectations:{roomTemperatureBoundsC:[14,26],isolatedRoomWaterConservation:true}},['Passive1m³rooms,floor4m²;comparefinaltrajectoriesacross.1/.05/.025s maxdt']);
}
{
  const s=source('actual-owner-default-dual-75pct-clean95');s.id='opening-owner-geometry-controls-edit-1200';ownerGeometry(s.config);
  const cold=structuredClone(s.config);cold.outdoorTemperatureC=-4;cold.rooms[2].setpointC=16;cold.interzoneLinks[0].openingExchange.areaM2=0;
  const wall=structuredClone(cold);wall.interzoneLinks[0].openingExchange=opening(null,'horizontal');wall.rooms[0].enabled=true;
  const restored=structuredClone(wall);restored.interzoneLinks[0].openingExchange=opening('ground');restored.rooms[0].enabled=false;
  s.operations=[{type:'step',seconds:300},{type:'update',config:cold},{type:'step',seconds:300},{type:'update',config:wall},{type:'step',seconds:300},{type:'update',config:restored},{type:'step',seconds:300}];
  record(s,['Actualownernewfloorpaths','At300s closegroundopening/coldweather/ground16;at600s wallheight2+atticOn;at900srestorefloor+atticOff','Editsmustpreserve acceptedclock/energy/waterhistory']);
}
{
  const s=source('seeded-dual-8-heads-eta-0.8');s.id='opening-eight-head-saturated-reversal-840';allConfigs(s).forEach(chainGeometry);
  s.operations[0].seconds=360;s.operations[2].seconds=480;
  record(s,['Exactseeded8headη.8 weather/rooms/loss/gain/OnOff retained','CandidateAalternatingfloor/wallheight2chain','360sinitial+retained480sreversal']);
}
mkdirSync(destination,{recursive:true});
for(const s of cases)writeFileSync(`${destination}/${s.id}.json`,JSON.stringify(s,null,2)+'\n');
console.log(JSON.stringify({destination,scenarios:cases.length,requestedSeconds:cases.reduce((n,s)=>n+s.operations.filter(o=>o.type==='step').reduce((t,o)=>t+o.seconds,0),0),solidConductanceWK:solid}));
