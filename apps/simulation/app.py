from fastapi import FastAPI
from services.api import simulation, control
app = FastAPI(title='rBazaar simulation')
app.add_api_route('/api/simulation', simulation, methods=['GET'])
app.add_api_route('/api/simulation/control', control, methods=['POST'])
