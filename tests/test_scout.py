import pytest
from shared.schemas.contracts import MissionRequest, RobotCard, SelectionRequest, Point, Observation
from services.agent.planner import decompose
from services.agent.quote import quote
from services.marketplace.registry import list_models
from services.agent.selection import select

@pytest.fixture(autouse=True)
def isolated_db(tmp_path,monkeypatch): monkeypatch.setenv('ROBOMARKET_DB',str(tmp_path/'db.sqlite'))

def test_arm_plan_scales_with_objects_and_goal():
    card=RobotCard()
    assert len(decompose(MissionRequest(task='peel an orange',robot_card=card)).subtasks)==3
    assert len(decompose(MissionRequest(task='peel 2 oranges and a grape',robot_card=card)).subtasks)==9
    assert len(decompose(MissionRequest(task='inspect a grape',robot_card=card)).subtasks)==1
    with pytest.raises(ValueError): decompose(MissionRequest(task='cook a grape',robot_card=card))

def test_robot_and_object_matching_changes_shards():
    orange=quote(decompose(MissionRequest(task='peel an orange',robot_card=RobotCard())))
    grape=quote(decompose(MissionRequest(task='peel a grape',robot_card=RobotCard())))
    assert orange.subtasks[1].decision.selected_model_id=='power_grasp'
    assert grape.subtasks[1].decision.selected_model_id=='precision_grasp'
    assert orange.subtasks[2].decision.selected_model_id=='standard_control'
    assert grape.subtasks[2].decision.selected_model_id=='soft_control'
    assert grape.subtasks[0].decision.selected_model_id=='owlvit'
    incompatible=quote(decompose(MissionRequest(task='peel an orange',robot_card=RobotCard(gripper='suction'))))
    assert incompatible.subtasks[1].decision.safe_fallback

def test_total_budget_checked_before_first_purchase():
    plan=quote(decompose(MissionRequest(task='peel a grape',robot_card=RobotCard(),budget_ausd='0.01')))
    assert any(s.decision.safe_fallback for s in plan.subtasks)
