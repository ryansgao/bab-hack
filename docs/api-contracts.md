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
| `POST /api/agent/plan` | `MissionRequest` | `MissionPlan` with variable-size subtask graph |
| `GET /api/agent/plans/{id}` | Plan ID | Current persisted plan |
| `POST /api/agent/execute` | `{ "plan_id": "..." }` | Updated plan; deterministic per-step payment IDs |
| `GET /api/wallet/{robot_id}` | Robot ID | Balance, reserved/spent amounts, limits, mode |
| `GET /api/transactions` | None | Recorded receipts, never synthetic hashes |
| `GET /api/telemetry` | None | Recent decisions and measured inference outcomes |
| `GET /api/simulation` | None | Current state and derived observation |
| `POST /api/simulation/control` | `SimulationControl` | Updated state |
| `POST /api/inference/{model_id}` (payment service) | `InferenceRequest` | x402 v2 402 challenge or paid `InferenceResult` |

## Mission example

```json
{
  "robot_id": "robot_001",
  "task": "Inspect shelves then deliver to the loading bay",
  "waypoints": [{"x": 13, "y": 8}, {"x": 18, "y": 3}],
  "budget_ausd": "0.10",
  "inference_deadline_ms": 2000
}
```

This mission yields perception, route planning, and inspection at each destination.
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

Plans: `planned`, `running`, `waiting_for_motion`, `blocked`, `completed`.
Subtasks: `pending`, `running`, `waiting_for_motion`, `completed`, `blocked`.
Payments: `reserved`, `settling`, `settled`, `failed`, `uncertain`.
A cached request with a different body is a 409. Ambiguous settlement is never
retried with a new authorization. Only `settled` includes a verified chain receipt.
Inference failure after settlement retains the receipt and records the failure.

Headers `PAYMENT-REQUIRED`, `PAYMENT-SIGNATURE`, and `PAYMENT-RESPONSE` follow
the official x402 v2 SDK. `X-Service-Key` and `Idempotency-Key` are application
headers, not x402 protocol extensions. Internal model access is never public.
