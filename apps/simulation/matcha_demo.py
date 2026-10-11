"""Removable hackathon scenario. Normal missions never use this fixed planner.

Set MATCHA_DEMO_ENABLED=false and restart to remove routing and demo listings.
Only the exact prompt/aliases below in simulation mode select this scenario.
"""
import os
import re
import time
from decimal import Decimal
from uuid import uuid4
from apps.simulation.mission import FixtureDraft, build_scene, attach_virtual_effects
from apps.simulation.scene import default_scene, find_objects
from shared.schemas.contracts import MissionPlan, Subtask, Point, RobotCard, SimulationEffect, InferenceResult

SCENARIO = 'matcha_demo_v1'
PROMPT = ('Make me a matcha latte: measure 2 g of matcha, add 60 mL of water at 75°C, '
          'whisk until smooth, add 150 mL of oat milk to a glass, combine the matcha '
          'with the milk, and serve it on the serving tray.')
STEPS = [
 ('measure','Measure 2 g of matcha','matcha_dosing','matcha bowl','0.03','matcha_powder_tin','scoop'),
 ('water','Add 60 mL of hot water','matcha_water_pouring','matcha bowl','0.04','hot_water_jug','pour'),
 ('whisk','Whisk the matcha until smooth','matcha_whisking','matcha bowl','0.06','bamboo_whisk','whisk'),
 ('milk','Add 150 mL of oat milk','matcha_milk_pouring','latte glass','0.04','oat_milk_carton','pour'),
 ('combine','Combine matcha and oat milk','matcha_combining','latte glass','0.05','matcha_bowl','pour'),
 ('serve','Serve the latte on the tray','matcha_serving','latte glass',None,None,'serve'),
]
CRITERIA = [
 'The bowl contains 2 g of matcha powder.',
 'The bowl contains 2 g matcha and 60 mL water at the demo temperature of 75°C.',
 'The matcha mixture is smooth and whisked in the fixture state.',
 'The glass contains 150 mL of oat milk.',
 'The glass contains a 210 mL matcha latte; the matcha bowl is empty.',
 'Request a producer skill to serve the finished latte on the serving tray.',
]

def enabled(): return os.getenv('MATCHA_DEMO_ENABLED','true').strip().lower() in ('1','true','yes','on')
def normalized(text): return re.sub(r'\s+',' ',text.strip().lower()).rstrip('.!:')
def matches(request):
    return (enabled() and request.execution_mode=='simulation' and not request.media and
            normalized(request.task) in {normalized(PROMPT),'make matcha for me','make me matcha','make me a matcha latte'})
def forced_bounty(plan,step): return plan.demo_scenario==SCENARIO and step.id=='matcha_serve'
def offers():
    if not enabled(): return []
    return [dict(id='matcha_demo_'+key,name=title,provider_id='matcha_lab',task_type=cap,
        price_ausd=price,latency_ms=20,kind='algorithm',execution_mode='simulation',
        category='matcha demo',tags=['matcha','latte','hackathon demo'],specialist=True,
        supported_objects=[obj],embodiments=['6dof_arm'],grippers=['parallel_jaw'],
        description=f'{title}. Quantitative recipe fixture adapter with built-in ingredient and dependency checks; simulation only.',
        simulation_program={'operation':'matcha_demo','stage':key,'motion_kind':action,'tool_name':tool.replace('_',' ')})
        for key,title,cap,obj,price,tool,action in STEPS if price]

