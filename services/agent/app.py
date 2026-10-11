from fastapi import FastAPI
from services.api import selection, plan, read_plan, run, lifespan, agent_config, planner_error, bad_value
from services.agent.planner import PlannerError
app = FastAPI(title='rBazaar agent', lifespan=lifespan)
app.add_exception_handler(PlannerError, planner_error)
app.add_exception_handler(ValueError, bad_value)
app.add_api_route('/api/agent/config', agent_config, methods=['GET'])
app.add_api_route('/api/agent/select', selection, methods=['POST'])
app.add_api_route('/api/agent/plan', plan, methods=['POST'])
app.add_api_route('/api/agent/plans/{plan_id}', read_plan, methods=['GET'])
app.add_api_route('/api/agent/execute', run, methods=['POST'])
