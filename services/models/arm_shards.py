"""Analytic grasp/force policies. These are not learned models or benchmarks."""
import math

def run_shard(model_id, data):
    needs=data.requirements
    if not needs: raise ValueError('Arm shard requires typed task requirements')
    if model_id in ('power_grasp','precision_grasp'):
        detections=[p for p in data.predictions if needs.object_name in p.label.lower()]
        if not detections: raise ValueError('Perception did not locate the requested object; stop before grasp')
        box=max(detections,key=lambda p:p.confidence).bbox
        center=[(box[0]+box[2])/2,(box[1]+box[3])/2]
        pinch=model_id=='precision_grasp'
        return {'grasp_point_px':center,'gripper_width_mm':needs.object_size_mm*(.82 if pinch else .9),
                'approach_speed_mm_s':20 if pinch else 70,'strategy':'precision_pinch' if pinch else 'power_grasp',
                'object_name':needs.object_name,'basis':'bbox centroid + configured geometry heuristic'}
    if model_id in ('standard_control','soft_control'):
        point=data.prior.get('grasp_point_px')
        if not point: raise ValueError('Control requires a prior grasp result')
        # Two-jaw static friction estimate, safety factor 1.4, mu=.6.
        required_force=needs.mass_kg*9.81*1.4/(2*.6)
        minimum=.05 if model_id=='soft_control' else .8
        force=max(minimum,required_force)
        if force>needs.max_force_n: raise ValueError('Required grip force exceeds task damage threshold; safe stop')
        speed=(10 if model_id=='soft_control' else 45)*(1-.5*needs.fragility)
        return {'grasp_point_px':point,'force_n':round(force,4),'speed_mm_s':round(speed,2),
                'trajectory':[{'phase':'approach','z_mm':80},{'phase':'grasp','z_mm':0},{'phase':'lift','z_mm':60},{'phase':'rotate','z_mm':60},{'phase':'release','z_mm':0}],
                'object_name':needs.object_name,'basis':'analytic friction/force policy; no material simulation'}
    raise ValueError('Unknown arm shard')
