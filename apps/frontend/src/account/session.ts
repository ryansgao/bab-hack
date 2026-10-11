import { useSyncExternalStore } from "react";

/** Who is signed in. One shared store, so the top bar, the account pages and the payment dialog agree. */
export type AccountSettings = {
  max_per_mission_ausd: string;
  max_per_day_ausd: string;
  payments_paused: boolean;
  save_simulation_history: boolean;
};
export type User = { id: string; email: string; name: string; created_at: string; settings: AccountSettings; has_password: boolean; sign_in_methods: string[] };
/** What this server offers for sign-in and wallet connection. */
export type SignInConfig = { providers: { id: string; name: string }[]; walletConnectProjectId: string };
export type Payment = {
  status: string;
  amount_ausd: string;
  transaction_hash: string | null;
  explorer_url: string | null;
  pay_to?: string | null;
  audit_explorer_url?: string | null;
  timestamp?: string;
  error?: string | null;
};
export type Transfer = { kind: string; amount_ausd: string; transaction_hash: string; explorer_url: string; timestamp: string; counterparty?: string };
export type Order = {
  id: string;
  task: string;
  mode: "simulation" | "testnet";
  status: string;
  created_at: string;
  estimated_ausd: string;
  spent_ausd: string;
  steps: {
    id: string; title: string; capability: string; status: string; provider: string | null; vendor: string | null;
    quoted_ausd: string | null; error: string | null; payment: Payment | null;
  }[];
  funding: { funded_ausd: string; spent_ausd: string; returned_ausd: string; held_by_robot_ausd: string; transfers: Transfer[] } | null;
};
export type Activity = {
  orders: Order[];
  wallet_transfers: Transfer[];
  ledger_online: boolean;
  totals: { paid_ausd: string; payments: number; vendors_paid: number; missions: number; paid_missions: number };
};
export type AccountWallet = {
  wallet_address: string | null;
  balance_ausd: string | null;
  own_wallet?: boolean;
  owner_address: string | null;
  owner_treasury_ausd: string | null;
  owner_explorer_url?: string | null;
  asset_domain?: { name: string; version: string; chainId: number; verifyingContract: `0x${string}` } | null;
  starter_grant?: { amount_ausd: string; claimed: boolean } | null;
  policy_chain?: { contract: string; explorer_url: string; receipt_count: number } | null;
  remaining_allowance_ausd: string;
  setup_error: string | null;
  allowance: { max_per_task_ausd: string; max_per_request_ausd: string; max_daily_ausd: string };
  limits: { max_per_mission_ausd: string; max_per_day_ausd: string; payments_paused: boolean };
  spent_today_ausd: string;
};
export type Security = {
  sessions: { device: string; address: string; current: boolean; signed_in_at: string }[];
  events: { created_at: string; kind: string; detail: string }[];
};

export async function call<T>(path: string, body?: unknown, method?: string): Promise<T> {
  const response = await fetch("/api" + path, {
    method: method || (body === undefined ? "GET" : "POST"),
    ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error?.message || "rBazaar could not be reached. Try again.");
  return data as T;
}

let state: { user: User | null; ready: boolean; config: SignInConfig } = { user: null, ready: false, config: { providers: [], walletConnectProjectId: "" } };
const listeners = new Set<() => void>();
function set(user: User | null, config = state.config) {
  state = { user, ready: true, config };
  listeners.forEach((notify) => notify());
}
// A visitor is signed in automatically with a guest account and its test wallet, unless they
// signed out on purpose in this browser (then the sign-in page stays reachable).
const SIGNED_OUT = "rbazaar-signed-out";
const remembered = (out: boolean) => { try { out ? localStorage.setItem(SIGNED_OUT, "1") : localStorage.removeItem(SIGNED_OUT); } catch { /* Optional. */ } };
const choseToSignOut = () => { try { return !!localStorage.getItem(SIGNED_OUT); } catch { return false; } };
let loading: Promise<void> | undefined;
function load() {
  return (loading ??= call<{ user: User | null; providers: SignInConfig["providers"]; walletconnect_project_id: string; guest_sign_in: boolean }>("/auth/me")
    .then(async (result) => {
      const config = { providers: result.providers, walletConnectProjectId: result.walletconnect_project_id };
      const user = result.user || (result.guest_sign_in && !choseToSignOut() ? (await call<{ user: User }>("/auth/guest", {})).user : null);
      set(user, config);
    })
    .catch(() => set(null)));
}
export function useSession() {
  void load();
  return useSyncExternalStore((notify) => { listeners.add(notify); return () => listeners.delete(notify); }, () => state);
}
const entered = (result: { user: User }) => { remembered(false); set(result.user); };
export const session = {
  signIn: (email: string, password: string) => call<{ user: User }>("/auth/login", { email, password }).then(entered),
  register: (email: string, password: string, name: string) => call<{ user: User }>("/auth/register", { email, password, name }).then(entered),
  signOut: () => call("/auth/logout", {}).then(() => { remembered(true); set(null); }),
  save: (changes: Partial<AccountSettings> & { name?: string }) => call<{ user: User }>("/account", changes, "PATCH").then((r) => set(r.user)),
  forget: () => { remembered(true); set(null); },
  adopt: (user: User) => entered({ user }),
  isGuest: (user: User) => user.sign_in_methods.length === 1 && user.sign_in_methods[0] === "guest",
};
/** "Open the payment history next": set by the payment screen, read once by the account area. */
let showPayments = false;
export const intent = {
  payments: () => { showPayments = true; window.dispatchEvent(new Event("rbazaar:payments")); },
  take: () => { const wanted = showPayments; showPayments = false; return wanted; },
};
export const short = (address: string) => `${address.slice(0, 8)}…${address.slice(-6)}`;
export const ausd = (value: string | number) => Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 });
