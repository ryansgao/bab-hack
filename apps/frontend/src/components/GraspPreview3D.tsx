import { useEffect, useRef } from "react";
// @ts-expect-error Local Three.js distribution is bundled with its license.
import * as THREE from "../vendor/three.module.min.js";

const ease = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};

export default function GraspPreview3D({ precision }: { precision: boolean }) {
  const mount = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = mount.current;
    if (!host) return;
    let renderer: any;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "low-power" });
    } catch {
      host.dataset.unavailable = "true";
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.4));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.3;
    renderer.setSize(Math.max(host.clientWidth, 1), Math.max(host.clientHeight, 1));
    renderer.domElement.setAttribute("aria-hidden", "true");
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x101d1e);
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 25);
    scene.add(new THREE.HemisphereLight(0xe8f5e6, 0x1c3330, 2.7));
    const key = new THREE.DirectionalLight(0xf6f5de, 4.1);
    key.position.set(-2, 4, 5);
    scene.add(key);
    const rim = new THREE.PointLight(0x8af9bf, 18, 7);
    rim.position.set(2, 2, -2);
    scene.add(rim);

    const graphite = new THREE.MeshStandardMaterial({ color: 0x263b3a, metalness: 0.55, roughness: 0.5 });
    const nearBlack = new THREE.MeshStandardMaterial({ color: 0x102021, metalness: 0.65, roughness: 0.38 });
    const ceramic = new THREE.MeshStandardMaterial({ color: 0xdae7d8, metalness: 0.3, roughness: 0.31 });
    const accent = new THREE.MeshStandardMaterial({ color: precision ? 0xe9b97d : 0x9ecbb0, metalness: 0.4, roughness: 0.42 });
    const objectMaterial = new THREE.MeshStandardMaterial({ color: precision ? 0xe9b97d : 0xd19b66, metalness: 0.15, roughness: 0.58 });
    const padMaterial = new THREE.MeshStandardMaterial({ color: 0xa3bfaa, metalness: 0.12, roughness: 0.77 });
    const glow = new THREE.MeshBasicMaterial({ color: 0x9cf4b7, transparent: true, opacity: 0.78 });
    const add = (geometry: any, material: any, parent = scene) => {
      const mesh = new THREE.Mesh(geometry, material);
      parent.add(mesh);
      return mesh;
    };
    const box = (w: number, h: number, d: number, material: any, x: number, y: number, z: number, parent = scene) => {
      const mesh = add(new THREE.BoxGeometry(w, h, d), material, parent);
      mesh.position.set(x, y, z);
      return mesh;
    };
    const cylinder = (radius: number, height: number, material: any, x: number, y: number, z: number, parent = scene) => {
      const mesh = add(new THREE.CylinderGeometry(radius, radius, height, 24), material, parent);
      mesh.position.set(x, y, z);
      return mesh;
    };

    const ground = add(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardMaterial({ color: 0x0d191a, roughness: 0.86 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.18;
    box(3.1, 0.18, 1.9, nearBlack, 0, -0.1, 0);
    box(2.9, 0.035, 1.72, graphite, 0, 0.01, 0);
    for (let i = -6; i <= 6; i++) {
      const line = box(0.006, 0.003, 1.7, glow, i * 0.2, 0.032, 0);
      line.material = new THREE.MeshBasicMaterial({ color: 0x6ca587, transparent: true, opacity: 0.17 });
    }
    for (const z of [-0.88, 0.88]) box(2.98, 0.025, 0.035, accent, 0, -0.005, z);
    box(0.92, 0.065, 0.84, nearBlack, 0, 0.075, 0);
    box(0.73, 0.012, 0.65, graphite, 0, 0.115, 0);
    const objectBase = precision ? 0.31 : 0.34;
    const workpiece = new THREE.Group();
    scene.add(workpiece);
    if (precision) add(new THREE.SphereGeometry(0.17, 24, 18), objectMaterial, workpiece);
    else {
      box(0.46, 0.43, 0.45, objectMaterial, 0, 0, 0, workpiece);
      box(0.48, 0.025, 0.47, ceramic, 0, 0.215, 0, workpiece);
      box(0.05, 0.42, 0.47, ceramic, -0.16, 0, 0, workpiece);
    }
    workpiece.position.y = objectBase;
    const targetRing = add(new THREE.TorusGeometry(0.52, 0.012, 6, 52), glow);
    targetRing.rotation.x = Math.PI / 2;
    targetRing.position.y = 0.123;
    const grip = new THREE.Group();
    scene.add(grip);
    cylinder(0.12, 0.29, graphite, 0, 0.32, 0, grip);
    cylinder(0.24, 0.17, ceramic, 0, 0.1, 0, grip);
    cylinder(0.19, 0.055, nearBlack, 0, -0.02, 0, grip);
    box(0.74, 0.17, 0.3, ceramic, 0, -0.13, 0, grip);
    for (const side of [-1, 1]) {
      box(0.1, 0.15, 0.27, nearBlack, side * 0.27, -0.25, 0, grip);
    }
    const leftFinger = new THREE.Group();
    const rightFinger = new THREE.Group();
    grip.add(leftFinger, rightFinger);
    for (const [group, side] of [[leftFinger, -1], [rightFinger, 1]] as const) {
      box(precision ? 0.06 : 0.095, 0.51, 0.18, ceramic, 0, -0.48, 0, group);
      box(precision ? 0.065 : 0.085, 0.18, precision ? 0.1 : 0.15, padMaterial, -side * (precision ? 0.008 : 0.015), -0.67, 0, group);
      box(0.08, 0.06, 0.2, accent, 0, -0.25, 0, group);
    }
    let active = false;
    let raf = 0;
    let last = 0;
    let started = 0;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const render = (timestamp: number) => {
      if (!active) return;
      raf = requestAnimationFrame(render);
      if (timestamp - last < 1000 / 30) return;
      last = timestamp;
      const time = Math.max(0, (timestamp - started) / 1000);
      const phase = reduced.matches ? 0.57 : ((time + 2.15) % 5.5) / 5.5;
      const descend = ease(phase / 0.2);
      const close = ease((phase - 0.2) / 0.15) * (1 - ease((phase - 0.85) / 0.1));
      const lift = ease((phase - 0.35) / 0.2) * (1 - ease((phase - 0.7) / 0.15));
      const returnUp = ease((phase - 0.95) / 0.05);
      grip.position.y = 1.52 - descend * 0.42 + lift * 0.37 + returnUp * 0.42;
      const openWidth = precision ? 0.33 : 0.43;
      const closedWidth = precision ? 0.215 : 0.29;
      const spread = openWidth + (closedWidth - openWidth) * close;
      leftFinger.position.x = -spread;
      rightFinger.position.x = spread;
      workpiece.position.y = objectBase + lift * 0.37;
      if (!reduced.matches) targetRing.material.opacity = 0.5 + Math.sin(time * 2.2) * 0.15;
      renderer.render(scene, camera);
    };
    const resize = () => {
      const width = Math.max(host.clientWidth, 1);
      const height = Math.max(host.clientHeight, 1);
      camera.aspect = width / height;
      camera.position.set(2.25, 1.94, width < 200 ? 4.25 : 3.5);
      camera.lookAt(0, 0.72, 0);
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    resize();
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !document.hidden) {
        if (active) return;
        active = true;
        started = performance.now();
        raf = requestAnimationFrame(render);
      } else {
        active = false;
        cancelAnimationFrame(raf);
      }
    }, { rootMargin: "80px" });
    observer.observe(host);
    const visibility = () => {
      if (document.hidden) { active = false; cancelAnimationFrame(raf); }
      else if (host.getBoundingClientRect().bottom > 0 && host.getBoundingClientRect().top < window.innerHeight && !active) {
        active = true;
        started = performance.now();
        raf = requestAnimationFrame(render);
      }
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      active = false;
      cancelAnimationFrame(raf);
      observer.disconnect();
      resizeObserver.disconnect();
      document.removeEventListener("visibilitychange", visibility);
      scene.traverse((object: any) => {
        object.geometry?.dispose();
        if (object.material) {
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material: any) => material.dispose());
        }
      });
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [precision]);

  return <div className="skill-preview-canvas skill-preview-grasp" ref={mount} aria-hidden="true" />;
}
