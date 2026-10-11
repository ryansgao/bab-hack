import type { Plan, RobotConfig, SimulationScene, Step } from './types';
export const TABLE_Y=.74, PIXEL_M=.002;
export const point=(scene:SimulationScene,x:number,y:number):[number,number,number]=>[(x-scene.width/2)*PIXEL_M,TABLE_Y,(y-scene.height/2)*PIXEL_M];
export function subject(scene:SimulationScene,step?:Step) {const name=(step?.object_name||step?.requirements?.object_name||'').toLowerCase();return scene.objects.find(o=>[o.id,o.name,...o.aliases].includes(name));}
export function position(scene:SimulationScene,item:SimulationScene['objects'][number],steps:Step[]=[],before=0) {
  let bbox=item.bbox;let hidden=item.visible===false;
  for(const step of steps.slice(0,before)) {
    const update=step.result?.output.scene_updates as Record<string,typeof bbox>|undefined;
    if(update?.[item.id])bbox=update[item.id];
    else if(step.task_type==='object_placement' && subject(scene,step)?.id===item.id) {
      const proposal=steps.find(s=>step.depends_on.includes(s.id) && s.task_type==='placement_planning');
      const zone=scene.zones[step.destination||proposal?.destination||item.destination];
      if(zone)bbox=[zone[0]-(bbox[2]-bbox[0])/2,zone[1]-(bbox[3]-bbox[1])/2,zone[0]+(bbox[2]-bbox[0])/2,zone[1]+(bbox[3]-bbox[1])/2];
    }
    const visibility=step.result?.output.visibility_updates as Record<string,boolean>|undefined;
    if(visibility?.[item.id]===false || (subject(scene,step)?.id===item.id && step.simulation_effect?.hide_object))hidden=true;
  }
  return {xyz:point(scene,(bbox[0]+bbox[2])/2,(bbox[1]+bbox[3])/2),hidden};
}
export function destination(scene:SimulationScene,step:Step,steps:Step[]) {
  const item=subject(scene,step),proposal=steps.find(s=>step.depends_on.includes(s.id) && s.task_type==='placement_planning');
  const zone=scene.zones[step.destination||proposal?.destination||item?.destination||''];
  return zone?point(scene,...zone):null;
}
export function workcellChecks(scene:SimulationScene,plan:Plan|undefined,index:number,robot:RobotConfig) {
  const step=plan?.subtasks[index],item=subject(scene,step);
  if(!item)return {reach:null,payload:null,clearance:null,virtual:false};
  const [x,,z]=position(scene,item,plan?.subtasks,index).xyz;
  const reach=Math.hypot(x,z-.52,.20)*1000;
  const mass=step?.requirements?.mass_kg??item.mass_kg??.15;
  const clearance=scene.objects.filter(o=>o.id!==item.id).reduce((min,o)=>{
    const [ox,,oz]=position(scene,o,plan?.subtasks,index).xyz;
    const dx=Math.max(0,Math.abs(x-ox)-(item.size_mm[0]+o.size_mm[0])/2000);
    const dz=Math.max(0,Math.abs(z-oz)-(item.size_mm[1]+o.size_mm[1])/2000);
    return Math.min(min,Math.hypot(dx,dz)*1000);
  },Infinity);
  const virtual=!!step?.decision?.candidates.find(c=>c.model.id===step.decision?.selected_model_id)?.model.simulation_placeholder;
  return {reach:{value:Math.round(reach),ok:reach<=robot.reach_mm},payload:{value:mass,ok:mass<=robot.max_payload_kg},clearance:Number.isFinite(clearance)?Math.round(clearance):null,virtual};
}
