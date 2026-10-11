import type { Arm } from '../lib/types';

export function ArmScene({arm}:{arm:Arm}){
 const active=arm.output!==null;
 const progress=arm.progress;
 const targetX=arm.grasp_point_px[0]*.65+90, targetY=arm.grasp_point_px[1]*.43+85;
 const blend=active?Math.min(1,progress*5):0;
 const endX=240+(targetX-240)*blend,endY=180+(targetY-180)*blend-(arm.phase==='lift'||arm.phase==='rotate'?35:0);
 return <svg className="arm-scene" viewBox="0 0 580 355" role="img" aria-label={`Simulated robot workcell, ${arm.phase}`}>
  <defs><pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="#d2dbd0" strokeWidth=".7"/></pattern><linearGradient id="table" x2="0" y2="1"><stop stopColor="#e9eee5"/><stop offset="1" stopColor="#d4ddce"/></linearGradient><linearGradient id="orange" x2=".8" y2="1"><stop stopColor="#ffbc5e"/><stop offset="1" stopColor="#e97823"/></linearGradient></defs>
  <rect width="580" height="355" fill="#edf1e9"/><rect width="580" height="355" fill="url(#grid)"/>
  <path d="M70 86 L472 54 L530 244 L119 292 Z" fill="#c1caba"/><path d="M70 78 L472 46 L530 232 L119 280 Z" fill="url(#table)" stroke="#aebbab"/>
  <path d="M270 98 L449 84 L480 188 L300 205 Z" fill="#d6b791" stroke="#bd9e7a"/><path d="M281 104L441 92M285 113L444 101M290 124L447 111M295 135L450 121M300 147L453 132M306 160L457 146M310 172L459 157M314 185L461 170" stroke="#c7a982" opacity=".5"/>
  <path d="M340 134l30-12 26 14v34l-30 14-26-16z" fill="#a5b7ac" stroke="#7f9487"/><path d="M340 134l26 15 30-13M366 149v35" fill="none" stroke="#7f9487"/>
  <path d="M426 154h25l-3 25q-10 6-19-1z" fill="#e8ece4" stroke="#92a48e"/><path d="M451 158q17-1 11 12q-4 5-12 2" fill="none" stroke="#92a48e" strokeWidth="3"/>
  <ellipse cx="167" cy="259" rx="59" ry="18" fill="#a7b5a2" opacity=".45"/><path d="M134 239v17q30 17 64-1v-18" fill="#647769"/><ellipse cx="166" cy="239" rx="32" ry="13" fill="#899b87"/>
  <path d={`M166 235 L139 165 L205 110 L${endX} ${endY}`} fill="none" stroke="#45594d" strokeWidth="24" strokeLinecap="round" strokeLinejoin="round"/>
  <path d={`M166 231 L143 165 L206 114 L${endX} ${endY}`} fill="none" stroke="#d0d9cf" strokeWidth="17" strokeLinecap="round" strokeLinejoin="round"/>
  {[[166,232],[141,165],[205,112]].map(([x,y],i)=><g key={i}><circle cx={x} cy={y} r="14" fill="#f4f6f1" stroke="#5f7566" strokeWidth="3"/><circle cx={x} cy={y} r="5" fill="#748977"/></g>)}
  <g transform={`translate(${endX},${endY})`}><rect x="-12" y="-8" width="24" height="19" rx="5" fill="#4a6252"/><path d="M-12 6L-17 24L-6 30M12 6L17 24L6 30" fill="none" stroke="#34483b" strokeWidth="5" strokeLinecap="round"/></g>
  {active&&<g><circle cx={targetX} cy={targetY} r="19" fill="none" stroke="#3b8060" strokeDasharray="4 3"/><path d={`M${targetX-27} ${targetY}h54M${targetX} ${targetY-27}v54`} stroke="#3b8060" strokeWidth="1"/></g>}
  <g fontFamily="monospace" fontSize="9" fill="#718170"><text x="24" y="28">CAM 01 / ROBOT WORKCELL</text><text x="24" y="330">SIMULATED ARM · ILLUSTRATIVE WORKSPACE</text><text x="490" y="330">6 DOF</text></g>
  <g transform="translate(524,30)" stroke="#80917a" strokeWidth="1.4"><path d="M0 22V0M0 22H20"/><text x="-3" y="-6" stroke="none" fill="#80917a" fontSize="10">Y</text><text x="24" y="26" stroke="none" fill="#80917a" fontSize="10">X</text></g>
 </svg>;
}
