export type View = "home" | "mission" | "marketplace" | "wallet" | "robot";
export type Offer = {
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
};
export type PlannerConfig = { provider: string; model: string; configured: boolean; message: string };
export type Step = {
  object_name: string | null; description: string; success_criteria: string;
  id: string;
  title: string;
  task_type: string;
  status: string;
  depends_on: string[];
  decision: Decision | null;
  requirements: { object_name: string; fragility: number } | null;
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
  planner: string; planner_model: string | null; assumptions: string[]; blockers: string[];
  simulation_cost_ausd: string;
  request: {
    execution_mode: "simulation" | "testnet";
    task: string;
    budget_ausd: string;
    inference_deadline_ms: number;
    robot_card?: { gripper: string; embodiment: string };
    image_base64?: string;
  };
  id: string;
  status: string;
  subtasks: Step[];
  explanation: string;
  spent_ausd: string;
  estimated_cost_ausd: string;
};
export type Arm = {
  phase: string;
  progress: number;
  running: boolean;
  object_name: string;
  grasp_point_px: number[];
  output: { force_n: number; speed_mm_s: number } | null;
  reason: string;
};
export type WalletState = {
  wallet_address: string | null;
  balance_ausd: string | null;
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
