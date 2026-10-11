"""Continue with Google / GitHub: the OAuth round trip that ends in the same session cookie a
password sign-in gets. A provider appears only when both its client id and secret are configured
in the environment; without keys it is simply absent and its routes answer 404.
"""
import os
from urllib.parse import quote, urlencode
import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse
from services.accounts import store

router = APIRouter(tags=['accounts'])
STATE_COOKIE = 'rb_oauth_state'
STATE_PATH = '/api/auth/oauth'
STATE_SECONDS = 300
PROVIDERS = {
    'github': {'name': 'GitHub', 'authorize_url': 'https://github.com/login/oauth/authorize',
               'token_url': 'https://github.com/login/oauth/access_token', 'scope': 'read:user user:email',
               'id_env': 'GITHUB_CLIENT_ID', 'secret_env': 'GITHUB_CLIENT_SECRET', 'extra': {}},
    'google': {'name': 'Google', 'authorize_url': 'https://accounts.google.com/o/oauth2/v2/auth',
               'token_url': 'https://oauth2.googleapis.com/token', 'scope': 'openid email profile',
               'id_env': 'GOOGLE_CLIENT_ID', 'secret_env': 'GOOGLE_CLIENT_SECRET',
               'extra': {'access_type': 'online', 'prompt': 'select_account'}},
}


def keys(provider):
    """(client id, client secret) of a configured provider, else None."""
    spec = PROVIDERS.get(provider)
    pair = (os.getenv(spec['id_env'], '').strip(), os.getenv(spec['secret_env'], '').strip()) if spec else ('', '')
    return pair if all(pair) else None


def enabled_providers() -> list[dict]:
    return [{'id': provider, 'name': spec['name']} for provider, spec in PROVIDERS.items() if keys(provider)]


def forwarded_proto(request: Request):
    return request.headers.get('x-forwarded-proto', request.url.scheme).split(',')[0].strip()


def redirect_uri(request: Request, provider):
    base = os.getenv('PUBLIC_URL', '').strip().rstrip('/')
    if not base:
        host = (request.headers.get('x-forwarded-host') or request.headers.get('host', '')).split(',')[0].strip()
        base = f'{forwarded_proto(request)}://{host}'
    return f'{base}/api/auth/oauth/{provider}/callback'


def fetch_identity(provider, code, redirect):
    """Trade the code for who signed in: {'subject', 'name', 'email'}. Raises ValueError with a
    message fit to show the user. The access token never leaves this function."""
    spec, (client_id, client_secret) = PROVIDERS[provider], keys(provider)
    label = spec['name']

    def read(response, what):
        if response.status_code != 200: raise ValueError(f'{label} refused the {what}.')
        try: return response.json()
        except ValueError: raise ValueError(f'{label} sent a reply that could not be read.')

    try:
        with httpx.Client(timeout=15) as client:
            grant = read(client.post(spec['token_url'], headers={'Accept': 'application/json'}, data={
                'client_id': client_id, 'client_secret': client_secret, 'code': code, 'redirect_uri': redirect,
                'grant_type': 'authorization_code'}), 'sign-in code')
            # GitHub answers 200 with an error body when the code is wrong or already used.
            if not grant.get('access_token'): raise ValueError(f'{label} did not accept the sign-in code.')
            auth = {'Authorization': f"Bearer {grant['access_token']}", 'Accept': 'application/json'}
            if provider == 'github':
                profile = read(client.get('https://api.github.com/user', headers=auth), 'profile request')
                emails = read(client.get('https://api.github.com/user/emails', headers=auth), 'email request')
                subject, name = profile.get('id'), profile.get('name') or profile.get('login')
                email = next((e.get('email') for e in emails if e.get('primary') and e.get('verified')), None)
            else:
                profile = read(client.get('https://openidconnect.googleapis.com/v1/userinfo', headers=auth), 'profile request')
                subject, name = profile.get('sub'), profile.get('name')
                email = profile.get('email') if profile.get('email_verified') is True else None
    except httpx.HTTPError:
        raise ValueError(f'Could not reach {label}. Try again.')
    if not subject or not name: raise ValueError(f'{label} did not say who signed in.')
    return {'subject': str(subject), 'name': str(name), 'email': email or None}


@router.get('/api/auth/oauth/{provider}/start')
def start(provider: str, request: Request):
    if not keys(provider): raise HTTPException(404, 'This sign-in method is not available.')
    store.ensure()
    store.throttle('oauth|' + store.visitor(request), 30, 3600)
    state = store.challenge(provider, STATE_SECONDS)
    spec = PROVIDERS[provider]
    query = {'client_id': keys(provider)[0], 'redirect_uri': redirect_uri(request, provider), 'response_type': 'code',
             'scope': spec['scope'], 'state': state, **spec['extra']}
    response = RedirectResponse(f"{spec['authorize_url']}?{urlencode(query)}", status_code=302)
    # The callback accepts the state only from the browser that holds this cookie, so a sign-in
    # link prepared by someone else cannot be finished in the victim's browser.
    response.set_cookie(STATE_COOKIE, state, max_age=STATE_SECONDS, httponly=True, samesite='lax',
                        secure=forwarded_proto(request) == 'https', path=STATE_PATH)
    return response


@router.get('/api/auth/oauth/{provider}/callback')
def callback(provider: str, request: Request, code: str = '', state: str = '', error: str = ''):
    def failed(message):
        response = RedirectResponse('/?signin_error=' + quote(message, safe=''), status_code=302)
        response.delete_cookie(STATE_COOKIE, path=STATE_PATH)
        return response

    if not keys(provider): return failed('This sign-in method is not available.')
    label = PROVIDERS[provider]['name']
    if error: return failed(f'{label} sign-in was cancelled.')
    if not code or not state or state != request.cookies.get(STATE_COOKIE) or store.redeem(state) != provider:
        return failed('This sign-in attempt expired. Try again.')
    try:
        identity = fetch_identity(provider, code, redirect_uri(request, provider))
        user = store.user_for_identity(provider, identity['subject'], identity['name'], identity['email'])
        response = RedirectResponse('/?signed_in=' + provider, status_code=302)
        store.start_session(user['id'], request, response)
    except HTTPException as refused: return failed(str(refused.detail))
    except ValueError as problem: return failed(str(problem))
    except Exception: return failed(f'{label} sign-in failed. Try again.')  # a browser redirect must land on the site, never on a 500
    response.delete_cookie(STATE_COOKIE, path=STATE_PATH)
    return response
