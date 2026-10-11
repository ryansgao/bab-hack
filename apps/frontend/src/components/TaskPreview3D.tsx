import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from "lucide-react";
import { humanize, type Plan, type SimulationScene, type Step } from "../lib/types";
// @ts-expect-error Vendored Three.js runs offline with no additional service calls.
import * as THREE from "../vendor/three.module.min.js";

function matches(item: SimulationScene["objects"][number], step?: Step) {
  const query = (step?.object_name || step?.requirements?.object_name || "").toLowerCase();
  return [item.id, item.name, ...item.aliases].includes(query)
    || ({ tools: "tool", packages: "package", parcels: "package" } as Record<string, string>)[query] === item.category;
}

function destinationFor(item: SimulationScene["objects"][number], step: Step, steps: Step[]) {
  const proposal = steps.find(s => step.depends_on.includes(s.id) && s.task_type === "placement_planning" && matches(item, s));
  return step.destination || proposal?.destination || item.destination;
}

export default function TaskPreview3D({ scene: fixture, plan, selected = 0, onSelect }: {
  scene: SimulationScene; plan?: Plan; selected?: number; onSelect?: (index: number) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const live = useRef({ fixture, plan, selected });
  live.current = { fixture, plan, selected };
  const resetView = useRef<() => void>(() => {});
  const [playing, setPlaying] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const steps = plan?.subtasks || [];
  const step = steps[selected];
  const targets = fixture.objects.filter(item => steps.some(itemStep => matches(item, itemStep)));

  useEffect(() => { setPlaying(false); }, [plan?.id]);
  useEffect(() => {
    if (!playing || !onSelect || !steps.length) return;
    const timer = window.setTimeout(() => {
      if (selected < steps.length - 1) onSelect(selected + 1);
      else setPlaying(false);
    }, 2800);
    return () => window.clearTimeout(timer);
  }, [playing, selected, steps.length, onSelect]);

  useEffect(() => {
    const mount = host.current;
    if (!mount) return;
    let renderer: any;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" }); }
    catch { setUnavailable(true); return; }
    setUnavailable(false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.domElement.setAttribute("aria-hidden", "true");
    mount.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f4ed);
    const camera = new THREE.OrthographicCamera(-4, 4, 3, -3, .1, 40);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xb1c4ae, 1.7));
    const light = new THREE.DirectionalLight(0xffffff, 2.4);
    light.position.set(-3, 7, 5); scene.add(light);
    const material = (color: string | number, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: .65, ...extra });
    const green = material(0x558667);
    const metal = material(0x8796a4, { metalness: .6, roughness: .35 });
    const ivory = material(0xe9e8da);
    const dark = material(0x465b4d);
    const mesh = (geometry: any, mat: any, parent = scene) => {
      const object = new THREE.Mesh(geometry, mat); parent.add(object); return object;
    };
    const box = (w: number, h: number, d: number, mat: any, x: number, y: number, z: number, parent = scene) => {
      const object = mesh(new THREE.BoxGeometry(w, h, d), mat, parent); object.position.set(x, y, z); return object;
    };
    const coordinates = (x: number, y: number) => new THREE.Vector3((x - fixture.width / 2) / 100, 0, (y - fixture.height / 2) / 100);
    const textures: any[] = [];
    const label = (text: string, color: string, parent = scene) => {
      const canvas = document.createElement("canvas"); canvas.width = 512; canvas.height = 80;
      const context = canvas.getContext("2d")!;
      context.font = "500 30px Inter, sans-serif"; context.textAlign = "center";
      context.fillStyle = color; context.fillText(text, 256, 50);
      const texture = new THREE.CanvasTexture(canvas); textures.push(texture);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, toneMapped: false }));
      sprite.scale.set(1.9, .3, 1); parent.add(sprite); return sprite;
    };
    box(fixture.width / 100, .18, fixture.height / 100, material(0xd5ddcc), 0, -.12, 0);
    box(fixture.width / 100 - .15, .025, fixture.height / 100 - .15, material(0xf6efe1), 0, -.015, 0);
    const gridMat = new THREE.MeshBasicMaterial({ color: 0xc5cdbb, transparent: true, opacity: .45 });
    for (let x = -3; x <= 3; x += .4) box(.006, .003, 3.8, gridMat, x, .003, 0);
    for (let z = -1.8; z <= 1.8; z += .4) box(6.2, .003, .006, gridMat, 0, .003, z);
    for (const [name, point] of Object.entries(fixture.zones)) {
      const position = coordinates(...point);
      box(.8, .025, .43, material(0xd5dfcb), position.x, .02, position.z);
      const text = label(humanize(name), "#667b60"); text.position.set(position.x, .17, position.z + .28);
    }

    const groups = new Map<string, any>();
    const rings = new Map<string, any>();
    const labels = new Map<string, any>();
    for (const item of fixture.objects) {
      const group = new THREE.Group(); scene.add(group); groups.set(item.id, group);
      const [x1, y1, x2, y2] = item.bbox;
      const width = (x2 - x1) / 100, depth = (y2 - y1) / 100;
      const height = Math.max(.1, item.size_mm[2] / 100);
      const objectMaterial = material(item.color);
      if (item.category === "drinkware") {
        const radius = width * .4;
        const body = mesh(new THREE.CylinderGeometry(radius, radius * .9, height, 40, 1, true), objectMaterial, group);
        body.position.y = height / 2;
        const interior = mesh(new THREE.CylinderGeometry(radius - .055, radius * .9 - .055, height - .06, 40, 1, true), ivory, group);
        interior.material.side = THREE.DoubleSide; interior.position.y = height / 2;
        const bottom = mesh(new THREE.CylinderGeometry(radius * .85, radius * .85, .045, 32), ivory, group); bottom.position.y = .07;
        const rim = mesh(new THREE.TorusGeometry(radius - .02, .035, 10, 40), ivory, group);
        rim.rotation.x = Math.PI / 2; rim.position.y = height;
        if (item.handle) {
          const handle = mesh(new THREE.TorusGeometry(height * .24, .06, 12, 30), objectMaterial, group);
          handle.position.set(radius + .13, height * .52, 0); handle.rotation.y = Math.PI / 2;
        }
        if (item.surface_dirt > .1) {
          const patch = mesh(new THREE.SphereGeometry(.08, 12, 8), material(0x9d8267), group);
          patch.scale.z = .1; patch.position.set(-.08, height * .52, radius * .96);
        }
      } else if (item.id === "wrench") {
        box(width * .74, .07, .13, metal, 0, .08, 0, group);
        const ring = mesh(new THREE.TorusGeometry(.12, .05, 8, 24), metal, group);
        ring.rotation.x = Math.PI / 2; ring.position.set(-width * .38, .08, 0);
        box(.23, .07, .07, metal, width * .38, .08, -.11, group);
        box(.23, .07, .07, metal, width * .38, .08, .11, group);
      } else if (item.id === "screwdriver") {
        const handle = mesh(new THREE.CylinderGeometry(.095, .095, width * .44, 20), objectMaterial, group);
        handle.rotation.z = Math.PI / 2; handle.position.set(-width * .22, .105, 0);
        box(width * .58, .035, .035, metal, width * .25, .105, 0, group);
        for (let x = -.42; x <= -.12; x += .1) box(.02, .018, .12, dark, x, .2, 0, group);
      } else if (item.category === 'produce') {
        const fruit = mesh(new THREE.SphereGeometry(Math.min(width,depth)*.48,24,18),objectMaterial,group);
        fruit.scale.y = Math.max(.65,height / Math.min(width,depth)); fruit.position.y = height*.48;
        box(.025,.07,.025,dark,0,height,0,group);
      } else if (item.shape === 'sphere') {
        const ball=mesh(new THREE.SphereGeometry(Math.min(width,depth)*.48,24,18),objectMaterial,group);
        ball.position.y=height*.5; ball.scale.y=height/Math.min(width,depth);
      } else if (item.shape === 'cylinder') {
        const cylinder=mesh(new THREE.CylinderGeometry(Math.min(width,depth)*.45,Math.min(width,depth)*.45,height,24),objectMaterial,group);
        cylinder.position.y=height*.5;
      } else if (item.category === 'electronics') {
        box(width*.8,.09,depth,objectMaterial,0,.07,0,group);
        box(width*.7,.012,depth*.8,dark,0,.121,0,group);
      } else {
        box(width, height, depth, objectMaterial, 0, height / 2, 0, group);
        box(.14, .009, depth + .01, ivory, 0, height + .005, 0, group);
        if (item.category === 'package') {
          const text = label(item.id.endsWith("a") ? "A" : "B", "#5c5b49", group);
          text.scale.set(.4, .12, 1); text.position.set(-.22, height + .08, .1);
        }
        if (item.defects.length) box(.14, .08, .14, material(0x9d8061), -width / 2 + .06, height - .04, depth / 2 - .06, group);
      }
      const ring = mesh(new THREE.TorusGeometry(Math.max(width, depth) * .57, .016, 8, 60), new THREE.MeshBasicMaterial({ color: 0x528c63 }), group);
      ring.rotation.x = Math.PI / 2; ring.position.y = .03; ring.visible = false; rings.set(item.id, ring);
      const text = label(item.name, "#405741", group); text.position.set(0, height + .25, 0); labels.set(item.id, text);
    }
    // A local scan beam highlights the active sensing step; it is not a model output.
    const scan = box(6.1, .01, .025, new THREE.MeshBasicMaterial({ color: 0x8ba9bd, transparent: true, opacity: .6 }), 0, .04, 0);
    const route = new THREE.Group(); scene.add(route);
    let previousStep = "";
    let stageStarted = 0;
    const clearRoute = () => {
      for (const child of [...route.children]) {
        child.geometry?.dispose(); child.material?.dispose(); route.remove(child);
      }
    };
    let yaw = -.12, elevation = .72;
    const resize = () => {
      const width = Math.max(1, mount.clientWidth), height = Math.max(1, mount.clientHeight);
      const half = Math.max(2.05, 3.8 * height / width);
      camera.left = -half * width / height; camera.right = half * width / height;
      camera.top = half; camera.bottom = -half;
      camera.position.set(Math.sin(yaw) * 10 * Math.cos(elevation), Math.sin(elevation) * 10, Math.cos(yaw) * 10 * Math.cos(elevation));
      camera.lookAt(0, .12, 0); camera.updateProjectionMatrix(); renderer.setSize(width, height, false);
    };
    resetView.current = () => { yaw = -.12; elevation = .72; resize(); };
    let drag: { x: number; y: number } | null = null;
    const down = (event: PointerEvent) => { drag = { x: event.clientX, y: event.clientY }; mount.setPointerCapture(event.pointerId); };
    const move = (event: PointerEvent) => {
      if (!drag) return;
      yaw -= (event.clientX - drag.x) * .008;
      elevation = Math.max(.35, Math.min(1.4, elevation + (event.clientY - drag.y) * .008));
      drag = { x: event.clientX, y: event.clientY }; resize();
    };
    const up = () => { drag = null; };
    mount.addEventListener("pointerdown", down); mount.addEventListener("pointermove", move);
    mount.addEventListener("pointerup", up); mount.addEventListener("pointercancel", up);
    const observer = new ResizeObserver(resize); observer.observe(mount); resize();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let raf = 0, last = 0, visible = true;
    const render = (time: number) => {
      raf = requestAnimationFrame(render);
      if (!visible || document.hidden || time - last < 1000 / 30) return;
      last = time;
      const { plan: currentPlan, selected: index } = live.current;
      const current = currentPlan?.subtasks[index];
      const stepKey = `${currentPlan?.id || "scene"}:${index}`;
      if (stepKey !== previousStep) { previousStep = stepKey; stageStarted = time; clearRoute(); }
      const progress = reduced.matches ? 1 : Math.min(1, (time - stageStarted) / 2400);
      scan.visible = !!current && ["camera_capture", "image_quality", "scene_mapping"].includes(current.task_type);
      scan.position.z = -1.8 + progress * 3.6;
      for (const item of fixture.objects) {
        const group = groups.get(item.id);
        const [x1, y1, x2, y2] = item.bbox;
        const initial = coordinates((x1 + x2) / 2, (y1 + y2) / 2);
        const position = initial.clone();
        const before = currentPlan?.subtasks.slice(0, index).filter(s => s.task_type === "object_placement" && matches(item, s));
        for (const placement of before || []) {
          const zone = fixture.zones[destinationFor(item, placement, currentPlan?.subtasks || [])];
          if (zone) position.copy(coordinates(...zone));
        }
        const focused = matches(item, current);
        const virtualBefore=currentPlan?.subtasks.slice(0,index).filter(s=>matches(item,s) && s.simulation_effect?.hide_object);
        group.visible=item.visible!==false && !virtualBefore?.length;
        group.scale.setScalar(focused && current?.simulation_effect?.hide_object ? Math.max(.01,1-progress) : 1);
        const virtualDestination=currentPlan?.subtasks.slice(0,index).filter(s=>matches(item,s) && s.destination);
        for (const action of virtualDestination || []) {
          const zone=fixture.zones[action.destination!];
          if (zone) position.copy(coordinates(...zone));
        }
        rings.get(item.id).visible = focused || (!current && currentPlan?.subtasks.some(s => matches(item, s)));
        labels.get(item.id).material.color.set(focused ? 0x286946 : 0xffffff);
        if (focused && current && ["placement_planning", "object_placement"].includes(current.task_type)) {
          const zone = fixture.zones[destinationFor(item, current, currentPlan?.subtasks || [])];
          if (zone) {
            const destination = coordinates(...zone);
            if (!route.children.some((c: any) => c.name === item.id)) {
              const curve = new THREE.QuadraticBezierCurve3(position.clone().setY(.07), position.clone().lerp(destination, .5).setY(.75), destination.clone().setY(.07));
              const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(32)), new THREE.LineDashedMaterial({ color: 0xa47a38, dashSize: .1, gapSize: .07 }));
              line.computeLineDistances(); line.name = item.id; route.add(line);
              const arrow = mesh(new THREE.ConeGeometry(.09, .22, 10), green, route);
              arrow.position.copy(destination).setY(.18);
            }
            if (current.task_type === "object_placement") {
              position.lerp(destination, progress); position.y = Math.sin(progress * Math.PI) * .7;
            }
          }
        } else if (focused && current?.task_type === "control") position.y = Math.sin(progress * Math.PI) * .6;
        group.position.copy(position);
      }
      renderer.render(scene, camera);
    };
    const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }); intersection.observe(mount);
    raf = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(raf); observer.disconnect(); intersection.disconnect();
      mount.removeEventListener("pointerdown", down); mount.removeEventListener("pointermove", move);
      mount.removeEventListener("pointerup", up); mount.removeEventListener("pointercancel", up);
      scene.traverse((object: any) => {
        object.geometry?.dispose();
        if (object.material) (Array.isArray(object.material) ? object.material : [object.material]).forEach((mat: any) => mat.dispose());
      });
      textures.forEach(texture => texture.dispose());
      renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove(); resetView.current = () => {};
    };
  }, [fixture.id]);

  return <div className="task-preview-body">
    <div className="task-preview-caption">
      <span className="simulation-label">SIMULATED WORKBENCH · LOCAL 3D RENDERING</span>
      <button className="text-button" onClick={() => resetView.current()}><RotateCcw size={12} /> Reset view</button>
    </div>
    <div ref={host} className="task-preview-canvas" role="img" aria-label={`3D simulated workbench. ${targets.length ? `Planned targets: ${targets.map(t => t.name).join(", ")}.` : `${fixture.objects.length} fixture objects available.`} ${step ? `Previewing ${step.title}.` : "Build a plan to review Scout's interpretation."}`} />
    {unavailable && <p className="preview-fallback">3D rendering is unavailable in this browser. The task interpretation and step review below are still available.</p>}
    <div className="preview-legend"><span><i /> Planned target</span><span><i className="destination" /> Proposed placement</span><span>Drag to rotate</span></div>
    {plan ? <>
      <div className="preview-interpretation"><strong>Scout understood your task as:</strong><p>{plan.explanation}</p>
        <div className="preview-targets">{targets.map(target => <span key={target.id}>{target.name}</span>)}</div>
      </div>
      {!!steps.length && <>
        <div className="preview-playback">
          <button className="icon-button" aria-label="Previous preview step" disabled={selected === 0} onClick={() => onSelect?.(selected - 1)}><ChevronLeft size={16} /></button>
          <button className="secondary" disabled={!onSelect} onClick={() => { if (!playing && selected === steps.length - 1) onSelect?.(0); setPlaying(!playing); }}>{playing ? <Pause size={13} /> : <Play size={13} />}{playing ? "Pause preview" : "Play preview"}</button>
          <select aria-label="Preview step" value={selected} onChange={e => { setPlaying(false); onSelect?.(Number(e.target.value)); }}>{steps.map((s, i) => <option key={s.id} value={i}>{i + 1}. {s.title}</option>)}</select>
          <button className="icon-button" aria-label="Next preview step" disabled={selected === steps.length - 1} onClick={() => onSelect?.(selected + 1)}><ChevronRight size={16} /></button>
        </div>
        {step && <div className="preview-step"><span>Step {selected + 1} / {steps.length} · {humanize(step.task_type)}</span><strong>{step.title}</strong><p>{step.description}</p>{step.destination && <p>Destination: {humanize(step.destination)}</p>}</div>}
      </>}
      {!!plan.assumptions.length && <details className="preview-assumptions"><summary>Assumptions to review ({plan.assumptions.length})</summary><ul>{plan.assumptions.map((assumption, i) => <li key={i}>{assumption}</li>)}</ul></details>}
    </> : <p className="preview-before-plan">Available objects: {fixture.objects.map(item => item.name).join(", ")}. Build your task plan to see which objects and actions Scout selected.</p>}
    <p className="preview-footnote">This is a visual walkthrough of the planned steps using fixture geometry. Playback makes no AI calls, runs no providers, and spends no demo credits. It does not validate physical robot motion.</p>
  </div>;
}
