"""Durable capability requests, producer submissions, and explicit demo awards."""
import json
import os
import re
from datetime import datetime, timedelta, timezone
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
    for step in plan.subtasks:
        available=[m for m in models if m.execution_mode==plan.request.execution_mode and m.task_type==step.task_type
            and not registry.compatibility(m,plan.request.robot_card,step.object_name)]
        if not available: gaps.append(step)
    with db() as conn:
        conn.execute('BEGIN IMMEDIATE')
        for step in gaps:
            existing=[json.loads(row['body']) for row in conn.execute('SELECT body FROM bounties')]
            bounty=next((b for b in existing if b['status'] in ('open','review') and
                b['task_type']==step.task_type and b['object_name']==step.object_name and
                b['execution_mode']==plan.request.execution_mode and b['success_criteria']==step.success_criteria),None)
            if bounty:
                bounty['plan_ids']=list(dict.fromkeys([*bounty['plan_ids'],plan.id]))
                bounty['step_ids']=list(dict.fromkeys([*bounty['step_ids'],step.id]))
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

def _S(producer_id, model_name, description, price_ausd, operation, attribute):
    return dict(producer_id=producer_id,model_name=model_name,description=description,evidence_url='',
        price_ausd=price_ausd,operation=operation,attribute=attribute,value='')

# (id, age in hours, request, producer submissions, index of the accepted submission)
SEED_BOUNTIES=[
    ('seed_b01',2,dict(title='Detect hairline cracks on phone screens',description='Our returns line needs the arm to flag cracked or chipped phone glass before a unit is restocked. Fine cracks under 0.3 mm are the ones we currently miss.',
        task_type='object_detection',object_name='phone',reward_ausd='0.08',success_criteria='At least 95% recall on cracks of 0.3 mm or wider across 200 returned units, with fewer than 3% false alarms on clean glass.'),[],None),
    ('seed_b02',5,dict(title='Gentle grasp for ripe avocados',description='Ripe avocados bruise under a standard parallel-jaw squeeze. We need a grasp and force profile that lifts a ripe one from a crate and sets it down without leaving a mark.',
        task_type='grasp',object_name='avocado',reward_ausd='0.06',success_criteria='Zero visible bruising on 50 consecutive pick-and-place cycles at ripeness 4 or higher.'),
        [_S('feathertouch','Avocado Cradle Grasp','Wide-contact two-point grasp that spreads load across the shoulder of the fruit and ramps jaw force to 0.4 N. Tuned on ripeness stages 3 to 5.','0.007','inspect_attribute','bruise')],None),
    ('seed_b03',9,dict(title='Read expiry dates off curved can labels',description='Dates are printed on the shoulder of the can and wrap around the curve. The existing text detectors lose them past about 40 degrees of rotation.',
        task_type='object_detection',object_name='can',reward_ausd='0.05',success_criteria='Correctly reads the expiry date on 9 of 10 cans presented at random rotations.'),[],None),
    ('seed_b04',14,dict(title='Verify seal integrity on food containers',description='Before a container ships, confirm the lid seal is continuous with no gaps or folded film. Needs to work on both clear and opaque lids.',
        task_type='scene_inspection',object_name='food container',reward_ausd='0.04',success_criteria='Rejects every container from our defect set of 40 and passes at least 38 of 40 good ones.'),
        [_S('lumen_labs','Lid Seal Inspector','Rim-following inspection that traces the lid edge and scores seal continuity. Handles clear and opaque lids by switching between edge and shadow cues.','0.003','inspect_attribute','seal'),
         _S('pantry_vision','SealCheck Lite','Low-cost seal check that flags lifted corners and missing film using a single top-down view.','0.0015','inspect_attribute','seal')],None),
    ('seed_b05',20,dict(title='Detect a person reaching into the workcell',description='A coworker reaching across the bench while the arm is moving needs to trigger a stop within 150 ms. Pose tracking must stay reliable with sleeves and gloves.',
        task_type='human_pose',object_name=None,reward_ausd='0.12',success_criteria='Hand and forearm keypoints detected within 150 ms in 98% of reach events across 300 recorded reaches.'),
        [_S('sentinel_safety','Reach Guard','Fuses wrist keypoints with a depth-based proximity zone and raises a stop signal when a hand enters the arm sweep volume.','0.014','inspect_attribute','alignment')],None),
    ('seed_b06',30,dict(title='Grasp a loaded tape measure by its case',description='Tape measures spring open if gripped by the tab. Need a grasp that holds the case body and keeps the blade retracted during transfer.',
        task_type='grasp',object_name='tape measure',reward_ausd='0.05',success_criteria='Blade stays retracted through 30 consecutive transfers to the tool rack.'),[],None),
    ('seed_b07',41,dict(title='Sort shipping labels by readability',description='Labels with smudged barcodes need to go to manual review. Classify each label as readable, partial or unreadable before it reaches the scanner.',
        task_type='scene_inspection',object_name='shipping label',reward_ausd='0.045',success_criteria='Agrees with the barcode scanner outcome on at least 97% of 500 labels.'),
        [_S('atlas_perception','Label Grader','Scores barcode contrast and blur and bins each label as readable, partial or unreadable. Runs in under 40 ms per label.','0.002','inspect_attribute','label')],None),
    ('seed_b08',60,dict(title='Detect ripeness of strawberries in a tray',description='Sort strawberries into ripe, turning and underripe from a top-down tray image. Berries often overlap and the stem caps are hidden.',
        task_type='object_detection',object_name='strawberry',reward_ausd='0.07',success_criteria='At least 90% agreement with a human grader on a held-out set of 120 trays.'),
        [_S('pantry_vision','BerryRipe v2','Color-and-texture ripeness classifier layered on a strawberry detector. Trained on tray images with partial occlusion.','0.004','inspect_attribute','ripeness')],0),
    ('seed_b09',90,dict(title='Check battery state on a power bank',description='Report the charge level shown by the indicator LEDs on a power bank so the arm can route low units to the charging shelf.',
        task_type='scene_inspection',object_name='power bank',reward_ausd='0.03',success_criteria='Correct LED count read on 20 of 20 units under normal bench lighting.'),
        [_S('simlab','LED Level Reader','Locates the indicator strip and counts lit segments to estimate charge.','0.001','inspect_attribute','battery')],0),
    ('seed_b10',26,dict(title='Autonomous aisle routing around forklifts',description='A mobile base needs to replan around moving forklifts in a narrow warehouse aisle, keeping a 1.5 m clearance without stopping the whole line.',
        task_type='path_planning',object_name=None,reward_ausd='0.25',execution_mode='testnet',success_criteria='No clearance violations across 20 recorded forklift crossings, with a mean delay under 6 seconds.'),[],None),
    ('seed_b11',52,dict(title='Segment transparent glassware on a wet bench',description='Clear bottles and jars on a wet surface throw reflections that break most segmentation models. We need clean masks for pick planning.',
        task_type='instance_segmentation',object_name='glass bottle',reward_ausd='0.18',execution_mode='testnet',success_criteria='Mask IoU of at least 0.85 on 100 images of glassware on a wet surface.'),
        [_S('lumen_labs','ClearMask','Polarization-aware segmentation that recovers the outline of transparent glass from reflections.','0.009','set_attribute','mask_quality')],None),
]

