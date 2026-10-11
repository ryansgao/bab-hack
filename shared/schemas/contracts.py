"""Shared v1 contracts. Money is decimal text, never binary floating point."""
from __future__ import annotations
from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field

Money = Annotated[str, Field(pattern=r"^(0|[1-9]\d{0,8})(\.\d{1,6})?$")]
TaskType = Annotated[str, Field(pattern=r'^[a-z][a-z0-9_]{1,63}$')]

class Contract(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)

class Point(Contract):
    x: int = Field(ge=0, lt=24)
    y: int = Field(ge=0, lt=16)

class Vector(Contract):
    x: float = 0
    y: float = 0

class Observation(Contract):
    robot_id: str = 'robot_001'
    position: Point
    velocity: Vector = Field(default_factory=Vector)
    nearest_obstacle_distance: float = Field(ge=0)
    nearby_agent_count: int = Field(ge=0)
    sensor_uncertainty: float = Field(default=0.3, ge=0, le=1)
    revision: int = Field(default=0, ge=0)

class RobotCard(Contract):
    robot_id: Literal['robot_001'] = 'robot_001'
    embodiment: Literal['6dof_arm', 'mobile_base'] = '6dof_arm'
    dof: int = Field(default=6, ge=1, le=30)
    gripper: Literal['parallel_jaw', 'suction', 'none'] = 'parallel_jaw'
    max_payload_kg: float = Field(default=1.5, gt=0, le=100)
    sensors: list[str] = Field(default_factory=lambda: ['rgb', 'depth', 'wrist_force'])
    onboard_compute: str = 'jetson_orin'

class Requirements(Contract):
    object_name: str
    object_size_mm: float = Field(gt=0, le=1000)
    mass_kg: float = Field(gt=0, le=100)
    fragility: float = Field(ge=0, le=1)
    max_pose_error_mm: float = Field(gt=0)
    max_force_n: float = Field(gt=0)
    layers: list[TaskType]
    source: Literal['documented_task_prior', 'operator', 'llm_estimate'] = 'documented_task_prior'

class ModelOffer(Contract):
    execution_mode: Literal['testnet', 'simulation'] = 'testnet'
    description: str = ''
    id: str = Field(pattern=r'^[a-z0-9_-]{1,64}$')
    name: str = Field(min_length=1, max_length=100)
    provider_id: str = Field(pattern=r'^[a-z0-9_-]{1,64}$')
    task_type: TaskType
    price_ausd: Money
    latency_ms: float = Field(gt=0)
    latency_source: Literal['configured_estimate', 'measured_ema'] = 'configured_estimate'
    quality: float | None = Field(default=None, ge=0, le=1)
    quality_source: Literal['unknown', 'configured_estimate', 'measured_benchmark'] = 'unknown'
    benchmark_reference: str | None = None
    status: Literal['available', 'unavailable'] = 'available'
    embodiments: list[str] = Field(default_factory=lambda: ['6dof_arm', 'mobile_base'])
    grippers: list[str] = Field(default_factory=lambda: ['parallel_jaw', 'suction', 'none'])
    required_sensors: list[str] = Field(default_factory=list)
    object_size_range_mm: list[float] = Field(default_factory=lambda: [1, 1000], min_length=2, max_length=2)
    pose_error_mm: float | None = Field(default=None, gt=0)
    min_force_n: float | None = Field(default=None, gt=0)
    supported_objects: list[str] = Field(default_factory=list)
    kind: Literal['pretrained_model', 'algorithm'] = 'pretrained_model'

class SelectionRequest(Contract):
    execution_mode: Literal['testnet', 'simulation'] = 'testnet'
    object_name: str | None = None
    robot_card: RobotCard | None = None
    requirements: Requirements | None = None
    observation: Observation
    task_type: TaskType = 'object_detection'
    remaining_budget_ausd: Money
    inference_deadline_ms: int = Field(default=2000, ge=1, le=120000)
    minimum_quality: float = Field(default=0, ge=0, le=1)

