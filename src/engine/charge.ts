import { Properties, DomainError } from './properties.ts';
import type { RefrigerantState } from './types.ts';

/** Generic R32 inventory foundation. Idealized hydraulic/adiabatic field lines;
 * their real physical volume remains. Geometry/charge edits require a new circuit. */
export interface ChargeRoomGeometry {
  id: string; coilVolumeM3: number; refrigerantConductanceWK: number;
  lineLengthM: number; gasInsideDiameterM: number; smallInsideDiameterM: number;
  maximumValveAreaM2: number;
}
export interface ChargeGeometry {
  rooms: ChargeRoomGeometry[]; outdoorCoilVolumeM3: number; outdoorConductanceWK: number;
  accumulatorVolumeM3: number; accumulatorInletAreaM2: number;
  displacementM3rev: number; volumetricEfficiency: number; isentropicEfficiency: number;
  dischargeCoefficient: number; superheatTargetK: number;
  maximumDischargeC: number; maximumPressureRatio: number;
  valvePassageLengthM?: number; accumulatorInletPassageLengthM?: number;
}
export interface ChargeNumerics { pressureDerivativeRelativeStep?: number; analyticStorageJacobian?:boolean;
  pressureDifferenceCoordinates?:boolean; pressureDifferenceStepPa?:number;
  maximumSubsteps?:number; maximumAttempts?:number }
export class ChargeWorkBudgetError extends DomainError {
  constructor(readonly requestedSeconds:number,readonly provisionalSeconds:number,readonly attempts:number,
    readonly acceptedPieces:number,readonly lastFailure:string) {
    super(`Charge numerical work budget exceeded: requested ${requestedSeconds}s, provisional (uncommitted) ${provisionalSeconds}s, `+
      `${attempts} attempts/${acceptedPieces} accepted pieces; last convergence rejection: ${lastFailure||'none'}`);
    this.name='ChargeWorkBudgetError';
  }
}
export interface ChargeBoundary {
  orientation: 'heating' | 'cooling'; compressorSpeedRps: number;
  ambientPressurePa?: number;
  enabledRoomIds: string[]; outdoorMetalC: number; indoorMetalCById: Record<string, number>;
  leak?: { physicalCellId: string; rateKgs: number };
  operating?: Partial<Pick<ChargeGeometry,'outdoorConductanceWK'|'displacementM3rev'|'volumetricEfficiency'|
    'isentropicEfficiency'|'dischargeCoefficient'|'superheatTargetK'|'maximumDischargeC'|'maximumPressureRatio'>> &
    { indoorConductanceWKById?: Record<string,number> };
}
export interface ChargeCell {
  id: string; volumeM3: number; group: 'outdoor' | 'indoor' | 'accumulator';
  massKg: number; internalEnergyJ: number; state: RefrigerantState;
}
export interface ChargeSnapshot {
  timeSeconds: number; orientation: 'heating' | 'cooling'; variables: number[];
  openings: number[]; initialMassKg: number; initialEnergyJ: number;
  leakedMassKg: number; leakedEnthalpyJ: number; compressorWorkJ: number;
  coilHeatJ: number; cells: ChargeCell[];
  compressorAdmission: boolean;
}
export interface ChargeCandidate {
  acceptedSeconds: number;
  snapshot: ChargeSnapshot; integratedCoilHeatJ: Record<string, number>;
  compressorWorkJ: number; leakMassKg: number; leakEnthalpyJ: number;
  lowLiftTransfer: boolean;
  compressorMassFlowKgs: number; valveMassFlowsKgs: Record<string, number>;
  compressorSuction: RefrigerantState; compressorDischarge: RefrigerantState | null;
  headers: { indoorGas: RefrigerantState | null; outdoorSmall: RefrigerantState | null };
  fieldPorts: Record<string,{gasHeader:RefrigerantState|null;gasHeaderMassFlowKgs:number;
    gasLine:RefrigerantState;smallLine:RefrigerantState;valveMassFlowKgs:number}>;
  coilPorts: Record<string, { gas: RefrigerantState; small: RefrigerantState;
    gasCellState: RefrigerantState; smallCellState: RefrigerantState;
    gasFaceMassFlowKgs: number; smallFaceMassFlowKgs: number; flowFromGasKgs: number }>;
  massResidualKg: number; energyResidualJ: number; nonlinearIterations: number;
  diagnostics: string[];
}
interface CellDefinition { id: string; volume: number; pressureIndex: number; coil?: string; ua: number }
interface Evaluation {
  cells: ChargeCell[]; dm: number[]; dU: number[]; heat: Record<string, number>;
  headerMass: number; work: number; mc: number; valves: number[];
  suction: RefrigerantState; discharge: RefrigerantState | null; diagnostics: string[];
  accumulatorFeedKgs: number;
  accumulatorInletOutflowState: RefrigerantState;
  indoorGasHeader: RefrigerantState | null;
  lowLiftTransfer: boolean;
}

/** No manufacturer geometry/maps. Root supplies explicit geometry provenance. */
export class ChargeCircuit {
  readonly geometry: ChargeGeometry;
  private readonly definitions: CellDefinition[] = [];
  private readonly roomIndices: number[][] = [];
  private readonly outdoorIndices: number[] = [];
  private readonly accumulatorIndex: number;
  private readonly flowOffset: number;
  private current: ChargeSnapshot;
  private revision = 0;
  private candidates = new WeakMap<ChargeCandidate, number>();
  private snapshots = new WeakSet<ChargeSnapshot>();
  private nozzleFluxCache = new Map<string,{flux:number;throatPa:number;flowKgs:number}>();

