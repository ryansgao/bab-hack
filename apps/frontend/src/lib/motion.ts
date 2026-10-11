import type { Arm, Step } from './types';

export const clamp=(value:number,min=0,max=1)=>Math.max(min,Math.min(max,value));
// Zero velocity and acceleration at each end of a planned robot movement.
export const ease=(value:number)=>{const t=clamp(value);return t*t*t*(t*(t*6-15)+10);};
export const phase=(progress:number,start:number,end:number)=>ease((progress-start)/(end-start));
export const damping=(dt:number,rate=12)=>1-Math.exp(-rate*dt);
export const REHEARSAL_SECONDS=6.8;

/** Smooth between telemetry snapshots without rewinding on a late packet. */
export class MotionClock {
  progress=0;
  private key='';
  private packet='';
  private observed=0;
  private receivedAt=0;
  private previousAt=0;
  private observedDuration=4;
  private moving=false;
  tick(now:number,key:string,step:Step|undefined,arm:Arm|undefined,live:boolean,playing:boolean,replayProgress:number) {
    if(key!==this.key){this.key=key;this.progress=live?0:replayProgress;this.packet='';this.previousAt=now;this.moving=false;}
    const dt=clamp((now-this.previousAt)/1000,0,.1);this.previousAt=now;
    if(!live){this.progress=replayProgress;return this.progress;}
    const packet=`${arm?.step_id}:${arm?.progress}:${arm?.running}:${step?.status}`;
    if(packet!==this.packet){this.packet=packet;this.observed=arm?.progress||0;this.receivedAt=now;this.observedDuration=arm?.motion_duration_s||4;this.moving=!!arm?.running;}
    if(step?.status==='completed')this.progress=Math.min(1,this.progress+dt*3);
    else if(step?.result?.output.trajectory && arm?.step_id===step.id){
      if(this.moving){
        // A short interpolation buffer absorbs the 2 Hz server cadence. Limit
        // extrapolation after a missing packet; never invent mission completion.
        const target=clamp(this.observed+(clamp((now-this.receivedAt)/1000,0,.65)-.08)/this.observedDuration,0,.985);
        this.progress=Math.max(this.progress,this.progress+(target-this.progress)*damping(dt,10));
      }
    }else if(playing){
      const program=step?.decision?.candidates.find(c=>c.model.id===step.decision?.selected_model_id)?.model.simulation_program;
      const waitingForTrajectory=['control','object_placement'].includes(step?.task_type||'')||!!program?.motion_kind;
      if(!waitingForTrajectory)this.progress=Math.min(.985,this.progress+dt/1.6);
    }
    return this.progress;
  }
}
