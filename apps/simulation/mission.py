"""Prompt-created fixtures and mission-scoped virtual effects for demo continuity."""
import math
import re
import time
from copy import deepcopy
from hashlib import sha256
from pydantic import Field
from shared.schemas.contracts import Contract, ModelOffer, SimulationEffect, InferenceResult
from apps.simulation.catalog import PROFILES
from apps.simulation.scene import default_scene, find_objects

class FixtureDraft(Contract):
    name: str = Field(min_length=1, max_length=100)
    category: str = Field(default='generic', max_length=40)
    shape: str = Field(default='box', pattern=r'^(box|sphere|cylinder)$')
    color: str = Field(default='#d5bb83', pattern=r'^#[0-9a-fA-F]{6}$')
    traits: dict[str, str] = Field(default_factory=dict, max_length=20)
    size_mm: list[float] | None = Field(default=None,min_length=3,max_length=3)
    mass_kg: float | None = Field(default=None,gt=0,le=100)

def fixture_object(name, draft=None):
    name=name.strip().lower()
    known=next((o for o in [*PROFILES,*default_scene()['objects']] if name in [o['name'],o['id'],*o['aliases']]),None)
    if known:
        obj=deepcopy(known)
    else:
        identity=re.sub(r'[^a-z0-9]+','_',name).strip('_')[:40] or 'object'
        obj=dict(id=identity+'_'+sha256(name.encode()).hexdigest()[:6],name=name,aliases=[],category='generic',
            bbox=[0,0,80,70],size_mm=[75,55,35],mass_kg=.15,fragility=.3,
            surface_dirt=0,defects=[],contents='prompt-generated demo contents',handle=False,
            destination='inspection_pad',color='#d5bb83',shape='box',provenance='prompt_generated_fixture')
    obj.setdefault('traits',{}).setdefault('label',name)
    if draft:
        obj.update(category=draft.category,shape=draft.shape,color=draft.color)
        obj['traits'].update(draft.traits)
        if draft.size_mm: obj['size_mm']=[max(3,min(1000,size)) for size in draft.size_mm]
        if draft.mass_kg: obj['mass_kg']=draft.mass_kg
    if not draft or not draft.size_mm:
        if name=='phone': obj['size_mm']=[75,155,8]
        elif 'shirt' in name: obj['size_mm']=[300,240,6]
        elif 'basket' in name: obj['size_mm']=[320,240,180]
        elif name=='cheese': obj['size_mm']=[90,65,40]
    return obj

