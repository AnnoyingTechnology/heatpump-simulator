import test from 'node:test';
import assert from 'node:assert/strict';
import factory from './backend.mjs';
import { Properties } from './build/properties.js';
import { HeatPumpEngine } from './build/engine.js';
import { configured } from './charge-fixture.mjs';

test('coupled refrigerant, metal, rooms and outdoor film conserve energy through charge-aware cold start',async()=>{
  const p=new Properties(await factory()),e=new HeatPumpEngine(p,configured());
  const before=e.snapshot();assert.ok(before.inventory);assert.equal(before.inventory.cells.length,9);
  for(let i=0;i<8;i++){
    const o=e.step(.25);assert.notEqual(o.state,'fault',o.diagnostics.fault);
    assert.ok(Math.abs(o.energy.residualJ)<.005,`system energy residual ${o.energy.residualJ}`);
    assert.ok(Math.abs(o.inventory.energyResidualJ)<.005);assert.ok(Math.abs(o.inventory.massResidualKg)<1e-8);
    assert.ok(Math.abs(o.energy.waterResidualKg)<1e-9);
  }
  assert.equal(e.snapshot().simulatedSeconds,2);p.dispose();
});
test('All Off leak remains physical, accounts full escaping enthalpy and never restarts the room state',async()=>{
  const p=new Properties(await factory()),c=configured();c.rooms[0].enabled=false;
  c.inventory.leak.rateKgs=1e-5;const e=new HeatPumpEngine(p,c);
  for(let i=0;i<8;i++){
    const o=e.step(.25);assert.notEqual(o.state,'fault',o.diagnostics.fault);assert.equal(o.cycle,null);
    assert.equal(o.electrical.compressorW,0);assert.equal(o.rooms[0].airOutletC,null);
    assert.ok(Math.abs(o.energy.residualJ)<.005);assert.ok(Math.abs(o.inventory.massResidualKg)<1e-8);
  }
  const previous=e.snapshot();assert.ok(Math.abs(previous.inventory.leakedMassKg-2e-5)<1e-12);
  c.inventory.leak.rateKgs=2e-5;e.updateConfig(c);
  assert.equal(e.snapshot().simulatedSeconds,previous.simulatedSeconds);
  assert.equal(e.snapshot().inventory.massKg,previous.inventory.massKg);
  assert.throws(()=>e.updateConfig({...c,inventory:{...c.inventory,initialMassKg:.8}}),/Restart/);
  p.dispose();
});
test('rejected coupled candidate rolls back refrigerant, thermal stores, timers and ledgers',async()=>{
  const p=new Properties(await factory()),c=configured();c.rooms[0].envelopeWK=1e12;
  const e=new HeatPumpEngine(p,c),initial=e.snapshot(),o=e.step(.25);
  assert.equal(o.state,'fault');assert.ok(o.diagnostics.fault);assert.equal(o.simulatedSeconds,0);
  assert.deepEqual(o.inventory.cells,initial.inventory.cells);assert.equal(o.inventory.leakedMassKg,0);
  assert.equal(o.outdoor.filmMassKg,0);assert.equal(o.rooms[0].temperatureC,initial.rooms[0].temperatureC);
  assert.equal(o.energy.electricityJ,0);assert.equal(o.energy.boundaryEnergyJ,0);assert.equal(o.energy.residualJ,0);
  p.dispose();
});
