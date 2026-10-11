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
export type Row = { id: string; task: string; digest: string; vendor: string; model: string; amount: number; status: string; tx: string | null; result: string | null; error: string | null; created_at: string; pay_to: string | null; audit_tx: string | null; };
export type FloatKind = 'fund' | 'sweep' | 'consolidate';
export class Ledger {
  db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS purchases(id TEXT PRIMARY KEY, task TEXT, digest TEXT, vendor TEXT, model TEXT,
        amount INTEGER, status TEXT, tx TEXT, result TEXT, error TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS authorizations(nonce TEXT PRIMARY KEY, request_id TEXT UNIQUE, payload TEXT);
      CREATE TABLE IF NOT EXISTS float_transfers(id INTEGER PRIMARY KEY AUTOINCREMENT, task TEXT, kind TEXT, amount INTEGER,
        tx TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    `);
    // Ledgers created before per-vendor payouts and the BNB audit trail lack these columns.
    const columns = (this.db.prepare('PRAGMA table_info(purchases)').all() as { name: string }[]).map(c => c.name);
    for (const column of ['pay_to', 'audit_tx']) if (!columns.includes(column)) this.db.exec(`ALTER TABLE purchases ADD COLUMN ${column} TEXT`);
    // An interrupted intent may have broadcast a transaction. Never release it automatically.
    this.db.prepare("UPDATE purchases SET status='uncertain', error='Process restarted; reconcile before retry' WHERE status IN ('reserved','settling')").run();
  }
  get(id: string) { return this.db.prepare('SELECT * FROM purchases WHERE id=?').get(id) as Row | undefined; }
  rows() { return this.db.prepare('SELECT * FROM purchases ORDER BY created_at DESC, rowid DESC LIMIT 200').all() as Row[]; }
  used(where = '', params: string[] = []) {
    return Number((this.db.prepare(`SELECT COALESCE(SUM(amount),0) AS n FROM purchases WHERE status != 'failed' ${where}`).get(...params) as any).n);
  }
  /** Every Allowance rule, with no side effect, so money is never moved for a purchase that will be refused. */
  check(task: string, vendor: string, amount: number, policy: Policy) {
    if (!policy.vendors.includes(vendor)) throw new Error('Vendor is not in Allowance allowlist');
    if (amount <= 0 || amount > policy.maxCall) throw new Error('Per-call Allowance exceeded');
    if (amount > policy.approvalThreshold) throw new Error('Human-approval threshold exceeded');
    if (this.used('AND task=?', [task]) + amount > policy.maxTask) throw new Error('Per-task Allowance exceeded');
    if (this.used() + amount > policy.maxSession) throw new Error('Session Allowance exceeded');
    if (this.used("AND date(created_at)=date('now')") + amount > policy.maxDaily) throw new Error('Daily Allowance exceeded');
  }
  reserve(id: string, task: string, digest: string, vendor: string, model: string, amount: number, policy: Policy, payTo: string | null = null) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const existing = this.get(id);
      if (existing) {
        if (existing.digest !== digest) throw new Error('Idempotency key reused with a different request');
        this.db.exec('COMMIT'); return existing;
      }
      this.check(task, vendor, amount, policy);
      this.db.prepare("INSERT INTO purchases(id,task,digest,vendor,model,amount,status,pay_to) VALUES (?,?,?,?,?,?,'reserved',?)").run(id,task,digest,vendor,model,amount,payTo);
      this.db.exec('COMMIT'); return this.get(id)!;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  // ---- mission float: what the owner has sent to the robot for one mission, and what came back ----
  floatAdd(task: string, kind: FloatKind, amount: number, tx: string) {
    this.db.prepare('INSERT INTO float_transfers(task,kind,amount,tx) VALUES (?,?,?,?)').run(task,kind,amount,tx);
  }
  floatSum(task: string, kind: FloatKind) {
    return Number((this.db.prepare('SELECT COALESCE(SUM(amount),0) AS n FROM float_transfers WHERE task=? AND kind=?').get(task,kind) as any).n);
  }
  /** AUSD sent to the robot for this mission and not yet returned. */
  floatNet(task: string) { return this.floatSum(task,'fund') - this.floatSum(task,'sweep'); }
  /** Part of the float still unspent. Uncertain payments count as spent: the money may have left. */
  floatRemaining(task: string) { return Math.max(0, this.floatNet(task) - this.used('AND task=?', [task])); }
  inFlight(task: string) {
    return Number((this.db.prepare("SELECT COUNT(*) AS n FROM purchases WHERE task=? AND status IN ('reserved','settling')").get(task) as any).n);
  }
  missions() {
    const tasks = this.db.prepare("SELECT task, MAX(created_at) AS last FROM float_transfers WHERE kind IN ('fund','sweep') GROUP BY task ORDER BY last DESC LIMIT 100").all() as { task: string; last: string }[];
    return tasks.map(({ task }) => {
      const transfers = this.db.prepare("SELECT kind,amount,tx,created_at FROM float_transfers WHERE task=? ORDER BY id").all(task) as { kind: string; amount: number; tx: string; created_at: string }[];
      const lastPurchase = (this.db.prepare('SELECT MAX(created_at) AS t FROM purchases WHERE task=?').get(task) as any).t as string | null;
      const lastActivity = [transfers.at(-1)?.created_at, lastPurchase].filter(Boolean).sort().at(-1)!;
      return { task, funded: this.floatSum(task,'fund'), returned: this.floatSum(task,'sweep'), spent: this.used('AND task=?', [task]),
        remaining: this.floatRemaining(task), lastActivity, transfers };
    });
  }
  earnings() {
    return this.db.prepare("SELECT vendor, pay_to, COUNT(*) AS payments, SUM(amount) AS earned FROM purchases WHERE status='settled' GROUP BY vendor, pay_to").all() as { vendor: string; pay_to: string | null; payments: number; earned: number }[];
  }
  setAudit(id: string, tx: string) { this.db.prepare('UPDATE purchases SET audit_tx=? WHERE id=?').run(tx,id); }
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
      network: 'eip155:84532', mode: 'testnet', error: row.error, pay_to: row.pay_to,
      audit_transaction_hash: row.audit_tx, audit_explorer_url: row.audit_tx ? `https://testnet.bscscan.com/tx/${row.audit_tx}` : null };
  }
}
