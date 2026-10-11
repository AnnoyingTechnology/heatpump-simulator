import test from 'node:test';
import assert from 'node:assert/strict';
import factory from './backend.mjs';
import {Properties} from './build/properties.js';
import {boundedEnthalpyFaces,boundedFaceWeights} from './build/charge-faces.js';
import {finiteVolumeTube} from './charge-axial-fv-reference.mjs';

test('MC reconstruction is bounded, flat at extrema, symmetric on reversal and leaves donor arrays unchanged',()=>{
  for(const values of [[0,0,0],[0,1,2],[2,1,0],[0,2,0],[2,0,2],[-3,-2,4,5]]){
    const before=[...values],faces=boundedEnthalpyFaces(values),reverse=boundedEnthalpyFaces([...values].reverse());
    assert.deepEqual(values,before);
    faces.forEach((f,j)=>{
      const low=Math.min(...values.slice(Math.max(0,j-1),j+2)),high=Math.max(...values.slice(Math.max(0,j-1),j+2));
      assert.ok(f.left>=low&&f.left<=high&&f.right>=low&&f.right<=high);
      assert.equal(f.left,reverse[values.length-1-j].right);assert.equal(f.right,reverse[values.length-1-j].left);
    });
  }
});

test('active MC face derivatives agree with independent reconstruction differences away from limiter switches',()=>{
  for(const values of [[0,.1,2],[0,1,2.8],[0,1.9,2],[2,1.9,0],[2,1,.2],[2,.1,0],[0,2,0]]){
    const weights=boundedFaceWeights(values);
    for(let k=0;k<values.length;k++){
      const plus=[...values],minus=[...values],epsilon=1e-6;plus[k]+=epsilon;minus[k]-=epsilon;
      const a=boundedEnthalpyFaces(plus),b=boundedEnthalpyFaces(minus);
      for(let j=0;j<values.length;j++)for(const side of ['left','right']){
        const actual=weights[j][side].filter(([i])=>i===k).reduce((sum,[,v])=>sum+v,0),finite=(a[j][side]-b[j][side])/(2*epsilon);
        assert.ok(Math.abs(actual-finite)<1e-8,`${values} cell${j} ${side} column${k}`);
      }
    }
  }
});

test('bounded finite-volume hot-inlet profiles retain local/global M/U and converge in both directions',async t=>{
  const props=new Properties(await factory());
  try{
    const p=1e6,s=props.saturation(p),L=s.vaporH-s.liquidH,h=s.liquidH+.8*L,inflow=s.vaporH+.05*L,dt=.025;
    const results=[];
    for(const direction of [1,-1]){
      const b={leftMassFlowKgs:direction*.005,rightMassFlowKgs:direction*.005,
        leftInflowEnthalpyJkg:inflow,rightInflowEnthalpyJkg:inflow,metalTemperatureC:20},records=[];
      for(const N of [3,6,12,24,48]){
        const c=finiteVolumeTube(props,.001,N,p,h,0,'mc','density'),initial=c.snapshot();let fluxEnergy=0,outletEnergy=0,minH=h;
        const started=performance.now();
        for(let j=0;j<80;j++){
          const r=c.step(dt,b);fluxEnergy+=r.leftJ-r.rightJ+r.heatJ;outletEnergy+=direction>0?r.rightJ:-r.leftJ;
          minH=Math.min(minH,...r.cells.map(c=>c.state.hJkg));
          assert.ok(Math.abs(r.mass)<5e-11);assert.ok(r.energy.every(e=>Math.abs(e)<1e-5/N));
        }
        const final=c.snapshot(),outlet=final.cells[direction>0?N-1:0].state;
        assert.ok(minH>=h-1e-3);assert.ok(Math.abs(final.M-initial.M)<1e-9);
        assert.ok(Math.abs(final.U-initial.U-fluxEnergy)<1e-4);
        records.push({cells:N,outletH:outlet.hJkg,outletEnergyJ:outletEnergy,pressurePa:final.p,wallMs:performance.now()-started});
      }
      const errors=records.slice(0,-1).map((r,j)=>Math.abs(r.outletH-records[j+1].outletH));
      t.diagnostic(JSON.stringify({direction,records,adjacentOutletDifferences:errors}));
      assert.ok(errors[3]<errors[2]&&errors[2]<errors[1]&&errors[1]<errors[0]);
      results.push(records);
    }
    for(let j=0;j<results[0].length;j++)assert.ok(Math.abs(results[0][j].outletH-results[1][j].outletH)<.001);
  }finally{props.dispose();}
});

