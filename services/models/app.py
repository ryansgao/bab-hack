import os
import secrets
from fastapi import FastAPI, Header, HTTPException
from shared.schemas.contracts import InferenceRequest, InferenceResult
from services.models.inference import infer

app = FastAPI(title='RoboMarket private inference worker')

@app.get('/health')
def health(): return {'status': 'ready', 'weights': 'loaded lazily; run scripts/warm_models.py before demo'}

@app.post('/internal/inference', response_model=InferenceResult)
def inference(request: InferenceRequest, x_service_key: str = Header(default='')):
    key = os.getenv('SERVICE_KEY', '')
    if not key or not secrets.compare_digest(key, x_service_key): raise HTTPException(403, 'Service authentication required')
    try: return infer(request)
    except (ValueError, KeyError) as exc: raise HTTPException(422, str(exc)) from exc
    except Exception as exc: raise HTTPException(503, f'Inference unavailable: {type(exc).__name__}; check model worker logs/setup') from exc
