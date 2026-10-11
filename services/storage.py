import json
import os
import sqlite3
from pathlib import Path
from contextlib import contextmanager

@contextmanager
def db():
    path = Path(os.getenv('ROBOMARKET_DB', 'data/robomarket.sqlite'))
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA journal_mode=WAL')
    conn.executescript('''
      CREATE TABLE IF NOT EXISTS models (id TEXT PRIMARY KEY, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS plans (id TEXT PRIMARY KEY, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS telemetry (id INTEGER PRIMARY KEY, created_at TEXT DEFAULT CURRENT_TIMESTAMP, body TEXT NOT NULL);
    ''')
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

def event(body):
    with db() as conn:
        conn.execute('INSERT INTO telemetry(body) VALUES (?)', (json.dumps(body),))
