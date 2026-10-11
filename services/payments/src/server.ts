import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { parseAbi, type Address, type Hex } from 'viem';
import { decodePaymentSignatureHeader, encodePaymentRequiredHeader, encodePaymentResponseHeader } from '@x402/core/http';
import { Ledger, units, money, fingerprint, type Policy, type Row } from './ledger.js';
import { chain, missing, requirements, challenge, payoutAddress, transfer, userWallet, AUSD, abi, type Chain } from './chain.js';
import { checkOnChain, recordOnChain, policyStatus, policyChainEnabled } from './policy-chain.js';

const app = express();
app.use(express.json({limit:'12mb'}));
const ledger = new Ledger(process.env.PAYMENT_DB || 'data/payments.sqlite');
const policy: Policy = {
  maxCall:units(process.env.MAX_PER_CALL_AUSD || '0.05'), maxTask:units(process.env.MAX_PER_TASK_AUSD || '0.10'),
  maxSession:units(process.env.MAX_SESSION_AUSD || '5'), maxDaily:units(process.env.MAX_DAILY_AUSD || '5'),
  approvalThreshold:units(process.env.APPROVAL_THRESHOLD_AUSD || '0.05'),
  // Default: every vendor in the catalog that sells for real testnet payment.
  vendors:(process.env.ALLOWED_VENDORS || 'vision_lab,navigation_lab,gripworks,motion_lab,edge_vision,sentinel_safety,atlas_perception,budget_bots,feathertouch,lumen_labs,pantry_vision,quantum_grip,routewise').split(',').map(v=>v.trim()).filter(Boolean),
};
const port = Number(process.env.PAYMENT_PORT || 4021);
const serviceHeaders = () => ({'Content-Type':'application/json','X-Service-Key':process.env.SERVICE_KEY || ''});
function requireKey(req: express.Request, res: express.Response, next: express.NextFunction) {
  const expected=Buffer.from(process.env.SERVICE_KEY || ''), actual=Buffer.from(req.get('X-Service-Key') || '');
  if (!expected.length || actual.length !== expected.length || !timingSafeEqual(actual,expected)) {
    res.status(403).json({error:{code:'FORBIDDEN',message:'Service authentication required'}}); return;
  }
  next();
}
const requestSchema = z.object({request_id:z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/), robot_id:z.literal('robot_001'),
  model_id:z.string().regex(/^[a-z0-9_-]{1,64}$/), input:z.record(z.string(),z.unknown())}).strict();
const active = new Set<string>();
// One facilitator wallet submits every settlement. Concurrent submissions collide on its
// transaction nonce and leave payments unconfirmed, so settlements run one at a time.
let settleQueue: Promise<unknown> = Promise.resolve();
function settleSerially<T>(work: () => Promise<T>): Promise<T> {
  const next = settleQueue.then(work, work);
  settleQueue = next.catch(() => undefined);
  return next;
}
const balanceOf = async (c: Chain, address: Address) => Number(await c.publicClient.readContract({address:AUSD,abi,functionName:'balanceOf',args:[address]}));

// ---- mission float (only when OWNER_PRIVATE_KEY is set) ----
// The owner wallet holds the treasury. A mission's first purchase makes the owner send the robot
// that mission's whole Allowance; what is unspent goes back when the mission closes or goes idle.
// Float changes for one mission run one at a time, and never while a purchase of it is in flight.
const floatLocks = new Map<string, Promise<unknown>>();
const purchasing = new Map<string, number>();
function withMission<T>(task: string, work: () => Promise<T>): Promise<T> {
  const next = (floatLocks.get(task) ?? Promise.resolve()).then(work, work);
  floatLocks.set(task, next.catch(() => undefined));
  return next;
}
/** Who funds a mission and gets its unspent float back: the wallet of the user who started it, or
 *  the shared owner treasury when the mission has no account. */
