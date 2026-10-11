import { lazy, Suspense } from "react";
import type { Offer } from "../lib/types";

const GraspPreview3D = lazy(() => import("./GraspPreview3D"));

const captions: Record<string, string> = {
  ssdlite: "IMAGE → BOX + CLASS",
  fasterrcnn: "PROPOSE → REFINE",
  owlvit: "TEXT QUERY → LOCALIZE",
  astar: "GRID → COLLISION-FREE ROUTE",
  scene_summary: "OBSERVATION → SUMMARY",
  power_grasp: "WHOLE-OBJECT CONTACT",
  precision_grasp: "FINGERTIP CONTACT",
  standard_control: "FORCE + MOTION POLICY",
  soft_control: "GENTLE FORCE POLICY",
};

function SampleObjects() {
  return (
    <>
      <rect x="26" y="42" width="248" height="104" rx="10" fill="#1b2c2b" stroke="#466658" strokeWidth=".8" />
      <path d="M26 119H274M83 42V146M207 42V146" stroke="#49645a" strokeOpacity=".4" strokeWidth=".7" />
      <ellipse cx="86" cy="122" rx="41" ry="7" fill="#0a1517" opacity=".5" />
      <rect x="57" y="73" width="57" height="44" rx="4" fill="#c8a877" />
      <path d="M57 83H114M71 73V117M101 73V117" stroke="#826d50" strokeOpacity=".75" strokeWidth="1.5" />
      <ellipse cx="195" cy="125" rx="31" ry="6" fill="#0a1517" opacity=".5" />
      <path d="M178 76H213L209 119Q195 125 182 119Z" fill="#d5e6d9" />
      <ellipse cx="195" cy="76" rx="17.5" ry="4" fill="#9cb6a8" />
      <ellipse cx="195" cy="77" rx="13" ry="2.4" fill="#172727" />
      <path d="M212 86Q229 84 227 97Q225 107 212 105" fill="none" stroke="#d5e6d9" strokeWidth="5" />
      <path d="M43 55h17M43 55v11M257 55h-17M257 55v11M43 134h17M43 134v-11M257 134h-17M257 134v-11" stroke="#8cae96" strokeOpacity=".46" strokeWidth="1.2" />
    </>
  );
}

function CornerBox({ x, y, width, height, color = "#9cf2b8", className = "" }: {
  x: number; y: number; width: number; height: number; color?: string; className?: string;
}) {
  const c = 8;
  return (
    <path
      className={className}
      d={`M${x + c} ${y}H${x}V${y + c}M${x + width - c} ${y}H${x + width}V${y + c}M${x} ${y + height - c}V${y + height}H${x + c}M${x + width - c} ${y + height}H${x + width}V${y + height - c}`}
      fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"
    />
  );
}

function DetectorDiagram({ id }: { id: string }) {
  const proposals = id === "fasterrcnn";
  return (
    <svg className="skill-diagram" viewBox="0 0 300 180" aria-hidden="true">
      <SampleObjects />
      {proposals && (
        <g className="preview-proposals" stroke="#e2ba80" strokeWidth="1" fill="none" strokeDasharray="3 3">
          <rect x="43" y="65" width="86" height="64" rx="3" />
          <rect x="165" y="69" width="69" height="62" rx="3" />
          <rect x="174" y="82" width="43" height="43" rx="3" />
        </g>
      )}
      <CornerBox x={174} y={70} width={51} height={55} className="preview-detection-lock" />
      {!proposals && <CornerBox x={52} y={69} width={68} height={54} color="#e6bd84" className="preview-detection-lock preview-delay" />}
      <g className="preview-detection-label">
        <rect x="174" y="56" width="49" height="14" rx="3" fill="#9cf2b8" />
        <text x="181" y="66" fill="#123024" fontSize="8" fontWeight="700" fontFamily="sans-serif">CUP</text>
      </g>
      {!proposals && <g><rect x="52" y="55" width="48" height="14" rx="3" fill="#e6bd84" /><text x="59" y="65" fill="#302519" fontSize="8" fontWeight="700" fontFamily="sans-serif">BOX</text></g>}
      <path className="preview-scan-line" d="M33 44V143" stroke="#9cf2b8" strokeWidth="1.2" strokeOpacity=".7" />
      <text x="35" y="136" fill="#a9c5b6" fontSize="8" letterSpacing="1.2" fontFamily="monospace">{proposals ? "TWO-STAGE DETECTOR" : "IMAGE DETECTOR"}</text>
    </svg>
  );
}

