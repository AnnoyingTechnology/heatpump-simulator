import test from 'node:test';
import assert from 'node:assert/strict';
import { createPilot } from '../../tools/probe-charge-eos.mjs';

test('public DU liquid/vapor/wet flashes and invalid-request recovery',async()=>{
  const p=await createPilot();
  for(const [a,x,b,y] of [['P',800000,'T',278.15],['P',2500000,'T',303.15],['P',800000,'Q',.5]]){
    const rho=p.prop('D',a,x,b,y),u=p.prop('U',a,x,b,y),s=p.du(rho*.001,rho*.001*u,.001);
    assert.ok(Math.abs(s.T-p.prop('T',a,x,b,y))<1e-6);
    assert.ok(Math.abs(s.p-p.prop('P',a,x,b,y))<.002);
  }
  for(let i=0;i<12;i++)assert.throws(()=>p.prop('P','D',-1-i,'U',300000));
  assert.ok(p.du(...p.pq(800000,.5,.001),.001).p>700000);
});

test('HEM nozzle maximization agrees with dense isentrope and chokes',async()=>{
  const p=await createPilot();
  for(const q of [.02,.5,1]){
    const up=p.du(...p.pq(2500000,q,.001),.001),area=2e-7;
    const r=p.nozzle(up,200000,area);let dense=0;
    for(let i=0;i<=500;i++){
      const pressure=200000*(up.p/200000)**(i/500);
      const h=p.prop('H','P',pressure,'S',up.s),rho=p.prop('D','P',pressure,'S',up.s);
      dense=Math.max(dense,rho*Math.sqrt(Math.max(0,2*(up.h-h))));
    }
    assert.ok(Math.abs(r.flux-dense)/dense<2e-4);
    assert.ok(r.throatPa>400000 && r.throatPa<up.p);
    const lower=p.nozzle(up,150000,area);
    assert.ok(Math.abs(lower.massFlow-r.massFlow)/r.massFlow<2e-5);
    assert.equal(p.nozzle(up,up.p,area).massFlow,0);
  }
});

test('local enthalpy leakage converges to rigid adiabatic isentropic vessel solution',async()=>{
  const p=await createPilot();
  for(const q of [.5,1]){
    const old=p.pq(800000,q,.001),s0=p.du(...old,.001).s;
    const errors=[];
    for(const n of [40,80]){let state=[...old],exported=0;
      for(let i=0;i<n;i++){const r=p.vesselLeak(state,.001,old[0]*.01/n);state=r.state;exported+=r.exportedH;}
      assert.ok(Math.abs(state[0]-old[0]*.99)<1e-14);
      assert.ok(Math.abs(state[1]-old[1]+exported)<1e-8);
      const exactP=p.prop('P','D',state[0]/.001,'S',s0);
      errors.push(Math.abs(p.du(...state,.001).p-exactP));
    }
    assert.ok(errors[1]<errors[0]*.55);
  }
});

test('implicit grouped loop conserves actual metal/fluid energy and resolves charge response',async()=>{
  const p=await createPilot(),final=[];
  for(const q of [.05,.15]){
    const initial=p.initial(q),states=[];
    for(const dt of [.25,.125,.0625]){let y=[...initial],work=0;
      for(let t=0;t<2-1e-10;t+=dt){const r=p.step(y,dt);y=r.state;work+=dt*r.rates.work;}
      const massError=y[0]+y[2]-initial[0]-initial[2];
      const energyError=y[1]+y[3]+p.geometry.metalCapacity*(y[4]+y[5])-initial[1]-initial[3]-p.geometry.metalCapacity*(initial[4]+initial[5])-work;
      assert.ok(Math.abs(massError)<1e-12);assert.ok(Math.abs(energyError)<1e-4);
      const r=p.rates(y);assert.ok(r.low.q>0 && r.low.q<1);assert.ok(r.high.q>0 && r.high.q<1);
      assert.ok(r.work>0 && r.mc>0 && r.me>0 && r.S.alpha>.02);states.push(r);
    }
    for(const key of ['low','high']){
      const coarse=Math.abs(states[1][key].p-states[0][key].p),fine=Math.abs(states[2][key].p-states[1][key].p);
      assert.ok(fine<coarse*.56);assert.ok(fine/states[2][key].p<6e-4);
    }
    final.push(states[2]);
  }
  // Different actual initial inventories affect the physical valve and pressure evolution.
  // No universal COP/charge monotonicity follows from this bounded transient.
  assert.ok(Math.abs(final[0].me-final[1].me)>1e-4);
  assert.ok(Math.abs(final[0].high.p-final[1].high.p)>10000);
});

test('shared-pressure axial cells retain separate states and closed-EEV branch inventory',async()=>{
  const p=await createPilot(),g=p.grouped(3,3),old=g.initial;
  let y=[...old],work=0;const before=g.evaluate(old);
  const mass=r=>r.cells.reduce((s,c)=>s+c.M,0);
  const energy=(r,z)=>r.cells.reduce((s,c)=>s+c.U,0)+10000*z.slice(g.tIndex).reduce((a,b)=>a+b);
  for(let i=0;i<12;i++){const r=g.step(y,.25);y=r.state;work+=.25*r.rates.work;}
  const after=g.evaluate(y);
  assert.ok(Math.abs(mass(after)-mass(before))<1e-9);
  assert.ok(Math.abs(energy(after,y)-energy(before,old)-work)<1e-3);
  assert.ok(after.cells[6].h!==after.cells[8].h);
  assert.ok(after.cells.slice(6).reduce((s,c)=>s+c.M,0)>before.cells.slice(6).reduce((s,c)=>s+c.M,0));
  // A dead-end receives transient gas migration, not imposed EEV throughflow.
  const lastFlow=y[2+after.cells.length+(2*3-2)+2];
  assert.ok(Math.abs(after.dm[8]-lastFlow)<1e-14);
  assert.ok(y[g.tIndex+2]>old[g.tIndex+2]);
});
