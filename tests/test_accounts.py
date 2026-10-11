import pytest
from fastapi.testclient import TestClient
from shared.schemas.contracts import MissionPlan, MissionRequest, Point, Subtask


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv('ROBOMARKET_DB', str(tmp_path / 'accounts.sqlite'))
    from services.api import app
    return TestClient(app)


def paid_plan(plan_id='paidplan', cost='0.002'):
    from services.agent.executor import save
    return save(MissionPlan(id=plan_id, explanation='test', estimated_cost_ausd=cost, request=MissionRequest(task='paid test', execution_mode='testnet'),
        subtasks=[Subtask(id='s', title='step', task_type='scene_inspection', depends_on=[], target=Point(x=1, y=1))]))


def join(client, email='a@example.com'):
    return client.post('/api/auth/register', json={'email': email, 'password': 'long enough password'})


def test_sign_up_sign_in_and_sign_out(client):
    assert client.get('/api/auth/me').json()['user'] is None
    assert join(client).json()['user']['email'] == 'a@example.com'
    assert join(client).status_code == 409
    assert client.post('/api/auth/logout').json() == {'user': None}
    assert client.get('/api/account/activity').status_code == 401
    assert client.post('/api/auth/login', json={'email': 'a@example.com', 'password': 'wrong password!'}).status_code == 401
    assert client.post('/api/auth/login', json={'email': 'A@Example.com', 'password': 'long enough password'}).status_code == 200
    assert client.get('/api/auth/me').json()['user']['name'] == 'a'


def test_paid_mission_needs_an_account_and_respects_its_limits(client):
    paid_plan()
    assert client.post('/api/agent/execute', json={'plan_id': 'paidplan'}).status_code == 401
    join(client)
    client.patch('/api/account', json={'max_per_mission_ausd': '0.001'})
    refused = client.post('/api/agent/execute', json={'plan_id': 'paidplan'})
    assert refused.status_code == 402 and 'per-mission limit' in refused.json()['error']['message']
    client.patch('/api/account', json={'max_per_mission_ausd': '0.10', 'payments_paused': True})
    assert 'paused' in client.post('/api/agent/execute', json={'plan_id': 'paidplan'}).json()['error']['message']


def test_a_mission_belongs_to_the_account_that_claimed_it(client):
    paid_plan()
    join(client)
    client.patch('/api/account', json={'payments_paused': True})
    client.post('/api/agent/execute', json={'plan_id': 'paidplan'})  # refused by the pause, but claimed
    client.post('/api/auth/logout')
    join(client, 'b@example.com')
    assert client.post('/api/agent/execute', json={'plan_id': 'paidplan'}).status_code == 403


def test_cross_site_requests_are_refused(client):
    join(client)
    assert client.patch('/api/account', json={'name': 'x'}, headers={'origin': 'https://elsewhere.example'}).status_code == 403
    # Behind a proxy the browser's port can differ from the one the gateway is reached on.
    proxied = {'origin': 'https://app.example:8443', 'host': '127.0.0.1:8000', 'x-forwarded-host': 'app.example'}
    assert client.patch('/api/account', json={'name': 'y'}, headers=proxied).status_code == 200


def test_password_change_export_and_delete(client):
    join(client)
    assert client.post('/api/account/password', json={'current': 'nope nope nope', 'new': 'another long password'}).status_code == 403
    assert client.post('/api/account/password', json={'current': 'long enough password', 'new': 'another long password'}).json() == {'changed': True}
    exported = client.get('/api/account/export').json()
    assert exported['account']['email'] == 'a@example.com' and 'scrypt' not in str(exported)
    assert client.post('/api/account/delete', json={'password': 'another long password'}).json() == {'deleted': True}
    assert client.get('/api/auth/me').json()['user'] is None
    assert client.post('/api/auth/login', json={'email': 'a@example.com', 'password': 'another long password'}).status_code == 401


def test_a_visitor_gets_a_guest_account_once(client, monkeypatch):
    first = client.post('/api/auth/guest').json()['user']
    assert first['sign_in_methods'] == ['guest'] and first['email'] == ''
    assert client.post('/api/auth/guest').json()['user']['id'] == first['id']
    monkeypatch.setenv('GUEST_SIGN_IN', '0')
    client.post('/api/auth/logout')
    assert client.post('/api/auth/guest').status_code == 404
