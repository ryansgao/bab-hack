"""Sample marketplace catalog: many vendors competing for the same capabilities.

Every listing names the adapter (`backend`) that actually runs when a buyer pays
for it, so each listing is purchasable end to end. Vendors differ in price,
advertised latency, vocabulary and which real model they resell; `quality`
always comes from the backend's published benchmark, never from the listing.

Vendors are fictional sample providers for the hackathon demo.
"""
from services.models.simulation import CAPABILITIES

COCO_OBJECTS = 'person,bicycle,car,motorcycle,airplane,bus,train,truck,boat,traffic light,fire hydrant,stop sign,parking meter,bench,bird,cat,dog,horse,sheep,cow,elephant,bear,zebra,giraffe,backpack,umbrella,handbag,tie,suitcase,frisbee,skis,snowboard,sports ball,kite,baseball bat,baseball glove,skateboard,surfboard,tennis racket,bottle,wine glass,cup,fork,knife,spoon,bowl,banana,apple,sandwich,orange,broccoli,carrot,hot dog,pizza,donut,cake,chair,couch,potted plant,bed,dining table,toilet,tv,laptop,mouse,remote,keyboard,cell phone,microwave,oven,toaster,sink,refrigerator,book,clock,vase,scissors,teddy bear,hair drier,toothbrush'.split(',')
KITCHEN_OBJECTS = ['bottle', 'wine glass', 'cup', 'fork', 'knife', 'spoon', 'bowl', 'banana', 'apple', 'sandwich', 'orange', 'broccoli', 'carrot', 'hot dog', 'pizza', 'donut', 'cake', 'dining table', 'microwave', 'oven', 'toaster', 'sink', 'refrigerator']
WAREHOUSE_OBJECTS = ['person', 'bicycle', 'car', 'truck', 'backpack', 'handbag', 'suitcase', 'bottle', 'chair', 'bench', 'laptop', 'book', 'potted plant']

VENDORS = {
    'edge_vision': dict(name='Edge Vision', focus='Fast on-device COCO detectors', region='us-west', joined='2026-09'),
    'vision_lab': dict(name='Vision Lab', focus='Classic torchvision detectors and open-vocabulary search', region='us-east', joined='2026-08'),
    'gripworks': dict(name='GripWorks', focus='Analytic grasp planners for parallel-jaw arms', region='eu-central', joined='2026-08'),
    'motion_lab': dict(name='Motion Lab', focus='Force controllers for fragile and standard objects', region='us-west', joined='2026-08'),
    'navigation_lab': dict(name='Navigation Lab', focus='Grid planners and sensor summaries for mobile bases', region='us-east', joined='2026-08'),
    'simlab': dict(name='SimLab', focus='Reference simulation adapters for every workcell capability', region='global', joined='2026-10'),
    'sentinel_safety': dict(name='Sentinel Safety', focus='Pedestrian and human-presence detection for shared spaces', region='us-west', joined='2026-10'),
    'pantry_vision': dict(name='Pantry Vision', focus='Low-cost kitchen and produce detection', region='us-west', joined='2026-10'),
    'atlas_perception': dict(name='Atlas Perception', focus='High-recall detectors for cluttered scenes', region='ap-south', joined='2026-09'),
    'budget_bots': dict(name='BudgetBots', focus='Cheapest acceptable option for low-risk tasks', region='global', joined='2026-10'),
    'lumen_labs': dict(name='Lumen Labs', focus='Open-vocabulary and segmentation models for unusual objects', region='eu-west', joined='2026-09'),
    'quantum_grip': dict(name='Quantum Grip', focus='Precision pinch grasps for small items', region='us-east', joined='2026-10'),
    'feathertouch': dict(name='FeatherTouch Robotics', focus='Soft-force handling for produce and glassware', region='eu-central', joined='2026-10'),
    'routewise': dict(name='RouteWise', focus='Path planning for warehouse robots', region='us-central', joined='2026-09'),
    'twin_dynamics': dict(name='Twin Dynamics', focus='Discount digital-twin adapters, slower turnaround', region='global', joined='2026-10'),
    'precisim': dict(name='PreciSim', focus='Premium low-latency simulation adapters', region='global', joined='2026-10'),
}

_rgb = dict(required_sensors=['rgb'])
_arm = dict(kind='algorithm', embodiments=['6dof_arm'], grippers=['parallel_jaw'])

