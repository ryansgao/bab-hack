import test from 'node:test';
import assert from 'node:assert/strict';
import { Ledger, units, fingerprint, type Policy } from './ledger.js';
const policy: Policy = {maxCall:50_000,maxTask:60_000,maxSession:100_000,maxDaily:100_000,approvalThreshold:50_000,vendors:['vendor']};
test('decimal amounts are exact and reject invalid precision',()=>{
  assert.equal(units('0.008'),8000); assert.equal(units('5'),5_000_000);
  for(const bad of ['-1','NaN','0.0000001','1e2']) assert.throws(()=>units(bad));
});
test('duplicate request IDs do not reserve twice; changed inputs conflict',()=>{
  const ledger=new Ledger(':memory:');
  ledger.reserve('a','task','hash','vendor','shard',20_000,policy);
  ledger.reserve('a','task','hash','vendor','shard',20_000,policy);
  assert.equal(ledger.used(),20_000);
  assert.throws(()=>ledger.reserve('a','task','different','vendor','shard',20_000,policy));
});
test('per-task and aggregate reservations prevent overspending',()=>{
  const ledger=new Ledger(':memory:');
  ledger.reserve('a','task','1','vendor','shard',40_000,policy);
  assert.throws(()=>ledger.reserve('b','task','2','vendor','shard',40_000,policy),/Per-task/);
  ledger.reserve('b','other','2','vendor','shard',40_000,policy);
  assert.throws(()=>ledger.reserve('c','third','3','vendor','shard',40_000,policy),/Session/);
  ledger.update('a','uncertain'); assert.equal(ledger.used(),80_000);
  ledger.update('b','failed'); assert.equal(ledger.used(),40_000);
});
test('vendor, call, approval, and daily policy enforce before authorization',()=>{
  const ledger=new Ledger(':memory:');
  assert.throws(()=>ledger.reserve('a','task','1','evil','s',1,policy),/allowlist/);
  assert.throws(()=>ledger.reserve('a','task','1','vendor','s',60_000,policy),/Per-call/);
  assert.throws(()=>ledger.reserve('a','task','1','vendor','s',40_000,{...policy,approvalThreshold:1}),/approval/);
  assert.throws(()=>ledger.reserve('a','task','1','vendor','s',40_000,{...policy,maxDaily:1}),/Daily/);
});
test('authorization replay is rejected and fingerprints ignore key ordering',()=>{
  const ledger=new Ledger(':memory:');
  ledger.authorization('a','nonce',{signature:'test fixture'});
  assert.throws(()=>ledger.authorization('b','nonce',{}));
  assert.equal(fingerprint({a:1,b:{d:3,c:2}}),fingerprint({b:{c:2,d:3},a:1}));
});
