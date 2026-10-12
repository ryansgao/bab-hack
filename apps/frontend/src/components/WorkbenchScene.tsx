import { useEffect,useRef,useState } from 'react';
import { Focus,RotateCcw,Tags } from 'lucide-react';
import { DEFAULT_ROBOT,type Arm,type Plan,type RobotConfig,type SimulationScene } from '../lib/types';
import { TABLE_Y,point,position,subject,destination } from '../lib/workcell';
import { MotionClock,ease as smooth,phase,damping } from '../lib/motion';
// @ts-expect-error Offline renderer shared by mission preview and Robot Station.
import * as THREE from '../vendor/three.module.min.js';

type Props={scene:SimulationScene;plan?:Plan;selected?:number;robot?:RobotConfig;arm?:Arm;mode?:'preview'|'live';compact?:boolean;playhead?:{current:number};playing?:boolean};

export default function WorkbenchScene({scene:fixture,plan,selected=0,robot=DEFAULT_ROBOT,arm,mode='preview',compact=false,playhead,playing=false}:Props) {
  const [showLabels,setShowLabels]=useState(false),[focusAction,setFocusAction]=useState(false);
  const host=useRef<HTMLDivElement>(null),live=useRef({plan,selected,arm,mode,playhead,playing,showLabels,focusAction});
  live.current={plan,selected,arm,mode,playhead,playing,showLabels,focusAction};
  const view=useRef({yaw:2.55,pitch:.43,radius:2.65}),reset=useRef(()=>{});
  const [unavailable,setUnavailable]=useState(false);
  const [cameraMode,setCameraMode]=useState('orbit');
  useEffect(()=>{
    const mount=host.current;if(!mount)return;
    let renderer:any;
    try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});}catch{setUnavailable(true);return;}
    setUnavailable(false);renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.7));
    renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.02;
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;mount.appendChild(renderer.domElement);
    const scene=new THREE.Scene();scene.background=new THREE.Color('#edf0e9');scene.fog=new THREE.Fog('#edf0e9',4,9);
    const camera=new THREE.PerspectiveCamera(36,1,.01,20),aim=new THREE.Vector3(0,.94,.02);
    const textures:any[]=[];
    // Local studio light panels provide reflections without loading an HDR asset.
    const environmentCanvas=document.createElement('canvas');environmentCanvas.width=1024;environmentCanvas.height=512;
    const environmentContext=environmentCanvas.getContext('2d')!,gradient=environmentContext.createLinearGradient(0,0,0,512);
    gradient.addColorStop(0,'#f8faf6');gradient.addColorStop(.5,'#b5c0b8');gradient.addColorStop(1,'#747f78');environmentContext.fillStyle=gradient;environmentContext.fillRect(0,0,1024,512);
    environmentContext.filter='blur(18px)';environmentContext.fillStyle='#ffffff';environmentContext.fillRect(120,90,170,180);environmentContext.fillRect(650,110,270,130);
    const environmentTexture=new THREE.CanvasTexture(environmentCanvas);environmentTexture.mapping=THREE.EquirectangularReflectionMapping;environmentTexture.colorSpace=THREE.SRGBColorSpace;
    const pmrem=new THREE.PMREMGenerator(renderer),environment=pmrem.fromEquirectangular(environmentTexture);scene.environment=environment.texture;scene.environmentIntensity=.75;pmrem.dispose();environmentTexture.dispose();
    const mat=(color:string|number,options={})=>new THREE.MeshStandardMaterial({color,roughness:.46,metalness:.1,...options});
    const steel=mat('#a5a8a9',{metalness:.85,roughness:.30}),black=mat('#2b2d2f',{metalness:.25,roughness:.52}),white=mat('#eeeede',{metalness:.05,roughness:.36}),robotShell=new THREE.MeshPhysicalMaterial({color:plan?.robot_visual?.body_color||'#e5e9e5',metalness:.20,roughness:.30,clearcoat:.65,clearcoatRoughness:.27}),accent=mat(plan?.robot_visual?.accent_color||'#d89252',{metalness:.3,roughness:.37});
    const green=mat('#4b9168',{emissive:'#234735',emissiveIntensity:.35});
    const mesh=(geometry:any,material:any,parent:any=scene)=>{const object=new THREE.Mesh(geometry,material);object.castShadow=true;object.receiveShadow=true;parent.add(object);return object;};
    const box=(w:number,h:number,d:number,m:any,x:number,y:number,z:number,parent:any=scene)=>{const o=mesh(new THREE.BoxGeometry(w,h,d),m,parent);o.position.set(x,y,z);return o;};
    const cyl=(r:number,h:number,m:any,x:number,y:number,z:number,parent:any=scene)=>{const o=mesh(new THREE.CylinderGeometry(r,r,h,32),m,parent);o.position.set(x,y,z);return o;};
    const ring=(r:number,t:number,m:any,x:number,y:number,z:number,parent:any=scene)=>{const o=mesh(new THREE.TorusGeometry(r,t,12,48),m,parent);o.rotation.x=Math.PI/2;o.position.set(x,y,z);return o;};
    const labels=new Map<string,HTMLDivElement>();
    const label=(identity:string,text:string)=>{const node=document.createElement('div');node.className='workcell-object-label';node.textContent=text;node.setAttribute('aria-hidden','true');mount.appendChild(node);labels.set(identity,node);};
    const pattern=(fabric=false)=>{
      const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const ctx=canvas.getContext('2d')!;ctx.fillStyle=fabric?'#e9e6df':'#b9c4c4';ctx.fillRect(0,0,128,128);
      ctx.strokeStyle=fabric?'#ddd9d2':'#a9b8b7';ctx.lineWidth=fabric ? .6 : 1;
      for(let i=0;i<128;i+=fabric?3:16){ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i,128);ctx.moveTo(0,i);ctx.lineTo(128,i);ctx.stroke();}
      const texture=new THREE.CanvasTexture(canvas);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(fabric?3:8,fabric?3:5);textures.push(texture);return texture;
    };
    scene.add(new THREE.HemisphereLight('#fffff4','#a3a49f',1.35));
    const key=new THREE.DirectionalLight('#fff5df',2.5);key.position.set(-2,4,-2);key.castShadow=true;key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=-1.8;key.shadow.camera.right=1.8;key.shadow.camera.top=1.8;key.shadow.camera.bottom=-1.8;key.shadow.bias=-.00015;key.shadow.normalBias=.012;key.shadow.radius=3;scene.add(key);
    const rim=new THREE.DirectionalLight('#e7f3ef',1.4);rim.position.set(2,2,1);scene.add(rim);
    const floor=mesh(new THREE.PlaneGeometry(20,20),mat('#dcddd8',{roughness:.95,metalness:0}));floor.rotation.x=-Math.PI/2;floor.castShadow=false;
    const grid=new THREE.GridHelper(8,32,'#b6b8b3','#c1c3be');grid.position.y=.002;grid.material.transparent=true;grid.material.opacity=.22;scene.add(grid);
    // Workbench, steel frame, guard glazing and an overhead RGB camera.
    box(1.42,.065,1.06,black,0,TABLE_Y-.04,.05);
    box(1.38,.014,1.02,mat('#d0d1cc',{metalness:.25,roughness:.55}),0,TABLE_Y-.003,.05);
    for(const x of [-.60,.60])for(const z of [-.36,.47]){box(.045,.68,.045,steel,x,.35,z);cyl(.04,.025,black,x,.02,z);}
    box(1.25,.04,.045,steel,0,.23,.47);box(1.25,.04,.045,steel,0,.23,-.36);
    for(const x of [-.67,.67]){box(.014,.63,.014,steel,x,1.06,.55);box(.006,.32,.70,mat('#c4e0dc',{transparent:true,opacity:.055,roughness:.1,metalness:0,depthWrite:false}),x,.95,.15);}
    // A discreet camera mount at the side leaves the robot silhouette unobstructed.
    box(.014,.75,.014,steel,-.66,1.10,.43);box(.17,.012,.014,steel,-.59,1.47,.43);box(.06,.034,.042,black,-.51,1.44,.43);cyl(.010,.01,green,-.51,1.416,.43);
    box(.20,.07,.02,black,.50,.65,.58);for(let i=0;i<3;i++)cyl(.007,.005,i===0?green:accent,.45+i*.033,.68,.595);
    for(const [name,xy] of Object.entries(fixture.zones)){
      if(!plan?.subtasks.some(s=>s.destination===name))continue;
      const [x,,z]=point(fixture,...xy);const target=new THREE.Group();scene.add(target);target.position.set(x,TABLE_Y+.003,z);
      const zone=box(.14,.002,.13,mat('#639575',{transparent:true,opacity:.12}),0,0,0,target);zone.castShadow=false;ring(.09,.0015,green,0,.002,0,target);
    }
    const objects=new Map<string,any>(),focusRings=new Map<string,any>();
    for(const item of fixture.objects){
      const group=new THREE.Group();scene.add(group);objects.set(item.id,group);
      const [w,d,h]=item.size_mm.map(v=>Math.max(.004,Math.min(.65,v/1000)));const color=mat(item.color);const name=item.name.toLowerCase();
      if(/basket|tray|bowl|container/.test(name)){
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
      if(!compact)label(item.id,item.name);
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
    const viewport={width:1,height:1};
    const resize=()=>{const w=Math.max(1,mount.clientWidth),h=Math.max(1,mount.clientHeight);viewport.width=w;viewport.height=h;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false);};
    const observer=new ResizeObserver(resize);observer.observe(mount);resize();reset.current=()=>{view.current={yaw:2.55,pitch:.43,radius:2.65};};
    let raf=0,last=0,keyStep='';
    const clock=new MotionClock(),renderEnd=idle.clone(),stepStart=idle.clone();
    const currentView={...view.current};let renderGrip=.04,focusMix=0;
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
    const render=(time:number)=>{
      raf=requestAnimationFrame(render);if(document.hidden){last=time;return;}
      const dt=Math.min(.05,Math.max(0,(time-last)/1000));last=time;
      const state=live.current,current=state.plan?.subtasks[state.selected],key=`${state.plan?.id}:${state.selected}:${state.mode}`;
      if(key!==keyStep){keyStep=key;stepStart.copy(renderEnd);route.geometry.dispose();route.geometry=new THREE.BufferGeometry();}
      const relevant=state.arm?.plan_id===state.plan?.id && state.arm?.step_id===current?.id;
      let progress=clock.tick(time,key,current,relevant?state.arm:undefined,state.mode==='live',state.mode==='live'||state.playing,state.playhead?.current||0);
      if(reduced.matches)progress=1;
      const selectedObject=subject(fixture,current),target=selectedObject?position(fixture,selectedObject,state.plan?.subtasks,state.selected).xyz:null;
      let grip=.04;end.copy(idle);sweep.visible=false;route.visible=false;
      robotRoot.position.set(0,0,0);
      if(current&&/nav|locomotion|move_robot/.test(current.task_type)){const targetZone=destination(fixture,current,state.plan?.subtasks||[]);if(targetZone)robotRoot.position.set(targetZone[0]*smooth(progress),0,(targetZone[2]-.52)*smooth(progress));}
      for(const item of fixture.objects){const group=objects.get(item.id),pose=position(fixture,item,state.plan?.subtasks,state.selected);group.position.set(...pose.xyz);group.rotation.set(0,0,0);group.visible=!pose.hidden;group.scale.set(1,1,1);focusRings.get(item.id).visible=item.id===selectedObject?.id;
      }
      if(current&&target&&selectedObject){
        const object=objects.get(selectedObject.id),height=Math.max(.004,selectedObject.size_mm[2]/1000),center=new THREE.Vector3(...target).add(new THREE.Vector3(0,height/2,0));
        const virtual=!!current.decision?.candidates.find(c=>c.model.id===current.decision?.selected_model_id)?.model.simulation_placeholder;
        if(current.task_type==='control'&&!virtual){
          const graspWidth=Math.min(.06,selectedObject.size_mm[0]/2000),hover=center.clone().add(new THREE.Vector3(0,.14,0));
          if(progress<.30)end.copy(stepStart).lerp(hover,phase(progress,0,.30));
          else if(progress<.47)end.copy(hover).lerp(center,phase(progress,.30,.47));
          else if(progress<.57)end.copy(center);
          else end.copy(center).add(new THREE.Vector3(0,.18*phase(progress,.57,.88),0));
          grip=.045+(graspWidth-.045)*phase(progress,.47,.57);
          if(progress>=.57)object.position.copy(end).add(new THREE.Vector3(0,-height/2,0));
        }else if(['placement_planning','object_placement'].includes(current.task_type)&&!virtual){
          const dest=destination(fixture,current,state.plan?.subtasks||[]);
          if(dest){const finish=new THREE.Vector3(...dest).add(new THREE.Vector3(0,height/2,0));const curve=new THREE.QuadraticBezierCurve3(center.clone().add(new THREE.Vector3(0,.18,0)),center.clone().lerp(finish,.5).add(new THREE.Vector3(0,.32,0)),finish.clone().add(new THREE.Vector3(0,.18,0)));
            if(route.geometry.getAttribute('position')?.count!==33){route.geometry.dispose();route.geometry=new THREE.BufferGeometry().setFromPoints(curve.getPoints(32));route.computeLineDistances();}route.visible=true;
            if(current.task_type==='object_placement'){
              if(progress<.58)end.copy(curve.getPoint(phase(progress,0,.58)));
              else if(progress<.78)end.copy(finish).add(new THREE.Vector3(0,.18*(1-phase(progress,.58,.78)),0));
              else end.copy(finish).add(new THREE.Vector3(0,.16*phase(progress,.86,1),0));
              const graspWidth=Math.min(.06,selectedObject.size_mm[0]/2000);grip=graspWidth+(.045-graspWidth)*phase(progress,.78,.86);
              if(progress<.86)object.position.copy(end).add(new THREE.Vector3(0,-height/2,0));else object.position.set(...dest);
            }
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
      renderEnd.lerp(end,reduced.matches?1:damping(dt,22));renderGrip+=(grip-renderGrip)*damping(dt,22);
      left.position.x=-renderGrip;right.position.x=renderGrip;solve(renderEnd);
      const v=view.current;for(const key of ['yaw','pitch','radius'] as const)currentView[key]+=(v[key]-currentView[key])*damping(dt,8);
      const desiredAim=state.focusAction&&target?new THREE.Vector3(...target).add(new THREE.Vector3(0,.17,0)):new THREE.Vector3(0,.94,.02);aim.lerp(desiredAim,damping(dt,4));
      focusMix+=((state.focusAction?1:0)-focusMix)*damping(dt,5);
      const radius=currentView.radius+(Math.min(currentView.radius,1.7)-currentView.radius)*focusMix;
      camera.position.set(aim.x+Math.sin(currentView.yaw)*Math.cos(currentView.pitch)*radius,aim.y+Math.sin(currentView.pitch)*radius,aim.z+Math.cos(currentView.yaw)*Math.cos(currentView.pitch)*radius);camera.lookAt(aim);renderer.render(scene,camera);
      for(const item of fixture.objects){const node=labels.get(item.id);if(!node)continue;const group=objects.get(item.id);if(!group.visible||(!state.showLabels&&item.id!==selectedObject?.id)){node.style.opacity='0';continue;}const projected=group.localToWorld(new THREE.Vector3(0,item.size_mm[2]/1000+.024,0)).project(camera);const visible=Math.abs(projected.x)<.95&&Math.abs(projected.y)<.90&&projected.z<1;node.style.opacity=visible?'1':'0';node.style.transform=`translate3d(${(projected.x*.5+.5)*viewport.width}px,${(-projected.y*.5+.5)*viewport.height}px,0) translate(-50%,-100%)`;}
    };
    raf=requestAnimationFrame(render);
    return()=>{cancelAnimationFrame(raf);observer.disconnect();mount.removeEventListener('pointerdown',down);mount.removeEventListener('pointermove',move);mount.removeEventListener('pointerup',up);mount.removeEventListener('pointercancel',up);mount.removeEventListener('wheel',wheel);scene.traverse((o:any)=>{o.geometry?.dispose();if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach((m:any)=>m.dispose());});textures.forEach(t=>t.dispose());labels.forEach(node=>node.remove());environment.dispose();renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();};
  },[fixture.id,robot.reach_mm,robot.gripper,compact]);
  return <div className={'workcell-view '+(compact?'compact':'')}>
    <div className="workcell-camera-tools"><button className={'icon-button '+(focusAction?'active':'')} aria-label="Focus current action" aria-pressed={focusAction} title="Focus current action" onClick={()=>setFocusAction(!focusAction)}><Focus size={15}/></button><button className={'icon-button '+(showLabels?'active':'')} aria-label="Show object labels" aria-pressed={showLabels} title="Show object labels" onClick={()=>setShowLabels(!showLabels)}><Tags size={15}/></button><select aria-label="Workcell camera" value={cameraMode} onChange={e=>{setCameraMode(e.target.value);view.current=e.target.value==='overhead'?{yaw:Math.PI,pitch:1.45,radius:2.3}:e.target.value==='front'?{yaw:Math.PI,pitch:.30,radius:2.65}:{yaw:2.55,pitch:.43,radius:2.65};}}><option value="orbit">Perspective</option><option value="front">Front</option><option value="overhead">Overhead</option></select><button className="icon-button" aria-label="Reset workcell camera" onClick={()=>{reset.current();setCameraMode('orbit');setFocusAction(false);}}><RotateCcw size={14}/></button></div>
    <div ref={host} className="workcell-canvas" role="img" aria-label={`3D robot workcell with ${fixture.objects.map(o=>o.name).join(', ')}. ${mode==='live'?'Following execution':'Rehearsing'} ${plan?.subtasks[selected]?.title||'the configured robot'}.`}/>
    {unavailable&&<p className="preview-fallback">This browser could not create a 3D view. Mission state and outputs remain available.</p>}
  </div>;
}