  constructor(private readonly properties: Properties, geometry: ChargeGeometry,
    initial: { massKg: number; fluidTemperatureC: number; orientation?:'heating'|'cooling'; valveOpening?:number },private readonly numerics:ChargeNumerics={}) {
    this.geometry=deepFreeze(structuredClone(geometry));this.numerics=deepFreeze(structuredClone(numerics));const g = this.geometry;
    const positive = (v: number) => Number.isFinite(v) && v > 0;
    if (!g.rooms.length || new Set(g.rooms.map(r => r.id)).size !== g.rooms.length ||
      ![g.outdoorCoilVolumeM3,g.outdoorConductanceWK,g.accumulatorVolumeM3,g.accumulatorInletAreaM2,
        g.displacementM3rev,g.superheatTargetK,g.maximumPressureRatio].every(positive) ||
      ![g.volumetricEfficiency,g.isentropicEfficiency,g.dischargeCoefficient].every(v => positive(v)&&v<=1) ||
      !Number.isFinite(g.maximumDischargeC) || !positive(initial.massKg) ||
        !Number.isFinite(initial.fluidTemperatureC) || (initial.orientation!==undefined&&!['heating','cooling'].includes(initial.orientation)) || (numerics.pressureDerivativeRelativeStep!==undefined&&
          (!(numerics.pressureDerivativeRelativeStep>0)||!Number.isFinite(numerics.pressureDerivativeRelativeStep))))
      throw new DomainError('Invalid charge geometry/initialization');
    if([g.valvePassageLengthM,g.accumulatorInletPassageLengthM].some(v=>v!==undefined&&!positive(v)))
      throw new DomainError('Restriction passage lengths must be finite and positive');
    if([numerics.maximumSubsteps,numerics.maximumAttempts].some(v=>v!==undefined&&(!Number.isInteger(v)||v<1)))
      throw new DomainError('Charge numerical work budgets must be positive integers');
    if(numerics.pressureDifferenceStepPa!==undefined&&!positive(numerics.pressureDifferenceStepPa))
      throw new DomainError('Pressure-drop derivative interval must be finite and positive');
    if(numerics.pressureDifferenceCoordinates!==undefined&&typeof numerics.pressureDifferenceCoordinates!=='boolean')
      throw new DomainError('Pressure-drop coordinate option must be boolean');
    if(initial.valveOpening!==undefined&&(!Number.isFinite(initial.valveOpening)||initial.valveOpening<0||initial.valveOpening>1))
      throw new DomainError('Initial EEV opening must be finite in [0,1]');
    for (let j=0;j<3;j++) {
      this.outdoorIndices.push(this.definitions.length);
      this.definitions.push({id:`outdoor:${j}`,volume:g.outdoorCoilVolumeM3/3,pressureIndex:0,coil:'outdoor',ua:g.outdoorConductanceWK/3});
    }
    for (const room of g.rooms) {
      if (!room.id || room.id==='outdoor' || ![room.coilVolumeM3,room.refrigerantConductanceWK,room.gasInsideDiameterM,
        room.smallInsideDiameterM,room.maximumValveAreaM2].every(positive) || !positive(room.lineLengthM))
        throw new DomainError('Charge model requires positive physical line geometry even with idealized transport');
      const indices: number[]=[];
      const add=(id:string,volume:number,coil?:string,ua=0)=>{indices.push(this.definitions.length);this.definitions.push({id,volume,pressureIndex:1,coil,ua});};
      add(`${room.id}:gas`,Math.PI*room.gasInsideDiameterM**2*room.lineLengthM/4);
      for(let j=0;j<3;j++)add(`${room.id}:coil:${j}`,room.coilVolumeM3/3,room.id,room.refrigerantConductanceWK/3);
      add(`${room.id}:small`,Math.PI*room.smallInsideDiameterM**2*room.lineLengthM/4);
      this.roomIndices.push(indices);
    }
    this.accumulatorIndex=this.definitions.length;
    this.definitions.push({id:'accumulator',volume:g.accumulatorVolumeM3,pressureIndex:2,ua:0});
    this.flowOffset=3+this.definitions.length;
    const volume=this.definitions.reduce((s,c)=>s+c.volume,0),rho=initial.massKg/volume,T=initial.fluidTemperatureC+273.15;
    // Computed P/U force a real public EOS flash; T/D are only initialization inputs.
    const p=properties.prop('P','T',T,'D',rho),u=properties.prop('U','T',T,'D',rho),h=u+p/rho;
    properties.ph(p,h);
    const variables=[p,p,p,...this.definitions.map(()=>h),...Array(2+5*g.rooms.length).fill(0)];
    const cells=this.states(variables);
    this.current={timeSeconds:0,orientation:initial.orientation??'heating',variables,openings:g.rooms.map(()=>initial.valveOpening??.65),compressorAdmission:this.vaporFraction(cells[this.accumulatorIndex].state)>=.04,initialMassKg:cells.reduce((s,c)=>s+c.massKg,0),
      initialEnergyJ:cells.reduce((s,c)=>s+c.internalEnergyJ,0),leakedMassKg:0,leakedEnthalpyJ:0,compressorWorkJ:0,coilHeatJ:0,cells};
  }

