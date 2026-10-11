import { useEffect, useState } from "react";
import { Check, CircleHelp, ExternalLink, LoaderCircle, ShieldCheck, UserRound, Wallet, X } from "lucide-react";
import type { RoboMarket } from "../lib/useRoboMarket";
import { humanize, type Offer, type Step } from "../lib/types";
import { SignIn } from "./SignIn";
import { ausd, call, intent, session, short, useSession, type AccountWallet } from "./session";
import "./account.css";

const ACTIVE = ["queued", "preparing", "running", "waiting_for_motion"];

/** Top-bar entry to the account: "Sign in" for a visitor, the user's initial once signed in. */
export function AccountButton({ onOpen }: { onOpen: () => void }) {
  const { user, ready } = useSession();
  if (!ready) return null;
  return (
    <button className={"account-button " + (user ? "signed-in" : "")} onClick={onOpen} aria-label={user ? "Open your account" : "Sign in"}>
      {user ? <span className="account-initial">{user.name.slice(0, 1).toUpperCase()}</span> : <UserRound size={14} />}
      <span>{user ? (session.isGuest(user) ? "Guest · test wallet" : user.name) : "Sign in"}</span>
    </button>
  );
}

/**
 * The payment screen for a mission paid in AUSD: review what will be bought, authorize it, watch
 * each purchase settle, then keep the receipt. Opened by the "rbazaar:checkout" window event.
 */
