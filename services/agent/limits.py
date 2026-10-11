"""Spend guard for planning: each plan is a paid Anthropic call made with the server's key."""
import os
import time
from fastapi import Request
from services.storage import db
from services.agent.planner import PlannerError

def admit(request: Request):
    # Behind a hosting proxy the socket peer is the proxy; the first forwarded address is the visitor.
    # A caller can forge that header, so the daily total is the limit that bounds spend.
    forwarded = request.headers.get('x-forwarded-for', '').split(',')[0].strip()
    visitor = forwarded or (request.client.host if request.client else 'unknown')
    now = time.time()
    with db() as conn:
        conn.execute('DELETE FROM planner_calls WHERE ts < ?', (now - 86400,))
        total = conn.execute('SELECT COUNT(*) FROM planner_calls').fetchone()[0]
        recent = conn.execute('SELECT COUNT(*) FROM planner_calls WHERE visitor=? AND ts>?', (visitor, now - 3600)).fetchone()[0]
        if total >= int(os.getenv('PLANNER_MAX_CALLS_PER_DAY', '500')):
            raise PlannerError('This deployment reached its daily planning limit. Try again tomorrow.', 429)
        if recent >= int(os.getenv('PLANNER_MAX_CALLS_PER_VISITOR_HOUR', '60')):
            raise PlannerError('Planning limit reached for this visitor. Try again within the hour.', 429)
        # Attempts count, not successes: a failed plan may still have been billed.
        conn.execute('INSERT INTO planner_calls(ts, visitor) VALUES (?, ?)', (now, visitor))
