from apps.simulation.world import World, astar
from shared.schemas.contracts import InferenceResult, Point, SimulationControl, Prediction

def test_astar_replans_around_obstacle():
    direct=astar((0,0),(2,0),[])
    detour=astar((0,0),(2,0),[(1,0)])
    assert len(detour)>len(direct)
    assert (1,0) not in detour

def test_motion_requires_result_and_local_safety():
    w=World()
    w.running=True
    w.tick()
    assert w.position==(2,2)
    result=InferenceResult(model_id='astar',path=[Point(x=2,y=2),Point(x=3,y=2)],inference_latency_ms=1,source='algorithm',observation_revision=w.revision)
    w.apply(result,Point(x=3,y=2)); w.running=True; w.tick()
    assert w.position==(3,2)

def test_observations_and_perception_change_behavior():
    w=World()
    old=w.observe()
    w.control(SimulationControl(action='add_pedestrian',point=Point(x=3,y=2)))
    assert w.observe().nearest_obstacle_distance < old.nearest_obstacle_distance
    assert w.observe().nearby_agent_count==1
    result=InferenceResult(model_id='ssdlite',predictions=[Prediction(label='person',confidence=.9,bbox=[0,0,5,5])],source='pretrained_model',inference_latency_ms=1,observation_revision=w.revision)
    w.apply(result,Point(x=3,y=2))
    assert w.speed_divisor==3
