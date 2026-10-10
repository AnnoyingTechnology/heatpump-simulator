import factory from '../public/vendor/coolprop/coolprop.js';
import { Properties } from '../tests/engine/build/properties.js';
import { HeatPumpEngine } from '../tests/engine/build/engine.js';
import { configured } from '../tests/engine/charge-fixture.mjs';
const p=new Properties(await factory());
const config=configured();config.rooms[0].setpointC=24;
for (const mass of [.4,.6,.9]) {
  config.inventory.initialMassKg=mass;const e=new HeatPumpEngine(p,config),start=performance.now();
  for(let i=0;i<120;i++){
    const o=e.step(.25);
    if(i%20===19||o.state==='fault') console.log(JSON.stringify({mass,t:o.simulatedSeconds,state:o.state,fault:o.diagnostics.fault,
      compW:o.electrical.compressorW,roomW:o.signedRoomHeatW,metal:o.rooms[0].metalTemperatureC,out:o.outdoor.metalTemperatureC,
      pressure:o.cycle&&[o.cycle.lowPressureBarAbs,o.cycle.highPressureBarAbs],balance:o.energy.residualJ,charge:o.inventory.massKg,
      diagnostics:o.diagnostics.warnings.slice(-3),wallSeconds:(performance.now()-start)/1000}));
    if(o.state==='fault')break;
  }
}
p.dispose();
