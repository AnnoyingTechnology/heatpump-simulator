import test from 'node:test';
import assert from 'node:assert/strict';
import Module from './backend.mjs';
import { Properties, HeatPumpEngine, defaultEngineConfig } from './build/index.js';
import { deriveOutdoorFilm, FUSION_JKG } from './build/film.js';
import { airExchange } from './build/air.js';
const p = new Properties(await Module());
const assertLedger = o => { assert.equal(o.diagnostics.fault, null); assert.ok(Math.abs(o.energy.residualJ) < .01, `energy ${o.energy.residualJ}`); assert.ok(Math.abs(o.energy.waterResidualKg) < 1e-10); };
function run(config, seconds) { const e = new HeatPumpEngine(p, config); let o; for(let i=0;i<seconds;i++) { o=e.step(1); assertLedger(o); } return {e,o}; }
test('real dynamic 1–5 branches conserve full stored energy/water and heating/cooling signs', () => {
  for(const n of [1,3,5]) for(const mode of ['heating','cooling']) {
    const c=defaultEngineConfig(n); c.mode=mode;
    if(mode==='cooling') {c.outdoorTemperatureC=32;c.rooms.forEach(r=>{r.initialTemperatureC=27;r.setpointC=24;});}
    const {o}=run(c,10); assert.equal(o.state,'running');
    assert.ok(mode==='heating' ? o.signedRoomHeatW>0 : o.signedRoomHeatW<0);
    assert.ok(o.rooms.every(r=>r.airOutletC!==null));
  }
});
test('early-trigger automatic defrost melts and drains finite inventories', () => {
  const c=defaultEngineConfig(3);c.control.defrostMinHeatingSeconds=30;c.control.defrostIceThresholdKg=.005;
  const e=new HeatPumpEngine(p,c);const states=new Set();let maximumIce=0, melted=false;
  for(let i=0;i<250;i++){const o=e.step(1);assertLedger(o);states.add(o.state);maximumIce=Math.max(maximumIce,o.outdoor.iceKg);if(o.outdoor.meltPowerW>0)melted=true;
    if(o.state==='defrost') {assert.equal(o.effectiveMode,'cooling');assert.equal(o.outdoor.fanPowerW,0);assert.ok(o.rooms.every(r=>r.fanPowerW===0&&r.airOutletC===null));assert.equal(o.heatingCOP,null);}
  }
  assert.ok(maximumIce>=.005&&melted);for(const state of ['reversing','defrost','draining','running'])assert.ok(states.has(state),state);
});
test('film phase map requires latent melt energy; exhausted film evaporates with exact bounded mass', () => {
  const c=defaultEngineConfig(1).outdoor, mass=.1, a=deriveOutdoorFilm(-mass*FUSION_JKG,mass,c), b=deriveOutdoorFilm(0,mass,c);
  assert.equal(a.temperatureC,0);assert.equal(a.iceKg,mass);assert.ok(b.iceKg===0);assert.equal(b.liquidKg,mass);
  const w=p.airW(20,.2,101325), air=airExchange(p,20,w,25,.05,50,101325,.000001);
  assert.equal(air.waterToSurfaceKgs,-.000001);assert.equal(air.evaporationLimited,true);
});
test('wet cooling removes water; timestep halving converges thermal/electrical totals', () => {
  const outputs=[];for(const dt of [.25,.125,.0625]){const c=defaultEngineConfig(1);c.mode='cooling';c.outdoorTemperatureC=32;c.rooms[0].initialTemperatureC=27;c.rooms[0].initialRelativeHumidity=.7;c.rooms[0].setpointC=22;c.numerics.maxStepSeconds=dt;outputs.push(run(c,30).o);}
  assert.ok(outputs[0].rooms[0].condensateKgs>0);assert.ok(outputs[0].rooms[0].humidityRatio<p.airW(27,.7,101325));
  assert.ok(Math.abs(outputs[1].rooms[0].temperatureC-outputs[2].rooms[0].temperatureC)<.002);
  assert.ok(Math.abs(outputs[1].energy.electricityJ/outputs[2].energy.electricityJ-1)<.002);
});
test('configuration edits retain room/ice inventories and min-on history; idle air outlets disappear', () => {
  const c=defaultEngineConfig(1),e=new HeatPumpEngine(p,c);let o=e.step(1);c.rooms[0].setpointC=18;e.updateConfig(c);o=e.step(1);assertLedger(o);assert.ok(o.cycle,'min-on must preserve compressor');
  c.rooms[0].volumeM3*=2;const oldT=o.rooms[0].temperatureC,oldW=o.rooms[0].humidityRatio;const edited=e.updateConfig(c);assert.ok(Math.abs(edited.rooms[0].temperatureC-oldT)<1e-6);assert.equal(edited.rooms[0].humidityRatio,oldW);assertLedger(edited);
  c.rooms[0].enabled=false;e.updateConfig(c);o=e.step(1);assertLedger(o);assert.equal(o.state,'idle');assert.equal(o.cycle,null);assert.equal(o.rooms[0].airOutletC,null);
  c.control.controlsW=-1;assert.throws(()=>e.updateConfig(c),/Control/);
});
test('mode reversal conserves cold metal then establishes live cooling instead of imposing subcooling', () => {
  const c=defaultEngineConfig(3);c.outdoorTemperatureC=7;c.outdoorRelativeHumidity=.35;const e=run(c,30).e;
  c.outdoorTemperatureC=0;e.updateConfig(c);e.step(20);c.rooms[0].setpointC=24;c.rooms[0].envelopeWK=120;e.updateConfig(c);e.step(10);
  c.mode='cooling';c.outdoorTemperatureC=30;c.outdoorRelativeHumidity=.5;c.rooms.forEach(r=>r.setpointC=18);e.updateConfig(c);
  const o=e.step(60);assertLedger(o);assert.equal(o.state,'running');assert.equal(o.effectiveMode,'cooling');
});

