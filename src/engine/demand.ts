import type {EngineConfig,RoomState} from './types.ts';
import {thermostatDemand} from './thermostat.ts';
import {interzoneTargetLosses} from './interzone.ts';
export interface DemandResult {active:boolean[];heatW:number[];integralW:number[]}
/** Generic comfort controller, not an OEM map. Estimated sensible losses only;
 * all delivered heat still comes from the freshly closed refrigerant/air equations. */
export function roomDemand(config:EngineConfig,rooms:RoomState[],temperatures:number[],previousActive:boolean[],integral:number[],dt:number,integrate:boolean,saturated=false):DemandResult {
 const sign=config.mode==='heating'?1:-1, active:boolean[]=[],heatW:number[]=[],integralW:number[]=[];
 const linkLosses=interzoneTargetLosses(config,temperatures);
 for(let i=0;i<rooms.length;i++){
  const c=config.rooms[i],r=rooms[i],error=sign*(c.setpointC-temperatures[i]);
  if(config.control.strategy==='on-off'){
   active.push(thermostatDemand(c.enabled,error,previousActive[i],config.control.thermostatDeadbandK));heatW.push(c.refrigerantConductanceWK);integralW.push(0);continue;
  }
  // 1006 J/kg/K is a control gain estimate, never the thermal-store heat capacity.
  const capacity=r.dryAirMassKg*1006,kp=capacity/300;
  const loss=sign*((c.envelopeWK+r.dryAirMassKg*c.ventilationACH/3600*1006*(1-(c.ventilationRecoveryEfficiency??0)))*(c.setpointC-config.outdoorTemperatureC)+c.airFabricWK*(c.setpointC-r.fabricTemperatureC)+linkLosses[i]) - sign*(c.fanPowerW+(c.internalGainW??0));
  let correction=integral[i]??0;
  if(!c.enabled)correction=0;
  else if(integrate&&(!saturated||error<0)&&(error>0||(previousActive[i]&&loss+kp*error+correction>0)))correction=Math.max(-4000,Math.min(4000,correction+kp*error*dt/600));
  const request=Math.max(0,loss+kp*error+correction);
  active.push(c.enabled&&request>0);
  heatW.push(c.enabled?request:0);integralW.push(correction);
 }
 return {active,heatW,integralW};
}
