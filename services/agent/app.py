from fastapi import FastAPI
from services.api import selection, plan, read_plan, run
app = FastAPI(title='RoboMarket agent')
app.add_api_route('/api/agent/select', selection, methods=['POST'])
app.add_api_route('/api/agent/plan', plan, methods=['POST'])
app.add_api_route('/api/agent/plans/{plan_id}', read_plan, methods=['GET'])
app.add_api_route('/api/agent/execute', run, methods=['POST'])