test('unmodified three-branch defaults sustain heating through a natural frost/defrost event', () => {
  const c=defaultEngineConfig(3),e=new HeatPumpEngine(p,c);let sawDefrost=false,sawReturn=false;
  for(let second=0;second<1000;second++){const o=e.step(1);assertLedger(o);if(o.state==='defrost')sawDefrost=true;if(sawDefrost&&o.state==='running'){sawReturn=true;break;}}
  assert.ok(sawDefrost&&sawReturn,'natural default trigger and successful return to heating');
});
test('cleanliness changes only air-side transfer/flow; constant fan and weather response remain physical', () => {
  const clean=defaultEngineConfig(1);clean.mode='cooling';clean.outdoorTemperatureC=32;clean.rooms[0].initialTemperatureC=27;clean.rooms[0].setpointC=24;
  const dirty=structuredClone(clean);dirty.rooms[0].cleanFraction=.1;dirty.outdoor.cleanFraction=.1;
  const a=run(clean,10).o,b=run(dirty,10).o;
  assert.ok(Math.abs(b.signedRoomHeatW)<Math.abs(a.signedRoomHeatW));assert.equal(a.electrical.indoorFansW,b.electrical.indoorFansW);assert.equal(a.electrical.outdoorFanW,b.electrical.outdoorFanW);
  assert.equal(clean.rooms[0].refrigerantConductanceWK,dirty.rooms[0].refrigerantConductanceWK);
  const hot=structuredClone(clean);hot.outdoorTemperatureC=38;const d=run(hot,10).o;assert.ok(d.cycle.highPressureBarAbs>a.cycle.highPressureBarAbs);
});
test('defrost timeout retains physical ice and closes the ledger instead of resetting it',()=>{
  const c=defaultEngineConfig(3);c.control.defrostMinHeatingSeconds=30;c.control.defrostIceThresholdKg=.005;c.control.defrostMaxSeconds=.1;
  const e=new HeatPumpEngine(p,c);let o;for(let i=0;i<100;i++){o=e.step(1);if(o.state==='fault')break;}
  assert.equal(o.state,'fault');assert.match(o.diagnostics.fault,/Defrost timeout/);assert.ok(o.outdoor.iceKg>0);assert.ok(Math.abs(o.energy.residualJ)<.01);assert.ok(Math.abs(o.energy.waterResidualKg)<1e-10);
});
test('owner-layout cooling accepts newly added warm rooms without resetting old coil/film inventories',()=>{
  const c=defaultEngineConfig(3);c.outdoorTemperatureC=7;c.outdoorRelativeHumidity=.35;c.rooms.forEach((r,i)=>{r.volumeM3=[45,75,50][i];r.envelopeWK=[60,85,70][i];});
  const e=run(c,30).e;c.outdoorTemperatureC=0;e.updateConfig(c);e.step(20);c.rooms[1].setpointC=24;c.rooms[1].envelopeWK=120;e.updateConfig(c);e.step(10);
  c.mode='cooling';c.outdoorTemperatureC=30;c.outdoorRelativeHumidity=.5;c.rooms.forEach(r=>r.setpointC=18);e.updateConfig(c);let o=e.step(60);assertLedger(o);
  const before=o,extra=defaultEngineConfig(5).rooms.slice(3);c.rooms.push(...extra.map(r=>({...r,volumeM3:40,envelopeWK:55,setpointC:18})));o=e.updateConfig(c);
  before.rooms.forEach((r,i)=>assert.equal(o.rooms[i].metalTemperatureC,r.metalTemperatureC));assert.equal(o.outdoor.filmMassKg,before.outdoor.filmMassKg);
  o=e.step(10);assertLedger(o);assert.equal(o.rooms.length,5);assert.equal(o.state,'running');assert.ok(o.cycle.branchOutlets.some(s=>s.temperatureC!==o.cycle.suction.temperatureC));
});
test('owner-layout natural frost reverses with hot stored indoor metal and conserves melt energy',()=>{
  const c=defaultEngineConfig(3);c.rooms.forEach((r,i)=>{r.volumeM3=[45,75,50][i];r.envelopeWK=[60,85,70][i];r.setpointC=23;});
  const e=new HeatPumpEngine(p,c);let defrost=false,returned=false;
  for(let second=0;second<700;second++){const o=e.step(1);assertLedger(o);if(o.state==='defrost')defrost=true;if(defrost&&o.state==='running'){returned=true;break;}}
  assert.ok(defrost&&returned);
});

