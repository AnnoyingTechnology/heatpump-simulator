import test from 'node:test';
import assert from 'node:assert/strict';
import {driveStep,driveRatioThresholds,newDriveState,DEFAULT_INVERTER_SLEW} from './build/drive.js';
const input={demandRps:75,minimumRps:18,maximumRps:75,maximumRatio:8,maximumDischargeC:145,
  minimumOffSeconds:30,pressureRatio:3,predictedDischargeC:80,pickupAvailable:true};
test('startup bounds demand, preserves actuator state across branch demand changes, and waits after Off',()=>{
  let state=newDriveState();
  for(let i=0;i<40;i++){state=driveStep(state,.25,input);assert.equal(state.speedRps,18);}
  const previous=state;state=driveStep(state,.25,{...input,demandRps:40});
  assert.ok(state.speedRps>18&&state.speedRps-previous.speedRps<=.5*.25);
  assert.ok(state.startupSeconds>previous.startupSeconds);
  state=driveStep(state,.25,{...input,demandRps:0});assert.equal(state.speedRps,0);
  for(let i=0;i<119;i++){state=driveStep(state,.25,input);assert.equal(state.speedRps,0);}
  state=driveStep(state,.25,input);assert.equal(state.speedRps,18);
});
test('safety overrides minimum speed, pickup arming and startup hold until pressure and dwell recover',()=>{
  let state=driveStep(newDriveState(),.25,input);
  state=driveStep(state,.25,{...input,pressureRatio:7.1,pickupAvailable:false});
  assert.equal(state.speedRps,0);assert.equal(state.protection,'pressure ratio');
  for(let i=0;i<119;i++){state=driveStep(state,.25,{...input,pressureRatio:5});assert.equal(state.speedRps,0);}
  state=driveStep(state,.25,{...input,pressureRatio:5});assert.equal(state.protection,null);assert.equal(state.speedRps,18);
  state=driveStep(state,.25,{...input,predictedDischargeC:140});assert.equal(state.speedRps,0);assert.equal(state.protection,'discharge temperature');
});
test('ratio thresholds stay strictly ordered for all supported positive lifts',()=>{
  for(const hard of [1.01,1.25,2,8,20]) {
    const t=driveRatioThresholds(hard);
    assert.ok(1<t.recovery&&t.recovery<t.soft&&t.soft<t.stop&&t.stop<hard);
  }
});
test('temperature protection cannot recover from an unavailable discharge prediction',()=>{
  let state={...newDriveState(),protection:'discharge temperature',offSeconds:60};
  state=driveStep(state,.25,{...input,predictedDischargeC:null,pickupAvailable:false});
  assert.equal(state.protection,'discharge temperature');assert.equal(state.speedRps,0);
  state=driveStep(state,.25,{...input,predictedDischargeC:100});
  assert.equal(state.protection,null);assert.equal(state.speedRps,18);
});
test('Reference inverter starts at its admitted minimum and immediately follows bounded up/down slew',()=>{
  const request={...input,minimumRps:8,demandRps:20,inverterSlew:DEFAULT_INVERTER_SLEW};
  let state=driveStep(newDriveState(),.25,request);assert.equal(state.speedRps,8);
  const start=state;
  state=driveStep(state,.25,request);assert.equal(state.speedRps,8.5,'no legacy ten-second plateau');
  state=driveStep(state,.25,{...request,demandRps:8});assert.equal(state.speedRps,8,'downward target cannot undershoot the minimum');
  for(const dt of [.25,.1,.025]){
    let refined={...start};
    for(let i=0;i<Math.round(3/dt);i++)refined=driveStep(refined,dt,request);
    assert.ok(Math.abs(refined.speedRps-14)<1e-10,'accepted speed follows the same three-second ramp');
  }
  state={...state,speedRps:40};
  state=driveStep(state,.25,{...request,demandRps:8});assert.equal(state.speedRps,39);
  const stopped=driveStep(state,.25,{...request,demandRps:0});assert.equal(stopped.speedRps,0,'explicit Off overrides slew');
  const hot=driveStep(state,.25,{...request,predictedDischargeC:140});assert.equal(hot.speedRps,0);assert.equal(hot.protection,'discharge temperature');
  const derated=driveStep(state,.25,{...request,predictedDischargeC:130});
  assert.ok(derated.speedRps<39,'envelope derating overrides ordinary downward slew');
  assert.ok(derated.speedRps>=request.minimumRps);
});

test('inventory startup ramps real displacement from rest consistently with timestep and retains restart guards',()=>{
 const request={...input,demandRps:18,inverterSlew:DEFAULT_INVERTER_SLEW,startupFromRest:true};
 for(const dt of [.25,.1,.025]){
  let state=newDriveState();
  for(let i=0;i<Math.round(10/dt);i++){
   const previous=state.speedRps;state=driveStep(state,dt,request);
   assert.ok(state.speedRps-previous<=2*dt+1e-10);
   assert.ok(Math.abs(state.speedRps-Math.min(18,(i+1)*dt*2))<1e-9);
  }
  assert.equal(state.speedRps,18);
 }
 let state=driveStep(newDriveState(),.25,request);assert.equal(state.speedRps,.5);
 state=driveStep(state,.25,{...request,demandRps:0});assert.equal(state.speedRps,0);
 for(let i=0;i<119;i++){state=driveStep(state,.25,request);assert.equal(state.speedRps,0)}
 state=driveStep(state,.25,request);assert.equal(state.speedRps,.5);
 assert.equal(driveStep(state,.25,{...request,pickupAvailable:false}).speedRps,0);
 assert.equal(driveStep(state,.25,{...request,predictedDischargeC:140}).speedRps,0);
});
