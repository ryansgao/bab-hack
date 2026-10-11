import { useEffect,useRef,useState } from 'react';
import { ChevronLeft,ChevronRight,Pause,Play,Radio,RotateCcw } from 'lucide-react';
import { DEFAULT_ROBOT,humanize,type Arm,type Plan,type RobotConfig,type SimulationScene } from '../lib/types';
import { workcellChecks } from '../lib/workcell';
import { REHEARSAL_SECONDS } from '../lib/motion';
import WorkbenchScene from './WorkbenchScene';
import './simulation.css';

export default function TaskPreview3D({scene,plan,selected=0,onSelect,robot=DEFAULT_ROBOT,arm,mode='preview',onFollow,compact=false}:{scene:SimulationScene;plan?:Plan;selected?:number;onSelect?:(index:number)=>void;robot?:RobotConfig;arm?:Arm;mode?:'preview'|'live';onFollow?:()=>void;compact?:boolean}) {
  const [playing,setPlaying]=useState(false),[progress,setProgress]=useState(0),[speed,setSpeed]=useState(1);
  const playhead=useRef(0),selection=useRef(onSelect);selection.current=onSelect;
  const steps=plan?.subtasks||[],step=steps[selected],checks=workcellChecks(scene,plan,selected,robot);
  useEffect(()=>{setPlaying(false);playhead.current=0;setProgress(0);},[plan?.id,mode]);
  useEffect(()=>{playhead.current=0;setProgress(0);},[selected]);
  useEffect(()=>{
    if(!playing||mode==='live')return;
    let raf=0,last=0,published=0,settled=0;
    const frame=(now:number)=>{
      const dt=last?Math.min(.05,(now-last)/1000):0;last=now;
      playhead.current=Math.min(1,playhead.current+dt*speed/REHEARSAL_SECONDS);
      if(now-published>100){setProgress(playhead.current);published=now;}
      if(playhead.current>=1){settled+=dt;if(settled>.35){setProgress(1);if(selected<steps.length-1)selection.current?.(selected+1);else setPlaying(false);return;}}
      raf=requestAnimationFrame(frame);
    };
    raf=requestAnimationFrame(frame);return()=>cancelAnimationFrame(raf);
  },[playing,mode,selected,speed,steps.length]);
  const choose=(index:number)=>{setPlaying(false);playhead.current=0;setProgress(0);onSelect?.(index);};
  const liveProgress=arm?.plan_id===plan?.id&&arm?.step_id===step?.id?arm.progress:step?.status==='completed'?1:0;
  const shownProgress=mode==='live'?liveProgress:progress;
  return <div className="task-preview-body">
    <WorkbenchScene scene={scene} plan={plan} selected={selected} robot={robot} arm={arm} mode={mode} playhead={playhead} playing={playing}/>
    {plan&&<>
      <div className="simulation-transport">
        <div className="simulation-timeline"><span>{String(selected+1).padStart(2,'0')} / {String(steps.length).padStart(2,'0')}</span><input aria-label="Rehearsal progress" type="range" min={0} max={1000} value={Math.round(shownProgress*1000)} disabled={mode==='live'} onChange={e=>{setPlaying(false);playhead.current=Number(e.target.value)/1000;setProgress(playhead.current);}} style={{'--playhead':`${shownProgress*100}%`} as React.CSSProperties}/><span>{Math.round(shownProgress*100)}%</span></div>
        <div className="preview-playback">
          <button className="icon-button" aria-label="Previous preview step" disabled={selected===0} onClick={()=>choose(selected-1)}><ChevronLeft size={16}/></button>
          <button className="simulation-play" onClick={()=>{if(!playing&&progress>=1){playhead.current=0;setProgress(0);if(selected===steps.length-1)onSelect?.(0);}setPlaying(!playing);}} disabled={mode==='live'}>{playing?<Pause size={14}/>:<Play size={14}/>} {playing?'Pause':'Rehearse'}</button>
          <button className="icon-button" aria-label="Restart rehearsal step" disabled={mode==='live'} onClick={()=>{playhead.current=0;setProgress(0);}}><RotateCcw size={14}/></button>
          {!compact&&<select aria-label="Preview step" value={selected} onChange={e=>choose(Number(e.target.value))}>{steps.map((s,i)=><option key={s.id} value={i}>{i+1}. {s.title}</option>)}</select>}
          <button className="icon-button" aria-label="Next preview step" disabled={selected===steps.length-1} onClick={()=>choose(selected+1)}><ChevronRight size={16}/></button>
          {!compact&&<select className="rehearsal-speed" aria-label="Rehearsal speed" value={speed} disabled={mode==='live'} onChange={e=>setSpeed(Number(e.target.value))}><option value={.5}>0.5×</option><option value={1}>1×</option><option value={1.5}>1.5×</option></select>}
          {onFollow&&<button className={'simulation-follow '+(mode==='live'?'live-follow':'')} onClick={onFollow}><Radio size={13}/> {mode==='live'?'Live':'Follow live'}</button>}
        </div>
      </div>
      {!compact&&step&&<div className="preview-step"><span>{mode==='live'?'Live':'Rehearsal'} step {selected+1} / {steps.length} · {humanize(step.task_type)}</span><strong>{step.title}</strong><p>{step.description}</p><div className="preview-targets"><span>{step.object_name||'Robot'}</span>{step.destination&&<span>To {humanize(step.destination)}</span>}<span>{checks.virtual?'Virtual effect':'Fixture provider'}</span></div></div>}
      {!compact&&<><div className="workcell-checks" aria-label="Workcell estimates">
        <div><span>Estimated reach</span><strong className={checks.reach&&!checks.reach.ok?'out-of-range':''}>{checks.reach?`${checks.reach.value} / ${robot.reach_mm} mm`:'No object target'}</strong></div>
        <div><span>Object / payload limit</span><strong className={checks.payload&&!checks.payload.ok?'out-of-range':''}>{checks.payload?`${checks.payload.value} / ${robot.max_payload_kg} kg`:'No handling load'}</strong></div>
        <div><span>Fixture clearance</span><strong>{checks.clearance!=null?`${checks.clearance} mm`:'Open workspace'}</strong></div>
        <div><span>Motion phase</span><strong>{mode==='live'&&arm?.plan_id===plan.id?humanize(arm.phase):playing?'Rehearsing':'Paused'}</strong></div>
      </div>
      <details className="preview-assumptions"><summary>Task interpretation and assumptions</summary><p>{plan.explanation}</p><ul>{plan.assumptions.map((a,i)=><li key={i}>{a}</li>)}</ul></details></>}
    </>}
    {!compact&&<p className="preview-footnote">Generated geometry and motion illustrate the task. This preview uses estimated kinematics, not calibrated robot physics. Rehearsal uses no extra AI calls; virtual effects remain fictional.</p>}
  </div>;
}
