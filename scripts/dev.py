"""Launch the local gateway, private models, and x402 service with one shared key."""
import os
import secrets
import signal
import subprocess
import sys
import time
from pathlib import Path
import certifi
from dotenv import load_dotenv

root=Path(__file__).resolve().parents[1]
os.chdir(root)
load_dotenv(root/'.env')
if not os.getenv('SERVICE_KEY'): os.environ['SERVICE_KEY']=secrets.token_hex(32)
os.environ.setdefault('TORCH_HOME',str(root/'data/torch'))
os.environ.setdefault('HF_HOME',str(root/'data/huggingface'))
os.environ.setdefault('SSL_CERT_FILE',certifi.where())
if not (root/'apps/frontend/dist/index.html').exists(): subprocess.run(['npm','run','build'],check=True)
commands=[
    [sys.executable,'-m','uvicorn','services.api:app','--host','127.0.0.1','--port','8000','--no-access-log'],
    [sys.executable,'-m','uvicorn','services.models.app:app','--host','127.0.0.1','--port','8001','--no-access-log'],
    ['node','--import','tsx','services/payments/src/server.ts'],
]
children=[]
try:
    for command in commands: children.append(subprocess.Popen(command))
    print('rBazaar: http://127.0.0.1:8000 | API docs: http://127.0.0.1:8000/docs',flush=True)
    print('Missing wallet keys keep live purchases blocked. No mock payments are generated.',flush=True)
    while all(child.poll() is None for child in children): time.sleep(.5)
except KeyboardInterrupt: pass
finally:
    for child in children:
        if child.poll() is None: child.terminate()
    for child in children:
        try: child.wait(timeout=8)
        except subprocess.TimeoutExpired: child.kill()