export default function PaymentFlow({ data, onHistory }: { data: RoboMarket; onHistory: () => void }) {
  const { user } = useSession();
  const [open, setOpen] = useState(false);
  const [started, setStarted] = useState(false);
  const [wallet, setWallet] = useState<AccountWallet | null>(null);
  const [walletError, setWalletError] = useState("");
  const plan = data.plan;
  useEffect(() => {
    const show = () => { setStarted(false); setOpen(true); };
    window.addEventListener("rbazaar:checkout", show);
    return () => window.removeEventListener("rbazaar:checkout", show);
  }, []);
  useEffect(() => {
    if (!open || !user) return;
    call<AccountWallet>("/account/wallet").then((next) => { setWallet(next); setWalletError(""); }).catch((reason: Error) => setWalletError(reason.message));
  }, [open, user, plan?.status]);
  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [open]);
  if (!open || !plan || plan.request.execution_mode !== "testnet") return null;

  const steps = plan.subtasks.map((step) => ({
    step,
    provider: step.decision?.candidates.find((c) => c.model.id === step.decision?.selected_model_id)?.model,
  }));
  const settled = plan.subtasks.filter((step) => step.payment?.status === "settled");
  const running = ACTIVE.includes(plan.status);
  const finished = started && !running && plan.status !== "planned";
  const balance = Number(wallet?.owner_treasury_ausd ?? 0);
  const reserve = Number(wallet?.allowance.max_per_task_ausd ?? 0);
  const short_of_funds = !!wallet && balance < reserve;
  async function pay() {
    data.setError("");
    setStarted(true);
    await data.execute();
  }
  return (
    <div className="payment-scrim" role="dialog" aria-modal="true" aria-label="Mission payment">
      <div className="glass-raised payment-dialog">
        <button className="icon-button payment-close" aria-label="Close payment" onClick={() => setOpen(false)}><X size={16} /></button>
        {!user ? (
          <SignIn reason="Paying in AUSD needs an account: the mission is paid from your own wallet, inside your own limits." />
        ) : finished ? (
          <>
            <span className={"payment-badge " + (plan.status === "completed" ? "ok" : "warn")}>
              {plan.status === "completed" ? <Check size={20} /> : <CircleHelp size={20} />}
            </span>
            <h2>{plan.status === "completed" ? "Payment complete" : "Mission stopped"}</h2>
            <p className="account-note">
              {settled.length
                ? `Scout paid ${ausd(plan.spent_ausd)} AUSD across ${settled.length} ${settled.length === 1 ? "purchase" : "purchases"}. Each one settled onchain and has its own receipt.`
                : "No payment was made."}
              {plan.status !== "completed" && " The mission did not finish; what was already paid stays paid and is listed below."}
            </p>
            {plan.status !== "completed" && data.error && <p className="account-error">{data.error}</p>}
            <StepList steps={steps} />
            <p className="fine-print">Unspent funds held by Scout return to your wallet automatically within about two minutes.</p>
            <div className="payment-actions">
              <button className="secondary" onClick={() => setOpen(false)}>Close</button>
              <button className="primary" onClick={() => { setOpen(false); onHistory(); intent.payments(); }}>View in payment history</button>
            </div>
          </>
        ) : started ? (
          <>
            <span className="payment-badge"><LoaderCircle size={20} className="spin" /></span>
            <h2>Paying as the mission runs</h2>
            <p className="account-note">Scout buys one skill at a time. Each payment settles on Base Sepolia before its result is used.</p>
            {data.error && <p className="account-error" role="alert">{data.error}</p>}
            <StepList steps={steps} />
            <div className="payment-actions">
              {data.error && <button className="secondary" onClick={() => setStarted(false)}>Back</button>}
              <button className="secondary" onClick={() => setOpen(false)}>Keep running in the background</button>
            </div>
          </>
        ) : (
          <>
            <span className="eyebrow">Review and pay</span>
            <h2>{ausd(plan.estimated_cost_ausd)} <small>AUSD</small></h2>
            <p className="account-note">{plan.request.task}</p>
            <StepList steps={steps} quoted />
            <dl className="spec-list payment-summary">
              <div><dt><Wallet size={12} /> Paid from</dt><dd>{wallet?.owner_address ? `${wallet.own_wallet ? "Your wallet" : "Shared treasury"} ${short(wallet.owner_address)}` : "—"}</dd></div>
              <div><dt>Wallet balance</dt><dd>{wallet?.owner_treasury_ausd ? `${ausd(wallet.owner_treasury_ausd)} AUSD` : "—"}</dd></div>
              <div><dt>Reserved for this mission</dt><dd>{wallet ? `up to ${ausd(wallet.allowance.max_per_task_ausd)} AUSD` : "—"}</dd></div>
              <div><dt><ShieldCheck size={12} /> Your limits</dt><dd>{wallet ? `${ausd(wallet.limits.max_per_mission_ausd)} per mission · ${ausd(wallet.limits.max_per_day_ausd)} per day` : "—"}</dd></div>
            </dl>
            {(walletError || wallet?.setup_error) && <p className="account-error">{walletError || wallet?.setup_error}</p>}
            {short_of_funds && <p className="account-error">Your wallet holds less than the amount a mission reserves. Add test AUSD on the Wallet page first.</p>}
            {wallet?.limits.payments_paused && <p className="account-error">Payments are paused on your account. Resume them under Spending limits.</p>}
            <p className="fine-print">
              You authorize Scout to spend up to the reserved amount on this mission. It pays each provider separately; whatever it does not spend returns to your wallet.
            </p>
            <div className="payment-actions">
              <button className="secondary" onClick={() => setOpen(false)}>Cancel</button>
              <button className="primary" disabled={data.busy || !wallet || short_of_funds || wallet.limits.payments_paused || plan.status !== "planned"} onClick={() => void pay()}>
                Authorize and pay
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StepList({ steps, quoted = false }: { steps: { step: Step; provider?: Offer }[]; quoted?: boolean }) {
  return (
    <ul className="payment-steps">
      {steps.map(({ step, provider }) => (
        <li key={step.id}>
          <div>
            <strong>{step.title}</strong>
            <small>{provider ? `${provider.name} · ${humanize(provider.provider_id)}` : "No provider"}</small>
            {step.error && <small className="account-error">{step.error}</small>}
          </div>
          <div className="payment-step-amount">
            <strong>{ausd(step.payment?.amount_ausd ?? provider?.price_ausd ?? 0)} <small>AUSD</small></strong>
            {quoted ? <small>quoted</small> : step.payment?.explorer_url ? (
              <a href={step.payment.explorer_url} target="_blank" rel="noreferrer">Receipt <ExternalLink size={10} /></a>
            ) : (
              <small className={"status status-" + (step.payment?.status || step.status)}><i />{humanize(step.payment?.status || step.status)}</small>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
