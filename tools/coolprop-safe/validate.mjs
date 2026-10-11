// Shared Node/browser acceptance probe; all reference unsafe-state calls are valid.
export async function validate(safeFactory, referenceFactory, options = {}) {
  const start=performance.now(), safe=await safeFactory(options.safe), initMs=performance.now()-start;
  const reference=await referenceFactory(options.reference);
  const assert=(ok,message)=>{if(!ok)throw new Error(message);};
  const fails=(fn,label)=>{try{fn();}catch(e){assert(e instanceof Error,`${label}: not ordinary Error`);return;}throw new Error(`${label}: did not reject`);};
  assert(safe.guardedStateApi===true,'Missing guardedStateApi');
  fails(()=>safe.factory('REFPROP','R32'),'backend restriction');
  fails(()=>safe.factory('HEOS','R404A'),'fluid restriction');
  fails(()=>safe.factory(null,'R32'),'null factory');
  const state=safe.factory('HEOS','R32'), legacyState=reference.factory('HEOS','R32'), all=['T','p','hmass','smass','rhomass','Q','cpmass','viscosity','speed_sound'];
  for(const name of all)fails(()=>state[name](),`before update ${name}`);
  const outputs={T:'T',p:'P',hmass:'H',smass:'S',rhomass:'D',Q:'Q',cpmass:'C',viscosity:'V',speed_sound:'A'};
  const records=[]; let maxRelative=0,maxLegacyStateRelative=0;
  function compare(pair,a,b,k1,x,k2,y,twoPhase=false){
    state.update(safe.input_pairs[pair],a,b);
    legacyState.update(reference.input_pairs[pair],a,b);
    for(const name of all){
      if(twoPhase&&(name==='speed_sound'||name==='cpmass'))continue;
      const actual=state[name](),expected=reference.PropsSI(outputs[name],k1,x,k2,y,'R32');
      const legacy=legacyState[name](),legacyError=Math.abs(actual-legacy);
      maxLegacyStateRelative=Math.max(maxLegacyStateRelative,legacyError/Math.max(1,Math.abs(legacy)));
      assert(legacyError<=1e-8+2e-11*Math.abs(legacy),`Legacy state disagreement ${pair}/${name}`);
      assert(Number.isFinite(expected)&&Math.abs(expected)<1e30,`Invalid reference ${pair}/${name}`);
      const error=Math.abs(actual-expected),relative=error/Math.max(1,Math.abs(expected));
      maxRelative=Math.max(maxRelative,relative);
      assert(error<=1e-7+2e-9*Math.abs(expected),`EOS mismatch ${pair}/${name}: ${actual} vs ${expected}`);
      records.push({pair,output:name,actual,expected,absoluteError:error,legacyStateValue:legacy,legacyStateAbsoluteError:legacyError});
    }
  }
  for(const [p,t] of [[1e5,240],[7e5,280],[1e6,330],[3e6,400],[3e6,260]]){
    compare('PT_INPUTS',p,t,'P',p,'T',t);
    const h=reference.PropsSI('H','P',p,'T',t,'R32'),s=reference.PropsSI('S','P',p,'T',t,'R32'),d=reference.PropsSI('D','P',p,'T',t,'R32'),u=reference.PropsSI('U','P',p,'T',t,'R32');
    compare('HmassP_INPUTS',h,p,'P',p,'H',h);
    compare('PSmass_INPUTS',p,s,'P',p,'S',s);
    compare('DmassP_INPUTS',d,p,'P',p,'D',d);
    compare('DmassUmass_INPUTS',d,u,'D',d,'U',u);
    compare('DmassT_INPUTS',d,t,'D',d,'T',t);
  }
  for(const p of [1e5,7e5,3e6])for(const q of [0,.2,.8,1]){
    compare('PQ_INPUTS',p,q,'P',p,'Q',q,true);
    const t=reference.PropsSI('T','P',p,'Q',q,'R32');
    compare('QT_INPUTS',q,t,'T',t,'Q',q,true);
    const h=reference.PropsSI('H','P',p,'Q',q,'R32');
    compare('HmassP_INPUTS',h,p,'P',p,'H',h,true);
  }
  state.update(safe.input_pairs.PQ_INPUTS,7e5,.5);
  fails(()=>state.speed_sound(),'two-phase sound native getter');
  for(const name of all)fails(()=>state[name](),`after getter fault ${name}`);
  state.update(safe.input_pairs.PT_INPUTS,7e5,300);
  assert(state.rhomass()>0,'getter fault recovery');
  fails(()=>state.update('invalid',7e5,300),'invalid pair');
  for(const name of all)fails(()=>state[name](),`invalid pair ${name}`);
  state.update(safe.input_pairs.PT_INPUTS,7e5,300);
  fails(()=>state.update(safe.input_pairs.PT_INPUTS,Infinity,300),'infinite input');
  for(const name of all)fails(()=>state[name](),`infinite input ${name}`);
  for(const value of [Symbol('invalid'),1n,null,'300']) {
    state.update(safe.input_pairs.PT_INPUTS,7e5,300);
    fails(()=>state.update(safe.input_pairs.PT_INPUTS,7e5,value),'nonnumeric input');
    for(const name of all)fails(()=>state[name](),`nonnumeric input ${name}`);
  }
  const badStart=performance.now();
  for(let i=0;i<2000;i++){
    const bad=i%3===0?()=>state.update(safe.input_pairs.PT_INPUTS,7e5,NaN):
      i%3===1?()=>state.update(safe.input_pairs.PT_INPUTS,-1,300):
      ()=>state.update(safe.input_pairs.HmassP_INPUTS,1e12,7e5);
    fails(bad,`bad state ${i}`);
    fails(()=>state.hmass(),`stale getter ${i}`);
    state.update(safe.input_pairs.PT_INPUTS,7e5,300+i%7);
    assert(state.rhomass()>0&&Number.isFinite(state.hmass()),`recovery ${i}`);
  }
  const badStateRecoveryMs=performance.now()-badStart;
  const humid=[];
  for(const [t,r,p] of [[273.15,.9,101325],[298.15,.5,101325],[313.15,.8,90000]])for(const out of ['W','H','V']){
    const actual=safe.HAPropsSI(out,'T',t,'R',r,'P',p),expected=reference.HAPropsSI(out,'T',t,'R',r,'P',p);
    assert(Math.abs(actual-expected)<=1e-8+2e-10*Math.abs(expected),'humid EOS disagreement');
    humid.push({out,t,r,p,actual,expected});
  }
  fails(()=>safe.HAPropsSI('W','T',300,'R',2,'P',101325),'humid out-of-range');
  fails(()=>safe.HAPropsSI('BAD','T',300,'R',.5,'P',101325),'humid invalid output');
  fails(()=>safe.PropsSI('D','P',-1,'T',300,'R32'),'PropsSI bad state');
  fails(()=>safe.PropsSI(null,'P',7e5,'T',300,'R32'),'PropsSI null string');
  fails(()=>safe.HAPropsSI('W',null,300,'R',.5,'P',101325),'humid null string');
  assert(safe.HAPropsSI('W','T',300,'R',.5,'P',101325)>0,'humid recovery');
  const benchmark=[];
  const rs=reference.factory('HEOS','R32');
  const trials=Array.from({length:200},(_,i)=>({p:7e5+i*1234,h:450000+i*57}));
  const methods={
    referencePropsSI:({p,h})=>['T','D','S','Q'].map(out=>reference.PropsSI(out,'P',p,'H',h,'R32')),
    referencePreflightState:({p,h})=>{reference.PropsSI('D','P',p,'H',h,'R32');rs.update(reference.input_pairs.HmassP_INPUTS,h,p);return[rs.T(),rs.rhomass(),rs.smass(),rs.Q()];},
    safeState:({p,h})=>{state.update(safe.input_pairs.HmassP_INPUTS,h,p);return[state.T(),state.rhomass(),state.smass(),state.Q()];},
  };
  let checksum=0;
  for(const [name,run] of Object.entries(methods)){
    trials.forEach(run);
    const batches=[];
    for(let j=0;j<5;j++){const begin=performance.now();for(const trial of trials)checksum+=run(trial)[0];batches.push(performance.now()-begin);}
    benchmark.push({name,updatesPerBatch:trials.length,batchesMs:batches,medianMs:[...batches].sort((a,b)=>a-b)[2]});
  }
  rs.delete();legacyState.delete();state.delete();state.delete();fails(()=>state.T(),'deleted getter');fails(()=>state.update(0,7e5,300),'deleted update');
  const other=safe.factory('HEOS','R32');other.update(0,7e5,300);safe.dispose();safe.dispose();
  fails(()=>other.T(),'module dispose state');fails(()=>safe.factory('HEOS','R32'),'module disposed factory');
  return{status:'PASS',environment:typeof window==='undefined'?'Node':'browser',initMs,maxRelative,maxLegacyStateRelative,
    comparisons:records.length,records,humid,badStates:2000,badStateRecoveryMs,benchmark,checksum,totalMs:performance.now()-start};
}
