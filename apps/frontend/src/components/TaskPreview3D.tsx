import { useEffect,useState } from "react";
import { ChevronLeft,ChevronRight,Pause,Play,Radio } from "lucide-react";
import { DEFAULT_ROBOT,humanize,type Arm,type Plan,type RobotConfig,type SimulationScene } from "../lib/types";
import { workcellChecks } from "../lib/workcell";
import WorkbenchScene from "./WorkbenchScene";

export default function TaskPreview3D({scene,plan,selected=0,onSelect,robot=DEFAULT_ROBOT,arm,mode="preview",onFollow}:{scene:SimulationScene;plan?:Plan;selected?:number;onSelect?:(index:number)=>void;robot?:RobotConfig;arm?:Arm;mode?:"preview"|"live";onFollow?:()=>void}) {
  const [playing,setPlaying]=useState(false),steps=plan?.subtasks||[],step=steps[selected];
  const checks=workcellChecks(scene,plan,selected,robot);
  useEffect(()=>{setPlaying(false);},[plan?.id,mode]);
  useEffect(()=>{if(!playing||!onSelect||!steps.length)return;const timer=setTimeout(()=>{if(selected<steps.length-1)onSelect(selected+1);else setPlaying(false);},4600);return()=>clearTimeout(timer);},[playing,selected,steps.length,onSelect]);
  return <div className="task-preview-body">
    <WorkbenchScene scene={scene} plan={plan} selected={selected} robot={robot} arm={arm} mode={mode}/>
    {plan&&<>
      <div className="preview-playback">
        <button className="icon-button" aria-label="Previous preview step" disabled={selected===0} onClick={()=>onSelect?.(selected-1)}><ChevronLeft size={16}/></button>
        <button className="secondary" onClick={()=>{if(!playing&&selected===steps.length-1)onSelect?.(0);setPlaying(!playing);}} disabled={mode==='live'}>{playing?<Pause size={13}/>:<Play size={13}/>} {playing?'Pause rehearsal':'Play rehearsal'}</button>
        <select aria-label="Preview step" value={selected} onChange={e=>{setPlaying(false);onSelect?.(Number(e.target.value));}}>{steps.map((s,i)=><option key={s.id} value={i}>{i+1}. {s.title}</option>)}</select>
        <button className="icon-button" aria-label="Next preview step" disabled={selected===steps.length-1} onClick={()=>onSelect?.(selected+1)}><ChevronRight size={16}/></button>
        {onFollow&&<button className={'secondary '+(mode==='live'?'live-follow':'')} onClick={onFollow}><Radio size={13}/> {mode==='live'?'Following mission':'Follow live mission'}</button>}
      </div>
      {step&&<div className="preview-step"><span>{mode==='live'?'Live':'Rehearsal'} step {selected+1} / {steps.length} · {humanize(step.task_type)}</span><strong>{step.title}</strong><p>{step.description}</p><div className="preview-targets"><span>{step.object_name||'Robot'}</span>{step.destination&&<span>To {humanize(step.destination)}</span>}<span>{checks.virtual?'Virtual effect':'Fixture provider'}</span></div></div>}
      <div className="workcell-checks" aria-label="Workcell estimates">
        <div><span>Estimated reach</span><strong className={checks.reach&&!checks.reach.ok?'out-of-range':''}>{checks.reach?`${checks.reach.value} / ${robot.reach_mm} mm`:'No object target'}</strong></div>
        <div><span>Object / payload limit</span><strong className={checks.payload&&!checks.payload.ok?'out-of-range':''}>{checks.payload?`${checks.payload.value} / ${robot.max_payload_kg} kg`:'No handling load'}</strong></div>
        <div><span>Fixture clearance</span><strong>{checks.clearance!=null?`${checks.clearance} mm`:'Open workspace'}</strong></div>
        <div><span>Motion phase</span><strong>{mode==='live'&&arm?.plan_id===plan.id?humanize(arm.phase):'Rehearsal'}</strong></div>
      </div>
      <details className="preview-assumptions"><summary>Task interpretation and assumptions</summary><p>{plan.explanation}</p><ul>{plan.assumptions.map((a,i)=><li key={i}>{a}</li>)}</ul></details>
    </>}
    <p className="preview-footnote">The mission and Simulation studio share this workcell. Geometry, reach, clearance and arm kinematics are estimates; this is not calibrated physics or a hardware safety certificate. Rehearsal uses no extra AI calls. Virtual effects remain fictional.</p>
  </div>;
}
