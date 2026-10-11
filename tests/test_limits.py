import pytest
from fastapi import FastAPI, Depends
from fastapi.testclient import TestClient
from services.agent.limits import admit
from services.agent.planner import PlannerError

@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv('ROBOMARKET_DB', str(tmp_path / 'limits.sqlite'))
    app = FastAPI()
    @app.exception_handler(PlannerError)
    async def refused(request, exc):
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=exc.status, content={'message': str(exc)})
    @app.post('/plan', dependencies=[Depends(admit)])
    def plan(): return {'planned': True}
    return TestClient(app)

def test_visitor_limit_is_per_forwarded_address(client, monkeypatch):
    monkeypatch.setenv('PLANNER_MAX_CALLS_PER_VISITOR_HOUR', '2')
    alice, bob = {'X-Forwarded-For': '203.0.113.7, 10.0.0.1'}, {'X-Forwarded-For': '203.0.113.8'}
    assert [client.post('/plan', headers=alice).status_code for _ in range(3)] == [200, 200, 429]
    assert client.post('/plan', headers=bob).status_code == 200

def test_daily_limit_bounds_all_visitors(client, monkeypatch):
    monkeypatch.setenv('PLANNER_MAX_CALLS_PER_DAY', '2')
    codes = [client.post('/plan', headers={'X-Forwarded-For': f'203.0.113.{n}'}).status_code for n in range(3)]
    assert codes == [200, 200, 429]