  snapshot(): ChargeSnapshot { const copy=deepFreeze(structuredClone(this.current));this.snapshots.add(copy);return copy; }
  restore(snapshot: ChargeSnapshot): void {
    if(!this.snapshots.has(snapshot))throw new DomainError('Restore requires an unchanged snapshot issued by this circuit');
    this.current=structuredClone(snapshot);this.revision++;
  }
  private states(z:number[]):ChargeCell[] {
    return this.definitions.map((c,j)=>{
      const state=this.properties.ph(z[c.pressureIndex],z[3+j]),mass=state.densityKgm3*c.volume;
      return {id:c.id,volumeM3:c.volume,group:c.pressureIndex===0?'outdoor':c.pressureIndex===1?'indoor':'accumulator',
        massKg:mass,internalEnergyJ:mass*state.hJkg-state.pPa*c.volume,state};
    });
  }
  private vaporFraction(state:RefrigerantState):number {
    if(state.qualityMass===null)return state.phase==='vapor'?1:0;
    const x=state.qualityMass,rv=this.properties.prop('D','P',state.pPa,'Q',1),rl=this.properties.prop('D','P',state.pPa,'Q',0);
    return (x/rv)/(x/rv+(1-x)/rl);
  }
  private storageDerivatives(cell:ChargeCell,homogeneousEndpoint=false):{massP:number;massH:number;energyP:number;energyH:number;temperatureP:number;temperatureH:number} {
    const s=cell.state,p=s.pPa,h=s.hJkg,rho=s.densityKgm3;
    let rhoP:number,rhoH:number,temperatureP:number,temperatureH:number;
    if(s.qualityMass===null||homogeneousEndpoint){
      const endpoint=homogeneousEndpoint&&(s.qualityMass===0||s.qualityMass===1);
      rhoP=this.properties.prop('d(Dmass)/d(P)|Hmass','P',p,endpoint?'Q':'H',endpoint?s.qualityMass!:h);
      rhoH=this.properties.prop('d(Dmass)/d(Hmass)|P','P',p,endpoint?'Q':'H',endpoint?s.qualityMass!:h);
      temperatureP=this.properties.prop('d(T)/d(P)|Hmass','P',p,endpoint?'Q':'H',endpoint?s.qualityMass!:h);
      temperatureH=this.properties.prop('d(T)/d(Hmass)|P','P',p,endpoint?'Q':'H',endpoint?s.qualityMass!:h);
    }else{
      // General single-phase derivative strings are undefined inside coexistence.
      // Differentiate the pure-fluid equilibrium specific-volume lever rule,
      // using only valid Q=0/1 derivatives along the saturation curves.
      const sat=this.properties.saturation(p),x=s.qualityMass;
      const rl=this.properties.prop('D','P',p,'Q',0),rv=this.properties.prop('D','P',p,'Q',1);
      const rlp=this.properties.prop('d(Dmass)/d(P)|sigma','P',p,'Q',0);
      const rvp=this.properties.prop('d(Dmass)/d(P)|sigma','P',p,'Q',1);
      const hlp=this.properties.prop('d(Hmass)/d(P)|sigma','P',p,'Q',0);
      const hvp=this.properties.prop('d(Hmass)/d(P)|sigma','P',p,'Q',1);
      const latent=sat.vaporH-sat.liquidH,dv=1/rv-1/rl;
      const xp=(-hlp-x*(hvp-hlp))/latent;
      rhoP=-(rho**2)*((1-x)*(-rlp/rl**2)+x*(-rvp/rv**2)+xp*dv);
      rhoH=-(rho**2)*dv/latent;
      temperatureP=this.properties.prop('d(T)/d(P)|sigma','P',p,'Q',0);temperatureH=0;
    }
    return {massP:cell.volumeM3*rhoP,massH:cell.volumeM3*rhoH,
      energyP:cell.volumeM3*(h*rhoP-1),energyH:cell.volumeM3*(rho+h*rhoH),temperatureP,temperatureH};
  }
  /** Homogeneous-equilibrium isentropic throat with downstream dissipation. */
  private nozzle(up:RefrigerantState,downPa:number,area:number,coefficient=this.geometry.dischargeCoefficient,passageLengthM=this.geometry.valvePassageLengthM??.005):number {
    if(area===0 || downPa>=up.pPa)return 0;
    if(!(downPa>50000))throw new DomainError('Nozzle downstream outside R32 domain');
    // Finite equivalent circular passage: laminar resistance plus the HEM
    // throat's inertial loss. Wet viscosity is a declared arithmetic mass-
    // quality surrogate, not an empirically validated two-phase correlation.
    const x=up.qualityMass;
    const mu=x===null?this.properties.prop('V','P',up.pPa,'H',up.hJkg):
      (1-x)*this.properties.prop('V','P',up.pPa,'Q',0)+x*this.properties.prop('V','P',up.pPa,'Q',1);
    const resistance=8*Math.PI*mu*passageLengthM/(up.densityKgm3*area**2);
    const corrected=(flux:number,drop:number)=>{
      const ideal=coefficient*area*flux;if(!(ideal>0&&drop>0))return 0;
      const inertial=drop/ideal**2;
      return 2*drop/(resistance+Math.sqrt(resistance**2+4*inertial*drop));
    };
    // A PH flash may return S/rho at native h different from the supplied
    // conservative H coordinate. Use dh|s=v dp, never subtract those references.
    const key=`${up.pPa}:${up.hJkg}:${up.entropyJkgK}:${up.densityKgm3}:${downPa}:${area}:${coefficient}:${passageLengthM}`;
    const cached=this.nozzleFluxCache.get(key);if(cached!==undefined)return cached.flowKgs;
    const knots:number[]=[];
    // This pure R32 domain has monotonically increasing saturated-liquid S and
    // decreasing saturated-vapor S. Partition the isentrope at its phase kinks.
    for(const quality of [0,1]){
      let a=downPa,b=up.pPa,fa=this.properties.prop('S','P',a,'Q',quality)-up.entropyJkgK;
      const fb=this.properties.prop('S','P',b,'Q',quality)-up.entropyJkgK;
      if(fa*fb<0){
        for(let i=0;i<48&&b-a>2e-8;i++){
          const mid=(a+b)/2,fm=this.properties.prop('S','P',mid,'Q',quality)-up.entropyJkgK;
          if(fa*fm<=0)b=mid;else{a=mid;fa=fm;}
        }
        knots.push((a+b)/2);
      }
    }
    knots.sort((a,b)=>a-b);
    let densityCalls=0;
    const density=(pressure:number)=>{
      if(++densityCalls>65536)throw new DomainError('Isentropic nozzle density work budget exceeded');
      const value=this.properties.prop('D','P',pressure,'S',up.entropyJkgK);
      if(!(Number.isFinite(value)&&value>0))throw new DomainError('Invalid isentropic nozzle density');
      return value;
    };
    const maximum=(flowBudget:number,refinements:number)=>{
      const flux=(pressure:number)=>{
        if(pressure===up.pPa)return 0;
        if(!(pressure>=downPa&&pressure<up.pPa))throw new DomainError('Nozzle throat pressure outside bracket');
        const rho=density(pressure),drop=up.pPa-pressure;
        const budget=(integral:number)=>{
          const ideal=coefficient*area*rho*Math.sqrt(2*integral),m=corrected(rho*Math.sqrt(2*integral),drop);
          const sensitivity=2*drop*m/ideal**2,beta=sensitivity/(resistance+sensitivity);
          const limit=Math.min(1e-8+1e-9*integral,2*integral*flowBudget/Math.max(m*beta,1e-30));
          if(!(Number.isFinite(integral)&&integral>0&&Number.isFinite(limit)&&limit>0))
            throw new DomainError('Invalid isentropic integral error budget');
          return limit;
        };
        const integral=isentropicVolumeIntegral(pressure,up.pPa,knots,density,budget);
        return rho*Math.sqrt(2*integral);
      };
      // Assign exact bracket endpoints: exponentiation can overshoot by one ULP.
      const pressures=Array.from({length:13},(_,i)=>i===0?downPa:i===12?up.pPa:downPa*(up.pPa/downPa)**(i/12));
      const values=pressures.map(flux),k=values.indexOf(Math.max(...values));
      let a=pressures[Math.max(0,k-1)],b=pressures[Math.min(12,k+1)],best=values[k],bestP=pressures[k];
      const r=(Math.sqrt(5)-1)/2;let c=b-r*(b-a),d=a+r*(b-a),gc=flux(c),gd=flux(d);
      for(let i=0;i<refinements;i++){
        if(gc>gd){b=d;d=c;gd=gc;c=b-r*(b-a);gc=flux(c);}
        else{a=c;c=d;gc=gd;d=a+r*(b-a);gd=flux(d);}
      }
      if(gc>best){best=gc;bestP=c;}if(gd>best){best=gd;bestP=d;}
      return {flux:best,throatPa:bestP,flowKgs:corrected(best,up.pPa-bestP)};
    };
    const coarse=maximum(4e-11,32),fine=maximum(4e-12,48);
    // The whole corrected flow is checked: scalar integral error alone does
    // not bound movement of a flat throat maximum entering viscous correction.
    if(!(Number.isFinite(fine.flowKgs)&&fine.flowKgs>=0)||Math.abs(fine.flowKgs-coarse.flowKgs)>4e-11)
      throw new DomainError('Isentropic nozzle corrected flow did not converge');
    if(this.nozzleFluxCache.size>=10000){let removed=0;for(const oldest of this.nozzleFluxCache.keys()){
      this.nozzleFluxCache.delete(oldest);if(++removed===2000)break;
    }}
    this.nozzleFluxCache.set(key,fine);return fine.flowKgs;
  }

