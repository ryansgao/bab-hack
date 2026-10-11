import { useEffect,useRef,useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { DEFAULT_ROBOT,type Arm,type Plan,type RobotConfig,type SimulationScene } from '../lib/types';
import { TABLE_Y,point,position,subject,destination } from '../lib/workcell';
// @ts-expect-error Offline renderer shared by mission preview and Robot Station.
import * as THREE from '../vendor/three.module.min.js';

type Props={scene:SimulationScene;plan?:Plan;selected?:number;robot?:RobotConfig;arm?:Arm;mode?:'preview'|'live';compact?:boolean};
const smooth=(value:number)=>{const t=Math.max(0,Math.min(1,value));return t*t*(3-2*t);};

export default function WorkbenchScene({scene:fixture,plan,selected=0,robot=DEFAULT_ROBOT,arm,mode='preview',compact=false}:Props) {
  const host=useRef<HTMLDivElement>(null),live=useRef({plan,selected,arm,mode});
  live.current={plan,selected,arm,mode};
  const view=useRef({yaw:.68,pitch:.42,radius:2.4}),reset=useRef(()=>{});
  const [unavailable,setUnavailable]=useState(false);
  const [cameraMode,setCameraMode]=useState('orbit');
  useEffect(()=>{
    const mount=host.current;if(!mount)return;
    let renderer:any;
    try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});}catch{setUnavailable(true);return;}
    setUnavailable(false);renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.7));
    renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;mount.appendChild(renderer.domElement);
    const scene=new THREE.Scene();scene.background=new THREE.Color('#dbe3e3');scene.fog=new THREE.Fog('#dbe3e3',4,9);
    const camera=new THREE.PerspectiveCamera(38,1,.01,20),aim=new THREE.Vector3(0,.96,0);
    const textures:any[]=[];
    const mat=(color:string|number,options={})=>new THREE.MeshStandardMaterial({color,roughness:.46,metalness:.1,...options});
    const steel=mat('#778c90',{metalness:.8,roughness:.29}),black=mat('#263436',{metalness:.4}),white=mat('#e5e9e5',{metalness:.35,roughness:.28}),robotShell=mat(plan?.robot_visual?.body_color||'#e5e9e5',{metalness:.35,roughness:.28}),accent=mat(plan?.robot_visual?.accent_color||'#d89252',{metalness:.5});
    const green=mat('#4b9168',{emissive:'#234735',emissiveIntensity:.35});
    const mesh=(geometry:any,material:any,parent:any=scene)=>{const object=new THREE.Mesh(geometry,material);object.castShadow=true;object.receiveShadow=true;parent.add(object);return object;};
    const box=(w:number,h:number,d:number,m:any,x:number,y:number,z:number,parent:any=scene)=>{const o=mesh(new THREE.BoxGeometry(w,h,d),m,parent);o.position.set(x,y,z);return o;};
    const cyl=(r:number,h:number,m:any,x:number,y:number,z:number,parent:any=scene)=>{const o=mesh(new THREE.CylinderGeometry(r,r,h,32),m,parent);o.position.set(x,y,z);return o;};
    const ring=(r:number,t:number,m:any,x:number,y:number,z:number,parent:any=scene)=>{const o=mesh(new THREE.TorusGeometry(r,t,12,48),m,parent);o.rotation.x=Math.PI/2;o.position.set(x,y,z);return o;};
    const label=(text:string,parent:any,y:number)=>{
      const canvas=document.createElement('canvas');canvas.width=512;canvas.height=96;const ctx=canvas.getContext('2d')!;
      ctx.fillStyle='rgba(245,249,246,.9)';ctx.beginPath();ctx.roundRect(3,12,506,70,20);ctx.fill();ctx.fillStyle='#284039';ctx.font='500 32px Inter, sans-serif';ctx.textAlign='center';ctx.fillText(text,256,58);
      const texture=new THREE.CanvasTexture(canvas);textures.push(texture);const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:false}));sprite.scale.set(.25,.047,1);sprite.position.y=y;parent.add(sprite);return sprite;
    };
    const pattern=(fabric=false)=>{
      const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const ctx=canvas.getContext('2d')!;ctx.fillStyle=fabric?'#e9e6df':'#b9c4c4';ctx.fillRect(0,0,128,128);
      ctx.strokeStyle=fabric?'#ddd9d2':'#a9b8b7';ctx.lineWidth=fabric ? .6 : 1;
      for(let i=0;i<128;i+=fabric?3:16){ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i,128);ctx.moveTo(0,i);ctx.lineTo(128,i);ctx.stroke();}
      const texture=new THREE.CanvasTexture(canvas);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(fabric?3:8,fabric?3:5);textures.push(texture);return texture;
    };
    scene.add(new THREE.HemisphereLight('#fcfffb','#778993',2.1));
    const key=new THREE.DirectionalLight('#fff4df',3.2);key.position.set(-1.5,3,2);key.castShadow=true;key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=-1.8;key.shadow.camera.right=1.8;key.shadow.camera.top=1.8;key.shadow.camera.bottom=-1.8;key.shadow.bias=-.0002;scene.add(key);
    const rim=new THREE.DirectionalLight('#c4e5f2',1.7);rim.position.set(2,2,-1);scene.add(rim);
    const floor=mesh(new THREE.PlaneGeometry(20,20),mat('#bdc9c9',{roughness:.87}));floor.rotation.x=-Math.PI/2;floor.castShadow=false;
    const grid=new THREE.GridHelper(12,60,'#a2b4b6','#b1c0c1');grid.position.y=.002;scene.add(grid);
    // Workbench, steel frame, guard glazing and an overhead RGB camera.
    box(1.42,.065,1.06,black,0,TABLE_Y-.04,.05);
    box(1.38,.014,1.02,mat('#c9d2ce',{metalness:.55,roughness:.35,map:pattern()}),0,TABLE_Y-.003,.05);
    for(const x of [-.60,.60])for(const z of [-.36,.47]){box(.045,.68,.045,steel,x,.35,z);cyl(.04,.025,black,x,.02,z);}
    box(1.25,.04,.045,steel,0,.23,.47);box(1.25,.04,.045,steel,0,.23,-.36);
    for(const x of [-.62,.62]){box(.025,.78,.025,steel,x,1.1,.53);box(.014,.39,.67,mat('#afd6d8',{transparent:true,opacity:.10,roughness:.07,metalness:0,depthWrite:false}),x,1.0,.15);}
    box(1.27,.035,.045,steel,0,1.49,.53);box(.12,.065,.08,black,0,1.43,.46);cyl(.023,.02,green,0,1.38,.46);
    box(.30,.015,.012,white,0,1.5,.53);box(.20,.07,.02,black,.50,.65,.58);for(let i=0;i<3;i++)cyl(.007,.005,i===0?green:accent,.45+i*.033,.68,.595);
    for(const [name,xy] of Object.entries(fixture.zones)){
      if(!plan?.subtasks.some(s=>s.destination===name))continue;
      const [x,,z]=point(fixture,...xy);const target=new THREE.Group();scene.add(target);target.position.set(x,TABLE_Y+.003,z);
      const zone=box(.14,.002,.13,mat('#639575',{transparent:true,opacity:.12}),0,0,0,target);zone.castShadow=false;ring(.09,.0015,green,0,.002,0,target);
    }
    const objects=new Map<string,any>(),focusRings=new Map<string,any>(),liquids=new Map<string,any>();
    for(const item of fixture.objects){
      const group=new THREE.Group();scene.add(group);objects.set(item.id,group);
      const [w,d,h]=item.size_mm.map(v=>Math.max(.004,Math.min(.65,v/1000)));const color=mat(item.color);const name=item.name.toLowerCase();
      if(/matcha bowl|latte glass/.test(name)){
        const r=Math.min(w,d)*.47,isGlass=/glass/.test(name);
        const vessel=mat(isGlass?'#cee8e5':item.color,{transparent:isGlass,opacity:isGlass?.28:1,roughness:isGlass?.08:.35,metalness:0,side:THREE.DoubleSide,depthWrite:!isGlass});
        const body=mesh(new THREE.CylinderGeometry(r,r*.85,h,48,1,true),vessel,group);body.position.y=h/2;
        cyl(r*.83,.005,vessel,0,.004,0,group);ring(r,.0025,isGlass?vessel:white,0,h,0,group);
        const liquid=cyl(r*.81,1,mat('#72a45b',{roughness:.27,metalness:0}),0,.01,0,group);liquid.visible=false;liquids.set(item.id,liquid);
      }else if(/bamboo whisk/.test(name)){
        cyl(.010,h*.60,color,0,h*.70,0,group);ring(.022,.0018,color,0,h*.18,0,group);
        for(let i=0;i<18;i++){const angle=i*Math.PI/9;const tine=mesh(new THREE.CylinderGeometry(.0009,.0015,h*.48,8),color,group);tine.position.set(Math.cos(angle)*.019,h*.26,Math.sin(angle)*.019);tine.rotation.z=Math.cos(angle)*.20;tine.rotation.x=Math.sin(angle)*.20;}
      }else if(/basket|tray|bowl|container/.test(name)){
        box(w,.008,d,color,0,.004,0,group);for(const x of [-w/2,w/2])box(.008,h,d,color,x,h/2,0,group);for(const z of [-d/2,d/2])box(w,h,.008,color,0,h/2,z,group);
        if(/basket/.test(name))for(let y=.03;y<h;y+=.022){for(const x of [-w/2-.004,w/2+.004])box(.002,.003,d*.88,black,x,y,0,group);}
      }else if(/shirt|towel|sock|clothes|glove/.test(name)){
        const fabric=mat(item.color,{roughness:.95,metalness:0,map:pattern(true)});box(w*.68,Math.max(h,.004),d,fabric,0,Math.max(h,.004)/2,0,group);
        if(/shirt/.test(name)){const left=box(w*.25,.004,d*.34,fabric,-w*.40,.005,-d*.27,group);left.rotation.y=.25;const right=box(w*.25,.004,d*.34,fabric,w*.40,.005,-d*.27,group);right.rotation.y=-.25;ring(w*.075,.003,white,0,.009,-d*.43,group);}
        for(let z=-d*.3;z<d*.4;z+=d*.16)box(w*.56,.001,.001,mat('#dfd9d1'),0,h+.001,z,group);
      }else if(/phone|tablet|laptop/.test(name)){
        const housing=box(w,h,d,mat(item.color,{metalness:.8,roughness:.25}),0,h/2,0,group);housing.rotation.y=.05;
        box(w*.90,.001,d*.88,mat('#122132',{metalness:.15,roughness:.12}),0,h+.001,0,group);box(w*.75,.0005,d*.62,mat('#4d6879',{roughness:.18}),0,h+.002,-d*.07,group);cyl(.003,.002,black,0,h+.002,-d*.43,group);
      }else if(/mug|cup/.test(name)){
        const r=Math.min(w,d)*.43;const body=mesh(new THREE.CylinderGeometry(r,r*.89,h,40,1,true),color,group);body.position.y=h/2;body.material.side=THREE.DoubleSide;
        cyl(r*.83,.004,mat('#756951'),0,h*.10,0,group);ring(r,.003,white,0,h,0,group);const handle=ring(h*.24,.006,color,r+.012,h*.55,0,group);handle.rotation.set(0,Math.PI/2,0);
      }else if(/cheese/.test(name)){
        const shape=new THREE.Shape();shape.moveTo(-w/2,-d/2);shape.lineTo(w/2,-d/2);shape.lineTo(-w/2,d/2);shape.closePath();const wedge=mesh(new THREE.ExtrudeGeometry(shape,{depth:h,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.002,bevelThickness:.001}),mat('#e9b954',{roughness:.75}),group);wedge.rotation.x=-Math.PI/2;
        for(let i=0;i<4;i++){const hole=cyl(.003+i*.0005,.001,mat('#b2802f'),-w*.30+i*w*.13,h+.002,-d*.28,group);hole.castShadow=false;}
      }else if(item.category==='produce' || item.shape==='sphere'){
        const fruit=mesh(new THREE.SphereGeometry(Math.min(w,d)*.48,32,24),mat(item.color,{roughness:.73,metalness:0}),group);fruit.scale.y=h/Math.min(w,d);fruit.position.y=h/2;cyl(.002,.01,black,0,h+.004,0,group);
      }else if(/wrench|screwdriver|hammer|pliers/.test(name)){
        box(w*.8,Math.min(h,.02),d*.3,steel,0,h/2,0,group);if(/wrench/.test(name))ring(d*.28,.007,steel,-w*.38,h/2,0,group);else box(w*.35,h,d*.7,color,-w*.3,h/2,0,group);
      }else if(item.shape==='cylinder'||/bottle|jar|can/.test(name)){
        cyl(Math.min(w,d)*.44,h,color,0,h/2,0,group);cyl(Math.min(w,d)*.28,.008,white,0,h+.004,0,group);
      }else{
        box(w,h,d,color,0,h/2,0,group);if(item.category==='logistics'||/package|box/.test(name)){box(.016,.001,d,mat('#d5c3a2'),0,h+.001,0,group);box(w*.40,.001,d*.30,white,w*.18,h+.002,0,group);}
      }
      const focus=ring(Math.max(w,d)*.67,.0025,green,0,.002,0,group);focus.visible=false;focusRings.set(item.id,focus);
      if(!compact)label(item.name,group,h+.055);
    }
    // A two-link analytic IK solve positions a detailed six-axis arm silhouette.
    const rigStart=scene.children.length;
    const base=new THREE.Vector3(0,TABLE_Y,.52),shoulder=base.clone().add(new THREE.Vector3(0,.21,0));
    if(plan?.robot_visual?.form==='mobile'){
      box(.34,.18,.28,robotShell,0,.25,.52);for(const x of [-.19,.19])for(const z of [.41,.63]){const wheel=cyl(.07,.035,black,x,.16,z);wheel.rotation.z=Math.PI/2;}box(.05,.51,.05,steel,0,.56,.52);
    }else if(plan?.robot_visual?.form==='humanoid'){
      box(.24,.38,.14,robotShell,0,.65,.52);const head=mesh(new THREE.SphereGeometry(.085,24,16),robotShell);head.position.set(0,.94,.52);box(.13,.035,.01,black,0,.95,.437);
      for(const x of [-.07,.07]){box(.05,.34,.05,steel,x,.26,.52);box(.07,.035,.14,black,x,.075,.48);}box(.025,.22,.025,accent,-.15,.64,.52);
    }
    cyl(.085,.045,black,base.x,base.y+.024,base.z);cyl(.065,.11,robotShell,base.x,base.y+.10,base.z);ring(.068,.004,accent,base.x,base.y+.07,base.z);
    const upper=mesh(new THREE.CylinderGeometry(.038,.049,1,24),robotShell),lower=mesh(new THREE.CylinderGeometry(.030,.039,1,24),steel);
    const elbow=mesh(new THREE.SphereGeometry(.055,24,16),black),elbowCap=mesh(new THREE.SphereGeometry(.038,24,16),accent);
    const wrist=mesh(new THREE.SphereGeometry(.032,24,16),black),shoulderShell=mesh(new THREE.SphereGeometry(.057,24,16),steel);shoulderShell.position.copy(shoulder);
    const claw=new THREE.Group();scene.add(claw);cyl(.026,.06,robotShell,0,.072,0,claw);box(.075,.018,.038,black,0,.035,0,claw);
    const left=box(.010,.053,.020,steel,-.03,.005,0,claw),right=box(.010,.053,.020,steel,.03,.005,0,claw);
    if(robot.gripper==='suction'){left.visible=right.visible=false;cyl(.014,.02,black,0,-.007,0,claw);}if(robot.gripper==='none')left.visible=right.visible=false;
    const robotRoot=new THREE.Group();scene.children.slice(rigStart).forEach((object:any)=>robotRoot.add(object));scene.add(robotRoot);
    if(plan?.robot_visual?.form==='mobile'&&robot.gripper==='none'){upper.visible=lower.visible=elbow.visible=elbowCap.visible=wrist.visible=shoulderShell.visible=claw.visible=false;}
    const route=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineDashedMaterial({color:'#dc9c57',dashSize:.015,gapSize:.009}));scene.add(route);
    const sweep=mesh(new THREE.ConeGeometry(.12,.50,32,1,true),new THREE.MeshBasicMaterial({color:'#72bd98',transparent:true,opacity:.085,depthWrite:false}));sweep.rotation.x=Math.PI;sweep.castShadow=false;
    const idle=new THREE.Vector3(.15,TABLE_Y+.26,.16),end=new THREE.Vector3();
    const stream=cyl(.003,1,mat('#88b774',{transparent:true,opacity:.72,roughness:.2}),0,0,0);stream.visible=false;stream.castShadow=false;
    const link=(object:any,a:any,b:any)=>{const delta=b.clone().sub(a);object.position.copy(a).add(b).multiplyScalar(.5);object.scale.y=delta.length();object.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());};
    const solve=(target:any)=>{
      const delta=target.clone().add(new THREE.Vector3(0,.09,0)).sub(shoulder),reach=robot.reach_mm/1000;
      const l1=reach*.54,l2=reach*.46;const distance=Math.max(.02,Math.min(reach-.001,delta.length()));const unit=delta.normalize();const achieved=shoulder.clone().addScaledVector(unit,distance);
      const a=(l1*l1-l2*l2+distance*distance)/(2*distance),height=Math.sqrt(Math.max(0,l1*l1-a*a));const up=new THREE.Vector3(0,1,0).addScaledVector(unit,-unit.y).normalize();
      const joint=shoulder.clone().addScaledVector(unit,a).addScaledVector(up,height);link(upper,shoulder,joint);link(lower,joint,achieved);elbow.position.copy(joint);elbowCap.position.copy(joint).add(new THREE.Vector3(.018,0,.025));wrist.position.copy(achieved);claw.position.copy(achieved).add(new THREE.Vector3(0,-.09,0));
    };
    let pointer:{x:number;y:number}|null=null;
    const down=(e:PointerEvent)=>{pointer={x:e.clientX,y:e.clientY};mount.setPointerCapture(e.pointerId);};
    const move=(e:PointerEvent)=>{if(!pointer)return;view.current.yaw-=(e.clientX-pointer.x)*.006;view.current.pitch=Math.max(.15,Math.min(1.45,view.current.pitch+(e.clientY-pointer.y)*.005));pointer={x:e.clientX,y:e.clientY};};
    const up=()=>{pointer=null;};const wheel=(e:WheelEvent)=>{e.preventDefault();view.current.radius=Math.max(1.25,Math.min(4,view.current.radius+e.deltaY*.002));};
    mount.addEventListener('pointerdown',down);mount.addEventListener('pointermove',move);mount.addEventListener('pointerup',up);mount.addEventListener('pointercancel',up);mount.addEventListener('wheel',wheel,{passive:false});
    const resize=()=>{const w=Math.max(1,mount.clientWidth),h=Math.max(1,mount.clientHeight);camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false);};
    const observer=new ResizeObserver(resize);observer.observe(mount);resize();reset.current=()=>{view.current={yaw:.68,pitch:.42,radius:2.4};};
    let raf=0,last=0,keyStep='',started=0,snapshotKey='',snapshotAt=0,snapshotProgress=0;
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
    const render=(time:number)=>{
      raf=requestAnimationFrame(render);if(document.hidden||time-last<1000/40)return;last=time;
      const state=live.current,current=state.plan?.subtasks[state.selected],key=`${state.plan?.id}:${state.selected}:${state.mode}`;
      if(key!==keyStep){keyStep=key;started=time;route.geometry.dispose();route.geometry=new THREE.BufferGeometry();}
      const relevant=state.arm?.plan_id===state.plan?.id && state.arm?.step_id===current?.id;
      const observedKey=`${state.arm?.step_id}:${state.arm?.progress}:${state.arm?.running}`;
      if(observedKey!==snapshotKey){snapshotKey=observedKey;snapshotAt=time;snapshotProgress=state.arm?.progress||0;}
      let progress=state.mode==='live' ? current?.status==='completed'?1:relevant && state.arm?.output && (current?.result?.output.trajectory || ['control','object_placement'].includes(current?.task_type||''))?Math.min(1,snapshotProgress+(state.arm.running?(time-snapshotAt)/1000/(state.arm.motion_duration_s||4):0)):Math.min(1,(time-started)/1300):Math.min(1,(time-started)/4200);
      if(reduced.matches)progress=1;
      const selectedObject=subject(fixture,current),target=selectedObject?position(fixture,selectedObject,state.plan?.subtasks,state.selected).xyz:null;
      let grip=.04;end.copy(idle);sweep.visible=false;route.visible=false;stream.visible=false;
      robotRoot.position.set(0,0,0);
      if(current&&/nav|locomotion|move_robot/.test(current.task_type)){const targetZone=destination(fixture,current,state.plan?.subtasks||[]);if(targetZone)robotRoot.position.set(targetZone[0]*smooth(progress),0,(targetZone[2]-.52)*smooth(progress));}
      for(const item of fixture.objects){const group=objects.get(item.id),pose=position(fixture,item,state.plan?.subtasks,state.selected);group.position.set(...pose.xyz);group.rotation.set(0,0,0);group.visible=!pose.hidden;group.scale.set(1,1,1);focusRings.get(item.id).visible=item.id===selectedObject?.id;
        const liquid=liquids.get(item.id);if(liquid){const traits={...item.traits};for(const previous of state.plan?.subtasks.slice(0,state.selected)||[]){const updates=previous.result?.output.trait_updates as Record<string,Record<string,string>>|undefined;if(updates?.[item.id])Object.assign(traits,updates[item.id]);}
          const updates=current?.result?.output.trait_updates as Record<string,Record<string,string>>|undefined;
          const interpolated=(key:string)=>Number(traits[key]||0)+(Number(updates?.[item.id]?.[key]??traits[key]??0)-Number(traits[key]||0))*smooth(Math.max(0,(progress-.35)/.35));
          const water=interpolated('water_ml'),milk=interpolated('milk_ml'),matcha=interpolated('matcha_ml');const ml=water+milk+matcha;
          const level=Math.min(item.size_mm[2]/1000*.8,ml/250*(item.size_mm[2]/1000*.85));liquid.visible=ml>0;liquid.scale.y=Math.max(.001,level);liquid.position.y=level/2+.006;liquid.material.color.set(milk>0?(matcha>0?'#8aac6b':'#f3e9cc'):'#6d974e');
        }
      }
      if(current&&target&&selectedObject){
        const object=objects.get(selectedObject.id),height=Math.max(.004,selectedObject.size_mm[2]/1000),center=new THREE.Vector3(...target).add(new THREE.Vector3(0,height/2,0));
        const virtual=!!current.decision?.candidates.find(c=>c.model.id===current.decision?.selected_model_id)?.model.simulation_placeholder;
        const program=current.decision?.candidates.find(c=>c.model.id===current.decision?.selected_model_id)?.model.simulation_program;
        const motion=String(current.result?.output.motion_kind||program?.motion_kind||'');
        const toolItem=fixture.objects.find(o=>o.id===current.result?.output.tool_object_id || o.name===program?.tool_name);
        if(toolItem&&['pour','whisk','scoop'].includes(motion)&&!virtual){
          const tool=objects.get(toolItem.id),origin=new THREE.Vector3(...position(fixture,toolItem,state.plan?.subtasks,state.selected).xyz),toolH=toolItem.size_mm[2]/1000;
          const above=center.clone().add(new THREE.Vector3(0,height/2+.12,0)),lift=origin.clone().add(new THREE.Vector3(0,.25,0));
          if(progress<.15)end.copy(idle).lerp(origin.clone().add(new THREE.Vector3(0,toolH,0)),smooth(progress/.15));
          else if(progress<.35)end.copy(lift).lerp(above,smooth((progress-.15)/.20));
          else if(progress<.75){end.copy(above);if(motion==='whisk'){end.y=center.y+height*.55;end.x+=Math.sin(progress*Math.PI*24)*.016;end.z+=Math.cos(progress*Math.PI*24)*.016;tool.rotation.y=progress*Math.PI*24;}else{tool.rotation.z=-.85;stream.visible=true;const bottom=center.clone().add(new THREE.Vector3(0,height*.2,0));link(stream,end,bottom);stream.material.color.set(current.task_type==='matcha_milk_pouring'?'#f3e9cc':current.task_type==='matcha_water_pouring'?'#a9dce5':'#6d974e');}}
          else end.copy(above).lerp(origin.clone().add(new THREE.Vector3(0,toolH,0)),smooth((progress-.75)/.25));
          grip=.014;if(progress>.15&&progress<.99)tool.position.copy(end).add(new THREE.Vector3(0,-toolH*.6,0));
          if(progress>=.99){tool.position.copy(origin);tool.rotation.set(0,0,0);end.copy(idle);}
        }else if(current.task_type==='control'&&!virtual){
          if(progress<.34)end.copy(idle).lerp(center.clone().add(new THREE.Vector3(0,.12,0)),smooth(progress/.34));
          else if(progress<.53){end.copy(center).add(new THREE.Vector3(0,.12*(1-smooth((progress-.34)/.19)),0));grip=.04*(1-smooth((progress-.34)/.19))+.014;}
          else{end.copy(center).add(new THREE.Vector3(0,.18*smooth((progress-.53)/.27),0));grip=Math.min(.06,selectedObject.size_mm[0]/2000);object.position.y=end.y-height/2;}
        }else if(['placement_planning','object_placement'].includes(current.task_type)&&!virtual){
          const dest=destination(fixture,current,state.plan?.subtasks||[]);
          if(dest){const finish=new THREE.Vector3(...dest).add(new THREE.Vector3(0,height/2,0));const curve=new THREE.QuadraticBezierCurve3(center.clone().add(new THREE.Vector3(0,.18,0)),center.clone().lerp(finish,.5).add(new THREE.Vector3(0,.32,0)),finish.clone().add(new THREE.Vector3(0,.18,0)));
            if(route.geometry.getAttribute('position')?.count!==33){route.geometry.dispose();route.geometry=new THREE.BufferGeometry().setFromPoints(curve.getPoints(32));route.computeLineDistances();}route.visible=true;
            if(current.task_type==='object_placement'){end.copy(curve.getPoint(smooth(Math.min(1,progress/.60))));if(progress>.60)end.copy(finish).add(new THREE.Vector3(0,.18*(1-smooth((progress-.60)/.20)),0));grip=progress<.83?Math.min(.06,selectedObject.size_mm[0]/2000):.045;object.position.copy(end).add(new THREE.Vector3(0,-height/2,0));if(progress>.83){object.position.set(...dest);end.copy(finish).add(new THREE.Vector3(0,.14*smooth((progress-.83)/.17),0));}}
          }
        }else if(virtual){
          // Fictional transformations have a separate visual treatment; no grasp is invented.
          end.copy(idle);const folded=/fold/.test(current.task_type);if(folded)object.scale.set(1-.45*smooth(progress),1+.9*smooth(progress),1-.45*smooth(progress));
          if(current.destination){const dest=destination(fixture,current,state.plan?.subtasks||[]);if(dest)object.position.set(target[0]+(dest[0]-target[0])*smooth(progress),target[1]+Math.sin(progress*Math.PI)*.08,target[2]+(dest[2]-target[2])*smooth(progress));}
          if(current.simulation_effect?.hide_object)object.scale.setScalar(Math.max(.001,1-smooth(progress)));
          if(/wash|clean/.test(current.task_type)){object.rotation.y=Math.sin(time*.008)*.04;focusRings.get(selectedObject.id).material.color.set('#61a9c7');}
        }else{sweep.visible=true;sweep.position.copy(center).add(new THREE.Vector3(0,.25,0));}
      }
      // Preserve objects held by a completed pickup while subsequent inference runs.
      if(current?.task_type!=='object_placement' && current?.task_type!=='control' && state.plan){
        const held=[...state.plan.subtasks.slice(0,state.selected)].reverse().find(s=>s.task_type==='control'||s.task_type==='object_placement');
        if(held?.task_type==='control'&&!held.decision?.candidates.find(c=>c.model.id===held.decision?.selected_model_id)?.model.simulation_placeholder){const item=subject(fixture,held);if(item){const pose=position(fixture,item,state.plan.subtasks,state.selected);const group=objects.get(item.id);group.position.y=TABLE_Y+.18;end.set(pose.xyz[0],group.position.y+item.size_mm[2]/2000,pose.xyz[2]);grip=Math.min(.06,item.size_mm[0]/2000);}}
      }
      left.position.x=-grip;right.position.x=grip;solve(end);
      const v=view.current;camera.position.set(Math.sin(v.yaw)*Math.cos(v.pitch)*v.radius,aim.y+Math.sin(v.pitch)*v.radius,Math.cos(v.yaw)*Math.cos(v.pitch)*v.radius);camera.lookAt(aim);renderer.render(scene,camera);
    };
    raf=requestAnimationFrame(render);
    return()=>{cancelAnimationFrame(raf);observer.disconnect();mount.removeEventListener('pointerdown',down);mount.removeEventListener('pointermove',move);mount.removeEventListener('pointerup',up);mount.removeEventListener('pointercancel',up);mount.removeEventListener('wheel',wheel);scene.traverse((o:any)=>{o.geometry?.dispose();if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach((m:any)=>m.dispose());});textures.forEach(t=>t.dispose());renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();};
  },[fixture.id,robot.reach_mm,robot.gripper,compact]);
  return <div className={'workcell-view '+(compact?'compact':'')}>
    <div className="workcell-camera-tools"><span>{mode==='live'?'LIVE SIMULATOR':'MISSION REHEARSAL'}</span><select aria-label="Workcell camera" value={cameraMode} onChange={e=>{setCameraMode(e.target.value);view.current=e.target.value==='overhead'?{yaw:0,pitch:1.45,radius:2.3}:e.target.value==='front'?{yaw:0,pitch:.25,radius:2.4}:{yaw:.68,pitch:.42,radius:2.4};}}><option value="orbit">Perspective</option><option value="front">Front</option><option value="overhead">Overhead</option></select><button className="icon-button" aria-label="Reset workcell camera" onClick={()=>{reset.current();setCameraMode('orbit');}}><RotateCcw size={13}/></button></div>
    <div ref={host} className="workcell-canvas" role="img" aria-label={`3D robot workcell with ${fixture.objects.map(o=>o.name).join(', ')}. ${mode==='live'?'Following execution':'Rehearsing'} ${plan?.subtasks[selected]?.title||'the configured robot'}.`}/>
    {unavailable&&<p className="preview-fallback">This browser could not create a 3D view. Mission state and outputs remain available.</p>}
    <div className="workcell-camera-hint">Drag to orbit · Scroll to zoom · Geometry in metres</div>
  </div>;
}
