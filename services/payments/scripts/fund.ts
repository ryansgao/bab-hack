// Funds the robot wallet with testnet AUSD on Base Sepolia.
// Usage: node --env-file=../../.env --import tsx scripts/fund.ts [--watch]
// The facilitator wallet pays gas, so it needs a little Base Sepolia ETH first.
import { createPublicClient, createWalletClient, http, parseAbi, formatEther, formatUnits, type Hex, type Address } from 'viem';
import { baseSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

const AUSD = '0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC' as const;
const FAUCET = '0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C' as const;
const erc20 = parseAbi(['function balanceOf(address) view returns (uint256)']);
const faucet = parseAbi(['function requestFunds(address recipient)']);
const rpc = process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org';
const pub = createPublicClient({ chain: baseSepolia, transport: http(rpc) });
const fac = privateKeyToAccount(process.env.FACILITATOR_PRIVATE_KEY as Hex);
const robot = privateKeyToAccount(process.env.ROBOT_PRIVATE_KEY as Hex).address;
const provider = process.env.PROVIDER_ADDRESS as Address;
const wallet = createWalletClient({ account: fac, chain: baseSepolia, transport: http(rpc) });
const ausd = (a: Address) => pub.readContract({ address: AUSD, abi: erc20, functionName: 'balanceOf', args: [a] });

async function status() {
  const [gas, robotAusd, providerAusd] = await Promise.all([pub.getBalance({ address: fac.address }), ausd(robot), ausd(provider)]);
  console.log(JSON.stringify({ facilitator: fac.address, facilitator_eth: formatEther(gas), robot, robot_ausd: formatUnits(robotAusd, 6), provider, provider_ausd: formatUnits(providerAusd, 6) }));
  return { gas, robotAusd };
}

async function mint() {
  const { request } = await pub.simulateContract({ account: fac, address: FAUCET, abi: faucet, functionName: 'requestFunds', args: [robot] });
  const hash = await wallet.writeContract(request);
  const receipt = await pub.waitForTransactionReceipt({ hash });
  console.log(JSON.stringify({ minted: receipt.status, tx: hash, explorer: `https://sepolia.basescan.org/tx/${hash}` }));
}

const watch = process.argv.includes('--watch');
for (;;) {
  const { gas, robotAusd } = await status();
  if (robotAusd > 0n) { console.log('robot already holds AUSD'); break; }
  if (gas > 0n) { await mint(); await status(); break; }
  if (!watch) { console.log('facilitator has no Base Sepolia ETH yet; send some to the facilitator address above'); break; }
  await new Promise(r => setTimeout(r, 15_000));
}
