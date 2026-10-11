import re
from uuid import uuid4
from shared.schemas.contracts import MissionPlan, Point, Subtask

def decompose(request):
    text = request.task.lower()
    inspect = bool(re.search(r'\b(inspect|scan|survey|check)\b', text))
    navigate = bool(re.search(r'\b(navigate|go|move|deliver|visit|patrol|transport)\b', text))
    detect = bool(re.search(r'\b(detect|identify|perceive)\b', text))
    if not (inspect or navigate or detect):
        raise ValueError('Supported goals: navigate, deliver, patrol, inspect, scan, or detect. Specify destinations with waypoints.')
    if re.search(r'\b(grasp|pick|lift|stack|assemble|fly)\b', text):
        raise ValueError('This robot supports navigation and inspection, not manipulation or flight.')
    targets = request.waypoints or [Point(x=21, y=13)]
    steps = []
    previous = []
    for index, target in enumerate(targets):
        capabilities = [('object_detection', 'Observe surroundings')]
        if navigate or inspect: capabilities.append(('path_planning', 'Plan and travel to destination'))
        if inspect: capabilities.append(('scene_inspection', 'Inspect destination'))
        for capability, title in capabilities:
            step_id = f'step_{len(steps) + 1}'
            steps.append(Subtask(id=step_id, title=f'{title} · stop {index + 1}', task_type=capability,
                                 depends_on=list(previous), target=target))
            previous = [step_id]
    return MissionPlan(id=uuid4().hex, request=request, subtasks=steps,
        explanation=f'{len(targets)} destination(s), {len(steps)} individually purchasable subtasks. '
        'Each step consumes its prerequisites before the next purchase. Delivery means navigation; no physical grasping is modeled.')
