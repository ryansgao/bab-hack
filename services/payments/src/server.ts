import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { isAddress, type Address, type Hex } from 'viem';
import { decodePaymentSignatureHeader, encodePaymentRequiredHeader, encodePaymentResponseHeader } from '@x402/core/http';
import { Ledger, units, money, fingerprint, type Policy } from './ledger.js';
import { chain, missing, requirements, challenge, AUSD, abi } from './chain.js';

const app = express();
app.use(express.json({limit:'12mb'}));
const ledger = new Ledger(process.env.PAYMENT_DB || 'data/payments.sqlite');
const policy: Policy = {
  maxCall:units(process.env.MAX_PER_CALL_AUSD || '0.05'), maxTask:units(process.env.MAX_PER_TASK_AUSD || '0.10'),
  maxSession:units(process.env.MAX_SESSION_AUSD || '5'), maxDaily:units(process.env.MAX_DAILY_AUSD || '5'),
  approvalThreshold:units(process.env.APPROVAL_THRESHOLD_AUSD || '0.05'),
  vendors:(process.env.ALLOWED_VENDORS || 'vision_lab,navigation_lab,gripworks,motion_lab').split(','),
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
app.get('/health', (_req,res)=>res.json({mode:'testnet',ready:missing().length===0,missing:missing(),asset:AUSD}));
app.get('/wallet',requireKey,async (_req,res)=>{
  let address=null, balance=null, setupError=null;
  try { const c=await chain(); address=c.robot.address; balance=money(Number(await c.publicClient.readContract({address:AUSD,abi,functionName:'balanceOf',args:[address]}))); }
  catch { setupError=missing().length ? `Missing ${missing().join(', ')}` : 'RPC or token validation failed'; }
  res.json({robot_id:'robot_001',wallet_address:address,balance_ausd:balance,mode:'testnet',setup_error:setupError,
    session_used_ausd:money(ledger.used()),remaining_allowance_ausd:money(Math.max(0,policy.maxSession-ledger.used())),
    allowance:{max_per_request_ausd:money(policy.maxCall),max_per_task_ausd:money(policy.maxTask),max_session_ausd:money(policy.maxSession),max_daily_ausd:money(policy.maxDaily),approved_vendors:policy.vendors}});
});
app.get('/transactions',requireKey,(_req,res)=>res.json(ledger.rows().map(row=>ledger.receipt(row))));

app.post('/purchase',requireKey,async(req,res)=>{
  const body=requestSchema.parse(req.body);
  const previous=ledger.get(body.request_id);
  if (previous) {
    if(previous.digest!==fingerprint(body)) {res.status(409).json({error:{code:'IDEMPOTENCY_CONFLICT',message:'Request ID reused with different input'}});return;}
    if(cachedResponse(body.request_id,res))return;
    res.status(409).json({error:{code:'IN_PROGRESS',message:'Purchase already reserved; inspect ledger'}});return;
  }
  const model=await offer(body.model_id);
  const c=await chain(); // Fail before reservation if setup is incomplete.
  const payTo=process.env.PROVIDER_ADDRESS!;
  if(!isAddress(payTo))throw new Error('Invalid provider recipient');
  const amount=units(model.price_ausd);
  const balance=await c.publicClient.readContract({address:AUSD,abi,functionName:'balanceOf',args:[c.robot.address]});
  // Outstanding reservations protect the wallet from concurrent authorization overspend.
  const pending=ledger.used("AND status IN ('reserved','settling','uncertain')");
  if(balance < BigInt(amount+pending))throw new Error('Insufficient unreserved AUSD balance');
  ledger.reserve(body.request_id,body.request_id.split('_')[0],fingerprint(body),model.provider_id,model.id,amount,policy);
  try {
    const url=`http://127.0.0.1:${port}/api/inference/${body.model_id}`;
    const initial=await fetch(url,{method:'POST',headers:serviceHeaders(),body:JSON.stringify(body),signal:AbortSignal.timeout(20_000)});
    if(initial.status!==402)throw new Error('Provider did not return a valid 402 challenge');
    const required=c.buyer.getPaymentRequiredResponse(name=>initial.headers.get(name));
    const expected=requirements(amount,payTo as Address,c.domain);
    if(required.accepts.length!==1 || fingerprint(required.accepts[0])!==fingerprint(expected))throw new Error('Provider payment requirements changed');
    const payload=await c.buyer.createPaymentPayload(required);
    const headers=c.buyer.encodePaymentSignatureHeader(payload);
    // Once an authorization leaves this process, failure is ambiguous until reconciled.
    const paid=await fetch(url,{method:'POST',headers:{...serviceHeaders(),...headers},body:JSON.stringify(body),signal:AbortSignal.timeout(150_000)});
    const response=await paid.json();
    res.status(paid.status).json(response);
  } catch {
    const row=ledger.get(body.request_id)!;
    if(row.status==='reserved')ledger.update(body.request_id,'uncertain',null,null,'Purchase interrupted; reconcile before retry');
    res.status(503).json({payment:ledger.receipt(ledger.get(body.request_id)!),error:{code:'PURCHASE_INTERRUPTED',message:'Purchase interrupted. Inspect ledger; automatic repeat payment disabled.'}});
  }
});

app.post('/api/inference/:modelId',requireKey,async(req,res)=>{
  const body=requestSchema.parse(req.body);
  if(body.model_id!==req.params.modelId)throw new Error('Model mismatch');
  const model=await offer(body.model_id), c=await chain();
  const payTo=process.env.PROVIDER_ADDRESS!;
  if(!isAddress(payTo))throw new Error('Invalid recipient');
  const required=requirements(units(model.price_ausd),payTo as Address,c.domain);
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
    const settled=await c.facilitator.settle(payload,required);
    if(!settled.success || !settled.transaction){
      ledger.update(body.request_id,'uncertain',settled.transaction || null,null,'Settlement not confirmed; reconcile before retry');
      res.status(503).json({payment:ledger.receipt(ledger.get(body.request_id)!),error:{code:'SETTLEMENT_UNCONFIRMED',message:'No verified settlement'}});return;
    }
    const receipt=await c.publicClient.waitForTransactionReceipt({hash:settled.transaction as Hex,confirmations:1,timeout:60_000});
    if(receipt.status!=='success')throw new Error('Onchain transaction reverted');
    ledger.update(body.request_id,'settled',settled.transaction);
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
  } catch {
    const row=ledger.get(body.request_id);
    if(row && row.status!=='settled')ledger.update(body.request_id,'uncertain',null,null,'Provider interrupted; reconciliation required');
    res.status(503).json({payment:row?ledger.receipt(ledger.get(body.request_id)!):null,error:{code:'PROVIDER_FAILED',message:'Provider rejected or could not complete payment; inspect ledger'}});
  } finally { active.delete(body.request_id); }
});
app.use((error: Error,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{
  res.status(error instanceof z.ZodError?422:503).json({error:{code:'SERVICE_UNAVAILABLE',message:error instanceof z.ZodError?'Invalid inference request':missing().length?`Testnet setup missing: ${missing().join(', ')}`:/Allowance|allowlist|threshold|Insufficient unreserved/.test(error.message)?error.message:'Purchase unavailable: check Allowance, provider and RPC configuration'}});
});
app.listen(port,process.env.PAYMENT_HOST || '127.0.0.1',()=>console.log(`RoboMarket x402 service on ${port}; mode=testnet; configured=${missing().length===0}`));
