"""Shard registry: provider listings persisted in SQLite.

Prices are provider-set. `quality` is only filled from published benchmark
results (services/models/benchmarks.json); otherwise it stays unknown.
"""
import json
from pathlib import Path
from shared.schemas.contracts import ModelOffer
from services.storage import db

BENCHMARKS = Path(__file__).resolve().parents[1] / 'models' / 'benchmarks.json'

from services.marketplace.catalog import COCO_OBJECTS, BACKENDS, listings
from services.models.simulation import offers as simulation_offers

# Sample catalog (many competing vendors) plus SimLab's reference simulation adapters.
SEEDS = [{k: v for k, v in row.items() if k != 'backend'} for row in listings()] + simulation_offers()
_seeded_db = None


def backend(model_id):
    """Adapter that runs when this listing is purchased."""
    return BACKENDS.get(model_id, model_id)


def benchmarks():
    return json.loads(BENCHMARKS.read_text()) if BENCHMARKS.exists() else {'results': {}}


def _with_benchmark(model, published):
    adapter = backend(model.id)
    result = published['results'].get(adapter)
    if not result: return model
    quality, scope = result['map50'], 'all classes'
    by_class = result.get('ap50_by_class', {})
    if model.supported_objects and len(model.supported_objects) < len(COCO_OBJECTS):
        scoped = [by_class[c] for c in model.supported_objects if c in by_class]
        if scoped: quality, scope = sum(scoped) / len(scoped), f'{len(scoped)} listed classes'
    model.quality = round(quality, 4)
    model.quality_source = 'measured_benchmark'
    model.benchmark_reference = f"services/models/benchmarks.json#{adapter} · COCO128 AP@0.5 over {scope} · n={result['images']}"
    if model.latency_source != 'measured_ema':
        model.latency_ms = result['latency_ms_p50']
    return model


def seed(force=False):
    """Idempotently load sample listings; runs once per database per process."""
    global _seeded_db
    import os
    target = os.getenv('ROBOMARKET_DB', 'data/robomarket.sqlite')
    if _seeded_db == target and not force: return
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
    _seeded_db = target


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


def capability_summary(execution_mode=None):
    """Compact catalog for planners: one row per capability instead of every listing.

    The full catalog is ~90 listings (~11k tokens in simulation mode); planning only
    needs to know which capabilities exist. Scout then compares individual listings.
    """
    from decimal import Decimal
    rows = {}
    for model in list_models():
        if execution_mode and model.execution_mode != execution_mode: continue
        rows.setdefault(model.task_type, []).append(model)
    return [dict(task_type=task, listings=len(offers), vendors=sorted({m.provider_id for m in offers}),
                 price_range_ausd=[str(min(Decimal(m.price_ausd) for m in offers)), str(max(Decimal(m.price_ausd) for m in offers))],
                 examples=[m.description or m.name for m in offers[:2]])
            for task, offers in sorted(rows.items())]
