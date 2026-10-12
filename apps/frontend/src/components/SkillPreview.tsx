import { useId, type CSSProperties, type ReactNode } from "react";
import type { Offer } from "../lib/types";
import { familyOf, type Family } from "../lib/skills";

// Every marketplace card gets an isometric scene: the listed object on a fading
// floor grid, plus an animated overlay for the kind of model being sold.
// Animations are CSS keyframes (see .sp-* in style.css) sharing one per-card
// clock, offset by a hash of the offer id so the grid never moves in lockstep.

const INK = "#2f6b4f";
const AMBER = "#cf8a3e";
const BLUE = "#4f7fb0";
const METAL = "#aab2ad";

type Shape = "round" | "cluster" | "long" | "utensil" | "tool" | "box" | "can" | "bottle" | "cup" | "glass" | "plate" | "ring" | "flat" | "device" | "laptop" | "person";
type Look = { shape: Shape; color: string; name: string };
type Box = { x0: number; y0: number; x1: number; y1: number };
type Paint = { fill: string; stroke: string };
type Drawn = { node: ReactNode; box: Box };
type Scene = { node: ReactNode; readout: string };
type S = { id: string; offer: Offer; look: Look; seed: number; begin: string };

const OBJECTS: Record<string, [Shape, string]> = {
  apple: ["round", "#c95b4c"], tomato: ["round", "#d0533f"], strawberry: ["round", "#cf4a55"], "bell pepper": ["round", "#c94a3b"],
  orange: ["round", "#e08a3c"], mango: ["round", "#e7a447"], peach: ["round", "#eca27e"], lemon: ["round", "#e6c34d"],
  lime: ["round", "#8db35a"], pear: ["round", "#b8c25e"], avocado: ["round", "#5f7a3d"], potato: ["round", "#c6a274"],
  "computer mouse": ["round", "#dfe2de"], earbuds: ["round", "#f1f2ef"],
  grape: ["cluster", "#7d5c8f"], broccoli: ["cluster", "#5f8a47"],
  banana: ["long", "#e3c159"], carrot: ["long", "#e07b39"], cucumber: ["long", "#6c9447"], "hot dog": ["long", "#c97a4a"],
  pen: ["long", "#4d6a8c"], pencil: ["long", "#e3b440"], toothbrush: ["long", "#7fb2c9"], "usb cable": ["long", "#50555b"],
  "shipping tube": ["long", "#c9a578"], "paint brush": ["long", "#c08a55"], bolt: ["long", "#9aa3a8"],
  fork: ["utensil", "#b9bfc3"], spoon: ["utensil", "#b9bfc3"], knife: ["utensil", "#b9bfc3"], "butter knife": ["utensil", "#b9bfc3"],
  "utility knife": ["utensil", "#e0b13c"], spatula: ["utensil", "#3d4246"],
  hammer: ["tool", "#b9824f"], pliers: ["tool", "#c0503d"], "hex key": ["tool", "#3d4246"], keys: ["tool", "#c9a64a"],
  "cardboard box": ["box", "#d4b083"], book: ["box", "#6f8fb0"], notebook: ["box", "#7f93ad"], "egg carton": ["box", "#d9cdb6"],
  "food container": ["box", "#e3e9e4"], wallet: ["box", "#6b4e3d"], "power bank": ["box", "#4f555c"], charger: ["box", "#eceee9"],
  "remote control": ["box", "#3e4348"], "game controller": ["box", "#54595f"], camera: ["box", "#3b4046"], sandwich: ["box", "#d9b07a"],
  "tape measure": ["box", "#e2b93b"],
  can: ["can", "#b6c0c8"], jar: ["can", "#e8d9b8"],
  bottle: ["bottle", "#8fbfa6"], "glass bottle": ["bottle", "#8fbfa6"], "water bottle": ["bottle", "#9fc6dd"], "soap dispenser": ["bottle", "#cfe1df"],
  cup: ["cup", "#f1ede6"], mug: ["cup", "#f1ede6"], "wine glass": ["cup", "#dfe9ea"],
  bowl: ["plate", "#f1ede6"], plate: ["plate", "#f3f0ea"],
  washer: ["ring", "#a6adb2"], nut: ["ring", "#9aa3a8"], gear: ["ring", "#9aa3a8"],
  towel: ["flat", "#9fb7c9"], sock: ["flat", "#b8a6c9"], glove: ["flat", "#d9b96e"], "shipping label": ["flat", "#fbfaf6"],
  "padded envelope": ["flat", "#e3cfa6"], keyboard: ["flat", "#e2e5e0"], sunglasses: ["flat", "#3e4348"],
  phone: ["device", "#3c434b"], "cell phone": ["device", "#3c434b"], smartphone: ["device", "#3c434b"], "mobile phone": ["device", "#3c434b"],
  tablet: ["device", "#3c434b"], smartwatch: ["device", "#3c434b"], headphones: ["device", "#3e4348"],
  laptop: ["laptop", "#c9ced3"], person: ["person", "#6b7480"],
};
const BOX_DIMS: Record<string, [number, number, number]> = {
  book: [30, 22, 8], notebook: [30, 22, 6], "egg carton": [40, 20, 12], wallet: [22, 16, 5], "power bank": [14, 28, 8],
  charger: [16, 16, 16], "remote control": [10, 34, 5], "game controller": [32, 20, 10], camera: [30, 18, 22],
  sandwich: [30, 30, 12], "food container": [34, 26, 14], "tape measure": [20, 12, 20],
};
const FLAT_DIMS: Record<string, [number, number, number]> = {
  towel: [36, 26, 7], sock: [14, 34, 3], glove: [26, 30, 4], "shipping label": [30, 22, 1.5],
  "padded envelope": [34, 24, 3], keyboard: [46, 18, 3], sunglasses: [30, 12, 2],
};
const DISTRACTORS = ["cardboard box", "water bottle", "orange", "book", "cup", "banana", "can", "lemon"];

function lookFor(name?: string): Look {
  const key = (name || "cardboard box").toLowerCase();
  const hit = OBJECTS[key] ?? Object.entries(OBJECTS).find(([k]) => key.includes(k))?.[1] ?? ["box", "#d4b083"];
  return { shape: hit[0], color: hit[1], name: key };
}

