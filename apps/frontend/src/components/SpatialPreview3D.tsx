import { useEffect, useRef } from "react";
// @ts-expect-error Local Three.js distribution is bundled with its license.
import * as THREE from "../vendor/three.module.min.js";

type Mode = "route" | "inspect";

function smooth(value: number) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

export default function SpatialPreview3D({ mode }: { mode: Mode }) {
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
    renderer.toneMappingExposure = 1.55;
    renderer.setClearColor(0xf8faf6, 0);
    renderer.domElement.setAttribute("aria-hidden", "true");
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0xc5d7c8, 3.1));
    const light = new THREE.DirectionalLight(0xffffff, 3.2);
    light.position.set(-3, 6, 5);
    scene.add(light);
    const camera = new THREE.OrthographicCamera(-2, 2, 1.2, -1.2, 0.1, 30);
    const sage = new THREE.MeshStandardMaterial({ color: 0x4d8564, metalness: 0.16, roughness: 0.57 });
    const softSage = new THREE.MeshStandardMaterial({ color: 0xc6dcc8, metalness: 0.05, roughness: 0.86 });
    const ivory = new THREE.MeshStandardMaterial({ color: 0xfafcf6, metalness: 0.08, roughness: 0.68 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x3b5145, metalness: 0.28, roughness: 0.6 });
    const amber = new THREE.MeshStandardMaterial({ color: 0xd4a577, metalness: 0.04, roughness: 0.82 });
    const floorMaterial = new THREE.MeshStandardMaterial({ color: 0xf5f8f2, roughness: 0.98 });
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
    const disc = (radius: number, tube: number, material: any, x: number, y: number, z: number) => {
      const ring = add(new THREE.TorusGeometry(radius, tube, 8, 48), material);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(x, y, z);
      return ring;
    };

    box(3.8, 0.12, 2.28, new THREE.MeshStandardMaterial({ color: 0xe5ebe2, roughness: 1 }), 0, -0.1, 0);
    box(3.68, 0.025, 2.16, floorMaterial, 0, -0.025, 0);
    const grid = new THREE.MeshBasicMaterial({ color: 0xcbd9cc, transparent: true, opacity: 0.5 });
    for (let x = -1.65; x <= 1.66; x += 0.33) box(0.006, 0.002, 2.16, grid, x, -0.009, 0);
    for (let z = -0.99; z <= 1; z += 0.33) box(3.68, 0.002, 0.006, grid, 0, -0.009, z);
    const ambientShadow = new THREE.MeshBasicMaterial({ color: 0x819787, transparent: true, opacity: 0.1, depthWrite: false });
    const shadow = add(new THREE.CircleGeometry(0.38, 32), ambientShadow);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.003;

    const robot = new THREE.Group();
    scene.add(robot);
    box(0.52, 0.16, 0.38, dark, 0, 0.2, 0, robot);
    box(0.43, 0.25, 0.34, ivory, 0, 0.39, 0, robot);
    box(0.3, 0.035, 0.28, sage, 0, 0.54, 0, robot);
    box(0.06, 0.095, 0.06, dark, 0, 0.61, 0, robot);
    const lidar = add(new THREE.CylinderGeometry(0.095, 0.095, 0.055, 24), sage, robot);
    lidar.position.set(0, 0.68, 0);
    const eye = add(new THREE.SphereGeometry(0.065, 16, 12), dark, robot);
    eye.position.set(0.225, 0.4, 0);
    for (const x of [-0.17, 0.17]) for (const z of [-0.23, 0.23]) {
      const wheel = add(new THREE.CylinderGeometry(0.105, 0.105, 0.07, 20), dark, robot);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(x, 0.12, z);
      const hub = add(new THREE.CylinderGeometry(0.045, 0.045, 0.071, 16), softSage, robot);
      hub.rotation.x = Math.PI / 2;
      hub.position.set(x, 0.12, z + (z > 0 ? 0.004 : -0.004));
    }

    let route: any;
    let sweep: any;
    let range: any;
    if (mode === "route") {
      const points = [
        [-1.45, 0.64], [-1.02, 0.64], [-0.56, 0.6], [-0.23, 0.33],
        [-0.16, -0.3], [0.27, -0.58], [0.76, -0.58], [1.38, -0.66],
      ].map(([x, z]) => new THREE.Vector3(x, 0.045, z));
      route = new THREE.CatmullRomCurve3(points);
      add(new THREE.TubeGeometry(route, 100, 0.025, 8, false), new THREE.MeshBasicMaterial({ color: 0x65a87a }));
      for (const [x, z, h] of [[-0.7, -0.45, 0.4], [0.36, 0.42, 0.5], [1.14, 0.3, 0.35]] as const) {
        box(0.42, h, 0.42, amber, x, h / 2, z);
        box(0.43, 0.025, 0.43, ivory, x, h + 0.014, z);
      }
      disc(0.18, 0.018, new THREE.MeshBasicMaterial({ color: 0xc5d8c6 }), -1.45, 0.015, 0.64);
      disc(0.18, 0.018, new THREE.MeshBasicMaterial({ color: 0x528b67 }), 1.38, 0.015, -0.66);
      const goal = add(new THREE.CircleGeometry(0.075, 24), new THREE.MeshBasicMaterial({ color: 0x90b99a }));
      goal.rotation.x = -Math.PI / 2;
      goal.position.set(1.38, 0.017, -0.66);
    } else {
      robot.position.set(-0.12, 0, 0.06);
      robot.rotation.y = -0.25;
      shadow.position.set(-0.12, 0.003, 0.06);
      const sensor = new THREE.MeshBasicMaterial({ color: 0x84ba95, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide });
      range = add(new THREE.CircleGeometry(1.04, 50, -0.2, Math.PI * 1.5), sensor);
      range.rotation.x = -Math.PI / 2;
      range.position.set(-0.12, 0.012, 0.06);
      disc(0.88, 0.009, new THREE.MeshBasicMaterial({ color: 0x8fbe9a, transparent: true, opacity: 0.72 }), -0.12, 0.02, 0.06);
      const sweepGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.035, 0), new THREE.Vector3(1.04, 0.035, 0)]);
      sweep = new THREE.Group();
      sweep.position.set(-0.12, 0, 0.06);
      sweep.add(new THREE.Line(sweepGeometry, new THREE.LineBasicMaterial({ color: 0x67a77a, transparent: true, opacity: 0.7 })));
      scene.add(sweep);
      const person = new THREE.Group();
      scene.add(person);
      person.position.set(-1.24, 0, -0.44);
      const head = add(new THREE.SphereGeometry(0.095, 16, 12), amber, person);
      head.position.y = 0.6;
      const torso = add(new THREE.CylinderGeometry(0.115, 0.15, 0.32, 16), amber, person);
      torso.position.y = 0.34;
      for (const z of [-0.07, 0.07]) box(0.09, 0.22, 0.08, dark, 0, 0.11, z, person);
      disc(0.25, 0.014, new THREE.MeshBasicMaterial({ color: 0xd4a577 }), -1.24, 0.02, -0.44);
      box(0.44, 0.35, 0.44, softSage, 1.05, 0.175, 0.42);
      box(0.45, 0.02, 0.45, ivory, 1.05, 0.36, 0.42);
      disc(0.33, 0.012, new THREE.MeshBasicMaterial({ color: 0x70a982 }), 1.05, 0.02, 0.42);
      const other = new THREE.Group();
      scene.add(other);
      other.position.set(1.18, 0, -0.64);
      box(0.34, 0.14, 0.26, sage, 0, 0.15, 0, other);
      box(0.27, 0.17, 0.22, ivory, 0, 0.3, 0, other);
      for (const z of [-0.17, 0.17]) {
        const wheel = add(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 16), dark, other);
        wheel.rotation.x = Math.PI / 2;
        wheel.position.set(0, 0.09, z);
      }
    }

    const resize = () => {
      const width = Math.max(host.clientWidth, 1);
      const height = Math.max(host.clientHeight, 1);
      const halfHeight = width < 220 ? 1.65 : 1.39;
      camera.left = -halfHeight * width / height;
      camera.right = halfHeight * width / height;
      camera.top = halfHeight;
      camera.bottom = -halfHeight;
      camera.position.set(3.5, 4.5, 5.3);
      camera.lookAt(0, 0.2, 0);
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    resize();
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
      const seconds = (timestamp - started) / 1000;
      if (mode === "route") {
        const t = reduced.matches ? 0.44 : (seconds / 6 + 0.35) % 1;
        const point = route.getPointAt(t);
        const tangent = route.getTangentAt(t);
        robot.position.set(point.x, 0, point.z);
        robot.rotation.y = -Math.atan2(tangent.z, tangent.x);
        shadow.position.set(point.x, 0.003, point.z);
      } else if (!reduced.matches) {
        sweep.rotation.y = seconds * 0.8;
        range.material.opacity = 0.1 + smooth((Math.sin(seconds * 1.7) + 1) / 2) * 0.07;
      }
      renderer.render(scene, camera);
    };
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
  }, [mode]);

  return <div className="skill-preview-canvas skill-preview-spatial" ref={mount} aria-hidden="true" />;
}
