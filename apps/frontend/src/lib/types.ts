export type View = "home" | "mission" | "marketplace" | "bounties" | "wallet" | "robot";
export type Offer = {
  simulation_program?: Record<string,unknown> | null;
  simulation_placeholder?: boolean;
  category: string; tags: string[]; specialist: boolean;
  execution_mode: "simulation" | "testnet";
  description: string;
  id: string;
  name: string;
  provider_id: string;
  task_type: string;
  price_ausd: string;
  latency_ms: number;
  latency_source: string;
  quality: number | null;
  quality_source: string;
  kind: string;
  status: string;
  required_sensors: string[];
  supported_objects: string[];
  embodiments: string[];
  grippers: string[];
};
export type Candidate = {
  model: Offer;
  eligible: boolean;
  score: number | null;
  reasons: string[];
};
export type Decision = {
  selected_model_id: string | null;
  risk_score: number;
  candidates: Candidate[];
  explanation: string;
  safe_fallback: boolean;
};
export type Receipt = {
  request_id: string;
  model_id: string;
  amount_ausd: string;
  status: string;
  transaction_hash: string | null;
  explorer_url: string | null;
  timestamp: string;
  pay_to?: string | null;
  audit_explorer_url?: string | null;
};
export type PlannerConfig = { provider: string; model: string; configured: boolean; message: string; matcha_demo?:{enabled:boolean;prompt:string} };
export type SimulationScene = {
  id: string;
  source: string;
  width: number;
  height: number;
  image_base64?: string;
  zones: Record<string, [number, number]>;
  objects: {
    id: string; name: string; aliases: string[]; category: string;
    bbox: [number, number, number, number]; size_mm: [number, number, number];
    color: string; destination: string; surface_dirt: number; defects: string[];
    contents: string | null; handle: boolean;
    shape?: string; visible?: boolean; traits?: Record<string,string>;
    mass_kg?: number; fragility?: number;
  }[];
};
export type Step = {
  simulation_effect?: {summary: string; state_changes: Record<string,string>; hide_object: boolean} | null;
  destination: string | null;
  object_name: string | null; description: string; success_criteria: string;
  id: string;
  title: string;
  task_type: string;
  status: string;
  depends_on: string[];
  decision: Decision | null;
  requirements: { object_name: string; fragility: number; mass_kg?: number; max_force_n?: number } | null;
  error: string | null;
  payment: Receipt | null;
  result: {
    source: string;
    summary: string | null;
    output: Record<string, unknown>;
    inference_latency_ms: number;
    predictions: unknown[];
  } | null;
};
export type Plan = {
  demo_scenario?: string | null;
  robot_visual?: {name:string;form:'arm'|'mobile'|'humanoid';body_color:string;accent_color:string;context_summary:string};
  planning_usage?: { input_tokens: number; output_tokens: number; cache_creation_input_tokens: number; cache_read_input_tokens: number; estimated_cost_usd: string | null; pricing_source: string; rates_checked_at: string };
  simulation_fallbacks?: Offer[];
  bounty_ids: string[];
  simulation_scene: SimulationScene | null;
  planner: string; planner_model: string | null; assumptions: string[]; blockers: string[];
  simulation_cost_ausd: string;
  request: {
    media?: import('./media').ContextMedia[];
    execution_mode: "simulation" | "testnet";
    auto_bounties: boolean;
    bounty_reward_ausd: string;
    task: string;
    budget_ausd: string;
    inference_deadline_ms: number;
    robot_card?: RobotConfig;
    image_base64?: string;
  };
  id: string;
  status: string;
  subtasks: Step[];
  explanation: string;
  spent_ausd: string;
  estimated_cost_ausd: string;
};
export type BountySubmission = {
  id: string; producer_id: string; model_name: string; description: string;
  price_ausd: string; evidence_url: string; status: string; operation: string; attribute: string; value: string;
};
export type Bounty = {
  id: string; title: string; description: string; task_type: string; object_name: string | null;
  execution_mode: "simulation" | "testnet"; reward_ausd: string; success_criteria: string;
  status: string; plan_ids: string[]; submissions: BountySubmission[]; published_model_id: string | null;
  funding_status: string; created_at: string;
  award: {amount: string; currency: string; producer_id: string; status: string} | null;
};
export type Arm = {
  plan_id?: string | null; step_id?: string | null; capability?: string; object_id?: string | null;
  held_object_id?: string | null; paused?: boolean; motion_duration_s?: number;
  phase: string;
  progress: number;
  running: boolean;
  object_name: string;
  grasp_point_px: number[];
  output: { force_n: number; speed_mm_s: number; start_point_px?: number[]; motion_duration_s?: number; holding_on_complete?: boolean } | null;
  reason: string;
};
export type RobotConfig = {robot_id: 'robot_001'; embodiment:'6dof_arm'; dof:number; gripper:'parallel_jaw'|'suction'|'none'; max_payload_kg:number; reach_mm:number; sensors:string[]; onboard_compute:string};
export const DEFAULT_ROBOT:RobotConfig={robot_id:'robot_001',embodiment:'6dof_arm',dof:6,gripper:'parallel_jaw',max_payload_kg:1.5,reach_mm:1100,sensors:['rgb','depth','wrist_force'],onboard_compute:'jetson_orin'};
export function liveStep(plan:Plan|null) {if(!plan)return 0;const index=plan.subtasks.findIndex(s=>['running','waiting_for_motion'].includes(s.status));return index>=0?index:plan.status==='completed'?Math.max(0,plan.subtasks.length-1):Math.max(0,plan.subtasks.findIndex(s=>s.status==='pending'));}
export type WalletState = {
  wallet_address: string | null;
  balance_ausd: string | null;
  custody?: "mission_float" | "robot_holds_balance";
  owner_address?: string | null;
  owner_treasury_ausd?: string | null;
  policy_chain?: { contract: string; explorer_url: string; receipt_count: number } | null;
  remaining_allowance_ausd: string;
  session_used_ausd: string;
  setup_error: string | null;
  allowance: {
    max_per_task_ausd: string;
    max_per_request_ausd: string;
    max_daily_ausd: string;
  };
};
export type RecentMission = { id: string; title: string };
export const layerName = (value: string) =>
  ({
    object_detection: "Perception",
    grasp: "Grasp planning",
    control: "Force control",
    path_planning: "Navigation",
    scene_inspection: "Inspection",
  })[value] || value.replaceAll("_", " ");
export const money = (value: string | number) =>
  Number(value).toLocaleString("en-US", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 6,
  });
export const humanize = (value: string) => value.replaceAll("_", " ");
export const usd = (value: string | number) => {
  const amount=Number(value);
  return amount.toLocaleString('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:amount>0 && amount<.01 ? 6 : 4});
};
export const cents = (value: string | number) => `${(Number(value)*100).toLocaleString('en-US',{maximumFractionDigits:3})}¢`;