function treasuryOf(c: Chain, task: string) {
  const account = ledger.accountOf(task), wallet = account ? userWallet(account) : null;
  return wallet ? { address: wallet.address, signer: c.signerFor(wallet, String(policy.maxTask)), own: true }
    : { address: c.owner!.address, signer: c.ownerSigner!, own: false };
}
const ensureFloat = (c: Chain, task: string, amount: number) => withMission(task, async () => {
  if (ledger.floatRemaining(task) >= amount) return;
  const topUp = policy.maxTask - ledger.floatNet(task);
  if (topUp <= 0) return;
  const treasury = treasuryOf(c, task);
  if (await balanceOf(c, treasury.address) < topUp) throw new Error(treasury.own
    ? `Your wallet holds less than the ${money(topUp)} AUSD this mission reserves. Add test AUSD first.` : 'Owner treasury cannot fund the mission float');
  const tx = await settleSerially(() => transfer(c, treasury.signer, c.robot.address, topUp, 'mission-float'));
  ledger.floatAdd(task, 'fund', topUp, tx);
  // The float is confirmed onchain, but a lagging RPC node can still show the robot's old
  // balance and make the purchase that follows look unfunded. Wait until the read catches up.
  for (let i = 0; i < 30 && await balanceOf(c, c.robot.address) < amount; i++) await new Promise(resolve => setTimeout(resolve, 500));
});
const returnFloat = (c: Chain, task: string) => withMission(task, async () => {
  if ((purchasing.get(task) || 0) > 0 || ledger.inFlight(task)) return null;
  const remaining = ledger.floatRemaining(task);
  if (remaining <= 0) return null;
  const tx = await settleSerially(() => transfer(c, c.returnSigner!, treasuryOf(c, task).address, remaining, 'float-return'));
  ledger.floatAdd(task, 'sweep', remaining, tx);
  return tx;
});
/** Refuses on policy before any money moves, then makes sure the robot holds this mission's float. */
async function holdFloat(c: Chain, task: string, vendor: string, amount: number) {
  await treasuryReady;
  ledger.check(task, vendor, amount, policy);
  purchasing.set(task, (purchasing.get(task) || 0) + 1);
  const release = () => { const n = (purchasing.get(task) || 1) - 1; if (n > 0) purchasing.set(task, n); else purchasing.delete(task); };
  try { await ensureFloat(c, task, amount); } catch (error) { release(); throw error; }
  return release;
}
// At start, anything the robot holds beyond its open floats belongs to the owner.
const treasuryReady: Promise<void> = (async () => {
  if (!process.env.OWNER_PRIVATE_KEY || missing().length) return;
  const c = await chain();
  const open = ledger.missions().reduce((sum, m) => sum + m.remaining, 0);
  const excess = await balanceOf(c, c.robot.address) - open;
  if (excess <= 0) return;
  const tx = await settleSerially(() => transfer(c, c.returnSigner!, c.owner!.address, excess, 'treasury-consolidation'));
  ledger.floatAdd('treasury', 'consolidate', excess, tx);
  console.log(`moved ${money(excess)} AUSD from the robot to the owner treasury: ${tx}`);
})().catch(error => console.error('treasury consolidation failed:', error instanceof Error ? error.message : error));
const idleSeconds = Number(process.env.FLOAT_IDLE_SECONDS || 90);
setInterval(async () => {
  if (!process.env.OWNER_PRIVATE_KEY || missing().length) return;
  try {
    const c = await chain();
    for (const m of ledger.missions()) {
      // SQLite timestamps are UTC without a zone marker.
      if (m.remaining > 0 && Date.now() - Date.parse(m.lastActivity.replace(' ', 'T') + 'Z') > idleSeconds * 1000) await returnFloat(c, m.task);
    }
  } catch (error) { console.error('idle float return failed:', error instanceof Error ? error.message : error); }
}, 15_000).unref();
const missionView = (m: ReturnType<Ledger['missions']>[number]) => ({ task_id: m.task, funded_ausd: money(m.funded), spent_ausd: money(m.spent),
  returned_ausd: money(m.returned), held_by_robot_ausd: money(m.remaining), last_activity: m.lastActivity,
  transfers: m.transfers.map(t => ({ kind: t.kind === 'fund' ? 'owner_to_robot' : 'robot_to_owner', amount_ausd: money(t.amount), transaction_hash: t.tx,
    explorer_url: `https://sepolia.basescan.org/tx/${t.tx}`, timestamp: t.created_at })) });

