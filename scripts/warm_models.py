"""Download official pretrained weights and measure one real sensor-image inference."""
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from apps.simulation.world import world
from shared.schemas.contracts import InferenceInput, InferenceRequest, Point
from services.models.inference import infer
from services.marketplace.registry import feedback
for model_id in ('ssdlite', 'fasterrcnn'):
    request = InferenceRequest(request_id=f'warm_{model_id}', model_id=model_id,
        input=InferenceInput(image_base64=world.sensor_image(), observation=world.observe(), target=Point(x=21,y=13)))
    infer(request)  # separate cold start / download from warm measurement
    result = infer(request)
    feedback(model_id, result.inference_latency_ms)
    print(json.dumps(result.model_dump()))
