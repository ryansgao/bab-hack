"""Reusable fixture profiles and narrowly scoped, executable demo listings."""
import re
from copy import deepcopy

GROUPS = {
 'electronics': 'phone,tablet,laptop,remote control,computer mouse,keyboard,USB cable,charger,headphones,earbuds,game controller,power bank,camera,smartwatch',
 'produce': 'orange,apple,banana,pear,lemon,lime,avocado,tomato,potato,carrot,cucumber,bell pepper,strawberry,grape,peach,mango',
 'kitchen': 'water bottle,glass bottle,plate,bowl,spoon,fork,butter knife,spatula,food container,jar,can,egg carton',
 'tools': 'hammer,pliers,hex key,tape measure,paint brush,utility knife,bolt,nut,washer,gear',
 'household': 'book,notebook,pen,pencil,keys,wallet,sunglasses,toothbrush,soap dispenser,towel,sock,glove',
 'logistics': 'padded envelope,shipping tube,cardboard box,shipping label',
}
PROFILES = []
for category, names in GROUPS.items():
    for index, name in enumerate(names.split(',')):
        name = name.lower(); identity = name.replace(' ', '_')
        traits = {'material': {'electronics':'plastic and metal','produce':'organic','kitchen':'mixed','tools':'metal','household':'mixed','logistics':'paper'}[category],
            'label': name, 'orientation': 'face up', 'seal': 'intact', 'connector': 'undamaged',
            'screen': 'minor scratches; no cracks', 'battery': 'fixture charge 72%',
            'ripeness': 'ripe' if index % 3 else 'not yet ripe', 'bruise': 'none',
            'tip': 'undamaged', 'leak': 'none', 'expiry': '2026-12-31', 'alignment': 'straight'}
        PROFILES.append(dict(id=identity,name=name,aliases=['smartphone','mobile phone','cell phone'] if name=='phone' else [],category=category,
            bbox=[0,0,80,70],size_mm=[75,55,35] if category!='produce' else [65,65,65],mass_kg=.15,
            fragility=.65 if category in ('electronics','produce') else .25,surface_dirt=.03,defects=[],contents='fixture contents unspecified',
            handle=False,destination='inspection_pad',color={'electronics':'#9caec2','produce':'#e7ab60','kitchen':'#b9d5d1','tools':'#94a6b2','household':'#c2b5d1','logistics':'#ccb18c'}[category],traits=traits))

TRAIT_CAPS = {
 'material_check':('material','Identify {object} material'),
 'label_reading':('label','Read {object} label'),
 'orientation_check':('orientation','Check {object} orientation'),
 'seal_inspection':('seal','Inspect {object} seal'),
 'connector_inspection':('connector','Check {object} connector damage'),
 'screen_inspection':('screen','Inspect {object} screen for cracks'),
 'battery_inspection':('battery','Read {object} battery level'),
 'ripeness_inspection':('ripeness','Check {object} ripeness'),
 'bruise_inspection':('bruise','Inspect {object} for bruising'),
 'tip_inspection':('tip','Inspect {object} tip wear'),
 'leak_inspection':('leak','Check {object} for leaks'),
 'expiry_reading':('expiry','Read {object} expiry date'),
 'alignment_check':('alignment','Check {object} alignment'),
}
COMMON = {
 'object_detection':'Locate {object} on the workbench', 'object_identity':'Confirm {object} identity',
 'pose_estimation':'Find {object} grasp orientation', 'dimension_estimation':'Measure {object} dimensions',
 'reachability_check':'Check arm reach to {object}', 'collision_check':'Check clearance around {object}',
 'surface_inspection':'Inspect {object} surface cleanliness', 'damage_inspection':'Inspect {object} for damage',
 'grasp':'Plan a gentle {object} grasp', 'grasp_verification':'Verify {object} grip position',
 'control':'Pick up {object} with a force limit', 'placement_planning':'Plan {object} placement in a tray',
 'object_placement':'Place {object} in the selected tray',
}
EXTRAS = {
 'electronics':['screen_inspection','battery_inspection','connector_inspection','orientation_check'],
 'produce':['ripeness_inspection','bruise_inspection','material_check'],
 'kitchen':['leak_inspection','seal_inspection','expiry_reading'],
 'tools':['tip_inspection','material_check','alignment_check'],
 'household':['material_check','orientation_check','label_reading'],
 'logistics':['seal_inspection','label_reading','alignment_check'],
}
NICHES = {}
for profile in PROFILES:
    actions = dict(COMMON)
    for cap in EXTRAS[profile['category']]: actions[cap] = TRAIT_CAPS[cap][1]
    # Only screen-bearing electronics advertise a screen/battery check.
    if profile['name'] not in ('phone','tablet','laptop','smartwatch','camera','game controller'):
        actions.pop('screen_inspection',None); actions.pop('battery_inspection',None)
    for cap, title in actions.items():
        model_id = f"niche_{profile['id']}_{cap}"[:64]
        NICHES[model_id] = (cap, profile)

def niche_offers():
    return [dict(id=key,name=(COMMON.get(cap) or TRAIT_CAPS[cap][1]).format(object=p['name']),
        provider_id=f"sim_{p['category']}_studio",task_type=cap,price_ausd='0.0008',latency_ms=20,kind='algorithm',
        execution_mode='simulation',category=p['category'],tags=[p['name'],cap.replace('_',' '),'fixture simulation'],
        specialist=True,supported_objects=[p['name'],*p['aliases']],embodiments=['6dof_arm'],pose_error_mm=.1,min_force_n=.01,
        description=f"Only for {p['name']}. {('Reads the '+TRAIT_CAPS[cap][0]+' fixture attribute') if cap in TRAIT_CAPS else 'Runs a scoped '+cap.replace('_',' ')+' adapter'}. Consumes declared prerequisite evidence; simulation only.") for key,(cap,p) in NICHES.items()]

def scene_for_task(task):
    from apps.simulation.scene import default_scene
    scene = default_scene()
    found = [p for p in PROFILES if any(re.search(r'(?<!\w)'+re.escape(alias)+r's?(?!\w)',task.lower()) for alias in [p['name'],*p['aliases']])]
    if not found: return scene
    objects = deepcopy(found[:6])
    objects.extend(o for o in scene['objects'] if o['name'] not in {p['name'] for p in objects})
    scene['objects'] = objects[:6]
    slots = [(145,125),(315,125),(485,125),(145,245),(315,245),(485,245)]
    for obj,(x,y) in zip(scene['objects'],slots):
        width=min(110,obj['bbox'][2]-obj['bbox'][0]); height=min(80,obj['bbox'][3]-obj['bbox'][1])
        obj['bbox']=[x-width/2,y-height/2,x+width/2,y+height/2]
    return scene