  private evaluation(z:number[],boundary:ChargeBoundary,openings:number[],admitted:boolean,
    preparedCells?:ChargeCell[]):Evaluation {
    const operation={...this.geometry,...boundary.operating};
    // An isolated coordinate pilot can supply independently flashed physical
    // cells to the same face/heat laws. The production PH route stays unchanged.
    const cells=preparedCells??this.states(z),dm=cells.map(()=>0),dU=cells.map(()=>0),heat:Record<string,number>={},diagnostics:string[]=[];
    const acc=cells[this.accumulatorIndex],inletState=acc.state,heating=boundary.orientation==='heating',pD=z[heating?1:0];
    // Admission is a hybrid control state, held fixed during a nonlinear trial.
    // Trial wet pickup may approach the event from either side; the outer
    // integrator rejects/splits any active step crossing alpha=.02.
    let S=acc.state;
    if(admitted&&boundary.compressorSpeedRps>0){
      if(acc.state.phase==='liquid'||acc.state.qualityMass===0)throw new DomainError('Trial vapor pickup exhausted');
      S=acc.state.qualityMass!==null?this.properties.ph(acc.state.pPa,this.properties.prop('H','P',acc.state.pPa,'Q',1)):acc.state;
    }
    let mc=0,D:RefrigerantState|null=null;
    if(boundary.compressorSpeedRps>0 && admitted) {
      if(pD/S.pPa>operation.maximumPressureRatio)throw new DomainError('Charge compressor pressure ratio');
      // Generic positive-displacement free discharge during reversed pressure
      // ordering: transport upstream h without extracting expansion work. The
      // downstream pressure drop dissipates available pressure potential. This
      // ideal frictionless branch is not a manufacturer compressor map.
      const rise=pD>=S.pPa?this.properties.prop('H','P',pD,'S',S.entropyJkgK)-S.hJkg:0;
      if(rise < -.01)throw new DomainError('Charge compression enthalpy inversion');
      D=this.properties.ph(pD,S.hJkg+Math.max(0,rise)/operation.isentropicEfficiency);
      if(D.entropyJkgK<S.entropyJkgK-1e-6)throw new DomainError('Charge compressor transfer decreases entropy');
      if(pD<S.pPa)diagnostics.push('Generic ideal low-lift transfer; pressure potential dissipated, ideal shaft work zero, mechanical friction and no-load electrical draw excluded');
      if(D.temperatureC>operation.maximumDischargeC)throw new DomainError('Charge compressor discharge limit');
      mc=S.densityKgm3*operation.displacementM3rev*boundary.compressorSpeedRps*operation.volumetricEfficiency;
    } else if(boundary.compressorSpeedRps>0)diagnostics.push('Compressor protected against accumulator liquid carryover');
    const work=mc*((D?.hJkg??S.hJkg)-S.hJkg);
    const face=(a:number,b:number,m:number,hPositive?:number,hNegative?:number)=>{
      const h=m>=0?(hPositive??cells[a].state.hJkg):(hNegative??cells[b].state.hJkg);
      dm[a]-=m;dm[b]+=m;dU[a]-=m*h;dU[b]+=m*h;
    };
    face(this.outdoorIndices[0],this.outdoorIndices[1],z[this.flowOffset]);
    face(this.outdoorIndices[1],this.outdoorIndices[2],z[this.flowOffset+1]);
    const branches=this.roomIndices.map((indices,i)=>({indices,f:z.slice(this.flowOffset+2+5*i,this.flowOffset+7+5*i)}));
    // Indoor gas header has zero storage. Mix only actual entering streams.
    let incomingM=heating?mc:0,incomingH=heating?mc*(D?.hJkg??S.hJkg):0;
    for(const b of branches)if(b.f[0]<0){incomingM-=b.f[0];incomingH-=b.f[0]*cells[b.indices[0]].state.hJkg;}
    let feed=0;
    if(!heating && z[2]>z[1]){feed=-this.nozzle(inletState,z[1],this.geometry.accumulatorInletAreaM2,operation.dischargeCoefficient,this.geometry.accumulatorInletPassageLengthM??.1);incomingM-=feed;incomingH-=feed*inletState.hJkg;}
    const headerH=incomingM>1e-16?incomingH/incomingM:branches.reduce((s,b)=>s+cells[b.indices[0]].state.hJkg,0)/branches.length;
    const header=this.properties.ph(z[1],headerH);
    if(heating){const source=cells[this.outdoorIndices[0]].state;
      feed=source.pPa>=z[2]?this.nozzle(source,z[2],this.geometry.accumulatorInletAreaM2,operation.dischargeCoefficient,this.geometry.accumulatorInletPassageLengthM??.1):-this.nozzle(inletState,source.pPa,this.geometry.accumulatorInletAreaM2,operation.dischargeCoefficient,this.geometry.accumulatorInletPassageLengthM??.1);
      face(this.outdoorIndices[0],this.accumulatorIndex,feed,source.hJkg,inletState.hJkg);
    }else{
      if(z[1]>=z[2])feed=this.nozzle(header,z[2],this.geometry.accumulatorInletAreaM2,operation.dischargeCoefficient,this.geometry.accumulatorInletPassageLengthM??.1);
      dm[this.accumulatorIndex]+=feed;dU[this.accumulatorIndex]+=feed*(feed>=0?headerH:inletState.hJkg);
    }
    dm[this.accumulatorIndex]-=mc;dU[this.accumulatorIndex]-=mc*S.hJkg;
    if(!heating){dm[this.outdoorIndices[0]]+=mc;dU[this.outdoorIndices[0]]+=mc*(D?.hJkg??S.hJkg);}
    let headerMass=(heating?mc:-feed);
    const valves:number[]=[];
    for(let i=0;i<branches.length;i++) {
      const b=branches[i];headerMass-=b.f[0];
      dm[b.indices[0]]+=b.f[0];dU[b.indices[0]]+=b.f[0]*(b.f[0]>=0?headerH:cells[b.indices[0]].state.hJkg);
      for(let j=1;j<5;j++)face(b.indices[j-1],b.indices[j],b.f[j]);
      const small=cells[b.indices[4]].state,out=cells[this.outdoorIndices[2]].state,area=this.geometry.rooms[i].maximumValveAreaM2*openings[i];
      const valve=small.pPa>=out.pPa?this.nozzle(small,out.pPa,area,operation.dischargeCoefficient):-this.nozzle(out,small.pPa,area,operation.dischargeCoefficient);
      face(b.indices[4],this.outdoorIndices[2],valve);valves.push(valve);
    }
    for(let j=0;j<cells.length;j++){
      const c=this.definitions[j];if(!c.coil)continue;
      const metalC=c.coil==='outdoor'?boundary.outdoorMetalC:boundary.indoorMetalCById[c.coil];
      const ua=c.coil==='outdoor'?operation.outdoorConductanceWK/3:
        (boundary.operating?.indoorConductanceWKById?.[c.coil]??this.geometry.rooms.find(r=>r.id===c.coil)!.refrigerantConductanceWK)/3;
      const q=ua*(metalC-cells[j].state.temperatureC);dU[j]+=q;heat[c.coil]=(heat[c.coil]??0)+q;
    }
    if(boundary.leak && boundary.leak.rateKgs>0){const j=cells.findIndex(c=>c.id===boundary.leak!.physicalCellId);
      if(j<0)throw new DomainError('Unknown physical leak cell');if(cells[j].state.pPa<=(boundary.ambientPressurePa??101325))throw new DomainError('Leak would require air-ingress model');
      dm[j]-=boundary.leak.rateKgs;dU[j]-=boundary.leak.rateKgs*cells[j].state.hJkg;
    }
    return {cells,dm,dU,heat,headerMass,work,mc,valves,suction:admitted?S:acc.state,discharge:D,diagnostics,accumulatorFeedKgs:feed,
      accumulatorInletOutflowState:inletState,indoorGasHeader:incomingM>1e-12?header:null,lowLiftTransfer:mc>0&&pD<S.pPa};
  }

