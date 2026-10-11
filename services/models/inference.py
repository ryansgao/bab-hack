"""Model adapters for the private inference worker.

Every image detector goes through `detect()`, so the marketplace benchmark
(`services/models/benchmark.py`) measures exactly the code path buyers pay for.
"""
import base64
import io
import os
import threading
import time
import urllib.request
from pathlib import Path
from PIL import Image
from shared.schemas.contracts import InferenceResult, Point, Prediction
from apps.simulation.world import astar

_models = {}
_lock = threading.Lock()
_preparing = set()
_errors = {}

TORCHVISION_DETECTORS = ('ssdlite', 'fasterrcnn')
# Ultralytics publishes official COCO weights as GitHub release assets.
YOLO_DETECTORS = {
    'yolo11n': 'https://github.com/ultralytics/assets/releases/download/v8.3.0/yolo11n.pt',
    'yolo11s': 'https://github.com/ultralytics/assets/releases/download/v8.3.0/yolo11s.pt',
}
CLOSED_SET_DETECTORS = TORCHVISION_DETECTORS + tuple(YOLO_DETECTORS)
IMAGE_MODELS = CLOSED_SET_DETECTORS + ('owlvit',)
ARM_SHARDS = ('power_grasp', 'precision_grasp', 'standard_control', 'soft_control')
MODEL_IDS = IMAGE_MODELS + ARM_SHARDS + ('astar', 'scene_summary')
ALGORITHMS = set(MODEL_IDS) - set(IMAGE_MODELS)
SERVING_THRESHOLD = .4  # detections below this confidence are not returned to buyers
MAX_PIXELS = 16_000_000


def _dependency(module):
    import importlib.util
    return importlib.util.find_spec(module) is not None


def dependencies_installed(model_id):
    if model_id in ALGORITHMS: return True
    if model_id in YOLO_DETECTORS: return _dependency('ultralytics')
    if model_id == 'owlvit': return _dependency('torchvision') and _dependency('transformers')
    return _dependency('torchvision')


def readiness():
    return [{'model_id': key,
             'state': 'preparing' if key in _preparing else 'ready' if key in _models or key in ALGORITHMS else 'error' if key in _errors else 'cold',
             'dependencies_installed': dependencies_installed(key),
             'error': _errors.get(key)} for key in MODEL_IDS]


def _load(model_id):
    if model_id == 'owlvit': return load_owl_detector()
    if model_id in YOLO_DETECTORS: return load_yolo(model_id)
    return load_detector(model_id)


def _loaded(model_id):
    with _lock:
        if model_id not in _models: _models[model_id] = _load(model_id)
        return _models[model_id]


def prepare(model_id):
    if model_id not in MODEL_IDS: raise ValueError('Unknown model adapter')
    if model_id in ALGORITHMS: return {'model_id': model_id, 'state': 'ready'}
    _preparing.add(model_id)
    try:
        _loaded(model_id)
        _errors.pop(model_id, None)
        return {'model_id': model_id, 'state': 'ready'}
    except Exception as exc:
        _errors[model_id] = f'{type(exc).__name__}: model preparation failed; check dependency installation and download access'
        raise
    finally:
        _preparing.discard(model_id)


def load_detector(model_id):
    import torch
    from torchvision.models.detection import (
        ssdlite320_mobilenet_v3_large, SSDLite320_MobileNet_V3_Large_Weights,
        fasterrcnn_mobilenet_v3_large_320_fpn, FasterRCNN_MobileNet_V3_Large_320_FPN_Weights,
    )
    torch.set_num_threads(2)
    choices = {
        'ssdlite': (ssdlite320_mobilenet_v3_large, SSDLite320_MobileNet_V3_Large_Weights.DEFAULT),
        'fasterrcnn': (fasterrcnn_mobilenet_v3_large_320_fpn, FasterRCNN_MobileNet_V3_Large_320_FPN_Weights.DEFAULT),
    }
    constructor, weights = choices[model_id]
    return constructor(weights=weights).eval(), weights


def weights_path(model_id):
    folder = Path(os.getenv('MODEL_WEIGHTS_DIR', 'data/weights'))
    path = folder / f'{model_id}.pt'
    if not path.exists():
        folder.mkdir(parents=True, exist_ok=True)
        partial = path.with_suffix('.part')
        urllib.request.urlretrieve(YOLO_DETECTORS[model_id], partial)
        partial.rename(path)
    return path


