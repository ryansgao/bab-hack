"""Scout's documented grammar fallback; selection remains deterministic.

These object properties are task priors, not vision predictions or benchmarks.
The measured image must still locate the object before grasp/control can execute.
"""
import re
from uuid import uuid4
from shared.schemas.contracts import Requirements, Subtask, MissionPlan, Point

OBJECTS = {'orange': (70, .18, .2), 'grape': (18, .006, .9)}

def arm_plan(request):
    text = request.task.lower()
    if not re.search(r'\b(peel|pick|grasp|handle|inspect|detect|place)\b',text):
        raise ValueError('Arm task grammar supports peel, pick, grasp, handle, inspect, detect, or place an orange or grape')
    if re.search(r'\b(cut|cook|slice|wash)\b',text):
        raise ValueError('This arm has no cutting, cooking or washing tool')
    objects = re.findall(r'\b(orange|grape)s?\b',text)
    if not objects: raise ValueError('Provide an orange or grape task; unknown objects require an operator requirements adapter')
    # Quantity follows the task; avoid an arbitrary fixed three-step plan.
    expanded=[]
    for match in re.finditer(r'(?:(\d+)\s+)?(orange|grape)s?\b',text):
        count=int(match.group(1) or 1)
        if not 1 <= count <= 10: raise ValueError('Use 1–10 objects per type for this prototype')
        verbs=re.findall(r'\b(peel|pick|grasp|handle|inspect|detect|place)\b',text[:match.start()])
        action=verbs[-1] if verbs else 'inspect'
        expanded.extend([(match.group(2),action)]*count)
    steps=[]
    for index, (name, action) in enumerate(expanded):
        size,mass,fragility=OBJECTS[name]
        layers=['object_detection'] if action in ('inspect','detect') else ['object_detection','grasp','control']
        needs=Requirements(object_name=name,object_size_mm=size,mass_kg=mass,fragility=fragility,
            max_pose_error_mm=max(.15,size*(1-fragility)*.05), max_force_n=max(.1,3*(1-fragility)),layers=layers)
        for layer in layers:
            step_id=f'step_{len(steps)+1}'
            steps.append(Subtask(id=step_id, title=f'{name.capitalize()} {index+1} · '+{'object_detection':'locate object','grasp':'plan grasp','control':'execute controlled handling'}[layer],
                task_type=layer,depends_on=[steps[-1].id] if steps else [],target=Point(x=12,y=8),requirements=needs))
    return MissionPlan(id=uuid4().hex,request=request,subtasks=steps,
        explanation=f'Vendor decomposed {len(expanded)} object operation(s) into {len(steps)} shards. '
        'Scout uses documented size/fragility priors and Robot Card compatibility. '
        'Peeling is represented by a handling trajectory; skin removal and material mechanics are not implemented. '
        'Every perception result must contain the requested object before grasp/control can proceed.')
