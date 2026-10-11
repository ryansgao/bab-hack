# RoboMarket

**An agent-to-agent marketplace where robots buy intelligence one shard at a time.**

Describe a robot task in plain language. Claude (Anthropic) decomposes the full goal
into a variable-length dependency graph. Scout searches the live marketplace for
each required capability, checks the Robot Card and budget, then buys the selected
shards through AUSD/x402 and passes their outputs to dependent steps.

The task is not restricted to predefined verbs or objects. Every subtask includes
its purpose, prerequisites, and completion criterion. Missing capabilities stay in
the plan as explicit blockers; the system does not silently replace the requested
goal with a simpler demo. The current executable adapters cover detection, sensor
summaries, grid navigation, and simulated grasp/handling. Other capabilities need
providers and execution adapters before they can run.

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

Open **http://127.0.0.1:8000**. Set `ANTHROPIC_API_KEY` in the server-only `.env`
and restart to enable planning. The example key is intentionally blank.
`ANTHROPIC_MODEL` defaults to `claude-sonnet-4-5` and can be changed to a model
available to your account, including `claude-opus-5-5`. The planner uses automatic
tool selection and validates the returned task graph locally. There is no
keyword-parser fallback or fabricated plan.
The prompt, Robot Card, and catalog go to Anthropic; uploaded images stay in the
local inference flow. Anthropic billing is separate from the AUSD shard budget.

The UI and marketplace remain available without credentials. Purchase execution
requires funded testnet wallets and model dependencies. `npm run wallets:init`
can create fresh local testnet wallets only when `.env` does not already exist;
`npm run wallets:status` reads balances. See [payment setup](docs/payments.md).

For real inference: install `requirements-models.txt` for YOLO11, SSD Lite and Faster
R-CNN; install `requirements-owl.txt` for open-vocabulary OWL-ViT detection. Execution prepares selected
weights before any purchase. There are no fake detection or payment fallbacks.

## What is implemented

- Anthropic task decomposition with validated acyclic dependencies, assumptions, and capability gaps.
- Server-owned execution and simulation clocks; browser disconnects do not stop a mission.
- Model readiness/preparation before payment and per-shard receipts.
- Robot Card compatibility and explainable budget/risk/latency scoring.
- Vendor quotes that reserve enough task budget for downstream layers.
- SQLite marketplace, persisted plans, telemetry, and WebSocket decision events.
- React dashboard, simulated arm, and secondary warehouse A* simulation APIs.
- Two torchvision detector adapters, optional OWL-ViT, and analytic grasp/control.
- Official x402 v2 SDK integration with explicit Base Sepolia AUSD configuration.
- Persistent Allowance limits, idempotency, replay checks, and uncertain-payment holds.
- Separate component entry points and Docker Compose configuration.

## Current limits

Live Anthropic planning was verified with `claude-opus-5-5`: a camera-localization
request returned a valid subtask graph and flagged its missing image. Credentials
remain local to the ignored `.env`; the committed template is intentionally blank.
Live AUSD settlement also remains unverified; testnet wallets need funding. Build
and browser setup/error flows were checked, with no additional automated test suite.
No generated plans, payments, or detections are presented as live results.

LLM-inferred physical requirements are labeled simulation estimates. The workcell
is illustrative; arbitrary physical tasks are not implemented by the generic arm
animation. The server blocks interrupted missions after restart because simulation
state is not durable. Provider registration also needs a model adapter, and seeded
vendors share one configured recipient. Payments are intended for localhost and
need authentication before any public deployment. The gateway alone (dashboard,
marketplace, planning) can be hosted publicly with `render.yaml`; planning calls
are capped per visitor and per day. See the integration guide.

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

## Simulation missions

New dashboard missions default to **Simulation · demo credits**. The built-in
camera scene contains a coffee mug, wrench, screwdriver and two labeled packages.
Twenty-one local producer adapters expose individual capture, mapping, detection,
geometry, condition, grasp, placement, reporting and verification capabilities.
Claude decomposes inspection into roughly 12–18 useful subtasks and larger
multi-object goals into roughly 20–40; actual counts depend on the requested work.

Simulation providers compute from explicit scene fixtures, not learned perception.
The mug has a dirt patch; packages can have damage and sealed/unknown contents.
These findings are visible in the per-step output. A missing upload is not a blocker
in this mode. Unknown objects and unsupported operations still appear as gaps.

Each simulation provider costs 0.001 demo credits. Execution records `simulated`
charges and `simulation_cost_ausd` separately from `spent_ausd` (actual AUSD).
No payment service, funded wallet or model-weight download is needed. Anthropic
planning still uses the configured API account. Choose **Real providers · AUSD
testnet** to use the existing real inference and settlement flow. The old blocked
plan can be regenerated using **Rebuild with simulation providers**.

**3D task preview** starts switched off. Turn it on in the composer to inspect the
fixture, or on a mission to review Scout's interpretation, targets, assumptions and
individual steps before execution. Play/pause or select a step; proposed placements
animate to the plan's destination. Drag to rotate and use Reset view to return.
This lazy-loaded Three.js walkthrough renders locally from the existing plan. It
makes no additional Anthropic calls, runs no providers and spends no demo credits.
Building or rebuilding a plan still uses Anthropic. Fixture geometry illustrates
intent; the preview does not certify physical robot motion.

Visual verification: “Find and inspect a coffee mug” produced and completed 16
fixture-backed subtasks for 0.016 demo credits, with actual AUSD spending at zero.
“Sort packages by destination” produced and completed 28 subtasks for 0.028 demo
credits, placing packages A and B in their shipping zones. The optional preview's
default-off toggle, target selection, playback and placements were checked in
the dashboard; no new automated tests added.