// ---- reconciliation of uncertain payments ----
// An uncertain payment keeps its Allowance reserved because its authorization may have been
// broadcast. The chain settles the question: ERC-3009 records every authorization nonce it used.
// Rows are left alone until no request that created them can still be running.
const erc3009 = parseAbi(['function authorizationState(address authorizer, bytes32 nonce) view returns (bool)',
  'event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce)']);
const reconcileAfter = Number(process.env.RECONCILE_AFTER_SECONDS || 240);
async function settlementOf(c: Chain, authorizer: Address, nonce: Hex, row: Row): Promise<Hex | null> {
  try {
    // Base produces a block about every two seconds, and the public RPC answers log queries for
    // at most 200 blocks, so search forward from the purchase time in windows of that size.
    const latest = await c.publicClient.getBlock();
    const age = Number(latest.timestamp) - Date.parse(row.created_at.replace(' ', 'T') + 'Z') / 1000;
    let from = latest.number - BigInt(Math.max(0, Math.ceil(age / 2))) - 20n;
    for (let window = 0; window < 4 && from <= latest.number; window++, from += 200n) {
      const to = from + 199n < latest.number ? from + 199n : latest.number;
      const logs = await c.publicClient.getLogs({ address: AUSD, event: erc3009[1], args: { authorizer, nonce }, fromBlock: from > 0n ? from : 0n, toBlock: to });
      if (logs[0]) return logs[0].transactionHash;
    }
    return null;
  } catch { return null; }
}
async function reconcileOne(c: Chain, row: Row): Promise<'settled' | 'failed' | 'uncertain'> {
  if (row.tx) {
    const receipt = await c.publicClient.getTransactionReceipt({ hash: row.tx as Hex }).catch(() => null);
    if (receipt?.status === 'success') { ledger.update(row.id, 'settled', null, null, 'Reconciled: settled onchain; the inference result was not delivered'); return 'settled'; }
  }
  const stored = ledger.authorizationFor(row.id);
  // The authorization is stored before it is submitted, so without one nothing was ever sent.
  if (!stored) { ledger.update(row.id, 'failed', null, null, 'Reconciled: no payment authorization was ever submitted'); return 'failed'; }
  const auth = stored.payload?.authorization as { from: Address; nonce: Hex; validBefore: string } | undefined;
  if (!auth?.from || !auth.nonce) return 'uncertain';
  if (await c.publicClient.readContract({ address: AUSD, abi: erc3009, functionName: 'authorizationState', args: [auth.from, auth.nonce] })) {
    ledger.update(row.id, 'settled', await settlementOf(c, auth.from, auth.nonce, row), null, 'Reconciled: settled onchain; the inference result was not delivered');
    return 'settled';
  }
  // Unused and past its deadline: the token contract will never accept it.
  if (Date.now() / 1000 > Number(auth.validBefore) + 30) { ledger.update(row.id, 'failed', null, null, 'Reconciled: authorization expired unused; no payment was made'); return 'failed'; }
  return 'uncertain';
}
let reconciling: Promise<Record<string, string>> | undefined;
function reconcile() {
  return reconciling ??= (async () => {
    const outcome: Record<string, string> = {};
    if (missing().length) return outcome;
    const c = await chain();
    for (const row of ledger.uncertain(reconcileAfter)) outcome[row.id] = await reconcileOne(c, row).catch(() => 'uncertain');
    return outcome;
  })().finally(() => { reconciling = undefined; });
}
setTimeout(() => reconcile().catch(() => undefined), 5_000).unref();
setInterval(() => reconcile().catch(error => console.error('reconciliation failed:', error instanceof Error ? error.message : error)), 60_000).unref();

