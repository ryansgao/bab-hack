import { lazy, Suspense, useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowDownLeft, ArrowUpRight, Check, Copy, Download, ExternalLink, Fingerprint, LoaderCircle, LogOut, Pause, Play,
  ShieldCheck, Trash2, Wallet, Zap,
} from "lucide-react";
import type { RoboMarket } from "../lib/useRoboMarket";
import { humanize } from "../lib/types";
import { SignIn } from "./SignIn";
import { ausd, call, intent, session, short, useSession, type AccountWallet, type Activity, type Order, type Security, type Transfer, type User } from "./session";
import "./account.css";

const OwnWalletCard = lazy(() => import("./OwnWallet"));
type Tab = "wallet" | "payments" | "limits" | "profile" | "security";
const TABS: { key: Tab; title: string }[] = [
  { key: "wallet", title: "Wallet" },
  { key: "payments", title: "Payments" },
  { key: "limits", title: "Spending limits" },
  { key: "profile", title: "Profile & privacy" },
  { key: "security", title: "Security" },
];

/** Everything a signed-in user owns here: wallet, payment history, limits, profile, privacy, security. */
export default function AccountArea({ data, tab: start = "wallet" }: { data: RoboMarket; tab?: Tab }) {
  const { user, ready } = useSession();
  const [tab, setTab] = useState<Tab>(() => (intent.take() ? "payments" : start));
  useEffect(() => setTab(start), [start]);
  useEffect(() => {
    const show = () => { intent.take(); setTab("payments"); };
    window.addEventListener("rbazaar:payments", show);
    return () => window.removeEventListener("rbazaar:payments", show);
  }, []);
  if (!ready) return <p className="preview-loading">Loading your account…</p>;
  if (!user)
    return (
      <div className="page enter account-page">
        <div className="page-heading"><div><h1>Your account</h1></div></div>
        <div className="sign-in-layout">
          <SignIn />
          <section className="account-explainer">
            <h3>What an account gives you</h3>
            <ul>
              <li><Wallet size={14} /> A wallet of your own on Base Sepolia, with test AUSD to start.</li>
              <li><ShieldCheck size={14} /> Limits you set: per mission, per day, and a pause switch.</li>
              <li><Fingerprint size={14} /> A record of every payment Scout makes for you, each with its onchain receipt.</li>
            </ul>
            <p className="fine-print">Simulation missions stay open to everyone and need no account.</p>
          </section>
        </div>
      </div>
    );
  return (
    <div className="page enter account-page">
      <div className="page-heading">
        <div>
          <h1>{TABS.find((item) => item.key === tab)?.title}</h1>
          <p>{[user.name, user.email || `signed in with ${user.sign_in_methods.join(", ")}`].join(" · ")}</p>
        </div>
        <button className="secondary" onClick={() => void session.signOut()}><LogOut size={14} /> Sign out</button>
      </div>
      <div className="account-tabs" role="tablist">
        {TABS.map((item) => (
          <button key={item.key} role="tab" aria-selected={tab === item.key} className={tab === item.key ? "active" : ""} onClick={() => setTab(item.key)}>
            {item.title}
          </button>
        ))}
      </div>
      {tab === "wallet" && <WalletTab data={data} />}
      {tab === "payments" && <PaymentsTab planStatus={data.plan?.status} />}
      {tab === "limits" && <LimitsTab user={user} />}
      {tab === "profile" && <ProfileTab user={user} />}
      {tab === "security" && <SecurityTab user={user} />}
    </div>
  );
}

