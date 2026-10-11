"""Durable capability requests, producer submissions, and explicit demo awards."""
import json
import re
from datetime import datetime, timezone
from decimal import Decimal
from uuid import uuid4
from fastapi import APIRouter, HTTPException
from pydantic import Field
from typing import Literal
from shared.schemas.contracts import Contract, Money, TaskType, ModelOffer
from services.storage import db
from services.marketplace import registry

router = APIRouter(prefix='/api/bounties', tags=['bounties'])

class BountyRequest(Contract):
    title: str = Field(min_length=3,max_length=200)
    description: str = Field(min_length=3,max_length=3000)
    task_type: TaskType
    object_name: str | None = Field(default=None,max_length=100)
    execution_mode: Literal['simulation','testnet'] = 'simulation'
    reward_ausd: Money = '0.05'
    success_criteria: str = Field(default='',max_length=1500)

class SubmissionRequest(Contract):
    producer_id: str = Field(pattern=r'^[a-z0-9_-]{1,64}$')
    model_name: str = Field(min_length=3,max_length=100)
    description: str = Field(min_length=10,max_length=3000)
    evidence_url: str = Field(default='',max_length=500)
    price_ausd: Money = '0.001'
    operation: Literal['inspect_attribute','set_attribute'] = 'set_attribute'
    attribute: str = Field(pattern=r'^[a-z][a-z0-9_]{1,63}$')
    value: str = Field(default='',max_length=500)

class Acceptance(Contract):
    submission_id: str

def now(): return datetime.now(timezone.utc).isoformat()

def _save(conn, bounty):
    conn.execute('INSERT INTO bounties(id,body) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body',
        (bounty['id'],json.dumps(bounty)))
    return bounty

def _get(conn, identity):
    row=conn.execute('SELECT body FROM bounties WHERE id=?',(identity,)).fetchone()
    if not row: raise HTTPException(404,'Bounty not found')
    return json.loads(row['body'])

def _create(request, plan_id=None, step_id=None):
    if Decimal(request.reward_ausd)<=0: raise ValueError('The bounty reward must be positive')
    return dict(id=uuid4().hex,**request.model_dump(),status='open',created_at=now(),
        consumer_id='robot_001',plan_ids=[plan_id] if plan_id else [],step_ids=[step_id] if step_id else [],
        submissions=[],accepted_submission_id=None,award=None,published_model_id=None,
        funding_status='demo_credits' if request.execution_mode=='simulation' else 'unfunded_pledge')

def auto_post(plan):
    if not plan.request.auto_bounties: return plan
    models=registry.list_models()
    gaps=[]
    from apps.simulation.matcha_demo import forced_bounty
    for step in plan.subtasks:
        available=[m for m in models if m.execution_mode==plan.request.execution_mode and m.task_type==step.task_type
            and not registry.compatibility(m,plan.request.robot_card,step.object_name)]
        if forced_bounty(plan,step) or not available: gaps.append(step)
    with db() as conn:
        conn.execute('BEGIN IMMEDIATE')
        for step in gaps:
            existing=[json.loads(row['body']) for row in conn.execute('SELECT body FROM bounties')]
            bounty=next((b for b in existing if b['status'] in ('open','review') and
                b['task_type']==step.task_type and b['object_name']==step.object_name and
                b['execution_mode']==plan.request.execution_mode and (forced_bounty(plan,step) or b['success_criteria']==step.success_criteria)),None)
            if bounty:
                bounty['plan_ids']=list(dict.fromkeys([*bounty['plan_ids'],plan.id]))
                bounty['step_ids']=list(dict.fromkeys([*bounty['step_ids'],step.id]))
                if forced_bounty(plan,step):
                    bounty['success_criteria']=step.success_criteria
                    bounty['description']=step.description
            else:
                bounty=_create(BountyRequest(title=step.title,description=step.description or step.title,
                    task_type=step.task_type,object_name=step.object_name,execution_mode=plan.request.execution_mode,
                    reward_ausd=plan.request.bounty_reward_ausd,success_criteria=step.success_criteria),plan.id,step.id)
            if plan.request.execution_mode=='simulation' and step.object_name:
                from apps.simulation.scene import find_objects
                objects=find_objects(plan.simulation_scene,step.object_name)
                if len(objects)==1: bounty['simulation_object']=objects[0]
            _save(conn,bounty)
            if bounty['id'] not in plan.bounty_ids: plan.bounty_ids.append(bounty['id'])
    return plan

