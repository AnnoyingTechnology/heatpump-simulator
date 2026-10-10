/** Generic inverter supervisor. These thresholds/timings are scenario
 * assumptions, not a Daikin map; thermodynamic hard limits remain in the core. */
export interface DriveState {
  speedRps: number; startupSeconds: number; offSeconds: number;
  protection: 'pressure ratio' | 'discharge temperature' | null;
}
export interface DriveInput {
  demandRps: number; minimumRps: number; maximumRps: number;
  maximumRatio: number; maximumDischargeC: number; minimumOffSeconds: number;
  pressureRatio: number; predictedDischargeC: number | null; pickupAvailable: boolean;
}
export const newDriveState = (): DriveState => ({speedRps:0,startupSeconds:0,offSeconds:Infinity,protection:null});
export function driveRatioThresholds(hard: number) {
  const lift=hard-1;
  return {recovery:1+lift*4.5/7,soft:1+lift*5/7,stop:1+lift*6.2/7};
}
export function driveStep(previous: DriveState, dt: number, input: DriveInput): DriveState {
  const next={...previous};
  const thresholds=driveRatioThresholds(input.maximumRatio);
  const hot=input.predictedDischargeC!==null&&input.predictedDischargeC>=input.maximumDischargeC-10;
  const high=input.pressureRatio>=thresholds.stop;
  if(input.demandRps>0&&(hot||high)) {
    if(!next.protection)next.offSeconds=0;
    next.protection=hot?'discharge temperature':'pressure ratio';
  }
  if(next.protection) {
    const temperatureRecovered=input.predictedDischargeC===null?next.protection!=='discharge temperature':
      input.predictedDischargeC<=input.maximumDischargeC-40;
    const recovered=input.pressureRatio<=thresholds.recovery&&temperatureRecovered;
    if(!recovered||next.offSeconds<input.minimumOffSeconds) {
      next.speedRps=0;next.startupSeconds=0;next.offSeconds+=dt;return next;
    }
    next.protection=null;
  }
  if(input.demandRps<=0) {
    next.speedRps=0;next.startupSeconds=0;next.offSeconds+=dt;return next;
  }
  const ratioMargin=(thresholds.stop-input.pressureRatio)/(thresholds.stop-thresholds.soft);
  const temperatureMargin=input.predictedDischargeC===null?1:
    (input.maximumDischargeC-10-input.predictedDischargeC)/20;
  const limit=input.maximumRps*Math.max(0,Math.min(1,ratioMargin,temperatureMargin));
  if(limit<input.minimumRps) {
    next.speedRps=0;next.startupSeconds=0;next.offSeconds=previous.offSeconds+dt;
    next.protection=ratioMargin<temperatureMargin?'pressure ratio':'discharge temperature';return next;
  }
  if(next.speedRps===0&&next.offSeconds<input.minimumOffSeconds) {
    next.startupSeconds=0;next.offSeconds+=dt;return next;
  }
  // Wait for an observed exposed pickup before making a fresh discharge
  // prediction and starting. Passive circulation remains in the charge core.
  if(!input.pickupAvailable) {
    next.speedRps=0;next.startupSeconds=0;next.offSeconds+=dt;return next;
  }
  const target=Math.min(input.demandRps,limit);
  if(next.speedRps===0)next.speedRps=input.minimumRps;
  else if(next.startupSeconds>=10)next.speedRps+=Math.max(-dt,Math.min(.5*dt,target-next.speedRps));
  // An envelope limit takes precedence over the ordinary actuator slew/hold.
  next.speedRps=Math.max(0,Math.min(next.speedRps,limit));
  next.startupSeconds+=dt;next.offSeconds=0;return next;
}
