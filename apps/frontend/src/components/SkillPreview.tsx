import { lazy, Suspense } from "react";
import type { Offer } from "../lib/types";

const GraspPreview3D = lazy(() => import("./GraspPreview3D"));
const SpatialPreview3D = lazy(() => import("./SpatialPreview3D"));
const ink = "#426f55";
const pale = "#e5eee5";
const warm = "#d6ac81";

function CornerBox({ x, y, width, height, color = ink }: {
  x: number; y: number; width: number; height: number; color?: string;
}) {
  const c = 10;
  const d = [
    "M", x + c, " ", y, "H", x, "V", y + c,
    "M", x + width - c, " ", y, "H", x + width, "V", y + c,
    "M", x, " ", y + height - c, "V", y + height, "H", x + c,
    "M", x + width - c, " ", y + height, "H", x + width, "V", y + height - c,
  ].join("");
  return <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />;
}

function Objects({ muted = false }: { muted?: boolean }) {
  return <g opacity={muted ? 0.35 : 1}>
    <ellipse cx="89" cy="137" rx="36" ry="6" fill="#d8dfd4" />
    <path d="M59 83l30-13 31 13-30 14Z" fill="#e6c9a5" stroke="#b9946a" strokeWidth="1.4" />
    <path d="M59 83l31 14v36l-31-14Z" fill="#d8b38a" stroke="#b9946a" strokeWidth="1.4" />
    <path d="M90 97l30-14v36l-30 14Z" fill="#efdab8" stroke="#b9946a" strokeWidth="1.4" />
    <path d="M78 76l30 14" stroke="#f8ede0" strokeWidth="3" />
    <ellipse cx="211" cy="138" rx="32" ry="5" fill="#d8dfd4" />
    <path d="M190 82h39l-4 43q-15 12-31 0Z" fill="#f9faf5" stroke="#aebeb0" strokeWidth="1.5" />
    <ellipse cx="209.5" cy="82" rx="19.5" ry="5" fill="#e3ebe1" stroke="#aebeb0" strokeWidth="1.5" />
    <ellipse cx="209.5" cy="82" rx="14" ry="2.6" fill="#a8b8a9" />
    <path d="M229 91q19-3 17 12-2 13-19 10" fill="none" stroke="#aebeb0" strokeWidth="5" />
  </g>;
}

function SceneBase() {
  return <>
    <ellipse cx="150" cy="138" rx="120" ry="18" fill="#ecf0e9" />
    <path d="M31 143h238M31 53h238M31 53v90M269 53v90" stroke="#e2e9de" strokeWidth="1" fill="none" />
  </>;
}

function DetectorDiagram({ proposals }: { proposals: boolean }) {
  return <svg className="skill-diagram" viewBox="0 0 300 180" aria-hidden="true">
    <SceneBase /><Objects />
    {proposals && <g className="preview-proposals" fill="none" stroke={warm} strokeWidth="1.2" strokeDasharray="4 4">
      <rect x="47" y="65" width="82" height="76" rx="3" />
      <rect x="182" y="69" width="61" height="69" rx="3" />
      <rect x="196" y="80" width="47" height="53" rx="3" />
    </g>}
    <g className="preview-focus"><CornerBox x={181} y={70} width={65} height={69} />
      {!proposals && <CornerBox x={52} y={69} width={75} height={70} color={warm} />}
    </g>
    <circle cx="256" cy="60" r="3" fill={ink} />
  </svg>;
}

