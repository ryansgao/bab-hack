"""Local producer adapters using explicit simulated scene state.

These are fixture-backed demonstrations, not pretrained-model detections or paid
chain settlements. Every output carries its provenance and prerequisite evidence.
"""
import time
from copy import deepcopy
from PIL import ImageStat
from apps.simulation.scene import find_objects, render_scene
from apps.simulation.catalog import NICHES, TRAIT_CAPS
from shared.schemas.contracts import InferenceResult, Prediction

CAPABILITIES = {
 'camera_capture':('RGB Frame Capture','Acquire the built-in simulator camera frame; no upload needed.'),
 'image_quality':('Frame Quality Check','Measure brightness, contrast, resolution of the simulated frame.'),
 'scene_mapping':('Workspace Mapper','List fixture objects and occupied bounds from the camera scene.'),
 'object_detection':('Scene Object Locator','Locate named objects using simulation ground truth, including mugs, tools and packages.'),
 'object_identity':('Object Identity Check','Confirm a detected object name/category against fixture tags.'),
 'pose_estimation':('Object Pose Estimator','Calculate object center and upright pose from scene geometry.'),
 'dimension_estimation':('Object Dimension Check','Return fixture width, depth, height and mass.'),
 'reachability_check':('Arm Reachability Check','Check whether the object center is inside the simulated reachable workspace.'),
 'collision_check':('Clearance Check','Calculate nearest bounding-box clearance to surrounding objects.'),
 'handle_detection':('Handle Locator','Locate the handle when the fixture has one; report absent otherwise.'),
 'surface_inspection':('Surface Condition Inspector','Read the fixture dirt fraction; report clean or needs cleaning.'),
 'damage_inspection':('Damage Inspector','Report fixture defects, including worn handles and dented boxes.'),
 'contents_inspection':('Contents Inspector','Report empty mug or sealed/unknown package; does not see through packaging.'),
 'object_classification':('Object Category Classifier','Read category and destination tags for workbench organization and parcel sorting.'),
 'grasp':('Simulated Grasp Planner','Compute a centroid grasp from named-object detection and physical requirements.'),
 'grasp_verification':('Grasp Width Check','Check the proposed grasp center against object bounds.'),
 'control':('Simulated Handling Controller','Produce an approach/grasp/lift/release trajectory in the local arm.'),
 'placement_planning':('Placement Planner','Plan a destination using destination zone or the fixture destination tag.'),
 'object_placement':('Object Placement','Apply the prerequisite placement proposal to the simulated scene.'),
 'inspection_report':('Inspection Report','Combine surface, damage and contents results for the same object.'),
 'completion_verification':('Outcome Verification','Verify prerequisite evidence; for placement verify final bounds against planned bounds.'),
}
SIM_IDS = {f'sim_{cap}':cap for cap in CAPABILITIES}
SIM_IDS.update({key: cap for key,(cap,_) in NICHES.items()})

def offers():
    return [dict(id=model_id,name=CAPABILITIES[cap][0],description=CAPABILITIES[cap][1],
        provider_id='simlab',task_type=cap,price_ausd='0.001',latency_ms=25,kind='algorithm',
        execution_mode='simulation',embodiments=['6dof_arm'],pose_error_mm=.1,min_force_n=.01)
        for cap in CAPABILITIES for model_id in [f'sim_{cap}']]

