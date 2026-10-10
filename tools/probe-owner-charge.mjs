import { writeFile } from 'node:fs/promises';
import factory from '../public/vendor/coolprop/coolprop.js';
import { Properties } from '../tests/engine/build/properties.js';
import { HeatPumpEngine } from '../tests/engine/build/engine.js';
import { configured } from '../tests/engine/charge-fixture.mjs';
import { defaultRoomConfig } from '../tests/engine/build/defaults.js';
const p=new Properties(await factory()),c=configured();
c.rooms=Array.from({length:3},(_,i)=>defaultRoomConfig(i));c.inventory.initialMassKg=1.8;c.inventory.initialFluidTemperatureC=7;
c.inventory.geometry.rooms=c.rooms.map((r,i)=>({...c.inventory.geometry.rooms[0],id:r.id,lineLengthM:[14,6.5,7.5][i]}));
const e=new HeatPumpEngine(p,c),start=performance.now();
for(let i=0;i<240;i++){
 const o=e.step(.25);
 await writeFile('research/charge-owner-debug-snapshot.json',JSON.stringify({checkedAt:new Date().toISOString(),config:c,output:o,fluid:e.refrigerant.snapshot()},null,2)+'\n');
 if(i%20===19||o.state==='fault')console.log(JSON.stringify({t:o.simulatedSeconds,state:o.state,fault:o.diagnostics.fault,
 compW:o.electrical.compressorW,roomW:o.signedRoomHeatW,metal:o.rooms.map(r=>r.metalTemperatureC),out:o.outdoor.metalTemperatureC,
 pressure:o.cycle&&[o.cycle.lowPressureBarAbs,o.cycle.highPressureBarAbs],mass:o.inventory.massKg,balance:o.energy.residualJ,
 diagnostics:o.diagnostics.warnings.slice(-3),wallSeconds:(performance.now()-start)/1000}));
 if(o.state==='fault')break;
}
p.dispose();
