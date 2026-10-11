import json
import os
import threading
from decimal import Decimal
import httpx
from shared.schemas.contracts import MissionPlan, SelectionRequest, InferenceInput, InferenceRequest, InferenceResult, Point
from services.storage import db, event
from services.marketplace.registry import list_models, feedback
from services.agent.selection import select
from apps.simulation.world import world

execution_lock = threading.Lock()

def save(plan):
    with db() as conn:
        conn.execute('INSERT INTO plans VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET body=excluded.body', (plan.id, plan.model_dump_json()))
    return plan

def get(plan_id):
    with db() as conn:
        row = conn.execute('SELECT body FROM plans WHERE id=?', (plan_id,)).fetchone()
    if not row: raise KeyError(plan_id)
    return MissionPlan.model_validate_json(row['body'])

def execute(plan_id, purchase=None):
    if not execution_lock.acquire(blocking=False): raise RuntimeError('Another mission execution is in progress')
    try:
        plan = get(plan_id)
        if plan.status in ('completed', 'blocked'): return plan
        # A single robot cannot execute competing missions concurrently.
        with db() as conn:
            for row in conn.execute('SELECT body FROM plans WHERE id != ?', (plan_id,)):
                other = MissionPlan.model_validate_json(row['body'])
                if other.status in ('running', 'waiting_for_motion'):
                    raise RuntimeError('The robot already has an active mission')
        plan.status = 'running'
        save(plan)
        for step in plan.subtasks:
            if step.status == 'completed': continue
            if step.status == 'running':
                step.error = 'Interrupted purchase: inspect payment ledger before creating another mission'
                step.status, plan.status = 'blocked', 'blocked'
                world.stop(step.error)
                return save(plan)
            if step.status == 'waiting_for_motion':
                if world.position != (step.target.x, step.target.y):
                    plan.status = 'waiting_for_motion'
                    return save(plan)
                step.status = 'completed'
                save(plan)
                continue
            if any(next(s for s in plan.subtasks if s.id == dep).status != 'completed' for dep in step.depends_on): break
            remaining = Decimal(plan.request.budget_ausd) - Decimal(plan.spent_ausd)
            request = SelectionRequest(observation=world.observe(), task_type=step.task_type,
                remaining_budget_ausd=str(max(Decimal(0), remaining)), inference_deadline_ms=plan.request.inference_deadline_ms,
                minimum_quality=plan.request.minimum_quality)
            step.decision = select(request, list_models())
            event({'type': 'selection', 'plan_id': plan.id, 'step_id': step.id, **step.decision.model_dump()})
            if step.decision.safe_fallback:
                step.status, step.error, plan.status = 'blocked', step.decision.explanation, 'blocked'
                world.stop(step.error)
                return save(plan)
            step.status = 'running'
            save(plan)  # Durable intent before any external payment.
            try:
                predictions = [p for s in plan.subtasks if s.result for p in s.result.predictions]
                body = InferenceRequest(request_id=f'{plan.id}_{step.id}', model_id=step.decision.selected_model_id,
                    input=InferenceInput(observation=request.observation, target=step.target,
                        image_base64=plan.request.image_base64 or world.sensor_image(),
                        obstacles=[Point(x=x,y=y) for x,y in world.blocked()], predictions=predictions))
                if purchase:
                    response = purchase(body)
                else:
                    with httpx.Client(timeout=180) as client:
                        resp = client.post(os.getenv('PAYMENT_URL', 'http://127.0.0.1:4021') + '/purchase',
                            json=body.model_dump(), headers={'X-Service-Key': os.getenv('SERVICE_KEY','')})
                        response = resp.json()
                        if resp.status_code >= 400:
                            # Preserve receipt even if inference failed after payment.
                            if response.get('payment'):
                                step.payment = response['payment']
                                if step.payment.get('status') == 'settled':
                                    plan.spent_ausd = str(Decimal(plan.spent_ausd) + Decimal(step.payment['amount_ausd']))
                            raise ValueError(response.get('error', {}).get('message', 'Payment service rejected purchase'))
                step.payment = response['payment']
                if step.payment.get('status') != 'settled': raise ValueError('Payment is not verified as settled')
                plan.spent_ausd = str(Decimal(plan.spent_ausd) + Decimal(step.payment['amount_ausd']))
                result = InferenceResult.model_validate(response['inference'])
                step.result = result
                feedback(result.model_id, result.inference_latency_ms)
                event({'type': 'inference', 'plan_id': plan.id, 'step_id': step.id, **result.model_dump()})
                if result.inference_latency_ms > plan.request.inference_deadline_ms:
                    raise ValueError('Inference exceeded deadline; receipt retained, robot stopped')
                world.apply(result, step.target)
                if step.task_type == 'path_planning' and world.position != (step.target.x,step.target.y):
                    step.status, plan.status = 'waiting_for_motion', 'waiting_for_motion'
                    world.running = True
                    return save(plan)
                step.status = 'completed'
                save(plan)
            except Exception as exc:
                step.status, plan.status = 'blocked', 'blocked'
                step.error = str(exc) if isinstance(exc, ValueError) else f'{type(exc).__name__}: service unavailable; check setup and ledger before retry'
                world.stop(step.error)
                return save(plan)
        plan.status = 'completed' if all(s.status == 'completed' for s in plan.subtasks) else 'blocked'
        return save(plan)
    finally:
        execution_lock.release()