test('bounded FV resolves evaporating outlet phase fronts with spatial and time refinement',async t=>{
  const props=new Properties(await factory());
  try{
    const p=1e6,s=props.saturation(p),L=s.vaporH-s.liquidH,h=s.liquidH+.8*L,inflow=s.liquidH+.1*L;
    for(const direction of [1,-1]){
      const b={leftMassFlowKgs:direction*(direction>0?.002:.003),rightMassFlowKgs:direction*(direction>0?.003:.002),
        leftInflowEnthalpyJkg:inflow,rightInflowEnthalpyJkg:inflow,metalTemperatureC:30};
      const records=[];
      for(const [N,dt] of [[3,.05],[6,.05],[12,.05],[24,.05],[48,.05],[12,.025],[12,.0125]]){
        const c=finiteVolumeTube(props,.001,N,p,h,30,'mc','density'),initial=c.snapshot();let energy=0,outletEnergy=0,dewTime=null;
        const started=performance.now();
        for(let j=0;j<Math.round(4/dt);j++){
          const r=c.step(dt,b),outlet=r.cells[direction>0?N-1:0].state;
          if(outlet.phase==='vapor'&&dewTime===null)dewTime=(j+1)*dt;
          energy+=r.leftJ-r.rightJ+r.heatJ;outletEnergy+=direction>0?r.rightJ:-r.leftJ;
        }
        const end=c.snapshot(),outlet=end.cells[direction>0?N-1:0].state;
        assert.ok(Math.abs(end.M-initial.M-4*(b.leftMassFlowKgs-b.rightMassFlowKgs))<1e-9);
        assert.ok(Math.abs(end.U-initial.U-energy)<1e-4);
        records.push({cells:N,dt,dewTime,outletH:outlet.hJkg,quality:outlet.qualityMass,phase:outlet.phase,
          outletEnergyJ:outletEnergy,massKg:end.M,energyJ:end.U,pressurePa:end.p,wallMs:performance.now()-started});
      }
      t.diagnostic(JSON.stringify({direction,records}));
      assert.ok(records.every(r=>r.dewTime!==null),'trajectory must actually pass the outlet dew front');
      const spatialCoarse=Math.abs(records[2].outletH-records[3].outletH),spatialFine=Math.abs(records[3].outletH-records[4].outletH);
      assert.ok(spatialFine<spatialCoarse,'12/24/48 outlet spatial convergence');
      const coarse=Math.abs(records[2].outletEnergyJ-records[5].outletEnergyJ),fine=Math.abs(records[5].outletEnergyJ-records[6].outletEnergyJ);
      assert.ok(fine<coarse*.75,'independent temporal outlet-energy refinement');
    }
  }finally{props.dispose();}
});