function VocabularyDiagram() {
  return <svg className="skill-diagram" viewBox="0 0 300 180" aria-hidden="true">
    <SceneBase />
    <g className="preview-vocab-query">
      <rect x="30" y="42" width="128" height="33" rx="16.5" fill="#fffefa" stroke="#cbdccc" strokeWidth="1.4" />
      <circle cx="50" cy="57" r="6" fill="none" stroke={ink} strokeWidth="1.7" /><path d="m55 62 5 5" stroke={ink} strokeWidth="1.7" strokeLinecap="round" />
      <rect x="72" y="52" width="29" height="3" rx="1.5" fill="#79a186" />
      <rect x="72" y="61" width="51" height="3" rx="1.5" fill="#c1d5c2" />
    </g>
    <path d="M151 77c22 10 32 19 41 30" fill="none" stroke="#a7c3a9" strokeWidth="1.5" strokeDasharray="3 4" />
    <Objects muted />
    <path d="M190 82h39l-4 43q-15 12-31 0Z" fill="#fffefa" stroke="#9ab39e" strokeWidth="1.5" />
    <ellipse cx="209.5" cy="82" rx="19.5" ry="5" fill="#e3ebe1" stroke="#9ab39e" strokeWidth="1.5" />
    <ellipse cx="209.5" cy="82" rx="14" ry="2.6" fill="#a8b8a9" />
    <path d="M229 91q19-3 17 12-2 13-19 10" fill="none" stroke="#9ab39e" strokeWidth="5" />
    <CornerBox x={181} y={70} width={65} height={69} />
    <circle className="preview-vocab-pulse" cx="254" cy="64" r="5" fill="#6da27a" />
  </svg>;
}

function ControlDiagram({ soft }: { soft: boolean }) {
  const line = soft ? "M30 134C64 134 76 129 92 116S126 99 156 95 215 94 272 94"
    : "M30 134H67q11 0 21-20l22-30q10-10 25-10h137";
  return <svg className="skill-diagram" viewBox="0 0 300 180" aria-hidden="true">
    <path d="M30 136h244M30 106h244M30 76h244M30 46h244" stroke="#e0e8df" strokeWidth="1" />
    <path d="M45 38v108M100 38v108M155 38v108M210 38v108M265 38v108" stroke="#edf0e9" strokeWidth="1" />
    <path d="M30 64h244" stroke={warm} strokeWidth="1.5" strokeDasharray="5 6" opacity=".9" />
    <path d={line + "V146H30Z"} fill={pale} opacity=".72" />
    <path d={line} fill="none" stroke={ink} strokeWidth="3" strokeLinecap="round" />
    <circle className="preview-force-point" cx={soft ? 156 : 135} cy={soft ? 95 : 74} r="5" fill="#fffefa" stroke={ink} strokeWidth="2" />
    <path d="M30 146h244" stroke="#bccdbe" strokeWidth="1.3" />
  </svg>;
}

function GenericDiagram() {
  return <svg className="skill-diagram" viewBox="0 0 300 180" aria-hidden="true">
    <circle cx="66" cy="90" r="25" fill="#f9fbf6" stroke="#bfd3c1" strokeWidth="2" />
    <rect x="130" y="62" width="48" height="56" rx="14" fill="#e5eee5" stroke="#89af92" strokeWidth="1.5" />
    <circle cx="237" cy="90" r="25" fill="#f9fbf6" stroke="#bfd3c1" strokeWidth="2" />
    <path d="M91 90h39m48 0h34" stroke={ink} strokeWidth="2" strokeLinecap="round" />
    <circle cx="66" cy="90" r="7" fill={warm} /><circle cx="154" cy="90" r="8" fill={ink} /><circle cx="237" cy="90" r="7" fill="#80aa87" />
  </svg>;
}

export function SkillPreview({ offer }: { offer: Offer }) {
  const grasp = offer.task_type === "grasp";
  const spatial = offer.id === "astar" || offer.id === "scene_summary";
  return <div className={"skill-preview skill-preview-" + offer.task_type} role="img" aria-label={offer.name + " visual preview"}>
    {grasp ? <Suspense fallback={<div className="skill-preview-loading" />}><GraspPreview3D precision={offer.id === "precision_grasp"} /></Suspense>
      : spatial ? <Suspense fallback={<div className="skill-preview-loading" />}><SpatialPreview3D mode={offer.id === "astar" ? "route" : "inspect"} /></Suspense>
        : offer.id === "owlvit" ? <VocabularyDiagram />
          : offer.id === "ssdlite" || offer.id === "fasterrcnn" ? <DetectorDiagram proposals={offer.id === "fasterrcnn"} />
            : offer.task_type === "control" ? <ControlDiagram soft={offer.id === "soft_control"} />
              : <GenericDiagram />}
  </div>;
}
