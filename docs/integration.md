# Run and integrate

Requirements: Python 3.13, Node 24 or newer (built-in SQLite), npm.

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
npm ci
cp .env.example .env
npm run build
.venv/bin/python scripts/dev.py
```

Open http://127.0.0.1:8000. The launcher creates a process-local service key if
`.env` has none; it never creates or funds blockchain wallets. Planning and shard
comparison work without wallet keys. Purchases return a clear blocked result.

For live vision, install the optional dependencies and warm the two COCO models:

```sh
.venv/bin/pip install -r requirements-models.txt
TORCH_HOME="$PWD/data/torch" .venv/bin/python scripts/warm_models.py
```

On Python installations missing system certificate configuration, set
`SSL_CERT_FILE` to the CA bundle printed by `.venv/bin/python -m certifi`.
Keep TLS verification enabled. The launcher supplies this setting automatically.

Grape detection uses `google/owlvit-base-patch32`; install
`requirements-owl.txt` and pre-download/warm that model before the demo. Its first
use otherwise includes a large download and will likely exceed a tight deadline.
COCO detectors cannot detect grapes, and their registry compatibility says so.
Supply a real, clearly visible fruit image through the dashboard. Synthetic
sensor images are supported inputs but recognition quality is unvalidated. A
missing fruit detection blocks grasp/control. The UI's arm is a visualization;
uploaded image coordinates are not calibrated to a physical robot.

## Independent components

Run these from the repository root, sharing the same `SERVICE_KEY` in each
process. Keep private worker and signer ports off the public network.

| Component | Command |
|---|---|
| Composed API + built dashboard | `.venv/bin/uvicorn services.api:app --port 8000` |
| Marketplace only | `.venv/bin/uvicorn services.marketplace.app:app --port 8010` |
| Scout only | `.venv/bin/uvicorn services.agent.app:app --port 8011` |
| Warehouse simulation only | `.venv/bin/uvicorn apps.simulation.app:app --port 8012` |
| Private inference worker | `.venv/bin/uvicorn services.models.app:app --port 8001` |
| Payments | `node --env-file=.env --import tsx services/payments/src/server.ts` |
| Frontend development | `npm run dev` (API proxy on port 8000) |

The standalone agent shares the Python registry adapter and SQLite contracts in
this prototype. It does not yet discover arbitrary remote inference URLs. To add
a provider, register metadata and implement an adapter in `services/models/`.
Metadata registration alone cannot create a working remote inference service.

For Docker, configure a nonempty `SERVICE_KEY` in `.env`, then run
`docker compose up --build`. Only the gateway is published to localhost; models
and payments are reachable only inside the Compose network. Model weights and
both databases use separate volumes. The Docker build was supplied but has not
been run on this development machine.

## API integration

Interactive contracts: `/docs`. Regenerate the checked-in contract after an
approved schema change: `.venv/bin/python scripts/export_contracts.py`.
New clients should send `robot_card` to select the kitchen-arm flow. Requests
without it use the original warehouse navigation grammar.

`POST /api/vendor/quote` returns a proposed plan without saving it.
`POST /api/agent/plan` saves the quoted plan. `POST /api/agent/execute` checks the
whole plan and processes ready dependencies until physical motion must finish.
The dashboard advances the simulator at 500 ms intervals, then resumes execution.
Closing the dashboard pauses these ticks; the prototype has no background robot
daemon. Reload restores the current plan from its locally saved ID.

Use a new task only after the prior task completes or is cancelled. Cancelling a
plan stops the simulated robot but does not reverse settled purchases.

## Validation status

The frontend production build and payment TypeScript compilation passed.
Before the request to minimize tests, 10 Python checks and 5 payment-ledger checks
passed. Subsequent verification focuses on browser visual checks. Two real
torchvision models ran locally on a synthetic warehouse image; both returned zero
detections. This proves the adapters execute, not that perception succeeds on the
demo objects. No detection accuracy benchmark is claimed.

Live AUSD settlement has not been run: funded testnet wallet credentials are not
configured. The payment implementation is type-checked, but its AUSD domain,
facilitator compatibility, and full payment-to-inference path still need a funded
testnet run. OWL-ViT weights/inference are also unverified locally.

Browser review covered desktop and narrow layouts, the orange quote (3 shards),
the grape quote (3 shards with different compatible providers), a mixed three-object
mission (9 shards), candidate rejection reasons, marketplace cards, persisted plan
restoration, and the missing-wallet execution block. No live payment was attempted
with funded credentials.
