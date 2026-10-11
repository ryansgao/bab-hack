"""Sign-in, account settings, the user's wallet view, and their full payment history."""
import json
import os
import secrets
from datetime import datetime, timezone
from decimal import Decimal
from uuid import uuid4
import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import Field
from shared.schemas.contracts import Contract, MissionPlan, MissionRequest, Point, RobotCard, Subtask
from services.accounts import store
from services.accounts.oauth import enabled_providers
from services.storage import db

router = APIRouter(tags=['accounts'])
ACTIVE = ('queued', 'preparing', 'running', 'waiting_for_motion')


class Register(Contract):
    email: str = Field(max_length=260)
    password: str = Field(max_length=400)
    name: str = Field(default='', max_length=60)

class Login(Contract):
    email: str = Field(max_length=260)
    password: str = Field(max_length=400)

class SettingsChange(Contract):
    name: str | None = Field(default=None, max_length=60)
    max_per_mission_ausd: str | None = None
    max_per_day_ausd: str | None = None
    payments_paused: bool | None = None
    save_simulation_history: bool | None = None

class PasswordChange(Contract):
    current: str = Field(max_length=400)
    new: str = Field(max_length=400)

class Confirm(Contract):
    password: str = Field(max_length=400)

class Deposit(Contract):
    sender: str = Field(pattern=r'^0x[0-9a-fA-F]{40}$')
    amount_ausd: str = Field(pattern=r'^(0|[1-9]\d{0,8})(\.\d{1,6})?$')
    valid_after: str = Field(pattern=r'^\d{1,12}$')
    valid_before: str = Field(pattern=r'^\d{1,12}$')
    nonce: str = Field(pattern=r'^0x[0-9a-fA-F]{64}$')
    signature: str = Field(pattern=r'^0x[0-9a-fA-F]{130,4000}$')

class WalletChallenge(Contract):
    address: str = Field(pattern=r'^0x[0-9a-fA-F]{40}$')

class WalletProof(Contract):
    token: str = Field(max_length=80)
    signature: str = Field(pattern=r'^0x[0-9a-fA-F]{130,4000}$')

class Withdrawal(Contract):
    to: str = Field(pattern=r'^0x[0-9a-fA-F]{40}$')
    amount_ausd: str = Field(pattern=r'^(0|[1-9]\d{0,8})(\.\d{1,6})?$')


async def payments(method, path, account=None, json=None, timeout=20):
    """Call the private payment service. `account` selects that user's own wallet."""
    headers = {'X-Service-Key': os.getenv('SERVICE_KEY', '')}
    if account: headers['X-Account'] = account
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.request(method, os.getenv('PAYMENT_URL', 'http://127.0.0.1:4021') + path, headers=headers, json=json)
    except httpx.HTTPError:
        raise HTTPException(503, 'Payment service offline.')
    body = response.json() if response.headers.get('content-type', '').startswith('application/json') else {}
    if response.status_code >= 400:
        raise HTTPException(response.status_code if response.status_code in (402, 409, 422) else 503,
                            (body.get('error') or {}).get('message') or 'Payment service unavailable or not configured')
    return body


# ---- sign-in ----
@router.get('/api/auth/me')
def me(request: Request):
    user = store.current_user(request)
    return {'user': store.public(user) if user else None, 'accounts_required': store.enforced(), 'providers': enabled_providers(),
            'guest_sign_in': guests_enabled(),
            # Public by design: the id only names this app to WalletConnect so phone wallets can pair by QR code.
            'walletconnect_project_id': os.getenv('WALLETCONNECT_PROJECT_ID', '')}

def guests_enabled():
    """GUEST_SIGN_IN=0 makes visitors sign in themselves before they get an account."""
    return os.getenv('GUEST_SIGN_IN', '1') != '0'