def load_yolo(model_id):
    import torch
    from ultralytics import YOLO
    torch.set_num_threads(2)
    return YOLO(str(weights_path(model_id))), None


def load_owl_detector():
    from transformers import OwlViTProcessor, OwlViTForObjectDetection
    name = 'google/owlvit-base-patch32'
    return OwlViTForObjectDetection.from_pretrained(name).eval(), OwlViTProcessor.from_pretrained(name)


def decode_image(image_base64):
    if not image_base64: raise ValueError('Object detection requires image_base64')
    with Image.open(io.BytesIO(base64.b64decode(image_base64, validate=True))) as image:
        if image.width * image.height > MAX_PIXELS: raise ValueError('Image exceeds 16 megapixels')
        image = image.convert('RGB')
    image.thumbnail((1280, 1280))
    return image


def detect(model_id, image, threshold=SERVING_THRESHOLD, query=None):
    """Run one image detector on a PIL image. Boxes are [x1, y1, x2, y2] pixels."""
    import torch
    model, extra = _loaded(model_id)
    with _lock, torch.inference_mode():
        if model_id in TORCHVISION_DETECTORS:
            output = model([extra.transforms()(image)])[0]
            names = extra.meta['categories']
            return [Prediction(label=names[int(label)], confidence=float(score), bbox=box.tolist())
                    for label, score, box in zip(output['labels'], output['scores'], output['boxes']) if score >= threshold]
        if model_id in YOLO_DETECTORS:
            boxes = model.predict(image, conf=threshold, verbose=False, device='cpu')[0].boxes
            return [Prediction(label=model.names[int(label)], confidence=float(score), bbox=box.tolist())
                    for label, score, box in zip(boxes.cls, boxes.conf, boxes.xyxy)]
        if model_id == 'owlvit':
            if not query: raise ValueError('OWL-ViT needs an object name')
            inputs = extra(text=[[f'a photo of a {query}']], images=image, return_tensors='pt')
            outputs = model(**inputs)
            result = extra.post_process_object_detection(outputs=outputs, target_sizes=torch.tensor([[image.height, image.width]]), threshold=min(threshold, .1))[0]
            return [Prediction(label=query, confidence=float(score), bbox=box.tolist()) for score, box in zip(result['scores'], result['boxes'])]
    raise ValueError('No detector adapter registered for model')


def infer(request):
    started = time.perf_counter()
    model_id, data = request.model_id, request.input
    result = InferenceResult(model_id=model_id, inference_latency_ms=0,
        observation_revision=data.observation.revision, source='algorithm')
    if model_id in ARM_SHARDS:
        from services.models.arm_shards import run_shard
        result.output = run_shard(model_id, data)
        result.summary = result.output['basis']
    elif model_id == 'owlvit':
        query = data.object_name or (data.requirements.object_name if data.requirements else None)
        result.predictions = detect(model_id, decode_image(data.image_base64), query=query)
        result.source = 'pretrained_model'
        result.summary = 'Open-vocabulary detections; confidence is not measured accuracy'
    elif model_id in CLOSED_SET_DETECTORS:
        result.predictions = detect(model_id, decode_image(data.image_base64))
        result.source = 'pretrained_model'
        result.summary = (f'{len(result.predictions)} detections at confidence >= {SERVING_THRESHOLD}. '
                          'Quality on the listing is COCO128 mAP@0.5; synthetic images are out of domain.')
    elif model_id == 'astar':
        route = astar((data.observation.position.x, data.observation.position.y), (data.target.x, data.target.y),
                      [(p.x, p.y) for p in data.obstacles], data.width, data.height)
        if not route: raise ValueError('No collision-free path exists')
        result.path = [Point(x=x, y=y) for x, y in route]
        result.summary = f'Computed route with {max(0, len(route) - 1)} moves'
    elif model_id == 'scene_summary':
        people = sum(p.label == 'person' for p in data.predictions)
        result.summary = f'Sensor inspection: {data.observation.nearby_agent_count} nearby moving agents; {people} persons in supplied detections; nearest obstacle {data.observation.nearest_obstacle_distance:.2f} cells. Shelf contents are not classified.'
    else:
        raise ValueError('No local adapter registered for model')
    result.inference_latency_ms = (time.perf_counter() - started) * 1000
    return result
