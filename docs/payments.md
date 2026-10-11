# AUSD / x402 setup

This implementation pins `@x402/core` and `@x402/evm` 2.28.0, and viem 2.57.4.
It uses x402 v2 headers and the SDK's exact EVM buyer and facilitator schemes.
The local facilitator pays transaction gas; Scout signs the ERC-3009 payment
without submitting its own gas transaction.

## Configure testnet funds

1. Create separate test-only robot and facilitator wallets in your own wallet tool.
   Put their keys in `.env` as `ROBOT_PRIVATE_KEY` and `FACILITATOR_PRIVATE_KEY`.
   Set `PROVIDER_ADDRESS` to the fallback recipient. Set `VENDOR_SEED` to give every
   vendor its own payout address (derived from the seed and the vendor ID); a listing
   that carries a `payout_address` is paid there instead. `GET /vendors` lists each
   approved vendor's address and what it has earned.
2. Fund the facilitator with Base Sepolia ETH. Fund the robot with Agora test AUSD.
   Agora lists Base Sepolia AUSD as
   `0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC`, with faucet contract
   `0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C`. Confirm these with the sponsor before
   the demo. Its faucet exposes `requestFunds(address)`; use the official guide and
   a gas-funded test wallet to call it on the intended network.
3. Configure `BASE_SEPOLIA_RPC_URL` if the public RPC is unreliable. Startup checks
   chain ID 84532, token decimals, and the EIP-712 domain separator. A domain mismatch
   blocks signing. If needed, obtain verified domain name/version from the token
   deployment and set `AUSD_DOMAIN_NAME` and `AUSD_DOMAIN_VERSION`.
4. Set Allowance limits and approved vendor IDs. Session allowance is deliberately
   persistent across service restarts. Daily limits use UTC calendar days.
5. Warm model weights before buying inference. Run a small plan and inspect the
   actual Base Sepolia receipt. Do not call a demo live until this succeeds.

## Wallet custody: owner treasury and mission float

Without `OWNER_PRIVATE_KEY` the robot wallet holds the whole balance and the Allowance
is enforced only by this service. With it, three roles exist:

| Wallet | Stands for | Holds |
|---|---|---|
| Owner | the fleet operator | the AUSD treasury |
| Robot | one robot | the float of its open missions, and no ETH |
| Vendor (one per vendor) | each model seller | what it earned |

On a mission's first purchase the owner sends the robot that mission's whole
Allowance (`MAX_PER_TASK_AUSD`), after every Allowance rule has passed and before
anything is reserved. The robot pays vendors from it. `POST /missions/:task/close`
returns the unspent part to the owner; a mission idle for `FLOAT_IDLE_SECONDS` returns
it without a call. At start, anything the robot holds beyond its open floats moves to
the owner. The chain therefore bounds what the robot key can lose to the floats it
holds. All three transfers use the same gasless ERC-3009 path as a purchase: neither
the owner nor the robot ever holds ETH. `GET /missions` shows each mission's funding,
spend and return with transaction links; `/wallet` reports `custody`, the owner
address and the treasury.

Two payment services must not share wallet keys with separate ledgers: each would
treat the other's floats as excess and return them to the owner.

## Policy and audit trail on BNB chain

Settlement stays in AUSD on Base Sepolia. The owner's permissions and a receipt for
every payment live in `RoboMarketPolicy` on BSC Testnet
(`services/payments/contracts/RoboMarketPolicy.sol`):

- The owner sets, per robot, the operator key, the per-call, per-mission and daily
  limits, and the allowed vendors.
- Before signing, the payment service calls the contract's `check` view. A refusal
  (`vendor not allowed`, `per-call limit`, `per-task limit`, `daily limit`) blocks the
  purchase before any money moves. If BNB chain cannot be reached the purchase is not
  blocked: the local Allowance enforces the same limits.
- After settlement the operator calls `record` with the mission, vendor, amount and
  the Base transaction hash. The contract re-checks the policy, refuses a second
  receipt for the same request, and keeps running totals per mission and per day.
  Receipts are not awaited by the purchase; `/transactions` shows
  `audit_transaction_hash` once the receipt is mined.

