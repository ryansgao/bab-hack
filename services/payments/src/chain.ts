import { createPublicClient, createWalletClient, http, publicActions, parseAbi, hashDomain, keccak256, toHex, isAddress, type Hex, type Address } from 'viem';
import { baseSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { x402Client, x402HTTPClient } from '@x402/core/client';
import { ExactEvmScheme as BuyerScheme } from '@x402/evm/exact/client';
import { ExactEvmScheme as FacilitatorScheme } from '@x402/evm/exact/facilitator';
import { toFacilitatorEvmSigner } from '@x402/evm';
import type { PaymentRequirements, PaymentRequired } from '@x402/core/types';

export const NETWORK = 'eip155:84532' as const;
export const AUSD = '0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC' as const;
export const abi = parseAbi([
  'function decimals() view returns (uint8)', 'function name() view returns (string)',
  'function balanceOf(address) view returns (uint256)', 'function DOMAIN_SEPARATOR() view returns (bytes32)',
  'function eip712Domain() view returns (bytes1 fields,string name,string version,uint256 chainId,address verifyingContract,bytes32 salt,uint256[] extensions)',
]);
export const missing = () => ['ROBOT_PRIVATE_KEY','FACILITATOR_PRIVATE_KEY','PROVIDER_ADDRESS','SERVICE_KEY'].filter(key => !process.env[key]);
let cached: ReturnType<typeof setup> | undefined;
export function chain() { return cached ??= setup().catch(error => { cached = undefined; throw error; }); }
async function setup() {
  if (missing().length) throw new Error(`Testnet setup missing: ${missing().join(', ')}`);
  if (process.env.AUSD_ADDRESS && process.env.AUSD_ADDRESS.toLowerCase() !== AUSD.toLowerCase()) throw new Error('Only official Base Sepolia AUSD is permitted');
  const rpc = process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org';
  const publicClient = createPublicClient({ chain: baseSepolia, transport: http(rpc, { timeout: 15_000 }) });
  if (await publicClient.getChainId() !== 84532) throw new Error('RPC chain ID is not Base Sepolia');
  const robot = privateKeyToAccount(process.env.ROBOT_PRIVATE_KEY as Hex);
  const facilitator = privateKeyToAccount(process.env.FACILITATOR_PRIVATE_KEY as Hex);
  const wallet = createWalletClient({ account: facilitator, chain: baseSepolia, transport: http(rpc) }).extend(publicActions);
  const signer = toFacilitatorEvmSigner({ ...wallet, address: facilitator.address, verifyTypedData: args => wallet.verifyTypedData(args as Parameters<typeof wallet.verifyTypedData>[0]) }, { confirmationTimeoutMs: 60_000 });
  const decimals = await publicClient.readContract({ address: AUSD, abi, functionName: 'decimals' });
  if (decimals !== 6) throw new Error('Unexpected AUSD decimals; review contracts');
  let name: string, version: string;
  try {
    const domain = await publicClient.readContract({ address: AUSD, abi, functionName: 'eip712Domain' });
    if (domain[3] !== 84532n || domain[4].toLowerCase() !== AUSD.toLowerCase()) throw new Error('Token domain does not match network');
    name = domain[1]; version = domain[2];
  } catch {
    name = process.env.AUSD_DOMAIN_NAME || await publicClient.readContract({ address: AUSD, abi, functionName: 'name' });
    version = process.env.AUSD_DOMAIN_VERSION || '1';
  }
  const expected = hashDomain({domain: {name,version,chainId:84532n,verifyingContract:AUSD}, types: { EIP712Domain: [
    {name:'name',type:'string'},{name:'version',type:'string'},{name:'chainId',type:'uint256'},{name:'verifyingContract',type:'address'},
  ]}});
  const actual = await publicClient.readContract({address:AUSD,abi,functionName:'DOMAIN_SEPARATOR'});
  if (expected.toLowerCase() !== actual.toLowerCase()) throw new Error('AUSD EIP-712 domain mismatch; set verified AUSD_DOMAIN_NAME/VERSION');
  // AUSD is not one of the SDK's default assets, so it must be allowed explicitly. The per-payment
  // cap repeats the wallet's Allowance inside the signer as a second line of defence.
  const atomic = (name: string, fallback: string) => String(Math.round(Number(process.env[name] || fallback) * 1_000_000));
  const signerFor = (account: ReturnType<typeof privateKeyToAccount>, cap?: string) => new x402HTTPClient(x402Client.fromConfig({
    schemes: [{ network: NETWORK, client: new BuyerScheme(account) }],
    spendControls: { allowedAssets: [{ network: NETWORK, asset: AUSD, ...(cap ? { maxAmountPerPayment: cap } : {}) }] },
  }));
  const buyer = signerFor(robot, atomic('MAX_PER_CALL_AUSD', '0.05'));
  // Optional owner wallet: it holds the treasury and sends the robot one mission float at a time,
  // so the most the robot key can ever lose is the float it holds. The owner signer is capped at
  // one mission's Allowance; the robot's return signer is only ever pointed at the owner.
  const owner = process.env.OWNER_PRIVATE_KEY ? privateKeyToAccount(process.env.OWNER_PRIVATE_KEY as Hex) : null;
  const ownerSigner = owner ? signerFor(owner, atomic('MAX_PER_TASK_AUSD', '0.10')) : null;
  const returnSigner = owner ? signerFor(robot) : null;
  return { publicClient, robot, buyer, owner, ownerSigner, returnSigner, signerFor, facilitator: new FacilitatorScheme(signer), domain: { name, version, assetTransferMethod: 'eip3009' } };
}
export type Chain = Awaited<ReturnType<typeof setup>>;
/** Where a vendor is paid. A listing may carry its own payout address; otherwise each vendor gets a
 *  stable address derived from VENDOR_SEED, and PROVIDER_ADDRESS remains the single-address fallback. */
export function payoutAddress(providerId: string, listed?: unknown): Address {
  if (typeof listed === 'string' && isAddress(listed)) return listed;
  const seed = process.env.VENDOR_SEED;
  if (seed) return privateKeyToAccount(keccak256(toHex(`${seed}:${providerId}`))).address;
  const fallback = process.env.PROVIDER_ADDRESS;
  if (!fallback || !isAddress(fallback)) throw new Error('Invalid provider recipient');
  return fallback;
}
/** A signed-in user's own treasury wallet, derived from USER_WALLET_SEED so no key is stored per
 *  user. Without the seed every user shares the owner treasury. */
export function userWallet(account: string) {
  const seed = process.env.USER_WALLET_SEED;
  return seed ? privateKeyToAccount(keccak256(toHex(`${seed}:${account}`))) : null;
}
/** Moves AUSD between our own wallets with the same gasless ERC-3009 path a purchase uses. */
export async function transfer(c: Chain, signer: x402HTTPClient, to: Address, amount: number, what: string): Promise<Hex> {
  const required = requirements(amount, to, c.domain);
  const payload = await signer.createPaymentPayload(challenge(`https://robomarket.invalid/${what}`, required));
  const verified = await c.facilitator.verify(payload, required);
  if (!verified.isValid) throw new Error(`${what} authorization rejected: ${verified.invalidReason || 'invalid'}`);
  const settled = await c.facilitator.settle(payload, required);
  if (!settled.success || !settled.transaction) throw new Error(`${what} did not settle`);
  // Two confirmations: the public RPC is load-balanced and a node one block behind would
  // still report the old balance to whatever reads it next.
  const receipt = await c.publicClient.waitForTransactionReceipt({ hash: settled.transaction as Hex, confirmations: 2, timeout: 60_000 });
  if (receipt.status !== 'success') throw new Error(`${what} reverted onchain`);
  return settled.transaction as Hex;
}
export function requirements(amount: number, payTo: Address, extra: Record<string,unknown>): PaymentRequirements {
  return { scheme:'exact',network:NETWORK,asset:AUSD,amount:String(amount),payTo,maxTimeoutSeconds:120,extra };
}
export function challenge(url: string, accepts: PaymentRequirements): PaymentRequired {
  return { x402Version:2, resource:{url,description:'rBazaar skill inference',mimeType:'application/json'},accepts:[accepts] };
}
