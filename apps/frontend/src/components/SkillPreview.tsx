import { useEffect, useRef, useState } from "react";
import type { Offer } from "../lib/types";
// @ts-expect-error Local Three.js distribution is bundled with its license.
import * as THREE from "../vendor/three.module.min.js";

const labels: Record<string, string> = {
  object_detection: "LOCATE / IDENTIFY",
  grasp: "ALIGN / GRIP",
  control: "FEEL / MOVE",
  path_planning: "ROUTE / AVOID",
  scene_inspection: "SCAN / UNDERSTAND",
};
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function SkillPreview({ offer }: { offer: Offer }) {
  const mount = useRef<HTMLDivElement>(null);
  const [unsupported, setUnsupported] = useState(false);

  useEffect(() => {
    const host = mount.current;
    if (!host) return;
    let renderer: any;
    let scene: any;
    let camera: any;
    let resizeObserver: ResizeObserver | undefined;
    let raf = 0;
    let active = false;
    let initialized = false;
    let last = 0;
    let start = 0;
    const animations: Array<(time: number) => void> = [];

    const build = () => {
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "low-power" });
      } catch {
        initialized = true;
        setUnsupported(true);
        return;
      }
      initialized = true;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.35));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.35;
      renderer.domElement.setAttribute("aria-hidden", "true");
      host.appendChild(renderer.domElement);
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x101d1e);
      scene.fog = new THREE.FogExp2(0x101d1e, 0.07);
      camera = new THREE.PerspectiveCamera(37, 1, 0.1, 40);
      scene.add(new THREE.HemisphereLight(0xd9eedc, 0x122323, 2.7));
      const key = new THREE.DirectionalLight(0xeaf8e6, 3.4);
      key.position.set(-3, 6, 5);
      scene.add(key);
      const edgeLight = new THREE.PointLight(0x77e4b5, 21, 6);
      edgeLight.position.set(2, 2.2, -2.1);
      scene.add(edgeLight);
      const warmLight = new THREE.PointLight(0xffb26e, 12, 5);
      warmLight.position.set(-2, 1.2, 1.2);
      scene.add(warmLight);

      const ink = new THREE.MeshStandardMaterial({ color: 0x152325, metalness: 0.65, roughness: 0.42 });
      const deck = new THREE.MeshStandardMaterial({ color: 0x243636, metalness: 0.5, roughness: 0.58 });
      const silver = new THREE.MeshStandardMaterial({ color: 0xcbdccf, metalness: 0.44, roughness: 0.35 });
      const mint = new THREE.MeshStandardMaterial({ color: 0x9cc9ad, metalness: 0.4, roughness: 0.42 });
      const amber = new THREE.MeshStandardMaterial({ color: 0xe6a46b, metalness: 0.43, roughness: 0.38 });
      const light = new THREE.MeshBasicMaterial({ color: 0x8ff5b9 });
      const line = new THREE.LineBasicMaterial({ color: 0x80f7af, transparent: true, opacity: 0.85 });
      const ringLight = new THREE.MeshBasicMaterial({ color: 0x80f7af, transparent: true, opacity: 0.85 });
      const transparent = new THREE.MeshBasicMaterial({ color: 0x77f4af, transparent: true, opacity: 0.13, depthWrite: false, side: THREE.DoubleSide });
      const add = (geometry: any, material: any, x = 0, y = 0, z = 0) => {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(x, y, z);
        scene.add(mesh);
        return mesh;
      };
      const box = (w: number, h: number, d: number, material: any, x = 0, y = 0, z = 0) => add(new THREE.BoxGeometry(w, h, d), material, x, y, z);
      const sphere = (radius: number, material: any, x = 0, y = 0, z = 0) => add(new THREE.SphereGeometry(radius, 16, 12), material, x, y, z);
      const cylinder = (radius: number, height: number, material: any, x = 0, y = 0, z = 0) => add(new THREE.CylinderGeometry(radius, radius, height, 20), material, x, y, z);
      const ring = (radius: number, material: any, x = 0, y = 0, z = 0) => {
        const mesh = add(new THREE.TorusGeometry(radius, 0.012, 5, 48), material, x, y, z);
        mesh.rotation.x = Math.PI / 2;
        return mesh;
      };
      const link = (radius: number, material: any) => add(new THREE.CylinderGeometry(radius * 0.85, radius, 1, 12), material);
      const placeLink = (mesh: any, a: any, b: any) => {
        const delta = b.clone().sub(a);
        mesh.position.copy(a).add(b).multiplyScalar(0.5);
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.clone().normalize());
        mesh.scale.y = delta.length();
      };
      const edgeBox = (w: number, h: number, d: number, x: number, y: number, z: number) => {
        const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)), line);
        outline.position.set(x, y, z);
        scene.add(outline);
        return outline;
      };

      // Each preview is an instrument-sized workcell, with one task-specific action.
      box(4.4, 0.14, 2.9, ink, 0, -0.22, 0);
      box(4.19, 0.035, 2.69, deck, 0, -0.13, 0);
      for (let i = -9; i <= 9; i++) box(0.005, 0.002, 2.65, transparent, i * 0.22, -0.108, 0);
      for (let i = -5; i <= 5; i++) box(4.14, 0.002, 0.005, transparent, 0, -0.107, i * 0.22);
      for (const z of [-1.37, 1.37]) box(4.3, 0.035, 0.045, mint, 0, -0.16, z);
      for (const x of [-2.1, 2.1]) box(0.045, 0.035, 2.7, mint, x, -0.16, 0);
      for (let i = 0; i < 5; i++) box(0.09, 0.028, 0.009, i < 3 ? light : amber, -1.88 + i * 0.15, -0.18, 1.48);
      const ground = add(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ color: 0x101d1e, roughness: 0.87 }), 0, -0.32, 0);
      ground.rotation.x = -Math.PI / 2;
      const grid = new THREE.GridHelper(12, 20, 0x3d6154, 0x27433d);
      grid.position.y = -0.308;
      (grid.material as any).transparent = true;
      (grid.material as any).opacity = 0.32;
      scene.add(grid);

      const type = offer.task_type;
      if (type === "object_detection") {
        box(0.63, 0.56, 0.6, silver, -0.75, 0.21, 0.05);
        box(0.65, 0.055, 0.62, amber, -0.75, 0.52, 0.05);
        cylinder(0.21, 0.62, mint, 0.55, 0.23, -0.42);
        sphere(0.23, amber, 1.12, 0.12, 0.55);
        const boxes = [edgeBox(0.84, 0.76, 0.81, -0.75, 0.23, 0.05), edgeBox(0.62, 0.82, 0.6, 0.55, 0.26, -0.42)];
        const sweep = box(0.018, 0.9, 2.08, transparent, -1.45, 0.44, 0);
        const target = ring(0.44, ringLight, -0.75, -0.095, 0.05);
        animations.push((time) => {
          sweep.position.x = -1.45 + ((time * (offer.id === "fasterrcnn" ? 0.48 : 0.7)) % 2.9);
          boxes.forEach((outline, index) => { outline.visible = offer.id === "owlvit" ? index === 1 || Math.sin(time * 1.4) > 0 : true; });
          target.scale.setScalar(1 + Math.sin(time * 2.6) * 0.08);
        });
      } else if (type === "grasp") {
        const precise = offer.id.includes("precision");
        cylinder(0.43, 0.21, ink, -1.44, 0.02, 0);
        cylinder(0.32, 0.42, silver, -1.44, 0.31, 0);
        const shoulder = new THREE.Vector3(-1.44, 0.58, 0);
        sphere(0.18, amber, shoulder.x, shoulder.y, shoulder.z);
        const upper = link(0.145, silver);
        const fore = link(0.11, mint);
        const elbow = sphere(0.16, ink);
        const wrist = sphere(0.12, amber);
        const leftJaw = box(0.065, 0.28, 0.11, silver);
        const rightJaw = box(0.065, 0.28, 0.11, silver);
        const workpiece = precise ? sphere(0.17, amber, 0.62, 0.1, 0.02) : box(0.47, 0.42, 0.45, amber, 0.64, 0.12, 0.02);
        box(0.75, 0.055, 0.63, ink, 0.63, -0.07, 0.02);
        edgeBox(0.78, 0.13, 0.66, 0.63, -0.04, 0.02);
        animations.push((time) => {
          const cycle = (time * (precise ? 0.43 : 0.54)) % 2;
          const approach = cycle < 1 ? cycle : 2 - cycle;
          const wristPoint = new THREE.Vector3(-0.44 + approach * 1.06, 1.03 - approach * 0.37 + Math.max(0, approach - 0.75) * 0.32, 0.02);
          const elbowPoint = new THREE.Vector3(-0.65 + approach * 0.22, 1.27 + Math.sin(time * 0.55) * 0.03, -0.16);
          placeLink(upper, shoulder, elbowPoint);
          placeLink(fore, elbowPoint, wristPoint);
          elbow.position.copy(elbowPoint);
          wrist.position.copy(wristPoint);
          const width = precise ? 0.12 : 0.19;
          const closed = approach > 0.7 ? width * 0.72 : width;
          leftJaw.position.set(wristPoint.x - closed, wristPoint.y - 0.27, wristPoint.z);
          rightJaw.position.set(wristPoint.x + closed, wristPoint.y - 0.27, wristPoint.z);
          workpiece.position.y = (precise ? 0.1 : 0.12) + (approach > 0.84 ? (approach - 0.84) * 0.9 : 0);
        });
      } else if (type === "control") {
        const soft = offer.id.includes("soft");
        box(1.2, 0.12, 0.9, ink, 0.58, -0.025, 0);
        const pad = box(0.82, 0.19, 0.58, soft ? mint : amber, 0.58, 0.135, 0);
        const probe = cylinder(0.17, 0.6, silver, 0.58, 1.08, 0);
        cylinder(0.28, 0.13, ink, 0.58, 1.48, 0);
        const contact = cylinder(0.26, 0.08, mint, 0.58, 0.75, 0);
        const pressure = [0.33, 0.51, 0.7].map((radius) => ring(radius, ringLight, 0.58, 0.245, 0));
        const gauge = box(0.1, 0.95, 0.08, ink, -1.19, 0.46, -0.05);
        const fill = box(0.106, 0.44, 0.09, light, -1.19, 0.25, 0.01);
        for (let i = 0; i < 4; i++) box(0.2, 0.015, 0.02, mint, -1.19, 0.07 + i * 0.25, 0.1);
        gauge.rotation.z = 0;
        animations.push((time) => {
          const wave = 0.5 + Math.sin(time * (soft ? 2.1 : 3.3)) * 0.5;
          probe.position.y = 1.08 - wave * (soft ? 0.27 : 0.39);
          contact.position.y = 0.75 - wave * (soft ? 0.27 : 0.39);
          pad.scale.y = 1 - wave * (soft ? 0.13 : 0.26);
          fill.scale.y = 0.35 + wave * 0.7;
          fill.position.y = 0.07 + fill.scale.y * 0.22;
          pressure.forEach((r, index) => { r.scale.setScalar(0.9 + ((time * 0.5 + index / 3) % 1) * 0.26); });
        });
      } else if (type === "path_planning") {
        for (const [x, z] of [[-0.5, -0.2], [0.48, 0.45], [1.02, -0.58]]) {
          box(0.42, 0.42, 0.42, silver, x, 0.11, z);
          edgeBox(0.46, 0.46, 0.46, x, 0.11, z);
        }
        const nodes = [new THREE.Vector3(-1.68, -0.07, 0.57), new THREE.Vector3(-0.9, -0.07, 0.7), new THREE.Vector3(-0.28, -0.07, 0.62), new THREE.Vector3(0.23, -0.07, -0.42), new THREE.Vector3(0.94, -0.07, -0.93), new THREE.Vector3(1.62, -0.07, -0.55)];
        const curve = new THREE.CatmullRomCurve3(nodes);
        add(new THREE.TubeGeometry(curve, 80, 0.018, 5, false), light);
        nodes.forEach((n) => cylinder(0.055, 0.012, amber, n.x, n.y, n.z));
        const rover = new THREE.Group();
        scene.add(rover);
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.29, 0.15, 20), silver);
        body.position.y = 0.22;
        rover.add(body);
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.07, 20), ink);
        cap.position.y = 0.33;
        rover.add(cap);
        for (const x of [-0.26, 0.26]) for (const z of [-0.18, 0.18]) {
          const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.08, 12), ink);
          wheel.rotation.z = Math.PI / 2;
          wheel.position.set(x, 0.12, z);
          rover.add(wheel);
        }
        ring(0.31, ringLight, 1.62, -0.07, -0.55);
        animations.push((time) => {
          const progress = (time * 0.13) % 1;
          const location = curve.getPointAt(progress);
          const tangent = curve.getTangentAt(progress);
          rover.position.set(location.x, 0, location.z);
          rover.rotation.y = Math.atan2(tangent.x, tangent.z);
        });
      } else if (type === "scene_inspection") {
        const cameraRig = box(0.92, 0.27, 0.62, silver, 0.1, 1.78, -0.1);
        const lens = cylinder(0.22, 0.3, ink, 0.1, 1.48, -0.1);
        const glass = cylinder(0.17, 0.02, light, 0.1, 1.32, -0.1);
        const beam = add(new THREE.ConeGeometry(1.1, 1.55, 4, 1, true), transparent, 0.1, 0.57, -0.1);
        beam.rotation.y = Math.PI / 4;
        box(0.62, 0.48, 0.58, amber, -0.85, 0.16, 0.2);
        cylinder(0.23, 0.6, mint, 0.65, 0.22, -0.35);
        sphere(0.18, silver, 1.25, 0.08, 0.47);
        const scan = box(0.025, 0.04, 2.1, light, -1.25, 0.045, -0.1);
        const bounds = edgeBox(2.75, 0.88, 1.68, 0.1, 0.36, 0);
        animations.push((time) => {
          const shift = Math.sin(time * 1.6);
          scan.position.x = shift * 1.22;
          bounds.material.opacity = 0.52 + Math.sin(time * 2) * 0.22;
          cameraRig.rotation.y = lens.rotation.y = glass.rotation.y = shift * 0.12;
          beam.material.opacity = 0.1 + Math.sin(time * 2.1) * 0.04;
        });
      } else {
        const module = box(0.92, 0.92, 0.92, silver, 0, 0.52, 0);
        edgeBox(1.16, 1.16, 1.16, 0, 0.52, 0);
        ring(0.85, ringLight, 0, -0.08, 0);
        animations.push((time) => { module.rotation.y = time * 0.48; module.rotation.x = Math.sin(time * 0.4) * 0.15; });
      }

      const resize = () => {
        const width = Math.max(host.clientWidth, 1);
        const height = Math.max(host.clientHeight, 1);
        camera.aspect = width / height;
        camera.position.set(3.4, 2.8, width < 190 ? 6.9 : 5.8);
        camera.lookAt(0, 0.5, 0);
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, false);
      };
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(host);
      resize();
    };

    const tick = (timestamp: number) => {
      if (!active) return;
      raf = requestAnimationFrame(tick);
      if (timestamp - last < 1000 / 24) return;
      last = timestamp;
      const time = Math.max(0, (timestamp - start) / 1000);
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) animations.forEach((animate) => animate(time));
      renderer.render(scene, camera);
    };
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !document.hidden) {
        if (!initialized) build();
        if (!renderer || active) return;
        active = true;
        start = performance.now();
        raf = requestAnimationFrame(tick);
      } else {
        active = false;
        cancelAnimationFrame(raf);
      }
    }, { rootMargin: "80px" });
    observer.observe(host);
    const onVisibility = () => {
      if (document.hidden) {
        active = false;
        cancelAnimationFrame(raf);
      } else if (host.getBoundingClientRect().top < window.innerHeight && host.getBoundingClientRect().bottom > 0 && renderer && !active) {
        active = true;
        start = performance.now();
        raf = requestAnimationFrame(tick);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active = false;
      cancelAnimationFrame(raf);
      observer.disconnect();
      resizeObserver?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      scene?.traverse((object: any) => {
        object.geometry?.dispose();
        if (object.material) {
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material: any) => material.dispose());
        }
      });
      renderer?.dispose();
      renderer?.forceContextLoss();
      renderer?.domElement.remove();
    };
  }, [offer.id, offer.task_type]);

  return (
    <div className={`skill-preview skill-preview-${offer.task_type}`} aria-label={`${offer.name} illustrative 3D preview`}>
      <div className="skill-preview-canvas" ref={mount} aria-hidden="true" />
      <div className="skill-preview-top" aria-hidden="true"><span><i /> SKILL STUDY</span><span>3D / {offer.id.toUpperCase().replaceAll("_", " ")}</span></div>
      <div className="skill-preview-bottom" aria-hidden="true"><span>{labels[offer.task_type] || "PROCESS / ACT"}</span><span>↗</span></div>
      {unsupported && <span className="skill-preview-unavailable">3D preview unavailable</span>}
    </div>
  );
}