function VocabularyDiagram() {
  return (
    <svg className="skill-diagram" viewBox="0 0 300 180" aria-hidden="true">
      <rect x="25" y="45" width="250" height="96" rx="10" fill="#1b2c2b" stroke="#466658" strokeWidth=".8" />
      <rect x="38" y="58" width="138" height="32" rx="6" fill="#263c37" stroke="#719981" strokeWidth=".8" />
      <text x="49" y="70" fill="#81aa91" fontSize="7" letterSpacing="1" fontFamily="monospace">TEXT PROMPT</text>
      <text x="49" y="82" fill="#e3efe2" fontSize="10" fontFamily="sans-serif">“a ceramic cup”</text>
      <path d="M177 75H195m-5-4 5 4-5 4" fill="none" stroke="#9cf2b8" strokeWidth="1.4" />
      <ellipse cx="228" cy="121" rx="29" ry="5" fill="#0a1517" opacity=".5" />
      <path d="M212 77H244L241 117Q228 123 215 117Z" fill="#d6e8db" />
      <ellipse cx="228" cy="77" rx="16" ry="4" fill="#9bb6a7" />
      <ellipse cx="228" cy="78" rx="12" ry="2.2" fill="#172727" />
      <path d="M243 87Q258 86 256 97Q255 105 243 104" fill="none" stroke="#d6e8db" strokeWidth="4.5" />
      <CornerBox x={205} y={69} width={53} height={58} className="preview-detection-lock" />
      <g className="preview-detection-label"><rect x="205" y="54" width="53" height="15" rx="3" fill="#9cf2b8" /><text x="212" y="65" fill="#123024" fontSize="8" fontWeight="700" fontFamily="sans-serif">MATCH</text></g>
      <path className="preview-vocab-link" d="M168 96Q183 128 204 111" fill="none" stroke="#9cf2b8" strokeWidth="1" strokeDasharray="3 3" />
      <text x="39" y="122" fill="#9eb8aa" fontSize="8" fontFamily="monospace">QUERY-DRIVEN SEARCH</text>
    </svg>
  );
}

const blocked = new Set(["2,1", "3,1", "3,2", "6,3", "8,2", "8,3"]);
function RouteDiagram() {
  return (
    <svg className="skill-diagram" viewBox="0 0 300 180" aria-hidden="true">
      <rect x="24" y="41" width="252" height="107" rx="10" fill="#1b2c2b" stroke="#466658" strokeWidth=".8" />
      {Array.from({ length: 55 }, (_, index) => {
        const col = index % 11;
        const row = Math.floor(index / 11);
        const obstacle = blocked.has(`${col},${row}`);
        return <rect key={index} x={36 + col * 21} y={46 + row * 20} width="19" height="18" rx="2" fill={obstacle ? "#536f65" : "#263c37"} stroke={obstacle ? "#84a994" : "#36574a"} strokeWidth=".6" />;
      })}
      <polyline className="preview-route-line" points="45,134 66,134 87,134 108,134 108,114 129,114 150,114 150,94 150,74 171,74 192,74 192,54 213,54 234,54 255,54" fill="none" stroke="#a4f3bb" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="45" cy="134" r="5" fill="#e9b476" stroke="#1b2c2b" strokeWidth="2" />
      <circle cx="255" cy="54" r="6" fill="#a4f3bb" stroke="#1b2c2b" strokeWidth="2" />
      <text x="34" y="161" fill="#b8d2bd" fontSize="8" fontFamily="monospace">START</text>
      <text x="239" y="161" fill="#b8d2bd" fontSize="8" fontFamily="monospace">GOAL</text>
      <text x="159" y="137" fill="#9ab8a7" fontSize="7" fontFamily="monospace">OBSTACLES</text>
    </svg>
  );
}

function InspectionDiagram() {
  return (
    <svg className="skill-diagram" viewBox="0 0 300 180" aria-hidden="true">
      <rect x="24" y="41" width="135" height="108" rx="9" fill="#1b2c2b" stroke="#466658" strokeWidth=".8" />
      <path d="M24 68H159M24 95H159M24 122H159M51 41V149M78 41V149M105 41V149M132 41V149" stroke="#4a675b" strokeOpacity=".44" strokeWidth=".7" />
      <circle cx="82" cy="105" r="25" fill="none" stroke="#91cba2" strokeOpacity=".65" strokeWidth="1" strokeDasharray="3 3" />
      <circle cx="82" cy="105" r="7" fill="#cbded0" />
      <path d="M82 98v-8M76 111l-6 6M88 111l6 6" stroke="#cbded0" strokeWidth="2" strokeLinecap="round" />
      <circle className="preview-agent-dot" cx="123" cy="65" r="5" fill="#e3ad70" />
      <circle className="preview-agent-dot preview-delay" cx="51" cy="77" r="5" fill="#e3ad70" />
      <rect x="120" y="113" width="24" height="9" rx="2" fill="#648172" />
      <path className="preview-inspection-sweep" d="M82 105L126 54" stroke="#a5f1b8" strokeWidth="1.5" />
      <text x="174" y="55" fill="#87a997" fontSize="8" letterSpacing="1" fontFamily="monospace">SCENE SIGNALS</text>
      <g fontFamily="sans-serif" fontSize="10" fill="#d8e9d9">
        <text x="174" y="76">Nearby agents</text>
        <text x="174" y="104">Person detections</text>
        <text x="174" y="132">Obstacle clearance</text>
      </g>
      <g stroke="#8ac69c" strokeWidth="2"><path d="M174 82H261M174 110H253M174 138H267" /></g>
    </svg>
  );
}