@router.post('/api/auth/guest', dependencies=[Depends(store.same_origin)])
def guest(request: Request, response: Response):
    """A visitor gets an account and a test wallet without signing up. The session cookie is the
    only key to it, so a guest who wants to keep the account sets a password or signs in another way."""
    if not guests_enabled(): raise HTTPException(404, 'Guest accounts are off.')
    user = store.current_user(request)
    if not user:
        # Generous per address (a whole room can share one); the daily starter-grant cap bounds the money.
        store.throttle('guest|' + store.visitor(request), 60, 3600)
        user = store.user_for_identity('guest', secrets.token_hex(12), 'Guest')
        store.start_session(user['id'], request, response)
    return {'user': store.public(user)}

@router.post('/api/auth/wallet/challenge', dependencies=[Depends(store.same_origin)])
def wallet_challenge(body: WalletChallenge, request: Request):
    """The text a wallet must sign to prove it holds an address (Sign-In with Ethereum wording)."""
    store.throttle('wallet|' + store.visitor(request), 30, 900)
    host = (request.headers.get('x-forwarded-host') or request.headers.get('host', 'rbazaar')).split(',')[0].strip()
    scheme = request.headers.get('x-forwarded-proto') or request.url.scheme
    message = (f'{host} wants you to sign in with your Ethereum account:\n{body.address}\n\n'
               f'Sign in to rBazaar. This signature moves no funds.\n\nURI: {scheme}://{host}\nVersion: 1\nChain ID: 84532\n'
               f"Nonce: {secrets.token_hex(8)}\nIssued At: {datetime.now(timezone.utc).isoformat(timespec='seconds')}")
    return {'token': store.challenge(json.dumps({'address': body.address, 'message': message})), 'message': message}

@router.post('/api/auth/wallet/verify', dependencies=[Depends(store.same_origin)])
async def wallet_verify(body: WalletProof, request: Request, response: Response):
    signed = json.loads(store.redeem(body.token) or 'null')
    if not signed: raise HTTPException(401, 'This sign-in request expired. Try again.')
    proof = await payments('POST', '/verify-signature', json={**signed, 'signature': body.signature})
    if not proof.get('valid'): raise HTTPException(401, 'The wallet signature did not match.')
    address = signed['address']
    user = store.user_for_identity('wallet', address.lower(), f'{address[:6]}…{address[-4:]}')
    store.start_session(user['id'], request, response)
    return {'user': store.public(user)}

@router.post('/api/auth/register', dependencies=[Depends(store.same_origin)])
def register(body: Register, request: Request, response: Response):
    store.ensure()
    store.throttle('register|' + store.visitor(request), 10, 3600)
    user = store.create_user(body.email, body.password, body.name)
    store.start_session(user['id'], request, response)
    return {'user': store.public(user)}

@router.post('/api/auth/login', dependencies=[Depends(store.same_origin)])
def login(body: Login, request: Request, response: Response):
    store.ensure()
    store.throttle(f'login|{store.visitor(request)}|{body.email.strip().lower()[:120]}', 8, 900)
    user = store.check_login(body.email, body.password)
    store.start_session(user['id'], request, response)
    return {'user': store.public(user)}

@router.post('/api/auth/logout', dependencies=[Depends(store.same_origin)])
def logout(request: Request, response: Response):
    store.end_session(request, response)
    return {'user': None}


# ---- settings, security, privacy ----
@router.patch('/api/account', dependencies=[Depends(store.same_origin)])
def change_settings(body: SettingsChange, user=Depends(store.require_user)):
    return {'user': store.public(store.update_settings(user, body.model_dump(exclude_none=True)))}

@router.post('/api/account/password', dependencies=[Depends(store.same_origin)])
def change_password(body: PasswordChange, request: Request, response: Response, user=Depends(store.require_user)):
    # An account created with a wallet, Google or GitHub has no password yet and may set its first one.
    if user['password'] and not store.verify_password(body.current, user['password']): raise HTTPException(403, 'Current password is incorrect.')
    if len(body.new) < 10: raise HTTPException(422, 'Choose a password of at least 10 characters.')
    with db() as conn:
        conn.execute('UPDATE users SET password=? WHERE id=?', (store.hash_password(body.new), user['id']))
    # A changed password signs every other device out.
    store.end_session(request, response, everywhere_else=True, user_id=user['id'])
    store.log(user['id'], 'password_changed')
    return {'changed': True}

