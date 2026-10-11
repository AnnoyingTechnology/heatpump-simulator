import test from 'node:test';
import assert from 'node:assert/strict';
import factory from './backend.mjs';
import {Properties} from './build/properties.js';
import {ChargeCircuit} from './build/charge.js';
import {configured} from './charge-fixture.mjs';

const b={orientation:'heating',compressorSpeedRps:18,enabledRoomIds:['room-1'],outdoorMetalC:7,indoorMetalCById:{'room-1':20}};
const options=coilCells=>({coilCells,coilReconstruction:'mc',storageCoordinates:'density',analyticFluxJacobian:true,
  eliminateInternalFlows:true,polynomialThroatSearch:true});

test('coupled coil refinement preserves total geometry and exact initial finite charge/energy',async t=>{
  const props=new Properties(await factory()),config=configured(),initial=[];
  try{
    for(const N of [3,6,12]){
      const c=new ChargeCircuit(props,config.inventory.geometry,{massKg:.6,fluidTemperatureC:20},options(N)),s=c.snapshot();
      initial.push(s);assert.equal(s.cells.filter(c=>c.id.startsWith('outdoor:')).length,N);
      assert.equal(s.cells.filter(c=>c.id.includes(':coil:')).length,N);
      const outdoorV=s.cells.filter(c=>c.id.startsWith('outdoor:')).reduce((sum,c)=>sum+c.volumeM3,0);
      assert.ok(Math.abs(outdoorV-config.inventory.geometry.outdoorCoilVolumeM3)<1e-15);
      t.diagnostic(JSON.stringify({cellsPerCoil:N,physicalCells:s.cells.length,fullVariables:s.variables.length,solvedVariables:c.flowOffset,
        initialMassKg:s.initialMassKg,initialEnergyJ:s.initialEnergyJ}));
    }
    for(const s of initial){assert.ok(Math.abs(s.initialMassKg-initial[0].initialMassKg)<1e-12);assert.ok(Math.abs(s.initialEnergyJ-initial[0].initialEnergyJ)<1e-7);}
  }finally{props.dispose();}
});

test('refined bounded coupled coils retain original local/global balances, passive reversal and transaction ownership',async t=>{
  const props=new Properties(await factory()),config=configured();
  try{
    for(const N of [3,6,12]){
      const c=new ChargeCircuit(props,config.inventory.geometry,{massKg:.6,fluidTemperatureC:20},options(N));
      const started=performance.now();let work=0;
      for(let j=0;j<8;j++){
        const before=c.snapshot(),r=c.prepareStep(.125,b);assert.deepEqual(c.snapshot(),before);
        assert.ok(Math.abs(r.massResidualKg)<1e-7);assert.ok(Math.abs(r.energyResidualJ)<.01);
        work+=r.compressorWorkJ;c.commit(r);
      }
      const before=c.snapshot(),reverse={...b,orientation:'cooling',compressorSpeedRps:0};
      const r=c.prepareStep(.125,reverse);assert.deepEqual(c.snapshot(),before);assert.equal(r.compressorWorkJ,0);
      assert.deepEqual(r.snapshot.cells.map(c=>[c.id,c.volumeM3]),before.cells.map(c=>[c.id,c.volumeM3]));
      assert.ok(Math.abs(r.massResidualKg)<1e-7);assert.ok(Math.abs(r.energyResidualJ)<.01);c.commit(r);
      t.diagnostic(JSON.stringify({cellsPerCoil:N,compressorWorkJ:work,wallMs:performance.now()-started,
        pressurePa:r.snapshot.variables.slice(0,3),massResidualKg:r.massResidualKg,energyResidualJ:r.energyResidualJ}));
    }
  }finally{props.dispose();}
});

// This is spatial transport accuracy qualification, separate from ledger tests.
test('coupled spatial accuracy receipt retains actual outlet convergence and nonmonotone coarse heat/pressure limits',async t=>{
  const props=new Properties(await factory()),config=configured();
  try{
    for(const reconstruction of ['constant','mc']){
      const records=[];
      for(const N of [3,6,12]){
        const c=new ChargeCircuit(props,config.inventory.geometry,{massKg:.6,fluidTemperatureC:20},{...options(N),coilReconstruction:reconstruction});
        let heat=0,work=0,r;
        for(let j=0;j<24;j++){r=c.prepareStep(.125,b);heat+=r.integratedCoilHeatJ['room-1'];work+=r.compressorWorkJ;c.commit(r);}
        const out=r.coilPorts.outdoor.gasCellState,small=r.coilPorts['room-1'].smallCellState;
        records.push({cells:N,outletH:out.hJkg,outletQuality:out.qualityMass,outletSH:out.temperatureC-props.saturation(out.pPa).temperatureC,
          roomOutletH:small.hJkg,roomHeatJ:heat,compressorWorkJ:work,pressurePa:r.snapshot.variables.slice(0,3)});
      }
      t.diagnostic(JSON.stringify({coupledReconstruction:reconstruction,records}));
      for(const key of ['outletH','roomOutletH']){
        const coarse=Math.abs(records[0][key]-records[1][key]),fine=Math.abs(records[1][key]-records[2][key]);
        assert.ok(fine<coarse,`${reconstruction} ${key} 3/6/12 refinement`);
      }
      t.diagnostic(JSON.stringify({heatRefinementMonotone:Math.abs(records[1].roomHeatJ-records[2].roomHeatJ)<Math.abs(records[0].roomHeatJ-records[1].roomHeatJ),
        heatFineRelativeDiscrepancy:Math.abs(records[1].roomHeatJ-records[2].roomHeatJ)/Math.abs(records[2].roomHeatJ),pressureRefinementMonotone:records[0].pressurePa.map((_,j)=>Math.abs(records[1].pressurePa[j]-records[2].pressurePa[j])<Math.abs(records[0].pressurePa[j]-records[1].pressurePa[j])),
        pressureFineRelativeDiscrepancy:records[0].pressurePa.map((_,j)=>Math.abs(records[1].pressurePa[j]-records[2].pressurePa[j])/records[2].pressurePa[j])}));
    }
  }finally{props.dispose();}
});