test('bounded FV retains closed Off inventory under nonuniform heat and handles reversed wet/cold inflow',async t=>{
  const props=new Properties(await factory());
  try{
    const p=1e6,s=props.saturation(p),L=s.vaporH-s.liquidH;
    const records=[];
    for(const N of [3,6,12]){
      const c=finiteVolumeTube(props,.001,N,p,s.liquidH+.4*L,30,'mc','density'),initial=c.snapshot();let energy=0;
      const wall=Array.from({length:N},(_,j)=>j<N/3?30:j<2*N/3?-20:30);
      for(let j=0;j<40;j++){
        const r=c.step(.025,{leftMassFlowKgs:0,rightMassFlowKgs:0,metalTemperatureC:wall});energy+=r.heatJ+r.leftJ-r.rightJ;
      }
      const off=c.snapshot();assert.ok(Math.abs(off.M-initial.M)<1e-9);assert.ok(Math.abs(off.U-initial.U-energy)<1e-4);
      assert.ok(Math.max(...off.cells.map(c=>c.state.hJkg))-Math.min(...off.cells.map(c=>c.state.hJkg))>1000);
      const b={leftMassFlowKgs:-.003,rightMassFlowKgs:-.003,rightInflowEnthalpyJkg:s.liquidH-.03*L,metalTemperatureC:wall};
      for(let j=0;j<40;j++){const r=c.step(.025,b);energy+=r.heatJ+r.leftJ-r.rightJ;}
      const end=c.snapshot();assert.ok(Math.abs(end.M-initial.M)<1e-9);assert.ok(Math.abs(end.U-initial.U-energy)<1e-4);
      records.push({cells:N,offPressurePa:off.p,finalPressurePa:end.p,massKg:end.M,energyJ:end.U,
        finalEnthalpies:end.cells.map(c=>c.state.hJkg)});
    }
    t.diagnostic(JSON.stringify({nonuniformOffReversal:records}));
  }finally{props.dispose();}
});

test('bounded FV resolves condensing liquid outlet exhaustion of vapor in both flow directions',async t=>{
  const props=new Properties(await factory());
  try{
    const p=1e6,s=props.saturation(p),L=s.vaporH-s.liquidH;
    for(const direction of [1,-1]){
      const records=[];
      for(const [N,dt] of [[3,.025],[6,.025],[12,.025],[24,.025],[48,.025],[12,.0125],[12,.00625]]){
        const c=finiteVolumeTube(props,.001,N,p,s.liquidH+.03*L,150,'mc','density'),initial=c.snapshot();let energy=0,outletEnergy=0,bubbleTime=null,substeps=0;
        const b={leftMassFlowKgs:direction*.01,rightMassFlowKgs:direction*.01,
          leftInflowEnthalpyJkg:s.vaporH+.05*L,rightInflowEnthalpyJkg:s.vaporH+.05*L,metalTemperatureC:-20};
        for(let j=0;j<Math.round(4/dt);j++){
          const r=c.step(dt,b),outlet=r.cells[direction>0?N-1:0].state;
          energy+=r.leftJ-r.rightJ+r.heatJ;outletEnergy+=direction>0?r.rightJ:-r.leftJ;substeps+=r.substeps;
          if(outlet.phase==='liquid'&&bubbleTime===null)bubbleTime=(j+1)*dt;
        }
        const end=c.snapshot();assert.ok(Math.abs(end.M-initial.M-4*(b.leftMassFlowKgs-b.rightMassFlowKgs))<1e-9);
        assert.ok(Math.abs(end.U-initial.U-energy)<1e-4);
        records.push({cells:N,dt,bubbleTime,outletH:end.cells[direction>0?N-1:0].state.hJkg,outletEnergyJ:outletEnergy,pressurePa:end.p,substeps});
      }
      t.diagnostic(JSON.stringify({direction,condensation:records}));
      assert.ok(records.every(r=>r.bubbleTime!==null),'must actually pass the bubble front');
      // Sharp phase-front placement is nonmonotone on very coarse grids. The
      // fine-grid envelope must improve over the 6→12-cell discrepancy.
      assert.ok(Math.abs(records[3].outletH-records[4].outletH)<Math.abs(records[1].outletH-records[2].outletH));
      assert.ok(Math.abs(records[3].pressurePa-records[4].pressurePa)<Math.abs(records[1].pressurePa-records[2].pressurePa));
      const coarse=Math.abs(records[2].outletEnergyJ-records[5].outletEnergyJ),fine=Math.abs(records[5].outletEnergyJ-records[6].outletEnergyJ);
      assert.ok(fine<coarse*.75,'independent temporal condensation energy refinement');
    }
  }finally{props.dispose();}
});
