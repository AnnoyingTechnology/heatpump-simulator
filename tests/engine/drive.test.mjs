import test from 'node:test';
import assert from 'node:assert/strict';
import {driveStep,driveRatioThresholds,newDriveState} from './build/drive.js';
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