async function offer(modelId: string) {
  const response = await fetch(`${process.env.API_URL || 'http://127.0.0.1:8000'}/api/marketplace/models`, {signal:AbortSignal.timeout(8000)});
  if (!response.ok) throw new Error('Marketplace unavailable');
  const models = await response.json() as any[];
  const model = models.find(m=>m.id===modelId);
  if (!model || model.status !== 'available') throw new Error('Shard unavailable');
  return model;
}
function cachedResponse(id: string, res: express.Response) {
  const row=ledger.get(id)!;
  if (row.status==='settled' && row.result) { res.json({payment:ledger.receipt(row),inference:JSON.parse(row.result)}); return true; }
  if (row.status !== 'reserved') { res.status(409).json({payment:ledger.receipt(row),error:{code:'RECONCILIATION_REQUIRED',message:row.error || `Request is ${row.status}; do not buy again`}}); return true; }
  return false;
}
app.get('/health', (_req,res)=>res.json({mode:'testnet',ready:missing().length===0,missing:missing(),asset:AUSD,policy_chain:policyChainEnabled()}));
// The dashboard polls /wallet; the BNB policy contract is read at most every 20 seconds.
let policyCache: { at: number; value: Awaited<ReturnType<typeof policyStatus>> } | undefined;
async function policyChain() {
  if (!policyCache || Date.now() - policyCache.at > 20_000) policyCache = { at: Date.now(), value: await policyStatus() };
  return policyCache.value;
}
// ---- user accounts: the gateway names the signed-in user in X-Account ----
const accountOf = (req: express.Request) => { const id = req.get('X-Account'); return id && /^[a-z0-9]{4,40}$/.test(id) ? id : null; };
const starterGrant = units(process.env.STARTER_GRANT_AUSD || '1');
const granting = new Set<string>();
function ownWallet(c: Chain, req: express.Request) {
  const account = accountOf(req), wallet = account && c.owner ? userWallet(account) : null;
  if (!account || !wallet) throw new Error('Your wallet is not enabled on this server: set OWNER_PRIVATE_KEY and USER_WALLET_SEED');
  return { account, wallet };
}
const transferView = (t: ReturnType<Ledger['walletTransfers']>[number]) => ({ kind: t.kind, amount_ausd: money(t.amount), counterparty: t.counterparty,
  transaction_hash: t.tx, explorer_url: `https://sepolia.basescan.org/tx/${t.tx}`, timestamp: t.created_at });
