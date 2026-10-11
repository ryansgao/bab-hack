from fastapi import FastAPI
from services.api import models, register
from services.marketplace.routes import router
app = FastAPI(title='RoboMarket marketplace')
app.add_api_route('/api/marketplace/models', models, methods=['GET'])
app.add_api_route('/api/marketplace/models', register, methods=['POST'])
app.include_router(router)
