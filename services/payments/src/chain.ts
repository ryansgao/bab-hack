import { createPublicClient, createWalletClient, http, publicActions, parseAbi, hashDomain, type Hex, type Address } from 'viem';
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
  // cap repeats the wallet's per-call Allowance inside the signer as a second line of defence.
  const cap = String(Math.round(Number(process.env.MAX_PER_CALL_AUSD || '0.05') * 1_000_000));
  const buyer = new x402HTTPClient(x402Client.fromConfig({
    schemes: [{ network: NETWORK, client: new BuyerScheme(robot) }],
    spendControls: { allowedAssets: [{ network: NETWORK, asset: AUSD, maxAmountPerPayment: cap }] },
  }));
  return { publicClient, robot, buyer, facilitator: new FacilitatorScheme(signer), domain: { name, version, assetTransferMethod: 'eip3009' } };
}
export function requirements(amount: number, payTo: Address, extra: Record<string,unknown>): PaymentRequirements {
  return { scheme:'exact',network:NETWORK,asset:AUSD,amount:String(amount),payTo,maxTimeoutSeconds:120,extra };
}
export function challenge(url: string, accepts: PaymentRequirements): PaymentRequired {
  return { x402Version:2, resource:{url,description:'RoboMarket expert shard inference',mimeType:'application/json'},accepts:[accepts] };
}
