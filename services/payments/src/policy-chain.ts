import { readFileSync } from 'node:fs';
import { createPublicClient, createWalletClient, defineChain, http, isAddress, keccak256, toHex, type Abi, type Address, type Chain, type Hex } from 'viem';
import { bscTestnet } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

// Read at runtime rather than imported: JSON import attributes differ between tsx, tsc and Node versions.
const { abi } = JSON.parse(readFileSync(new URL('../contracts/RoboMarketPolicy.json', import.meta.url), 'utf8')) as { abi: Abi };
const ROBOT = 'robot_001';          // the only robot id the payment service accepts
const SETTLEMENT_CHAIN_ID = 84532n; // payments settle on Base Sepolia; this chain only holds policy and receipts
const EXPLORERS: Record<number, string> = { 97: 'https://testnet.bscscan.com' };
const id = (text: string) => keccak256(toHex(text));
const ausd = (value: bigint) => `${value / 1_000_000n}.${String(value % 1_000_000n).padStart(6, '0')}`;
// viem puts the revert reason in shortMessage on some nodes and in details on others; log both on one line.
const message = (error: unknown) => { const e = error as { shortMessage?: string; details?: string; message?: string } | null;
  return [e?.shortMessage ?? e?.message ?? String(error), e?.details].filter(Boolean).join(' | ').replace(/\s+/g, ' '); };

export function policyChainEnabled(): boolean { return isAddress(process.env.BNB_POLICY_CONTRACT || ''); }

let cached: { key: string; value: ReturnType<typeof build> } | undefined;
// Environment is read on use, not at import, so the server can load .env after importing this module.
function clients() {
  if (!policyChainEnabled()) return null;
  const env = process.env, key = [env.BNB_POLICY_CONTRACT, env.BNB_RPC_URL, env.BNB_CHAIN_ID, env.BNB_OPERATOR_PRIVATE_KEY || env.FACILITATOR_PRIVATE_KEY].join('|');
  if (cached?.key !== key) cached = { key, value: build() };
  return cached.value;
}
function build() {
  const rpc = process.env.BNB_RPC_URL || 'https://bsc-testnet-rpc.publicnode.com';
  const chainId = Number(process.env.BNB_CHAIN_ID || 97);
  const chain: Chain = chainId === bscTestnet.id ? bscTestnet
    : defineChain({ id: chainId, name: `chain-${chainId}`, nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 }, rpcUrls: { default: { http: [rpc] } } });
  const transport = http(rpc, { timeout: 15_000 });
  const operatorKey = process.env.BNB_OPERATOR_PRIVATE_KEY || process.env.FACILITATOR_PRIVATE_KEY;
  const account = operatorKey ? privateKeyToAccount(operatorKey as Hex) : null;
  return { address: process.env.BNB_POLICY_CONTRACT as Address, chainId, account,
    pub: createPublicClient({ chain, transport }), wallet: account && createWalletClient({ account, chain, transport }) };
}

export async function checkOnChain(robotId: string, task: string, vendorId: string, amount: number): Promise<{ ok: boolean; reason: string } | null> {
  try {
    const c = clients(); if (!c) return null;
    const [ok, reason] = await c.pub.readContract({ address: c.address, abi, functionName: 'check', args: [id(robotId), id(task), vendorId, BigInt(amount)] }) as [boolean, string];
    return { ok, reason };
  } catch (error) { console.error('policy-chain check failed:', message(error)); return null; }
}

let queue: Promise<unknown> = Promise.resolve();
let nextNonce = 0;
export function recordOnChain(entry: { robotId: string; task: string; vendorId: string; requestId: string; amount: number; settlementTx: `0x${string}` }): Promise<`0x${string}` | null> {
  // One operator key signs every receipt, so sends run one at a time to keep its nonces in order.
  const run = queue.then(async () => {
    try {
      const c = clients(); if (!c) return null;
      if (!c.wallet || !c.account) throw new Error('no BNB_OPERATOR_PRIVATE_KEY or FACILITATOR_PRIVATE_KEY');
      // A load-balanced public RPC can answer with a count from before our last receipt; never go below what we already used.
      const nonce = Math.max(nextNonce, await c.pub.getTransactionCount({ address: c.account.address, blockTag: 'pending' }));
      const hash = await c.wallet.writeContract({ address: c.address, abi, functionName: 'record', type: 'legacy', nonce,
        args: [id(entry.robotId), id(entry.task), entry.vendorId, id(entry.requestId), BigInt(entry.amount), entry.settlementTx, SETTLEMENT_CHAIN_ID] });
      const receipt = await c.pub.waitForTransactionReceipt({ hash, timeout: 60_000 });
      nextNonce = nonce + 1;
      if (receipt.status !== 'success') throw new Error(`record reverted in ${hash}`);
      return hash;
    } catch (error) { console.error(`policy-chain record failed for ${entry.requestId}:`, message(error)); return null; }
  });
  queue = run;
  return run;
}

export async function policyStatus(): Promise<null | { contract: string; chain_id: number; explorer_url: string; operator: string; max_per_call_ausd: string; max_per_task_ausd: string; max_per_day_ausd: string; receipt_count: number; total_spent_ausd: string }> {
  try {
    const c = clients(); if (!c) return null;
    const read = (functionName: string, args: unknown[] = []) => c.pub.readContract({ address: c.address, abi, functionName, args });
    const [policy, count, total] = await Promise.all([read('policies', [id(ROBOT)]), read('receiptCount'), read('totalSpent', [id(ROBOT)])]) as [[Address, bigint, bigint, bigint, boolean], bigint, bigint];
    const explorer = EXPLORERS[c.chainId];
    return { contract: c.address, chain_id: c.chainId, explorer_url: explorer ? `${explorer}/address/${c.address}` : '', operator: policy[0],
      max_per_call_ausd: ausd(policy[1]), max_per_task_ausd: ausd(policy[2]), max_per_day_ausd: ausd(policy[3]), receipt_count: Number(count), total_spent_ausd: ausd(total) };
  } catch (error) { console.error('policy-chain status failed:', message(error)); return null; }
}
