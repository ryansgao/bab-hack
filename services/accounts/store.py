"""Users, sessions, mission ownership and per-user spending limits (gateway SQLite).

Passwords are stored as scrypt hashes and sessions as SHA-256 digests of a random token, so a
copy of the database signs nobody in. The token itself lives only in an HttpOnly cookie.
"""
import hashlib
import hmac
import json
import os
import re
import secrets
import time
from datetime import datetime, timezone
from decimal import Decimal
from urllib.parse import urlparse
from uuid import uuid4
from fastapi import HTTPException, Request, Response
from services.storage import db

COOKIE = 'rb_session'
SESSION_SECONDS = 14 * 86400
EMAIL = re.compile(r'^[^@\s]{1,64}@[^@\s]{1,190}\.[^@\s]{2,24}$')
MONEY = re.compile(r'^(0|[1-9]\d{0,8})(\.\d{1,6})?$')
NO_EMAIL = '@no-email.rbazaar.invalid'  # placeholder for accounts whose sign-in method gave no email
DEFAULTS = {'max_per_mission_ausd': '0.10', 'max_per_day_ausd': '1.00', 'payments_paused': False,
            'save_simulation_history': True}
_ready = None


def enforced():
    """ACCOUNTS_REQUIRED=0 restores the open single-operator behaviour (local development)."""
    return os.getenv('ACCOUNTS_REQUIRED', '1') != '0'


def ensure():
    global _ready
    target = os.getenv('ROBOMARKET_DB', 'data/robomarket.sqlite')
    if _ready == target: return
    with db() as conn:
        conn.executescript('''
          CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
            password TEXT NOT NULL, settings TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
          CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at REAL NOT NULL,
            expires_at REAL NOT NULL, device TEXT NOT NULL, address TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS auth_attempts (ts REAL NOT NULL, key TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS plan_owners (plan_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
          CREATE TABLE IF NOT EXISTS account_events (id INTEGER PRIMARY KEY, user_id TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP, kind TEXT NOT NULL, detail TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS identities (provider TEXT NOT NULL, subject TEXT NOT NULL, user_id TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (provider, subject));
          CREATE TABLE IF NOT EXISTS auth_challenges (token TEXT PRIMARY KEY, detail TEXT NOT NULL, expires_at REAL NOT NULL);
        ''')
    _ready = target


def digest(token): return hashlib.sha256(token.encode()).hexdigest()


def hash_password(password, salt=None):
    salt = salt or secrets.token_bytes(16)
    key = hashlib.scrypt(password.encode(), salt=salt, n=2**15, r=8, p=1, maxmem=64 * 1024 * 1024, dklen=32)
    return f'scrypt$15$8$1${salt.hex()}${key.hex()}'


def verify_password(password, stored):
    try: salt = bytes.fromhex(stored.split('$')[4])
    except (IndexError, ValueError): return False
    return hmac.compare_digest(hash_password(password, salt), stored)


def visitor(request: Request):
    forwarded = request.headers.get('x-forwarded-for', '').split(',')[0].strip()
    return forwarded or (request.client.host if request.client else 'unknown')


def same_origin(request: Request):
    """Refuse a state-changing request sent from another site. The cookie is SameSite=Lax as well.
    Host names are compared without ports: a proxy in front may listen on a different port than the
    one the browser used, and cookies are not scoped by port either."""
    origin = request.headers.get('origin')
    if not origin: return
    sent_to = {urlparse('//' + (request.headers.get(name) or '').split(',')[0].strip()).hostname for name in ('x-forwarded-host', 'host')}
    if urlparse(origin).hostname not in sent_to - {None}: raise HTTPException(403, 'Cross-site request refused')


def throttle(key, limit, seconds):
    ensure()
    now = time.time()
    with db() as conn:
        conn.execute('DELETE FROM auth_attempts WHERE ts < ?', (now - 86400,))
        recent = conn.execute('SELECT COUNT(*) FROM auth_attempts WHERE key=? AND ts>?', (key, now - seconds)).fetchone()[0]
        if recent >= limit: raise HTTPException(429, 'Too many attempts. Wait a few minutes and try again.')
        conn.execute('INSERT INTO auth_attempts(ts, key) VALUES (?, ?)', (now, key))


def public(row):
    with db() as conn:
        linked = [r['provider'] for r in conn.execute('SELECT provider FROM identities WHERE user_id=? ORDER BY provider', (row['id'],))]
    return {'id': row['id'], 'email': '' if row['email'].endswith(NO_EMAIL) else row['email'], 'name': row['name'],
            'created_at': row['created_at'], 'settings': {**DEFAULTS, **json.loads(row['settings'])},
            'has_password': bool(row['password']), 'sign_in_methods': (['password'] if row['password'] else []) + linked}


def log(user_id, kind, detail=''):
    with db() as conn:
        conn.execute('INSERT INTO account_events(user_id, kind, detail) VALUES (?, ?, ?)', (user_id, kind, detail[:300]))