@router.get('')
def listing():
    with db() as conn: return [json.loads(row['body']) for row in conn.execute('SELECT body FROM bounties ORDER BY rowid DESC')]

@router.post('')
def create(request: BountyRequest):
    with db() as conn: return _save(conn,_create(request))

@router.post('/{identity}/submissions')
def submit(identity: str, request: SubmissionRequest):
    if Decimal(request.price_ausd)<=0: raise ValueError('Model price must be positive')
    if request.evidence_url and not re.match(r'^https?://[^\s]+$',request.evidence_url): raise ValueError('Evidence URL must use HTTP or HTTPS')
    with db() as conn:
        bounty=_get(conn,identity)
        if bounty['status'] not in ('open','review'): raise HTTPException(409,'This bounty no longer accepts submissions')
        submission=dict(id=uuid4().hex,**request.model_dump(),submitted_at=now(),status='submitted')
        bounty['submissions'].append(submission); bounty['status']='review'
        return _save(conn,bounty)

@router.post('/{identity}/accept')
def accept(identity: str, request: Acceptance):
    with db() as conn:
        conn.execute('BEGIN IMMEDIATE')
        bounty=_get(conn,identity)
        if bounty['accepted_submission_id']:
            if bounty['accepted_submission_id']==request.submission_id: return bounty
            raise HTTPException(409,'Another submission was already accepted')
        solution=next((s for s in bounty['submissions'] if s['id']==request.submission_id),None)
        if not solution: raise HTTPException(404,'Submission not found')
        simulated=bounty['execution_mode']=='simulation'
        if simulated:
            from apps.simulation.mission import fixture_object
            if not bounty['object_name']:
                raise HTTPException(422,'A demo producer solution needs one named object.')
            obj=bounty.get('simulation_object') or fixture_object(bounty['object_name'])
            if solution['operation']=='inspect_attribute' and solution['attribute'] not in obj.get('traits',{}):
                raise HTTPException(422,'This attribute is absent from the object fixture. Choose an existing attribute to inspect.')
        model=ModelOffer(id='bounty_'+solution['id'],name=solution['model_name'],provider_id=solution['producer_id'],
            task_type=bounty['task_type'],price_ausd=solution['price_ausd'],latency_ms=25,kind='algorithm',
            execution_mode=bounty['execution_mode'],category='producer solutions',tags=[bounty['object_name'] or 'custom','bounty solution'],
            specialist=bool(bounty['object_name']),supported_objects=[bounty['object_name']] if bounty['object_name'] else [],
            description=solution['description']+(' Fixture simulation; consumes direct detection evidence.' if simulated else 'Producer delivery pending adapter integration.'),
            status='available' if simulated else 'unavailable',embodiments=['6dof_arm'],pose_error_mm=.1,min_force_n=.01,
            simulation_program={k:solution[k] for k in ('operation','attribute','value')} if simulated else None)
        # Listing and award are written together; retries never award twice.
        conn.execute('INSERT INTO models(id,body) VALUES (?,?)',(model.id,model.model_dump_json()))
        bounty['accepted_submission_id']=solution['id']; bounty['published_model_id']=model.id
        bounty['status']='fulfilled' if simulated else 'awaiting_integration'
        for s in bounty['submissions']: s['status']='accepted' if s['id']==solution['id'] else 'not_selected'
        bounty['award']=dict(id='award_'+bounty['id'],producer_id=solution['producer_id'],amount=bounty['reward_ausd'],
            currency='demo credits' if simulated else 'AUSD',status='recorded_demo_award' if simulated else 'awaiting_funding',
            created_at=now(),transaction_hash=None)
        return _save(conn,bounty)
