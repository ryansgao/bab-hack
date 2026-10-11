"""Shared v1 contracts. Money is decimal text, never binary floating point."""
from __future__ import annotations
from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field

Money = Annotated[str, Field(pattern=r"^(0|[1-9]\d{0,8})(\.\d{1,6})?$")]
TaskType = Literal['object_detection', 'path_planning', 'scene_inspection']

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

class ModelOffer(Contract):
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
    kind: Literal['pretrained_model', 'algorithm'] = 'pretrained_model'

class SelectionRequest(Contract):
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
    robot_id: Literal['robot_001'] = 'robot_001'
    task: str = Field(min_length=3, max_length=500)
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
    model_id: str
    predictions: list[Prediction] = Field(default_factory=list)
    path: list[Point] = Field(default_factory=list)
    summary: str | None = None
    inference_latency_ms: float = Field(ge=0)
    source: Literal['pretrained_model', 'algorithm']
    observation_revision: int

class Subtask(Contract):
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
    id: str
    request: MissionRequest
    subtasks: list[Subtask]
    status: Literal['planned', 'running', 'waiting_for_motion', 'blocked', 'completed'] = 'planned'
    spent_ausd: Money = '0'
    explanation: str

class ExecuteRequest(Contract):
    plan_id: str

class SimulationControl(Contract):
    action: Literal['start', 'pause', 'reset', 'tick', 'add_obstacle', 'add_pedestrian']
    point: Point | None = None
