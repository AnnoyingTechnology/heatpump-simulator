import {DomainError} from './properties.ts';

export interface EevPiControl {
  proportionalOpeningPerK:number; integralOpeningPerKs:number; slewOpeningPerSecond:number;
}
export interface EevPiState { opening:number; integralBias:number }

/** Normalized effective-area PI command with an independently limited actuator.
 * Inactive/tracking transitions are declared control events, not fluid edits. */
export function eevPiStep(previous:EevPiState,errorK:number,dt:number,control:EevPiControl,
  inactive:boolean,trackTransition=false):EevPiState {
  const {proportionalOpeningPerK:kp,integralOpeningPerKs:ki,slewOpeningPerSecond:slew}=control;
  if(![previous.opening,previous.integralBias,errorK,dt,kp,ki,slew].every(Number.isFinite)||
    previous.opening<0||previous.opening>1||dt<=0||kp<=0||ki<=0||slew<=0)
    throw new DomainError('Invalid generic EEV PI control state/coefficient');
  const limit=slew*dt;
  if(inactive){
    const opening=Math.max(0,previous.opening-limit);
    return {opening,integralBias:opening-kp*errorK};
  }
  let integralBias=trackTransition?previous.opening-kp*errorK:previous.integralBias;
  const raw=integralBias+kp*errorK,increment=ki*dt*errorK;
  // Admit only the part of integral action that stays within this interval's
  // position/slew command. An already infeasible signed bias may move toward
  // feasibility; it is never projected to an arbitrary bias interval.
  const feasibleLow=Math.max(0,previous.opening-limit),feasibleHigh=Math.min(1,previous.opening+limit);
  integralBias+=errorK>0?Math.max(0,Math.min(increment,feasibleHigh-raw)):
    errorK<0?Math.min(0,Math.max(increment,feasibleLow-raw)):0;
  const target=Math.max(0,Math.min(1,integralBias+kp*errorK));
  const opening=Math.max(0,Math.min(1,previous.opening+Math.max(-limit,Math.min(limit,target-previous.opening))));
  if(!Number.isFinite(integralBias))throw new DomainError('Generic EEV PI integral overflow');
  return {opening,integralBias};
}