function hash(value: string) {
  let h = 2166136261;
  for (const c of value) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

function tone(hex: string, amount: number) {
  const n = parseInt(hex.slice(1), 16);
  const to = amount < 0 ? [28, 29, 24] : [255, 255, 255];
  const a = Math.abs(amount);
  return "#" + [n >> 16, (n >> 8) & 255, n & 255].map((v, i) => Math.round(v + (to[i] - v) * a).toString(16).padStart(2, "0")).join("");
}

const iso = (x: number, y: number, z = 0): [number, number] => [x - y, (x + y) / 2 - z];
const pts = (...p: [number, number][]) => p.map((q) => q.join(",")).join(" ");
const at = (x: number, y: number, node: ReactNode, className?: string, style?: CSSProperties) =>
  <g transform={`translate(${x} ${y})`}>{className ? <g className={className} style={style}>{node}</g> : node}</g>;
const later = (seconds: number): CSSProperties => ({ animationDelay: `calc(var(--sp-delay, 0s) + ${seconds}s)` });

// ── Objects ────────────────────────────────────────────────────────────────

function cuboid(w: number, d: number, h: number, color: string, paint?: Paint, extra?: ReactNode): Drawn {
  const a = w / 2, b = d / 2;
  const edge = paint ? { stroke: paint.stroke, strokeWidth: 1 } : { stroke: tone(color, -0.4), strokeOpacity: 0.3, strokeWidth: 0.6 };
  return {
    node: <g strokeLinejoin="round" {...edge}>
      <polygon points={pts(iso(-a, b), iso(a, b), iso(a, b, h), iso(-a, b, h))} fill={paint?.fill ?? color} />
      <polygon points={pts(iso(a, -b), iso(a, b), iso(a, b, h), iso(a, -b, h))} fill={paint?.fill ?? tone(color, -0.2)} />
      <polygon points={pts(iso(-a, -b, h), iso(a, -b, h), iso(a, b, h), iso(-a, b, h))} fill={paint?.fill ?? tone(color, 0.3)} />
      {!paint && <polyline points={pts(iso(-a, b, h), iso(a, b, h), iso(a, -b, h))} fill="none" stroke="#fff" strokeOpacity={0.6} strokeWidth={0.8} />}
      {!paint && extra}
    </g>,
    box: { x0: -(a + b), x1: a + b, y0: -(a + b) / 2 - h, y1: (a + b) / 2 },
  };
}

function cylinder(r: number, h: number, color: string, gid: string, paint?: Paint, open = false): ReactNode {
  const edge = paint ? { stroke: paint.stroke, strokeWidth: 1 } : { stroke: tone(color, -0.4), strokeOpacity: 0.3, strokeWidth: 0.6 };
  return <g {...edge}>
    {!paint && <linearGradient id={gid}>
      <stop offset="0" stopColor={tone(color, -0.14)} /><stop offset=".3" stopColor={tone(color, 0.38)} />
      <stop offset=".62" stopColor={color} /><stop offset="1" stopColor={tone(color, -0.32)} />
    </linearGradient>}
    <path d={`M${-r} ${-h}V0A${r} ${r / 2} 0 0 0 ${r} 0V${-h}Z`} fill={paint?.fill ?? `url(#${gid})`} />
    <ellipse cy={-h} rx={r} ry={r / 2} fill={paint?.fill ?? tone(color, open ? -0.16 : 0.32)} />
    {open && !paint && <ellipse cy={-h} rx={r} ry={r / 2} fill="none" stroke={tone(color, 0.5)} strokeOpacity={1} strokeWidth={1.4} />}
  </g>;
}

function sphere(cx: number, cy: number, rx: number, ry: number, color: string, gid: string, paint?: Paint): ReactNode {
  return <>
    {!paint && <radialGradient id={gid} cx=".36" cy=".3" r=".78">
      <stop offset="0" stopColor={tone(color, 0.5)} /><stop offset=".5" stopColor={color} /><stop offset="1" stopColor={tone(color, -0.32)} />
    </radialGradient>}
    <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={paint?.fill ?? `url(#${gid})`} stroke={paint?.stroke ?? "none"} />
    {!paint && <ellipse cx={cx - rx * 0.38} cy={cy - ry * 0.45} rx={rx * 0.24} ry={ry * 0.14} fill="#fff" opacity={0.5} transform={`rotate(-32 ${cx - rx * 0.38} ${cy - ry * 0.45})`} />}
  </>;
}

function thing(look: Look, gid: string, paint?: Paint, labelled = false): Drawn {
  const { shape, color, name } = look;
  const edge = paint?.stroke ?? "none";
  if (shape === "round") {
    const r = name === "strawberry" ? 13 : name === "earbuds" ? 7 : 16;
    const egg = /lemon|potato|mango|avocado|mouse/.test(name);
    const rx = egg ? r * 1.12 : r, ry = egg ? r * 0.86 : name === "pear" ? r * 1.1 : r;
    if (name === "earbuds") return { node: <>{sphere(-9, -7, 7, 7, color, gid + "a", paint)}{sphere(9, -7, 7, 7, color, gid + "b", paint)}</>, box: { x0: -16, x1: 16, y0: -14, y1: 0 } };
    const top = -2 * ry;
    return {
      node: <>
        {sphere(0, -ry, rx, ry, color, gid, paint)}
        {!paint && /apple|pear|peach/.test(name) && <>
          <path d={`M0 ${top + 2}q1-5 3.5-7`} stroke="#6b4a2f" strokeWidth={1.6} fill="none" strokeLinecap="round" />
          <ellipse cx={6} cy={top - 3} rx={4.6} ry={2.2} fill="#6f9a4f" transform={`rotate(-28 6 ${top - 3})`} />
        </>}
        {!paint && /tomato|strawberry|pepper/.test(name) && <path d={`M-6 ${top + 3}l3-1 3-3 3 3 3 1-3 1h-6z`} fill="#5f8a47" />}
        {!paint && /orange|lemon|lime/.test(name) && <circle cy={top + 1.5} r={1.3} fill={tone(color, -0.3)} />}
        {!paint && name === "strawberry" && [[-4, -10], [3, -8], [-1, -15], [5, -15], [-6, -17]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={0.7} fill="#f3d77a" />)}
      </>,
      box: { x0: -rx, x1: rx, y0: top - (/apple|pear|peach/.test(name) ? 6 : 0), y1: 0 },
    };
  }
  if (shape === "cluster") {
    const spots: [number, number, number][] = name === "broccoli"
      ? [[-8, -22, 8], [8, -22, 8], [0, -28, 8.5], [0, -17, 7.5]]
      : [[0, -29, 6.5], [-3.6, -19, 6.5], [3.6, -19, 6.5], [-7.2, -8, 6.5], [0, -7, 6.5], [7.2, -8, 6.5]];
    return {
      node: <>
        {name === "broccoli" && <rect x={-4} y={-14} width={8} height={14} rx={3} fill={paint?.fill ?? "#a9c27f"} stroke={edge} />}
        {spots.map(([x, y, r], i) => <g key={i}>{sphere(x, y, r, r, color, `${gid}${i}`, paint)}</g>)}
        {!paint && name === "grape" && <path d="M0-35q2-5 6-6" stroke="#6b4a2f" strokeWidth={1.5} fill="none" strokeLinecap="round" />}
      </>,
      box: { x0: -16, x1: 16, y0: name === "broccoli" ? -37 : -41, y1: 0 },
    };
  }
  if (shape === "long" || shape === "utensil" || shape === "tool") {
    const L = 48;
    const r = { pen: 3, pencil: 3.4, toothbrush: 3, "usb cable": 2, bolt: 4, "paint brush": 3, "shipping tube": 8, "hot dog": 6.5, cucumber: 7 }[name] ?? (shape === "long" ? 6 : 3);
    const grad = !paint && <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor={tone(color, 0.38)} /><stop offset=".45" stopColor={color} /><stop offset="1" stopColor={tone(color, -0.32)} />
    </linearGradient>;
    const fill = paint?.fill ?? `url(#${gid})`;
    const metal = paint?.fill ?? METAL;
    let body: ReactNode;
    if (name === "banana") body = <path d={`M${-L / 2} -2Q0 ${r * 2.8} ${L / 2} -3Q0 ${r * 1.1} ${-L / 2} -2Z`} fill={fill} stroke={edge} />;
    else if (name === "carrot") body = <>
      <path d={`M${-L / 2 + 4} ${-r}L${L / 2} -1L${L / 2} 1L${-L / 2 + 4} ${r}Q${-L / 2} ${r} ${-L / 2} 0Q${-L / 2} ${-r} ${-L / 2 + 4} ${-r}Z`} fill={fill} stroke={edge} />
      {!paint && <path d={`M${-L / 2} 0l-8-5M${-L / 2} 0l-9 1M${-L / 2} 0l-7 5`} stroke="#5f8a47" strokeWidth={2} strokeLinecap="round" />}
    </>;
    else if (name === "pencil") body = <>
      <rect x={-L / 2} y={-r} width={L - 8} height={2 * r} fill={fill} stroke={edge} />
      <path d={`M${L / 2 - 8} ${-r}L${L / 2} 0L${L / 2 - 8} ${r}Z`} fill={paint?.fill ?? "#e8cfa6"} stroke={edge} />
      {!paint && <><path d={`M${L / 2 - 2.6} -1.1L${L / 2} 0L${L / 2 - 2.6} 1.1Z`} fill="#3d4246" /><rect x={-L / 2 - 4} y={-r} width={4} height={2 * r} rx={1} fill="#e59a9a" /></>}
    </>;
    else if (shape === "utensil") body = <>
      <rect x={-L / 2} y={-r} width={L * 0.5} height={2 * r} rx={r} fill={paint?.fill ?? (name === "utility knife" ? color : "#3d4246")} stroke={edge} />
      {name === "spoon" ? <><rect x={0} y={-1.4} width={L * 0.3} height={2.8} fill={metal} stroke={edge} /><ellipse cx={L * 0.38} rx={7} ry={4.6} fill={metal} stroke={edge} /></>
        : name === "fork" ? <><rect x={0} y={-1.4} width={L * 0.28} height={2.8} fill={metal} stroke={edge} /><path d={`M${L * 0.28} -4.5H${L / 2}M${L * 0.28} -1.5H${L / 2}M${L * 0.28} 1.5H${L / 2}M${L * 0.28} 4.5H${L / 2}M${L * 0.28} -4.5V4.5`} stroke={metal} strokeWidth={1.6} strokeLinecap="round" /></>
        : name === "spatula" ? <><rect x={0} y={-1.4} width={L * 0.2} height={2.8} fill={metal} stroke={edge} /><rect x={L * 0.2} y={-7} width={L * 0.3} height={14} rx={2.5} fill={paint?.fill ?? color} stroke={edge} /></>
          : <path d={`M0 ${-r}H${L / 2 - 4}Q${L / 2} ${-r} ${L / 2} 0L${L / 2 - 2} ${r}H0Z`} fill={metal} stroke={edge} />}
    </>;
    else if (shape === "tool") body = name === "hammer" ? <>
      <rect x={-L / 2} y={-3} width={L - 6} height={6} rx={3} fill={fill} stroke={edge} />
      <rect x={L / 2 - 10} y={-10} width={10} height={20} rx={2} fill={metal} stroke={edge} />
    </> : name === "keys" ? <>
      <circle cx={-L / 2 + 8} r={7} fill="none" stroke={paint?.stroke ?? color} strokeWidth={2.2} />
      <path d={`M${-L / 2 + 15} -2.5H${L / 2 - 6}v2.5h-3v3h-4v-3h-3v3h-3v-3H${-L / 2 + 15}Z`} fill={fill} stroke={edge} />
    </> : name === "hex key" ? <path d={`M${-L / 2} -2.5H${L / 2 - 2.5}V-16h5V2.5H${-L / 2}Z`} fill={fill} stroke={edge} />
      : <>
        <rect x={-L / 2} y={-5.5} width={L * 0.6} height={4} rx={2} fill={fill} stroke={edge} transform="rotate(-6)" />
        <rect x={-L / 2} y={1.5} width={L * 0.6} height={4} rx={2} fill={fill} stroke={edge} transform="rotate(6)" />
        <path d={`M${L * 0.1} -4L${L / 2} -1.5V1.5L${L * 0.1} 4Z`} fill={metal} stroke={edge} />
      </>;
    else body = <>
      <rect x={-L / 2} y={-r} width={L} height={2 * r} rx={r} fill={fill} stroke={edge} />
      {!paint && name === "toothbrush" && <rect x={L / 2 - 12} y={-r - 4} width={10} height={4} rx={1} fill="#f6f7f4" />}
      {!paint && name === "usb cable" && <><rect x={-L / 2 - 6} y={-3.5} width={8} height={7} rx={1.5} fill="#e9ebe7" /><rect x={L / 2 - 2} y={-3.5} width={8} height={7} rx={1.5} fill="#e9ebe7" /></>}
    </>;
    return { node: <g transform="translate(0 -14) rotate(26.57)">{grad}{body}</g>, box: { x0: -27, x1: 27, y0: -32, y1: 3 } };
  }
  if (shape === "box" || shape === "flat") {
    const [w, d, h] = (shape === "flat" ? FLAT_DIMS : BOX_DIMS)[name] ?? [34, 26, 24];
    const a = w / 2, b = d / 2;
    const face = (x0: number, x1: number, z0: number, z1: number, fill: string) => <polygon points={pts(iso(x0, b, z0), iso(x1, b, z0), iso(x1, b, z1), iso(x0, b, z1))} fill={fill} stroke="none" />;
    const top = (x0: number, x1: number, y0: number, y1: number, fill: string, k?: number) => <polygon key={k} points={pts(iso(x0, y0, h), iso(x1, y0, h), iso(x1, y1, h), iso(x0, y1, h))} fill={fill} stroke="none" />;
    const extra = <>
      {name === "cardboard box" && top(-2.2, 2.2, -b, b, tone(color, 0.08))}
      {/book|notebook/.test(name) && face(-a + 1, a - 1, 1.2, h - 1.2, "#f3eee2")}
      {name === "shipping label" && [-11, -8, -6.5, -3, -1, 2, 4, 7, 9.5].map((x, i) => top(x, x + (i % 3 ? 1 : 1.8), -b * 0.55, b * 0.55, "#3d4246", i))}
      {name === "keyboard" && Array.from({ length: 18 }, (_, i) => top(-a + 3 + (i % 9) * 4.6, -a + 6 + (i % 9) * 4.6, i < 9 ? -5 : 1, i < 9 ? -1 : 5, "#cdd1cb", i))}
      {name === "towel" && <polyline points={pts(iso(-a, 0, h), iso(a, 0, h))} stroke={tone(color, -0.25)} strokeWidth={0.8} fill="none" />}
      {labelled && face(-a * 0.55, a * 0.55, h * 0.28, h * 0.78, "#fbfaf6")}
      {name === "camera" && <g transform={`matrix(1 0.5 0 1 ${iso(0, b, h / 2)[0]} ${iso(0, b, h / 2)[1]})`}>
        <circle r={7} fill="#25292d" stroke="#6b7480" strokeWidth={0.8} />
        <circle r={4} fill="#3d5a73" /><circle cx={-1.4} cy={-1.4} r={1.2} fill="#fff" opacity={0.6} />
      </g>}
    </>;
    return cuboid(w, d, h, color, paint, extra);
  }
  if (shape === "can") {
    const r = name === "jar" ? 13 : 11, h = name === "jar" ? 26 : 30;
    return {
      node: <>
        {cylinder(r, h, color, gid, paint)}
        {!paint && name === "jar" && <g transform={`translate(0 ${-h + 1})`}>{cylinder(r + 0.6, 5, "#c9a45c", gid + "l")}</g>}
        {!paint && name === "can" && <path d={`M${-r} ${-h * 0.62}V${-h * 0.3}A${r} ${r / 2} 0 0 0 ${r} ${-h * 0.3}V${-h * 0.62}A${r} ${r / 2} 0 0 1 ${-r} ${-h * 0.62}Z`} fill="#c9573f" opacity={0.85} />}
        {!paint && labelled && <path d={`M${-r} ${-h * 0.66}V${-h * 0.3}A${r} ${r / 2} 0 0 0 ${r} ${-h * 0.3}V${-h * 0.66}A${r} ${r / 2} 0 0 1 ${-r} ${-h * 0.66}Z`} fill="#fbfaf6" />}
      </>,
      box: { x0: -r, x1: r, y0: -h - (name === "jar" ? 10 : r / 2), y1: r / 2 },
    };
  }
  if (shape === "bottle") {
    const r = 9.5, h = 26;
    const capColor = name === "soap dispenser" ? "#f4f5f2" : "#3e4348";
    return {
      node: <>
        {cylinder(r, h, color, gid, paint)}
        <g transform={`translate(0 ${-h})`}>{cylinder(3.6, 10, color, gid + "n", paint)}</g>
        <g transform={`translate(0 ${-h - 10})`}>{cylinder(4.2, 4.5, capColor, gid + "c", paint)}</g>
        {!paint && labelled && <path d={`M${-r} ${-h * 0.7}V${-h * 0.32}A${r} ${r / 2} 0 0 0 ${r} ${-h * 0.32}V${-h * 0.7}A${r} ${r / 2} 0 0 1 ${-r} ${-h * 0.7}Z`} fill="#fbfaf6" />}
      </>,
      box: { x0: -r, x1: r, y0: -h - 17, y1: r / 2 },
    };
  }
  if (shape === "glass") {
    const r = 12, h = 36;
    return {
      node: <>
        <path d={`M${-r} ${-h}V0A${r} ${r / 2} 0 0 0 ${r} 0V${-h}Z`} fill={paint?.fill ?? "#fff"} fillOpacity={paint ? 1 : 0.4} stroke={paint?.stroke ?? "#8fa5a8"} strokeOpacity={paint ? 1 : 0.7} strokeWidth={0.8} />
        {!paint && <rect x={-r * 0.62} y={-h + 5} width={2.2} height={h - 10} rx={1.1} fill="#fff" opacity={0.75} />}
        <ellipse cy={-h} rx={r} ry={r / 2} fill="none" stroke={paint?.stroke ?? "#8fa5a8"} strokeWidth={0.9} />
      </>,
      box: { x0: -r, x1: r, y0: -h - r / 2, y1: r / 2 },
    };
  }
  if (shape === "cup") {
    const r = 12, h = 18;
    return {
      node: <>
        <path d={`M${r - 1} ${-h * 0.8}C${r + 10} ${-h * 0.82} ${r + 10} ${-h * 0.18} ${r - 1} ${-h * 0.22}`} fill="none" stroke={paint?.stroke ?? tone(color, -0.12)} strokeWidth={3.4} strokeLinecap="round" />
        {cylinder(r, h, color, gid, paint, true)}
      </>,
      box: { x0: -r, x1: r + 8, y0: -h - r / 2, y1: r / 2 },
    };
  }
  if (shape === "plate" || shape === "ring") {
    const r = shape === "ring" ? 14 : 20;
    if (/bowl/.test(name)) return {
      node: <>
        {!paint && <linearGradient id={gid}><stop offset="0" stopColor={tone(color, -0.1)} /><stop offset=".35" stopColor="#fff" /><stop offset="1" stopColor={tone(color, -0.22)} /></linearGradient>}
        <path d={`M${-r} -13A${r} ${r * 0.72} 0 0 0 ${r} -13Z`} fill={paint?.fill ?? `url(#${gid})`} stroke={edge} />
        <ellipse cy={-13} rx={r} ry={r / 2} fill={paint?.fill ?? tone(color, 0.3)} stroke={edge} />
        {!paint && <ellipse cy={-12.4} rx={r * 0.84} ry={r * 0.4} fill={tone(color, -0.1)} />}
      </>,
      box: { x0: -r, x1: r, y0: -13 - r / 2, y1: 2 },
    };
    return {
      node: <>
        <ellipse rx={r} ry={r / 2} fill={paint?.fill ?? tone(color, -0.22)} stroke={edge} />
        <ellipse cy={-3.5} rx={r} ry={r / 2} fill={paint?.fill ?? tone(color, 0.22)} stroke={edge} />
        {!paint && <ellipse cy={-3.5} rx={r * (shape === "ring" ? 0.42 : 0.66)} ry={r * (shape === "ring" ? 0.21 : 0.33)} fill={shape === "ring" ? "#eef1ec" : color} stroke={tone(color, -0.12)} strokeWidth={0.6} />}
      </>,
      box: { x0: -r, x1: r, y0: -3.5 - r / 2, y1: r / 2 },
    };
  }
  if (shape === "device") {
    if (name === "headphones") return {
      node: <>
        <path d="M-12-8C-14-34 14-34 12-8" fill="none" stroke={paint?.stroke ?? color} strokeWidth={3.4} strokeLinecap="round" />
        <g transform="translate(-12 2)">{cylinder(7, 9, color, gid + "a", paint)}</g>
        <g transform="translate(12 2)">{cylinder(7, 9, color, gid + "b", paint)}</g>
      </>,
      box: { x0: -19, x1: 19, y0: -30, y1: 6 },
    };
    const [w, d] = name === "tablet" ? [32, 40] : name === "smartwatch" ? [14, 16] : [18, 34];
    const a = w / 2 - 1.8, b = d / 2 - 1.8, h = name === "smartwatch" ? 5 : 3;
    return cuboid(w, d, h, color, paint, <>
      <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#4c6378" /><stop offset="1" stopColor="#222b35" /></linearGradient>
      <polygon points={pts(iso(-a, -b, h), iso(a, -b, h), iso(a, b, h), iso(-a, b, h))} fill={`url(#${gid})`} stroke="none" />
      <polygon points={pts(iso(-a, -b, h), iso(-a + w * 0.3, -b, h), iso(-a, -b + d * 0.5, h))} fill="#fff" opacity={0.14} stroke="none" />
    </>);
  }
  if (shape === "laptop") {
    const a = 19, b = 13;
    const base = cuboid(38, 26, 3, color, paint, <polygon points={pts(iso(-a + 3, -b + 3, 3), iso(a - 3, -b + 3, 3), iso(a - 3, 2, 3), iso(-a + 3, 2, 3))} fill={tone(color, -0.12)} stroke="none" />);
    return {
      node: <>
        <polygon points={pts(iso(-a, -b, 3), iso(a, -b, 3), iso(a, -b - 5, 29), iso(-a, -b - 5, 29))} fill={paint?.fill ?? "#30363f"} stroke={edge} />
        {!paint && <>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#56708a" /><stop offset="1" stopColor="#1f2832" /></linearGradient>
          <polygon points={pts(iso(-a + 2, -b, 5), iso(a - 2, -b, 5), iso(a - 2, -b - 4.4, 27), iso(-a + 2, -b - 4.4, 27))} fill={`url(#${gid})`} />
        </>}
        {base.node}
      </>,
      box: { x0: -32, x1: 32, y0: -46, y1: 16 },
    };
  }
  // person
  const skin = paint?.fill ?? "#d9bfa5";
  return {
    node: <g stroke={edge}>
      <rect x={-6} y={-27} width={5.4} height={27} rx={2.7} fill={paint?.fill ?? tone(color, -0.18)} />
      <rect x={0.6} y={-27} width={5.4} height={27} rx={2.7} fill={paint?.fill ?? tone(color, -0.18)} />
      <rect x={-12.5} y={-48} width={4.6} height={22} rx={2.3} fill={paint?.fill ?? tone(color, -0.05)} />
      <rect x={7.9} y={-48} width={4.6} height={22} rx={2.3} fill={paint?.fill ?? tone(color, -0.05)} />
      <rect x={-8} y={-50} width={16} height={26} rx={6} fill={paint?.fill ?? color} />
      <circle cy={-57} r={6.5} fill={skin} />
    </g>,
    box: { x0: -13, x1: 13, y0: -64, y1: 0 },
  };
}

// ── Shared parts ───────────────────────────────────────────────────────────

const GRID = (() => {
  let d = "";
  for (let c = -420; c <= 160; c += 12) d += `M-240 ${c - 120}L560 ${c + 280}`;
  for (let c = -40; c <= 580; c += 12) d += `M-240 ${c + 120}L560 ${c - 280}`;
  return d;
})();

function Shadow({ id, box, className }: { id: string; box: Box; className?: string }) {
  const rx = (box.x1 - box.x0) * 0.52;
  const ry = Math.max(rx * 0.3, box.y1 + 3);
  return <ellipse className={className} cy={box.y1 > 4 ? box.y1 * 0.2 : 1} rx={rx} ry={ry} fill={`url(#${id}-sh)`} />;
}

function placed(look: Look, gid: string, id: string, labelled = false) {
  const d = thing(look, gid, undefined, labelled);
  return { ...d, node: <><Shadow id={id} box={d.box} />{d.node}</> };
}

function pad(b: Box, p: number): Box {
  return { x0: b.x0 - p, y0: b.y0 - p, x1: b.x1 + p, y1: Math.max(b.y1, 0) + p };
}

function Brackets({ b, color = INK }: { b: Box; color?: string }) {
  const c = 6;
  const d = `M${b.x0} ${b.y0 + c}V${b.y0}H${b.x0 + c}M${b.x1 - c} ${b.y0}H${b.x1}V${b.y0 + c}M${b.x1} ${b.y1 - c}V${b.y1}H${b.x1 - c}M${b.x0 + c} ${b.y1}H${b.x0}V${b.y1 - c}`;
  return <path d={d} fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />;
}

function Tag({ x, y, text, color = INK }: { x: number; y: number; text: string; color?: string }) {
  const w = text.length * 4.3 + 11;
  return <g transform={`translate(${x} ${y - 12})`}>
    <rect width={w} height={11.5} rx={3.5} fill={color} />
    <text x={5.5} y={8.2} fontSize={7.6} fontWeight={600} fill="#fff" letterSpacing={0.1}>{text}</text>
  </g>;
}

function Panel({ x, y, w, h, title, value, children }: { x: number; y: number; w: number; h: number; title: string; value: string; children: ReactNode }) {
  return <g transform={`translate(${x} ${y})`}>
    <rect width={w} height={h} rx={8} fill="#fff" fillOpacity={0.82} stroke="#1c1d18" strokeOpacity={0.08} />
    <text x={8} y={12} fontSize={6.6} fill="#7c7e73" letterSpacing={0.2}>{title}</text>
    <text x={w - 8} y={12} fontSize={7.4} fontWeight={600} fill="#1c1d18" textAnchor="end" className="sp-num">{value}</text>
    {children}
  </g>;
}

function Check({ x, y, r = 6.5 }: { x: number; y: number; r?: number }) {
  return <g transform={`translate(${x} ${y})`}>
    <circle r={r} fill={INK} />
    <path d={`M${-r * 0.42} 0l${r * 0.3} ${r * 0.3} ${r * 0.55}-${r * 0.6}`} fill="none" stroke="#fff" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
  </g>;
}

// Per-frame detection confidence shown on the tag; the listing's measured
// benchmark (when there is one) goes in the readout instead.
const confidence = (_offer: Offer, seed: number) => (86 + (seed % 12)) / 100;
const benchmark = (offer: Offer) => offer.quality_source === "measured_benchmark" && offer.quality != null ? `mAP ${offer.quality.toFixed(2)}` : null;

function distractors(look: Look, seed: number): [Look, Look] {
  const pool = DISTRACTORS.map(lookFor).filter((l) => l.shape !== look.shape);
  const first = pool[seed % pool.length];
  const rest = pool.filter((l) => l.shape !== first.shape);
  return [first, rest[(seed >>> 4) % rest.length]];
}

// ── Scenes ─────────────────────────────────────────────────────────────────

function Gripper({ hw, reach, animated }: { hw: number; reach: number; animated: "grasp" | "hold" }) {
  const fx = hw + 8;
  const finger = (side: -1 | 1) => <g className={animated === "grasp" ? `sp sp-finger-${side < 0 ? "l" : "r"}` : `sp sp-squeeze-${side < 0 ? "l" : "r"}`}>
    <rect x={side < 0 ? -fx : fx - 3.6} y={-3} width={3.6} height={reach} rx={1.8} fill="#d7ddd9" stroke="#1c1d18" strokeOpacity={0.22} strokeWidth={0.6} />
    <rect x={side < 0 ? -fx + 2.2 : fx - 3.6} y={reach - 9} width={1.4} height={6} rx={0.7} fill={INK} />
  </g>;
  return <>
    <linearGradient id="sp-rod" x1="0" x2="1"><stop offset="0" stopColor="#c3cbc6" /><stop offset=".35" stopColor="#f2f4f2" /><stop offset="1" stopColor="#aab3ad" /></linearGradient>
    <rect x={-2.2} y={-140} width={4.4} height={127} fill="url(#sp-rod)" />
    <rect x={-6.5} y={-15} width={13} height={8} rx={3} fill="#a3aca6" />
    <rect x={-6.5} y={-11.4} width={13} height={1.4} fill={INK} />
    <rect x={-fx - 1} y={-7} width={2 * fx + 2} height={4} rx={2} fill="#c9d0cb" stroke="#1c1d18" strokeOpacity={0.18} strokeWidth={0.6} />
    {finger(-1)}{finger(1)}
  </>;
}

function detect(s: S, segment: boolean): Scene {
  const { id, look, seed, offer } = s;
  const [la, lb] = distractors(look, seed);
  const raw = placed(look, id + "h", id), a = placed(la, id + "a", id), b = placed(lb, id + "b", id);
  const hk = Math.min(1, 54 / -raw.box.y0);
  const hero = { node: <g transform={`scale(${hk})`}>{raw.node}</g>, box: { x0: raw.box.x0 * hk, x1: raw.box.x1 * hk, y0: raw.box.y0 * hk, y1: raw.box.y1 * hk } };
  const k = 0.72;
  const scaled = (box: Box, x: number, y: number) => pad({ x0: x + box.x0 * k, x1: x + box.x1 * k, y0: y + box.y0 * k, y1: y + Math.max(box.y1, 0) * k }, 3);
  const hb = pad(hero.box, 5);
  const pa = scaled(a.box, 92, 84), pb = scaled(b.box, 228, 84);
  const conf = confidence(offer, seed);
  const metric = benchmark(offer) ?? `${Math.round(conf * 100)}%`;
  const silhouette = (l: Look, gid: string, color: string, delay: number, x: number, y: number, scale = 1) =>
    at(x, y, <g transform={`scale(${scale})`}>
      <g fillOpacity={0.34}>{thing(l, gid, { fill: color, stroke: color }).node}</g>
    </g>, "sp sp-mask", later(delay));
  return {
    node: <>
      {at(92, 84, <g transform={`scale(${k})`}>{a.node}</g>)}
      {at(228, 84, <g transform={`scale(${k})`}>{b.node}</g>)}
      {at(160, 80, hero.node)}
      {segment ? <>
        {silhouette(look, id + "m0", INK, 0, 160, 80, hk)}
        {silhouette(la, id + "m1", AMBER, 0.35, 92, 84, k)}
        {silhouette(lb, id + "m2", BLUE, 0.7, 228, 84, k)}
      </> : <g className="sp-transient" fill="none" stroke={AMBER} strokeWidth={1} strokeDasharray="3 3">
        {[pa, pb, { x0: 128, y0: 40, x1: 186, y1: 92 }].map((r, i) =>
          <rect key={i} className="sp sp-propose" style={later(i * 0.25)} x={r.x0} y={r.y0} width={r.x1 - r.x0} height={r.y1 - r.y0} rx={2} />)}
      </g>}
      <line className="sp sp-sweep sp-transient" x1={0} y1={18} x2={0} y2={104} stroke={INK} strokeOpacity={0.45} strokeWidth={0.8} />
      {at(160, 80, <Brackets b={hb} />, "sp sp-lock")}
      {at(160, 80, <Tag x={hb.x0} y={hb.y0 - 3} text={`${look.name} ${conf.toFixed(2)}`} />, "sp sp-tag")}
    </>,
    readout: segment ? `3 instances · ${metric}` : `${look.name} · ${metric}`,
  };
}

function human(s: S): Scene {
  const { id, seed, offer } = s;
  const body = thing(lookFor("person"), id + "p");
  const conf = confidence(offer, seed);
  const j = { head: [0, -57], neck: [0, -48], ls: [-10, -46], rs: [10, -46], le: [-12, -34], lw: [-11, -22], pelvis: [0, -26], lh: [-4.5, -25], rh: [4.5, -25], lk: [-4.5, -13], rk: [4.5, -13], la: [-4.5, 0], ra: [4.5, 0] } as const;
  const bone = (p: readonly number[], q: readonly number[], k: number) => <line key={k} x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} />;
  const hb = pad({ x0: body.box.x0 * 1.22, x1: body.box.x1 * 1.22, y0: body.box.y0 * 1.22, y1: 0 }, 5);
  return {
    node: <>
      {at(160, 100, <g transform="scale(1.22)"><Shadow id={id} box={body.box} /><g opacity={0.16}>{body.node}</g></g>)}
      {at(160, 100, <g transform="scale(1.22)">
        <g stroke={INK} strokeWidth={1.6} strokeLinecap="round">
          {[[j.head, j.neck], [j.ls, j.rs], [j.neck, j.pelvis], [j.lh, j.rh], [j.ls, j.le], [j.le, j.lw], [j.lh, j.lk], [j.lk, j.la], [j.rh, j.rk], [j.rk, j.ra]].map(([p, q], i) => bone(p, q, i))}
        </g>
        <g transform={`translate(${j.rs[0]} ${j.rs[1]})`}><g className="sp sp-pivot sp-wave">
          <line x1={0} y1={0} x2={4} y2={11} stroke={INK} strokeWidth={1.6} strokeLinecap="round" />
          <g transform="translate(4 11)"><g className="sp sp-pivot sp-wave2">
            <line x1={0} y1={0} x2={-1} y2={12} stroke={INK} strokeWidth={1.6} strokeLinecap="round" />
            <circle cx={-1} cy={12} r={2.1} fill="#fff" stroke={INK} strokeWidth={1.3} />
          </g></g>
          <circle cx={4} cy={11} r={2.1} fill="#fff" stroke={INK} strokeWidth={1.3} />
        </g></g>
        {Object.entries(j).filter(([k]) => k !== "pelvis").map(([k, [x, y]]) => <circle key={k} cx={x} cy={y} r={k === "head" ? 3.2 : 2} fill="#fff" stroke={INK} strokeWidth={1.3} />)}
      </g>)}
      {at(160, 100, <Brackets b={hb} />, "sp sp-lock")}
      {at(212, 100, <Tag x={0} y={-40} text={`person ${conf.toFixed(2)}`} />, "sp sp-tag")}
    </>,
    readout: `17 keypoints · ${benchmark(offer) ?? `${Math.round(conf * 100)}%`}`,
  };
}