def plan(request):
    identity=uuid4().hex
    request=request.model_copy(update={'robot_card':RobotCard(), 'auto_bounties':True,
        'budget_ausd':str(max(Decimal(request.budget_ausd),Decimal('0.25'))),'bounty_reward_ausd':'5.00',
        'inference_deadline_ms':max(request.inference_deadline_ms,100), 'minimum_quality':0})
    drafts=[FixtureDraft(name=name,category='kitchen',shape=shape,color=color,size_mm=size,mass_kg=mass,traits=traits)
        for name,shape,color,size,mass,traits in [
          ('matcha bowl','cylinder','#ebe6d3',[145,145,75],.25,{'matcha_g':'0','water_ml':'0','smooth':'false'}),
          ('latte glass','cylinder','#c5dddd',[82,82,145],.20,{'milk_ml':'0','matcha_ml':'0','served':'false'}),
          ('matcha powder tin','cylinder','#68965e',[70,70,95],.10,{'supply_g':'100'}),
          ('hot water jug','cylinder','#9cbec7',[90,90,150],.75,{'supply_ml':'500','temperature_c':'75'}),
          ('bamboo whisk','cylinder','#cdbd81',[48,48,105],.03,{'tool':'whisk'}),
          ('oat milk carton','box','#ded2a4',[65,65,180],1.0,{'supply_ml':'1000'}),
          ('serving tray','box','#94745d',[260,200,22],.35,{'destination':'serving'})]]
    steps=[Subtask(id='matcha_'+key,title=title,task_type=cap,object_name=obj,
        description=title+'. '+CRITERIA[index],success_criteria=CRITERIA[index],
        depends_on=['matcha_'+STEPS[index-1][0]] if index else [],target=Point(x=12,y=8),
        destination='serving_tray' if key=='serve' else None,
        simulation_effect=SimulationEffect(summary=('Virtual serving preview; producer bounty remains open.' if key=='serve' else CRITERIA[index]),
            state_changes={'served':'virtual_preview'} if key=='serve' else {cap:'demonstrated'}))
        for index,(key,title,cap,obj,price,tool,action) in enumerate(STEPS)]
    reference=default_scene();reference['objects']=[];reference['zones']={}
    scene=build_scene(reference,drafts,steps,identity)
    # Deterministic recipe station, with enough clearance for the demonstrated tools.
    slots={'matcha bowl':(225,205),'latte glass':(405,205),'matcha powder tin':(105,95),
        'hot water jug':(235,95),'bamboo whisk':(360,95),'oat milk carton':(505,95),'serving tray':(495,325)}
    for obj in scene['objects']:
        x,y=slots[obj['name']];w,d,_=obj['size_mm'];obj['bbox']=[x-w/4,y-d/4,x+w/4,y+d/4]
    scene['zones']['serving_tray']=[495,325]
    return attach_virtual_effects(MissionPlan(id=identity,request=request,subtasks=steps,simulation_scene=scene,
        demo_scenario=SCENARIO,planner='hackathon_demo',planner_model=None,
        robot_visual=dict(name='Matcha station arm',form='arm',body_color='#e6e5da',accent_color='#608c5d',
            context_summary='Fixed hackathon recipe demonstration. A fictional six-axis kitchen arm and ingredient station illustrate the matcha prompt; no reference files were supplied.'),
        explanation='Matcha demo: six fixed recipe actions, five marketplace fixture skills ($0.22), and one automatic $5 demo bounty for serving. Serving uses a free virtual preview while the producer request stays open.',
        assumptions=['Hackathon demo profile is enabled. This exact prompt uses a deterministic recipe, with no Anthropic call or planning charge.',
            'Recipe quantities, tools and robot geometry are fictional simulation fixtures.',
            'The demo uses at least a $0.25 skill limit and a separate $5 demo bounty pledge; no money is charged.',
            'Serving is intentionally reserved for a producer bounty, including on repeated runs.']))

def infer(request,program):
    started=time.perf_counter();data=request.input;scene=data.simulation_scene
    stage=program['stage'];index=next(i for i,s in enumerate(STEPS) if s[0]==stage)
    key,title,cap,name,price,tool,action=STEPS[index]
    def obj(name):
        found=find_objects(scene,name)
        if len(found)!=1: raise ValueError('Matcha demo needs one '+name)
        return found[0]
    bowl,glass=obj('matcha bowl'),obj('latte glass')
    source=obj(tool.replace('_',' '));target=obj(name)
    if data.object_name!=name: raise ValueError('This recipe skill only serves '+name)
    if index and not any(result.get('output',{}).get('capability')==STEPS[index-1][2] for result in data.dependency_outputs.values()):
        raise ValueError('Recipe prerequisite is missing')
    updates={}
    if stage=='measure':
        supply=float(source['traits']['supply_g'])
        if supply<2: raise ValueError('Matcha supply is insufficient')
        updates={bowl['id']:{'matcha_g':'2'},source['id']:{'supply_g':str(supply-2)}}
    elif stage=='water':
        if bowl['traits']['matcha_g']!='2' or float(source['traits']['supply_ml'])<60: raise ValueError('Recipe dose or water supply invalid')
        updates={bowl['id']:{'water_ml':'60','temperature_c':'75'},source['id']:{'supply_ml':str(float(source['traits']['supply_ml'])-60)}}
    elif stage=='whisk':
        if bowl['traits']['matcha_g']!='2' or bowl['traits']['water_ml']!='60': raise ValueError('Whisking needs the prepared dose and water')
        updates={bowl['id']:{'smooth':'true','foam':'fine'}}
    elif stage=='milk':
        if float(source['traits']['supply_ml'])<150: raise ValueError('Milk supply is insufficient')
        updates={glass['id']:{'milk_ml':'150'},source['id']:{'supply_ml':str(float(source['traits']['supply_ml'])-150)}}
    elif stage=='combine':
        if bowl['traits']['smooth']!='true' or glass['traits']['milk_ml']!='150': raise ValueError('Combining needs smooth matcha and measured milk')
        updates={glass['id']:{'matcha_ml':'60','total_ml':'210','drink':'matcha latte'},bowl['id']:{'matcha_g':'0','water_ml':'0'}}
    def center(o):
        x1,y1,x2,y2=o['bbox'];return [(x1+x2)/2,(y1+y2)/2]
    output=dict(provenance='simulation_fixture',capability=cap,object_id=target['id'],object_name=name,
        evidence_steps=list(data.dependency_outputs),validation={'recipe_inputs_valid':True,'quantities_valid':True},
        trait_updates=updates,motion_kind=action,tool_object_id=source['id'],target_object_id=target['id'],
        start_point_px=center(source),grasp_point_px=center(target),force_n=.4,speed_mm_s=80,
        motion_duration_s=5,holding_on_complete=False,
        trajectory=[{'phase':phase} for phase in ['approach','grasp','lift',action,'lower','release']],
        recipe_outcome=CRITERIA[index])
    return InferenceResult(model_id=request.model_id,source='simulation',output=output,summary=CRITERIA[index],
        observation_revision=data.observation.revision,inference_latency_ms=(time.perf_counter()-started)*1000)
