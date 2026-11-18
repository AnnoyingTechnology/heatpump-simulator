import assert from 'node:assert/strict';
import test from 'node:test';
import { validateMultisplitInstallation } from './build/equipment-topology.js';
// Every reviewed profile below is a Daikin outdoor unless a test passes another manufacturer.
const validate = (profile, heads, outdoorManufacturer = 'daikin') => validateMultisplitInstallation(profile, heads, outdoorManufacturer);
import { CATALOGUE_INDOORS, CATALOGUE_OUTDOORS } from './build/equipment-data.js';
const model = id => CATALOGUE_OUTDOORS.find(m => m.id === id).installation;
const head = (id, portId, capacityClass, connectedCapacityKw, reducer='none', extra={}) => ({id,manufacturer:'daikin',enabled:true,installation:{portId,capacityClass,connectedCapacityKw,reducer,...extra}});

test('two installed heads with one Off satisfy count while exact OEM eligibility remains unknown',()=>{
 const heads=[head('a','A',25,2.5),{...head('b','B',25,2.5),enabled:false}];
 const result=validate(model('2MXM40A2V1B9'),heads);
 assert.equal(result.topologyStatus,'valid');assert.equal(result.eligibilityStatus,'unknown');assert.equal(result.status,'unknown');
 assert.ok(!result.findings.some(f=>f.code==='connected-count'));
 const tooFew=validate(model('2MXM40A2V1B9'),heads.slice(0,1));assert.equal(tooFew.topologyStatus,'invalid');
});
test('off heads still occupy ports and capacity-class sum; wrong and duplicate ports invalidate',()=>{
 const profile=model('3MXM52A2V1B8');
 const heads=[head('a','A',25,2.5),head('b','B',50,5),{...head('c','C',25,2.5,'2+4'),enabled:false}];
 assert.ok(validate(profile,heads).findings.some(f=>f.code==='class-sum'));
 heads[2].installation.connectedCapacityKw=1.5;heads[2].installation.portId='B';assert.ok(validate(profile,heads).findings.some(f=>f.code==='port-duplicate'));
 heads[2].installation.portId='E';assert.ok(validate(profile,heads).findings.some(f=>f.code==='port-absent'));
});
test('unequal ports cannot be interchanged; ordinary42 and named42 require distinct accessories',()=>{
 const profile=model('2MXM50A2V1B8');
 const correct=[head('a','A',25,2.5),head('b','B',50,5)];assert.equal(validate(profile,correct).topologyStatus,'valid');
 correct[0].installation.portId='B';correct[1].installation.portId='A';assert.ok(validate(profile,correct).findings.some(f=>f.code==='port-class'));
 const named=[head('a','A',42,4.2,'none',{guideNamedIndoorClass:'FTXA42C'}),head('b','B',25,2.5,'1+2')];assert.equal(validate(profile,named).topologyStatus,'valid');
 delete named[0].installation.guideNamedIndoorClass;assert.equal(validate(profile,named).topologyStatus,'unknown');
 named[0].installation.reducer='optional accessory (not identified by this table)';assert.equal(validate(profile,named).topologyStatus,'unknown');
 named[0].installation.guideNamedIndoorClass='FTXA42D';named[0].installation.reducer='none';assert.equal(validate(profile,named).topologyStatus,'invalid');
});
test('4MXM80 portC requires local 5+6 or1+3 reducers and71 needs none',()=>{
 const profile=model('4MXM80A2V1B8');
 const heads=[head('a','A',25,2.5),head('c','C',50,5,'1+3')];assert.equal(validate(profile,heads).topologyStatus,'valid');
 heads[1].installation.reducer='none';assert.equal(validate(profile,heads).topologyStatus,'invalid');
 heads[1].installation.capacityClass=71;heads[1].installation.connectedCapacityKw=7.1;assert.equal(validate(profile,heads).topologyStatus,'valid');
});
test('unknown class/contribution never inferred from head ID or nominalCoolingKw; known partial excess invalid',()=>{
 const profile=model('3MXM52A2V1B8');
 const heads=[head('FTXA35C2V1BW','A',undefined,undefined),head('FTXA25C2V1BW','B',25,2.5,'2+4')];heads[0].nominalCoolingKw=3.4;
 const result=validate(profile,heads);assert.equal(result.topologyStatus,'unknown');assert.ok(result.findings.some(f=>f.code==='capacity-contribution'));
 heads[1].installation.connectedCapacityKw=10;assert.ok(validate(profile,heads).findings.some(f=>f.code==='class-sum'));
 heads[1].installation.connectedCapacityKw=NaN;assert.equal(validate(profile,heads).topologyStatus,'invalid');
});
test('generic/other manufacturer cannot become an approved Daikin combination',()=>{
 const heads=[head('MSZ-AP25VGK','A',25,2.5),head('FTXA25','B',25,2.5)];heads[0].manufacturer='mitsubishi-electric';
 const result=validate(model('2MXM40A2V1B9'),heads);assert.equal(result.status,'unknown');assert.equal(result.eligibilityStatus,'unknown');assert.ok(result.findings.some(f=>f.code==='manufacturer'&&f.status==='unknown'));
});


