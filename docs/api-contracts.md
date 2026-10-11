# API contract v1

Canonical request/response types live in `shared/schemas/contracts.py`. Generated
OpenAPI is committed in `shared/api-contracts/openapi.json` after gateway assembly.
Money uses decimal strings with up to six fractional digits (AUSD atomic units).
Times use milliseconds; positions use grid cells; risk/quality/confidence use [0,1].
IDs are opaque strings. Errors use `{ "error": { "code": "...", "message": "..." } }`.
HTTP 422 means invalid input, 404 missing resource, 409 conflict, 503 unavailable.

| Endpoint | Input | Output |
|---|---|---|
| `GET /api/marketplace/models` | Optional `task_type` | Array of `ModelOffer` |
| `POST /api/marketplace/models` | `ModelOffer`, admin service key | Registered offer |
| `POST /api/agent/select` | `SelectionRequest` | `SelectionDecision`, including every candidate's score or rejection |
| `GET /api/agent/config` | None | Anthropic provider/model and key-configured boolean |
| `GET /api/models/readiness` | None | Adapter readiness states |
| `POST /api/models/{id}/prepare` | Model ID | Prepared adapter status |
| `POST /api/agent/plan` | `MissionRequest` | `MissionPlan` with variable-size subtask graph |
| `GET /api/agent/plans/{id}` | Plan ID | Current persisted plan |
| `POST /api/agent/execute` | `{ "plan_id": "..." }` | Updated plan; deterministic per-step payment IDs |
| `GET /api/wallet/{robot_id}` | Robot ID | Balance, reserved/spent amounts, limits, mode |
| `GET /api/transactions` | None | Recorded receipts, never synthetic hashes |
| `GET /api/telemetry` | None | Recent decisions and measured inference outcomes |
| `GET /api/simulation` | None | Current state and derived observation |
| `POST /api/simulation/control` | `SimulationControl` | Updated state |
| `POST /api/inference/{model_id}` (payment service) | `InferenceRequest` | x402 v2 402 challenge or paid `InferenceResult` |

## General task prompt and Robot Card

`POST /api/vendor/quote` previews the same plan that `/api/agent/plan` persists.
A shard is a `ModelOffer`; `task_type` names its layer. Money stays decimal text
rather than the floating-point values used in the concept examples.

```json
{
  "robot_id": "robot_001",
  "robot_card": {
    "robot_id": "robot_001", "embodiment": "6dof_arm", "dof": 6,
    "gripper": "parallel_jaw", "max_payload_kg": 1.5,
    "sensors": ["rgb", "depth", "wrist_force"], "onboard_compute": "jetson_orin"
  },
  "task": "Organize my workbench, group tools by type, and report what is missing",
  "budget_ausd": "0.05",
  "inference_deadline_ms": 3000
}
```

Claude chooses the number of dependency-ordered subtasks. The plan includes
`planner`, `planner_model`, `assumptions`, and `blockers`. Every subtask contains
`title`, `description`, `success_criteria`, `task_type`, and `depends_on`.
`requirements` carries physical estimates with `source: llm_estimate`.
Missing capabilities block the whole plan before any purchase. `estimated_cost_ausd` is the
current quote; `spent_ausd` counts confirmed receipts. `POST /api/agent/cancel`
accepts `{ "plan_id": "..." }` and stops future purchases and motion without
reversing existing payments. `GET /api/arm` and `POST /api/arm/control` expose
the kitchen-arm simulator. `GET /api/simulation` remains the warehouse API.

WebSocket `/api/events` emits `{ "ts", "source", "type", "payload" }` for recorded
selection and inference events. The dashboard subscribes to snapshots with `?plan_id=...`. Snapshot payloads
include current arm state and plan status. The server owns the simulation clock.

## Warehouse mission example

```json
{
  "robot_id": "robot_001",
  "task": "Inspect shelves then deliver to the loading bay",
  "waypoints": [{"x": 13, "y": 8}, {"x": 18, "y": 3}],
  "budget_ausd": "0.10",
  "inference_deadline_ms": 2000
}
```

Include a `robot_card` with `embodiment: mobile_base` for travel. Claude plans
only the work required by the goal and flags missing capabilities.
The number of destinations and requested capabilities determines the count. Each
step has `id`, `task_type`, `depends_on`, `target`, `status`, `decision`, `result`,
and `payment`. Plans expose unsupported instructions and missing providers.
Physical travel completes before inspection at a destination begins.

## Selection example

```json
{
  "observation": {
    "robot_id": "robot_001", "position": {"x": 1, "y": 1},
    "velocity": {"x": 0, "y": 0}, "nearest_obstacle_distance": 4,
    "nearby_agent_count": 0, "sensor_uncertainty": 0.3,
    "revision": 0
  },
  "task_type": "object_detection",
  "remaining_budget_ausd": "0.02",
  "inference_deadline_ms": 2000,
  "minimum_quality": 0
}
```

Decision shape (illustrative, not a benchmark):

```json
{
  "selected_model_id": null, "risk_score": 0.2,
  "remaining_budget_ausd": "0.02", "candidates": [],
  "explanation": "No available offer satisfies the constraints; stop safely.",
  "safe_fallback": true
}
```

## Execution states

Plans: `planned`, `queued`, `preparing`, `running`, `waiting_for_motion`, `blocked`, `completed`, `cancelled`.
Subtasks: `pending`, `running`, `waiting_for_motion`, `completed`, `blocked`.
Payments: `reserved`, `settling`, `settled`, `failed`, `uncertain`.
A cached request with a different body is a 409. Ambiguous settlement is never
retried with a new authorization. Only `settled` includes a verified chain receipt.
Inference failure after settlement retains the receipt and records the failure.

Headers `PAYMENT-REQUIRED`, `PAYMENT-SIGNATURE`, and `PAYMENT-RESPONSE` follow
the official x402 v2 SDK. `X-Service-Key` and `Idempotency-Key` are application
headers, not x402 protocol extensions. Internal model access is never public.

Planning requires `ANTHROPIC_API_KEY` on the server. Missing or rejected keys return
503, rate limiting returns 429, and incomplete/invalid provider output returns 502.
The gateway calls the [Anthropic Messages tool API](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools)
and validates the proposed dependency graph before persisting or quoting it.
The internal `/purchase` body extends `InferenceRequest` with `max_price_ausd`;
the buyer checks the current registry price against that mission ceiling before signing.