/** Runs one request and shows its outcome next to the control that started it. */
function useAction() {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  async function run(name: string, work: () => Promise<string | void>) {
    setBusy(name); setError(""); setDone("");
    try { setDone((await work()) || ""); } catch (reason) { setError((reason as Error).message); } finally { setBusy(""); }
  }
  return { busy, error, done, run };
}
function Feedback({ action }: { action: ReturnType<typeof useAction> }) {
  if (action.error) return <p className="account-error" role="alert">{action.error}</p>;
  if (action.done) return <p className="account-done" role="status"><Check size={12} /> {action.done}</p>;
  return null;
}
function Card({ title, icon, tag, children }: { title: string; icon?: ReactNode; tag?: string; children: ReactNode }) {
  return (
    <section className="glass account-card">
      <div className="account-card-heading">
        <span className="label-with-icon">{icon}{title}</span>
        {tag && <span className="tag">{tag}</span>}
      </div>
      {children}
    </section>
  );
}
function Receipt({ url, label = "Receipt" }: { url?: string | null; label?: string }) {
  return url ? <a href={url} target="_blank" rel="noreferrer">{label} <ExternalLink size={10} /></a> : null;
}
function TransferRow({ transfer }: { transfer: Transfer }) {
  const incoming = ["grant", "deposit", "robot_to_owner"].includes(transfer.kind);
  const label = { grant: "Starter funds received", deposit: "Added from your own wallet", withdraw: "Withdrawal", owner_to_robot: "Wallet → Scout (mission reserve)", robot_to_owner: "Scout → wallet (unspent returned)" }[transfer.kind] || humanize(transfer.kind);
  return (
    <li>
      <span className={"transfer-icon " + (incoming ? "in" : "out")}>{incoming ? <ArrowDownLeft size={13} /> : <ArrowUpRight size={13} />}</span>
      <div><strong>{label}</strong><small>{transfer.timestamp} UTC{transfer.counterparty && transfer.kind !== "grant" ? ` · ${transfer.kind === "deposit" ? "from" : "to"} ${short(transfer.counterparty)}` : ""}</small></div>
      <div className="payment-step-amount"><strong>{incoming ? "+" : "−"}{ausd(transfer.amount_ausd)} <small>AUSD</small></strong><Receipt url={transfer.explorer_url} label="Transaction" /></div>
    </li>
  );
}

