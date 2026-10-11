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
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
    } catch {
      host.dataset.unavailable = "true";
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.4));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    renderer.setClearColor(0xf8faf6, 0);
    renderer.setSize(Math.max(host.clientWidth, 1), Math.max(host.clientHeight, 1));
    renderer.domElement.setAttribute("aria-hidden", "true");
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 25);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xb8cdb8, 2.5));
    const key = new THREE.DirectionalLight(0xffffff, 2.9);
    key.position.set(-2, 4, 5);
    scene.add(key);
    const rim = new THREE.PointLight(0xddebd9, 6, 7);
    rim.position.set(2, 2, -2);
    scene.add(rim);

    const graphite = new THREE.MeshStandardMaterial({ color: 0x5d8069, metalness: 0.3, roughness: 0.6 });
    const nearBlack = new THREE.MeshStandardMaterial({ color: 0x2e503b, metalness: 0.32, roughness: 0.62 });
    const ceramic = new THREE.MeshStandardMaterial({ color: 0x396c49, metalness: 0.16, roughness: 0.62 });
    const accent = new THREE.MeshStandardMaterial({ color: precision ? 0xc59060 : 0x60916e, metalness: 0.13, roughness: 0.68 });
    const objectMaterial = new THREE.MeshStandardMaterial({ color: precision ? 0xc8945d : 0xba8051, metalness: 0.04, roughness: 0.78 });
    const padMaterial = new THREE.MeshStandardMaterial({ color: 0x7c9b83, metalness: 0.06, roughness: 0.83 });
    const glow = new THREE.MeshBasicMaterial({ color: 0x80ad8c, transparent: true, opacity: 0.5 });
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

    const ground = add(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardMaterial({ color: 0xf4f7f1, roughness: 0.95 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.18;
    box(3.1, 0.18, 1.9, new THREE.MeshStandardMaterial({ color: 0xe4ebe1, roughness: 0.94 }), 0, -0.1, 0);
    box(2.9, 0.035, 1.72, new THREE.MeshStandardMaterial({ color: 0xf5f8f1, roughness: 0.94 }), 0, 0.01, 0);
    for (let i = -6; i <= 6; i++) {
      box(0.006, 0.003, 1.7, new THREE.MeshBasicMaterial({ color: 0x9ebda3, transparent: true, opacity: 0.26 }), i * 0.2, 0.032, 0);
    }
    for (const z of [-0.88, 0.88]) box(2.98, 0.025, 0.035, accent, 0, -0.005, z);
    box(0.92, 0.065, 0.84, new THREE.MeshStandardMaterial({ color: 0xdce7da, roughness: 0.9 }), 0, 0.075, 0);
    box(0.73, 0.012, 0.65, ceramic, 0, 0.115, 0);
    const objectBase = precision ? 0.31 : 0.34;
    const workpiece = new THREE.Group();
    scene.add(workpiece);
    if (precision) add(new THREE.SphereGeometry(0.17, 24, 18), objectMaterial, workpiece);
    else {
      box(0.46, 0.43, 0.45, objectMaterial, 0, 0, 0, workpiece);
      box(0.48, 0.025, 0.47, accent, 0, 0.215, 0, workpiece);
      box(0.05, 0.42, 0.47, accent, -0.16, 0, 0, workpiece);
    }
    workpiece.position.y = objectBase;
    const targetRing = add(new THREE.TorusGeometry(0.52, 0.009, 6, 52), glow);
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
      box(precision ? 0.105 : 0.14, 0.51, 0.2, ceramic, 0, -0.48, 0, group);
      box(precision ? 0.105 : 0.13, 0.18, precision ? 0.13 : 0.18, padMaterial, -side * (precision ? 0.008 : 0.015), -0.67, 0, group);
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
      if (!reduced.matches) targetRing.material.opacity = 0.4 + Math.sin(time * 2.2) * 0.08;
      renderer.render(scene, camera);
    };
    const resize = () => {
      const width = Math.max(host.clientWidth, 1);
      const height = Math.max(host.clientHeight, 1);
      camera.aspect = width / height;
      camera.position.set(1.6, 1.55, width < 200 ? 3.15 : 2.65);
      camera.lookAt(0, 0.82, 0);
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
