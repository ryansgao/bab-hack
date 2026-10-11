import math
from decimal import Decimal
from shared.schemas.contracts import CandidateEvaluation, SelectionDecision

def risk_score(obs):
    speed = math.hypot(obs.velocity.x, obs.velocity.y)
    proximity = math.exp(-obs.nearest_obstacle_distance / 2)
    time_to_collision = obs.nearest_obstacle_distance / max(speed, .01)
    return min(1, .45 * proximity + .2 * min(obs.nearby_agent_count / 3, 1)
               + .2 * math.exp(-time_to_collision / 2) + .15 * obs.sensor_uncertainty)

def _resolve(task_type, object_name):
    """Capability, its confidence, catalog object, and a per-listing relevance function."""
    try:
        from services.marketplace.matcher import matcher
        m = matcher()
    except Exception:  # matcher unavailable (e.g. scikit-learn missing): exact matching only
        exact = lambda model: 1.0 if (not model.specialist or object_name in model.supported_objects) else 0.0
        return task_type, 1.0, object_name, exact
    task, confidence = m.resolve_capability(task_type)
    if confidence < .35: task = task_type  # too unsure: keep the planner's label (it may become a blocker)
    subject, _ = m.resolve_object(object_name)
    subject = subject or object_name
    probs = m.capability_probabilities(f'{task_type} {object_name or ""}')
    def relevance(model):
        capability = 1.0 if model.task_type == task else float(probs.get(model.task_type, 0))
        fit = m.object_fit(model, subject)
        return 0.0 if fit == 0 else round(.6 * capability + .4 * fit, 4)
    return task, confidence, subject, relevance


def select(request, models, *, exact=False):
    raw_subject = request.object_name or (request.requirements.object_name if request.requirements else None)
    # The matching model maps loose planner wording onto catalog capabilities and objects
    # ("limes" -> lime, "pedestrian" -> person, "seal_check" -> seal_inspection).
    if exact:
        task, task_confidence, subject = request.task_type, 1.0, raw_subject
        relevance_of = lambda model: 1.0 if not model.supported_objects or raw_subject in model.supported_objects else 0.0
    else:
        task, task_confidence, subject, relevance_of = _resolve(request.task_type, raw_subject)
    # Keep comparisons useful and bounded as the niche catalog grows.
    models = [m for m in models if m.task_type == task and relevance_of(m) > 0]
    risk = max(risk_score(request.observation), request.requirements.fragility if request.requirements else 0)
    budget = Decimal(request.remaining_budget_ausd)
    compatible = [m for m in models if m.task_type == task]
    max_price = max([float(m.price_ausd) for m in compatible] + [.000001])
    # Risk strengthens a requested quality floor; it never invents an accuracy benchmark.
    quality_floor = min(1, request.minimum_quality + risk * .15) if request.minimum_quality else 0
    evaluations = []
    for model in models:
        reasons = []
        if model.execution_mode != request.execution_mode: reasons.append('Different execution mode')
        if model.task_type != task: reasons.append('Capability mismatch')
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
        object_name = subject or raw_subject
        if object_name and model.supported_objects and object_name not in model.supported_objects:
            reasons.append('Object class unsupported by detector')
        if needs:
            if card and needs.mass_kg > card.max_payload_kg: reasons.append('Object exceeds robot payload')
            if not model.object_size_range_mm[0] <= needs.object_size_mm <= model.object_size_range_mm[1]: reasons.append('Object size outside shard range')
            if task == 'grasp' and (model.pose_error_mm is None or model.pose_error_mm > needs.max_pose_error_mm): reasons.append('Grasp precision insufficient for fragility')
            if task == 'control' and (model.min_force_n is None or model.min_force_n > needs.max_force_n): reasons.append('Minimum force exceeds fragile-object limit')
        evaluation = CandidateEvaluation(model=model, eligible=not reasons, reasons=reasons)
        if not reasons:
            cost = float(model.price_ausd) / max_price
            latency = model.latency_ms / request.inference_deadline_ms
            error = 1 - model.quality if model.quality is not None else 1
            pressure = min(1, float(Decimal(model.price_ausd) / budget)) if budget else 1
            relevance = relevance_of(model)
            evaluation.score = round((.65 - .4 * risk + .3 * pressure) * cost
                                     + (.15 + .35 * risk) * latency + (.2 + .8 * risk) * error
                                     + .5 * (1 - relevance), 6)
            evaluation.reasons = ['Satisfies task, budget, availability and deadline constraints',
                                  f'Relevance {relevance:.2f} to "{task}"' + (f' for {subject}' if subject else '')
                                  + (' (specialist)' if model.specialist else '')]
            if model.quality is None:
                evaluation.reasons.append('Quality unmeasured; uncertainty penalty applied')
        evaluations.append(evaluation)
    eligible = [e for e in evaluations if e.eligible]
    best = min(eligible, key=lambda e: (e.score, e.model.id)) if eligible else None
    return SelectionDecision(selected_model_id=best.model.id if best else None, risk_score=round(risk, 4),
        remaining_budget_ausd=request.remaining_budget_ausd, candidates=evaluations,
        safe_fallback=best is None,
        explanation=(f'{best.model.name} has the lowest feasible score ({best.score:.4f}) at risk {risk:.2f}; '
                     f'price {best.model.price_ausd} {"USD demo estimate" if request.execution_mode=="simulation" else "AUSD"}, latency {best.model.latency_ms:.1f} ms ({best.model.latency_source}).'
                     if best else 'No available offer satisfies the constraints; stop safely.'))