function WalletTab({ data }: { data: RoboMarket }) {
  const [wallet, setWallet] = useState<AccountWallet | null>(null);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loadError, setLoadError] = useState("");
  const [copied, setCopied] = useState(false);
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const action = useAction();
  const load = useCallback(async () => {
    try {
      setWallet(await call<AccountWallet>("/account/wallet"));
      setTransfers((await call<Activity>("/account/activity")).wallet_transfers);
      setLoadError("");
    } catch (reason) { setLoadError((reason as Error).message); }
  }, []);
  useEffect(() => { void load(); const timer = setInterval(() => void load(), 10000); return () => clearInterval(timer); }, [load, data.plan?.status]);
  if (!wallet) return <p className={loadError ? "account-error" : "preview-loading"}>{loadError || "Reading your wallet from Base Sepolia…"}</p>;
  const address = wallet.owner_address;
  async function withdraw(event: FormEvent) {
    event.preventDefault();
    await action.run("withdraw", async () => {
      const result = await call<{ amount_ausd: string }>("/account/wallet/withdraw", { to: to.trim(), amount_ausd: amount.trim() });
      setTo(""); setAmount(""); await load();
      return `Sent ${ausd(result.amount_ausd)} AUSD. It settled onchain.`;
    });
  }
  return (
    <div className="account-grid">
      <Card title={wallet.own_wallet ? "Your wallet" : "Shared treasury"} icon={<Wallet size={15} />} tag="Base Sepolia · test AUSD">
        <div className="wallet-amount">
          <span className="eyebrow">Balance</span>
          <strong>{wallet.owner_treasury_ausd ? ausd(wallet.owner_treasury_ausd) : "—"} <small>AUSD</small></strong>
        </div>
        {address && (
          <div className="address-row">
            <code>{address}</code>
            <button className="secondary" onClick={() => { void navigator.clipboard?.writeText(address); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
              {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "Copied" : "Copy"}
            </button>
            <Receipt url={wallet.owner_explorer_url} label="Explorer" />
          </div>
        )}
        <p className="account-note">
          {wallet.own_wallet
            ? "This address is yours alone. Send test AUSD on Base Sepolia to it to add funds. rBazaar holds its key for you (a custodial testnet wallet), so never send real assets."
            : "Per-user wallets are not enabled on this server, so missions are paid from one shared testnet treasury."}
        </p>
        {wallet.setup_error && <p className="account-error">{wallet.setup_error}</p>}
        <div className="account-actions">
          {wallet.starter_grant && !wallet.starter_grant.claimed && (
            <button className="primary" disabled={!!action.busy} onClick={() => void action.run("grant", async () => {
              const result = await call<{ amount_ausd: string }>("/account/wallet/grant", {});
              await load();
              return `${ausd(result.amount_ausd)} test AUSD arrived in your wallet.`;
            })}>
              {action.busy === "grant" ? <LoaderCircle size={13} className="spin" /> : <Zap size={13} />} Get {ausd(wallet.starter_grant.amount_ausd)} test AUSD
            </button>
          )}
          <button className="secondary" disabled={!!action.busy || data.busy} onClick={() => void action.run("test", async () => {
            const plan = await call<{ id: string }>("/account/test-payment", {});
            // Review and pay on the same payment screen a mission uses.
            if (await data.openMission(plan.id)) window.dispatchEvent(new Event("rbazaar:checkout"));
          })}>
            {action.busy === "test" ? <LoaderCircle size={13} className="spin" /> : <Play size={13} />} Send a live test payment
          </button>
        </div>
        <Feedback action={action} />
        <p className="fine-print">A live test payment buys one sensor summary from a marketplace provider for about 0.001 AUSD, through the same path a mission uses.</p>
      </Card>

      {wallet.own_wallet && (
        <Suspense fallback={<section className="glass account-card"><p className="preview-loading">Loading wallet connection…</p></section>}>
          <OwnWalletCard wallet={wallet} onDeposited={() => void load()} onUseAddress={setTo} />
        </Suspense>
      )}

      <Card title="Scout, your paying agent" icon={<ShieldCheck size={15} />}>
        <dl className="spec-list">
          <div><dt>Scout holds right now</dt><dd>{wallet.balance_ausd ? ausd(wallet.balance_ausd) : "—"} AUSD</dd></div>
          <div><dt>Scout's address</dt><dd>{wallet.wallet_address ? short(wallet.wallet_address) : "—"}</dd></div>
          <div><dt>Your limit per mission</dt><dd>{ausd(wallet.limits.max_per_mission_ausd)} AUSD</dd></div>
          <div><dt>Your limit per day</dt><dd>{ausd(wallet.limits.max_per_day_ausd)} AUSD</dd></div>
          <div><dt>Paid today</dt><dd>{ausd(wallet.spent_today_ausd)} AUSD</dd></div>
          <div><dt>rBazaar cap per purchase</dt><dd>{ausd(wallet.allowance.max_per_request_ausd)} AUSD</dd></div>
          <div><dt>rBazaar cap per mission</dt><dd>{ausd(wallet.allowance.max_per_task_ausd)} AUSD</dd></div>
        </dl>
        {wallet.limits.payments_paused && <p className="account-error">Payments are paused on your account.</p>}
        <ol className="flow-steps">
          <li><strong>Reserve.</strong> When a paid mission starts, your wallet sends Scout that mission's reserve, never more.</li>
          <li><strong>Pay.</strong> Scout pays each provider separately as it uses a skill. You pay no network fee.</li>
          <li><strong>Return.</strong> Whatever Scout did not spend goes back to your wallet when the mission ends.</li>
        </ol>
        {wallet.policy_chain && <Receipt url={wallet.policy_chain.explorer_url} label={`Spending policy on BNB chain · ${wallet.policy_chain.receipt_count} receipts`} />}
      </Card>

      {wallet.own_wallet && (
        <Card title="Withdraw" icon={<ArrowUpRight size={15} />}>
          <form className="account-form" onSubmit={withdraw}>
            <label className="account-field">To address
              <input required pattern="^0x[0-9a-fA-F]{40}$" value={to} onChange={(e) => setTo(e.target.value)} placeholder="0x… on Base Sepolia" />
            </label>
            <label className="account-field">Amount (AUSD)
              <input required inputMode="decimal" pattern="^(0|[1-9]\d{0,8})(\.\d{1,6})?$" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.10" />
            </label>
            <button className="secondary" disabled={!!action.busy}>
              {action.busy === "withdraw" && <LoaderCircle size={13} className="spin" />} Withdraw
            </button>
          </form>
          <p className="fine-print">Withdrawals settle onchain in a few seconds and cost you no network fee.</p>
        </Card>
      )}

      <Card title="Money in and out" icon={<Fingerprint size={15} />} tag={`${transfers.length}`}>
        {transfers.length ? <ul className="transfer-list">{transfers.map((t) => <TransferRow key={t.transaction_hash} transfer={t} />)}</ul>
          : <p className="account-note">Starter funds and withdrawals will be listed here. Payments to providers are under Payments.</p>}
      </Card>
    </div>
  );
}

function PaymentsTab({ planStatus }: { planStatus?: string }) {
  const [activity, setActivity] = useState<Activity | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "testnet" | "simulation">("all");
  const action = useAction();
  const load = useCallback(() => call<Activity>("/account/activity").then((next) => { setActivity(next); setError(""); }).catch((reason: Error) => setError(reason.message)), []);
  useEffect(() => { void load(); const timer = setInterval(() => void load(), 4000); return () => clearInterval(timer); }, [load, planStatus]);
  if (!activity) return <p className={error ? "account-error" : "preview-loading"}>{error || "Loading your payments…"}</p>;
  const orders = activity.orders.filter((order) => filter === "all" || order.mode === filter);
  return (
    <>
      <div className="account-totals">
        <div className="glass"><span className="eyebrow">Paid in AUSD</span><strong>{ausd(activity.totals.paid_ausd)}</strong></div>
        <div className="glass"><span className="eyebrow">Payments settled</span><strong>{activity.totals.payments}</strong></div>
        <div className="glass"><span className="eyebrow">Providers paid</span><strong>{activity.totals.vendors_paid}</strong></div>
        <div className="glass"><span className="eyebrow">Missions</span><strong>{activity.totals.missions}</strong></div>
      </div>
      {!activity.ledger_online && <p className="account-error">The payment ledger is offline, so amounts below are the ones each mission recorded.</p>}
      <div className="account-filter">
        {(["all", "testnet", "simulation"] as const).map((key) => (
          <button key={key} className={filter === key ? "active" : ""} onClick={() => setFilter(key)}>
            {{ all: "All missions", testnet: "Paid in AUSD", simulation: "Simulation" }[key]}
          </button>
        ))}
      </div>
      <Feedback action={action} />
      {orders.length ? orders.map((order, index) => <OrderCard key={order.id} order={order} action={action} reload={load} newest={index === 0} />) : (
        <section className="glass account-card"><p className="account-note">Nothing here yet. Missions you run while signed in appear with every purchase Scout made, what it cost, who was paid and the onchain receipt.</p></section>
      )}
    </>
  );
}
function OrderCard({ order, action, reload, newest }: { order: Order; action: ReturnType<typeof useAction>; reload: () => Promise<void>; newest: boolean }) {
  const real = order.mode === "testnet";
  // The newest mission starts open; after that the reader decides.
  const [open, setOpen] = useState(newest);
  const held = Number(order.funding?.held_by_robot_ausd ?? 0);
  return (
    <details className="glass order" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>
        <div>
          <strong>{order.task}</strong>
          <small>{order.created_at} UTC · {order.steps.length} {order.steps.length === 1 ? "purchase" : "purchases"} · <span className={"status status-" + order.status}><i />{humanize(order.status)}</span></small>
        </div>
        <div className="payment-step-amount">
          <strong>{ausd(order.spent_ausd)} <small>{real ? "AUSD" : "demo credits"}</small></strong>
          <small>{real ? "paid onchain" : "simulation, no money moved"}</small>
        </div>
      </summary>
      {order.funding && (
        <>
          <span className="eyebrow">Mission reserve</span>
          <ul className="transfer-list">{order.funding.transfers.map((t) => <TransferRow key={t.transaction_hash} transfer={t} />)}</ul>
          {held > 0 && (
            <div className="account-actions">
              <span className="account-note">Scout still holds {ausd(held)} AUSD for this mission.</span>
              <button className="secondary" disabled={!!action.busy} onClick={() => void action.run(order.id, async () => {
                await call(`/account/missions/${order.id}/return-funds`, {});
                await reload();
                return "Unspent funds returned to your wallet.";
              })}>
                {action.busy === order.id && <LoaderCircle size={13} className="spin" />} Return unspent funds now
              </button>
            </div>
          )}
        </>
      )}
      <span className="eyebrow">Purchases</span>
      <ul className="payment-steps">
        {order.steps.map((step) => (
          <li key={step.id}>
            <div>
              <strong>{step.title}</strong>
              <small>{step.provider ? `${step.provider} · ${humanize(step.vendor || "")}` : "No provider selected"}{step.payment?.pay_to ? ` · paid to ${short(step.payment.pay_to)}` : ""}</small>
              {(step.error || step.payment?.error) && <small className="account-error">{step.error || step.payment?.error}</small>}
            </div>
            <div className="payment-step-amount">
              <strong>{ausd(step.payment?.amount_ausd ?? step.quoted_ausd ?? 0)} <small>{real ? "AUSD" : "credits"}</small></strong>
              <small className={"status status-" + (step.payment?.status || step.status)}><i />{humanize(step.payment?.status || (step.status === "pending" ? "not paid" : step.status))}</small>
              <Receipt url={step.payment?.explorer_url} />
              <Receipt url={step.payment?.audit_explorer_url} label="BNB audit record" />
            </div>
          </li>
        ))}
      </ul>
    </details>
  );
}

function LimitsTab({ user }: { user: User }) {
  const [mission, setMission] = useState(user.settings.max_per_mission_ausd);
  const [day, setDay] = useState(user.settings.max_per_day_ausd);
  const action = useAction();
  const paused = user.settings.payments_paused;
  return (
    <div className="account-grid">
      <Card title="Your limits" icon={<ShieldCheck size={15} />}>
        <form className="account-form" onSubmit={(event) => { event.preventDefault(); void action.run("save", async () => { await session.save({ max_per_mission_ausd: mission.trim(), max_per_day_ausd: day.trim() }); return "Limits saved."; }); }}>
          <label className="account-field">Most Scout may spend on one mission (AUSD)
            <input required inputMode="decimal" value={mission} onChange={(e) => setMission(e.target.value)} />
          </label>
          <label className="account-field">Most Scout may spend in one day (AUSD)
            <input required inputMode="decimal" value={day} onChange={(e) => setDay(e.target.value)} />
          </label>
          <button className="primary" disabled={!!action.busy}>Save limits</button>
        </form>
        <Feedback action={action} />
        <p className="fine-print">Checked every time a paid mission starts. A mission quoted above a limit is refused before any money moves.</p>
      </Card>
      <Card title={paused ? "Payments are paused" : "Pause all payments"} icon={paused ? <Play size={15} /> : <Pause size={15} />}>
        <p className="account-note">
          {paused ? "Scout cannot start a paid mission until you resume. Simulations still run." : "One switch that stops Scout from starting any paid mission. Use it if something looks wrong."}
        </p>
        <button className={paused ? "primary" : "secondary"} disabled={!!action.busy} onClick={() => void action.run("pause", async () => { await session.save({ payments_paused: !paused }); })}>
          {paused ? "Resume payments" : "Pause payments"}
        </button>
      </Card>
      <Card title="Limits rBazaar adds on top" icon={<Fingerprint size={15} />}>
        <p className="account-note">
          The payment service enforces its own caps on every single purchase (per purchase, per mission, per day) and only pays providers on its approved list. Your limits can be stricter than these, never looser. They are shown on the Wallet page.
        </p>
      </Card>
    </div>
  );
}

function ProfileTab({ user }: { user: User }) {
  const [name, setName] = useState(user.name);
  const [password, setPassword] = useState("");
  const action = useAction();
  return (
    <div className="account-grid">
      <Card title="Profile">
        <form className="account-form" onSubmit={(event) => { event.preventDefault(); void action.run("name", async () => { await session.save({ name }); return "Profile saved."; }); }}>
          <label className="account-field">Name<input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} /></label>
          <label className="account-field">Email<input value={user.email} disabled /></label>
          <button className="secondary" disabled={!!action.busy}>Save profile</button>
        </form>
        <p className="fine-print">Member since {user.created_at.slice(0, 10)}.</p>
      </Card>
      <Card title="Privacy">
        <label className="account-toggle">
          <input type="checkbox" checked={user.settings.save_simulation_history} onChange={(e) => void action.run("privacy", async () => { await session.save({ save_simulation_history: e.target.checked }); })} />
          <span><strong>Keep simulation missions in my history</strong><small>Off: new simulations are not linked to your account. Paid missions are always recorded, because they are financial records.</small></span>
        </label>
        <ul className="privacy-list">
          <li><strong>What rBazaar stores:</strong> your email, name, a one-way hash of your password, your settings, your missions and their payments, and a log of account events.</li>
          <li><strong>What goes to Anthropic:</strong> the mission text, the robot's description and the skill catalog, so Claude can plan. Uploaded camera images never leave rBazaar.</li>
          <li><strong>What is public:</strong> every AUSD payment is a Base Sepolia transaction. Anyone can see its amount and addresses; nobody can see your email or mission text there.</li>
          <li><strong>Who sees your history:</strong> only you. Other accounts and signed-out visitors cannot list your payments.</li>
        </ul>
      </Card>
      <Card title="Your data" icon={<Download size={15} />}>
        <p className="account-note">Download everything rBazaar holds about you: profile, settings, sign-ins, missions and payments.</p>
        <button className="secondary" disabled={!!action.busy} onClick={() => void action.run("export", async () => {
          const file = new Blob([JSON.stringify(await call("/account/export"), null, 2)], { type: "application/json" });
          const link = Object.assign(document.createElement("a"), { href: URL.createObjectURL(file), download: "rbazaar-account.json" });
          link.click(); URL.revokeObjectURL(link.href);
          return "Download started.";
        })}><Download size={13} /> Download my data</button>
        <Feedback action={action} />
      </Card>
      <Card title="Delete account" icon={<Trash2 size={15} />}>
        <p className="account-note">Removes your profile, sessions and missions. Payments already made stay on the blockchain and in the ledger, no longer linked to you. Withdraw your AUSD first: a deleted account's wallet cannot be opened again.</p>
        <form className="account-form" onSubmit={(event) => { event.preventDefault(); void action.run("delete", async () => { await call("/account/delete", { password }); session.forget(); }); }}>
          <label className="account-field">{user.has_password ? "Confirm with your password" : "Type DELETE to confirm"}
            <input type={user.has_password ? "password" : "text"} required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={user.has_password ? "current-password" : "off"} />
          </label>
          <button className="secondary danger" disabled={!!action.busy}>Delete my account</button>
        </form>
      </Card>
    </div>
  );
}

