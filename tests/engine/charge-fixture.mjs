import { defaultEngineConfig } from './build/defaults.js';
export function configured(){
  const c=defaultEngineConfig(1);c.outdoorTemperatureC=7;c.outdoorRelativeHumidity=.35;
  c.inventory={initialMassKg:.6,initialFluidTemperatureC:20,leak:{physicalCellId:'room-1:gas',rateKgs:0},geometry:{
    rooms:[{id:'room-1',coilVolumeM3:Math.PI*.006**2*10/4,refrigerantConductanceWK:350,
      lineLengthM:7.5,gasInsideDiameterM:.00792,smallInsideDiameterM:.00475,maximumValveAreaM2:5e-7}],
    outdoorCoilVolumeM3:Math.PI*.006**2*40/4,outdoorConductanceWK:1000,accumulatorVolumeM3:.0006,
    accumulatorInletAreaM2:1e-4,displacementM3rev:22e-6,volumetricEfficiency:.8,isentropicEfficiency:.7,
    dischargeCoefficient:.65,superheatTargetK:3,maximumDischargeC:145,maximumPressureRatio:8}};
  return c;
}