@router.get('/api/account/security')
def security(request: Request, user=Depends(store.require_user)):
    with db() as conn:
        events = [dict(row) for row in conn.execute('SELECT created_at, kind, detail FROM account_events WHERE user_id=? ORDER BY id DESC LIMIT 40', (user['id'],))]
    return {'sessions': store.sessions_of(user['id'], request), 'events': events}

@router.post('/api/account/sessions/revoke', dependencies=[Depends(store.same_origin)])
def revoke_other_sessions(request: Request, response: Response, user=Depends(store.require_user)):
    store.end_session(request, response, everywhere_else=True, user_id=user['id'])
    store.log(user['id'], 'other_devices_signed_out')
    return {'sessions': store.sessions_of(user['id'], request)}

@router.get('/api/account/export')
async def export(request: Request, user=Depends(store.require_user)):
    """Everything this service stores about the user, in one file."""
    activity = await account_activity(user)
    return {'account': store.public(user), 'security': security(request, user), **activity}

@router.post('/api/account/delete', dependencies=[Depends(store.same_origin)])
def delete_account(body: Confirm, request: Request, response: Response, user=Depends(store.require_user)):
    confirmed = store.verify_password(body.password, user['password']) if user['password'] else body.password == 'DELETE'
    if not confirmed: raise HTTPException(403, 'Password is incorrect.' if user['password'] else 'Type DELETE to confirm.')
    if any(plan['status'] in ACTIVE for plan, _ in store.plans_of(user['id'])):
        raise HTTPException(409, 'A mission is still running. Wait for it to finish or cancel it first.')
    store.end_session(request, response)
    store.delete_user(user['id'])
    return {'deleted': True}


# ---- wallet ----
@router.get('/api/account/wallet')
async def account_wallet(user=Depends(store.require_user)):
    wallet = await payments('GET', '/wallet', account=user['id'])
    settings = store.public(user)['settings']
    return {**wallet, 'limits': {key: settings[key] for key in ('max_per_mission_ausd', 'max_per_day_ausd', 'payments_paused')},
            'spent_today_ausd': str(store.spent_today(user['id']))}

@router.post('/api/account/wallet/grant', dependencies=[Depends(store.same_origin)])
async def starter_grant(user=Depends(store.require_user)):
    result = await payments('POST', '/accounts/grant', account=user['id'], timeout=120)
    store.log(user['id'], 'starter_funds_received', f"{result.get('amount_ausd')} AUSD")
    return result

@router.post('/api/account/wallet/deposit', dependencies=[Depends(store.same_origin)])
async def deposit(body: Deposit, user=Depends(store.require_user)):
    """Top up from a wallet the user holds themselves: they signed one transfer authorization."""
    result = await payments('POST', '/accounts/deposit', account=user['id'], timeout=120,
                            json={'from': body.sender, **body.model_dump(exclude={'sender'})})
    store.log(user['id'], 'deposit', f'{body.amount_ausd} AUSD from {body.sender}')
    return result

@router.post('/api/account/wallet/withdraw', dependencies=[Depends(store.same_origin)])
async def withdraw(body: Withdrawal, user=Depends(store.require_user)):
    result = await payments('POST', '/accounts/withdraw', account=user['id'], json=body.model_dump(), timeout=120)
    store.log(user['id'], 'withdrawal', f'{body.amount_ausd} AUSD to {body.to}')
    return result

@router.post('/api/account/missions/{plan_id}/return-funds', dependencies=[Depends(store.same_origin)])
async def return_funds(plan_id: str, user=Depends(store.require_user)):
    """Send what the robot still holds for one mission back to the user's wallet now."""
    if store.owner_of(plan_id) != user['id']: raise HTTPException(404, 'Mission not found')
    return await payments('POST', f'/missions/{plan_id}/close', timeout=120)


