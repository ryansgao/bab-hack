import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { policyChainEnabled, checkOnChain, recordOnChain, policyStatus } from './policy-chain.js';
const artifact = JSON.parse(readFileSync(new URL('../contracts/RoboMarketPolicy.json', import.meta.url), 'utf8')) as { abi: { type: string; name?: string }[]; bytecode: string };
const entry = { robotId: 'robot_001', task: 'task', vendorId: 'vision_lab', requestId: 'req', amount: 2000, settlementTx: `0x${'ab'.repeat(32)}` as const };
test('artifact carries the policy ABI and deployable bytecode', () => {
  const functions = artifact.abi.filter(item => item.type === 'function').map(item => item.name);
  for (const name of ['check', 'record', 'setPolicy', 'setVendors']) assert.ok(functions.includes(name), name);
  assert.match(artifact.bytecode, /^0x[0-9a-f]{2,}$/);
});
test('bytecode has no PUSH0, which chains before Shanghai reject', () => {
  // Walk the opcodes so a 0x5f byte inside PUSH data is not mistaken for the PUSH0 opcode, and stop
  // before the trailing CBOR metadata (its length is the last two bytes), which is a hash, not code.
  const code = Buffer.from(artifact.bytecode.slice(2), 'hex');
  const end = code.length - 2 - code.readUInt16BE(code.length - 2);
  for (let i = 0; i < end; i++) {
    assert.notEqual(code[i], 0x5f, `PUSH0 at byte ${i}`);
    if (code[i] >= 0x60 && code[i] <= 0x7f) i += code[i] - 0x5f;
  }
});
test('without BNB_POLICY_CONTRACT every call is a no-op', async () => {
  delete process.env.BNB_POLICY_CONTRACT;
  assert.equal(policyChainEnabled(), false);
  assert.equal(await checkOnChain('robot_001', 'task', 'vision_lab', 2000), null);
  assert.equal(await recordOnChain(entry), null);
  assert.equal(await policyStatus(), null);
  process.env.BNB_POLICY_CONTRACT = 'not-an-address';
  assert.equal(policyChainEnabled(), false);
  delete process.env.BNB_POLICY_CONTRACT;
});
