# rBazaar

**The bazaar where robots buy skills: an agent-to-agent marketplace for robotics, paid one AUSD micropayment at a time.**

_Formerly RoboMarket. Internal names (env vars, storage keys, the `useRoboMarket` hook) keep the old name so nothing breaks._

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
- Owner treasury with a per-mission float returned on close or idle, and one payout address per vendor.
- Separate component entry points and Docker Compose configuration.

## Current limits

Live Anthropic planning was verified with `claude-opus-5-5`: a camera-localization
request returned a valid subtask graph and flagged its missing image. Credentials
remain local to the ignored `.env`; the committed template is intentionally blank.
Live AUSD settlement was verified on Base Sepolia with funded testnet wallets: the
payment service's live check (`services/payments/scripts/live-check.ts`) settles real
AUSD payments and exercises every Allowance rule, replay, concurrency and failure
case against a stub marketplace and model worker. A full mission through the real
marketplace and model workers with live settlement is not yet recorded here. Build
and browser setup/error flows were checked.
No generated plans, payments, or detections are presented as live results.

LLM-inferred physical requirements are labeled simulation estimates. The workcell
is illustrative; arbitrary physical tasks are not implemented by the generic arm
animation. The server blocks interrupted missions after restart because simulation
state is not durable. Provider registration also needs a model adapter. Each vendor
is paid at its own address when `VENDOR_SEED` is set; with `OWNER_PRIVATE_KEY` set an
owner wallet holds the treasury and the robot holds only one mission float at a time
(see the payment setup). Payments are intended for localhost and
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

New dashboard missions default to **Simulation · demo credits**. Claude creates
the objects and initial fixture traits needed by the prompt in the same planning
call, including objects outside the sample catalog. The starter workbench is only
a reference scene. Named destinations are created automatically, and the 3D
preview renders the generated objects with box, sphere or cylinder geometry.
Local producer adapters expose capture, mapping, detection, geometry, condition,
grasp, placement and reporting capabilities, alongside the niche catalog below.
Claude plans only actions needed for the goal, with no minimum subtask count.
Routine input, identity, reachability, collision, grasp and completion checks happen
inside provider inference; they are never separate paid confirmation subtasks.
Requested inspections remain useful outputs. A simple pickup typically needs
detection, grasp planning and handling; larger goals add actual requested work.

Simulation providers compute from explicit scene fixtures, not learned perception.
The mug has a dirt patch; packages can have damage and sealed/unknown contents.
These findings are visible in the per-step output. A missing upload is not a blocker
in this mode. Unknown objects become prompt-generated fixtures. Unsupported
operations use free, mission-scoped **virtual demo effects** while genuine catalog
gaps still create bounties. Virtual effects record expected state transitions;
they are not trained inference, hardware execution, producer listings or purchases.
They never enter the shared catalog and cannot be used in real-provider mode.
When a fixture adapter cannot satisfy its inputs, its step can also use an explicit
virtual effect without charging for failed inference. Real-provider constraints
and verified payment requirements remain enforced.
Untouched older blocked simulation plans recover locally when opened; missions
with receipts or inference results are preserved. Recovery makes no new LLM call.

Simulation prices are shown per provider; niche listings cost 0.0008 demo credits
per call. Execution records `simulated`
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

Earlier visual verification, before simplifying the planner: “Find and inspect a coffee mug” produced and completed 16
fixture-backed subtasks for 0.016 demo credits, with actual AUSD spending at zero.
“Sort packages by destination” produced and completed 28 subtasks for 0.028 demo
credits, placing packages A and B in their shipping zones. The optional preview's
default-off toggle, target selection, playback and placements were checked in
the dashboard; no new automated tests added.

## Niche expertise and capability bounties

The catalog now includes 1,086 scoped simulation listings across 68 object
profiles: phones, oranges, cables, tools, kitchen items, parcels and more.
They perform detection, handling, placement and narrow checks such as screen
cracks, connector damage, fruit ripeness, seals, labels and tip wear using explicit
fixture state. These are runnable demo adapters, not newly trained ML models.
Search by object/action or collection; the dashboard paginates the catalog.
The planner receives relevant object listings and bounded provider comparisons.

Automatic bounties default on and have a configurable reward per missing skill.
Only genuine catalog gaps post a bounty; budget/deadline failures do not. Requests
persist in SQLite with mission links and acceptance criteria. The Bounties page
also accepts manual requests and producer submissions. Accepting a demo solution
publishes its scoped fixture adapter and records an idempotent demo reward. A
producer can read an existing object attribute or change an attribute; these
declarative programs never execute uploaded code. Bounties retain the generated
object fixture so producers can deliver solutions for unfamiliar objects too.
Rebuild the mission
to use the new listing. Demo awards do not transfer AUSD. Real submissions remain
unavailable pending adapter integration, and their reward remains an unfunded
pledge until an actual settlement flow is configured.

Visual check with the simplified planner: “Pick up my phone, then peel an orange”
created five actionable subtasks and one automatic orange-peeling bounty. A producer
submitted a fixture adapter setting `peel_state=peeled`; acceptance published the
skill and recorded a 0.05 demo-credit reward. Rebuilding selected that provider and
completed all five steps for 0.0034 demo credits, with actual AUSD spent at zero.
The optional 3D preview showed phone/orange targets. No automated tests were added.

Prompt-generated scene checks: “Eat the cheese” completed four steps for 0.0018
demo credits, including a free virtual consumption effect and an automatic bounty.
“Wash my shirt and fold it, then put it in the laundry basket” completed eight steps
for 0.0036 demo credits. It generated both objects, opened washing/folding bounties,
and placed the shirt at the basket's simulated location. The 3D preview showed the
generated objects and placement. These are fictional demo outcomes, not physical
eating or laundry operations. No automated tests added.
