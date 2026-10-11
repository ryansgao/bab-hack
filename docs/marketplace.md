# Marketplace and inference (Member 2)

Owns `services/marketplace/**` and `services/models/**`.

## Shards on offer

| Shard | Vendor | Layer | Price / call | Quality (COCO128 mAP@0.5) | Warm p50 latency |
|---|---|---|---|---|---|
| `yolo11n` YOLO11 Nano | edge_vision | object_detection | 0.002 | 0.628 | 131 ms |
| `yolo11s` YOLO11 Small | edge_vision | object_detection | 0.006 | 0.719 | 276 ms |
| `ssdlite` MobileNet SSD Lite | vision_lab | object_detection | 0.002 | run benchmark | — |
| `fasterrcnn` MobileNet Faster R-CNN | vision_lab | object_detection | 0.008 | run benchmark | — |
| `owlvit` OWL-ViT open vocabulary | vision_lab | object_detection | 0.006 | not on COCO128 (open vocab) | — |
| `power_grasp` / `precision_grasp` | gripworks | grasp | 0.003 / 0.008 | analytic policy | — |
| `standard_control` / `soft_control` | motion_lab | control | 0.002 / 0.006 | analytic policy | — |
| `astar`, `scene_summary` | navigation_lab | path_planning / scene_inspection | 0.001 | algorithm | — |

Measured on a 2-core cloud CPU, single torch thread. Demo-worthy detail: on COCO128,
YOLO11 Nano scores AP 0.00 on `orange` while YOLO11 Small scores 1.00, so a
higher-risk fruit task has a measured reason to buy the pricier shard.

## Benchmarks

```sh
.venv/bin/pip install -r requirements-yolo.txt
.venv/bin/python -m services.models.benchmark             # all installed detectors
.venv/bin/python -m services.models.benchmark --models ssdlite fasterrcnn
```

Downloads COCO128 (128 labeled COCO images, GitHub release asset) into
`data/benchmarks/`, runs each detector through the production `detect()` path,
and merges results into `services/models/benchmarks.json`. Commit that file.
The registry then lists `quality = mAP@0.5`, `quality_source = measured_benchmark`,
a `benchmark_reference`, and the warm p50 latency (until live EMA feedback replaces it).

Caveat for judges: COCO128 is drawn from COCO train2017, so absolute numbers are
optimistic. They are valid for comparing shards, not as field accuracy.

## Discovery API (added)

| Endpoint | Purpose |
|---|---|
| `GET /api/marketplace/models/{id}` | One listing |
| `POST /api/marketplace/search` | Robot-aware search: every listing for a layer with `compatible` and plain-language `reasons` (embodiment, gripper, sensors, vocabulary, object size, price, latency, quality floor). Compatible first, cheapest first |
| `GET /api/marketplace/benchmarks` | Raw benchmark provenance |
| `POST /api/marketplace/models/{id}/status` | Provider marks a shard available/unavailable (service key) |

```json
POST /api/marketplace/search
{ "task_type": "object_detection", "object_name": "orange", "min_quality": 0.65,
  "robot_card": { "embodiment": "6dof_arm", "gripper": "parallel_jaw", "sensors": ["rgb","depth","wrist_force"] } }
```

Existing `GET/POST /api/marketplace/models` and the internal worker
(`/internal/prepare`, `/internal/validate`, `/internal/inference`) are unchanged in shape.
YOLO weights download from GitHub on first prepare into `data/weights/` (`MODEL_WEIGHTS_DIR`).
