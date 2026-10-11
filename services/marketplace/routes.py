"""Discovery endpoints for buyers (Scout) and the dashboard.

Mounted by the gateway with `app.include_router(marketplace_router)`. The
existing list/register routes stay in services/api.py.
"""
import os
import secrets
from decimal import Decimal
from typing import Literal
from fastapi import APIRouter, Header, HTTPException
from pydantic import Field
from shared.schemas.contracts import Contract, ModelOffer, RobotCard, Money, TaskType
from services.marketplace import registry

router = APIRouter(prefix='/api/marketplace', tags=['marketplace'])


class SearchRequest(Contract):
    task_type: TaskType | None = None
    robot_card: RobotCard | None = None
    object_name: str | None = Field(default=None, max_length=100)
    object_size_mm: float | None = Field(default=None, gt=0, le=1000)
    max_price_ausd: Money | None = None
    max_latency_ms: float | None = Field(default=None, gt=0)
    min_quality: float | None = Field(default=None, ge=0, le=1)
    include_incompatible: bool = True
    execution_mode: Literal['testnet', 'simulation'] | None = None


class SearchHit(Contract):
    model: ModelOffer
    compatible: bool
    reasons: list[str]


class StatusUpdate(Contract):
    status: Literal['available', 'unavailable']


@router.get('/models/{model_id}', response_model=ModelOffer)
def model_detail(model_id: str):
    model = registry.get_model(model_id)
    if model is None: raise HTTPException(404, 'Unknown shard')
    return model


@router.post('/search', response_model=list[SearchHit])
def search(request: SearchRequest):
    """Every listing for the layer with a compatible flag and plain-language reasons.

    Compatible shards come first, cheapest first, so a buyer can take the head of
    the list or explain each rejection in the UI.
    """
    hits = []
    for model in registry.list_models(request.task_type):
        if request.execution_mode and model.execution_mode != request.execution_mode: continue
        reasons = registry.compatibility(model, request.robot_card, request.object_name, request.object_size_mm)
        if request.max_price_ausd is not None and Decimal(model.price_ausd) > Decimal(request.max_price_ausd):
            reasons.append(f'Price {model.price_ausd} AUSD exceeds {request.max_price_ausd}')
        if request.max_latency_ms is not None and model.latency_ms > request.max_latency_ms:
            reasons.append(f'Latency {model.latency_ms:.0f} ms exceeds {request.max_latency_ms:.0f} ms')
        if request.min_quality is not None and (model.quality is None or model.quality < request.min_quality):
            reasons.append('No benchmark result' if model.quality is None else f'Quality {model.quality:.2f} below {request.min_quality:.2f}')
        hits.append(SearchHit(model=model, compatible=not reasons, reasons=reasons))
    if not request.include_incompatible: hits = [h for h in hits if h.compatible]
    return sorted(hits, key=lambda h: (not h.compatible, Decimal(h.model.price_ausd), h.model.latency_ms))


@router.get('/benchmarks')
def published_benchmarks():
    """Raw benchmark provenance behind every `measured_benchmark` quality value."""
    return registry.benchmarks()


@router.post('/models/{model_id}/status', response_model=ModelOffer)
def update_status(model_id: str, update: StatusUpdate, x_service_key: str = Header(default='')):
    key = os.getenv('SERVICE_KEY', '')
    if not key or not secrets.compare_digest(key, x_service_key): raise HTTPException(403, 'Service key required')
    try: return registry.set_status(model_id, update.status)
    except KeyError: raise HTTPException(404, 'Unknown shard')


@router.get('/vendors')
def vendors():
    """Provider profiles with live listing counts and price ranges."""
    from services.marketplace.catalog import VENDORS
    by_vendor = {}
    for model in registry.list_models():
        by_vendor.setdefault(model.provider_id, []).append(model)
    rows = []
    for vendor_id, offers in sorted(by_vendor.items()):
        prices = sorted(Decimal(m.price_ausd) for m in offers)
        profile = VENDORS.get(vendor_id, dict(name=vendor_id, focus='', region='', joined=''))
        rows.append(dict(id=vendor_id, **profile, listings=len(offers),
                         capabilities=sorted({m.task_type for m in offers}),
                         execution_modes=sorted({m.execution_mode for m in offers}),
                         price_min_ausd=str(prices[0]), price_max_ausd=str(prices[-1]),
                         benchmarked_listings=sum(m.quality_source == 'measured_benchmark' for m in offers)))
    return rows


@router.get('/stats')
def stats(execution_mode: Literal['testnet', 'simulation'] | None = None):
    """Market depth per capability: how many sellers compete and at what prices."""
    layers = {}
    for model in registry.list_models():
        if execution_mode and model.execution_mode != execution_mode: continue
        layers.setdefault(model.task_type, []).append(model)
    return dict(listings=sum(len(v) for v in layers.values()),
                vendors=len({m.provider_id for v in layers.values() for m in v}),
                capabilities={task: dict(listings=len(offers), vendors=len({m.provider_id for m in offers}),
                                         cheapest_ausd=str(min(Decimal(m.price_ausd) for m in offers)),
                                         priciest_ausd=str(max(Decimal(m.price_ausd) for m in offers)),
                                         best_quality=max((m.quality for m in offers if m.quality is not None), default=None))
                              for task, offers in sorted(layers.items())})