function ControlDiagram({ soft }: { soft: boolean }) {
  return (
    <svg className="skill-diagram" viewBox="0 0 300 180" aria-hidden="true">
      <rect x="23" y="42" width="254" height="106" rx="9" fill="#1b2c2b" stroke="#466658" strokeWidth=".8" />
      <path d="M43 59V129H265M43 77H265M43 99H265" fill="none" stroke="#48695a" strokeOpacity=".7" strokeWidth="1" />
      <path d="M43 66H265" fill="none" stroke="#e7ad73" strokeWidth="1" strokeDasharray="4 4" />
      <text x="192" y="60" fill="#d8ad7c" fontSize="7" fontFamily="monospace">SAFETY LIMIT</text>
      <path d={soft ? "M44 127C76 127 83 118 105 111S151 100 181 100H260" : "M44 127H76L105 91Q120 82 154 82H260"} fill="none" stroke="#9cf2b8" strokeWidth="3" strokeLinecap="round" className="preview-force-line" />
      <circle cx={soft ? "181" : "154"} cy={soft ? "100" : "82"} r="5" fill="#9cf2b8" className="preview-force-point" />
      <text x="43" y="157" fill="#b8d3bf" fontSize="8" fontFamily="monospace">{soft ? "LOWER FLOOR · SLOWER MOTION" : "STANDARD FLOOR · FASTER MOTION"}</text>
      <text x="48" y="75" fill="#88a698" fontSize="7" fontFamily="monospace">FORCE</text>
      <text x="240" y="140" fill="#88a698" fontSize="7" fontFamily="monospace">TIME</text>
    </svg>
  );
}

function GenericDiagram() {
  return (
    <svg className="skill-diagram" viewBox="0 0 300 180" aria-hidden="true">
      <rect x="32" y="55" width="62" height="68" rx="8" fill="#263c37" stroke="#87b89a" />
      <rect x="119" y="55" width="62" height="68" rx="8" fill="#263c37" stroke="#87b89a" />
      <rect x="206" y="55" width="62" height="68" rx="8" fill="#263c37" stroke="#87b89a" />
      <path d="M94 89h25m62 0h25" stroke="#9cf2b8" strokeWidth="2" />
      <text x="48" y="93" fill="#d5e8d9" fontSize="10" fontFamily="monospace">IN</text>
      <text x="131" y="93" fill="#d5e8d9" fontSize="10" fontFamily="monospace">SKILL</text>
      <text x="219" y="93" fill="#d5e8d9" fontSize="10" fontFamily="monospace">OUT</text>
    </svg>
  );
}

export function SkillPreview({ offer }: { offer: Offer }) {
  const grasp = offer.task_type === "grasp";
  return (
    <div className={`skill-preview skill-preview-${offer.task_type}`} role="img" aria-label={`${offer.name} illustrative skill preview`}>
      {grasp ? (
        <Suspense fallback={<div className="skill-preview-grasp-loading" />}>
          <GraspPreview3D precision={offer.id === "precision_grasp"} />
        </Suspense>
      ) : offer.id === "owlvit" ? <VocabularyDiagram />
        : offer.id === "ssdlite" || offer.id === "fasterrcnn" ? <DetectorDiagram id={offer.id} />
          : offer.id === "astar" ? <RouteDiagram />
            : offer.id === "scene_summary" ? <InspectionDiagram />
              : offer.task_type === "control" ? <ControlDiagram soft={offer.id === "soft_control"} />
                : <GenericDiagram />}
      <div className="skill-preview-top" aria-hidden="true"><span><i /> {grasp ? "PHYSICAL STUDY" : "CONCEPT STUDY"}</span><span>{offer.id.toUpperCase().replaceAll("_", " ")}</span></div>
      <div className="skill-preview-bottom" aria-hidden="true"><span>{captions[offer.id] || offer.task_type.replaceAll("_", " ").toUpperCase()}</span><span>↗</span></div>
    </div>
  );
}
