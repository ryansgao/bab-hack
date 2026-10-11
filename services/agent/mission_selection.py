"""Prefer marketplace inference; keep demos running with explicit virtual effects."""
from services.agent.selection import select
from shared.schemas.contracts import CandidateEvaluation

def select_step(plan, step, request, offers):
    from apps.simulation.matcha_demo import forced_bounty, SCENARIO
    if forced_bounty(plan,step):
        decision=virtual_decision(plan,step,select(request,[],exact=True))
        decision.explanation='This demo reserves serving for a producer bounty. The request is posted automatically; a free virtual serving preview completes the illustration.'
        return decision
    if plan.demo_scenario==SCENARIO:
        offers=[offer for offer in offers if offer.id=='matcha_demo_'+step.id.removeprefix('matcha_')]
        decision=select(request,offers,exact=True)
        return virtual_decision(plan,step,decision) if decision.safe_fallback else decision
    decision=select(request,offers)
    if not decision.safe_fallback or request.execution_mode!='simulation': return decision
    return virtual_decision(plan,step,decision)

def virtual_decision(plan, step, decision):
    if plan.request.execution_mode!='simulation': return decision
    fallback=next((m for m in plan.simulation_fallbacks if m.simulation_program.get('step_id')==step.id),None)
    if fallback is None: return decision
    decision.candidates.append(CandidateEvaluation(model=fallback,eligible=True,score=0,
        reasons=['Virtual demo effect; no provider inference or purchase. Marketplace capability remains unfulfilled.']))
    decision.selected_model_id=fallback.id
    decision.safe_fallback=False
    decision.explanation='No marketplace provider currently fits. Continue the demo with a free, prompt-generated virtual effect; a producer skill is still needed.'
    return decision
