"""Scout entry point. All natural-language tasks use the Anthropic planner."""
from services.agent.planner import decompose

arm_plan = decompose
