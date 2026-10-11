import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readPreconfiguration} from './frontend/build/preconfiguration.js';
const parse=url=>readPreconfiguration(new URL(url,'https://example.test/simulator/'),['ground','first','attic']);
test('Home Assistant query observations preserve stable room identity, Off and omitted defaults',()=>{
 const r=parse('?outdoor=-4&humidity=85&mode=heating&room.ground.target=16&room.ground.temperature=18&room.ground.enabled=off&room.first.target=21.5&room.attic.enabled=0');
 assert.equal(r.outdoorC,-4);assert.equal(r.outdoorRh,85);assert.equal(r.mode,'heating');assert.deepEqual(r.issues,[]);
 assert.deepEqual(r.rooms,[{id:'ground',setpointC:16,airC:18,enabled:false},{id:'first',setpointC:21.5,airC:undefined},{id:'attic',setpointC:undefined,airC:undefined,enabled:false}]);
});
test('fragment observations override query keys without resetting unspecified values',()=>{
 const r=parse('?outdoor=1&mode=heating#outdoor=39&mode=cooling&room.first.target=24&room.first.temperature=28.2&room.first.enabled=true');
 assert.equal(r.outdoorC,39);assert.equal(r.mode,'cooling');assert.equal(r.rooms[0].airC,28.2);assert.equal(r.rooms[0].enabled,true);assert.deepEqual(r.issues,[]);
});
test('invalid observations never become NaN, clamp silently or replace valid neighbours',()=>{
 const r=parse('?outdoor=Infinity&humidity=-1&mode=auto&room.ground.target=&room.first.temperature=100&room.attic.enabled=maybe&room.unknown.target=21&room.ground.temperature=18');
 assert.equal(r.outdoorC,undefined);assert.equal(r.outdoorRh,undefined);assert.equal(r.mode,undefined);assert.deepEqual(r.applied,['room.ground.temperature']);assert.equal(r.rooms.length,1);assert.equal(r.issues.length,7);
 assert.equal(parse('?outdoor=1&outdoor=2').outdoorC,undefined);assert.equal(parse('#room.ground.target=16&room.ground.target=17').rooms.length,0);
 assert.deepEqual(parse('?unrelated=whatever#section').applied,[]);
});