# Real-model and algorithm listings. `backend` is the adapter the worker runs.
_REAL = [
    # Original reference listings (ids unchanged so existing plans keep working).
    dict(id='yolo11n', backend='yolo11n', name='YOLO11 Nano', provider_id='edge_vision', task_type='object_detection', price_ausd='0.002', latency_ms=60, supported_objects=COCO_OBJECTS, description='YOLO11 Nano, 80 COCO classes. Cheapest general detector.', **_rgb),
    dict(id='yolo11s', backend='yolo11s', name='YOLO11 Small', provider_id='edge_vision', task_type='object_detection', price_ausd='0.006', latency_ms=150, supported_objects=COCO_OBJECTS, description='YOLO11 Small, 80 COCO classes. Higher recall than Nano.', **_rgb),
    dict(id='ssdlite', backend='ssdlite', name='MobileNet · SSD Lite', provider_id='vision_lab', task_type='object_detection', price_ausd='0.002', latency_ms=180, supported_objects=COCO_OBJECTS, description='torchvision SSDLite320 MobileNetV3, 80 COCO classes.', **_rgb),
    dict(id='fasterrcnn', backend='fasterrcnn', name='MobileNet · Faster R-CNN', provider_id='vision_lab', task_type='object_detection', price_ausd='0.008', latency_ms=650, supported_objects=COCO_OBJECTS, description='torchvision Faster R-CNN MobileNetV3 FPN, 80 COCO classes.', **_rgb),
    dict(id='owlvit', backend='owlvit', name='OWL-ViT · Open Vocabulary', provider_id='vision_lab', task_type='object_detection', price_ausd='0.006', latency_ms=1800, description='Finds any named object from a text query, e.g. grape or screwdriver.', **_rgb),
    dict(id='power_grasp', backend='power_grasp', name='General Power Grasp', provider_id='gripworks', task_type='grasp', price_ausd='0.003', latency_ms=15, required_sensors=['rgb', 'depth'], object_size_range_mm=[30, 150], pose_error_mm=2, description='Centroid power grasp for medium objects.', **_arm),
    dict(id='precision_grasp', backend='precision_grasp', name='Precision Pinch Grasp', provider_id='gripworks', task_type='grasp', price_ausd='0.008', latency_ms=25, required_sensors=['rgb', 'depth'], object_size_range_mm=[5, 100], pose_error_mm=.1, description='Slow narrow pinch for small or fragile objects.', **_arm),
    dict(id='standard_control', backend='standard_control', name='Standard Force Controller', provider_id='motion_lab', task_type='control', price_ausd='0.002', latency_ms=10, required_sensors=['wrist_force'], min_force_n=.8, description='Friction-based grip force with 0.8 N floor.', **_arm),
    dict(id='soft_control', backend='soft_control', name='Soft Force Controller', provider_id='motion_lab', task_type='control', price_ausd='0.006', latency_ms=20, required_sensors=['wrist_force'], min_force_n=.05, description='Low-speed handling with 0.05 N floor for fragile items.', **_arm),
    dict(id='astar', backend='astar', name='A* Route Planner', provider_id='navigation_lab', task_type='path_planning', price_ausd='0.001', latency_ms=15, kind='algorithm', quality=1, quality_source='configured_estimate', description='Optimal 4-connected grid route around known obstacles.'),
    dict(id='scene_summary', backend='scene_summary', name='Sensor Scene Inspector', provider_id='navigation_lab', task_type='scene_inspection', price_ausd='0.001', latency_ms=10, kind='algorithm', description='Summarizes nearby agents and obstacle distance from sensors.'),

    # Pedestrian safety (doc demo: cheap $0.002 in an empty aisle, $0.02 when a person appears).
    dict(id='sentinel-pedestrian-pro', backend='yolo11s', name='Pedestrian Guard Pro', provider_id='sentinel_safety', task_type='object_detection', price_ausd='0.02', latency_ms=150, supported_objects=['person'], description='YOLO11 Small restricted to people; priced for high-risk shared spaces.', **_rgb),
    dict(id='sentinel-pedestrian-lite', backend='yolo11n', name='Pedestrian Guard Lite', provider_id='sentinel_safety', task_type='object_detection', price_ausd='0.004', latency_ms=60, supported_objects=['person'], description='YOLO11 Nano restricted to people.', **_rgb),
    dict(id='sentinel-pose', backend='yolo11n_pose', name='Human Pose Tracker', provider_id='sentinel_safety', task_type='human_pose', price_ausd='0.012', latency_ms=140, supported_objects=['person'], description='YOLO11 Nano Pose: person boxes plus 17 body keypoints, e.g. reaching arms near the robot.', **_rgb),
    dict(id='yolo11n_pose', backend='yolo11n_pose', name='YOLO11 Nano Pose', provider_id='edge_vision', task_type='human_pose', price_ausd='0.008', latency_ms=140, supported_objects=['person'], description='YOLO11 Nano Pose, 17 COCO keypoints per person.', **_rgb),

    # Kitchen and produce.
    dict(id='pantry-produce-nano', backend='yolo11n', name='Produce Spotter', provider_id='pantry_vision', task_type='object_detection', price_ausd='0.0015', latency_ms=60, supported_objects=KITCHEN_OBJECTS, description='YOLO11 Nano limited to kitchen classes; cheapest fruit detector.', **_rgb),
    dict(id='pantry-produce-plus', backend='yolo11s', name='Produce Spotter Plus', provider_id='pantry_vision', task_type='object_detection', price_ausd='0.005', latency_ms=150, supported_objects=KITCHEN_OBJECTS, description='YOLO11 Small limited to kitchen classes.', **_rgb),

    # Cluttered scenes and budget options.
    dict(id='atlas-clutter-rcnn', backend='fasterrcnn', name='Clutter Scout R-CNN', provider_id='atlas_perception', task_type='object_detection', price_ausd='0.01', latency_ms=650, supported_objects=COCO_OBJECTS, description='Faster R-CNN resale with a priority queue.', **_rgb),
    dict(id='atlas-warehouse-s', backend='yolo11s', name='Warehouse Watch', provider_id='atlas_perception', task_type='object_detection', price_ausd='0.007', latency_ms=150, supported_objects=WAREHOUSE_OBJECTS, description='YOLO11 Small limited to warehouse classes.', **_rgb),
    dict(id='budget-ssd', backend='ssdlite', name='Penny Detector', provider_id='budget_bots', task_type='object_detection', price_ausd='0.001', latency_ms=180, supported_objects=COCO_OBJECTS, description='SSD Lite at cost. Best for low-risk scans.', **_rgb),
    dict(id='budget-route', backend='astar', name='Penny Router', provider_id='budget_bots', task_type='path_planning', price_ausd='0.0005', latency_ms=15, kind='algorithm', quality=1, quality_source='configured_estimate', description='A* route planner at cost.'),

    # Open vocabulary and segmentation.
    dict(id='lumen-anything', backend='owlvit', name='Find Anything', provider_id='lumen_labs', task_type='object_detection', price_ausd='0.009', latency_ms=1800, description='OWL-ViT open-vocabulary search for objects outside COCO (grape, screwdriver, mug).', **_rgb),
    dict(id='lumen-segment', backend='yolo11n_seg', name='Instance Segmenter', provider_id='lumen_labs', task_type='instance_segmentation', price_ausd='0.01', latency_ms=160, supported_objects=COCO_OBJECTS, description='YOLO11 Nano Seg: per-object masks for peeling, cutting and placement.', **_rgb),
    dict(id='yolo11n_seg', backend='yolo11n_seg', name='YOLO11 Nano Seg', provider_id='edge_vision', task_type='instance_segmentation', price_ausd='0.006', latency_ms=160, supported_objects=COCO_OBJECTS, description='YOLO11 Nano instance segmentation, 80 COCO classes.', **_rgb),

    # Manipulation resellers.
    dict(id='quantum-micro-pinch', backend='precision_grasp', name='Micro Pinch', provider_id='quantum_grip', task_type='grasp', price_ausd='0.012', latency_ms=25, required_sensors=['rgb', 'depth'], object_size_range_mm=[5, 100], pose_error_mm=.1, description='Precision pinch with priority support.', **_arm),
    dict(id='quantum-wide-grasp', backend='power_grasp', name='Wide Grasp', provider_id='quantum_grip', task_type='grasp', price_ausd='0.0025', latency_ms=15, required_sensors=['rgb', 'depth'], object_size_range_mm=[30, 150], pose_error_mm=2, description='Power grasp at a discount.', **_arm),
    dict(id='feathertouch-soft', backend='soft_control', name='Feather Grip', provider_id='feathertouch', task_type='control', price_ausd='0.009', latency_ms=20, required_sensors=['wrist_force'], min_force_n=.05, description='Soft controller tuned for produce and glassware.', **_arm),
    dict(id='feathertouch-standard', backend='standard_control', name='Everyday Grip', provider_id='feathertouch', task_type='control', price_ausd='0.0018', latency_ms=10, required_sensors=['wrist_force'], min_force_n=.8, description='Standard controller for sturdy objects.', **_arm),

    # Navigation.
    dict(id='routewise-astar', backend='astar', name='Aisle Router', provider_id='routewise', task_type='path_planning', price_ausd='0.002', latency_ms=12, kind='algorithm', quality=1, quality_source='configured_estimate', description='A* with warehouse-tuned SLA.'),
    dict(id='routewise-scan', backend='scene_summary', name='Aisle Scanner', provider_id='routewise', task_type='scene_inspection', price_ausd='0.0015', latency_ms=10, kind='algorithm', description='Sensor summary for each aisle.'),
]

# Simulation listings: SimLab's reference tier plus two competing tiers per capability.
_SIM_TIERS = [
    ('twin_dynamics', 'twin', 'Lite', '0.0006', 60),
    ('precisim', 'precisim', 'Pro', '0.002', 12),
]


def _simulation_listings():
    rows = []
    for cap, (name, description) in CAPABILITIES.items():
        for vendor, prefix, tier, price, latency in _SIM_TIERS:
            rows.append(dict(id=f'{prefix}_{cap}', backend=f'sim_{cap}', name=f'{name} {tier}', provider_id=vendor,
                             task_type=cap, price_ausd=price, latency_ms=latency, kind='algorithm', execution_mode='simulation',
                             embodiments=['6dof_arm'], pose_error_mm=.1, min_force_n=.01,
                             description=f'{description} Resells the SimLab reference adapter.'))
    return rows


def listings():
    """All sample listings, each with its `backend` adapter id."""
    return [dict(row) for row in _REAL] + _simulation_listings()


BY_ID = {row['id']: row for row in listings()}
BACKENDS = {listing_id: row['backend'] for listing_id, row in BY_ID.items()}
