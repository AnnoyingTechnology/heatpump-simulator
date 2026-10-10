import test from 'node:test';
import assert from 'node:assert/strict';
import factory from '../../public/vendor/coolprop/coolprop.js';
import {Properties} from './build/properties.js';

test('pressure/density storage coordinates preserve independent EOS states across phase and input switches',async()=>{
  const m=await factory(),p=new Properties(m);
  try {
    const points=[[8e5,'Q',0],[8e5,'Q',.1],[8e5,'Q',.5],[8e5,'Q',1],
      [1e6,'T',278],[8e5,'T',300],[35e5,'T',413.15]];
    for(const [pressure,key,value] of [...points,...points.toReversed()]){
      const density=m.PropsSI('D','P',pressure,key,value,'R32');
      const actual=p.pd(pressure,density);
      assert.equal(actual.densityKgm3,density);assert.equal(actual.pPa,pressure);
      for(const [field,output] of [['hJkg','H'],['entropyJkgK','S']]){
        const expected=m.PropsSI(output,'P',pressure,'D',density,'R32');
        assert.ok(Math.abs(actual[field]-expected)<3e-8*Math.max(1,Math.abs(expected)),`${field} at ${pressure} Pa`);
      }
      assert.ok(Math.abs(actual.temperatureC+273.15-m.PropsSI('T','P',pressure,'D',density,'R32'))<1e-6);
      assert.equal(actual.phase,key==='Q'?'two-phase':value===278?'liquid':'vapor');
      assert.ok(key==='Q'?Math.abs(actual.qualityMass-value)<1e-8:actual.qualityMass===null);
      const ph=p.ph(pressure,actual.hJkg);
      assert.ok(Math.abs(ph.densityKgm3-density)<2e-6*Math.max(1,density));
      assert.ok(Math.abs(ph.temperatureC-actual.temperatureC)<1e-5);
      // Input switching must not return a stale reusable native state.
      p.pt(8e5,30);
    }
  } finally {p.dispose();}
});

test('rejected pressure/density flashes recover without native exceptions or fabricated storage states',async()=>{
  const m=await factory(),p=new Properties(m);
  try {
    for(const [pressure,density] of [[NaN,1],[Infinity,1],[49999,1],[5e6,1],[8e5,0],[8e5,-1],[8e5,Infinity],[8e5,NaN]]){
      assert.throws(()=>p.pd(pressure,density));
    }
    for(const temperatureK of [200,450]){
      const density=m.PropsSI('D','P',8e5,'T',temperatureK,'R32');
      assert.throws(()=>p.pd(8e5,density),/selected.*domain/);
    }
    const rho=m.PropsSI('D','P',8e5,'Q',.5,'R32');
    // Bad inputs here reach prop() directly, exercising computed-T preflight
    // rather than only the public pd() domain guards.
    for(let i=0;i<100;i++){
      assert.throws(()=>p.prop('H','P',8e5,'D',-1-i));
      assert.ok(Math.abs(p.pd(8e5,rho).qualityMass-.5)<1e-8);
      assert.ok(Number.isFinite(p.airH(20,p.airW(20,.5,101325),101325)));
    }
  } finally {p.dispose();}
});