def build_scene(reference, drafts, steps, identity):
    """Keep all requested objects, with bounded layout and generated destinations."""
    scene=deepcopy(reference)
    names=list(dict.fromkeys([*(s.object_name.strip().lower() for s in steps if s.object_name),
                              *(o.name.strip().lower() for o in drafts)]))
    objects=[]
    for name in names:
        draft=next((o for o in drafts if o.name.strip().lower()==name),None)
        known=find_objects(scene,name)
        if len(known)==1 and draft is None: obj=deepcopy(known[0])
        else: obj=fixture_object(name,draft)
        if obj['id'] not in {o['id'] for o in objects}: objects.append(obj)
        for step in steps:
            if step.object_name and step.object_name.strip().lower()==name: step.object_name=obj['name']
            if step.requirements and step.requirements.object_name.strip().lower()==name: step.requirements.object_name=obj['name']
    if objects: scene['objects']=objects
    scene['id']='mission_'+identity
    columns=max(1,math.ceil(math.sqrt(len(scene['objects'])*1.6)))
    rows=math.ceil(len(scene['objects'])/columns)
    cell_w,cell_h=500/columns,260/max(1,rows)
    for index,obj in enumerate(scene['objects']):
        cx=70+(index%columns+.5)*cell_w; cy=60+(index//columns+.5)*cell_h
        width=min(100,cell_w*.65); height=min(75,cell_h*.65)
        obj['bbox']=[cx-width/2,cy-height/2,cx+width/2,cy+height/2]
    align_destinations(scene,steps)
    return scene

def align_destinations(scene, steps):
    destinations=list(dict.fromkeys(s.destination for s in steps if s.destination))
    for index,name in enumerate(destinations):
        target=find_objects(scene,name.replace('_',' '))
        if len(target)==1:
            x1,y1,x2,y2=target[0]['bbox']
            scene['zones'][name]=[(x1+x2)/2,(y1+y2)/2]
        elif name not in scene['zones']: scene['zones'][name]=[85+(index%5)*110,335-(index//5)*30]

def attach_virtual_effects(plan):
    if plan.request.execution_mode!='simulation': return plan
    for index,step in enumerate(plan.subtasks):
        effect=step.simulation_effect or SimulationEffect(summary=step.success_criteria or step.title,
            state_changes={step.task_type:'demonstrated'})
        plan.simulation_fallbacks.append(ModelOffer(id=f'virtual_{plan.id[:12]}_{index}',
            name=('Virtual demo · '+step.title)[:100],provider_id='virtual_demo',task_type=step.task_type,
            price_ausd='0',latency_ms=1,kind='algorithm',execution_mode='simulation',simulation_placeholder=True,
            supported_objects=[step.object_name] if step.object_name else [],specialist=bool(step.object_name),
            description='Mission-scoped virtual effect. No trained inference, physical execution or marketplace purchase. A producer skill is still needed.',
            simulation_program={'operation':'virtual_effect','effect':effect.model_dump(),'step_id':step.id}))
    return plan

def recover_legacy_demo(plan):
    """Upgrade untouched blocked demos locally, without repeating an LLM call."""
    if (plan.request.execution_mode!='simulation' or plan.status!='blocked' or plan.simulation_fallbacks
        or float(plan.spent_ausd) or float(plan.simulation_cost_ausd)
        or any(s.result or s.payment for s in plan.subtasks)):
        return False
    from services.agent.planner import validate_graph
    from shared.schemas.contracts import Subtask, Point
    from apps.simulation.catalog import scene_for_task
    plan.blockers=[]
    try: plan.subtasks=validate_graph(plan,plan.request)
    except ValueError:
        # A legacy refusal may contain only validation wrappers. Represent the
        # requested outcome as one explicit virtual action instead of failing GET.
        plan.subtasks=[Subtask(id='demo_action',title=plan.request.task[:200],
            task_type='task_demonstration',description='Virtual demonstration of the requested goal.',
            success_criteria='Record the requested outcome in the demo.',depends_on=[],target=Point(x=12,y=8))]
    plan.simulation_scene=build_scene(plan.simulation_scene or scene_for_task(plan.request.task),[],plan.subtasks,plan.id)
    for step in plan.subtasks:
        step.title=re.sub(r'\s*\(unsupported\)','',step.title,flags=re.I)
        step.status='pending'; step.error=None
        if step.decision and step.decision.safe_fallback:
            step.description='Demonstrate the requested action with a virtual fixture effect while a producer skill is requested.'
            step.simulation_effect=SimulationEffect(summary='Demonstrate '+step.title+' in the virtual scene.',
                state_changes={step.task_type:'demonstrated'},hide_object='consumption' in step.task_type)
    plan.status='planned'
    plan.explanation='This demo creates the objects required by your task and uses free virtual effects for marketplace skills that are still missing.'
    plan.assumptions.append('Recovered an unstarted demo with generated fixtures and virtual effects; no new planning call or physical execution.')
    attach_virtual_effects(plan)
    return True

def infer_virtual(request, offer):
    started=time.perf_counter()
    if request.input.execution_mode!='simulation' or not offer.simulation_placeholder:
        raise ValueError('Virtual effects are only available inside simulation missions')
    effect=SimulationEffect.model_validate(offer.simulation_program['effect'])
    matches=find_objects(request.input.simulation_scene,request.input.object_name) if request.input.object_name else []
    obj=matches[0] if len(matches)==1 else None
    output=dict(provenance='prompt_generated_virtual_effect',capability=offer.task_type,
        object_id=obj['id'] if obj else None,object_name=obj['name'] if obj else None,
        virtual_effect=True,actual_model_inference=False,physical_execution=False,
        marketplace_purchase=False,expected_outcome=effect.summary,state_changes=effect.state_changes,
        evidence_steps=list(request.input.dependency_outputs),capability_status='producer_skill_needed')
    if obj:
        output['trait_updates']={obj['id']:effect.state_changes}
        if effect.hide_object: output['visibility_updates']={obj['id']:False}
        if request.input.destination in request.input.simulation_scene['zones']:
            cx,cy=request.input.simulation_scene['zones'][request.input.destination]
            x1,y1,x2,y2=obj['bbox']; w,h=x2-x1,y2-y1
            output['scene_updates']={obj['id']:[cx-w/2,cy-h/2,cx+w/2,cy+h/2]}
    return InferenceResult(model_id=offer.id,source='simulation',output=output,
        summary='Virtual demo outcome: '+(effect.summary or request.input.instruction),
        inference_latency_ms=(time.perf_counter()-started)*1000,
        observation_revision=request.input.observation.revision)