def create_user(email, password, name):
    ensure()
    email = email.strip().lower()
    if not EMAIL.match(email): raise HTTPException(422, 'Enter a valid email address.')
    if len(password) < 10: raise HTTPException(422, 'Choose a password of at least 10 characters.')
    if len(password) > 200: raise HTTPException(422, 'Choose a shorter password.')
    user_id = 'u' + uuid4().hex[:15]
    with db() as conn:
        if conn.execute('SELECT 1 FROM users WHERE email=?', (email,)).fetchone():
            raise HTTPException(409, 'An account with this email already exists. Sign in instead.')
        conn.execute('INSERT INTO users(id, email, name, password, settings) VALUES (?, ?, ?, ?, ?)',
                     (user_id, email, (name.strip() or email.split('@')[0])[:60], hash_password(password), json.dumps(DEFAULTS)))
    log(user_id, 'account_created')
    return get_user(user_id)


def user_for_identity(provider, subject, name, email=None):
    """Sign-in without a password (a wallet signature, Google, GitHub): the account that owns this
    identity, created on first use. An identity never attaches itself to an existing account by
    email, because the email of a password account here was never verified."""
    ensure()
    with db() as conn:
        row = conn.execute('SELECT u.* FROM identities i JOIN users u ON u.id=i.user_id WHERE i.provider=? AND i.subject=?', (provider, subject)).fetchone()
        if row: return dict(row)
        email = (email or f'{provider}-{subject}{NO_EMAIL}').strip().lower()
        if conn.execute('SELECT 1 FROM users WHERE email=?', (email,)).fetchone():
            raise HTTPException(409, 'An account with this email already exists. Sign in with its password instead.')
        user_id = 'u' + uuid4().hex[:15]
        conn.execute('INSERT INTO users(id, email, name, password, settings) VALUES (?, ?, ?, ?, ?)',
                     (user_id, email, (name.strip() or 'rBazaar user')[:60], '', json.dumps(DEFAULTS)))
        conn.execute('INSERT INTO identities(provider, subject, user_id) VALUES (?, ?, ?)', (provider, subject, user_id))
    log(user_id, 'account_created', provider)
    return get_user(user_id)


def challenge(detail, seconds=300):
    """A single-use random token that expires: the nonce of a wallet sign-in, the state of an OAuth round trip."""
    ensure()
    token = secrets.token_urlsafe(24)
    with db() as conn:
        conn.execute('DELETE FROM auth_challenges WHERE expires_at < ?', (time.time(),))
        conn.execute('INSERT INTO auth_challenges VALUES (?, ?, ?)', (token, detail, time.time() + seconds))
    return token


def redeem(token):
    """The detail stored with a challenge, exactly once; None when unknown, used or expired."""
    ensure()
    with db() as conn:
        row = conn.execute('SELECT detail FROM auth_challenges WHERE token=? AND expires_at>?', (token, time.time())).fetchone()
        conn.execute('DELETE FROM auth_challenges WHERE token=?', (token,))
    return row['detail'] if row else None


def get_user(user_id):
    with db() as conn:
        row = conn.execute('SELECT * FROM users WHERE id=?', (user_id,)).fetchone()
    return dict(row) if row else None


def check_login(email, password):
    ensure()
    with db() as conn:
        row = conn.execute('SELECT * FROM users WHERE email=?', (email.strip().lower(),)).fetchone()
    # Hash even when the email is unknown, so timing does not reveal which emails have accounts.
    if not verify_password(password, row['password'] if row else hash_password('x', b'0' * 16)) or not row:
        raise HTTPException(401, 'Email or password is incorrect.')
    return dict(row)


def start_session(user_id, request: Request, response: Response):
    token = secrets.token_urlsafe(32)
    now = time.time()
    with db() as conn:
        conn.execute('DELETE FROM sessions WHERE expires_at < ?', (now,))
        conn.execute('INSERT INTO sessions VALUES (?, ?, ?, ?, ?, ?)', (digest(token), user_id, now, now + SESSION_SECONDS,
                     request.headers.get('user-agent', 'Unknown device')[:160], visitor(request)[:60]))
    secure = request.url.scheme == 'https' or request.headers.get('x-forwarded-proto', '') == 'https'
    response.set_cookie(COOKIE, token, max_age=SESSION_SECONDS, httponly=True, samesite='lax', secure=secure, path='/')
    log(user_id, 'signed_in', visitor(request))


def end_session(request: Request, response: Response, everywhere_else=False, user_id=None):
    token = request.cookies.get(COOKIE)
    with db() as conn:
        if everywhere_else and user_id:
            conn.execute('DELETE FROM sessions WHERE user_id=? AND token_hash != ?', (user_id, digest(token or '')))
        elif token:
            conn.execute('DELETE FROM sessions WHERE token_hash=?', (digest(token),))
    if not everywhere_else: response.delete_cookie(COOKIE, path='/')