def seed():
    """Idempotently load the opening board; each bounty keeps a fixed id and is never rewritten."""
    accepted=[]
    with db() as conn:
        conn.execute('BEGIN IMMEDIATE')
        for identity,hours,request,solutions,pick in sorted(SEED_BOUNTIES,key=lambda row:-row[1]):
            if conn.execute('SELECT 1 FROM bounties WHERE id=?',(identity,)).fetchone(): continue
            bounty=_create(BountyRequest(**request))
            bounty['id']=identity
            bounty['created_at']=(datetime.now(timezone.utc)-timedelta(hours=hours)).isoformat()
            for number,solution in enumerate(solutions):
                bounty['submissions'].append(dict(id=f'{identity}_s{number+1}',**solution,
                    submitted_at=(datetime.now(timezone.utc)-timedelta(hours=max(1,hours-number-1))).isoformat(),status='submitted'))
            if solutions: bounty['status']='review'
            _save(conn,bounty)
            if pick is not None: accepted.append((identity,bounty['submissions'][pick]['id']))
    for identity,submission in accepted: accept(identity,Acceptance(submission_id=submission))

_seeded=None

@router.get('')
def listing():
    global _seeded
    target=os.getenv('ROBOMARKET_DB','data/robomarket.sqlite')
    if _seeded!=target: seed(); _seeded=target
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
