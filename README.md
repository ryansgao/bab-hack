# rBazaar

**The bazaar where robots buy skills.** An agentic marketplace for physical AI: describe a task, and your robot's agent finds the exact model weights it needs and pays for them per call in AUSD.

▶️ **[Product launch video](https://youtu.be/4LPFffFtbiI)** · 🎥 **[Live demo with the team](https://youtu.be/jc98RDj3_ss)**

---

## Why

Robots ship with a body, not a brain for every job. The models exist (detectors, grasp planners, force controllers, VLAs), but finding one that fits *your* arm, sensors and budget is slow, and robots have no way to pay for intelligence on demand. rBazaar fixes both.

## How it works

1. **Describe a task.** "Pick up the red mug and set it on the tray. Slow down if a person walks in." Attach images, PDFs, schematics or video if you have them.
2. **Claude builds a skill graph.** The goal becomes a dependency graph of capabilities (detect → grasp → place), and a matching robot and workcell are generated from your prompt.
3. **Scout shops the marketplace.** For every step, Scout scores competing listings on price, latency, measured quality, relevance and live risk, and filters out anything your robot can't run. When risk spikes, it upgrades to a more accurate model on the fly.
4. **Pay per call in AUSD.** Each inference settles as a gasless x402 micropayment on Base, with a receipt logged on BNB Chain.
5. **Missing a skill? Post a bounty.** Scout posts bounties for capability gaps automatically, producers submit solutions, and accepted ones go live in the marketplace.

## Highlights

- **1,186 listings · 22 vendors · 38 capabilities**, including real YOLO11, Faster R-CNN, SSD Lite and OWL-ViT models benchmarked on COCO (YOLO11s 0.72 mAP).
- **Trained matching model** (TF-IDF + logistic regression) that maps plain-language tasks to capabilities: 75% top-1 on unseen phrasings vs 40% for keyword search.
- **Risk-aware selection**: distance, nearby people, time-to-collision and fragility all reshape the quality floor and the score.
- **Live 3D simulation studio**: generated workcells with PBR materials, analytic IK, and a server-owned motion clock that follows the mission step by step.
- **Bring your own wallet**: RainbowKit (MetaMask, Coinbase, Rainbow, Ledger…), gasless top-ups, per-user spending limits and receipts.

## Built for the sponsor tracks

**Agora · AUSD + x402**
- Official x402 v2 SDK with the `exact` scheme on Base Sepolia (`eip155:84532`).
- ERC-3009 `transferWithAuthorization`: the robot signs and a facilitator pays the gas, so the robot never holds ETH.
- Allowance limits per call, per mission and per day, plus idempotency, replay protection and automatic on-chain reconciliation of in-flight payments.
- An owner treasury funds a per-mission float, and every vendor gets its own payout address.

**YZi Labs · BNB Chain**
- `RoboMarketPolicy.sol` on BSC Testnet stores each robot's spending policy: caps and a vendor allowlist.
- `check()` runs before every signature, and `record()` writes a tamper-evident receipt after settlement. It's an auditable trail for an autonomous spender.

## Stack

FastAPI (Python 3.13) · React + Vite · Three.js · TypeScript x402 service (viem) · Solidity · SQLite · Claude (Anthropic) · PyTorch / Ultralytics

## Quick start

```sh
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
npm ci && cp .env.example .env    # add ANTHROPIC_API_KEY
npm run build
.venv/bin/python scripts/dev.py   # → http://127.0.0.1:8000
```

Optional: `pip install -r requirements-models.txt` for real detectors, and `npm run wallets:init` for testnet wallets ([payment setup](docs/payments.md)).

## Docs

[Architecture](docs/architecture.md) · [Marketplace](docs/marketplace.md) · [Payments](docs/payments.md) · [API contracts](docs/api-contracts.md) · [Integration](docs/integration.md) · [Team](docs/team.md)

Built at B@B Hacks 2.0.