test('unavailable property backend returns a conserved fault snapshot without throwing again',()=>{
  const moduleStub={PropsSI:(...args)=>p.prop(args[0],args[1],args[2],args[3],args[4]),HAPropsSI:(...args)=>p.humid(args[0],args[1],args[2],args[3],args[4],args[6])};
  const service=new Properties(moduleStub),engine=new HeatPumpEngine(service,defaultEngineConfig(1));
  const before=engine.snapshot();moduleStub.HAPropsSI=()=>{throw new Error('backend unavailable');};
  const fault=engine.step(1);assert.equal(fault.state,'fault');assert.equal(fault.simulatedSeconds,before.simulatedSeconds);assert.equal(fault.cycle,null);assert.equal(fault.heatingCOP,null);assert.equal(fault.rooms[0].airOutletC,null);assert.equal(fault.outdoor.filmMassKg,before.outdoor.filmMassKg);assert.equal(fault.energy.residualJ,before.energy.residualJ);
});

test('all Off aborts defrost/reversal without erasing storage; passive time and reenable remain conservative',()=>{
  const c=defaultEngineConfig(3);c.outdoorTemperatureC=-3;c.outdoorRelativeHumidity=.99;
  c.control.defrostIceThresholdKg=1e-6;c.control.defrostMinHeatingSeconds=0;c.control.reversalSeconds=.5;c.control.minOffSeconds=.75;
  const e=new HeatPumpEngine(p,c);let o;
  for(let i=0;i<16;i++){o=e.step(.25);assertLedger(o);if(o.state==='defrost')break;}
  assert.equal(o.state,'defrost');assert.ok(o.outdoor.iceKg>0);assert.ok(o.cycle);
  const offAt=before=>{
    c.rooms.forEach(r=>r.enabled=false);const stopped=e.updateConfig(c);
    assertLedger(stopped);assert.equal(stopped.state,'idle');assert.equal(stopped.simulatedSeconds,before.simulatedSeconds);assert.equal(stopped.cycle,null);assert.equal(stopped.outdoor.filmMassKg,before.outdoor.filmMassKg);assert.equal(stopped.outdoor.filmEnthalpyJ,before.outdoor.filmEnthalpyJ);
    stopped.rooms.forEach((r,i)=>{assert.equal(r.metalTemperatureC,before.rooms[i].metalTemperatureC);assert.ok(Math.abs(r.temperatureC-before.rooms[i].temperatureC)<1e-8);assert.equal(r.active,false);assert.equal(r.airOutletC,null);assert.equal(r.massFlowKgs,0);});
    const passive=e.step(.5);assertLedger(passive);assert.equal(passive.state,'idle');assert.equal(passive.simulatedSeconds,before.simulatedSeconds+.5);assert.equal(passive.electrical.compressorW,0);assert.equal(passive.outdoor.fanPowerW,0);assert.ok(passive.rooms.every(r=>r.fanPowerW===0&&r.airOutletC===null));assert.notEqual(passive.rooms[0].temperatureC,stopped.rooms[0].temperatureC);
    return passive;
  };
  offAt(o);c.rooms[0].enabled=true;e.updateConfig(c);o=e.step(.25);assertLedger(o);assert.equal(o.state,'idle');assert.equal(o.cycle,null);
  o=e.step(.25);assertLedger(o);assert.equal(o.state,'reversing');
  offAt(o);c.rooms[0].enabled=true;e.updateConfig(c);o=e.step(1);assertLedger(o);assert.equal(o.state,'defrost');assert.ok(o.cycle);assert.ok(o.cycle.branchMassFlowsKgs[0]>0);assert.ok(o.cycle.branchMassFlowsKgs.slice(1).every(m=>m===0));
  c.rooms.forEach(r=>r.enabled=false);o=e.updateConfig(c);assertLedger(o);assert.equal(o.state,'idle');assert.equal(o.cycle,null);
});

