import test from 'node:test';import assert from 'node:assert/strict';
import Module from './backend.mjs';import {Properties} from './build/index.js';
const m=await Module(),p=new Properties(m);
test('reusable HEOS state matches independent PropsSI across input switches and cache hits',()=>{
  const points=[['P',8e5,'T',300],['P',25e5,'T',310],['P',8e5,'Q',.5],['T',280,'Q',1],['P',25e5,'S',2000]];
  for(const point of [...points,...points.reverse()])for(const output of ['T','H','S','D','Q']){
    const actual=p.prop(output,...point),reference=m.PropsSI(output,...point,'R32');assert.ok(Math.abs(actual-reference)<3e-8*Math.max(1,Math.abs(reference)),output);
  }
  const state=p.ph(8e5,m.PropsSI('H','P',8e5,'Q',.5,'R32'));assert.ok(Math.abs(state.qualityMass-.5)<1e-8);
  for(const [pressure,key,value] of [[8e5,'Q',0],[8e5,'Q',.5],[8e5,'Q',1],[25e5,'T',303.15],[8e5,'T',300],[35e5,'T',413.15]]){
    const enthalpy=m.PropsSI('H','P',pressure,key,value,'R32'),actual=p.ph(pressure,enthalpy);
    for(const [field,output] of [['entropyJkgK','S'],['densityKgm3','D']]){
      const expected=m.PropsSI(output,'P',pressure,'H',enthalpy,'R32');
      assert.ok(Math.abs(actual[field]-expected)<3e-8*Math.max(1,Math.abs(expected)),`${field} at ${pressure} Pa`);
    }
    assert.ok(Math.abs(actual.temperatureC+273.15-m.PropsSI('T','P',pressure,'H',enthalpy,'R32'))<1e-6);
    assert.equal(actual.phase,key==='Q'?'two-phase':pressure===25e5?'liquid':'vapor');
    assert.ok(key==='Q'?Math.abs(actual.qualityMass-value)<1e-8:actual.qualityMass===null);
  }
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

test('undefined two-phase sound speed cannot poison later same-input physical readings',()=>{
  const point=['P',9e5,'Q',.37];
  p.clearCache();
  p.prop('T',...point);
  assert.throws(()=>p.prop('A',...point));
  // A native getter failure invalidates a guarded reusable state. H is uncached,
  // so recovering it at identical inputs requires a new successful update.
  const actual=p.prop('H',...point),expected=m.PropsSI('H',...point,'R32');
  assert.ok(Math.abs(actual-expected)<3e-8*Math.abs(expected));
  for(const point of [['P',9e5,'T',310],['P',3e6,'T',290]])
    for(const output of ['C','V','A']){
      const expected=m.PropsSI(output,...point,'R32');
      assert.ok(Math.abs(p.prop(output,...point)-expected)<3e-8*Math.abs(expected),output);
    }
});
