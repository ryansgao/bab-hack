from urllib.parse import parse_qs, urlparse
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from services.accounts import oauth


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv('ROBOMARKET_DB', str(tmp_path / 'oauth.sqlite'))
    monkeypatch.setenv('GITHUB_CLIENT_ID', 'github-test-id')
    monkeypatch.setenv('GITHUB_CLIENT_SECRET', 'github-test-secret')
    for name in ('GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'PUBLIC_URL'): monkeypatch.delenv(name, raising=False)
    app = FastAPI()
    app.include_router(oauth.router)
    return TestClient(app, follow_redirects=False)


def begin(client):
    """Start a GitHub sign-in and return the state the provider would hand back."""
    response = client.get('/api/auth/oauth/github/start')
    return response, parse_qs(urlparse(response.headers['location']).query)


def test_a_provider_is_listed_only_with_both_keys(client, monkeypatch):
    assert oauth.enabled_providers() == [{'id': 'github', 'name': 'GitHub'}]
    monkeypatch.setenv('GOOGLE_CLIENT_ID', 'only-half')
    assert [p['id'] for p in oauth.enabled_providers()] == ['github']
    monkeypatch.setenv('GITHUB_CLIENT_SECRET', '')
    assert oauth.enabled_providers() == []


def test_start_redirects_to_the_provider_with_a_state(client):
    response, query = begin(client)
    assert response.status_code == 302 and response.headers['location'].startswith('https://github.com/login/oauth/authorize?')
    assert query['client_id'] == ['github-test-id'] and query['response_type'] == ['code'] and query['scope'] == ['read:user user:email']
    assert query['redirect_uri'] == ['http://testserver/api/auth/oauth/github/callback']
    assert query['state'][0] and response.cookies[oauth.STATE_COOKIE] == query['state'][0]
    assert 'httponly' in response.headers['set-cookie'].lower() and 'samesite=lax' in response.headers['set-cookie'].lower()
    assert 'github-test-secret' not in response.headers['location']


def test_round_trip_signs_in_and_the_state_works_once(client, monkeypatch):
    seen = []
    def identity(provider, code, redirect):
        seen.append((provider, code, redirect))
        return {'subject': '42', 'name': 'Octo Cat', 'email': 'octo@example.com'}
    monkeypatch.setattr(oauth, 'fetch_identity', identity)
    state = begin(client)[1]['state'][0]
    done = client.get('/api/auth/oauth/github/callback', params={'code': 'abc', 'state': state})
    assert done.status_code == 302 and done.headers['location'] == '/?signed_in=github'
    assert done.cookies['rb_session'] and oauth.STATE_COOKIE not in client.cookies
    assert seen == [('github', 'abc', 'http://testserver/api/auth/oauth/github/callback')]
    # The same browser replays the callback: the cookie matches again, the spent state does not.
    client.cookies.set(oauth.STATE_COOKIE, state)
    again = client.get('/api/auth/oauth/github/callback', params={'code': 'abc', 'state': state})
    assert again.status_code == 302 and again.headers['location'].startswith('/?signin_error=')
    assert 'rb_session' not in again.cookies and len(seen) == 1


def test_callback_refuses_a_state_this_browser_did_not_start(client, monkeypatch):
    monkeypatch.setattr(oauth, 'fetch_identity', lambda *args: {'subject': '42', 'name': 'Octo Cat', 'email': None})
    state = begin(client)[1]['state'][0]
    wrong = client.get('/api/auth/oauth/github/callback', params={'code': 'abc', 'state': 'not-the-state'})
    assert wrong.status_code == 302 and wrong.headers['location'].startswith('/?signin_error=') and 'rb_session' not in wrong.cookies
    # A real state without the cookie is someone else's sign-in link.
    client.cookies.clear()
    other = client.get('/api/auth/oauth/github/callback', params={'code': 'abc', 'state': state})
    assert other.headers['location'].startswith('/?signin_error=') and 'rb_session' not in other.cookies
    denied = client.get('/api/auth/oauth/github/callback', params={'error': 'access_denied'})
    assert denied.status_code == 302 and 'cancelled' in denied.headers['location']


def test_a_provider_without_keys_is_not_found(client):
    assert client.get('/api/auth/oauth/google/start').status_code == 404
    assert client.get('/api/auth/oauth/nonsense/start').status_code == 404
    assert client.get('/api/auth/oauth/google/callback', params={'code': 'x', 'state': 'y'}).headers['location'].startswith('/?signin_error=')
