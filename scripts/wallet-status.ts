import {createPublicClient,http,parseAbi,formatEther,formatUnits} from 'viem';
import {baseSepolia} from 'viem/chains';
import {privateKeyToAccount} from 'viem/accounts';
import {AUSD,chain} from '../services/payments/src/chain.js';
const client=createPublicClient({chain:baseSepolia,transport:http(process.env.BASE_SEPOLIA_RPC_URL||'https://sepolia.base.org',{timeout:15000})});
if(await client.getChainId()!==84532)throw new Error('RPC must be Base Sepolia');
const robot=privateKeyToAccount(process.env.ROBOT_PRIVATE_KEY as `0x${string}`);
const facilitator=privateKeyToAccount(process.env.FACILITATOR_PRIVATE_KEY as `0x${string}`);
const abi=parseAbi(['function balanceOf(address) view returns (uint256)']);
const [gas,ausd]=await Promise.all([client.getBalance({address:facilitator.address}),client.readContract({address:AUSD,abi,functionName:'balanceOf',args:[robot.address]})]);
let domain='unverified';
try{await chain();domain='verified against token DOMAIN_SEPARATOR'}catch{domain='verification failed; inspect token name/version and RPC configuration'}
console.log(JSON.stringify({network:'Base Sepolia',robot:robot.address,robot_ausd:formatUnits(ausd,6),facilitator:facilitator.address,facilitator_eth:formatEther(gas),domain,ready:gas>0n&&ausd>0n&&domain.startsWith('verified')},null,2));