function pose(s: S): Scene {
  const { id, look, offer } = s;
  const hero = placed(look, id + "h", id);
  const ghost = thing(look, id + "g", { fill: "none", stroke: INK });
  const cy = (hero.box.y0 + Math.max(hero.box.y1, 0)) / 2;
  const axis = (dx: number, dy: number, color: string, delay: number) => <g>
    <path d={`M0 ${cy}l${dx} ${dy}`} className="sp sp-draw-late" style={later(delay)} pathLength={1} strokeDasharray="1" stroke={color} strokeWidth={1.8} strokeLinecap="round" fill="none" />
    <circle className="sp sp-reveal-late" style={later(delay)} cx={dx} cy={cy + dy} r={2.3} fill={color} />
  </g>;
  const readout = offer.task_type === "orientation_check" ? "upright · 2° tilt" : offer.task_type === "alignment_check" ? "aligned · 0.3 mm" : "6-DoF pose · ±0.5 mm";
  return {
    node: <>
      {at(160, 82, hero.node)}
      {at(160, 82, <g opacity={0.8} strokeDasharray="2.5 2">{ghost.node}</g>, "sp sp-align")}
      {at(160, 82, <>{axis(25, 12.5, "#c8574a", 0)}{axis(-25, 12.5, "#3f8f5f", 0.12)}{axis(0, -30, BLUE, 0.24)}<circle cy={cy} r={2.4} fill="#1c1d18" className="sp sp-reveal-late" /></>)}
    </>,
    readout,
  };
}

