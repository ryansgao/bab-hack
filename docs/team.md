# Four developer ownership map

| Owner | Owned files | Deliverables / APIs | Dependencies and checks |
|---|---|---|---|
| 1: simulation + UI | `apps/frontend/**`, `apps/simulation/**` | Warehouse controls, mission graph, candidate comparison, wallet/receipt display; `/api/simulation` and controls | Shared schemas; tests for A*, collision stop, sensor observations, replanning, inference effects; build React and exercise narrow-screen layout |
| 2: marketplace + inference | `services/marketplace/**`, `services/models/**` | Registry CRUD, two pretrained detectors, standardized predictions, measured latency; `/api/marketplace/models`, internal inference | Shared schemas; registry persistence, input validation, unavailable provider handling, real model smoke test; publish benchmark provenance |
| 3: agent | `services/agent/**` | Mission DAG, dependency executor, risk score, constrained optimizer, explanations; `/api/agent/select`, `/api/agent/plan`, `/api/agent/execute`, plan inspection | Registry and payment contracts; variable-size plans, unknown goals, budget/deadline/availability constraints, price sensitivity, safe fallback, failed prerequisites, retries |
| 4: payments | `services/payments/**` | x402 buyer/provider/facilitator, atomic policy ledger, verified receipts; `/wallet`, `/transactions`, `/purchase`, `/inference/:model` | Official SDK, Base Sepolia RPC, funded wallets; rejected/replayed payment, concurrency, policy limits, crash recovery, opt-in live settlement test |

The integration lead owns `shared/**`, `services/api.py`, root manifests,
`docker-compose.yml`, `scripts/**`, and `tests/integration/**`. Agree on a schema
change before touching these files. Component developers add tests beside their
components or in their corresponding `tests/test_<component>.py` files.

## Working together

Use short `codex/<component>-<change>` branches once the initial baseline exists.
Commit one coherent behavior at a time and push after its checks pass. Fetch before
pushing; never force push shared history. Stage explicit paths so another person's
work cannot slip into your commit. Coordinate dependency changes with the lead:
root Python requirements and each workspace's npm lockfile are common conflict
points. Generated OpenAPI belongs to the schema owner; do not hand-edit it.

## Integration checkpoints

1. Contracts and examples compile before implementations begin.
2. Registry and agent run without loading detector weights or requiring keys.
3. Simulation produces observations, and plans expose unresolved capabilities.
4. Real detector runs return measured outputs and latency.
5. Live testnet setup proves 402 → authorization → settlement → inference result.
6. Dashboard demonstrates a mission with multiple paid subtasks and receipts.

The two-minute demo should show one short mission, its decomposition, a candidate
rejection, one verified purchase, an obstacle-induced stop/replan, and the receipt.
Only claim live settlement after the external integration check succeeds.
