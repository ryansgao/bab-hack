from shared.schemas.contracts import MissionRequest, ModelOffer, Observation, Point, SelectionRequest, Vector
from services.agent.planner import decompose
from services.agent.selection import select, risk_score

def observation(**kwargs):
    return Observation(position=Point(x=1,y=1), nearest_obstacle_distance=kwargs.pop('nearest_obstacle_distance',10), nearby_agent_count=kwargs.pop('nearby_agent_count',0), **kwargs)

def offer(id='fast', **kwargs):
    values = dict(id=id,name=id,provider_id='lab',task_type='object_detection',price_ausd='0.002',latency_ms=40,quality=.8,quality_source='configured_estimate')
    values.update(kwargs)
    return ModelOffer(**values)

def request(**kwargs):
    values = dict(observation=observation(),remaining_budget_ausd='0.05',inference_deadline_ms=300)
    values.update(kwargs)
    return SelectionRequest(**values)

def test_variable_plans():
    assert len(decompose(MissionRequest(task='detect obstacles')).subtasks) == 1
    assert len(decompose(MissionRequest(task='navigate to loading bay')).subtasks) == 2
    plan = decompose(MissionRequest(task='inspect shelves',waypoints=[Point(x=2,y=2),Point(x=3,y=3)]))
    assert len(plan.subtasks) == 6
    assert plan.subtasks[-1].depends_on == ['step_5']

def test_price_changes_selection():
    models = [offer('a'),offer('b',price_ausd='0.008')]
    assert select(request(),models).selected_model_id == 'a'
    models[0].price_ausd = '0.02'
    assert select(request(),models).selected_model_id == 'b'

def test_constraints():
    assert select(request(remaining_budget_ausd='0.001'),[offer()]).safe_fallback
    assert select(request(inference_deadline_ms=10),[offer()]).safe_fallback
    assert select(request(),[offer(status='unavailable')]).safe_fallback
    assert select(request(minimum_quality=.9),[offer(quality=None)]).safe_fallback

def test_risk_strengthens_quality_floor():
    low = observation(sensor_uncertainty=0)
    high = observation(nearest_obstacle_distance=.1,nearby_agent_count=3,velocity=Vector(x=2,y=0),sensor_uncertainty=1)
    models=[offer('cheap',quality=.76),offer('precise',quality=.99,price_ausd='0.008')]
    assert risk_score(high) > risk_score(low)
    assert select(request(observation=low,minimum_quality=.7),models).selected_model_id=='cheap'
    assert select(request(observation=high,minimum_quality=.7),models).selected_model_id=='precise'
