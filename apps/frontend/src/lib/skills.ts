export type Family =
  | "detect" | "segment" | "human" | "pose" | "capture"
  | "inspect" | "read" | "measure" | "verify"
  | "grasp" | "control" | "place" | "pour" | "whisk" | "dose"
  | "path" | "map" | "reach" | "collision";

const FAMILY: Record<string, Family> = {
  object_detection: "detect", object_identity: "detect", object_classification: "detect", handle_detection: "detect",
  instance_segmentation: "segment", human_pose: "human",
  pose_estimation: "pose", orientation_check: "pose", alignment_check: "pose",
  camera_capture: "capture", image_quality: "capture",
  dimension_estimation: "measure", label_reading: "read", expiry_reading: "read",
  completion_verification: "verify", inspection_report: "verify",
  grasp: "grasp", grasp_verification: "grasp", control: "control",
  object_placement: "place", placement_planning: "place",
  path_planning: "path", scene_mapping: "map",
  reachability_check: "reach", collision_check: "collision",
};

export const familyOf = (taskType: string): Family =>
  FAMILY[taskType]
  ?? (/pour|combin|fill/.test(taskType) ? "pour"
    : /whisk|stir|mix|blend/.test(taskType) ? "whisk"
      : /dos(e|ing)|weigh|scoop/.test(taskType) ? "dose" : "inspect");

export const GROUPS: { key: string; label: string; families: Family[] }[] = [
  { key: "perception", label: "Perception", families: ["detect", "segment", "human", "pose", "capture"] },
  { key: "inspection", label: "Inspection", families: ["inspect", "read", "measure", "verify"] },
  { key: "manipulation", label: "Manipulation", families: ["grasp", "control", "place", "pour", "whisk", "dose"] },
  { key: "planning", label: "Planning & safety", families: ["path", "map", "reach", "collision"] },
];