# ---- what was ordered and what was paid ----
async def account_activity(user):
    plans = store.plans_of(user['id'])
    mine = {plan['id'] for plan, _ in plans}
    try:
        receipts = {r['request_id']: r for r in await payments('GET', '/transactions') if r.get('task_id') in mine}
        floats = {m['task_id']: m for m in await payments('GET', '/missions') if m['task_id'] in mine}
        transfers = (await payments('GET', '/accounts/transfers', account=user['id']))['transfers']
        ledger_online = True
    except HTTPException:
        receipts, floats, transfers, ledger_online = {}, {}, [], False
    orders = []
    for plan, created in plans:
        # A test payment that was prepared but never authorized is not an order.
        if plan['planner'] == 'account_test_payment' and plan['status'] == 'planned': continue
        real = plan['request']['execution_mode'] == 'testnet'
        steps = []
        for step in plan['subtasks']:
            decision = step.get('decision') or {}
            chosen = next((c['model'] for c in decision.get('candidates', []) if c['model']['id'] == decision.get('selected_model_id')), None)
            # The ledger is the authority for a real payment; the plan keeps what the mission saw.
            payment = receipts.get(f"{plan['id']}_{step['id']}") or step.get('payment')
            steps.append({'id': step['id'], 'title': step['title'], 'capability': step['task_type'], 'status': step['status'],
                          'provider': chosen['name'] if chosen else None, 'vendor': chosen['provider_id'] if chosen else None,
                          'quoted_ausd': chosen['price_ausd'] if chosen else None, 'error': step.get('error'), 'payment': payment})
        orders.append({'id': plan['id'], 'task': plan['request']['task'], 'mode': plan['request']['execution_mode'], 'status': plan['status'],
                       'created_at': created, 'estimated_ausd': plan['estimated_cost_ausd'],
                       'spent_ausd': plan['spent_ausd'] if real else plan['simulation_cost_ausd'], 'steps': steps,
                       'funding': floats.get(plan['id'])})
    settled = [s['payment'] for o in orders if o['mode'] == 'testnet' for s in o['steps'] if (s['payment'] or {}).get('status') == 'settled']
    return {'orders': orders, 'wallet_transfers': transfers, 'ledger_online': ledger_online,
            'totals': {'paid_ausd': str(sum((Decimal(p['amount_ausd']) for p in settled), Decimal(0))), 'payments': len(settled),
                       'vendors_paid': len({p.get('pay_to') or p.get('provider_id') for p in settled}),
                       'missions': len(orders), 'paid_missions': sum(1 for o in orders if o['mode'] == 'testnet')}}

@router.get('/api/account/activity')
async def activity(user=Depends(store.require_user)):
    return await account_activity(user)


@router.post('/api/account/test-payment', dependencies=[Depends(store.same_origin)])
def test_payment(user=Depends(store.require_user)):
    """Prepare one real purchase without a planning call: the robot buys a sensor summary of its
    surroundings. The user then reviews and pays for it on the same payment screen a mission uses."""
    from services.agent.executor import save
    from services.agent.quote import quote
    request = MissionRequest(execution_mode='testnet', auto_bounties=False, budget_ausd='0.01', robot_card=RobotCard(embodiment='mobile_base'),
                             task='Live payment check: buy one sensor summary of the scene around the robot')
    plan = MissionPlan(id=uuid4().hex, request=request, planner='account_test_payment',
                       explanation='A single real purchase started from the account page to confirm that payments settle.',
                       subtasks=[Subtask(id='scene', title='Summarize the scene around the robot', task_type='scene_inspection', depends_on=[],
                                         target=Point(x=12, y=8), description='Buy one sensor summary from a marketplace provider.',
                                         success_criteria='A provider returns the summary and the payment settles onchain.')])
    plan = quote(plan)
    if plan.status == 'blocked': raise HTTPException(409, plan.blockers[0] if plan.blockers else 'No provider is available for the test purchase.')
    save(plan)
    store.claim(plan.id, user['id'])
    return plan
