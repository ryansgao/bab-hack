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
`.env` has none; it never creates or funds blockchain wallets. Set `ANTHROPIC_API_KEY` in `.env` and restart for planning. `ANTHROPIC_MODEL`
defaults to `claude-sonnet-4-5`. The key is intentionally blank in the template,
and stays on the server. Planning and shard comparison do not require wallet keys. Purchases return a clear blocked result.

For live vision, install the optional dependencies and warm the two COCO models:

```sh
.venv/bin/pip install -r requirements-models.txt
TORCH_HOME="$PWD/data/torch" .venv/bin/python scripts/warm_models.py
```

On Python installations missing system certificate configuration, set
`SSL_CERT_FILE` to the CA bundle printed by `.venv/bin/python -m certifi`.
Keep TLS verification enabled. The launcher supplies this setting automatically.

Open-vocabulary detection uses `google/owlvit-base-patch32`; install
`requirements-owl.txt`. Execution prepares selected models before any paid call.
`GET /api/models/readiness` reports cold/preparing/ready/error states;
`POST /api/models/{id}/prepare` explicitly prepares a listed model.
COCO adapters advertise their full fixed vocabulary; OWL-ViT accepts a named-object
query. Upload a suitable real image for the task. Synthetic images are unvalidated,
and image coordinates are not calibrated to real hardware.

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
Send `robot_card` to describe the available hardware. All tasks use Anthropic,
including mobile-base tasks with explicit `waypoints`. The prompt may be up to
6,000 characters. Task types are extensible snake_case capability identifiers.

`GET /api/agent/config` reports the provider/model and whether a key is configured,
never the key. `POST /api/vendor/quote` calls Claude and prices its proposed plan
without saving it. `POST /api/agent/plan` saves the quoted plan. Both incur Anthropic
API usage when configured; that billing is separate from the AUSD budget.
`POST /api/agent/execute` queues the mission and returns immediately. The server
prepares models, processes dependencies, and waits for simulated motion between
steps. Closing the browser does not stop this loop. `/api/events?plan_id=...`
streams snapshots and telemetry; reload restores the saved plan by ID.

Only direct prerequisite outputs are passed to a shard. Independent branches
execute serially on the single robot. Plans expose purpose, success criteria,
assumptions, and blockers. Current adapters determine their own completion from
actual returned data/motion; arbitrary semantic outcomes require suitable adapters.
Restarting the server blocks interrupted missions because simulation state is not
durable. Inspect any existing receipts before starting a replacement task.

Use a new task only after the prior task completes or is cancelled. Cancelling a
plan stops the simulated robot but does not reverse settled purchases.

## Validation status

Frontend production build and payment TypeScript compilation pass. Browser review
covers the general-task composer, arbitrary text entry, missing-Anthropic-key
response, marketplace, and responsive layout. No new automated tests were added.
Live Claude generation was verified with `claude-opus-5-5` using a small
localization task. It returned a validated dependency graph and a missing-image
blocker. Set your own key privately; no credential is committed.

Live AUSD settlement and OWL-ViT inference remain unverified. Local testnet wallets
exist but need funding. Earlier COCO adapter runs returned zero detections on a
synthetic warehouse image; this is not an accuracy benchmark. There are no fake
planner responses, detections, or receipts in the live product.