function capture(s: S): Scene {
  const { id, look, seed, offer } = s;
  const hero = placed(look, id + "h", id);
  const fb = pad(hero.box, 7);
  const corner = 9;
  return {
    node: <>
      {at(160, 80, hero.node)}
      <path d={`M16 ${14 + corner}V14H${16 + corner}M${304 - corner} 14H304V${14 + corner}M304 ${96 - corner}V96H${304 - corner}M${16 + corner} 96H16V${96 - corner}`} fill="none" stroke="#1c1d18" strokeOpacity={0.3} strokeWidth={1.2} strokeLinecap="round" />
      <g stroke="#1c1d18" strokeOpacity={0.25} strokeWidth={0.8}><path d="M156 55h8M160 51v8" /></g>
      {at(160, 80, <Brackets b={fb} color={AMBER} />, "sp sp-hunt sp-transient")}
      {at(160, 80, <Brackets b={fb} />, "sp sp-focus")}
      <rect className="sp sp-flash sp-transient" x={-200} y={0} width={720} height={110} fill="#fff" />
    </>,
    readout: offer.task_type === "image_quality" ? `sharp · ${(0.86 + (seed % 12) / 100).toFixed(2)}` : "1280 × 720 · RGB-D",
  };
}

const INSPECT: Record<string, [string, boolean]> = {
  bruise_inspection: ["2 bruises found", true], damage_inspection: ["1 dent found", true], surface_inspection: ["2 scratches found", true],
  screen_inspection: ["1 crack found", true], scene_inspection: ["3 objects flagged", true],
  leak_inspection: ["no leaks", false], seal_inspection: ["seal intact", false], tip_inspection: ["tip intact", false],
  battery_inspection: ["no swelling", false], connector_inspection: ["pins aligned", false], contents_inspection: ["3 items inside", false],
};

