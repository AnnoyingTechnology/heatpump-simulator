import type {EngineConfig,RoomState} from './types.ts';
import {thermostatDemand,thermostatFanFraction} from './thermostat.ts';
import {interzoneTargetLosses} from './interzone.ts';
export interface DemandResult {active:boolean[];heatW:number[];integralW:number[];fanFraction:number[]}
/** Dimensionless generic branch command: 95% positive sensible-demand share,
 * 5% UA share reserved for calling branches. The reserve is an arbitrary control
 * assumption, not a measured valve map. With no positive request use UA shares.
 * Validated room conductances are positive; no calling branches means no flow. */
export function inverterAllocationWeights(config:EngineConfig,calling:boolean[],requestsW:number[]):number[] {
 const totalRequest=requestsW.reduce((total,q,i)=>total+(calling[i]?q:0),0);
 const totalUA=config.rooms.reduce((total,room,i)=>total+(calling[i]?room.refrigerantConductanceWK:0),0);
 return config.rooms.map((room,i)=>!calling[i]?0:totalRequest>0?
  .95*requestsW[i]/totalRequest+.05*room.refrigerantConductanceWK/totalUA:room.refrigerantConductanceWK/totalUA);
}
/** Generic comfort controller, not an OEM map. Estimated sensible losses only;
 * all delivered heat still comes from the freshly closed refrigerant/air equations. */
export function roomDemand(config:EngineConfig,rooms:RoomState[],temperatures:number[],previousActive:boolean[],integral:number[],dt:number,integrate:boolean,saturated=false):DemandResult {
 const sign=config.mode==='heating'?1:-1, active:boolean[]=[],heatW:number[]=[],integralW:number[]=[],fanFraction:number[]=[];
 const linkLosses=interzoneTargetLosses(config,temperatures);
 for(let i=0;i<rooms.length;i++){
  const c=config.rooms[i],r=rooms[i],error=sign*(c.setpointC-temperatures[i]);
  const calling=thermostatDemand(c.enabled,error,previousActive[i],config.control.thermostatDeadbandK);
  active.push(calling);
  fanFraction.push(config.control.strategy==='on-off'?(calling?1:0):thermostatFanFraction(calling,error,config.control.thermostatDeadbandK));
  if(config.control.strategy==='on-off'){
   heatW.push(calling?c.refrigerantConductanceWK:0);integralW.push(0);continue;
  }
  // 1006 J/kg/K is a control gain estimate, never the thermal-store heat capacity.
  const capacity=r.dryAirMassKg*1006,kp=capacity/300;
  const loss=sign*((c.envelopeWK+r.dryAirMassKg*c.ventilationACH/3600*1006*(1-(c.ventilationRecoveryEfficiency??0)))*(c.setpointC-config.outdoorTemperatureC)+c.airFabricWK*(c.setpointC-r.fabricTemperatureC)+linkLosses[i]) - sign*(c.fanPowerW*fanFraction[i]**3+(c.internalGainW??0));
  let correction=integral[i]??0;
  if(!c.enabled)correction=0;
  else if(integrate&&calling&&(!saturated||error<0)&&(error>0||loss+kp*error+correction>0))correction=Math.max(-4000,Math.min(4000,correction+kp*error*dt/600));
  const request=Math.max(0,loss+kp*error+correction);
  heatW.push(calling?request:0);integralW.push(correction);
 }
 return {active,heatW,integralW,fanFraction};
}