app.get('/accounts/transfers',requireKey,(req,res)=>{ const account=accountOf(req); res.json({transfers:account?ledger.walletTransfers(account).map(transferView):[]}); });
// A new account receives a little test AUSD from the owner treasury, once, so it can pay for missions.
app.post('/accounts/grant',requireKey,async(req,res)=>{
  const c=await chain(), {account,wallet}=ownWallet(c,req);
  if(granting.has(account) || ledger.walletTransfers(account).some(t=>t.kind==='grant'))throw new Error('Your wallet already received its starter funds');
  // Sign-up is open, so the number of grants per day bounds what new accounts can take from the treasury.
  if(ledger.grantsToday() + granting.size >= Number(process.env.STARTER_GRANTS_PER_DAY || 200))throw new Error('Your wallet cannot be funded today: the daily starter grants are used up');
  granting.add(account);
  try {
    if(await balanceOf(c,c.owner!.address) < starterGrant)throw new Error('The treasury cannot fund starter grants right now');
    const tx=await settleSerially(()=>transfer(c,c.signerFor(c.owner!,String(starterGrant)),wallet.address,starterGrant,'starter-grant'));
    ledger.walletAdd(account,'grant',starterGrant,c.owner!.address,tx);
    res.json({amount_ausd:money(starterGrant),transaction_hash:tx,explorer_url:`https://sepolia.basescan.org/tx/${tx}`});
  } finally { granting.delete(account); }
});
app.post('/accounts/withdraw',requireKey,async(req,res)=>{
  const {to,amount_ausd}=z.object({to:z.string().regex(/^0x[0-9a-fA-F]{40}$/),amount_ausd:z.string()}).parse(req.body);
  const c=await chain(), {account,wallet}=ownWallet(c,req), amount=units(amount_ausd);
  if(amount<=0 || await balanceOf(c,wallet.address) < amount)throw new Error('Your wallet holds less than this withdrawal');
  const tx=await settleSerially(()=>transfer(c,c.signerFor(wallet,String(amount)),to as Address,amount,'withdrawal'));
  ledger.walletAdd(account,'withdraw',amount,to,tx);
  res.json({amount_ausd:money(amount),to,transaction_hash:tx,explorer_url:`https://sepolia.basescan.org/tx/${tx}`});
});
// A user tops up their rBazaar wallet from a wallet they hold themselves (Rainbow, Coinbase, MetaMask,
// a hardware wallet …). They sign one ERC-3009 authorization and the facilitator submits it, so the
// user pays no gas. The recipient is always the account's own wallet, whatever the request says.
app.post('/accounts/deposit',requireKey,async(req,res)=>{
  const body=z.object({from:z.string().regex(/^0x[0-9a-fA-F]{40}$/),amount_ausd:z.string(),valid_after:z.string().regex(/^\d{1,12}$/),
    valid_before:z.string().regex(/^\d{1,12}$/),nonce:z.string().regex(/^0x[0-9a-fA-F]{64}$/),signature:z.string().regex(/^0x[0-9a-fA-F]{130,4000}$/)}).parse(req.body);
  const c=await chain(), {account,wallet}=ownWallet(c,req), amount=units(body.amount_ausd);
  if(amount<=0)throw new Error('Your wallet deposit must be a positive amount');
  const required=requirements(amount,wallet.address,c.domain);
  const payload={x402Version:2,resource:{url:'https://rbazaar.invalid/deposit',description:'rBazaar wallet deposit',mimeType:'application/json'},accepted:required,
    payload:{authorization:{from:body.from,to:wallet.address,value:String(amount),validAfter:body.valid_after,validBefore:body.valid_before,nonce:body.nonce},signature:body.signature}};
  const verified=await c.facilitator.verify(payload as any,required);
  if(!verified.isValid)throw new Error(`Your wallet signature was not accepted: ${verified.invalidReason || 'invalid'}`);
  const tx=await settleSerially(async()=>{
    const settled=await c.facilitator.settle(payload as any,required);
    if(!settled.success || !settled.transaction)throw new Error('Your wallet deposit did not settle');
    const receipt=await c.publicClient.waitForTransactionReceipt({hash:settled.transaction as Hex,confirmations:2,timeout:60_000});
    if(receipt.status!=='success')throw new Error('Your wallet deposit reverted onchain');
    return settled.transaction as Hex;
  });
  ledger.walletAdd(account,'deposit',amount,body.from,tx);
  res.json({amount_ausd:money(amount),from:body.from,transaction_hash:tx,explorer_url:`https://sepolia.basescan.org/tx/${tx}`});
});
// Sign-in with a wallet: the gateway asks whether this address signed this message. viem also
// accepts smart-contract wallets (ERC-1271), which a plain signature recovery would reject.
app.post('/verify-signature',requireKey,async(req,res)=>{
  const {address,message,signature}=z.object({address:z.string().regex(/^0x[0-9a-fA-F]{40}$/),message:z.string().max(2000),signature:z.string().regex(/^0x[0-9a-fA-F]{130,4000}$/)}).parse(req.body);
  const c=await chain();
  res.json({valid:await c.publicClient.verifyMessage({address:address as Address,message,signature:signature as Hex}).catch(()=>false)});
});
app.get('/wallet',requireKey,async (req,res)=>{
  let address=null, balance=null, setupError=null, ownerAddress=null, treasury=null, own=false, domain=null;
  try { const c=await chain(); address=c.robot.address; balance=money(await balanceOf(c,address));
    domain={name:c.domain.name,version:c.domain.version,chainId:84532,verifyingContract:AUSD};
    if(c.owner){
      // A signed-in user sees their own wallet; everyone else sees the shared owner treasury.
      const account=accountOf(req), wallet=account?userWallet(account):null;
      own=!!wallet; ownerAddress=wallet?wallet.address:c.owner.address; treasury=money(await balanceOf(c,ownerAddress)); } }
  catch { setupError=missing().length ? `Missing ${missing().join(', ')}` : 'RPC or token validation failed'; }
  const account=accountOf(req);
  res.json({robot_id:'robot_001',wallet_address:address,balance_ausd:balance,mode:'testnet',setup_error:setupError,
    own_wallet:own,asset:AUSD,asset_domain:domain,network:'Base Sepolia',owner_explorer_url:ownerAddress?`https://sepolia.basescan.org/address/${ownerAddress}`:null,
    starter_grant:own?{amount_ausd:money(starterGrant),claimed:ledger.walletTransfers(account!).some(t=>t.kind==='grant')}:null,
    custody:ownerAddress?'mission_float':'robot_holds_balance',owner_address:ownerAddress,owner_treasury_ausd:treasury,policy_chain:await policyChain(),
    session_used_ausd:money(ledger.used()),remaining_allowance_ausd:money(Math.max(0,policy.maxSession-ledger.used())),
    allowance:{max_per_request_ausd:money(policy.maxCall),max_per_task_ausd:money(policy.maxTask),max_session_ausd:money(policy.maxSession),max_daily_ausd:money(policy.maxDaily),approved_vendors:policy.vendors}});
});
app.get('/transactions',requireKey,(_req,res)=>res.json(ledger.rows().map(row=>ledger.receipt(row))));
app.get('/vendors',requireKey,(_req,res)=>{
  const earned=ledger.earnings();
  res.json(policy.vendors.map(vendor=>{
    const payTo=payoutAddress(vendor), rows=earned.filter(e=>e.vendor===vendor);
    return {provider_id:vendor,pay_to:payTo,payments:rows.reduce((n,e)=>n+e.payments,0),earned_ausd:money(rows.reduce((n,e)=>n+e.earned,0)),
      explorer_url:`https://sepolia.basescan.org/address/${payTo}`};
  }));
});
app.get('/missions',requireKey,(_req,res)=>res.json(ledger.missions().map(missionView)));
app.post('/reconcile',requireKey,async(_req,res)=>{
  const outcome=await reconcile();
  res.json({reconciled:outcome,still_uncertain:ledger.rows().filter(row=>row.status==='uncertain').length});
});
app.post('/missions/:task/close',requireKey,async(req,res)=>{
  const task=z.string().regex(/^[a-zA-Z0-9-]{1,100}$/).parse(req.params.task);
  const c=await chain();
  if(!c.owner)throw new Error('Mission float is not enabled: set OWNER_PRIVATE_KEY');
  const tx=await returnFloat(c,task);
  const mission=ledger.missions().find(m=>m.task===task);
  res.json({task_id:task,returned:!!tx,transaction_hash:tx,mission:mission?missionView(mission):null});
});