test('Off of the last active room enters idle and respects minimum-off before another room demands',()=>{
  const c=defaultEngineConfig(3);c.control.minOffSeconds=.75;c.rooms.slice(1).forEach(r=>r.setpointC=18);
  const e=new HeatPumpEngine(p,c);let o=e.step(.25);assertLedger(o);assert.equal(o.state,'running');assert.ok(o.cycle);assert.deepEqual(o.rooms.map(r=>r.active),[true,false,false]);
  const before=o;c.rooms[0].enabled=false;o=e.updateConfig(c);assertLedger(o);assert.equal(o.simulatedSeconds,before.simulatedSeconds);assert.equal(o.outdoor.filmEnthalpyJ,before.outdoor.filmEnthalpyJ);
  o=e.step(.25);assertLedger(o);assert.equal(o.state,'idle');assert.equal(o.cycle,null);assert.ok(o.rooms.every(r=>r.massFlowKgs===0&&r.fanPowerW===0&&r.airOutletC===null));
  c.rooms[1].setpointC=23;e.updateConfig(c);o=e.step(.25);assertLedger(o);assert.equal(o.state,'idle');assert.equal(o.cycle,null);
  o=e.step(.25);assertLedger(o);assert.equal(o.state,'idle');assert.equal(o.cycle,null);
  o=e.step(.25);assertLedger(o);assert.equal(o.state,'running');assert.ok(o.cycle);assert.deepEqual(o.rooms.map(r=>r.active),[false,true,false]);
});
