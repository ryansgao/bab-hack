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
Any ambiguous outcome remains reserved as `uncertain`. An operator must reconcile
it with chain history before retrying. There is no automatic reconciliation or
refund UI in this rough draft. Never delete the payment database to resolve an
uncertain transaction.

The provider route also requires `X-Service-Key`: this is a private single-robot
prototype, not a public x402 merchant endpoint. The header is application auth;
it is not represented as part of the x402 standard. The gateway is localhost-only
and has no end-user login. Do not deploy it publicly until auth is added.

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
