import { useEffect, useRef, useState } from "react";
import type { Arm } from "../lib/types";
// @ts-expect-error This version is vendored so the workcell also runs offline.
import * as THREE from "../vendor/three.module.min.js";

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const smooth = (value: number) => {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};

export function ArmScene({ arm }: { arm: Arm }) {
  const mount = useRef<HTMLDivElement>(null);
  const liveArm = useRef(arm);
  const [ready, setReady] = useState(false);
  const [fallback, setFallback] = useState(false);
  liveArm.current = arm;

  useEffect(() => {
    const host = mount.current;
    if (!host) return;
    let renderer: any;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch {
      setFallback(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(renderer.domElement);
    setReady(true);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0c1717);
    scene.fog = new THREE.FogExp2(0x0c1717, 0.043);
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    const aim = new THREE.Vector3(0, 0.82, 0);
    const frame = new THREE.Group();
    scene.add(frame);

    const metal = new THREE.MeshStandardMaterial({ color: 0x293a38, metalness: 0.7, roughness: 0.34 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x111d1e, metalness: 0.63, roughness: 0.4 });
    const graphite = new THREE.MeshStandardMaterial({ color: 0x1c292a, metalness: 0.43, roughness: 0.62 });
    const porcelain = new THREE.MeshStandardMaterial({ color: 0xd3ded0, metalness: 0.36, roughness: 0.33 });
    const olive = new THREE.MeshStandardMaterial({ color: 0x91a996, metalness: 0.48, roughness: 0.42 });
    const copper = new THREE.MeshStandardMaterial({ color: 0xe8a65c, metalness: 0.52, roughness: 0.32 });
    const glow = new THREE.MeshStandardMaterial({ color: 0x98f2b5, emissive: 0x4adf81, emissiveIntensity: 1.35, metalness: 0.1, roughness: 0.35 });
    const glass = new THREE.MeshPhysicalMaterial({ color: 0x91ddba, transparent: true, opacity: 0.13, metalness: 0.18, roughness: 0.2, depthWrite: false });

    const add = (mesh: any, parent: any = frame) => {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };
    const box = (w: number, h: number, d: number, material: any, x: number, y: number, z: number, parent = frame) => {
      const mesh = add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material), parent);
      mesh.position.set(x, y, z);
      return mesh;
    };
    const cylinder = (top: number, bottom: number, h: number, material: any, x: number, y: number, z: number, parent = frame) => {
      const mesh = add(new THREE.Mesh(new THREE.CylinderGeometry(top, bottom, h, 24), material), parent);
      mesh.position.set(x, y, z);
      return mesh;
    };
    const torus = (radius: number, thickness: number, material: any, x: number, y: number, z: number, parent = frame) => {
      const mesh = add(new THREE.Mesh(new THREE.TorusGeometry(radius, thickness, 10, 64), material), parent);
      mesh.rotation.x = Math.PI / 2;
      mesh.position.set(x, y, z);
      return mesh;
    };
    const sphere = (radius: number, material: any, parent = frame) => add(new THREE.Mesh(new THREE.SphereGeometry(radius, 24, 16), material), parent);

    scene.add(new THREE.HemisphereLight(0xc5e6d1, 0x172324, 2.2));
    const key = new THREE.DirectionalLight(0xf2f5e3, 3.5);
    key.position.set(-3, 7, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -7;
    key.shadow.camera.right = 7;
    key.shadow.camera.top = 7;
    key.shadow.camera.bottom = -7;
    key.shadow.bias = -0.0005;
    scene.add(key);
    const rim = new THREE.PointLight(0x65e4a7, 40, 10);
    rim.position.set(3, 3.6, -2.5);
    scene.add(rim);
    const warm = new THREE.PointLight(0xf6a562, 24, 7);
    warm.position.set(-3, 2.1, 1.8);
    scene.add(warm);

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x101b1b, metalness: 0.12, roughness: 0.82 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.45;
    floor.receiveShadow = true;
    scene.add(floor);
    const grid = new THREE.GridHelper(30, 30, 0x49655d, 0x223b37);
    grid.position.y = -0.445;
    (grid.material as any).transparent = true;
    (grid.material as any).opacity = 0.36;
    scene.add(grid);
    torus(4.2, 0.008, new THREE.MeshBasicMaterial({ color: 0x355e51, transparent: true, opacity: 0.48 }), 0, -0.432, 0);

    // A heavy instrument plinth makes the arm feel like equipment, not a floating model.
    box(6.4, 0.32, 4.3, dark, 0, -0.23, 0);
    box(6.25, 0.08, 4.15, metal, 0, -0.03, 0);
    box(5.8, 0.11, 3.67, graphite, 0, 0.07, 0);
    box(5.66, 0.018, 3.52, dark, 0, 0.135, 0);
    for (let i = -13; i <= 13; i++) {
      const line = box(0.005, 0.003, 3.5, new THREE.MeshBasicMaterial({ color: i % 5 === 0 ? 0x4b7566 : 0x314944, transparent: true, opacity: i % 5 === 0 ? 0.48 : 0.28 }), i * 0.2, 0.147, 0);
      line.castShadow = false;
    }
    for (let i = -8; i <= 8; i++) {
      const line = box(5.7, 0.003, 0.005, new THREE.MeshBasicMaterial({ color: i % 5 === 0 ? 0x4b7566 : 0x314944, transparent: true, opacity: i % 5 === 0 ? 0.48 : 0.28 }), 0, 0.148, i * 0.2);
      line.castShadow = false;
    }
    for (const z of [-2.03, 2.03]) {
      box(5.9, 0.035, 0.07, olive, 0, 0.03, z);
      for (let i = -13; i <= 13; i++) box(0.08, 0.042, 0.073, copper, i * 0.21, 0.065, z);
    }
    for (const x of [-3.06, 3.06]) box(0.09, 0.045, 4.02, olive, x, 0.035, 0);
    for (const x of [-2.86, 2.86]) for (const z of [-1.77, 1.77]) {
      cylinder(0.065, 0.065, 0.025, copper, x, 0.16, z);
      cylinder(0.032, 0.032, 0.028, dark, x, 0.18, z);
    }
    box(1.05, 0.24, 0.12, metal, 2.33, -0.22, 2.08);
    for (let i = 0; i < 5; i++) box(0.11, 0.025, 0.018, i < 3 ? glow : copper, 1.98 + i * 0.17, -0.16, 2.15);

    // Gantry and camera hardware frame the cell without hiding the tabletop.
    for (const x of [-2.95, 2.95]) {
      box(0.09, 2.55, 0.09, metal, x, 1.28, -1.92);
      box(0.15, 0.1, 0.15, porcelain, x, 2.56, -1.92);
    }
    box(6.06, 0.095, 0.1, metal, 0, 2.52, -1.92);
    box(1.05, 0.11, 0.2, dark, 1.0, 2.47, -1.88);
    cylinder(0.19, 0.14, 0.2, graphite, 1.0, 2.32, -1.84);
    const lens = cylinder(0.11, 0.11, 0.03, glow, 1.0, 2.2, -1.84);
    lens.castShadow = false;
    for (const x of [-2.68, 2.68]) box(0.018, 1.5, 2.2, glass, x, 1.05, -0.7);
    box(5.25, 0.024, 0.02, glow, 0, 2.5, -1.84);

    // Workpiece: a marked crate, ceramic cup, inspection block, and destination tray.
    box(0.77, 0.48, 0.74, olive, 0.58, 0.39, -0.35);
    box(0.83, 0.055, 0.81, porcelain, 0.58, 0.66, -0.35);
    box(0.82, 0.045, 0.82, metal, 0.58, 0.17, -0.35);
    for (const x of [0.19, 0.97]) box(0.025, 0.42, 0.027, dark, x, 0.39, -0.35);
    const crateLabel = box(0.44, 0.2, 0.008, dark, 0.58, 0.42, 0.03);
    crateLabel.castShadow = false;
    for (let i = 0; i < 4; i++) box(0.03, 0.115, 0.012, glow, 0.44 + i * 0.08, 0.42, 0.04);
    cylinder(0.26, 0.23, 0.48, porcelain, 1.66, 0.41, -0.18);
    cylinder(0.22, 0.22, 0.015, dark, 1.66, 0.66, -0.18);
    torus(0.22, 0.027, copper, 1.66, 0.64, -0.18);
    const handle = torus(0.19, 0.045, porcelain, 1.88, 0.43, -0.18);
    handle.rotation.y = Math.PI / 2;
    handle.rotation.x = 0;
    box(1.02, 0.1, 0.82, metal, 1.71, 0.22, 0.91);
    box(0.83, 0.018, 0.63, dark, 1.71, 0.28, 0.91);
    for (const x of [1.22, 2.2]) for (const z of [0.53, 1.29]) box(0.04, 0.12, 0.04, copper, x, 0.32, z);
    box(0.45, 0.45, 0.45, copper, -0.15, 0.39, 0.75);
    box(0.47, 0.028, 0.47, dark, -0.15, 0.63, 0.75);
    box(0.3, 0.12, 0.006, porcelain, -0.15, 0.41, 0.98);

    // Articulated six-axis silhouette, with separate joint shells and a moving claw.
    cylinder(0.57, 0.67, 0.27, dark, -1.9, 0.32, 0.42);
    cylinder(0.48, 0.48, 0.08, copper, -1.9, 0.5, 0.42);
    cylinder(0.42, 0.47, 0.42, porcelain, -1.9, 0.76, 0.42);
    torus(0.43, 0.034, dark, -1.9, 0.61, 0.42);
    const shoulder = new THREE.Vector3(-1.9, 0.98, 0.42);
    const shoulderShell = sphere(0.29, metal);
    shoulderShell.position.copy(shoulder);
    const shoulderRing = torus(0.285, 0.026, copper, shoulder.x, shoulder.y, shoulder.z);
    shoulderRing.rotation.x = 0;
    shoulderRing.rotation.z = Math.PI / 2;
    const makeLink = (radius: number, material: any) => add(new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.83, radius, 1, 12), material));
    const upper = makeLink(0.22, porcelain);
    const lower = makeLink(0.17, olive);
    const upperRail = makeLink(0.055, metal);
    const lowerRail = makeLink(0.047, dark);
    const elbowShell = sphere(0.245, dark);
    const elbowCap = sphere(0.16, copper);
    const wristShell = sphere(0.185, metal);
    const claw = new THREE.Group();
    frame.add(claw);
    cylinder(0.19, 0.15, 0.25, porcelain, 0, 0.02, 0, claw);
    box(0.38, 0.14, 0.23, graphite, 0, -0.14, 0, claw);
    const leftFinger = box(0.07, 0.36, 0.11, porcelain, -0.19, -0.38, 0, claw);
    const rightFinger = box(0.07, 0.36, 0.11, porcelain, 0.19, -0.38, 0, claw);
    for (const x of [-0.19, 0.19]) box(0.075, 0.09, 0.15, copper, x, -0.54, 0, claw);
    const nozzle = cylinder(0.055, 0.055, 0.05, glow, 0, -0.245, 0, claw);
    nozzle.castShadow = false;
    const cableMaterial = new THREE.LineBasicMaterial({ color: 0x0a1112 });
    const cable = new THREE.Line(new THREE.BufferGeometry(), cableMaterial);
    frame.add(cable);

    const targetRing = torus(0.39, 0.012, new THREE.MeshBasicMaterial({ color: 0x8df6b1, transparent: true, opacity: 0.9 }), 0.65, 0.17, -0.3);
    targetRing.castShadow = false;
    const targetInner = torus(0.27, 0.008, new THREE.MeshBasicMaterial({ color: 0x8df6b1, transparent: true, opacity: 0.52 }), 0.65, 0.18, -0.3);
    targetInner.castShadow = false;
    const scanBeam = cylinder(0.015, 0.3, 1.92, new THREE.MeshBasicMaterial({ color: 0x75efaa, transparent: true, opacity: 0.09, depthWrite: false }), 1.0, 1.25, -1.84);
    scanBeam.castShadow = false;

    function placeLink(mesh: any, a: any, b: any, lateral = 0) {
      const start = a.clone().add(new THREE.Vector3(0, 0, lateral));
      const end = b.clone().add(new THREE.Vector3(0, 0, lateral));
      const delta = end.clone().sub(start);
      mesh.position.copy(start).add(end).multiplyScalar(0.5);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.clone().normalize());
      mesh.scale.y = delta.length();
    }

    const view = { x: 0.55, y: 0.17, zoom: 1 };
    const pointer = { down: false, px: 0, py: 0 };
    const onPointerDown = (event: PointerEvent) => {
      pointer.down = true;
      pointer.px = event.clientX;
      pointer.py = event.clientY;
      renderer.domElement.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!pointer.down) return;
      view.x = clamp(view.x + (event.clientX - pointer.px) * 0.005, -1.2, 1.4);
      view.y = clamp(view.y + (event.clientY - pointer.py) * 0.003, -0.35, 0.65);
      pointer.px = event.clientX;
      pointer.py = event.clientY;
    };
    const onPointerUp = () => { pointer.down = false; };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      view.zoom = clamp(view.zoom + event.deltaY * 0.001, 0.72, 1.45);
    };
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointercancel", onPointerUp);
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });

    let sceneWidth = host.clientWidth;
    const resize = () => {
      const width = Math.max(host.clientWidth, 1);
      const height = Math.max(host.clientHeight, 1);
      sceneWidth = width;
      camera.aspect = width / height;
      camera.fov = width < 500 ? 48 : 36;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    const visible = { current: true };
    const visibilityObserver = new IntersectionObserver(([entry]) => { visible.current = entry.isIntersecting; });
    visibilityObserver.observe(host);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const clock = new THREE.Clock();
    let raf = 0;
    let lastFrame = 0;
    let elapsed = 0;
    const currentWrist = new THREE.Vector3(-0.4, 1.5, 0.28);
    const currentElbow = new THREE.Vector3(-1.2, 1.93, 0.05);
    const desiredWrist = new THREE.Vector3();
    const desiredElbow = new THREE.Vector3();
    const worldTarget = new THREE.Vector3();
    const target = new THREE.Vector3();
    function animate() {
      raf = requestAnimationFrame(animate);
      const delta = Math.min(clock.getDelta(), 0.05);
      elapsed += delta;
      if (!visible.current || document.hidden) return;
      if (elapsed - lastFrame < 1 / 45) return;
      lastFrame = elapsed;
      const snapshot = liveArm.current;
      const progress = clamp(snapshot.progress || 0, 0, 1);
      const active = !!snapshot.output;
      const phase = snapshot.phase;
      const px = snapshot.grasp_point_px?.[0] ?? 390;
      const py = snapshot.grasp_point_px?.[1] ?? 220;
      worldTarget.set(clamp(0.65 + (px - 390) / 300, -0.2, 1.75), 0.82, clamp(-0.35 + (py - 220) / 250, -1.1, 0.95));
      target.copy(worldTarget);
      target.y = 0.16;
      targetRing.position.x = targetInner.position.x = target.x;
      targetRing.position.z = targetInner.position.z = target.z;
      targetRing.visible = targetInner.visible = active;
      targetRing.scale.setScalar(1 + Math.sin(elapsed * 3) * 0.06);
      targetInner.material.opacity = 0.45 + Math.sin(elapsed * 4) * 0.18;
      scanBeam.material.opacity = reducedMotion.matches ? 0.08 : 0.06 + Math.sin(elapsed * 2.3) * 0.028;
      if (active) {
        const approach = smooth(progress / 0.38);
        desiredWrist.set(-0.4, 1.5, 0.28).lerp(worldTarget, approach);
        if (phase === "lift" || phase === "rotate" || progress > 0.56) desiredWrist.y += smooth((progress - 0.48) / 0.24) * 0.62;
        if (phase === "place" || progress > 0.82) desiredWrist.lerp(new THREE.Vector3(1.7, 0.83, 0.9), smooth((progress - 0.78) / 0.22));
      } else desiredWrist.set(-0.48, 1.56 + (reducedMotion.matches ? 0 : Math.sin(elapsed * 1.15) * 0.022), 0.24);
      desiredElbow.copy(shoulder).lerp(desiredWrist, 0.47);
      desiredElbow.y += 0.7;
      desiredElbow.z -= 0.27;
      const easing = Math.min(1, delta * 4.5);
      currentWrist.lerp(desiredWrist, easing);
      currentElbow.lerp(desiredElbow, easing);
      placeLink(upper, shoulder, currentElbow);
      placeLink(upperRail, shoulder, currentElbow, 0.205);
      placeLink(lower, currentElbow, currentWrist);
      placeLink(lowerRail, currentElbow, currentWrist, -0.16);
      elbowShell.position.copy(currentElbow);
      elbowCap.position.copy(currentElbow).add(new THREE.Vector3(0, 0, 0.14));
      wristShell.position.copy(currentWrist);
      claw.position.copy(currentWrist).add(new THREE.Vector3(0, -0.14, 0));
      const grip = active && progress > 0.37 && progress < 0.82 ? 0.13 : 0.2;
      leftFinger.position.x += (-grip - leftFinger.position.x) * easing * 3;
      rightFinger.position.x += (grip - rightFinger.position.x) * easing * 3;
      cable.geometry.dispose();
      cable.geometry = new THREE.BufferGeometry().setFromPoints([
        shoulder.clone().add(new THREE.Vector3(0, 0.22, -0.06)),
        currentElbow.clone().add(new THREE.Vector3(0, 0.27, -0.06)),
        currentWrist.clone().add(new THREE.Vector3(0, 0.2, -0.06)),
      ]);
      const compactView = sceneWidth < 500;
      const distance = compactView ? 10.8 : 8.9;
      camera.position.set(
        Math.sin(view.x) * distance * view.zoom,
        (compactView ? 5.0 : 4.1) * view.zoom + view.y * 4,
        Math.cos(view.x) * distance * view.zoom,
      );
      camera.lookAt(aim);
      renderer.render(scene, camera);
    }
    animate();

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      visibilityObserver.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointercancel", onPointerUp);
      renderer.domElement.removeEventListener("wheel", onWheel);
      scene.traverse((object: any) => {
        if (object.geometry) object.geometry.dispose();
        if (object.material) {
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material: any) => material.dispose());
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <div className={`robot-viewport ${ready ? "is-ready" : ""} ${fallback ? "is-fallback" : ""}`}>
      <div className="robot-canvas" ref={mount} aria-hidden="true" />
      <div className="robot-viewport-top">
        <span><i /> SCOUT / CELL 01</span>
        <span>SIMULATION FEED <b>●</b> LIVE</span>
      </div>
      <div className="robot-target-label" aria-hidden="true"><span>01 / OBJECT FIELD</span><i /></div>
      <div className="robot-viewport-bottom">
        <div><small>END EFFECTOR</small><strong>{arm.phase === "idle" ? "READY TO WORK" : arm.phase.toUpperCase()}</strong></div>
        <div className="robot-orbit-hint"><span className="orbit-glyph">◌</span><span>DRAG TO ORBIT<br />SCROLL TO ZOOM</span></div>
      </div>
      {fallback && <div className="robot-fallback">3D workspace preview unavailable on this device.</div>}
    </div>
  );
}