test('legacy unknown constraints stay unknown at one or two installed heads; published maximum still rejects excess',()=>{
 const profile=model('2MXM40N2V1B');
 const one=[head('FTXA25','A',25,2.5)];
 const result=validate(profile,one);assert.equal(result.topologyStatus,'unknown');assert.equal(result.eligibilityStatus,'unknown');
 assert.ok(result.findings.some(f=>f.code==='minimum-count-unpublished'));
 assert.ok(!result.findings.some(f=>f.code==='connected-count'||f.code==='port-absent'||f.code==='reducer-or-class'));
 const two=[...one,head('FTXA35','B',35,3.5)];two[1].enabled=false;assert.equal(validate(profile,two).status,'unknown');
 const three=[...two,head('FTXA25','C',25,2.5)];assert.equal(validate(profile,three).topologyStatus,'invalid');
 one[0].manufacturer='mitsubishi-electric';assert.equal(validate(profile,one).eligibilityStatus,'unknown');
});

test('3MXF published ports enforce classes/reducers while unknown minimum and exact SKU eligibility stay unknown',()=>{
 const profile=model('3MXF52A2V1B9');
 const heads=[head('a','A',35,3.5),head('b','B',20,2,'2+4'),head('c','C',20,2,'2+4')];
 const result=validate(profile,heads);assert.equal(result.topologyStatus,'unknown');assert.equal(result.eligibilityStatus,'unknown');
 assert.ok(result.findings.some(f=>f.code==='minimum-count-unpublished'));
 heads[1].installation.reducer='none';assert.ok(validate(profile,heads).findings.some(f=>f.code==='reducer-or-class'));
 heads[0].installation.capacityClass=42;heads[0].installation.connectedCapacityKw=4.2;heads[0].installation.guideNamedIndoorClass='FTXF42F';
 heads[1].installation.connectedCapacityKw=3.5;heads[1].installation.capacityClass=35;heads[1].installation.reducer='2+4';
 heads[2].installation.connectedCapacityKw=3.5;heads[2].installation.capacityClass=35;
 assert.ok(validate(profile,heads).findings.some(f=>f.code==='class-sum'));
});

test('2MXF published port classes, reducer and class-sum caps are enforced with unknown exact eligibility',()=>{
 const forty=model('2MXF40A2V1B');
 const heads=[head('a','A',35,3.5),head('b','B',25,2.5)];
 const ok=validate(forty,heads);assert.equal(ok.topologyStatus,'unknown');assert.equal(ok.eligibilityStatus,'unknown');
 assert.ok(ok.findings.some(f=>f.code==='minimum-count-unpublished'));
 heads[0].installation.capacityClass=42;assert.ok(validate(forty,heads).findings.some(f=>f.code==='port-class'));
 heads[0].installation.capacityClass=35;heads[1].installation.capacityClass=35;heads[1].installation.connectedCapacityKw=3.5;
 assert.ok(validate(forty,heads).findings.some(f=>f.code==='class-sum'));
 const fifty=model('2MXF50A2V1B');
 const pair=[head('a','A',42,4.3),head('b','B',42,4.3,'1+2')];
 assert.ok(validate(fifty,pair).findings.some(f=>f.code==='class-sum'));
 pair[1].installation.reducer='none';assert.ok(validate(fifty,pair).findings.some(f=>f.code==='reducer-or-class'));
});

test('exact ATXP-N9 pair metadata names only its source-listed ARXP outdoor partner',()=>{
 const indoor=id=>CATALOGUE_INDOORS.find(p=>p.id===id);
 assert.deepEqual(indoor('ATXP20N5V1B9').compatibleOutdoorReferences,['ARXP20N5V1B9']);
 assert.deepEqual(indoor('ATXP25N5V1B9').compatibleOutdoorReferences,['ARXP25N5V1B9']);
 assert.deepEqual(indoor('ATXP35N5V1B9').compatibleOutdoorReferences,['ARXP35N5V1B9']);
});
test('the manufacturer finding follows the outdoor unit, not a fixed brand',()=>{
 const profile={topology:'multisplit',minimumConnectedHeads:2,maximumConnectedHeads:2,connectedCapacityClassSumLimitKw:null,ports:null,guide:'test',exactEligibility:'unknown',publishedMaximumTotalChargeKg:null};
 const heads=[head('MSZ-LN25VG3W','A',25,2.5),head('MSZ-LN35VG3W','B',35,3.5)];for(const h of heads)h.manufacturer='mitsubishi-electric';
 assert.ok(!validate(profile,heads,'mitsubishi-electric').findings.some(f=>f.code==='manufacturer'));
 assert.equal(validate(profile,heads,'daikin').findings.filter(f=>f.code==='manufacturer').length,2);
 assert.ok(!validate(profile,heads,'mitsubishi-electric').findings.some(f=>/legacy/.test(f.message)));
});
