# RoboMarket

**An agent-to-agent marketplace where robots buy intelligence one shard at a time.**

Give Scout a Robot Card and a task. Vendor decomposes the task into a dependency
graph of purchasable expert layers. Scout filters by robot compatibility, object
size, precision, force, latency, and budget; then purchases each selected shard
through AUSD / x402 and chains its real output into the next step.

The primary demo is a simulated kitchen arm. `Peel an orange` generates three
shards; `Peel 2 oranges and a grape` generates nine. Inspection only needs
perception. Grasp/control use documented analytic heuristics; peeling currently
means a handling trajectory, not a physical skin-removal simulation.

## Start locally

Requires Python 3.13 and Node 24+.

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
npm ci
cp .env.example .env
npm run build
.venv/bin/python scripts/dev.py
```

Open **http://127.0.0.1:8000**. Planning, quotes, candidate comparisons, and the UI
work without blockchain credentials. Purchase execution stops with a setup error
until funded testnet wallets and model dependencies are configured.

For real inference: install `requirements-models.txt` for SSD Lite and Faster
R-CNN; install `requirements-owl.txt` for OWL-ViT grape detection. Download and warm
weights before the demo. There are no fake detection or payment fallbacks.

## What is implemented

- Variable-length task decomposition with typed dependencies and per-shard receipts.
- Robot Card compatibility and explainable budget/risk/latency scoring.
- Vendor quotes that reserve enough task budget for downstream layers.
- SQLite marketplace, persisted plans, telemetry, and WebSocket decision events.
- React dashboard, simulated arm, and secondary warehouse A* simulation APIs.
- Two torchvision detector adapters, optional OWL-ViT, and analytic grasp/control.
- Official x402 v2 SDK integration with explicit Base Sepolia AUSD configuration.
- Persistent Allowance limits, idempotency, replay checks, and uncertain-payment holds.
- Separate component entry points and Docker Compose configuration.

## Current limits

Live AUSD settlement is **not yet verified**: funded testnet credentials are
missing. The full orange/grape paid demo still requires that setup, a suitable
real image, and successful perception. Two real COCO model runs completed locally
on synthetic warehouse input and returned no detections; this is not an accuracy
benchmark. OWL-ViT is implemented but has not been run locally.

Scout currently uses a documented task grammar instead of an LLM parser. Object
size/fragility values are explicit task priors. Provider registration needs a model
adapter, and seeded vendors share one configured recipient. The app is intended
for localhost; public deployment needs authentication. Docker is supplied but not
verified here. See the integration guide for recovery and operational limits.

## Team handoff

- [Architecture and tradeoffs](docs/architecture.md)
- [Four-owner implementation map](docs/team.md)
- [Shared API contracts](docs/api-contracts.md) and [generated OpenAPI](shared/api-contracts/openapi.json)
- [Local setup, independent services, validation status](docs/integration.md)
- [AUSD/x402 setup and official references](docs/payments.md)

The initial implementation is pushed to `main` in small checkpoints as requested.
Use component branches for parallel changes, stage only owned files, fetch before
pushing, and never force-push shared history. Keep `.env`, wallet keys, model
weights, images, and runtime databases out of Git.
