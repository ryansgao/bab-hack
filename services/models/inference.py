import base64
import io
import threading
import time
from PIL import Image
from shared.schemas.contracts import InferenceResult, Point, Prediction
from apps.simulation.world import astar

_models = {}
_lock = threading.Lock()
_preparing = set()
_errors = {}
MODEL_IDS = ('ssdlite','fasterrcnn','owlvit','power_grasp','precision_grasp','standard_control','soft_control','astar','scene_summary')
ALGORITHMS = set(MODEL_IDS) - {'ssdlite','fasterrcnn','owlvit'}

def load_owl_detector():
    from transformers import OwlViTProcessor, OwlViTForObjectDetection
    name='google/owlvit-base-patch32'
    return OwlViTForObjectDetection.from_pretrained(name).eval(), OwlViTProcessor.from_pretrained(name)

def readiness():
    import importlib.util
    return [{'model_id': key, 'state': 'preparing' if key in _preparing else 'ready' if key in _models or key in ALGORITHMS else 'error' if key in _errors else 'cold',
             'dependencies_installed': key in ALGORITHMS or (importlib.util.find_spec('torchvision') is not None and (key!='owlvit' or importlib.util.find_spec('transformers') is not None)),
             'error': _errors.get(key)} for key in MODEL_IDS]

def prepare(model_id):
    if model_id not in MODEL_IDS: raise ValueError('Unknown model adapter')
    if model_id in ALGORITHMS: return {'model_id':model_id,'state':'ready'}
    _preparing.add(model_id)
    try:
        with _lock:
            if model_id not in _models:
                _models[model_id] = load_owl_detector() if model_id=='owlvit' else load_detector(model_id)
        _errors.pop(model_id,None)
        return {'model_id':model_id,'state':'ready'}
    except Exception as exc:
        _errors[model_id]=f'{type(exc).__name__}: model preparation failed; check dependency installation and download access'
        raise
    finally: _preparing.discard(model_id)


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
    if model_id in ('power_grasp','precision_grasp','standard_control','soft_control'):
        from services.models.arm_shards import run_shard
        result.output = run_shard(model_id, data)
        result.summary = result.output['basis']
    elif model_id == 'owlvit':
        result.predictions = owlvit(data)
        result.source = 'pretrained_model'
        result.summary = 'Open-vocabulary detections; confidence is not measured accuracy'
    elif model_id in ('ssdlite', 'fasterrcnn'):
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


def owlvit(data):
    object_name = data.object_name or (data.requirements.object_name if data.requirements else None)
    if not data.image_base64 or not object_name: raise ValueError('OWL-ViT needs an image and an object name')
    from transformers import OwlViTProcessor, OwlViTForObjectDetection
    import torch
    image=Image.open(io.BytesIO(base64.b64decode(data.image_base64,validate=True))).convert('RGB')
    if image.width*image.height>16_000_000: raise ValueError('Image exceeds 16 megapixels')
    image.thumbnail((1280,1280))
    with _lock:
        if 'owlvit' not in _models:
            _models['owlvit']=load_owl_detector()
        model,processor=_models['owlvit']
        inputs=processor(text=[[f'a photo of a {object_name}']],images=image,return_tensors='pt')
        with torch.inference_mode(): outputs=model(**inputs)
        result=processor.post_process_object_detection(outputs=outputs,target_sizes=torch.tensor([[image.height,image.width]]),threshold=.1)[0]
        return [Prediction(label=object_name,confidence=float(score),bbox=box.tolist()) for score,box in zip(result['scores'],result['boxes'])]