The contract holds no funds and cannot stop a transfer by itself; it makes the policy
and the payment history public and tamper-evident. A payment settled on Base with no
receipt on BNB chain is the signal that something bypassed the policy.

Deploy: fund the operator address with testnet BNB, run
`node --env-file=../../.env --import tsx scripts/deploy-policy.ts` from the payments
folder (it reads the same limit and vendor settings as the service), and set
`BNB_POLICY_CONTRACT`. Re-running it with the address set re-applies the limits and
adds vendors; it does not revoke a vendor. `/wallet` reports the contract under
`policy_chain`. The compiled artifact is committed (solc 0.8.37, optimizer 200 runs,
EVM version paris); recompile with those settings if the source changes.

## Request lifecycle

Scout checks the mission budget, then the wallet atomically reserves spend under
per-call, per-task, daily, session, approval-threshold, and vendor rules. The buyer
requests inference, receives a 402 challenge, checks it against the registered
price and configured recipient/token/network, signs, and retries.

The provider verifies the authorization through the official SDK, records its
nonce once, settles via the local facilitator, and checks the chain receipt.
Only after confirmed settlement does it call the authenticated inference worker.
A failed inference may therefore still have a real charge; the ledger retains the
receipt and the dashboard marks the task blocked. This ordering avoids returning
paid outputs before settlement, but it does not implement refunds.

Idempotency binds a request ID to the full request body. Completed retries return
the stored result. Reusing a nonce or a request ID with different input is rejected.
Any ambiguous outcome remains reserved as `uncertain` until the chain says which it
was. Every minute (and on `POST /reconcile`) the service checks each uncertain
payment older than `RECONCILE_AFTER_SECONDS` (default 240, longer than any request
can run): if AUSD's `authorizationState` shows its authorization was used it becomes
`settled` and the transaction is recovered from the `AuthorizationUsed` event; if no
authorization was ever stored, or the stored one expired unused, it becomes `failed`
and its Allowance is released. A reconciled request ID is never bought again; the
caller starts a new request. There is no refund flow. Never delete the payment
database to resolve an uncertain transaction.

The provider route also requires `X-Service-Key`: this is a private single-robot
prototype, not a public x402 merchant endpoint. The header is application auth;
it is not represented as part of the x402 standard. End users sign in at the gateway
(see Accounts below); the payment service and the model worker stay on private ports.

## Official sources consulted

