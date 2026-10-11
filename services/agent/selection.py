import math
from decimal import Decimal
from shared.schemas.contracts import CandidateEvaluation, SelectionDecision

def risk_score(obs):
    speed = math.hypot(obs.velocity.x, obs.velocity.y)
    proximity = math.exp(-obs.nearest_obstacle_distance / 2)
    time_to_collision = obs.nearest_obstacle_distance / max(speed, .01)
    return min(1, .45 * proximity + .2 * min(obs.nearby_agent_count / 3, 1)
               + .2 * math.exp(-time_to_collision / 2) + .15 * obs.sensor_uncertainty)

def select(request, models):
    risk = max(risk_score(request.observation), request.requirements.fragility if request.requirements else 0)
    budget = Decimal(request.remaining_budget_ausd)
    compatible = [m for m in models if m.task_type == request.task_type]
    max_price = max([float(m.price_ausd) for m in compatible] + [.000001])
    # Risk strengthens a requested quality floor; it never invents an accuracy benchmark.
    quality_floor = min(1, request.minimum_quality + risk * .15) if request.minimum_quality else 0
    evaluations = []
    for model in models:
        reasons = []
        if model.task_type != request.task_type: reasons.append('Capability mismatch')
        if model.status != 'available': reasons.append('Provider unavailable')
        if Decimal(model.price_ausd) > budget: reasons.append('Exceeds remaining budget')
        if model.latency_ms > request.inference_deadline_ms: reasons.append('Exceeds inference deadline')
        if quality_floor and (model.quality is None or model.quality < quality_floor):
            reasons.append(f'Quality does not satisfy risk-adjusted floor {quality_floor:.3f}')
        card, needs = request.robot_card, request.requirements
        if card:
            if card.embodiment not in model.embodiments: reasons.append('Robot embodiment incompatible')
            if card.gripper not in model.grippers: reasons.append('Gripper incompatible')
            if not set(model.required_sensors) <= set(card.sensors): reasons.append('Required sensors missing')
        if needs:
            if card and needs.mass_kg > card.max_payload_kg: reasons.append('Object exceeds robot payload')
            if not model.object_size_range_mm[0] <= needs.object_size_mm <= model.object_size_range_mm[1]: reasons.append('Object size outside shard range')
            if model.supported_objects and needs.object_name not in model.supported_objects: reasons.append('Object class unsupported by detector')
            if request.task_type == 'grasp' and (model.pose_error_mm is None or model.pose_error_mm > needs.max_pose_error_mm): reasons.append('Grasp precision insufficient for fragility')
            if request.task_type == 'control' and (model.min_force_n is None or model.min_force_n > needs.max_force_n): reasons.append('Minimum force exceeds fragile-object limit')
        evaluation = CandidateEvaluation(model=model, eligible=not reasons, reasons=reasons)
        if not reasons:
            cost = float(model.price_ausd) / max_price
            latency = model.latency_ms / request.inference_deadline_ms
            error = 1 - model.quality if model.quality is not None else 1
            pressure = min(1, float(Decimal(model.price_ausd) / budget)) if budget else 1
            evaluation.score = round((.65 - .4 * risk + .3 * pressure) * cost
                                     + (.15 + .35 * risk) * latency + (.2 + .8 * risk) * error, 6)
            evaluation.reasons = ['Satisfies task, budget, availability and deadline constraints']
            if model.quality is None:
                evaluation.reasons.append('Quality unmeasured; uncertainty penalty applied')
        evaluations.append(evaluation)
    eligible = [e for e in evaluations if e.eligible]
    best = min(eligible, key=lambda e: (e.score, e.model.id)) if eligible else None
    return SelectionDecision(selected_model_id=best.model.id if best else None, risk_score=round(risk, 4),
        remaining_budget_ausd=request.remaining_budget_ausd, candidates=evaluations,
        safe_fallback=best is None,
        explanation=(f'{best.model.name} has the lowest feasible score ({best.score:.4f}) at risk {risk:.2f}; '
                     f'price {best.model.price_ausd} AUSD, latency {best.model.latency_ms:.1f} ms ({best.model.latency_source}).'
                     if best else 'No available offer satisfies the constraints; stop safely.'))
