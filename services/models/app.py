import os
import secrets
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
from shared.schemas.contracts import InferenceRequest, InferenceResult
from services.models.inference import infer, readiness, prepare, MODEL_IDS

app = FastAPI(title='RoboMarket private inference worker')

@app.get('/health')
def health(): return {'status': 'ready', 'models': readiness()}

@app.post('/internal/inference', response_model=InferenceResult)
def inference(request: InferenceRequest, x_service_key: str = Header(default='')):
    key = os.getenv('SERVICE_KEY', '')
    if not key or not secrets.compare_digest(key, x_service_key): raise HTTPException(403, 'Service authentication required')
    try: return infer(request)
    except (ValueError, KeyError) as exc: raise HTTPException(422, str(exc)) from exc
    except Exception as exc: raise HTTPException(503, f'Inference unavailable: {type(exc).__name__}; check model worker logs/setup') from exc


class PrepareRequest(BaseModel):
    model_id: str = Field(pattern=r'^[a-z0-9_-]{1,64}$')

def authenticate(value):
    key=os.getenv('SERVICE_KEY','')
    if not key or not secrets.compare_digest(key,value): raise HTTPException(403,'Service authentication required')

@app.post('/internal/prepare')
def prepare_model(request: PrepareRequest, x_service_key: str=Header(default='')):
    authenticate(x_service_key)
    try: return prepare(request.model_id)
    except ValueError as exc: raise HTTPException(422,str(exc)) from exc
    except Exception as exc: raise HTTPException(503,f'{type(exc).__name__}: model preparation failed; check dependencies and network access') from exc

@app.post('/internal/validate')
def validate_input(request: InferenceRequest, x_service_key: str=Header(default='')):
    authenticate(x_service_key)
    import base64
    import io
    from PIL import Image
    if request.model_id not in MODEL_IDS: raise HTTPException(422,'No model adapter registered')
    state=next(item for item in readiness() if item['model_id']==request.model_id)
    if state['state']!='ready': raise HTTPException(503,'Model must be prepared before purchasing')
    if request.model_id=='owlvit' and not (request.input.object_name or request.input.requirements):
        raise HTTPException(422,'Open-vocabulary detection requires an object query')
    if request.model_id in ('power_grasp','precision_grasp','standard_control','soft_control') and not request.input.requirements:
        raise HTTPException(422,'Manipulation requires physical object requirements')
    if request.model_id in ('ssdlite','fasterrcnn','owlvit'):
        if not request.input.image_base64: raise HTTPException(422,'Image is required')
        try:
            with Image.open(io.BytesIO(base64.b64decode(request.input.image_base64,validate=True))) as image:
                if image.width*image.height>16_000_000: raise ValueError('Image exceeds 16 megapixels')
                image.verify()
        except Exception as exc: raise HTTPException(422,'Invalid or oversized image input') from exc
    return {'valid':True,'model_id':request.model_id}
