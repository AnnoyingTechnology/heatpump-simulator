import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import factory from '../public/vendor/coolprop/coolprop.js';
import {Properties} from '../tests/engine/build/properties.js';
import {HeatPumpEngine} from '../tests/engine/build/engine.js';
import {configured} from '../tests/engine/charge-fixture.mjs';

// Generic finite-storage cooling fixture, with unchanged safety limits and
// no OEM performance claim. Record faults as results rather than hiding them.
const sourceFingerprint=Object.fromEntries(await Promise.all(['charge','engine','properties','drive'].map(async name=>[
  name,createHash('sha256').update(await readFile(new URL(`../tests/engine/build/${name}.js`,import.meta.url))).digest('hex'),
])));
const properties=new Properties(await factory()),config=configured();
config.mode='cooling';config.outdoorTemperatureC=32;config.outdoorRelativeHumidity=.35;
config.rooms[0].initialTemperatureC=30;config.rooms[0].setpointC=24;
config.inventory.initialFluidTemperatureC=32;
const engine=new HeatPumpEngine(properties,config),samples=[],started=performance.now();
const seconds=Number(process.env.CHARGE_COOLING_SECONDS??60);
assert.ok(Number.isFinite(seconds)&&seconds>0);
let maxMassResidualKg=0,maxFluidEnergyResidualJ=0,maxSystemEnergyResidualJ=0,maxWaterResidualKg=0;
let sawUsefulCooling=false,sawCompression=false,output=engine.snapshot();
try {
  while(output.simulatedSeconds<seconds&&output.state!=='fault') {
    output=engine.step(Math.min(.25,seconds-output.simulatedSeconds));
    maxMassResidualKg=Math.max(maxMassResidualKg,Math.abs(output.inventory.massResidualKg));
    maxFluidEnergyResidualJ=Math.max(maxFluidEnergyResidualJ,Math.abs(output.inventory.energyResidualJ));
    maxSystemEnergyResidualJ=Math.max(maxSystemEnergyResidualJ,Math.abs(output.energy.residualJ));
    maxWaterResidualKg=Math.max(maxWaterResidualKg,Math.abs(output.energy.waterResidualKg));
    sawCompression ||= output.electrical.compressorW>0;
    sawUsefulCooling ||= output.signedRoomHeatW<0;
    if(output.simulatedSeconds%5===0||output.state==='fault') {
      const sample={timeSeconds:output.simulatedSeconds,state:output.state,fault:output.diagnostics.fault,
        compressorAdmitted:output.inventory.compressorAdmitted,compressorW:output.electrical.compressorW,
        signedRoomHeatW:output.signedRoomHeatW,roomC:output.rooms[0].temperatureC,
        indoorMetalC:output.rooms[0].metalTemperatureC,outdoorMetalC:output.outdoor.metalTemperatureC,
        wallSeconds:(performance.now()-started)/1000};
      samples.push(sample);console.log(JSON.stringify(sample));
    }
  }
  const result={checkedAt:new Date().toISOString(),sourceFingerprint,requestedSeconds:seconds,config,
    completed:output.simulatedSeconds===seconds&&output.state!=='fault',sawCompression,sawUsefulCooling,
    maxMassResidualKg,maxFluidEnergyResidualJ,maxSystemEnergyResidualJ,maxWaterResidualKg,
    samples,final:output,wallSeconds:(performance.now()-started)/1000};
  await writeFile('research/charge-cooling-results.json',JSON.stringify(result,null,2)+'\n');
  assert.ok(result.completed,output.diagnostics.fault??'Incomplete cooling run');
  assert.ok(sawCompression&&sawUsefulCooling);
  assert.ok(maxMassResidualKg<1e-7&&maxFluidEnergyResidualJ<.01&&maxSystemEnergyResidualJ<.01&&maxWaterResidualKg<1e-9);
} finally {properties.dispose();}
