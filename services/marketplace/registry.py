from shared.schemas.contracts import ModelOffer
from services.storage import db

# These are provider-set prices and startup planning estimates, not benchmarks.
SEEDS = [
    dict(id='ssdlite', name='MobileNet · SSD Lite', provider_id='vision_lab', task_type='object_detection', price_ausd='0.002', latency_ms=180),
    dict(id='fasterrcnn', name='MobileNet · Faster R-CNN', provider_id='vision_lab', task_type='object_detection', price_ausd='0.008', latency_ms=650),
    dict(id='astar', name='A* Route Planner', provider_id='navigation_lab', task_type='path_planning', price_ausd='0.001', latency_ms=15, kind='algorithm', quality=1, quality_source='configured_estimate'),
    dict(id='scene_summary', name='Sensor Scene Inspector', provider_id='navigation_lab', task_type='scene_inspection', price_ausd='0.001', latency_ms=10, kind='algorithm'),
]

def seed():
    with db() as conn:
        for offer in SEEDS:
            model = ModelOffer(**offer)
            conn.execute('INSERT OR IGNORE INTO models VALUES (?, ?)', (model.id, model.model_dump_json()))
            existing = ModelOffer.model_validate_json(conn.execute('SELECT body FROM models WHERE id=?',(model.id,)).fetchone()['body'])
            if model.id in ('owlvit','ssdlite','fasterrcnn') and existing.supported_objects in (['orange','grape'], ['orange','person']):
                existing.supported_objects = model.supported_objects
                conn.execute('UPDATE models SET body=? WHERE id=?',(existing.model_dump_json(),model.id))

def list_models(task_type=None):
    seed()
    with db() as conn:
        models = [ModelOffer.model_validate_json(row['body']) for row in conn.execute('SELECT body FROM models ORDER BY id')]
    return [m for m in models if task_type is None or m.task_type == task_type]

def get_model(model_id):
    return next((m for m in list_models() if m.id == model_id), None)

def register(model):
    if model.quality_source == 'measured_benchmark' and not model.benchmark_reference:
        raise ValueError('A measured quality requires benchmark provenance')
    with db() as conn:
        conn.execute('INSERT INTO models VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET body=excluded.body', (model.id, model.model_dump_json()))
    return model

def feedback(model_id, latency):
    model = get_model(model_id)
    if model:
        model.latency_ms = latency if model.latency_source != 'measured_ema' else 0.8 * model.latency_ms + 0.2 * latency
        model.latency_ms = max(0.001, model.latency_ms)
        model.latency_source = 'measured_ema'
        register(model)

SEEDS.extend([
    dict(id='owlvit',name='OWL-ViT · Open Vocabulary',provider_id='vision_lab',task_type='object_detection',price_ausd='0.006',latency_ms=1800,required_sensors=['rgb'],supported_objects=[]),
    dict(id='power_grasp',name='General Power Grasp',provider_id='gripworks',task_type='grasp',price_ausd='0.003',latency_ms=15,kind='algorithm',embodiments=['6dof_arm'],grippers=['parallel_jaw'],required_sensors=['rgb','depth'],object_size_range_mm=[30,150],pose_error_mm=2),
    dict(id='precision_grasp',name='Precision Pinch Grasp',provider_id='gripworks',task_type='grasp',price_ausd='0.008',latency_ms=25,kind='algorithm',embodiments=['6dof_arm'],grippers=['parallel_jaw'],required_sensors=['rgb','depth'],object_size_range_mm=[5,100],pose_error_mm=.1),
    dict(id='standard_control',name='Standard Force Controller',provider_id='motion_lab',task_type='control',price_ausd='0.002',latency_ms=10,kind='algorithm',embodiments=['6dof_arm'],grippers=['parallel_jaw'],required_sensors=['wrist_force'],min_force_n=.8),
    dict(id='soft_control',name='Soft Force Controller',provider_id='motion_lab',task_type='control',price_ausd='0.006',latency_ms=20,kind='algorithm',embodiments=['6dof_arm'],grippers=['parallel_jaw'],required_sensors=['wrist_force'],min_force_n=.05),
])
# Fixed COCO label vocabulary; OWL-ViT accepts an arbitrary object query.
COCO_OBJECTS = 'person,bicycle,car,motorcycle,airplane,bus,train,truck,boat,traffic light,fire hydrant,stop sign,parking meter,bench,bird,cat,dog,horse,sheep,cow,elephant,bear,zebra,giraffe,backpack,umbrella,handbag,tie,suitcase,frisbee,skis,snowboard,sports ball,kite,baseball bat,baseball glove,skateboard,surfboard,tennis racket,bottle,wine glass,cup,fork,knife,spoon,bowl,banana,apple,sandwich,orange,broccoli,carrot,hot dog,pizza,donut,cake,chair,couch,potted plant,bed,dining table,toilet,tv,laptop,mouse,remote,keyboard,cell phone,microwave,oven,toaster,sink,refrigerator,book,clock,vase,scissors,teddy bear,hair drier,toothbrush'.split(',')
for _seed in SEEDS:
    if _seed['id'] in ('ssdlite','fasterrcnn'):
        _seed.update(required_sensors=['rgb'],supported_objects=COCO_OBJECTS)
