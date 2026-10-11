// Live check of the payment service against Base Sepolia with real testnet AUSD.
// The marketplace and the model worker are replaced by a local stub so every case can be forced;
// the payment service itself, the x402 flow, the facilitator and the chain are the real ones.
// Usage: node --env-file=../../.env --import tsx scripts/live-check.ts <output.json>
import express from 'express';
import { spawn, type ChildProcess } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPublicClient, http, parseAbi, formatUnits, formatEther, type Hex, type Address } from 'viem';
import { baseSepolia } from 'viem/chains';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { x402Client, x402HTTPClient } from '@x402/core/client';
import { decodePaymentRequiredHeader } from '@x402/core/http';
import { ExactEvmScheme as BuyerScheme } from '@x402/evm/exact/client';
import { Ledger, fingerprint, units } from '../src/ledger.js';
import { chain, requirements, payoutAddress, transfer, AUSD, NETWORK } from '../src/chain.js';

const out = process.argv[2] || 'live-check.json';
const KEY = process.env.SERVICE_KEY!;
const robot = privateKeyToAccount(process.env.ROBOT_PRIVATE_KEY as Hex).address;
const facilitator = privateKeyToAccount(process.env.FACILITATOR_PRIVATE_KEY as Hex).address;
const provider = process.env.PROVIDER_ADDRESS as Address;
const pub = createPublicClient({ chain: baseSepolia, transport: http(process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org') });
const erc20 = parseAbi(['function balanceOf(address) view returns (uint256)']);
const ausd = (a: Address) => pub.readContract({ address: AUSD, abi: erc20, functionName: 'balanceOf', args: [a] });
const run = Date.now().toString(36);
const dir = mkdtempSync(join(tmpdir(), 'robomarket-live-'));
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ---- stub marketplace + model worker ----
const STUB = 4390;
const state = { validateOk: true, inferenceOk: true, inferenceCalls: 0 };
const models = [
  { id: 'det_small', provider_id: 'vision_lab', price_ausd: '0.002', status: 'available', execution_mode: 'real' },
  { id: 'det_large', provider_id: 'vision_lab', price_ausd: '0.02', status: 'available', execution_mode: 'real' },
  { id: 'det_cap', provider_id: 'navigation_lab', price_ausd: '0.05', status: 'available', execution_mode: 'real' },
  { id: 'det_huge', provider_id: 'vision_lab', price_ausd: '0.06', status: 'available', execution_mode: 'real' },
  { id: 'rogue_model', provider_id: 'rogue_lab', price_ausd: '0.002', status: 'available', execution_mode: 'real' },
  { id: 'det_offline', provider_id: 'vision_lab', price_ausd: '0.002', status: 'offline', execution_mode: 'real' },
  { id: 'sim_model', provider_id: 'vision_lab', price_ausd: '0.002', status: 'available', execution_mode: 'simulation' },
];
const stub = express(); stub.use(express.json({ limit: '12mb' }));
stub.get('/api/marketplace/models', (_q, s) => s.json(models));
stub.post('/internal/validate', (_q, s) => state.validateOk ? s.json({ ok: true }) : s.status(422).json({ error: 'bad input' }));
stub.post('/internal/inference', (q, s) => { state.inferenceCalls++; state.inferenceOk ? s.json({ model_id: q.body.model_id, detections: [{ label: 'pallet', score: 0.91 }], stub: true }) : s.status(500).json({ error: 'worker down' }); });
const stubServer = stub.listen(STUB, '127.0.0.1');

// ---- payment service instances ----
const children: ChildProcess[] = [];
// The first groups test the robot paying from its own balance, so the owner wallet and the
// per-vendor addresses are switched off for them. The mission-float group switches them back on.
let baseEnv: Record<string, string> = { OWNER_PRIVATE_KEY: '', VENDOR_SEED: '' };
async function eventually<T>(read: () => Promise<T>, ok: (v: T) => boolean, ms = 40_000): Promise<T> {
  const until = Date.now() + ms; let v = await read();
  while (!ok(v) && Date.now() < until) { await sleep(1500); v = await read(); }
  return v;
}
async function instance(port: number, overrides: Record<string, string> = {}, db = join(dir, `pay-${port}.sqlite`)) {
  const env = { ...process.env, PAYMENT_PORT: String(port), PAYMENT_DB: db, API_URL: `http://127.0.0.1:${STUB}`, MODEL_URL: `http://127.0.0.1:${STUB}`, ...baseEnv, ...overrides } as Record<string, string>;
  for (const k of Object.keys(env)) if (env[k] === '') delete env[k];
  const child = spawn('node', ['--import', 'tsx', 'src/server.ts'], { env, stdio: 'ignore' });
  children.push(child);
  for (let i = 0; i < 60; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) return { port, db, child }; } catch { /* not up yet */ } await sleep(250); }
  throw new Error(`instance ${port} did not start`);
}
const H = (key = KEY) => ({ 'Content-Type': 'application/json', 'X-Service-Key': key });
async function call(port: number, path: string, body?: unknown, headers: Record<string, string> = H()) {
  const r = await fetch(`http://127.0.0.1:${port}${path}`, { method: body === undefined ? 'GET' : 'POST', headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let json: any = null; try { json = await r.json(); } catch { /* empty */ }
  return { status: r.status, json, headers: r.headers };
}
let seq = 0;
const req = (task: string, model: string, extra: Record<string, unknown> = {}) => ({ request_id: `${task}_${++seq}`, robot_id: 'robot_001', model_id: model, input: { frame: 'stub', n: seq }, max_price_ausd: '1', ...extra });
const buy = (port: number, body: any) => call(port, '/purchase', body);

type Result = { id: number; group: string; name: string; expect: string; got: string; pass: boolean; tx?: string | null; ms?: number };
const results: Result[] = [];
function record(group: string, name: string, expect: string, got: string, pass: boolean, tx?: string | null, ms?: number) {
  results.push({ id: results.length + 1, group, name, expect, got, pass, tx, ms });
  console.log(`${pass ? 'PASS' : 'FAIL'} [${group}] ${name} -> ${got}`);
}
const msg = (r: { status: number; json: any }) => `HTTP ${r.status} ${r.json?.error?.code || r.json?.payment?.status || ''} ${r.json?.error?.message || ''}`.trim();

const ownerAccount = process.env.OWNER_PRIVATE_KEY ? privateKeyToAccount(process.env.OWNER_PRIVATE_KEY as Hex) : null;
if (ownerAccount && await ausd(robot) < 500_000n) {
  // A previous run left the treasury with the owner; the robot-pays groups need the robot funded.
  const c = await chain();
  const funder = new x402HTTPClient(x402Client.fromConfig({ schemes: [{ network: NETWORK, client: new BuyerScheme(ownerAccount) }], spendControls: { allowedAssets: [{ network: NETWORK, asset: AUSD }] } }));
  console.log('funding the robot with 1 AUSD for the robot-pays groups:', await transfer(c, funder, robot, 1_000_000, 'test-funding'));
  await eventually(() => ausd(robot), v => v >= 500_000n);
}
const start = { robot: await ausd(robot), provider: await ausd(provider), robotEth: await pub.getBalance({ address: robot }), facEth: await pub.getBalance({ address: facilitator }) };
const settledTx: string[] = [];

try {
  let r: Awaited<ReturnType<typeof call>> = { status: 0, json: null, headers: new Headers() }; let t = 0, ms = 0;
  // LIVE_ONLY=float skips the robot-pays groups (about three minutes) when only the float changed.
  robotPays: {
  if (process.env.LIVE_ONLY === 'float' || process.env.LIVE_ONLY === 'reconcile') break robotPays;
  const A = await instance(4391);

  // ---- access and input ----
  r = await call(A.port, '/wallet', undefined, H('wrong-key'));
  record('Access', 'Wallet endpoint with a wrong service key', '403', msg(r), r.status === 403);
  r = await call(A.port, '/purchase', req(`a${run}`, 'det_small'), { 'Content-Type': 'application/json' });
  record('Access', 'Purchase with no service key', '403', msg(r), r.status === 403);
  r = await buy(A.port, { ...req(`a${run}`, 'det_small'), robot_id: 'robot_999' });
  record('Input', 'Purchase for an unknown robot id', '422, nothing reserved', msg(r), r.status === 422);
  r = await buy(A.port, { ...req(`a${run}`, 'det_small'), max_price_ausd: '-1' });
  record('Input', 'Negative maximum price', '422', msg(r), r.status === 422);

  // ---- happy path ----
  const b0 = { robot: await ausd(robot), provider: await ausd(provider) };
  const happy = req(`h${run}`, 'det_small');
  t = Date.now(); r = await buy(A.port, happy); ms = Date.now() - t;
  const tx1 = r.json?.payment?.transaction_hash as Hex | undefined;
  record('Happy path', 'Buy one inference for 0.002 AUSD', '200, settled, transaction hash, inference returned', `${msg(r)} inference=${!!r.json?.inference}`, r.status === 200 && r.json?.payment?.status === 'settled' && !!tx1 && !!r.json?.inference, tx1, ms);
  if (tx1) settledTx.push(tx1);
  await sleep(1500);
  const b1 = { robot: await ausd(robot), provider: await ausd(provider) };
  record('Happy path', 'On-chain balances moved by exactly the price', 'robot -2000 units, vendor +2000 units', `robot ${b1.robot - b0.robot}, vendor ${b1.provider - b0.provider}`, b0.robot - b1.robot === 2000n && b1.provider - b0.provider === 2000n, tx1);
  if (tx1) {
    const rc = await pub.getTransactionReceipt({ hash: tx1 });
    record('Happy path', 'Transaction was sent by the facilitator, not the robot (gasless for the robot)', `from = facilitator ${facilitator.slice(0, 8)}`, `from = ${rc.from.slice(0, 8)}, status ${rc.status}`, rc.from.toLowerCase() === facilitator.toLowerCase() && rc.status === 'success', tx1);
  }
  record('Happy path', 'Robot wallet holds zero ETH', '0 ETH', `${formatEther(await pub.getBalance({ address: robot }))} ETH`, (await pub.getBalance({ address: robot })) === 0n);
  r = await call(A.port, '/transactions');
  const row = (r.json || []).find((x: any) => x.request_id === happy.request_id);
  record('Happy path', 'Receipt appears in the transaction history with an explorer link', 'settled row with explorer_url', `status ${row?.status}, explorer ${row?.explorer_url ? 'yes' : 'no'}`, row?.status === 'settled' && !!row?.explorer_url, tx1);

  // ---- idempotency and replay ----
  const calls0 = state.inferenceCalls; const b2 = await ausd(robot);
  r = await buy(A.port, happy);
  await sleep(1000);
  record('Replay', 'Same request sent again', '200 from cache, same transaction, no second payment, model not called again', `${msg(r)} sameTx=${r.json?.payment?.transaction_hash === tx1} paidAgain=${(await ausd(robot)) !== b2} modelCalls+${state.inferenceCalls - calls0}`, r.status === 200 && r.json?.payment?.transaction_hash === tx1 && (await ausd(robot)) === b2 && state.inferenceCalls === calls0, tx1);
  r = await buy(A.port, { ...happy, input: { frame: 'different' } });
  record('Replay', 'Same request id with different input', '409 IDEMPOTENCY_CONFLICT', msg(r), r.status === 409 && r.json?.error?.code === 'IDEMPOTENCY_CONFLICT');
  {
    const l = new Ledger(A.db);
    const stored = l.db.prepare('SELECT payload FROM authorizations WHERE request_id=?').get(happy.request_id) as any;
    const c = await chain();
    const v = await c.facilitator.verify(JSON.parse(stored.payload), requirements(2000, provider, c.domain));
    record('Replay', 'Re-submitting the already-used signed authorization to the facilitator', 'rejected (nonce already used on-chain)', `isValid=${v.isValid} reason=${(v as any).invalidReason || ''}`, v.isValid === false);
    l.db.close();
  }

  // ---- marketplace conditions ----
  r = await buy(A.port, req(`m${run}`, 'no_such_model'));
  record('Marketplace', 'Unknown model', 'refused, nothing paid', msg(r), r.status === 503);
  r = await buy(A.port, req(`m${run}`, 'det_offline'));
  record('Marketplace', 'Model listed as offline', 'refused, nothing paid', msg(r), r.status === 503);
  r = await buy(A.port, req(`m${run}`, 'sim_model'));
  record('Marketplace', 'Simulation-only provider', 'refused: cannot take real payment', msg(r), r.status === 503);
  r = await buy(A.port, req(`m${run}`, 'det_large', { max_price_ausd: '0.01' }));
  record('Marketplace', 'Price (0.02) above the price the agent agreed to (0.01)', 'refused with Allowance message', msg(r), r.status === 503 && /Allowance exceeded/.test(r.json?.error?.message || ''));
  state.validateOk = false;
  const bv = await ausd(robot); r = await buy(A.port, req(`m${run}`, 'det_small')); state.validateOk = true;
  record('Marketplace', 'Model worker rejects the input before payment', 'refused, no payment authorized', `${msg(r)} paid=${(await ausd(robot)) !== bv}`, r.status === 503 && (await ausd(robot)) === bv);

  // ---- spending limits ----
  r = await buy(A.port, req(`l${run}`, 'rogue_model'));
  record('Limits', 'Vendor not on the allowed list', 'refused: allowlist', msg(r), r.status === 503 && /allowlist/.test(r.json?.error?.message || ''));
  r = await buy(A.port, req(`l${run}`, 'det_huge'));
  record('Limits', 'Price 0.06 above the 0.05 per-call limit', 'refused: per-call', msg(r), r.status === 503 && /Per-call/.test(r.json?.error?.message || ''));
  t = Date.now(); r = await buy(A.port, req(`k${run}`, 'det_cap')); ms = Date.now() - t;
  record('Limits', 'Price exactly at the 0.05 per-call limit', '200 settled', msg(r), r.status === 200 && r.json?.payment?.status === 'settled', r.json?.payment?.transaction_hash, ms);
  if (r.json?.payment?.transaction_hash) settledTx.push(r.json.payment.transaction_hash);
  r = await buy(A.port, req(`k${run}`, 'det_cap'));
  record('Limits', 'Second 0.05 purchase in the same task (total exactly 0.10)', '200 settled', msg(r), r.status === 200 && r.json?.payment?.status === 'settled', r.json?.payment?.transaction_hash);
  if (r.json?.payment?.transaction_hash) settledTx.push(r.json.payment.transaction_hash);
  r = await buy(A.port, req(`k${run}`, 'det_small'));
  record('Limits', 'Third purchase in that task (would total 0.102, limit 0.10)', 'refused: per-task', msg(r), r.status === 503 && /Per-task/.test(r.json?.error?.message || ''));
  r = await buy(A.port, req(`j${run}`, 'det_small'));
  record('Limits', 'Same price in a different task', '200 settled (task limits are separate)', msg(r), r.status === 200 && r.json?.payment?.status === 'settled', r.json?.payment?.transaction_hash);
  if (r.json?.payment?.transaction_hash) settledTx.push(r.json.payment.transaction_hash);

  const B = await instance(4392, { APPROVAL_THRESHOLD_AUSD: '0.01' });
  r = await buy(B.port, req(`p${run}`, 'det_large'));
  record('Limits', 'Price 0.02 above a 0.01 human-approval threshold', 'refused: approval threshold', msg(r), r.status === 503 && /threshold/.test(r.json?.error?.message || ''));

  const C = await instance(4393, { MAX_SESSION_AUSD: '0.004' });
  const s1 = await buy(C.port, req(`s${run}x`, 'det_small')); const s2 = await buy(C.port, req(`s${run}y`, 'det_small')); const s3 = await buy(C.port, req(`s${run}z`, 'det_small'));
  for (const s of [s1, s2]) if (s.json?.payment?.transaction_hash) settledTx.push(s.json.payment.transaction_hash);
  record('Limits', 'Session limit 0.004: three 0.002 purchases', 'first two settle, third refused: session', `${s1.status}, ${s2.status}, ${msg(s3)}`, s1.status === 200 && s2.status === 200 && s3.status === 503 && /Session/.test(s3.json?.error?.message || ''), s2.json?.payment?.transaction_hash);

  const D = await instance(4394, { MAX_DAILY_AUSD: '0.002' });
  const d1 = await buy(D.port, req(`d${run}x`, 'det_small')); const d2 = await buy(D.port, req(`d${run}y`, 'det_small'));
  if (d1.json?.payment?.transaction_hash) settledTx.push(d1.json.payment.transaction_hash);
  record('Limits', 'Daily limit 0.002: two 0.002 purchases', 'first settles, second refused: daily', `${d1.status}, ${msg(d2)}`, d1.status === 200 && d2.status === 503 && /Daily/.test(d2.json?.error?.message || ''), d1.json?.payment?.transaction_hash);

  // ---- concurrency ----
  const same = req(`c${run}`, 'det_small');
  const [c1, c2] = await Promise.all([buy(A.port, same), buy(A.port, same)]);
  await sleep(1500);
  for (const c of [c1, c2]) if (c.status === 200 && c.json?.payment?.transaction_hash && !settledTx.includes(c.json.payment.transaction_hash)) settledTx.push(c.json.payment.transaction_hash);
  const sameRows = ((await call(A.port, '/transactions')).json || []).filter((x: any) => x.request_id === same.request_id);
  record('Concurrency', 'The same request sent twice at the same instant', 'one ledger entry, one transaction, one of the two calls refused', `statuses ${c1.status}/${c2.status}, ledger entries ${sameRows.length}, status ${sameRows[0]?.status}`, sameRows.length === 1 && sameRows[0]?.status === 'settled' && [c1.status, c2.status].sort().join() === '200,409', sameRows[0]?.transaction_hash);
  const E = await instance(4395, { MAX_SESSION_AUSD: '0.006' });
  const burst = await Promise.all(Array.from({ length: 6 }, (_, i) => buy(E.port, req(`e${run}${i}`, 'det_small'))));
  await sleep(2500);
  const okN = burst.filter(x => x.status === 200).length;
  for (const x of burst) if (x.json?.payment?.transaction_hash) settledTx.push(x.json.payment.transaction_hash);
  record('Concurrency', 'Six different purchases at once against a 0.006 session limit', 'exactly 3 settle, 3 refused by the session limit', `${okN} settled, others: ${[...new Set(burst.filter(x => x.status !== 200).map(msg))].join(' | ')}`, okN === 3 && burst.filter(x => /Session/.test(x.json?.error?.message || '')).length === 3);

  // ---- provider endpoint (the x402 seller side) ----
  const direct = req(`x${run}`, 'det_small'); const { max_price_ausd: _m, ...directBody } = direct as any;
  r = await call(A.port, '/api/inference/det_small', directBody);
  let challengeOk = false, challengeText = '';
  try { const pr = decodePaymentRequiredHeader(r.headers.get('PAYMENT-REQUIRED')!); const a = pr.accepts[0]; challengeText = `x402 v${pr.x402Version}, ${a.scheme}, ${a.network}, asset ${a.asset.slice(0, 8)}, amount ${a.amount}, payTo ${a.payTo.slice(0, 8)}, domain "${(a.extra as any)?.name}" v${(a.extra as any)?.version}`; challengeOk = a.asset.toLowerCase() === AUSD.toLowerCase() && a.amount === '2000' && a.network === NETWORK && a.payTo.toLowerCase() === provider.toLowerCase(); } catch (e) { challengeText = String(e); }
  record('x402 protocol', 'Unpaid request to the vendor endpoint', '402 with a PAYMENT-REQUIRED header naming AUSD, 2000 units, the vendor address', `HTTP ${r.status}; ${challengeText}`, r.status === 402 && challengeOk);
  {
    // A valid robot signature but no wallet reservation: the vendor side must not settle it.
    const c = await chain(); const bn = await ausd(robot);
    const first = await fetch(`http://127.0.0.1:${A.port}/api/inference/det_small`, { method: 'POST', headers: H(), body: JSON.stringify(directBody) });
    const required = c.buyer.getPaymentRequiredResponse(n => first.headers.get(n));
    const payload = await c.buyer.createPaymentPayload(required);
    r = await call(A.port, '/api/inference/det_small', directBody, { ...H(), ...c.buyer.encodePaymentSignatureHeader(payload) });
    await sleep(1500);
    record('x402 protocol', 'Signed payment sent straight to the vendor, bypassing the wallet limits', 'refused, no money moved', `${msg(r)} paid=${(await ausd(robot)) !== bn}`, r.status === 503 && (await ausd(robot)) === bn);
  }
  {
    // A reservation exists, but the payment is signed by a different wallet.
    const forged = req(`f${run}`, 'det_small'); const { max_price_ausd: _x, ...forgedBody } = forged as any;
    const l = new Ledger(A.db);
    l.db.prepare("INSERT INTO purchases(id,task,digest,vendor,model,amount,status) VALUES (?,?,?,?,?,?,'reserved')").run(forged.request_id, `f${run}`, fingerprint(forgedBody), 'vision_lab', 'det_small', units('0.002'));
    l.db.close();
    const stranger = new x402HTTPClient(x402Client.fromConfig({ schemes: [{ network: NETWORK, client: new BuyerScheme(privateKeyToAccount(generatePrivateKey())) }], spendControls: { allowedAssets: [{ network: NETWORK, asset: AUSD }] } }));
    const first = await fetch(`http://127.0.0.1:${A.port}/api/inference/det_small`, { method: 'POST', headers: H(), body: JSON.stringify(forgedBody) });
    const payload = await stranger.createPaymentPayload(stranger.getPaymentRequiredResponse(n => first.headers.get(n)));
    const bn = await ausd(robot);
    r = await call(A.port, '/api/inference/det_small', forgedBody, { ...H(), ...stranger.encodePaymentSignatureHeader(payload) });
    record('x402 protocol', 'Payment signed by a wallet that is not the robot', '402 INVALID_PAYMENT, no money moved', `${msg(r)} paid=${(await ausd(robot)) !== bn}`, r.status === 402 && r.json?.error?.code === 'INVALID_PAYMENT' && (await ausd(robot)) === bn);
  }

  // ---- failure after payment ----
  state.inferenceOk = false;
  const fail = req(`i${run}`, 'det_small'); const bf = await ausd(robot);
  r = await buy(A.port, fail); state.inferenceOk = true;
  const failTx = r.json?.payment?.transaction_hash; if (failTx) settledTx.push(failTx);
  record('Failure handling', 'Model worker crashes after the payment settled', '503 INFERENCE_FAILED, receipt kept as settled with its transaction', msg(r), r.status === 503 && r.json?.error?.code === 'INFERENCE_FAILED' && r.json?.payment?.status === 'settled' && !!failTx, failTx);
  await sleep(1500); const bf2 = await ausd(robot);
  r = await buy(A.port, fail); await sleep(1000);
  record('Failure handling', 'Retrying that same request', '409, no second payment', `${msg(r)} paidAgain=${(await ausd(robot)) !== bf2}`, r.status === 409 && (await ausd(robot)) === bf2 && bf - bf2 === 2000n);

  // ---- crash recovery ----
  {
    const db = join(dir, 'pay-crash.sqlite'); const crash = req(`r${run}`, 'det_small'); const { max_price_ausd: _y, ...crashBody } = crash as any;
    const l = new Ledger(db);
    l.db.prepare("INSERT INTO purchases(id,task,digest,vendor,model,amount,status) VALUES (?,?,?,?,?,?,'settling')").run(crash.request_id, `r${run}`, fingerprint(crashBody), 'vision_lab', 'det_small', 2000);
    l.db.close();
    const F = await instance(4396, {}, db); const bn = await ausd(robot);
    r = await buy(F.port, crash);
    record('Failure handling', 'Service restarted while a payment was mid-settlement', '409 RECONCILIATION_REQUIRED, marked uncertain, not bought again', `${msg(r)} paid=${(await ausd(robot)) !== bn}`, r.status === 409 && r.json?.payment?.status === 'uncertain' && (await ausd(robot)) === bn);
    const w = await call(F.port, '/wallet');
    record('Failure handling', 'The uncertain payment still counts against the allowance', 'session_used 0.002000', `session_used ${w.json?.session_used_ausd}`, w.json?.session_used_ausd === '0.002000');
  }

  // ---- setup faults ----
  const emptyKey = generatePrivateKey();
  const G = await instance(4397, { ROBOT_PRIVATE_KEY: emptyKey });
  r = await buy(G.port, req(`z${run}`, 'det_small'));
  record('Setup', 'Robot wallet with no AUSD', 'refused: insufficient balance, nothing reserved', msg(r), r.status === 503 && /Insufficient/.test(r.json?.error?.message || ''));
  const Hh = await instance(4398, { AUSD_ADDRESS: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' });
  r = await call(Hh.port, '/wallet');
  record('Setup', 'Configured with a token that is not AUSD (USDC address)', 'setup error, no balance shown', `setup_error="${r.json?.setup_error}" balance=${r.json?.balance_ausd}`, !!r.json?.setup_error && r.json?.balance_ausd === null);
  r = await buy(Hh.port, req(`z${run}`, 'det_small'));
  record('Setup', 'Purchase attempt with the wrong token configured', 'refused', msg(r), r.status === 503);
  const I = await instance(4399, { FACILITATOR_PRIVATE_KEY: '' });
  r = await call(I.port, '/health');
  record('Setup', 'Facilitator key missing', 'health reports not ready and names the missing key', `ready=${r.json?.ready} missing=${JSON.stringify(r.json?.missing)}`, r.json?.ready === false && (r.json?.missing || []).includes('FACILITATOR_PRIVATE_KEY'));
  r = await buy(I.port, req(`z${run}`, 'det_small'));
  record('Setup', 'Purchase attempt with a key missing', 'refused, message names the missing key, no fake receipt', msg(r), r.status === 503 && /missing/i.test(r.json?.error?.message || '') && !r.json?.payment);

  // ---- accounting for the robot-pays groups ----
  await sleep(2500);
  const mid = { robot: await ausd(robot), provider: await ausd(provider) };
  record('Accounting', 'AUSD that left the robot equals AUSD that reached the vendor', 'equal', `robot -${formatUnits(start.robot - mid.robot, 6)}, vendor +${formatUnits(mid.provider - start.provider, 6)}`, start.robot - mid.robot === mid.provider - start.provider);

  }

  // ================= reconciliation of uncertain payments =================
  if (process.env.LIVE_ONLY !== 'float') {
    const R = await instance(4410, { RECONCILE_AFTER_SECONDS: '0' });
    const paid = req(`q${run}`, 'det_small'); const { max_price_ausd: _p, ...paidBody } = paid as any;
    const beforePaid = await ausd(robot);
    r = await buy(R.port, paid); const paidTx = r.json?.payment?.transaction_hash as string | undefined; if (paidTx) settledTx.push(paidTx);
    const never = req(`n${run}`, 'det_small'); const { max_price_ausd: _n, ...neverBody } = never as any;
    const stale = req(`o${run}`, 'det_small'); const { max_price_ausd: _o, ...staleBody } = stale as any;
    {
      // Three ways a payment is left uncertain: it crashed after the money moved, before any
      // signature was sent, and after a signature was made that then expired unused.
      const l = new Ledger(R.db);
      l.db.prepare("UPDATE purchases SET status='uncertain', tx=NULL, result=NULL, error='Process restarted; reconcile before retry' WHERE id=?").run(paid.request_id);
      const insert = l.db.prepare("INSERT INTO purchases(id,task,digest,vendor,model,amount,status,created_at) VALUES (?,?,?,?,?,?,'uncertain',datetime('now','-10 seconds'))");
      insert.run(never.request_id, `n${run}`, fingerprint(neverBody), 'vision_lab', 'det_small', 2000);
      insert.run(stale.request_id, `o${run}`, fingerprint(staleBody), 'vision_lab', 'det_small', 2000);
      l.authorization(stale.request_id, `stale-${run}`, { payload: { authorization: { from: robot, nonce: `0x${'ab'.repeat(31)}${(Date.now() % 256).toString(16).padStart(2, '0')}`, validBefore: '1' } } });
      l.db.close();
    }
    let w = (await call(R.port, '/wallet')).json; const usedBefore = w?.session_used_ausd; const br = await eventually(() => ausd(robot), v => v === beforePaid - 2000n);
    r = await call(R.port, '/reconcile', {});
    // A node one block behind can still report the just-settled authorization as unused; the
    // service then leaves the row uncertain for its next pass. Ask again until the read catches up.
    const outcomes: Record<string, string> = { ...(r.json?.reconciled || {}) };
    // The service's own timed pass may be the one that settles it, so the ledger row is the evidence.
    let rows: any[] = []; const find = (id: string) => rows.find((x: any) => x.request_id === id);
    for (let i = 0; i < 14; i++) { rows = (await call(R.port, '/transactions')).json || []; if (find(paid.request_id)?.status === 'settled') break; await sleep(2500); r = await call(R.port, '/reconcile', {}); Object.assign(outcomes, r.json?.reconciled || {}); }
    for (const q of [paid, never, stale]) outcomes[q.request_id] = find(q.request_id)?.status;
    r = await call(R.port, '/reconcile', {}); r.json.reconciled = outcomes;
    w = (await call(R.port, '/wallet')).json;
    record('Reconciliation', 'Crashed after the money moved: the chain shows the authorization was used', 'marked settled, with the original transaction recovered from the chain', `${r.json?.reconciled?.[paid.request_id]}; tx recovered=${find(paid.request_id)?.transaction_hash === paidTx}`, r.json?.reconciled?.[paid.request_id] === 'settled' && !!paidTx && find(paid.request_id)?.transaction_hash === paidTx, paidTx);
    record('Reconciliation', 'Crashed before any signature was sent', 'marked failed; its allowance is released', `${r.json?.reconciled?.[never.request_id]}; ${find(never.request_id)?.error}`, r.json?.reconciled?.[never.request_id] === 'failed');
    record('Reconciliation', 'A signature was made but never used, and has expired', 'marked failed; its allowance is released', `${r.json?.reconciled?.[stale.request_id]}; ${find(stale.request_id)?.error}`, r.json?.reconciled?.[stale.request_id] === 'failed');
    record('Reconciliation', 'Allowance held by uncertain payments is released, and no money moves', 'session used drops from 0.006 to 0.002; robot balance unchanged', `session used ${usedBefore} -> ${w?.session_used_ausd}; still uncertain ${r.json?.still_uncertain}; robot balance change ${(await ausd(robot)) - br}`, usedBefore === '0.006000' && w?.session_used_ausd === '0.002000' && r.json?.still_uncertain === 0 && (await ausd(robot)) === br);
    r = await buy(R.port, paid);
    record('Reconciliation', 'Retrying the reconciled paid request', '409: already paid, do not buy again', msg(r), r.status === 409);
  }

  // ================= owner wallet, mission float, one address per vendor =================
  let owner: Address | null = null; const floatTx: string[] = [];
  if (ownerAccount && process.env.VENDOR_SEED && process.env.LIVE_ONLY !== 'reconcile') {
    for (const c of children) c.kill(); children.length = 0; await sleep(800);
    baseEnv = {}; owner = ownerAccount.address;
    const visionAddr = payoutAddress('vision_lab'), navAddr = payoutAddress('navigation_lab');
    const tracked = [robot, owner, provider, visionAddr, navAddr];
    const total = async () => (await Promise.all(tracked.map(ausd))).reduce((a, b) => a + b, 0n);
    const total0 = await total();
    const M = await instance(4400, { FLOAT_IDLE_SECONDS: '25' });
    const mission = async (task: string) => ((await call(M.port, '/missions')).json || []).find((m: any) => m.task_id === task);

    const emptied = await eventually(() => ausd(robot), v => v === 0n, 60_000);
    let w = (await call(M.port, '/wallet')).json;
    record('Mission float', 'At start, the robot\'s whole balance moves to the owner treasury', 'robot 0 AUSD, custody mission_float, treasury above 0', `robot ${formatUnits(emptied, 6)}, custody ${w?.custody}, treasury ${w?.owner_treasury_ausd}`, emptied === 0n && w?.custody === 'mission_float' && Number(w?.owner_treasury_ausd) > 0);

    const m1 = `f1${run}`; const nav0 = await ausd(navAddr), vis0 = await ausd(visionAddr);
    t = Date.now(); r = await buy(M.port, req(m1, 'det_small')); ms = Date.now() - t;
    let mv = await mission(m1); const fundTx = mv?.transfers?.[0]?.transaction_hash as Hex | undefined; if (fundTx) floatTx.push(fundTx);
    const held1 = await eventually(() => ausd(robot), v => v === 98_000n);
    record('Mission float', 'First purchase of a mission: the owner sends the robot that mission\'s allowance, then the robot pays', '200 settled; funded 0.10, spent 0.002, robot holds 0.098 on-chain', `${msg(r)}; funded ${mv?.funded_ausd}, spent ${mv?.spent_ausd}, robot on-chain ${formatUnits(held1, 6)}`, r.status === 200 && mv?.funded_ausd === '0.100000' && mv?.spent_ausd === '0.002000' && held1 === 98_000n && mv?.transfers?.[0]?.kind === 'owner_to_robot', fundTx, ms);
    if (fundTx) { const rc = await pub.getTransactionReceipt({ hash: fundTx }); record('Mission float', 'The funding transfer is gasless for the owner too (sent by the facilitator)', `from = facilitator, owner holds 0 ETH`, `from = ${rc.from.slice(0, 8)}, owner ETH ${formatEther(await pub.getBalance({ address: owner }))}`, rc.from.toLowerCase() === facilitator.toLowerCase() && (await pub.getBalance({ address: owner })) === 0n, fundTx); }
    const pay1 = r.json?.payment?.pay_to; if (r.json?.payment?.transaction_hash) settledTx.push(r.json.payment.transaction_hash);

    r = await buy(M.port, req(m1, 'det_cap')); if (r.json?.payment?.transaction_hash) settledTx.push(r.json.payment.transaction_hash);
    mv = await mission(m1); const pay2 = r.json?.payment?.pay_to;
    const navGot = await eventually(async () => (await ausd(navAddr)) - nav0, v => v === 50_000n); const visGot = (await ausd(visionAddr)) - vis0;
    record('Vendor addresses', 'Two vendors are paid at two different addresses', 'vision_lab +2000 units and navigation_lab +50000 units at their own addresses', `vision_lab ${String(pay1).slice(0, 8)} +${visGot}, navigation_lab ${String(pay2).slice(0, 8)} +${navGot}`, pay1?.toLowerCase() === visionAddr.toLowerCase() && pay2?.toLowerCase() === navAddr.toLowerCase() && pay1 !== pay2 && navGot === 50_000n && visGot === 2000n, r.json?.payment?.transaction_hash);
    record('Mission float', 'A second purchase in the same mission does not fund again', 'still one owner-to-robot transfer; robot holds 0.048', `${msg(r)}; transfers ${mv?.transfers?.length}, held ${mv?.held_by_robot_ausd}`, r.status === 200 && mv?.transfers?.length === 1 && mv?.held_by_robot_ausd === '0.048000');
    const vendors = (await call(M.port, '/vendors')).json || [];
    record('Vendor addresses', 'Every approved vendor has its own address', 'as many distinct addresses as vendors', `${vendors.length} vendors, ${new Set(vendors.map((v: any) => v.pay_to)).size} addresses; vision_lab earned ${vendors.find((v: any) => v.provider_id === 'vision_lab')?.earned_ausd}`, vendors.length > 1 && new Set(vendors.map((v: any) => v.pay_to)).size === vendors.length);

    r = await buy(M.port, req(m1, 'det_cap')); mv = await mission(m1);
    record('Mission float', 'A purchase over the mission limit', 'refused: per-task; float untouched', `${msg(r)}; held ${mv?.held_by_robot_ausd}`, r.status === 503 && /Per-task/.test(r.json?.error?.message || '') && mv?.held_by_robot_ausd === '0.048000');

    r = await call(M.port, `/missions/${m1}/close`, {}); if (r.json?.transaction_hash) floatTx.push(r.json.transaction_hash);
    const afterClose = await eventually(() => ausd(robot), v => v === 0n);
    record('Mission float', 'Closing the mission returns the unspent float to the owner', 'returned 0.048; robot back to 0 on-chain', `returned=${r.json?.returned}, returned_ausd ${r.json?.mission?.returned_ausd}, robot on-chain ${formatUnits(afterClose, 6)}`, r.json?.returned === true && r.json?.mission?.returned_ausd === '0.048000' && afterClose === 0n, r.json?.transaction_hash);
    r = await call(M.port, `/missions/${m1}/close`, {});
    record('Mission float', 'Closing the same mission again', 'nothing to return, no transaction', `returned=${r.json?.returned}, tx ${r.json?.transaction_hash}`, r.json?.returned === false && !r.json?.transaction_hash);

    const m2 = `f2${run}`; r = await buy(M.port, req(m2, 'rogue_model'));
    record('Mission float', 'A purchase the limits refuse moves no money at all', 'refused: allowlist; no float funded for that mission', `${msg(r)}; mission funded=${!!(await mission(m2))}`, r.status === 503 && /allowlist/.test(r.json?.error?.message || '') && !(await mission(m2)));

    const m3 = `f3${run}`;
    const trio = await Promise.all([1, 2, 3].map(() => buy(M.port, req(m3, 'det_small'))));
    for (const x of trio) if (x.json?.payment?.transaction_hash) settledTx.push(x.json.payment.transaction_hash);
    mv = await mission(m3); for (const tr of mv?.transfers || []) floatTx.push(tr.transaction_hash);
    record('Mission float', 'Three purchases start a new mission at the same instant', 'all three settle; the float is funded exactly once', `${trio.map(x => x.status).join('/')}; owner-to-robot transfers ${mv?.transfers?.filter((x: any) => x.kind === 'owner_to_robot').length}, funded ${mv?.funded_ausd}, spent ${mv?.spent_ausd}`, trio.every(x => x.status === 200) && mv?.transfers?.filter((x: any) => x.kind === 'owner_to_robot').length === 1 && mv?.funded_ausd === '0.100000' && mv?.spent_ausd === '0.006000');

    t = Date.now(); mv = await eventually(() => mission(m3), v => v?.held_by_robot_ausd === '0.000000', 90_000); ms = Date.now() - t;
    const idleTx = mv?.transfers?.find((x: any) => x.kind === 'robot_to_owner')?.transaction_hash; if (idleTx) floatTx.push(idleTx);
    record('Mission float', 'A mission left idle (25 s in this test) returns its float with no call from anyone', 'returned 0.094 automatically; robot 0', `held ${mv?.held_by_robot_ausd}, returned ${mv?.returned_ausd}, after ${Math.round(ms / 1000)} s; robot on-chain ${formatUnits(await eventually(() => ausd(robot), v => v === 0n), 6)}`, mv?.held_by_robot_ausd === '0.000000' && mv?.returned_ausd === '0.094000' && (await ausd(robot)) === 0n, idleTx, ms);

    r = await buy(M.port, req(m3, 'det_small')); if (r.json?.payment?.transaction_hash) settledTx.push(r.json.payment.transaction_hash);
    mv = await mission(m3);
    record('Mission float', 'The mission buys again after its float was returned', 'funded again up to the mission limit; settled', `${msg(r)}; funded ${mv?.funded_ausd}, returned ${mv?.returned_ausd}, spent ${mv?.spent_ausd}, held ${mv?.held_by_robot_ausd}`, r.status === 200 && mv?.funded_ausd === '0.194000' && mv?.spent_ausd === '0.008000' && mv?.held_by_robot_ausd === '0.092000');
    r = await call(M.port, `/missions/${m3}/close`, {}); if (r.json?.transaction_hash) floatTx.push(r.json.transaction_hash);

    const N = await instance(4401, { ROBOT_PRIVATE_KEY: generatePrivateKey(), OWNER_PRIVATE_KEY: generatePrivateKey() });
    r = await buy(N.port, req(`f4${run}`, 'det_small'));
    const nRows = (await call(N.port, '/transactions')).json || [];
    record('Mission float', 'Owner treasury is empty', 'refused: treasury cannot fund the float; nothing reserved', `${msg(r)}; ledger rows ${nRows.length}`, r.status === 503 && /treasury/.test(r.json?.error?.message || '') && nRows.length === 0);

    const robotEnd = await eventually(() => ausd(robot), v => v === 0n); const total1 = await eventually(total, v => v === total0, 15_000);
    record('Accounting', 'After every mission is closed the robot holds nothing', '0 AUSD and 0 ETH', `${formatUnits(robotEnd, 6)} AUSD, ${formatEther(await pub.getBalance({ address: robot }))} ETH`, robotEnd === 0n && (await pub.getBalance({ address: robot })) === 0n);
    record('Accounting', 'No AUSD was created or lost across owner, robot and vendors', 'sum unchanged', `before ${formatUnits(total0, 6)}, after ${formatUnits(total1, 6)}`, total0 === total1);
  }

  const end = { robot: await ausd(robot), provider: await ausd(provider), owner: owner ? await ausd(owner) : null, robotEth: await pub.getBalance({ address: robot }), facEth: await pub.getBalance({ address: facilitator }) };
  const unique = [...new Set(settledTx)];
  writeFileSync(out, JSON.stringify({ ran_at: new Date().toISOString(), network: NETWORK, asset: AUSD, robot, facilitator, provider, owner, start: { robot_ausd: formatUnits(start.robot, 6), provider_ausd: formatUnits(start.provider, 6), facilitator_eth: formatEther(start.facEth) }, end: { robot_ausd: formatUnits(end.robot, 6), provider_ausd: formatUnits(end.provider, 6), owner_ausd: end.owner === null ? null : formatUnits(end.owner, 6), robot_eth: formatEther(end.robotEth), facilitator_eth: formatEther(end.facEth) }, gas_spent_eth: formatEther(start.facEth - end.facEth), settled_transactions: unique, float_transactions: [...new Set(floatTx)], results }, null, 1));
  console.log(`\n${results.filter(x => x.pass).length}/${results.length} passed; ${unique.length} on-chain payments, ${new Set(floatTx).size} float transfers; wrote ${out}`);
} catch (e) {
  console.error('HARNESS ERROR', e);
  writeFileSync(out, JSON.stringify({ harness_error: String(e), results }, null, 1));
} finally {
  for (const c of children) c.kill();
  stubServer.close();
  setTimeout(() => process.exit(0), 300);
}