class CandidateEvaluation(Contract):
    model: ModelOffer
    eligible: bool
    score: float | None = None
    reasons: list[str] = Field(default_factory=list)

class SelectionDecision(Contract):
    selected_model_id: str | None
    risk_score: float
    remaining_budget_ausd: Money
    candidates: list[CandidateEvaluation]
    explanation: str
    safe_fallback: bool

class MissionRequest(Contract):
    execution_mode: Literal['testnet', 'simulation'] = 'testnet'
    robot_card: RobotCard | None = None
    robot_id: Literal['robot_001'] = 'robot_001'
    task: str = Field(min_length=3, max_length=6000)
    waypoints: list[Point] = Field(default_factory=list, max_length=20)
    budget_ausd: Money = '0.10'
    inference_deadline_ms: int = Field(default=2000, ge=1, le=120000)
    minimum_quality: float = Field(default=0, ge=0, le=1)
    image_base64: str | None = Field(default=None, max_length=8_000_000)

class Prediction(Contract):
    label: str
    confidence: float = Field(ge=0, le=1)
    bbox: list[float] = Field(min_length=4, max_length=4)

class InferenceInput(Contract):
    execution_mode: Literal['testnet', 'simulation'] = 'testnet'
    simulation_scene: dict = Field(default_factory=dict)
    destination: str | None = None
    object_name: str | None = None
    instruction: str = ''
    dependency_outputs: dict = Field(default_factory=dict)
    robot_card: RobotCard | None = None
    requirements: Requirements | None = None
    prior: dict = Field(default_factory=dict)
    image_base64: str | None = Field(default=None, max_length=8_000_000)
    observation: Observation
    target: Point
    obstacles: list[Point] = Field(default_factory=list, max_length=384)
    width: int = Field(default=24, ge=1, le=24)
    height: int = Field(default=16, ge=1, le=16)
    predictions: list[Prediction] = Field(default_factory=list, max_length=500)

class InferenceRequest(Contract):
    request_id: str = Field(pattern=r'^[a-zA-Z0-9_-]{1,100}$')
    robot_id: Literal['robot_001'] = 'robot_001'
    model_id: str = Field(pattern=r'^[a-z0-9_-]{1,64}$')
    input: InferenceInput

class InferenceResult(Contract):
    output: dict = Field(default_factory=dict)
    model_id: str
    predictions: list[Prediction] = Field(default_factory=list)
    path: list[Point] = Field(default_factory=list)
    summary: str | None = None
    inference_latency_ms: float = Field(ge=0)
    source: Literal['pretrained_model', 'algorithm', 'simulation']
    observation_revision: int

class Subtask(Contract):
    destination: str | None = None
    object_name: str | None = None
    description: str = ''
    success_criteria: str = ''
    requirements: Requirements | None = None
    id: str
    title: str
    task_type: TaskType
    depends_on: list[str]
    target: Point
    status: Literal['pending', 'running', 'waiting_for_motion', 'completed', 'blocked'] = 'pending'
    decision: SelectionDecision | None = None
    result: InferenceResult | None = None
    payment: dict | None = None
    error: str | None = None

class MissionPlan(Contract):
    simulation_scene: dict = Field(default_factory=dict)
    simulation_cost_ausd: Money = '0'
    planner: str = 'legacy'
    planner_model: str | None = None
    assumptions: list[str] = Field(default_factory=list)
    blockers: list[str] = Field(default_factory=list)
    id: str
    request: MissionRequest
    subtasks: list[Subtask]
    status: Literal['planned', 'queued', 'preparing', 'running', 'waiting_for_motion', 'blocked', 'completed', 'cancelled'] = 'planned'
    spent_ausd: Money = '0'
    estimated_cost_ausd: Money = '0'
    explanation: str

class ExecuteRequest(Contract):
    plan_id: str

class SimulationControl(Contract):
    action: Literal['start', 'pause', 'reset', 'tick', 'add_obstacle', 'add_pedestrian']
    point: Point | None = None
