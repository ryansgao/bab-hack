import base64
import io
import math
import time
from threading import RLock
from PIL import Image, ImageDraw
from shared.schemas.contracts import Observation, Point

class Arm:
    def __init__(self):
        self.lock=RLock()
        self.revision=0
        self.reset()
    def reset(self):
        with self.lock:
            self.revision+=1
            self.output=None
            self.phase='idle'
            self.progress=0
            self.running=False
            self.object_name=''
            self.grasp_point=[390,220]
            self.reason='Awaiting purchased shard outputs'
            self.plan_id=None; self.step_id=None; self.object_id=None; self.capability='idle'
            self.held_object_id=None; self.paused=False; self.motion_duration_s=4
            self.last_tick=time.monotonic()
    def bind(self,plan_id,step_id,capability,obj=None):
        with self.lock:
            self.plan_id=plan_id; self.step_id=step_id; self.capability=capability
            self.object_name=obj['name'] if obj else ''; self.object_id=obj['id'] if obj else None
            self.phase=capability; self.progress=0
    def observation(self):
        return Observation(position=Point(x=4,y=12),nearest_obstacle_distance=8,nearby_agent_count=0,sensor_uncertainty=.4,revision=self.revision)
    def sensor_image(self):
        image=Image.new('RGB',(640,480),'#dbd6c9')
        draw=ImageDraw.Draw(image)
        draw.rounded_rectangle((100,60,580,410),radius=35,fill='#ba9066')
        draw.rectangle((320,170,410,260),fill='#97ada0',outline='#61786c',width=3)
        draw.rounded_rectangle((450,230,500,290),radius=8,fill='#e8eae4',outline='#819280',width=3)
        out=io.BytesIO();image.save(out,format='PNG')
        return base64.b64encode(out.getvalue()).decode()
    def apply(self,result,needs):
        with self.lock:
            if result.observation_revision!=self.revision: raise ValueError('Arm scene changed while inference was running')
            if needs: self.object_name=needs.object_name
            if result.output.get('grasp_point_px'): self.grasp_point=result.output['grasp_point_px']
            if result.output.get('trajectory'):
                if needs and result.output['force_n']>needs.max_force_n: raise ValueError('Local force interlock rejected control output')
                self.output=result.output
                self.progress=0
                self.running=True
                self.paused=False
                self.motion_duration_s=max(2,min(10,self.output.get('motion_duration_s',4)))
                self.phase='approach'
                self.reason=('Executing simulated control output with local force limit' if result.source=='simulation'
                    else 'Executing paid control output with local force limit')
    def tick(self):
        with self.lock:
            current=time.monotonic(); delta=min(.6,current-self.last_tick); self.last_tick=current
            if self.running and self.output:
                self.progress=min(1,self.progress+delta/self.motion_duration_s)
                phases=self.output['trajectory']
                index=min(len(phases)-1,int(self.progress*len(phases)))
                self.phase=phases[index]['phase']
                if self.phase in ('grasp','lift','hold','transport','lower'): self.held_object_id=self.object_id
                if self.phase=='release': self.held_object_id=None
                if self.progress>=1:
                    self.held_object_id=self.object_id if self.output.get('holding_on_complete') else None
                    self.phase='complete'; self.running=False; self.reason='Simulated handling trajectory complete'
            return self.snapshot()
    def snapshot(self):
        return dict(phase=self.phase,progress=self.progress,running=self.running,object_name=self.object_name,
            grasp_point_px=self.grasp_point,output=self.output,reason=self.reason,revision=self.revision,
            plan_id=self.plan_id,step_id=self.step_id,capability=self.capability,object_id=self.object_id,
            held_object_id=self.held_object_id,paused=self.paused,motion_duration_s=self.motion_duration_s)
arm=Arm()
