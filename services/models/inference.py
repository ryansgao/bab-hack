import base64
import io
import threading
import time
from PIL import Image
from shared.schemas.contracts import InferenceResult, Point, Prediction
from apps.simulation.world import astar

_models = {}
_lock = threading.Lock()

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

def infer(request):
    started = time.perf_counter()
    model_id, data = request.model_id, request.input
    result = InferenceResult(model_id=model_id, inference_latency_ms=0,
        observation_revision=data.observation.revision, source='algorithm')
    if model_id in ('ssdlite', 'fasterrcnn'):
        if not data.image_base64: raise ValueError('Object detection requires image_base64')
        raw = base64.b64decode(data.image_base64, validate=True)
        with Image.open(io.BytesIO(raw)) as image:
            if image.width * image.height > 16_000_000: raise ValueError('Image exceeds 16 megapixels')
            image = image.convert('RGB')
            image.thumbnail((1280,1280))
        with _lock:
            if model_id not in _models: _models[model_id] = load_detector(model_id)
            model, weights = _models[model_id]
            import torch
            with torch.inference_mode():
                output = model([weights.transforms()(image)])[0]
            result.predictions = [Prediction(label=weights.meta['categories'][int(label)], confidence=float(score), bbox=box.tolist())
                for label, score, box in zip(output['labels'], output['scores'], output['boxes']) if score >= .4]
        result.source = 'pretrained_model'
        result.summary = f'{len(result.predictions)} detections at confidence >= 0.4. Confidence is not accuracy. Synthetic images are out of domain.'
    elif model_id == 'astar':
        route = astar((data.observation.position.x, data.observation.position.y), (data.target.x, data.target.y),
                      [(p.x,p.y) for p in data.obstacles], data.width, data.height)
        if not route: raise ValueError('No collision-free path exists')
        result.path = [Point(x=x,y=y) for x,y in route]
        result.summary = f'Computed route with {max(0,len(route)-1)} moves'
    elif model_id == 'scene_summary':
        people = sum(p.label == 'person' for p in data.predictions)
        result.summary = f'Sensor inspection: {data.observation.nearby_agent_count} nearby moving agents; {people} persons in supplied detections; nearest obstacle {data.observation.nearest_obstacle_distance:.2f} cells. Shelf contents are not classified.'
    else: raise ValueError('No local adapter registered for model')
    result.inference_latency_ms = (time.perf_counter() - started) * 1000
    return result
