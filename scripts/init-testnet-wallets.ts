/** Creates dedicated, unfunded testnet wallets. Never prints private keys. */
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';

if(existsSync('.env'))throw new Error('.env already exists. Existing wallet configuration has been left untouched.');
let config=readFileSync('.env.example','utf8');
const robot=generatePrivateKey(),facilitator=generatePrivateKey(),provider=generatePrivateKey();
const values:Record<string,string>={SERVICE_KEY:randomBytes(32).toString('hex'),ROBOT_PRIVATE_KEY:robot,FACILITATOR_PRIVATE_KEY:facilitator,PROVIDER_ADDRESS:privateKeyToAccount(provider).address};
for(const [name,value] of Object.entries(values))config=config.replace(new RegExp(`^${name}=.*$`,'m'),`${name}=${value}`);
config+='\n# Dedicated test-only provider key, retained locally for wallet ownership.\nPROVIDER_PRIVATE_KEY='+provider+'\n';
writeFileSync('.env',config,{flag:'wx',mode:0o600});
console.log(JSON.stringify({network:'Base Sepolia (84532)',robot:privateKeyToAccount(robot).address,facilitator:privateKeyToAccount(facilitator).address,provider:privateKeyToAccount(provider).address,configuration:'.env (private, ignored by Git)',next_step:'Fund the facilitator with Base Sepolia ETH, then run npm run wallets:fund. No mainnet funds are used.'},null,2));
