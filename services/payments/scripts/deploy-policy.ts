// Deploys RoboMarketPolicy to BSC Testnet (or re-applies the limits to an existing deployment) and prints
// the BNB_POLICY_CONTRACT line for .env. It never writes .env itself.
// Usage: node --env-file=../../.env --import tsx scripts/deploy-policy.ts [--watch]
import { readFileSync } from 'node:fs';
import { createPublicClient, createWalletClient, defineChain, formatEther, getAddress, http, isAddress, keccak256, parseUnits, toHex, type Abi, type Address, type Chain, type Hex } from 'viem';
import { bscTestnet } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

const { abi, bytecode } = JSON.parse(readFileSync(new URL('../contracts/RoboMarketPolicy.json', import.meta.url), 'utf8')) as { abi: Abi; bytecode: Hex };
const key = process.env.BNB_OPERATOR_PRIVATE_KEY || process.env.FACILITATOR_PRIVATE_KEY;
if (!key) { console.error('Set BNB_OPERATOR_PRIVATE_KEY or FACILITATOR_PRIVATE_KEY'); process.exit(1); }
const rpc = process.env.BNB_RPC_URL || 'https://bsc-testnet-rpc.publicnode.com';
const chainId = Number(process.env.BNB_CHAIN_ID || 97);
const chain: Chain = chainId === bscTestnet.id ? bscTestnet
  : defineChain({ id: chainId, name: `chain-${chainId}`, nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 }, rpcUrls: { default: { http: [rpc] } } });
const explorer = chainId === 97 ? 'https://testnet.bscscan.com' : '';
const account = privateKeyToAccount(key as Hex);
const transport = http(rpc, { timeout: 15_000 });
const pub = createPublicClient({ chain, transport });
const wallet = createWalletClient({ account, chain, transport });
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const units = (name: string, fallback: string) => parseUnits(process.env[name] || fallback, 6);

const balance = async () => {
  try {
    const wei = await pub.getBalance({ address: account.address });
    console.log(`deployer ${account.address} balance ${formatEther(wei)} BNB (chain ${chainId})`);
    return wei;
  } catch (error) { console.error(`balance check failed: ${error instanceof Error ? error.message.split('\n')[0] : error}`); return null; }
};
let wei = await balance();
while (!wei && process.argv.includes('--watch')) { await sleep(15_000); wei = await balance(); }
if (wei === null) process.exit(1);
if (wei === 0n) { console.log(`${account.address} needs testnet BNB on chain ${chainId}; nothing deployed`); process.exit(0); }

// Counted locally: a load-balanced public RPC can still report the old count right after a receipt.
let nonce = await pub.getTransactionCount({ address: account.address, blockTag: 'pending' });
const mined = async (label: string, hash: Hex) => {
  const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 120_000 });
  if (receipt.status !== 'success') throw new Error(`${label} reverted in ${hash}`);
  console.log(`${label} ${hash}`);
  return receipt;
};

const existing = process.env.BNB_POLICY_CONTRACT;
let contract: Address, deployTx: Hex | null = null;
if (existing && isAddress(existing) && await pub.getCode({ address: existing })) {
  contract = getAddress(existing);
  console.log(`BNB_POLICY_CONTRACT ${contract} already has code: not deploying, only re-applying setPolicy and setVendors`);
} else {
  deployTx = await wallet.deployContract({ abi, bytecode, type: 'legacy', nonce: nonce++ });
  contract = getAddress((await mined('deploy', deployTx)).contractAddress!);
}
const send = async (functionName: string, args: unknown[]) =>
  mined(functionName, await wallet.writeContract({ address: contract, abi, functionName, args, type: 'legacy', nonce: nonce++ }));

const robot = keccak256(toHex('robot_001'));
await send('setPolicy', [robot, account.address, units('MAX_PER_CALL_AUSD', '0.05'), units('MAX_PER_TASK_AUSD', '0.10'), units('MAX_DAILY_AUSD', '5')]);
const vendors = (process.env.ALLOWED_VENDORS || 'vision_lab,navigation_lab,gripworks,motion_lab').split(',').map(v => v.trim()).filter(Boolean);
await send('setVendors', [robot, vendors, true]);

console.log(JSON.stringify({ contract, deploy_tx: deployTx, explorer: explorer && `${explorer}/address/${contract}` }));
console.log(`BNB_POLICY_CONTRACT=${contract}`);
