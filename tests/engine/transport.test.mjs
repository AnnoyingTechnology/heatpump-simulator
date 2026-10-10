import test from 'node:test';import assert from 'node:assert/strict';
import Module from './backend.mjs';import {Properties,defaultEngineConfig} from './build/index.js';import {transportPipe} from './build/transport.js';
const p=new Properties(await Module());
test('distributed pipe forward/inverse closes gravity and heat for liquid, vapor and two-phase states',()=>{
  const config=defaultEngineConfig(1),pipe=config.rooms[0].pipe;pipe.lengthM=15;
  const pressure=p.pressureAtSaturationC(15),sat=p.saturation(pressure);
  const enthalpies=[p.pt(pressure,12).hJkg,p.pt(pressure,25).hJkg,.5*(sat.liquidH+sat.vaporH)];
  for(const h of enthalpies)for(const rise of[-3,0,3]){
    const out=transportPipe(p,pressure,h,.003,pipe,.00792,20,rise);
    const inverse=transportPipe(p,out.pPa,out.hJkg,.003,pipe,.00792,20,rise,true);
    assert.ok(Math.abs(inverse.pPa-pressure)<.01);assert.ok(Math.abs(inverse.hJkg-h)<.001);
    assert.ok(Math.abs(out.heatToOutdoorW+.003*(out.hJkg-h)+.003*9.80665*rise)<1e-9);
  }
});
test('diameter changes Darcy friction and unsupported velocity cannot produce fake pipe states',()=>{
  const pipe=defaultEngineConfig(1).rooms[0].pipe;pipe.lengthM=10;const pressure=p.pressureAtSaturationC(15),h=p.pt(pressure,25).hJkg;
  const a=transportPipe(p,pressure,h,.003,pipe,.0111,20,0),b=transportPipe(p,pressure,h,.003,pipe,.00792,20,0);assert.ok(b.frictionPa>a.frictionPa);
  assert.throws(()=>transportPipe(p,pressure,h,.05,pipe,.002,20,0),/kinetic|Mach|pressure|critical/);
});
