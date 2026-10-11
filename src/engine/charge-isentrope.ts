import {DomainError,Properties} from './properties.ts';

/** Pure R32, subcritical equilibrium only. The caller's guarded Properties
 * instance supplies the same public saturation and single-phase EOS domain. */
export function isentropicR32Density(properties:Properties,pressure:number,entropy:number):number {
  const sl=properties.prop('S','P',pressure,'Q',0),sv=properties.prop('S','P',pressure,'Q',1);
  if(!(Number.isFinite(entropy)&&Number.isFinite(sl)&&Number.isFinite(sv)&&sl<sv))
    throw new DomainError('Invalid pure-fluid saturation entropy interval');
  let value:number;
  if(entropy>=sl&&entropy<=sv){
    const rl=properties.prop('D','P',pressure,'Q',0),rv=properties.prop('D','P',pressure,'Q',1);
    if(!(Number.isFinite(rl)&&Number.isFinite(rv)&&rl>rv&&rv>0))
      throw new DomainError('Invalid pure-fluid saturation density interval');
    const quality=(entropy-sl)/(sv-sl);
    value=1/((1-quality)/rl+quality/rv);
  }else{
    // An actual single-phase PS failure propagates; this is no backend fallback.
    value=properties.prop('D','P',pressure,'S',entropy);
    let temperature=properties.prop('T','P',pressure,'S',entropy);
    const saturation=properties.prop('T','P',pressure,'Q',0);
    const key=Math.abs(temperature-saturation)<1e-4?(entropy>sv?'P|gas':'P|liquid'):'P';
    for(let i=0;i<4;i++){
      const residual=properties.prop('S',key,pressure,'T',temperature)-entropy;
      if(Math.abs(residual)<1e-11)break;
      const cp=properties.prop('C',key,pressure,'T',temperature),next=temperature-residual*temperature/cp;
      if(next===temperature)break;temperature=next;
    }
    value=properties.prop('D',key,pressure,'T',temperature);
  }
  if(!(Number.isFinite(value)&&value>0))throw new DomainError('Invalid isentropic nozzle density');
  return value;
}