app.post('/purchase',requireKey,async(req,res)=>{
  const {max_price_ausd,...input}=z.object({max_price_ausd:z.string().regex(/^(0|[1-9]\d{0,8})(\.\d{1,6})?$/)}).passthrough().parse(req.body);
  const body=requestSchema.parse(input);
  const previous=ledger.get(body.request_id);
  if (previous) {
    if(previous.digest!==fingerprint(body)) {res.status(409).json({error:{code:'IDEMPOTENCY_CONFLICT',message:'Request ID reused with different input'}});return;}
    if(cachedResponse(body.request_id,res))return;
    res.status(409).json({error:{code:'IN_PROGRESS',message:'Purchase already reserved; inspect ledger'}});return;
  }
  const model=await offer(body.model_id);
  if(model.execution_mode==='simulation')throw new Error('Simulation providers cannot accept real payments');
  if(units(model.price_ausd)>units(max_price_ausd))throw new Error('Mission Allowance exceeded: shard price changed after selection');
  const validation=await fetch(`${process.env.MODEL_URL || 'http://127.0.0.1:8001'}/internal/validate`,{method:'POST',headers:serviceHeaders(),body:JSON.stringify(body),signal:AbortSignal.timeout(15_000)});
  if(!validation.ok)throw new Error('Model input or readiness invalid; no payment authorized');
  const c=await chain(); // Fail before reservation if setup is incomplete.
  const payTo=payoutAddress(model.provider_id,model.payout_address);
  const amount=units(model.price_ausd), task=body.request_id.split('_')[0];
  // A mission started by a signed-in user is funded from, and refunded to, that user's wallet.
  const account=accountOf(req);
  if(account)ledger.bindAccount(task,account);
  // The owner's policy also lives in a contract on BNB chain. A refusal from it blocks the purchase.
  // An unreachable chain does not: the Allowance below enforces the same limits locally.
  const verdict=await checkOnChain(body.robot_id,task,model.provider_id,amount);
  if(verdict && !verdict.ok)throw new Error(`BNB policy refused the purchase: ${verdict.reason}`);
  const release=c.owner?await holdFloat(c,task,model.provider_id,amount):()=>{};
  try {
  const balance=await c.publicClient.readContract({address:AUSD,abi,functionName:'balanceOf',args:[c.robot.address]});
  // Outstanding reservations protect the wallet from concurrent authorization overspend. With a
  // mission float only this mission's reservations draw on the float the robot was just sent.
  const pending=c.owner?ledger.used("AND task=? AND status IN ('reserved','settling')",[task]):ledger.used("AND status IN ('reserved','settling','uncertain')");
  if(balance < BigInt(amount+pending))throw new Error('Insufficient unreserved AUSD balance');
  ledger.reserve(body.request_id,task,fingerprint(body),model.provider_id,model.id,amount,policy,payTo);
  try {
    const url=`http://127.0.0.1:${port}/api/inference/${body.model_id}`;
    const initial=await fetch(url,{method:'POST',headers:serviceHeaders(),body:JSON.stringify(body),signal:AbortSignal.timeout(20_000)});
    if(initial.status!==402)throw new Error('Provider did not return a valid 402 challenge');
    const required=c.buyer.getPaymentRequiredResponse(name=>initial.headers.get(name));
    const expected=requirements(amount,payTo,c.domain);
    if(required.accepts.length!==1 || fingerprint(required.accepts[0])!==fingerprint(expected))throw new Error('Provider payment requirements changed');
    const payload=await c.buyer.createPaymentPayload(required);
    const headers=c.buyer.encodePaymentSignatureHeader(payload);
    // Once an authorization leaves this process, failure is ambiguous until reconciled.
    const paid=await fetch(url,{method:'POST',headers:{...serviceHeaders(),...headers},body:JSON.stringify(body),signal:AbortSignal.timeout(150_000)});
    const response=await paid.json();
    res.status(paid.status).json(response);
  } catch (error) {
    console.error('purchase interrupted:', error instanceof Error ? error.message : error);
    const row=ledger.get(body.request_id)!;
    if(row.status==='reserved')ledger.update(body.request_id,'uncertain',null,null,'Purchase interrupted; reconcile before retry');
    res.status(503).json({payment:ledger.receipt(ledger.get(body.request_id)!),error:{code:'PURCHASE_INTERRUPTED',message:'Purchase interrupted. Inspect ledger; automatic repeat payment disabled.'}});
  }
  } finally { release(); }
});

