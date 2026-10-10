import test from 'node:test';
import assert from 'node:assert/strict';
import factory from './backend.mjs';
import { Properties } from './build/properties.js';
import { HeatPumpEngine } from './build/engine.js';
import { configured } from './charge-fixture.mjs';

function checkBalances(output) {
  assert.notEqual(output.state,'fault',output.diagnostics.fault);
  assert.ok(Math.abs(output.inventory.massResidualKg)<1e-7);
  assert.ok(Math.abs(output.inventory.energyResidualJ)<.01);
  assert.ok(Math.abs(output.energy.residualJ)<.01);
  assert.ok(Math.abs(output.energy.waterResidualKg)<1e-9);
}

test('initial charge changes real refrigerant states with identical geometry and operating controls',async()=>{
  const module=await factory(),results=[];
  for(const mass of [.4,.6,.8]) {
    const properties=new Properties(module),config=configured();
    config.inventory.initialMassKg=mass;
    const engine=new HeatPumpEngine(properties,config);
    assert.ok(Math.abs(engine.snapshot().inventory.massKg-mass)<1e-10);
    for(let i=0;i<16;i++)checkBalances(engine.step(.25));
    const output=engine.snapshot();
    assert.ok(Math.abs(output.inventory.massKg-mass)<1e-7);
    results.push(output.inventory.cells.map(cell=>({id:cell.id,p:cell.state.pPa,h:cell.state.hJkg,m:cell.massKg})));
    properties.dispose();
  }
  assert.deepEqual(results[0].map(cell=>cell.id),results[1].map(cell=>cell.id));
  assert.ok(results[0].some((cell,i)=>Math.abs(cell.p-results[2][i].p)>100));
  assert.ok(results[0].some((cell,i)=>Math.abs(cell.h-results[2][i].h)>100));
  // This proves dynamic inventory sensitivity, not an OEM steady-state capacity curve.
});

test('a running local leak removes mass continuously and exports the actual port enthalpy',async()=>{
  const properties=new Properties(await factory()),config=configured();
  const engine=new HeatPumpEngine(properties,config);
  for(let i=0;i<8;i++)checkBalances(engine.step(.25));
  const before=engine.snapshot();
  config.inventory.leak.rateKgs=1e-5;
  engine.updateConfig(config);
  assert.deepEqual(engine.snapshot().inventory.cells,before.inventory.cells);
  assert.equal(engine.snapshot().simulatedSeconds,before.simulatedSeconds);
  let previous=before;
  for(let i=0;i<8;i++) {
    const output=engine.step(.25);checkBalances(output);
    assert.ok(output.inventory.massKg<previous.inventory.massKg);
    assert.ok(Math.abs(output.inventory.leakedMassKg-previous.inventory.leakedMassKg-2.5e-6)<1e-12);
    const enthalpy=(output.inventory.leakedEnthalpyJ-previous.inventory.leakedEnthalpyJ)/2.5e-6;
    assert.ok(Number.isFinite(enthalpy)&&enthalpy>0);
    previous=output;
  }
  assert.ok(Math.abs(previous.inventory.massKg-before.inventory.massKg+2e-5)<1e-7);
  config.inventory.leak.rateKgs=0;engine.updateConfig(config);
  const stopped=engine.step(.25);checkBalances(stopped);
  assert.equal(stopped.inventory.leakedMassKg,previous.inventory.leakedMassKg);
  properties.dispose();
});

test('an initially submerged vapour pickup preserves inventory and reports protection with zero compressor work',async()=>{
  const module=await factory(),properties=new Properties(module),config=configured();
  config.outdoorTemperatureC=20;
  const geometry=config.inventory.geometry;
  const volume=geometry.outdoorCoilVolumeM3+geometry.accumulatorVolumeM3+
    geometry.rooms.reduce((sum,room)=>sum+room.coilVolumeM3+Math.PI*room.lineLengthM*(room.gasInsideDiameterM**2+room.smallInsideDiameterM**2)/4,0);
  const liquidDensity=module.PropsSI('D','T',293.15,'Q',0,'R32');
  const vaporDensity=module.PropsSI('D','T',293.15,'Q',1,'R32');
  config.inventory.initialMassKg=volume*(.99*liquidDensity+.01*vaporDensity);
  const engine=new HeatPumpEngine(properties,config),initial=engine.snapshot();
  assert.equal(initial.inventory.compressorAdmitted,false);
  const output=engine.step(.25);checkBalances(output);
  assert.ok(output.diagnostics.demandSpeedRps>0);
  assert.equal(output.diagnostics.speedRps,0);
  assert.equal(output.inventory.compressorAdmitted,false);
  assert.equal(output.inventory.compressorMassFlowKgs,0);
  assert.equal(output.electrical.compressorW,0);
  assert.equal(output.heatingCOP,null);
  assert.ok(Math.abs(output.inventory.massKg-initial.inventory.massKg)<1e-7);
  assert.equal(output.simulatedSeconds,.25);
  properties.dispose();
});
