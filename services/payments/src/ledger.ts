import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function units(value: string): number {
  if (!/^(0|[1-9]\d{0,8})(\.\d{1,6})?$/.test(value)) throw new Error('Invalid AUSD decimal amount');
  const [whole, fraction = ''] = value.split('.');
  return Number(whole) * 1_000_000 + Number(fraction.padEnd(6, '0'));
}
export function money(value: number) { return (value / 1_000_000).toFixed(6); }
export function fingerprint(value: unknown): string {
  const canonical = (v: any): any => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object'
    ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}
export interface Policy { maxCall: number; maxTask: number; maxSession: number; maxDaily: number; approvalThreshold: number; vendors: string[]; }
export type Row = { id: string; task: string; digest: string; vendor: string; model: string; amount: number; status: string; tx: string | null; result: string | null; error: string | null; created_at: string; };
export class Ledger {
  db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS purchases(id TEXT PRIMARY KEY, task TEXT, digest TEXT, vendor TEXT, model TEXT,
        amount INTEGER, status TEXT, tx TEXT, result TEXT, error TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS authorizations(nonce TEXT PRIMARY KEY, request_id TEXT UNIQUE, payload TEXT);
    `);
    // An interrupted intent may have broadcast a transaction. Never release it automatically.
    this.db.prepare("UPDATE purchases SET status='uncertain', error='Process restarted; reconcile before retry' WHERE status IN ('reserved','settling')").run();
  }
  get(id: string) { return this.db.prepare('SELECT * FROM purchases WHERE id=?').get(id) as Row | undefined; }
  rows() { return this.db.prepare('SELECT * FROM purchases ORDER BY created_at DESC, rowid DESC LIMIT 200').all() as Row[]; }
  used(where = '', params: string[] = []) {
    return Number((this.db.prepare(`SELECT COALESCE(SUM(amount),0) AS n FROM purchases WHERE status != 'failed' ${where}`).get(...params) as any).n);
  }
  reserve(id: string, task: string, digest: string, vendor: string, model: string, amount: number, policy: Policy) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const existing = this.get(id);
      if (existing) {
        if (existing.digest !== digest) throw new Error('Idempotency key reused with a different request');
        this.db.exec('COMMIT'); return existing;
      }
      if (!policy.vendors.includes(vendor)) throw new Error('Vendor is not in Allowance allowlist');
      if (amount <= 0 || amount > policy.maxCall) throw new Error('Per-call Allowance exceeded');
      if (amount > policy.approvalThreshold) throw new Error('Human-approval threshold exceeded');
      if (this.used('AND task=?', [task]) + amount > policy.maxTask) throw new Error('Per-task Allowance exceeded');
      if (this.used() + amount > policy.maxSession) throw new Error('Session Allowance exceeded');
      if (this.used("AND date(created_at)=date('now')") + amount > policy.maxDaily) throw new Error('Daily Allowance exceeded');
      this.db.prepare("INSERT INTO purchases(id,task,digest,vendor,model,amount,status) VALUES (?,?,?,?,?,?,'reserved')").run(id,task,digest,vendor,model,amount);
      this.db.exec('COMMIT'); return this.get(id)!;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  authorization(id: string, nonce: string, payload: unknown) {
    this.db.prepare('INSERT INTO authorizations VALUES (?,?,?)').run(nonce,id,JSON.stringify(payload));
  }
  update(id: string, status: string, tx: string | null = null, result: unknown = null, error: string | null = null) {
    this.db.prepare('UPDATE purchases SET status=?,tx=COALESCE(?,tx),result=COALESCE(?,result),error=? WHERE id=?')
      .run(status,tx,result === null ? null : JSON.stringify(result),error,id);
  }
  receipt(row: Row) {
    return { request_id: row.id, task_id: row.task, provider_id: row.vendor, model_id: row.model,
      amount_ausd: money(row.amount), status: row.status, transaction_hash: row.tx, timestamp: row.created_at,
      explorer_url: row.status === 'settled' && row.tx ? `https://sepolia.basescan.org/tx/${row.tx}` : null,
      network: 'eip155:84532', mode: 'testnet', error: row.error };
  }
}