- [Agora contract deployments](https://docs.agora.finance/developer/contract-deployments)
- [Agora contract overview and ERC-3009 support](https://docs.agora.finance/contract-overview)
- [Agora faucet guide](https://docs.agora.finance/instant-settlement/guides/getting-testnet-tokens)
- [x402 seller quickstart](https://docs.x402.org/getting-started/quickstart-for-sellers)
- [x402 buyer quickstart](https://docs.x402.org/getting-started/quickstart-for-buyers)
- [x402 network and token support](https://docs.x402.org/core-concepts/network-and-token-support)

SDK exports and type declarations were checked against the installed pinned
packages. The default USDC dollar-price shortcut is not used: the AUSD asset and
atomic amount are explicit. Hosted facilitator AUSD support is not assumed.

The SDK's buyer refuses any asset outside its built-in defaults unless it is listed in
`spendControls.allowedAssets`; AUSD is listed there with a per-payment cap equal to the
Allowance. One facilitator wallet submits every settlement, so settlements are queued:
concurrent submissions collide on its transaction nonce.

## Live verification

`services/payments/scripts/live-check.ts` runs the real service, x402 flow, facilitator
and Base Sepolia AUSD against a stub marketplace and model worker, so prices, outages
and crashes can be forced. It covers access, input, the paid path with on-chain balance
checks, replay, marketplace refusals, every Allowance rule, concurrency, the 402
challenge, forged and bypassing payments, failure after payment, restart recovery,
setup faults, per-vendor payouts and the mission float. Run it from the payments
folder: `node --env-file=../../.env --import tsx scripts/live-check.ts out.json`
(about five minutes; it spends about 0.2 test AUSD).

## Accounts and each user's own wallet

Simulation missions are open to everyone. Spending AUSD needs an account (`services/accounts/`,
`ACCOUNTS_REQUIRED=1`): email and password, a session in an HttpOnly SameSite cookie, passwords
stored as scrypt hashes, sign-in attempts rate-limited, and cross-site requests refused.

With `USER_WALLET_SEED` set (and an owner wallet), every account has its own treasury address on
Base Sepolia, derived from the seed and the account id, so no key is stored per user. It is a
custodial testnet wallet: the server can sign for it. The gateway names the signed-in user to the
payment service in `X-Account`:

- A mission started by a user is bound to that account on its first purchase. Its float is sent
  from that user's wallet to the robot and the unspent part returns to the same wallet.
- `POST /accounts/grant` sends a new account `STARTER_GRANT_AUSD` from the owner treasury, once,
  and at most `STARTER_GRANTS_PER_DAY` across all accounts.
- `POST /accounts/withdraw` sends AUSD from the user's wallet to any address, gasless.
- `GET /wallet` with `X-Account` reports that user's wallet instead of the owner treasury.

Each user sets their own per-mission and per-day limits and can pause payments; the gateway checks
them when a paid mission starts, and the Allowance above still bounds every purchase. A user sees
only their own missions and receipts (`/api/account/activity`, `/api/transactions`), can download
everything stored about them, and can delete the account. Deleting removes the profile and its
missions; settled payments stay in the ledger and on chain, no longer linked to a person.

The dashboard's **Wallet & receipts** area holds the wallet, payment history, spending limits,
profile and privacy, and security pages. A paid mission opens a payment screen: review the
purchases, authorize, watch each one settle, keep the receipts. **Send a live test payment** on
the Wallet page buys one sensor summary (about 0.001 AUSD) through the same path without a
planning call. Live-checked on Base Sepolia 2026-10-11: sign-up, starter grant, a paid purchase
with float out and back, a withdrawal, pause, and sign-out.

### Bring your own wallet (RainbowKit)

The Wallet page connects a wallet the user holds themselves through RainbowKit 2 (wagmi 2, Base
Sepolia): Rainbow, Coinbase Wallet, MetaMask, Binance Wallet, Ledger, Trust, OKX, Safe, any
injected browser wallet and anything that speaks WalletConnect. The user's key never reaches
rBazaar. To add funds they sign one ERC-3009 `TransferWithAuthorization` for an exact amount to
their rBazaar wallet (`POST /api/account/wallet/deposit`); the facilitator submits it, so the
user pays no gas. The server fixes the recipient to the account's own wallet. The connected
address can be used as the withdrawal address. Scout still spends from the rBazaar wallet: an
agent that pays per call needs a key it can sign with on its own, which a cold wallet is not.

Wallets in the browser work with no setup. Phone wallets that pair by QR code need
`WALLETCONNECT_PROJECT_ID` (free, cloud.reown.com); without it they are not listed, so nothing in
the list is a dead end. The wallet libraries load only on the sign-in and Wallet pages.

### Sign-in without a password

- **A wallet:** the user signs a Sign-In with Ethereum message; the payment service checks the
  signature (smart-contract wallets included). The address becomes the account.
- **Google and GitHub** (`services/accounts/oauth.py`): standard authorization-code flow with a
  single-use state bound to the browser. Shown only when `GOOGLE_CLIENT_*` / `GITHUB_CLIENT_*` are
  set. Only a provider-verified email is stored. Tested against a stand-in provider only; **not yet
  run against Google or GitHub**, because no OAuth app keys exist yet.
- An outside identity never attaches itself to an existing password account by email, because
  password accounts' emails are not verified here.

Live-checked on Base Sepolia 2026-10-11 with a signing test wallet announced to the page the way
an installed wallet is: connect in the RainbowKit dialog, sign in, withdraw 0.40 AUSD to it, then
add 0.25 back by signature (settled in 9 s).

Not built: email verification, password reset, two-factor sign-in, and paying a mission straight
from the user's own wallet (today it funds the rBazaar wallet first). A user's allowance is
checked when a mission starts, not per purchase.
