import json
import os
import secrets
from pathlib import Path
import httpx
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from shared.schemas.contracts import (ModelOffer, SelectionRequest, SelectionDecision, MissionRequest,
    MissionPlan, ExecuteRequest, SimulationControl)
from services.marketplace import registry
from services.agent.selection import select
from services.agent.planner import decompose
from services.agent.quote import quote
from apps.simulation.arm import arm
from services.agent.executor import execute, save, get
from services.storage import db
from apps.simulation.world import world

app = FastAPI(title='RoboMarket', version='0.1.0')

@app.exception_handler(HTTPException)
async def http_error(request, exc):
    return JSONResponse(status_code=exc.status_code, content={'error': {'code': f'HTTP_{exc.status_code}', 'message': str(exc.detail)}})

@app.exception_handler(RequestValidationError)
async def invalid(request, exc):
    return JSONResponse(status_code=422, content={'error': {'code':'INVALID_INPUT','message':str(exc)}})

@app.exception_handler(ValueError)
async def bad_value(request, exc):
    return JSONResponse(status_code=422, content={'error': {'code':'INVALID_INPUT','message':str(exc)}})

@app.get('/api/health')
def health():
    return {'status':'ready', 'payment_mode':'testnet', 'payment_configuration':'external setup required', 'mock_payments':False}

@app.get('/api/marketplace/models', response_model=list[ModelOffer])
def models(task_type: str | None = None): return registry.list_models(task_type)

@app.post('/api/marketplace/models', response_model=ModelOffer)
def register(model: ModelOffer, x_service_key: str = Header(default='')):
    key = os.getenv('SERVICE_KEY','')
    if not key or not secrets.compare_digest(key, x_service_key): raise HTTPException(403, 'Service key required')
    return registry.register(model)

@app.post('/api/agent/select', response_model=SelectionDecision)
def selection(request: SelectionRequest): return select(request, registry.list_models())

@app.post('/api/agent/plan', response_model=MissionPlan)
def plan(request: MissionRequest):
    for point in request.waypoints:
        if (point.x,point.y) in world.blocked(): raise ValueError('A destination is occupied')
    return save(quote(decompose(request)))

@app.post('/api/vendor/quote', response_model=MissionPlan)
def vendor_quote(request: MissionRequest): return quote(decompose(request))

@app.get('/api/arm')
def arm_state(): return arm.snapshot()

@app.post('/api/arm/control')
def arm_control(request: SimulationControl):
    if request.action=='reset': arm.reset()
    elif request.action=='pause': arm.running=False
    elif request.action=='start' and arm.output: arm.running=True
    elif request.action=='tick': return arm.tick()
    return arm.snapshot()

@app.get('/api/agent/plans/{plan_id}', response_model=MissionPlan)
def read_plan(plan_id: str):
    try: return get(plan_id)
    except KeyError: raise HTTPException(404, 'Plan not found')

@app.post('/api/agent/execute', response_model=MissionPlan)
def run(request: ExecuteRequest):
    try: return execute(request.plan_id)
    except KeyError: raise HTTPException(404, 'Plan not found')
    except RuntimeError as exc: raise HTTPException(409, str(exc))

@app.get('/api/simulation')
def simulation(): return world.snapshot()

@app.post('/api/simulation/control')
def control(request: SimulationControl): return world.control(request)

async def payment_read(path):
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            response = await client.get(os.getenv('PAYMENT_URL','http://127.0.0.1:4021') + path,
                headers={'X-Service-Key':os.getenv('SERVICE_KEY','')})
            if response.status_code >= 400: raise HTTPException(response.status_code, 'Payment service unavailable or not configured')
            return response.json()
    except httpx.HTTPError: raise HTTPException(503, 'Payment service offline. Start it and configure testnet wallets.')

@app.get('/api/wallet/{robot_id}')
async def wallet(robot_id: str):
    if robot_id != 'robot_001': raise HTTPException(404, 'Unknown robot')
    return await payment_read('/wallet')

@app.get('/api/transactions')
async def transactions(): return await payment_read('/transactions')

@app.get('/api/telemetry')
def telemetry():
    with db() as conn:
        return [dict(created_at=row['created_at'], **json.loads(row['body'])) for row in conn.execute('SELECT * FROM telemetry ORDER BY id DESC LIMIT 100')]

frontend = Path(__file__).resolve().parents[1] / 'apps/frontend/dist'
if frontend.exists(): app.mount('/', StaticFiles(directory=frontend, html=True), name='frontend')
