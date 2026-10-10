import test from 'node:test';import assert from 'node:assert/strict';
import Module from '../../public/vendor/coolprop/coolprop.js';import {Properties} from './build/index.js';
const m=await Module(),p=new Properties(m);
test('reusable HEOS state matches independent PropsSI across input switches and cache hits',()=>{
  const points=[['P',8e5,'T',300],['P',25e5,'T',310],['P',8e5,'Q',.5],['T',280,'Q',1],['P',25e5,'S',2000]];
  for(const point of [...points,...points.reverse()])for(const output of ['T','H','S','D','Q']){
    const actual=p.prop(output,...point),reference=m.PropsSI(output,...point,'R32');assert.ok(Math.abs(actual-reference)<3e-8*Math.max(1,Math.abs(reference)),output);
  }
  const state=p.ph(8e5,m.PropsSI('H','P',8e5,'Q',.5,'R32'));assert.ok(Math.abs(state.qualityMass-.5)<1e-8);
});

test('repeated rejected flashes preserve real WASM refrigerant and humid-air service',()=>{
  const expected=m.HAPropsSI('H','T',293.15,'R',.5,'P',101325);
  for(let i=0;i<2000;i++){
    assert.throws(()=>p.prop('H','P',100000,'T',-100-i*.001));
    assert.throws(()=>p.prop('A','P',8e5,'Q',.2+i*.0001));
    if(i%100===0){assert.ok(Math.abs(p.prop('H','P',8e5,'T',300)-m.PropsSI('H','P',8e5,'T',300,'R32'))<1e-5);assert.ok(Math.abs(p.airH(20,p.airW(20,.5,101325),101325)-expected)<1e-8);}
  }
  assert.equal(m.HAPropsSI('H','T',293.15,'R',.5,'P',101325),expected);
});