function material(look: Look) {
  if (/bottle/.test(look.name)) return /glass/.test(look.name) ? "glass" : "PET plastic";
  if (/box|carton|envelope|label|tube/.test(look.name)) return "corrugated board";
  return ({ round: "organic", cluster: "organic", long: "organic", utensil: "stainless steel", tool: "tool steel", can: "aluminium", ring: "zinc steel", cup: "ceramic", glass: "glass", plate: "ceramic", flat: "cotton", device: "aluminium · glass", laptop: "aluminium · glass", person: "—", box: "ABS plastic", bottle: "PET plastic" } as Record<Shape, string>)[look.shape];
}

function inspect(s: S): Scene {
  const { id, look, seed, offer } = s;
  const hero = placed(look, id + "h", id);
  const k = 1.15;
  const b = pad({ x0: hero.box.x0 * k, x1: hero.box.x1 * k, y0: hero.box.y0 * k, y1: Math.max(hero.box.y1, 0) * k }, 6);
  const ripeness = 72 + (seed % 22);
  const [text, found] = offer.task_type === "ripeness_inspection" ? [`ripe · ${ripeness}%`, false]
    : offer.task_type === "material_check" ? [material(look), false]
      : INSPECT[offer.task_type] ?? ["passed", false];
  const marks: [number, number][] = [[0.36, 0.44], [0.64, 0.68]];
  const travel = { "--sp-travel": `${b.y1 - b.y0}px` } as CSSProperties;
  return {
    node: <>
      <defs>
        <clipPath id={`${id}-clip`}><rect x={b.x0} y={b.y0} width={b.x1 - b.x0} height={b.y1 - b.y0} rx={4} /></clipPath>
        <linearGradient id={`${id}-beam`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={INK} stopOpacity={0} /><stop offset=".85" stopColor={INK} stopOpacity={0.28} /><stop offset="1" stopColor={INK} stopOpacity={0} />
        </linearGradient>
      </defs>
      {at(160, 84, <g transform={`scale(${k})`}>{hero.node}</g>)}
      {at(160, 84, <g clipPath={`url(#${id}-clip)`}>
        <g className="sp sp-scan" style={travel}>
          <rect x={b.x0} y={b.y0 - 9} width={b.x1 - b.x0} height={9} fill={`url(#${id}-beam)`} />
          <line x1={b.x0} x2={b.x1} y1={b.y0} y2={b.y0} stroke={INK} strokeWidth={1} />
        </g>
      </g>)}
      {at(160, 84, <path d={`M${b.x0} ${b.y0 + 5}V${b.y0}H${b.x0 + 5}M${b.x1 - 5} ${b.y0}H${b.x1}V${b.y0 + 5}M${b.x1} ${b.y1 - 5}V${b.y1}H${b.x1 - 5}M${b.x0 + 5} ${b.y1}H${b.x0}V${b.y1 - 5}`} fill="none" stroke="#1c1d18" strokeOpacity={0.35} strokeWidth={1.1} strokeLinecap="round" />)}
      {found ? marks.map(([fx, fy], i) => {
        const x = 160 + b.x0 + (b.x1 - b.x0) * fx, y = 84 + b.y0 + (b.y1 - b.y0) * fy;
        return <g key={i} className="sp sp-reveal" style={later(i * 0.5)}>
          <circle cx={x} cy={y} r={2.2} fill={AMBER} />
          <g transform={`translate(${x} ${y})`}><circle className="sp sp-ping" r={4} fill="none" stroke={AMBER} strokeWidth={1.2} /></g>
        </g>;
      }) : <g className="sp sp-badge"><Check x={160 + b.x1 + 2} y={84 + b.y0 + 2} /></g>}
    </>,
    readout: text,
  };
}

function read(s: S): Scene {
  const { id, look, seed, offer } = s;
  const labelled = ["box", "can", "bottle"].includes(look.shape);
  const hero = placed(look, id + "h", id, labelled);
  const expiry = offer.task_type === "expiry_reading";
  const text = expiry ? `EXP ${String((seed % 12) + 1).padStart(2, "0")}/${27 + (seed % 3)}` : `SKU ${4100 + (seed % 900)}-${"ABCDEFG"[seed % 7]}`;
  const card = { x: 196, y: 26, w: 72, h: 40 };
  const travel = { "--sp-travel": `${card.w - 8}px` } as CSSProperties;
  return {
    node: <>
      {at(128, 84, hero.node)}
      <path d={`M${128 + hero.box.x1 - 4} ${84 + hero.box.y0 + 12}L${card.x - 4} ${card.y + card.h / 2}`} stroke={INK} strokeOpacity={0.45} strokeWidth={0.9} strokeDasharray="2 2.5" fill="none" />
      <g transform={`translate(${card.x} ${card.y})`}>
        <rect width={card.w} height={card.h} rx={5} fill="#fff" stroke="#1c1d18" strokeOpacity={0.1} />
        {expiry ? [0, 1, 2].map((i) => <rect key={i} className="sp sp-reveal" style={later(i * 0.3)} x={8} y={9 + i * 9} width={[38, 52, 28][i]} height={4} rx={2} fill={i === 1 ? "#1c1d18" : "#c9cec6"} />)
          : <>
            {Array.from({ length: 16 }, (_, i) => <rect key={i} className="sp sp-reveal" style={later(i * 0.03)} x={8 + i * 3.6} y={9} width={i % 3 ? 1.2 : 2.2} height={16} fill="#1c1d18" />)}
            <rect className="sp sp-reveal" style={later(0.5)} x={8} y={29} width={40} height={4} rx={2} fill="#c9cec6" />
          </>}
        <g className="sp sp-sweepx" style={travel}><rect x={4} y={4} width={2} height={card.h - 8} rx={1} fill={INK} opacity={0.75} /></g>
        <g className="sp sp-lock"><Brackets b={{ x0: -4, y0: -4, x1: card.w + 4, y1: card.h + 4 }} /></g>
      </g>
      {at(0, 0, <Tag x={card.x} y={card.y + card.h + 17} text={text} />, "sp sp-tag")}
    </>,
    readout: text,
  };
}

function measure(s: S): Scene {
  const { id, look, seed } = s;
  const hero = placed(look, id + "h", id);
  const b = hero.box;
  const x = 150, y = 78 - Math.max(b.y1, 0) * 0.9, bottom = Math.max(b.y1, 0) + 9, right = b.x1 + 11;
  const wmm = Math.round((b.x1 - b.x0) * 2.2 + (seed % 9)), hmm = Math.round(-b.y0 * 2.2 + (seed % 7));
  const dim = (d: string, delay: number) => <path className="sp sp-draw" style={later(delay)} d={d} pathLength={1} strokeDasharray="1" fill="none" stroke={INK} strokeWidth={1.1} strokeLinecap="round" />;
  return {
    node: <>
      {at(x, y, hero.node)}
      {at(x, y, <>
        <g stroke="#1c1d18" strokeOpacity={0.22} strokeWidth={0.7} strokeDasharray="2 2">
          <path d={`M${b.x0} ${b.y1 > 4 ? 0 : -2}V${bottom + 3}M${b.x1} ${b.y1 > 4 ? 0 : -2}V${bottom + 3}M${b.x1 + 2} ${b.y0}H${right + 3}M${b.x1 + 2} ${Math.max(b.y1, 0)}H${right + 3}`} />
        </g>
        {dim(`M${b.x0} ${bottom}H${b.x1}M${b.x0} ${bottom - 3}v6M${b.x1} ${bottom - 3}v6`, 0)}
        {dim(`M${right} ${b.y0}V${Math.max(b.y1, 0)}M${right - 3} ${b.y0}h6M${right - 3} ${Math.max(b.y1, 0)}h6`, 0.3)}
        <g className="sp sp-reveal" style={later(0.5)} fontSize={7.2} fontWeight={600} fill={INK}>
          <text x={(b.x0 + b.x1) / 2} y={bottom + 10} textAnchor="middle">{wmm} mm</text>
          <text x={right + 5} y={(b.y0 + Math.max(b.y1, 0)) / 2 + 2.5}>{hmm} mm</text>
        </g>
      </>)}
    </>,
    readout: `${wmm} × ${hmm} mm`,
  };
}

function verify(s: S): Scene {
  const { id, look, offer } = s;
  const hero = placed(look, id + "h", id);
  const report = offer.task_type === "inspection_report";
  const rows = report ? ["Surface", "Fit", "Labels"] : ["Picked", "Placed", "Released"];
  return {
    node: <>
      {at(116, 84, hero.node)}
      <Panel x={204} y={18} w={100} h={74} title={report ? "Report" : "Checklist"} value={report ? "4 findings" : "3 / 3"}>
        {rows.map((row, i) => <g key={row} transform={`translate(8 ${26 + i * 15})`}>
          <rect width={9} height={9} rx={2.5} fill="#fff" stroke="#1c1d18" strokeOpacity={0.2} />
          <path className="sp sp-draw" style={later(i * 0.35)} d="M2 4.8l2 2 3.2-3.8" pathLength={1} strokeDasharray="1" fill="none" stroke={INK} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
          <text x={15} y={7.4} fontSize={7} fill="#1c1d18">{row}</text>
          {report && <rect className="sp sp-fill" style={later(i * 0.35)} x={50} y={2.5} width={[26, 18, 22][i]} height={4} rx={2} fill={INK} opacity={0.35} />}
        </g>)}
      </Panel>
      <g className="sp sp-badge" style={later(0.8)}><Check x={116 + hero.box.x1 + 2} y={84 + hero.box.y0 + 2} /></g>
    </>,
    readout: report ? "report · 4 findings" : "3 / 3 checks passed",
  };
}

function grasp(s: S): Scene {
  const { id, look, seed, offer } = s;
  const hero = thing(look, id + "h");
  const hw = Math.max(-hero.box.x0, hero.box.x1);
  const reach = -hero.box.y0 * 0.62 + 6;
  const top = hero.box.y0 - 6;
  const verifying = offer.task_type === "grasp_verification";
  const force = (2 + (seed % 40) / 10).toFixed(1);
  return {
    node: <>
      {at(160, 86, <Shadow id={id} box={hero.box} className="sp sp-lift-shadow" />)}
      {at(160, 86, hero.node, "sp sp-lift")}
      {at(160, 86 + top, <Gripper hw={hw} reach={reach} animated="grasp" />, "sp sp-descend")}
      {at(160, 86 + top, <g className="sp sp-descend"><g className="sp sp-contact">
        <circle cx={-hw - 1} cy={reach - 6} r={1.8} fill={INK} /><circle cx={hw + 1} cy={reach - 6} r={1.8} fill={INK} />
      </g></g>)}
      {verifying && <g className="sp sp-badge"><Check x={160 + hw + 18} y={86 + top + 4} /></g>}
    </>,
    readout: verifying ? "grip verified · no slip" : `${offer.grippers.includes("parallel_jaw") ? "2-finger" : "suction"} · ${force} N`,
  };
}

function control(s: S): Scene {
  const { id, look, seed, offer, begin } = s;
  const hero = thing(look, id + "h");
  const hw = Math.max(-hero.box.x0, hero.box.x1);
  const soft = /soft|feather|gentle|force limit/i.test(offer.id + offer.name);
  const limit = soft ? (0.6 + (seed % 8) / 10).toFixed(1) : (2.5 + (seed % 30) / 10).toFixed(1);
  const curve = soft ? "M0 50C18 50 24 46 32 36S50 21 76 20" : "M0 50H14Q20 50 25 36L31 22Q35 17 43 17H76";
  return {
    node: <>
      {at(118, 86, <><Shadow id={id} box={hero.box} />{hero.node}</>)}
      {at(118, 86 + hero.box.y0 - 6, <Gripper hw={hw} reach={-hero.box.y0 * 0.62 + 6} animated="hold" />)}
      <Panel x={204} y={18} w={100} h={74} title="Grip force" value={`${limit} N`}>
        <g transform="translate(12 16)">
          <path d="M0 50H76" stroke="#1c1d18" strokeOpacity={0.15} />
          <path d={`M0 ${soft ? 19 : 16}H76`} stroke={AMBER} strokeWidth={1} strokeDasharray="3 3" />
          <path className="sp sp-reveal" d={`${curve}V50H0Z`} fill={INK} opacity={0.08} />
          <path id={`${id}-curve`} className="sp sp-draw" d={curve} pathLength={1} strokeDasharray="1" fill="none" stroke={INK} strokeWidth={1.8} strokeLinecap="round" />
          <circle r={2.6} fill="#fff" stroke={INK} strokeWidth={1.5}>
            <animateMotion dur="6s" begin={begin} repeatCount="indefinite" keyPoints="0;1;1" keyTimes="0;.45;1" calcMode="linear"><mpath href={`#${id}-curve`} /></animateMotion>
          </circle>
        </g>
      </Panel>
    </>,
    readout: `${soft ? "compliant" : "stiff"} · ${limit} N limit`,
  };
}

function place(s: S): Scene {
  const { id, look, offer } = s;
  const hero = thing(look, id + "h");
  const planning = offer.task_type === "placement_planning";
  const r = Math.max(-hero.box.x0, hero.box.x1) + 6;
  const footprint = (x: number, y: number) => pts([x - r, y], [x, y + r / 2], [x + r, y], [x, y - r / 2]);
  return {
    node: <>
      <path d="M110 58Q162 26 214 58" fill="none" stroke={INK} strokeOpacity={0.3} strokeDasharray="2 3" />
      {planning && [[178, 100], [250, 70]].map(([x, y], i) => <polygon key={i} className="sp sp-candidate" style={later(i * 0.2)} points={footprint(x, y)} fill="none" stroke={AMBER} strokeWidth={1} strokeDasharray="3 2.5" />)}
      <polygon points={footprint(214, 84)} fill={INK} fillOpacity={0.06} stroke={INK} strokeWidth={1.1} strokeDasharray="3 2.5" />
      {at(214, 84, <polygon points={footprint(0, 0)} fill="none" stroke={INK} strokeWidth={1.2} />, "sp sp-land")}
      {at(110, 84, <Shadow id={id} box={hero.box} />, "sp sp-carry-shadow")}
      {at(110, 84, hero.node, "sp sp-carry")}
    </>,
    readout: planning ? "3 spots scored · best 0.94" : "placed · ±2 mm",
  };
}

function reach(s: S): Scene {
  const { id, look, seed } = s;
  const hero = placed(look, id + "h", id);
  const metres = (0.32 + (seed % 20) / 100).toFixed(2);
  return {
    node: <>
      <ellipse cx={70} cy={88} rx={128} ry={42} fill={INK} fillOpacity={0.05} stroke={INK} strokeOpacity={0.4} strokeDasharray="3 3" />
      {at(182, 84, hero.node)}
      <g transform="translate(70 92)">{cylinder(12, 9, "#5b625e", id + "base")}</g>
      <g transform="translate(70 79)"><g className="sp sp-pivot sp-shoulder"><g transform="rotate(-36)">
        <rect x={0} y={-4.5} width={52} height={9} rx={4.5} fill="#dfe4e0" stroke="#1c1d18" strokeOpacity={0.12} />
        <g transform="translate(52 0)"><g className="sp sp-pivot sp-elbow"><g transform="rotate(41)">
          <rect x={0} y={-3.5} width={56} height={7} rx={3.5} fill="#eef1ee" stroke="#1c1d18" strokeOpacity={0.12} />
          <rect x={52} y={-6} width={7} height={12} rx={2} fill="#4b524e" />
        </g></g><circle r={5.5} fill="#4b524e" /><circle r={2} fill="#dfe4e0" /></g>
      </g></g><circle r={6.5} fill="#4b524e" /><circle r={2.4} fill="#dfe4e0" /></g>
      <g className="sp sp-badge"><Check x={182 + hero.box.x1 + 4} y={84 + hero.box.y0 + 2} /></g>
    </>,
    readout: `in reach · ${metres} m`,
  };
}

function collision(s: S): Scene {
  const { id, look, seed } = s;
  const hero = placed(look, id + "h", id);
  const [other] = distractors(look, seed);
  const obstacle = placed(other, id + "o", id);
  const gap = 12 + (seed % 14);
  const left = 146 + hero.box.x1 + 4, right = 236 + obstacle.box.x0 * 0.8 - 4;
  return {
    node: <>
      {at(236, 82, <g transform="scale(.8)" opacity={0.85}>{obstacle.node}</g>)}
      {at(146, 82, <ellipse rx={hero.box.x1 - hero.box.x0} ry={(hero.box.x1 - hero.box.x0) / 2} fill={INK} fillOpacity={0.05} stroke={INK} strokeOpacity={0.45} strokeDasharray="3 3" />)}
      {[0, 1, 2].map((i) => <g key={i}>{at(146, 82, <ellipse rx={hero.box.x1 - hero.box.x0} ry={(hero.box.x1 - hero.box.x0) / 2} fill="none" stroke={INK} strokeWidth={1} />, "sp sp-ripple", later(i))}</g>)}
      {at(146, 82, hero.node)}
      <g stroke={INK} strokeWidth={1} strokeLinecap="round">
        <path d={`M${left} 100H${right}M${left} 97v6M${right} 97v6`} />
      </g>
      <text x={(left + right) / 2} y={96} textAnchor="middle" fontSize={7.2} fontWeight={600} fill={INK}>{gap} mm</text>
    </>,
    readout: `clear · ${gap} mm margin`,
  };
}

const ROUTE = "M62 70L104 91Q110 94 116 91L154 72Q160 69 166 72L198 88Q204 91 210 88L256 65";

function Obstacle({ x, y, id }: { x: number; y: number; id: string }) {
  return at(x, y, <><Shadow id={id} box={{ x0: -18, x1: 18, y0: -20, y1: 9 }} />{cuboid(18, 18, 14, "#dfe3dc").node}</>);
}

function path(s: S): Scene {
  const { id, seed, begin } = s;
  return {
    node: <>
      <Obstacle x={110} y={66} id={id} /><Obstacle x={204} y={64} id={id} />
      <path d={ROUTE} fill="none" stroke={INK} strokeOpacity={0.25} strokeWidth={1.4} strokeDasharray="2 3" />
      <path id={`${id}-route`} className="sp sp-trace" d={ROUTE} pathLength={1} strokeDasharray="1" fill="none" stroke={INK} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
      <Obstacle x={160} y={96} id={id} />
      <circle cx={62} cy={70} r={2.6} fill={INK} />
      <g transform="translate(256 65)">
        <ellipse rx={8} ry={4} fill="none" stroke={INK} strokeWidth={1.4} />
        <ellipse className="sp sp-ping" rx={8} ry={4} fill="none" stroke={INK} strokeWidth={1} />
      </g>
      <g className="sp sp-fadeloop">
        <g>
          <animateMotion dur="8s" begin={begin} repeatCount="indefinite" keyPoints="0;1;1" keyTimes="0;.7;1" calcMode="linear"><mpath href={`#${id}-route`} /></animateMotion>
          <ellipse cy={3} rx={9} ry={4} fill="#1c1d18" opacity={0.14} />
          {cylinder(7, 5, INK, id + "puck")}
          <circle cy={-5} r={1.6} fill="#fff" />
        </g>
      </g>
    </>,
    readout: `route ${(2.6 + (seed % 14) / 10).toFixed(1)} m · 3 turns`,
  };
}

function map(s: S): Scene {
  const { id, seed } = s;
  const dots = Array.from({ length: 46 }, (_, i) => {
    const h = hash(id + i);
    const angle = (i / 46) * 360 + (h % 7);
    const radius = 40 + (h % 52);
    return { angle, radius };
  });
  return {
    node: <>
      <defs><radialGradient id={`${id}-wedge`} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="scale(96)">
        <stop offset="0" stopColor={INK} stopOpacity={0.35} /><stop offset="1" stopColor={INK} stopOpacity={0} />
      </radialGradient></defs>
      <Obstacle x={92} y={64} id={id} /><Obstacle x={226} y={68} id={id} />
      <g transform="translate(150 84) scale(1 .5)">
        <g className="sp sp-pivot sp-spin"><path d="M0 0L94-26A97 97 0 0 1 94 26Z" fill={`url(#${id}-wedge)`} /></g>
        {dots.map(({ angle, radius }, i) => <circle key={i} className="sp sp-blink" style={{ animationDelay: `calc(var(--sp-delay, 0s) + ${(angle / 360) * 4 - 4}s)` }}
          cx={Math.cos((angle * Math.PI) / 180) * radius} cy={Math.sin((angle * Math.PI) / 180) * radius} r={1.3} fill={INK} />)}
      </g>
      <Obstacle x={196} y={100} id={id} />
      <g transform="translate(150 86)"><ellipse cy={3} rx={9} ry={4} fill="#1c1d18" opacity={0.14} />{cylinder(7, 5, INK, id + "puck")}<circle cy={-5} r={1.6} fill="#fff" /></g>
    </>,
    readout: `${(1.8 + (seed % 12) / 10).toFixed(1)}k points mapped`,
  };
}

// Object-focused scenes sit a little closer; scenes with side panels or
// edge-to-edge framing stay at 1:1 so nothing clips.
const ZOOM: Partial<Record<Family, number>> = { inspect: 1.12, grasp: 1.12, measure: 1.15, pose: 1.2, collision: 1.08, place: 1.05 };

const SCENES: Record<Family, (s: S) => Scene> = {
  detect: (s) => detect(s, false), segment: (s) => detect(s, true), human, pose, capture,
  inspect, read, measure, verify, grasp, control, place, path, map, reach, collision,
};

export function SkillPreview({ offer }: { offer: Offer }) {
  const id = "sp" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const family = familyOf(offer.task_type);
  const seed = hash(offer.id);
  const subject = offer.supported_objects[0] || (family === "human" ? "person" : family === "detect" || family === "segment" ? "cup" : "cardboard box");
  const delay = -((seed % 6000) / 1000);
  const scene = SCENES[family]({ id, offer, look: lookFor(subject), seed, begin: `${delay}s` });
  return <div className={"skill-preview skill-preview-" + family} style={{ "--sp-delay": `${delay}s` } as CSSProperties} role="img" aria-label={`${offer.name}: ${scene.readout}`}>
    <svg className="skill-diagram" viewBox="0 0 320 110" aria-hidden="true">
      <defs>
        <radialGradient id={`${id}-sh`}><stop offset="0" stopColor="#1c1d18" stopOpacity={0.24} /><stop offset=".55" stopColor="#1c1d18" stopOpacity={0.09} /><stop offset="1" stopColor="#1c1d18" stopOpacity={0} /></radialGradient>
        <radialGradient id={`${id}-fade`} cx="50%" cy="76%" r="62%"><stop offset="0" stopColor="#fff" /><stop offset=".55" stopColor="#fff" stopOpacity={0.55} /><stop offset="1" stopColor="#fff" stopOpacity={0} /></radialGradient>
        <mask id={`${id}-grid`}><rect x={-240} width={800} height={110} fill={`url(#${id}-fade)`} /></mask>
      </defs>
      <path d={GRID} mask={`url(#${id}-grid)`} stroke="#1c1d18" strokeOpacity={0.08} strokeWidth={0.6} fill="none" />
      <g transform={`translate(160 68) scale(${ZOOM[family] ?? 1}) translate(-160 -68)`}>{scene.node}</g>
    </svg>
    <span className="sp-chip"><i />{scene.readout}</span>
  </div>;
}
