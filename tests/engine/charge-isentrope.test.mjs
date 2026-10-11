import test from 'node:test';
import assert from 'node:assert/strict';
import factory from './backend.mjs';
import {Properties,DomainError} from './build/properties.js';
import {isentropicR32Density} from './build/charge-isentrope.js';

test('exact pure-R32 entropy lever rule matches independent PS flashes across bubble/dew and pressure range',async t=>{
  const props=new Properties(await factory());let worst=0;
  try{
    for(const p of [1e5,5e5,1e6,2e6,3.5e6]){
      const sl=props.prop('S','P',p,'Q',0),sv=props.prop('S','P',p,'Q',1);
      for(const fraction of [-1e-5,0,1e-8,.01,.5,.99,1-1e-8,1,1+1e-5]){
        const entropy=sl+fraction*(sv-sl),a=isentropicR32Density(props,p,entropy),b=props.prop('D','P',p,'S',entropy);
        const error=Math.abs(a-b)/b;worst=Math.max(worst,error);
        assert.ok(error<2e-7,`${p}Pa fraction${fraction}: ${a}/${b}`);
      }
    }
    t.diagnostic(JSON.stringify({maximumRelativeDensityDifference:worst}));
  }finally{props.dispose();}
});

test('wet density needs actual PQ data, while single-phase PS failures propagate without fallback',async()=>{
  const props=new Properties(await factory()),original=props.prop.bind(props);
  try{
    const p=1e6,sl=original('S','P',p,'Q',0),sv=original('S','P',p,'Q',1);
    props.prop=(out,a,x,b,y)=>{if(b==='S')throw new DomainError('Actual single-phase PS outage');return original(out,a,x,b,y);};
    assert.ok(isentropicR32Density(props,p,(sl+sv)/2)>0);
    assert.throws(()=>isentropicR32Density(props,p,sv+1),/Actual single-phase PS outage/);
    props.prop=(out,a,x,b,y)=>out==='D'&&b==='Q'?NaN:original(out,a,x,b,y);
    assert.throws(()=>isentropicR32Density(props,p,(sl+sv)/2),/saturation density interval/);
    props.prop=(out,a,x,b,y)=>out==='S'&&b==='Q'?1:original(out,a,x,b,y);
    assert.throws(()=>isentropicR32Density(props,p,(sl+sv)/2),/saturation entropy interval/);
  }finally{props.dispose();}
});