  prepareStep(dt:number,boundary:ChargeBoundary):ChargeCandidate {
    if(!(dt>0&&dt<=.25))throw new DomainError('Charge outer step must be within 0…0.25s');
    const original=this.current,heat:Record<string,number>={},reasons=new Set<string>();let remaining=dt,step=dt,iterations=0,count=0;
    let work=0,leakM=0,leakH=0,lowLift=false,last:ChargeCandidate|undefined,attempts=0,lastFailure='';
    try {
      while(remaining>1e-13){
        if(count>=(this.numerics.maximumSubsteps??128)||attempts>=(this.numerics.maximumAttempts??256))
          throw new ChargeWorkBudgetError(dt,dt-remaining,attempts,count,lastFailure);
        const alpha=this.vaporFraction(this.current.cells[this.accumulatorIndex].state);
        // Generic carryover protection hysteresis. No inventory is changed.
        const admitted=this.current.compressorAdmission?alpha>.0200001:alpha>=.0399999;
        if(admitted!==this.current.compressorAdmission)reasons.add(admitted?
          'Generic accumulator protection restores vapor admission at alpha >= 0.04 (event tolerance 1e-7)':
          'Generic accumulator protection holds compressor at alpha <= 0.02 (event tolerance 1e-7)');
        this.current={...this.current,compressorAdmission:admitted};
        let candidate:ChargeCandidate;
        attempts++;
        try {candidate=this.prepareSingle(Math.min(step,remaining),boundary);}
        catch(error){lastFailure=String(error);step/=2;if(step<1e-5)throw error;continue;}
        const nextAlpha=this.vaporFraction(candidate.snapshot.cells[this.accumulatorIndex].state);
        if(admitted&&boundary.compressorSpeedRps>0&&nextAlpha<.02){
          // Locate the headspace event without accepting a submerged pickup.
          // Secant shortening is bounded; M/U remain the previous accepted state.
          const fraction=Math.max(.05,Math.min(.95,(alpha-.02)/(alpha-nextAlpha)));
          step=Math.min(step,remaining)*fraction;
          if(step<1e-8)throw new DomainError('Accumulator admission event could not be resolved');
          continue;
        }
        if(!admitted&&boundary.compressorSpeedRps>0&&alpha<.0399999&&nextAlpha>.04){
          const fraction=Math.max(.05,Math.min(.95,(.04-alpha)/(nextAlpha-alpha)));
          step=Math.min(step,remaining)*fraction;
          if(step<1e-8)throw new DomainError('Accumulator recovery event could not be resolved');
          continue;
        }
        const advanced=candidate.snapshot.timeSeconds-this.current.timeSeconds;
        this.current=candidate.snapshot;last=candidate;remaining-=advanced;count++;iterations+=candidate.nonlinearIterations;
        for(const [id,q] of Object.entries(candidate.integratedCoilHeatJ))heat[id]=(heat[id]??0)+q;
        work+=candidate.compressorWorkJ;leakM+=candidate.leakMassKg;leakH+=candidate.leakEnthalpyJ;
        lowLift ||= candidate.lowLiftTransfer;
        for(const reason of candidate.diagnostics)reasons.add(reason);
        step=Math.min(step*2,remaining);
      }
      if(!last)throw new DomainError('Charge step made no progress');
      const candidate:ChargeCandidate={...last,acceptedSeconds:dt,integratedCoilHeatJ:heat,compressorWorkJ:work,leakMassKg:leakM,leakEnthalpyJ:leakH,lowLiftTransfer:lowLift,
        nonlinearIterations:iterations,diagnostics:[...reasons,...(count>1?[`Fluid integration accepted ${count} conservative substeps`]:[])]};
      deepFreeze(candidate);this.candidates.set(candidate,this.revision);return candidate;
    } finally {this.current=original;}
  }
  private prepareSingle(dt:number,boundary:ChargeBoundary,previous:ChargeSnapshot=this.current):ChargeCandidate {
    for(const [key,value] of Object.entries(boundary.operating??{})){
      const values=typeof value==='object'?Object.values(value):[value];
      if(values.some(v=>!Number.isFinite(v)||v<=0||(key.endsWith('Efficiency')&&v>1)||(key==='dischargeCoefficient'&&v>1)))
        throw new DomainError('Invalid charge operating coefficient');
    }
    if(!(dt>0&&dt<=.25) || !Number.isFinite(boundary.compressorSpeedRps) || boundary.compressorSpeedRps<0 ||
      !Number.isFinite(boundary.outdoorMetalC) || this.geometry.rooms.some(r=>!Number.isFinite(boundary.indoorMetalCById[r.id])) ||
      (boundary.ambientPressurePa!==undefined&&(!Number.isFinite(boundary.ambientPressurePa)||boundary.ambientPressurePa<70000||boundary.ambientPressurePa>110000)) ||
      boundary.enabledRoomIds.some(id=>!this.geometry.rooms.some(r=>r.id===id)) ||
      (boundary.leak && (!Number.isFinite(boundary.leak.rateKgs)||boundary.leak.rateKgs<0)))throw new DomainError('Invalid charge step boundary');
    const openings=this.geometry.rooms.map((r,i)=>{
      if(!boundary.enabledRoomIds.includes(r.id))return 0;
      // Generic carryover safety closes the liquid-feed actuator while the
      // actual pickup latch is held. This precedes positive-command preposition;
      // an operator speed request cannot reopen a submerged pickup's EEV.
      if(!previous.compressorAdmission)return Math.max(0,previous.openings[i]-.1*dt);
      const sensor=previous.cells[boundary.orientation==='heating'?this.outdoorIndices[0]:this.roomIndices[i][1]].state;
      const sat=this.properties.saturation(sensor.pPa),sh=sensor.phase==='vapor'?Math.max(0,sensor.temperatureC-sat.temperatureC):0;
      // Generic integral valve servo, antiwindup by bounded actuator state; .1/s slew.
      if(previous.openings[i]===0 && boundary.compressorSpeedRps>0)return Math.min(.1,.1*dt);
      const change=Math.max(-.1*dt,Math.min(.1*dt,.005*dt*(sh-(boundary.operating?.superheatTargetK??this.geometry.superheatTargetK))));
      return Math.max(0,Math.min(1,previous.openings[i]+change));
    });
    const pressureDifference=this.numerics.pressureDifferenceCoordinates??true;
    const sourcePressure=boundary.orientation==='heating'?0:1;
    const size=previous.variables.length,scale=previous.variables.map((_,i)=>i===2&&pressureDifference?1:i<3?1e6:i<this.flowOffset?5e5:.01);
    const residual=(x:number[])=>{
      const z=x.map((v,i)=>v*scale[i]);
      // Solver coordinates may use the accumulator drop, while all physical
      // states and public snapshots keep their fixed absolute pressures.
      if(pressureDifference)z[2]+=z[sourcePressure];
      const r=this.evaluation(z,boundary,openings,previous.compressorAdmission),f:number[]=[];
      for(let j=0;j<r.cells.length;j++)f.push((r.cells[j].massKg-previous.cells[j].massKg-dt*r.dm[j])/.1);
      for(let j=0;j<r.cells.length;j++)f.push((r.cells[j].internalEnergyJ-previous.cells[j].internalEnergyJ-dt*r.dU[j])/50000);
      f.push(dt*r.headerMass/.1);
      const local=[...f];
      const leakedMass=dt*(boundary.leak?.rateKgs??0);
      const leakedH=leakedMass*(boundary.leak?r.cells.find(c=>c.id===boundary.leak!.physicalCellId)!.state.hJkg:0);
      const massChange=r.cells.reduce((sum,c,j)=>sum+(c.massKg-previous.cells[j].massKg),0);
      const energyChange=r.cells.reduce((sum,c,j)=>sum+(c.internalEnergyJ-previous.cells[j].internalEnergyJ),0);
      // Replace the accumulator rows by aggregate balances, retaining the
      // original rows for independent acceptance. The sum of local balances
      // differs by the zero-storage header continuity row (and h_header times
      // that row for energy), so this transformation has the same zero set.
      const aggregateMass=massChange+leakedMass;
      const aggregateEnergy=energyChange-dt*(r.work+Object.values(r.heat).reduce((a,b)=>a+b,0))+leakedH;
      f[this.accumulatorIndex]=aggregateMass/.1;
      f[r.cells.length+this.accumulatorIndex]=aggregateEnergy/50000;
      return {z,r,f,local,aggregateMass,aggregateEnergy};
    };
    let x=previous.variables.map((v,i)=>v/scale[i]);
    if(pressureDifference)x[2]-=previous.variables[sourcePressure]/scale[2];
    // A zero-lift equilibrium is a nonsmooth nozzle point. This is only a Newton
    // initial guess; all balances still use the unaltered previous physical M/U.
    let cur=residual(x),iterations=0;
    // Preserve a physically exact passive equilibrium. A requested speed does
    // not imply compressor throughput while the pickup protection is active.
    if(Math.max(...previous.variables.slice(0,3))-Math.min(...previous.variables.slice(0,3))<1&&
      boundary.compressorSpeedRps>0&&previous.compressorAdmission&&Math.max(...cur.f.map(Math.abs))>1e-12){
      const destination=boundary.orientation==='heating'?1:0,source=1-destination;
      x[source]-=100/scale[source];x[destination]+=100/scale[destination];
      x[2]-=(pressureDifference?100:200)/scale[2];cur=residual(x);
    }
    const norm=(f:number[])=>Math.max(...f.map(Math.abs));
    const merit=(f:number[])=>f.reduce((sum,v)=>sum+v*v,0);
    // EOS flashes and PH derivatives have finite precision. Resolve physical
    // balances to explicit absolute/relative budgets, rather than requiring a
    // uniform scaled residual smaller than a microjoule in every fluid cell.
    // These are solver acceptance tolerances, never corrections to stored M/U.
    const nCells=previous.cells.length;
    const massTolerances=previous.cells.map(c=>1e-10+1e-10*c.massKg);
    const tolerances=(trial:typeof cur)=>massTolerances.concat(previous.cells.map((c,j)=>
      // U=M*h-p*V: native PH density precision already admitted by M_tol
      // contributes |h|*M_tol to stored-energy precision. Keep the aggregate
      // energy limit independent and tighter; this never modifies M or U.
      1e-5+1e-9*Math.abs(c.internalEnergyJ)+Math.max(Math.abs(c.state.hJkg),Math.abs(trial.r.cells[j].state.hJkg))*massTolerances[j]),[1e-10]);
    const physicalResidual=(f:number[],i:number)=>f[i]*(i<nCells||i===2*nCells?.1:50000);
    const balanceNorm=(trial:typeof cur)=>{const limits=tolerances(trial);return Math.max(...trial.local.map((v,i)=>Math.abs(physicalResidual(trial.local,i))/limits[i]));};
    const acceptanceNorm=(trial:typeof cur)=>Math.max(balanceNorm(trial),Math.abs(trial.aggregateMass)/5e-11,Math.abs(trial.aggregateEnergy)/1e-5);
    const failureDetail=(trial:typeof cur)=>{
      const f=trial.local,limits=tolerances(trial);
      let worst=0;for(let i=1;i<f.length;i++)if(Math.abs(physicalResidual(f,i))/limits[i]>Math.abs(physicalResidual(f,worst))/limits[worst])worst=i;
      const label=worst<nCells?`mass ${previous.cells[worst].id}`:worst<2*nCells?`energy ${previous.cells[worst-nCells].id}`:'header mass';
      return `${label} residual ${physicalResidual(f,worst)} ${worst<nCells||worst===2*nCells?'kg':'J'}, tolerance ${limits[worst]}, normalized ${balanceNorm(trial)}`;
    };
    for(;iterations<20&&acceptanceNorm(cur)>1;iterations++) {
      const J=Array.from({length:size},()=>Array<number>(size));
      const storage=(this.numerics.analyticStorageJacobian??true)?cur.r.cells.map(c=>this.storageDerivatives(c)):undefined;
      for(let j=0;j<size;j++){
        const z=[...x];let eps=(j<3?(this.numerics.pressureDerivativeRelativeStep??1e-9):1e-6)*Math.max(1,Math.abs(x[j]));
        if(pressureDifference&&j===2){
          const gap=cur.z[2]-cur.z[sourcePressure];
          eps=Math.max(this.numerics.pressureDifferenceStepPa??1e-4,eps);
          if(gap!==0)eps=Math.min(eps,Math.max(1e-6,.2*Math.abs(gap)));
          // Probe away from a nonzero upwind switch, including gaps smaller
          // than the representable derivative floor. At zero use one side.
          if(gap<0)eps=-eps;
        }
        if(pressureDifference&&(j===0||j===1)){
          const gap=cur.z[j]-cur.z[1-j];
          if(gap!==0)eps=Math.min(eps,Math.max(1e-6,.2*Math.abs(gap))/scale[j]);
          if(gap<0)eps=-eps;
        }
        // Single-phase PH flashes invert temperature numerically. Millipascal
        // pressure trials can fall beneath that inversion's density precision;
        // use a larger local derivative interval once that group contains a
        // single-phase cell. The caller's decade-sensitivity factor still applies.
        if(!storage&&!pressureDifference&&j<3&&cur.r.cells.some((c,k)=>this.definitions[k].pressureIndex===j&&c.state.phase!=='two-phase'))eps*=100;
        if(j>=3&&j<this.flowOffset){
          // PH storage derivatives change sharply at bubble/dew endpoints. Keep
          // a local Jacobian trial in the current regime rather than averaging
          // liquid compressibility with the two-phase density slope.
          const state=cur.r.cells[j-3].state,sat=this.properties.saturation(state.pPa);
          const dl=state.hJkg-sat.liquidH,dv=state.hJkg-sat.vaporH;
          const near=Math.abs(dl)<Math.abs(dv)?dl:dv;
          const sizeH=Math.min(eps*scale[j],Math.max(5e-6,.2*Math.abs(near)));
          eps=(near<0?-1:1)*sizeH/scale[j];
        }
        z[j]+=eps;
        let delta=eps,trial:typeof cur;
        try{trial=residual(z);}catch{z[j]=x[j]-eps;delta=-eps;trial=residual(z);}
        for(let i=0;i<size;i++)J[i][j]=(trial.f[i]-cur.f[i])/delta;
        if(storage&&j<this.flowOffset){
          let aggregateMassCorrection=0,aggregateEnergyCorrection=0;
          for(let k=0;k<nCells;k++){
            const applies=j<3?(this.definitions[k].pressureIndex===j||
              (pressureDifference&&j===sourcePressure&&this.definitions[k].pressureIndex===2)):k===j-3;
            const quality=cur.r.cells[k].state.qualityMass;
            // At an exact bubble/dew endpoint choose the one-sided storage
            // derivative of the actual finite-difference trial, for pressure
            // as well as enthalpy columns. Physical state remains unchanged.
            const derivative=applies&&(quality===0||quality===1)&&trial.r.cells[k].state.qualityMass===null?
              this.storageDerivatives(cur.r.cells[k],true):storage[k];
            const exactM=applies?(j<3?derivative.massP:derivative.massH)*scale[j]:0;
            const exactU=applies?(j<3?derivative.energyP:derivative.energyH)*scale[j]:0;
            const correctionM=exactM-(trial.r.cells[k].massKg-cur.r.cells[k].massKg)/delta;
            let correctionU=exactU-(trial.r.cells[k].internalEnergyJ-cur.r.cells[k].internalEnergyJ)/delta;
            const coil=this.definitions[k].coil;
            if(coil){
              const operation={...this.geometry,...boundary.operating};
              const ua=coil==='outdoor'?operation.outdoorConductanceWK/3:
                (boundary.operating?.indoorConductanceWKById?.[coil]??this.geometry.rooms.find(room=>room.id===coil)!.refrigerantConductanceWK)/3;
              const exactT=applies?(j<3?derivative.temperatureP:derivative.temperatureH)*scale[j]:0;
              const finiteT=(trial.r.cells[k].state.temperatureC-cur.r.cells[k].state.temperatureC)/delta;
              // Energy residual contains -dt*UA*(metal-T). Correct this local
              // derivative too: PH inversion noise must not force a larger
              // pressure interval than the near-zero finite nozzle permits.
              correctionU+=dt*ua*(exactT-finiteT);
            }
            if(k!==this.accumulatorIndex){J[k][j]+=correctionM/.1;J[nCells+k][j]+=correctionU/50000;}
            aggregateMassCorrection+=correctionM;aggregateEnergyCorrection+=correctionU;
          }
          J[this.accumulatorIndex][j]+=aggregateMassCorrection/.1;
          J[nCells+this.accumulatorIndex][j]+=aggregateEnergyCorrection/50000;
        }
      }
      const d=solveLinear(J,cur.f.map(v=>-v));let accepted=false;
      let lastTrialError='';
      for(let a=1;a>=1/4096;a/=2){try{const z=x.map((v,i)=>v+a*d[i]),next=residual(z);
        if(merit(next.f)<merit(cur.f)){x=z;cur=next;accepted=true;break;}}catch(error){lastTrialError=String(error);}}
      if(!accepted)throw new DomainError(`Charge DAE Newton line search failed at iteration ${iterations}, residual ${norm(cur.f)}, ${failureDetail(cur)}, aggregate M ${cur.aggregateMass} kg/U ${cur.aggregateEnergy} J, pressures ${cur.z.slice(0,3).join(',')}, last rejected trial ${lastTrialError||'did not decrease residual'}`);
    }
    if(acceptanceNorm(cur)>1)throw new DomainError(`Charge DAE residual ${norm(cur.f)}, ${failureDetail(cur)}, aggregate M ${cur.aggregateMass} kg/U ${cur.aggregateEnergy} J`);
    const r=cur.r,coilHeat=Object.fromEntries(Object.entries(r.heat).map(([k,q])=>[k,q*dt]));
    const leakMass=(boundary.leak?.rateKgs??0)*dt;
    const leakCell=boundary.leak?r.cells.find(c=>c.id===boundary.leak!.physicalCellId):undefined;
    const leakH=leakMass*(leakCell?.state.hJkg??0),work=r.work*dt,heatJ=Object.values(coilHeat).reduce((a,b)=>a+b,0);
    const snapshot:ChargeSnapshot={...previous,timeSeconds:previous.timeSeconds+dt,orientation:boundary.orientation,variables:cur.z,openings,
      leakedMassKg:previous.leakedMassKg+leakMass,leakedEnthalpyJ:previous.leakedEnthalpyJ+leakH,
      compressorWorkJ:previous.compressorWorkJ+work,coilHeatJ:previous.coilHeatJ+heatJ,cells:r.cells};
    const outGas=r.cells[this.outdoorIndices[0]].state,outSmall=r.cells[this.outdoorIndices[2]].state;
    const outGasFlow=boundary.orientation==='heating'?-r.accumulatorFeedKgs:r.mc;
    const outSmallFlow=r.valves.reduce((a,b)=>a+b,0);
    const incomingSmallM=r.valves.reduce((sum,m)=>sum+Math.max(0,m),0);
    const inletSmallH=incomingSmallM>0?r.valves.reduce((sum,m,i)=>sum+Math.max(0,m)*r.cells[this.roomIndices[i][4]].state.hJkg,0)/incomingSmallM:outSmall.hJkg;
    const coilPorts:ChargeCandidate['coilPorts']={outdoor:{
      gas:outGasFlow>0?(boundary.orientation==='heating'?this.properties.ph(outGas.pPa,r.accumulatorInletOutflowState.hJkg):(r.discharge??outGas)):outGas,
      small:outSmallFlow>0?this.properties.ph(outSmall.pPa,inletSmallH):outSmall,
      gasCellState:outGas,smallCellState:outSmall,gasFaceMassFlowKgs:outGasFlow,smallFaceMassFlowKgs:outSmallFlow,flowFromGasKgs:outGasFlow}};
    const fieldPorts:ChargeCandidate['fieldPorts']={};
    for(let i=0;i<this.geometry.rooms.length;i++){
      const indices=this.roomIndices[i],gasCell=r.cells[indices[1]].state,smallCell=r.cells[indices[3]].state;
      const gasFlow=cur.z[this.flowOffset+3+5*i],smallFlow=-cur.z[this.flowOffset+6+5*i];
      coilPorts[this.geometry.rooms[i].id]={gas:gasFlow>0?r.cells[indices[0]].state:gasCell,
        small:smallFlow>0?r.cells[indices[4]].state:smallCell,gasCellState:gasCell,smallCellState:smallCell,
        gasFaceMassFlowKgs:gasFlow,smallFaceMassFlowKgs:smallFlow,flowFromGasKgs:gasFlow};
      const headerFlow=cur.z[this.flowOffset+2+5*i];
      fieldPorts[this.geometry.rooms[i].id]={gasHeader:Math.abs(headerFlow)>1e-12?
        (headerFlow>0?r.indoorGasHeader:r.cells[indices[0]].state):null,
        gasHeaderMassFlowKgs:headerFlow,gasLine:r.cells[indices[0]].state,smallLine:r.cells[indices[4]].state,valveMassFlowKgs:r.valves[i]};
    }
    const candidate:ChargeCandidate={acceptedSeconds:dt,snapshot,integratedCoilHeatJ:coilHeat,compressorWorkJ:work,leakMassKg:leakMass,leakEnthalpyJ:leakH,
      lowLiftTransfer:r.lowLiftTransfer,
      compressorMassFlowKgs:r.mc,valveMassFlowsKgs:Object.fromEntries(this.geometry.rooms.map((room,i)=>[room.id,r.valves[i]])),
      compressorSuction:r.suction,compressorDischarge:r.discharge,
      headers:{indoorGas:r.indoorGasHeader,outdoorSmall:Math.abs(outSmallFlow)>1e-12?
        (outSmallFlow>0?this.properties.ph(outSmall.pPa,inletSmallH):outSmall):null},
      fieldPorts,
      coilPorts,
      massResidualKg:r.cells.reduce((s,c)=>s+c.massKg,0)-snapshot.initialMassKg+snapshot.leakedMassKg,
      energyResidualJ:r.cells.reduce((s,c)=>s+c.internalEnergyJ,0)-snapshot.initialEnergyJ-snapshot.compressorWorkJ-snapshot.coilHeatJ+snapshot.leakedEnthalpyJ,
      nonlinearIterations:iterations,diagnostics:r.diagnostics};
    if(Math.abs(candidate.massResidualKg)>1e-7||Math.abs(candidate.energyResidualJ)>.01)
      throw new DomainError('Charge cumulative mass/energy drift exceeded the numerical budget');
    deepFreeze(candidate);this.candidates.set(candidate,this.revision);return candidate;
  }
  commit(candidate:ChargeCandidate):void {
    if(this.candidates.get(candidate)!==this.revision)throw new DomainError('Stale/foreign charge candidate');
    this.current=structuredClone(candidate.snapshot);this.candidates.delete(candidate);this.revision++;
  }
}

