"""Shard registry: provider listings persisted in SQLite.

Prices are provider-set. `quality` is only filled from published benchmark
results (services/models/benchmarks.json); otherwise it stays unknown.
"""
import json
from pathlib import Path
from shared.schemas.contracts import ModelOffer
from services.storage import db

BENCHMARKS = Path(__file__).resolve().parents[1] / 'models' / 'benchmarks.json'

# Fixed COCO label vocabulary shared by every closed-set detector; OWL-ViT takes any query.
COCO_OBJECTS = 'person,bicycle,car,motorcycle,airplane,bus,train,truck,boat,traffic light,fire hydrant,stop sign,parking meter,bench,bird,cat,dog,horse,sheep,cow,elephant,bear,zebra,giraffe,backpack,umbrella,handbag,tie,suitcase,frisbee,skis,snowboard,sports ball,kite,baseball bat,baseball glove,skateboard,surfboard,tennis racket,bottle,wine glass,cup,fork,knife,spoon,bowl,banana,apple,sandwich,orange,broccoli,carrot,hot dog,pizza,donut,cake,chair,couch,potted plant,bed,dining table,toilet,tv,laptop,mouse,remote,keyboard,cell phone,microwave,oven,toaster,sink,refrigerator,book,clock,vase,scissors,teddy bear,hair drier,toothbrush'.split(',')

_detector = dict(task_type='object_detection', required_sensors=['rgb'], supported_objects=COCO_OBJECTS)
_arm = dict(kind='algorithm', embodiments=['6dof_arm'], grippers=['parallel_jaw'])

SEEDS = [
    # Perception: four real pretrained COCO detectors from two vendors, plus open vocabulary.
    dict(id='yolo11n', name='YOLO11 Nano', provider_id='edge_vision', price_ausd='0.002', latency_ms=60, **_detector),
    dict(id='ssdlite', name='MobileNet · SSD Lite', provider_id='vision_lab', price_ausd='0.002', latency_ms=180, **_detector),
    dict(id='yolo11s', name='YOLO11 Small', provider_id='edge_vision', price_ausd='0.006', latency_ms=150, **_detector),
    dict(id='fasterrcnn', name='MobileNet · Faster R-CNN', provider_id='vision_lab', price_ausd='0.008', latency_ms=650, **_detector),
    dict(id='owlvit', name='OWL-ViT · Open Vocabulary', provider_id='vision_lab', task_type='object_detection', price_ausd='0.006', latency_ms=1800, required_sensors=['rgb']),
    # Manipulation: analytic policies (documented heuristics, not learned models).
    dict(id='power_grasp', name='General Power Grasp', provider_id='gripworks', task_type='grasp', price_ausd='0.003', latency_ms=15, required_sensors=['rgb', 'depth'], object_size_range_mm=[30, 150], pose_error_mm=2, **_arm),
    dict(id='precision_grasp', name='Precision Pinch Grasp', provider_id='gripworks', task_type='grasp', price_ausd='0.008', latency_ms=25, required_sensors=['rgb', 'depth'], object_size_range_mm=[5, 100], pose_error_mm=.1, **_arm),
    dict(id='standard_control', name='Standard Force Controller', provider_id='motion_lab', task_type='control', price_ausd='0.002', latency_ms=10, required_sensors=['wrist_force'], min_force_n=.8, **_arm),
    dict(id='soft_control', name='Soft Force Controller', provider_id='motion_lab', task_type='control', price_ausd='0.006', latency_ms=20, required_sensors=['wrist_force'], min_force_n=.05, **_arm),
    # Navigation.
    dict(id='astar', name='A* Route Planner', provider_id='navigation_lab', task_type='path_planning', price_ausd='0.001', latency_ms=15, kind='algorithm', quality=1, quality_source='configured_estimate'),
    dict(id='scene_summary', name='Sensor Scene Inspector', provider_id='navigation_lab', task_type='scene_inspection', price_ausd='0.001', latency_ms=10, kind='algorithm'),
]


def benchmarks():
    return json.loads(BENCHMARKS.read_text()) if BENCHMARKS.exists() else {'results': {}}


def _with_benchmark(model, published):
    result = published['results'].get(model.id)
    if not result: return model
    model.quality = result['map50']
    model.quality_source = 'measured_benchmark'
    model.benchmark_reference = f"services/models/benchmarks.json#{model.id} · COCO128 mAP@0.5 · n={result['images']}"
    if model.latency_source != 'measured_ema':
        model.latency_ms = result['latency_ms_p50']
    return model


def seed():
    published = benchmarks()
    with db() as conn:
        for offer in SEEDS:
            model = _with_benchmark(ModelOffer(**offer), published)
            row = conn.execute('SELECT body FROM models WHERE id=?', (model.id,)).fetchone()
            if row is None:
                conn.execute('INSERT INTO models VALUES (?, ?)', (model.id, model.model_dump_json()))
                continue
            # Keep provider edits (price, status, live latency) but refresh seeded metadata and published quality.
            existing = ModelOffer.model_validate_json(row['body'])
            existing.supported_objects = model.supported_objects
            if model.quality_source == 'measured_benchmark':
                existing = _with_benchmark(existing, published)
            conn.execute('UPDATE models SET body=? WHERE id=?', (existing.model_dump_json(), model.id))


def list_models(task_type=None):
    seed()
    with db() as conn:
        models = [ModelOffer.model_validate_json(row['body']) for row in conn.execute('SELECT body FROM models ORDER BY id')]
    return [m for m in models if task_type is None or m.task_type == task_type]


def get_model(model_id):
    return next((m for m in list_models() if m.id == model_id), None)


def register(model):
    if model.quality_source == 'measured_benchmark' and not model.benchmark_reference:
        raise ValueError('A measured quality requires benchmark provenance')
    with db() as conn:
        conn.execute('INSERT INTO models VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET body=excluded.body', (model.id, model.model_dump_json()))
    return model


def set_status(model_id, status):
    model = get_model(model_id)
    if model is None: raise KeyError(model_id)
    model.status = status
    return register(model)


def feedback(model_id, latency):
    model = get_model(model_id)
    if model:
        model.latency_ms = latency if model.latency_source != 'measured_ema' else 0.8 * model.latency_ms + 0.2 * latency
        model.latency_ms = max(0.001, model.latency_ms)
        model.latency_source = 'measured_ema'
        register(model)


def compatibility(model, robot_card=None, object_name=None, object_size_mm=None):
    """Reasons a shard cannot serve this robot/object; empty list means compatible."""
    reasons = []
    if model.status != 'available': reasons.append('Provider marked the shard unavailable')
    if robot_card:
        if robot_card.embodiment not in model.embodiments: reasons.append(f'Not built for {robot_card.embodiment}')
        if robot_card.gripper not in model.grippers: reasons.append(f'Not built for a {robot_card.gripper} gripper')
        missing = [s for s in model.required_sensors if s not in robot_card.sensors]
        if missing: reasons.append(f"Robot lacks sensors: {', '.join(missing)}")
    if object_name and model.supported_objects and object_name.lower() not in model.supported_objects:
        reasons.append(f'Cannot recognize "{object_name}" (closed vocabulary)')
    if object_size_mm is not None and not model.object_size_range_mm[0] <= object_size_mm <= model.object_size_range_mm[1]:
        reasons.append(f'Object size {object_size_mm:g} mm outside {model.object_size_range_mm[0]:g}–{model.object_size_range_mm[1]:g} mm')
    return reasons