def current_user(request: Request):
    """The signed-in user's row, or None. Never raises, so public pages can call it freely."""
    token = request.cookies.get(COOKIE)
    if not token: return None
    ensure()
    with db() as conn:
        row = conn.execute('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?',
                           (digest(token), time.time())).fetchone()
    return dict(row) if row else None


def require_user(request: Request):
    user = current_user(request)
    if not user: raise HTTPException(401, 'Sign in to continue.')
    return user


def sessions_of(user_id, request: Request):
    here = digest(request.cookies.get(COOKIE, ''))
    with db() as conn:
        rows = conn.execute('SELECT * FROM sessions WHERE user_id=? AND expires_at>? ORDER BY created_at DESC', (user_id, time.time())).fetchall()
    return [{'device': r['device'], 'address': r['address'], 'current': r['token_hash'] == here,
             'signed_in_at': datetime.fromtimestamp(r['created_at'], timezone.utc).isoformat(timespec='seconds')} for r in rows]


def update_settings(user, changes):
    settings = {**DEFAULTS, **json.loads(user['settings'])}
    for key in ('max_per_mission_ausd', 'max_per_day_ausd'):
        if key in changes:
            value = str(changes[key])
            if not MONEY.match(value) or Decimal(value) <= 0: raise HTTPException(422, 'Limits must be positive amounts with up to six decimal places.')
            settings[key] = value
    for key in ('payments_paused', 'save_simulation_history'):
        if key in changes: settings[key] = bool(changes[key])
    name = str(changes.get('name', user['name'])).strip()[:60] or user['name']
    with db() as conn:
        conn.execute('UPDATE users SET settings=?, name=? WHERE id=?', (json.dumps(settings), name, user['id']))
    log(user['id'], 'settings_changed', ', '.join(sorted(changes)))
    return get_user(user['id'])


# ---- which missions belong to whom ----
def claim(plan_id, user_id):
    ensure()
    with db() as conn:
        conn.execute('INSERT OR IGNORE INTO plan_owners(plan_id, user_id) VALUES (?, ?)', (plan_id, user_id))


def owner_of(plan_id):
    ensure()
    with db() as conn:
        row = conn.execute('SELECT user_id FROM plan_owners WHERE plan_id=?', (plan_id,)).fetchone()
    return row['user_id'] if row else None


def plan_ids_of(user_id):
    ensure()
    with db() as conn:
        return {row['plan_id'] for row in conn.execute('SELECT plan_id FROM plan_owners WHERE user_id=?', (user_id,))}


def plans_of(user_id):
    """The user's missions, newest first, as (plan dict, created_at)."""
    with db() as conn:
        rows = conn.execute('SELECT p.body, o.created_at FROM plan_owners o JOIN plans p ON p.id=o.plan_id WHERE o.user_id=? ORDER BY o.rowid DESC LIMIT 200',
                            (user_id,)).fetchall()
    return [(json.loads(row['body']), row['created_at']) for row in rows]


def spent_today(user_id):
    today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    total = Decimal(0)
    for plan, _ in plans_of(user_id):
        for step in plan['subtasks']:
            payment = step.get('payment') or {}
            # An uncertain payment may have left the wallet, so it counts until it is reconciled.
            if payment.get('status') in ('settled', 'uncertain') and str(payment.get('timestamp', '')).startswith(today):
                total += Decimal(payment['amount_ausd'])
    return total


def authorize_spend(user, plan):
    """The user's own limits, checked when a paid mission starts. The payment service's Allowance
    still bounds every single purchase after this."""
    settings = {**DEFAULTS, **json.loads(user['settings'])}
    if settings['payments_paused']: raise HTTPException(402, 'Payments are paused on your account. Resume them under Spending limits.')
    cost = Decimal(plan.estimated_cost_ausd)
    if cost > Decimal(settings['max_per_mission_ausd']):
        raise HTTPException(402, f"This mission is quoted at {cost} AUSD, above your per-mission limit of {settings['max_per_mission_ausd']} AUSD.")
    if spent_today(user['id']) + cost > Decimal(settings['max_per_day_ausd']):
        raise HTTPException(402, f"This mission would pass your daily limit of {settings['max_per_day_ausd']} AUSD.")


def delete_user(user_id):
    """Remove the person. Their missions are deleted; payment records stay in the ledger and on
    chain (they are financial records) but no longer point at anyone."""
    with db() as conn:
        conn.execute("DELETE FROM plans WHERE id IN (SELECT plan_id FROM plan_owners WHERE user_id=?)", (user_id,))
        for table in ('plan_owners', 'sessions', 'account_events', 'identities'):
            conn.execute(f'DELETE FROM {table} WHERE user_id=?', (user_id,))
        conn.execute('DELETE FROM users WHERE id=?', (user_id,))