const GAUSS_VOLUME_RULES=[
  {nodes:[-.8611363115940526,-.3399810435848563,.3399810435848563,.8611363115940526],
    weights:[.3478548451374538,.6521451548625461,.6521451548625461,.3478548451374538]},
  {nodes:[-.9602898564975363,-.7966664774136267,-.525532409916329,-.1834346424956498,
    .1834346424956498,.525532409916329,.7966664774136267,.9602898564975363],
    weights:[.1012285362903763,.2223810344533745,.3137066458778873,.362683783378362,
      .362683783378362,.3137066458778873,.2223810344533745,.1012285362903763]},
];

/** Bounded adaptive integral of real-EOS specific volume, with phase knots.
 * Order differences estimate quadrature error; they are not interval bounds. */
function isentropicVolumeIntegral(low:number,high:number,knots:number[],density:(p:number)=>number,
  budget:(integral:number)=>number):number {
  let calls=0;
  const integrate=(a:number,b:number,order:number)=>{
    const mid=(a+b)/2,half=(b-a)/2,rule=GAUSS_VOLUME_RULES[order];
    return half*rule.nodes.reduce((sum,node,i)=>{
      if(++calls>8192)throw new DomainError('Isentropic integral density work budget exceeded');
      return sum+rule.weights[i]/density(mid+half*node);
    },0);
  };
  const panel=(a:number,b:number,depth:number)=>({a,b,depth,coarse:integrate(a,b,0),fine:integrate(a,b,1)});
  const points=[low,...knots.filter(p=>p>low&&p<high),high];
  const panels=points.slice(0,-1).map((a,i)=>panel(a,points[i+1],0));
  let value=panels.reduce((sum,p)=>sum+p.fine,0);
  let error=panels.reduce((sum,p)=>sum+Math.abs(p.coarse-p.fine),0);
  while(error>budget(value)){
    let index=0;for(let i=1;i<panels.length;i++)
      if(Math.abs(panels[i].coarse-panels[i].fine)>Math.abs(panels[index].coarse-panels[index].fine))index=i;
    const prior=panels[index],mid=(prior.a+prior.b)/2;
    if(prior.depth>=16)throw new DomainError('Isentropic integral unresolved quadrature error');
    if(!(mid>prior.a&&mid<prior.b))throw new DomainError('Isentropic integral exhausted pressure precision');
    const left=panel(prior.a,mid,prior.depth+1),right=panel(mid,prior.b,prior.depth+1);
    panels.splice(index,1,left,right);
    value+=left.fine+right.fine-prior.fine;
    error=panels.reduce((sum,p)=>sum+Math.abs(p.coarse-p.fine),0);
  }
  if(!(Number.isFinite(value)&&value>0))throw new DomainError('Invalid isentropic volume integral');
  return value;
}

function deepFreeze<T>(value:T):T {
  if(value!==null&&typeof value==='object'){
    for(const nested of Object.values(value))deepFreeze(nested);Object.freeze(value);
  }
  return value;
}

function solveLinear(matrix:number[][],rhs:number[]):number[] {
  const A=matrix.map((row,i)=>[...row,rhs[i]]),n=rhs.length;
  for(let j=0;j<n;j++){
    let k=j;for(let i=j+1;i<n;i++)if(Math.abs(A[i][j])>Math.abs(A[k][j]))k=i;
    [A[j],A[k]]=[A[k],A[j]];if(Math.abs(A[j][j])<1e-15)throw new DomainError('Singular charge DAE Jacobian');
    const pivot=A[j][j];for(let l=j;l<=n;l++)A[j][l]/=pivot;
    for(let i=0;i<n;i++)if(i!==j){const f=A[i][j];for(let l=j;l<=n;l++)A[i][l]-=f*A[j][l];}
  }
  return A.map(row=>row[n]);
}
