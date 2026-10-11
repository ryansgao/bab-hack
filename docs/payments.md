# AUSD / x402 setup

This implementation pins `@x402/core` and `@x402/evm` 2.28.0, and viem 2.57.4.
It uses x402 v2 headers and the SDK's exact EVM buyer and facilitator schemes.
The local facilitator pays transaction gas; Scout signs the ERC-3009 payment
without submitting its own gas transaction.

## Configure testnet funds

1. Create separate test-only robot and facilitator wallets in your own wallet tool.
   Put their keys in `.env` as `ROBOT_PRIVATE_KEY` and `FACILITATOR_PRIVATE_KEY`.
   Set `PROVIDER_ADDRESS` to the recipient. All seeded vendors currently share this
   demo recipient; independent vendor recipient registration is future work.
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
