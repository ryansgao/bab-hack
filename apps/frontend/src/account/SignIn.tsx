import { lazy, Suspense, useState, type FormEvent } from "react";
import { LoaderCircle, LockKeyhole } from "lucide-react";
import { session, useSession } from "./session";

const WalletSignIn = lazy(() => import("./OwnWallet").then((module) => ({ default: module.WalletSignIn })));
/** Set by the server when a Google or GitHub round trip failed; read once and removed from the address bar. */
function returnedError() {
  const query = new URLSearchParams(location.search), message = query.get("signin_error") || "";
  if (message || query.has("signed_in")) history.replaceState(null, "", location.pathname);
  return message;
}
import "./account.css";

/** Sign in or create an account. Used on the account pages and inside the payment dialog. */
export function SignIn({ reason }: { reason?: string }) {
  const [creating, setCreating] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState(returnedError);
  const [busy, setBusy] = useState(false);
  const { config } = useSession();
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await (creating ? session.register(email, password, name) : session.signIn(email, password));
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="glass account-card sign-in" onSubmit={submit}>
      <span className="soft-icon"><LockKeyhole size={17} /></span>
      <h2>{creating ? "Create your account" : "Sign in"}</h2>
      <p className="account-note">
        {reason || "Your account holds your wallet, your spending limits and the record of every payment Scout makes for you."}
      </p>
      {creating && (
        <label className="account-field">
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={60} placeholder="How we should address you" />
        </label>
      )}
      <label className="account-field">
        Email
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@example.com" />
      </label>
      <label className="account-field">
        Password
        <input type="password" required minLength={creating ? 10 : 1} value={password} onChange={(e) => setPassword(e.target.value)}
          autoComplete={creating ? "new-password" : "current-password"} placeholder={creating ? "At least 10 characters" : "Your password"} />
      </label>
      {error && <p className="account-error" role="alert">{error}</p>}
      <button className="primary full-width" disabled={busy}>
        {busy && <LoaderCircle size={14} className="spin" />}
        {creating ? "Create account" : "Sign in"}
      </button>
      <button type="button" className="text-button" onClick={() => { setCreating(!creating); setError(""); }}>
        {creating ? "I already have an account" : "New here? Create an account"}
      </button>
      <div className="sign-in-other">
        <span>or, with no password</span>
        <Suspense fallback={<button type="button" className="secondary full-width" disabled>Continue with a wallet</button>}>
          <WalletSignIn />
        </Suspense>
        {config.providers.map((provider) => (
          <a key={provider.id} className="secondary full-width" href={`/api/auth/oauth/${provider.id}/start`}>Continue with {provider.name}</a>
        ))}
      </div>
      <p className="fine-print">
        Testnet only: accounts pay in test AUSD on Base Sepolia. No real money moves.
      </p>
    </form>
  );
}