def infer_simulated(request):
    started=time.perf_counter()
    data=request.input
    if data.execution_mode!='simulation' or data.simulation_scene.get('source')!='simulation_fixture':
        raise ValueError('Simulation providers require explicit simulation mode and a fixture scene')
    from services.marketplace.catalog import BACKENDS
    adapter_id = BACKENDS.get(request.model_id, request.model_id)
    program = None
    if adapter_id not in SIM_IDS:
        from services.marketplace.registry import get_model
        offer = get_model(request.model_id)
        if not offer or offer.execution_mode!='simulation' or not offer.simulation_program: raise ValueError('Unknown simulation adapter')
        program = offer.simulation_program; cap = offer.task_type
    else: cap=SIM_IDS[adapter_id]
    scene=deepcopy(data.simulation_scene)
    matches=find_objects(scene,data.object_name)
    generic={'camera_capture','image_quality','scene_mapping','completion_verification'}
    if cap not in generic and len(matches)!=1:
        raise ValueError('This shard needs one named object from this mission’s generated scene.')
    obj=matches[0] if len(matches)==1 else None
    if request.model_id in NICHES and (not obj or obj['name']!=NICHES[request.model_id][1]['name']):
        raise ValueError('This specialist only serves its advertised object')
    outputs=[r.get('output',{}) for r in data.dependency_outputs.values()]
    def require(*caps):
        found={o.get('capability') for o in outputs if not obj or o.get('object_id')==obj['id'] or not o.get('object_id')}
        if not set(caps)<=found: raise ValueError('Missing prerequisite evidence: '+', '.join(set(caps)-found))
    result=InferenceResult(model_id=request.model_id,source='simulation',inference_latency_ms=0,observation_revision=data.observation.revision)
    out={'provenance':'simulation_fixture','capability':cap,'object_id':obj['id'] if obj else None,
         'object_name':obj['name'] if obj else None,'evidence_steps':list(data.dependency_outputs)}
    if obj:
        x1,y1,x2,y2=obj['bbox']; center=[(x1+x2)/2,(y1+y2)/2]
        if x1>=x2 or y1>=y2: raise ValueError('Invalid object bounds')
        out['validation']={'fixture_object_match':True,'valid_bounds':True}
    if program:
        if not obj: raise ValueError('A producer fixture program needs one named object')
        require('object_detection')
        operation=program['operation']; attribute=program['attribute']
        if operation=='inspect_attribute':
            if attribute not in obj.get('traits',{}): raise ValueError('Fixture attribute unavailable: '+attribute)
            out.update(attribute=attribute,value=obj['traits'][attribute])
        elif operation=='set_attribute':
            out.update(attribute=attribute,value=program['value'],trait_updates={obj['id']:{attribute:program['value']}})
        else: raise ValueError('Unsupported producer fixture operation')
        out['producer_program']=True
    elif cap in TRAIT_CAPS:
        require('object_detection'); attribute=TRAIT_CAPS[cap][0]
        if attribute not in obj.get('traits',{}): raise ValueError('No fixture attribute for this check')
        out.update(attribute=attribute,value=obj['traits'][attribute])
    elif cap=='camera_capture': out.update(frame_id=scene['id'],resolution=[scene['width'],scene['height']],camera_available=True)
    elif cap=='image_quality':
        require('camera_capture'); stats=ImageStat.Stat(render_scene(scene).convert('L'))
        out.update(mean_brightness=round(stats.mean[0],2),contrast_std=round(stats.stddev[0],2),usable=stats.stddev[0]>5)
    elif cap=='scene_mapping':
        if not data.image_base64: raise ValueError('Scene mapping requires a supplied frame')
        out.update(objects=[{'name':o['name'],'bbox':o['bbox']} for o in scene['objects']],count=len(scene['objects']))
    elif cap=='object_detection':
        if not data.image_base64: raise ValueError('Detection requires a supplied frame')
        stats=ImageStat.Stat(render_scene(scene).convert('L'))
        if stats.stddev[0]<=5: raise ValueError('Frame has insufficient contrast')
        out['validation']['frame_usable']=True
        result.predictions=[Prediction(label=obj['name'],confidence=1,bbox=obj['bbox'])]
        out.update(bbox=obj['bbox'],confidence_basis='Exact fixture match; not model accuracy')
    elif cap in ('object_identity','pose_estimation','dimension_estimation','reachability_check','collision_check','handle_detection','surface_inspection','damage_inspection','contents_inspection','object_classification'):
        require('object_detection')
        if cap=='object_identity': out.update(identity=obj['name'],category=obj['category'],matched=True)
        elif cap=='pose_estimation': out.update(center_px=center,orientation='upright',bbox=obj['bbox'])
        elif cap=='dimension_estimation': out.update(dimensions_mm=obj['size_mm'],mass_kg=obj['mass_kg'])
        elif cap=='reachability_check': out.update(reachable=60<=center[0]<=580 and 60<=center[1]<=360,center_px=center)
        elif cap=='collision_check':
            clearance=min(((max(o['bbox'][0]-x2,x1-o['bbox'][2],0)**2+max(o['bbox'][1]-y2,y1-o['bbox'][3],0)**2)**.5 for o in scene['objects'] if o['id']!=obj['id']),default=640)
            out.update(clearance_px=round(clearance,2),overlap=clearance==0)
        elif cap=='handle_detection': out.update(has_handle=obj['handle'],handle_center_px=[x2,center[1]] if obj['handle'] else None)
        elif cap=='surface_inspection': out.update(dirt_fraction=obj['surface_dirt'],condition='needs cleaning' if obj['surface_dirt']>.1 else 'clean')
        elif cap=='damage_inspection': out.update(defects=obj['defects'],damage_found=bool(obj['defects']))
        elif cap=='contents_inspection': out.update(contents=obj['contents'],visibility='occluded' if obj['category']=='package' else 'visible')
        elif cap=='object_classification': out.update(category=obj['category'],destination=obj['destination'])
    elif cap=='grasp':
        require('object_detection')
        if not (60<=center[0]<=580 and 60<=center[1]<=360): raise ValueError('Object outside simulated reachable workspace')
        out['validation']['reachable']=True
        out.update(grasp_point_px=center,gripper_width_mm=obj['size_mm'][0]*.85,strategy='simulated centroid grasp')
    elif cap=='grasp_verification':
        require('grasp'); grasp=next(o for o in outputs if o.get('capability')=='grasp')
        point=grasp['grasp_point_px']; out.update(verified=x1<=point[0]<=x2 and y1<=point[1]<=y2)
    elif cap=='control':
        require('grasp')
        out.update(grasp_point_px=center,force_n=min(.5,data.requirements.max_force_n if data.requirements else .5),speed_mm_s=100,
            motion_duration_s=4,holding_on_complete=True,
            trajectory=[{'phase':phase,'z_mm':z} for phase,z in [('approach',120),('grasp',0),('lift',180),('hold',180)]])
    elif cap=='placement_planning':
        require('object_detection')
        zone=data.destination or obj['destination']
        if zone not in scene['zones']: raise ValueError('Unknown simulated destination zone')
        cx,cy=scene['zones'][zone]; w,h=x2-x1,y2-y1
        out.update(destination=zone,planned_bbox=[cx-w/2,cy-h/2,cx+w/2,cy+h/2])
    elif cap=='object_placement':
        require('placement_planning','control')
        proposal=next(o for o in outputs if o.get('capability')=='placement_planning')
        bounds=proposal['planned_bbox']; destination=[(bounds[0]+bounds[2])/2,(bounds[1]+bounds[3])/2]
        handling=next(o for o in outputs if o.get('capability')=='control')
        out.update(destination=proposal['destination'],scene_updates={obj['id']:bounds},final_bbox=bounds,
            start_point_px=center,grasp_point_px=destination,force_n=handling.get('force_n',.5),speed_mm_s=100,
            motion_duration_s=4,holding_on_complete=False,
            trajectory=[{'phase':phase,'z_mm':z} for phase,z in [('transport',180),('lower',60),('release',0),('retreat',120)]])
    elif cap=='inspection_report':
        require('surface_inspection','damage_inspection','contents_inspection')
        out['findings']={o['capability']:{k:v for k,v in o.items() if k not in ('provenance','capability','evidence_steps')} for o in outputs}
    elif cap=='completion_verification':
        if not outputs: raise ValueError('Verification requires completed prerequisite evidence')
        verified=all(r.get('source')=='simulation' for r in data.dependency_outputs.values())
        for o in outputs:
            for object_id,bbox in o.get('scene_updates',{}).items():
                verified=verified and next(item['bbox'] for item in scene['objects'] if item['id']==object_id)==bbox
        out.update(verified=verified,checked_steps=list(data.dependency_outputs),scope='Simulation evidence only; no real-world completion claim')
        if not verified: raise ValueError('Simulated outcome verification failed')
    result.output=out
    result.summary=(CAPABILITIES[cap][0] if cap in CAPABILITIES else cap.replace('_',' ').capitalize())+' completed using simulated scene state.'
    result.inference_latency_ms=(time.perf_counter()-started)*1000
    return result
