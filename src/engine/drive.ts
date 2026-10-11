/** Generic inverter supervisor. These thresholds/timings are scenario
 * assumptions, not a Daikin map; thermodynamic hard limits remain in the core. */
export interface DriveState {
  antifreezeHold?: boolean; dischargeHold?:boolean; pressureHold?:boolean; condensingHold?:boolean; thermalBoundaryHold?:boolean;
  speedRps: number; startupSeconds: number; offSeconds: number;
  protection: 'pressure ratio' | 'discharge temperature' | 'indoor antifreeze' | 'condensing temperature' | 'thermal boundary' | null;
}
export interface DriveInput {
  demandRps: number; minimumRps: number; maximumRps: number;
  /** Ordinary Reference inverter policy. Omitted preserves inventory/fixed/defrost startup. */
  inverterSlew?: { upRpsPerSecond: number; downRpsPerSecond: number };
  /** Inventory displacement can be solved below the continuous-operation minimum
   * during startup. Reference quasi-steady cycles must first admit that domain. */
  startupFromRest?: boolean;
  maximumRatio: number; maximumDischargeC: number; minimumOffSeconds: number;
  thermalBoundaryAvailable?:boolean; pressureRatioAvailable?:boolean; dischargeEnvelopeExceeded?:boolean; coolingMode?:boolean; coolingCoilC?: number; predictedCondensingC?:number|null; maximumCondensingC?:number; pressureRatio: number; predictedDischargeC: number | null; pickupAvailable: boolean;
}
export const DEFAULT_INVERTER_SLEW = { upRpsPerSecond: 2, downRpsPerSecond: 4 } as const;
export const newDriveState = (): DriveState => ({speedRps:0,startupSeconds:0,offSeconds:Infinity,protection:null});
export function driveRatioThresholds(hard: number) {
  const lift=hard-1;
  return {recovery:1+lift*4.5/7,soft:1+lift*5/7,stop:1+lift*6.2/7};
}
export function driveStep(previous: DriveState, dt: number, input: DriveInput): DriveState {
  const next={...previous};
  const thresholds=driveRatioThresholds(input.maximumRatio);
  const hot=!!input.dischargeEnvelopeExceeded||(input.predictedDischargeC!==null&&input.predictedDischargeC>=input.maximumDischargeC-10);
  const high=input.pressureRatio>=thresholds.stop;
  const cold=input.coolingCoilC!==undefined&&input.coolingCoilC<=2;
  const condensingStop=(input.maximumCondensingC??65)-2;
  const condensingSoft=condensingStop-3,condensingRecovery=condensingSoft-1;
  const condenserHot=input.predictedCondensingC!==undefined&&input.predictedCondensingC!==null&&input.predictedCondensingC>=condensingStop;
  // Preserve every release requirement; the display cause is not the latch.
  if(previous.protection==='discharge temperature')next.dischargeHold=true;
  if(previous.protection==='pressure ratio')next.pressureHold=true;
  if(previous.protection==='condensing temperature')next.condensingHold=true;
  if(previous.protection==='indoor antifreeze')next.antifreezeHold=true;
  if(previous.protection==='thermal boundary')next.thermalBoundaryHold=true;
  if(input.demandRps>0){
    if(hot)next.dischargeHold=true;if(high)next.pressureHold=true;
    if(cold)next.antifreezeHold=true;if(condenserHot)next.condensingHold=true;
    if(input.thermalBoundaryAvailable===false)next.thermalBoundaryHold=true;
  }
  if(next.dischargeHold&&input.predictedDischargeC!==null&&input.predictedDischargeC<=input.maximumDischargeC-40)next.dischargeHold=false;
  if(next.pressureHold&&input.pressureRatioAvailable!==false&&input.pressureRatio<=thresholds.recovery)next.pressureHold=false;
  if(next.condensingHold&&input.predictedCondensingC!==undefined&&input.predictedCondensingC!==null&&input.predictedCondensingC<=condensingRecovery)next.condensingHold=false;
  if(next.antifreezeHold&&(input.coolingMode===false||(input.coolingCoilC!==undefined&&input.coolingCoilC>=5)))next.antifreezeHold=false;
  if(next.thermalBoundaryHold&&input.thermalBoundaryAvailable===true)next.thermalBoundaryHold=false;
  const cause=next.dischargeHold?'discharge temperature':next.pressureHold?'pressure ratio':next.condensingHold?'condensing temperature':next.thermalBoundaryHold?'thermal boundary':next.antifreezeHold?'indoor antifreeze':null;
  if(cause){
    if(!previous.protection)next.offSeconds=0;
    next.protection=cause;next.speedRps=0;next.startupSeconds=0;next.offSeconds+=dt;return next;
  }
  if(previous.protection&&next.offSeconds<input.minimumOffSeconds){next.speedRps=0;next.startupSeconds=0;next.offSeconds+=dt;return next;}
  next.protection=null;
  if(input.demandRps<=0) {
    next.speedRps=0;next.startupSeconds=0;next.offSeconds+=dt;return next;
  }
  const ratioMargin=(thresholds.stop-input.pressureRatio)/(thresholds.stop-thresholds.soft);
  const temperatureMargin=input.predictedDischargeC===null?1:
    (input.maximumDischargeC-10-input.predictedDischargeC)/20;
  const condensingMargin=input.predictedCondensingC===undefined||input.predictedCondensingC===null?1:(condensingStop-input.predictedCondensingC)/(condensingStop-condensingSoft);
  const limit=input.maximumRps*Math.max(0,Math.min(1,ratioMargin,temperatureMargin,condensingMargin));
  if(limit<input.minimumRps) {
    next.speedRps=0;next.startupSeconds=0;next.offSeconds=previous.offSeconds+dt;
    next.protection=condensingMargin<Math.min(ratioMargin,temperatureMargin)?'condensing temperature':ratioMargin<temperatureMargin?'pressure ratio':'discharge temperature';return next;
  }
  if(next.speedRps===0&&next.offSeconds<input.minimumOffSeconds) {
    next.startupSeconds=0;next.offSeconds+=dt;return next;
  }
  // Wait for an observed exposed pickup before making a fresh discharge
  // prediction and starting. Passive circulation remains in the charge core.
  if(!input.pickupAvailable) {
    next.speedRps=0;next.startupSeconds=0;next.offSeconds+=dt;return next;
  }
  const target=Math.max(input.minimumRps,Math.min(input.demandRps,limit));
  const rampingFromRest=!!input.startupFromRest && !!input.inverterSlew && next.speedRps<input.minimumRps;
  if(next.speedRps===0&&!rampingFromRest)next.speedRps=input.minimumRps;
  else if(input.inverterSlew)next.speedRps+=Math.max(-input.inverterSlew.downRpsPerSecond*dt,
    Math.min(input.inverterSlew.upRpsPerSecond*dt,target-next.speedRps));
  else if(next.startupSeconds>=10)next.speedRps+=Math.max(-dt,Math.min(.5*dt,target-next.speedRps));
  // An envelope limit takes precedence over the ordinary actuator slew/hold.
  next.speedRps=Math.max(rampingFromRest?0:input.minimumRps,Math.min(next.speedRps,limit));
  next.startupSeconds+=dt;next.offSeconds=0;return next;
}
