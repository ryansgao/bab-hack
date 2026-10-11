from decimal import Decimal
from shared.schemas.contracts import SelectionRequest
from services.agent.selection import select
from services.marketplace.registry import list_models
from apps.simulation.world import world
from apps.simulation.arm import arm

def quote(plan):
    offers=list_models()
    obs=arm.observation() if plan.request.robot_card and plan.request.robot_card.embodiment=='6dof_arm' else world.observe()
    cheapest=[]
    for step in plan.subtasks:
        req=SelectionRequest(observation=obs,task_type=step.task_type,robot_card=plan.request.robot_card,
            requirements=step.requirements,object_name=step.object_name,remaining_budget_ausd=plan.request.budget_ausd,
            inference_deadline_ms=plan.request.inference_deadline_ms,minimum_quality=plan.request.minimum_quality)
        decision=select(req,offers)
        eligible=[Decimal(c.model.price_ausd) for c in decision.candidates if c.eligible]
        cheapest.append(min(eligible) if eligible else None)
        step.decision=decision
    if any(cost is None for cost in cheapest):
        plan.blockers = list(dict.fromkeys(plan.blockers + [f'{s.title}: no compatible marketplace provider for {s.task_type} within the task constraints.' for s in plan.subtasks if s.decision.safe_fallback]))
        plan.status = 'blocked'
        return plan
    remaining=Decimal(plan.request.budget_ausd)
    total=Decimal(0)
    for index,step in enumerate(plan.subtasks):
        future=sum(cheapest[index+1:],Decimal(0))
        spendable=max(Decimal(0),remaining-future)
        decision=select(SelectionRequest(observation=obs,task_type=step.task_type,robot_card=plan.request.robot_card,
            requirements=step.requirements,object_name=step.object_name,remaining_budget_ausd=str(spendable),inference_deadline_ms=plan.request.inference_deadline_ms,
            minimum_quality=plan.request.minimum_quality),offers)
        step.decision=decision
        if decision.selected_model_id:
            cost=next(Decimal(c.model.price_ausd) for c in decision.candidates if c.model.id==decision.selected_model_id)
            total+=cost; remaining-=cost
    plan.estimated_cost_ausd=str(total)
    if any(s.decision.safe_fallback for s in plan.subtasks):
        plan.blockers.append('The complete plan does not fit the task budget.')
    if plan.blockers: plan.status='blocked'
    return plan
