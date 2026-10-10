import test from 'node:test';
import assert from 'node:assert/strict';
import Module from '../../public/vendor/coolprop/coolprop.js';
import {Properties} from './build/properties.js';
const module=await Module(),properties=new Properties(module);
test('conserved density/internal-energy flash matches independent real R32 states across phases',()=>{
  for(const [p,key,value] of [[8e5,'T',278.15],[25e5,'T',303.15],[8e5,'Q',.001],[8e5,'Q',.5],[8e5,'Q',.999],[35e5,'T',413.15]]){
    const rho=module.PropsSI('D','P',p,key,value,'R32'),u=module.PropsSI('U','P',p,key,value,'R32');
    const s=properties.du(rho,u);
    assert.ok(Math.abs(s.pPa-p)<.01);
    assert.ok(Math.abs(s.temperatureC+273.15-module.PropsSI('T','P',p,key,value,'R32'))<1e-6);
    assert.ok(Math.abs(s.hJkg-module.PropsSI('H','P',p,key,value,'R32'))<.01);
    assert.ok(Math.abs((s.hJkg-s.pPa/s.densityKgm3)-u)<1e-8);
    assert.ok(Math.abs(s.entropyJkgK-module.PropsSI('S','P',p,key,value,'R32'))<1e-5);
    if(key==='Q'){assert.equal(s.phase,'two-phase');assert.ok(Math.abs(s.qualityMass-value)<1e-8)}
    else{assert.equal(s.qualityMass,null);assert.equal(s.phase,p===25e5?'liquid':'vapor')}
  }
});
test('invalid DU trials reject through safe computed-pressure boundary and valid flashes recover',()=>{
  const rho=module.PropsSI('D','P',8e5,'T',278.15,'R32'),u=module.PropsSI('U','P',8e5,'T',278.15,'R32');
  for(let i=0;i<100;i++){
    assert.throws(()=>properties.du(-1,u));
    assert.throws(()=>properties.du(rho,NaN));
    assert.throws(()=>properties.du(20,-1e9-i));
    assert.throws(()=>properties.prop('T','D',-1-i,'U',u));
    assert.ok(Math.abs(properties.du(rho,u).pPa-8e5)<.01);
    assert.ok(Math.abs(properties.pt(8e5,5).temperatureC-5)<1e-6);
  }
});