app.post('/api/inference/:modelId',requireKey,async(req,res)=>{
  const body=requestSchema.parse(req.body);
  if(body.model_id!==req.params.modelId)throw new Error('Model mismatch');
  const model=await offer(body.model_id);
  if(model.execution_mode==='simulation')throw new Error('Simulation providers cannot accept real payments');
  const c=await chain();
  const payTo=payoutAddress(model.provider_id,model.payout_address);
  const required=requirements(units(model.price_ausd),payTo,c.domain);
  const paymentHeader=req.get('PAYMENT-SIGNATURE');
  if(!paymentHeader) {
    const paymentRequired=challenge(`http://127.0.0.1:${port}/api/inference/${model.id}`,required);
    res.set('PAYMENT-REQUIRED',encodePaymentRequiredHeader(paymentRequired)).status(402).json(paymentRequired);return;
  }
  if(active.has(body.request_id)){res.status(409).json({error:{code:'IN_PROGRESS',message:'Inference purchase in progress'}});return;}
  active.add(body.request_id);
  try {
    const row=ledger.get(body.request_id);
    if(!row || row.digest!==fingerprint(body))throw new Error('A matching wallet reservation is required');
    if(cachedResponse(body.request_id,res))return;
    if(row.amount!==units(model.price_ausd))throw new Error('Price changed after reservation');
    const payload=decodePaymentSignatureHeader(paymentHeader);
    const verified=await c.facilitator.verify(payload,required);
    if(!verified.isValid || verified.payer?.toLowerCase()!==c.robot.address.toLowerCase()){
      ledger.update(body.request_id,'failed',null,null,'Invalid payment authorization');
      res.status(402).json({error:{code:'INVALID_PAYMENT',message:'Payment verification failed'}});return;
    }
    const auth=(payload.payload as any).authorization;
    if(!auth?.nonce)throw new Error('ERC-3009 authorization required');
    ledger.authorization(body.request_id,`${AUSD}:${verified.payer}:${auth.nonce}`.toLowerCase(),payload);
    ledger.update(body.request_id,'settling');
    const settled=await settleSerially(async()=>{
      const outcome=await c.facilitator.settle(payload,required);
      if(outcome.success && outcome.transaction)await c.publicClient.waitForTransactionReceipt({hash:outcome.transaction as Hex,confirmations:1,timeout:60_000});
      return outcome;
    });
    if(!settled.success || !settled.transaction){
      ledger.update(body.request_id,'uncertain',settled.transaction || null,null,'Settlement not confirmed; reconcile before retry');
      res.status(503).json({payment:ledger.receipt(ledger.get(body.request_id)!),error:{code:'SETTLEMENT_UNCONFIRMED',message:'No verified settlement'}});return;
    }
    const receipt=await c.publicClient.waitForTransactionReceipt({hash:settled.transaction as Hex,confirmations:1,timeout:60_000});
    if(receipt.status!=='success')throw new Error('Onchain transaction reverted');
    ledger.update(body.request_id,'settled',settled.transaction);
    // Tamper-evident receipt on BNB chain. Not awaited: a second chain must not delay the robot.
    void recordOnChain({robotId:body.robot_id,task:row.task,vendorId:row.vendor,requestId:body.request_id,amount:row.amount,settlementTx:settled.transaction as Hex})
      .then(audit=>{ if(audit){ ledger.setAudit(body.request_id,audit); policyCache=undefined; } });
    res.set('PAYMENT-RESPONSE',encodePaymentResponseHeader(settled));
    try {
      const inference=await fetch(`${process.env.MODEL_URL || 'http://127.0.0.1:8001'}/internal/inference`,{method:'POST',headers:serviceHeaders(),body:JSON.stringify(body),signal:AbortSignal.timeout(90_000)});
      if(!inference.ok)throw new Error(`Model worker returned HTTP ${inference.status}`);
      const output=await inference.json();
      ledger.update(body.request_id,'settled',settled.transaction,output);
      res.json({payment:ledger.receipt(ledger.get(body.request_id)!),inference:output});
    } catch {
      ledger.update(body.request_id,'settled',settled.transaction,null,'Inference failed after payment; do not purchase again');
      res.status(503).json({payment:ledger.receipt(ledger.get(body.request_id)!),error:{code:'INFERENCE_FAILED',message:'Payment settled but model inference failed; inspect worker and receipt'}});
    }
  } catch (error) {
    console.error('provider failed:', error instanceof Error ? error.message : error);
    const row=ledger.get(body.request_id);
    if(row && row.status!=='settled')ledger.update(body.request_id,'uncertain',null,null,'Provider interrupted; reconciliation required');
    res.status(503).json({payment:row?ledger.receipt(ledger.get(body.request_id)!):null,error:{code:'PROVIDER_FAILED',message:'Provider rejected or could not complete payment; inspect ledger'}});
  } finally { active.delete(body.request_id); }
});
app.use((error: Error,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{
  console.error('payment request failed:', error.message);
  res.status(error instanceof z.ZodError?422:503).json({error:{code:'SERVICE_UNAVAILABLE',message:error instanceof z.ZodError?'Invalid inference request':missing().length?`Testnet setup missing: ${missing().join(', ')}`:/Allowance|allowlist|threshold|Insufficient unreserved|treasury|Mission float|BNB policy|Your wallet/.test(error.message)?error.message:'Purchase unavailable: check Allowance, provider and RPC configuration'}});
});
app.listen(port,process.env.PAYMENT_HOST || '127.0.0.1',()=>console.log(`rBazaar x402 service on ${port}; mode=testnet; configured=${missing().length===0}`));