function SecurityTab({ user }: { user: User }) {
  const [security, setSecurity] = useState<Security | null>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const action = useAction();
  const load = useCallback(() => call<Security>("/account/security").then(setSecurity).catch(() => {}), []);
  useEffect(() => { void load(); }, [load]);
  return (
    <div className="account-grid">
      <Card title={user.has_password ? "Password" : "Set a password"} tag={`Sign-in: ${user.sign_in_methods.join(", ")}`}>
        <form className="account-form" onSubmit={(event) => { event.preventDefault(); void action.run("password", async () => { await call("/account/password", { current, new: next }); setCurrent(""); setNext(""); await load(); session.adopt({ ...user, has_password: true, sign_in_methods: [...new Set(["password", ...user.sign_in_methods])] }); return "Password saved. Other devices were signed out."; }); }}>
          {user.has_password && <label className="account-field">Current password<input type="password" required value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" /></label>}
          <label className="account-field">New password<input type="password" required minLength={10} value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" placeholder="At least 10 characters" /></label>
          <button className="secondary" disabled={!!action.busy}>Change password</button>
        </form>
        <Feedback action={action} />
      </Card>
      <Card title="Signed-in devices" tag={`${security?.sessions.length ?? 0}`}>
        <ul className="transfer-list">
          {security?.sessions.map((item, index) => (
            <li key={index}><div><strong>{item.device.slice(0, 70)}</strong><small>{item.address} · since {item.signed_in_at.replace("T", " ").slice(0, 16)} UTC{item.current ? " · this device" : ""}</small></div></li>
          ))}
        </ul>
        <button className="secondary" disabled={!!action.busy || (security?.sessions.length ?? 0) < 2} onClick={() => void action.run("revoke", async () => { await call("/account/sessions/revoke", {}); await load(); return "Other devices signed out."; })}>
          Sign out other devices
        </button>
      </Card>
      <Card title="Account activity">
        <ul className="transfer-list">
          {security?.events.map((event, index) => (
            <li key={index}><div><strong>{humanize(event.kind)}</strong><small>{event.created_at} UTC{event.detail ? ` · ${event.detail}` : ""}</small></div></li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
