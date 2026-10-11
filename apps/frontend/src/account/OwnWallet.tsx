import "@rainbow-me/rainbowkit/styles.css";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ConnectButton, RainbowKitProvider, connectorsForWallets, lightTheme, useConnectModal } from "@rainbow-me/rainbowkit";
import {
  binanceWallet, coinbaseWallet, injectedWallet, ledgerWallet, metaMaskWallet, okxWallet, rainbowWallet, safeWallet, trustWallet, walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { erc20Abi, formatUnits, parseUnits, toHex } from "viem";
import { WagmiProvider, createConfig, http, useAccount, useReadContract, useSignMessage, useSignTypedData, useSwitchChain } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { ArrowDownLeft, LoaderCircle, Wallet } from "lucide-react";
import { ausd, call, session, useSession, type AccountWallet, type User } from "./session";
import "./account.css";

/**
 * Wallets the user holds themselves, connected through RainbowKit: Rainbow, Coinbase Wallet,
 * MetaMask, Binance Wallet, Ledger and any other browser or phone wallet. Loaded only where it is
 * used, because the wallet libraries are large.
 */
const queryClient = new QueryClient();
function Providers({ children }: { children: ReactNode }) {
  const { config } = useSession();
  const projectId = config.walletConnectProjectId;
  const wagmi = useMemo(() => createConfig({
    chains: [baseSepolia],
    transports: { [baseSepolia.id]: http() },
    // Phone wallets pair by QR code through WalletConnect, which needs a project id. Without one only
    // wallets that live in this browser are offered, so no listed wallet is a dead end.
    connectors: connectorsForWallets(projectId
      ? [{ groupName: "Popular", wallets: [rainbowWallet, coinbaseWallet, metaMaskWallet, binanceWallet, walletConnectWallet] },
         { groupName: "Hardware and more", wallets: [ledgerWallet, trustWallet, okxWallet, safeWallet, injectedWallet] }]
      : [{ groupName: "Wallets in this browser", wallets: [injectedWallet, coinbaseWallet] }],
      { appName: "rBazaar", projectId: projectId || "not-configured" }),
  }), [projectId]);
  return (
    <WagmiProvider config={wagmi}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={lightTheme({ accentColor: "#3f7d5c", borderRadius: "large", fontStack: "system" })} initialChain={baseSepolia}>
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
function QrNote() {
  const { config } = useSession();
  return config.walletConnectProjectId ? null : (
    <p className="fine-print">Wallets in this browser connect now. Phone wallets that pair by QR code turn on when the server has a WalletConnect project ID.</p>
  );
}

/** Wallet page: connect your own wallet, move AUSD from it into your rBazaar wallet with one signature. */
export default function OwnWalletCard(props: { wallet: AccountWallet; onDeposited: () => void; onUseAddress: (address: string) => void }) {
  return <Providers><Funding {...props} /></Providers>;
}
function Funding({ wallet, onDeposited, onUseAddress }: { wallet: AccountWallet; onDeposited: () => void; onUseAddress: (address: string) => void }) {
  const { address, chainId, isConnected } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { signTypedDataAsync } = useSignTypedData();
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const domain = wallet.asset_domain;
  const held = useReadContract({ address: domain?.verifyingContract, abi: erc20Abi, functionName: "balanceOf", args: address ? [address] : undefined, chainId: baseSepolia.id, query: { enabled: !!address && !!domain, refetchInterval: 8000 } });
  async function deposit() {
    setBusy(true); setError(""); setDone("");
    try {
      if (!address || !domain || !wallet.owner_address) throw new Error("Connect a wallet first.");
      if (!/^(0|[1-9]\d{0,8})(\.\d{1,6})?$/.test(amount) || Number(amount) <= 0) throw new Error("Enter an amount with up to six decimal places.");
      if (chainId !== baseSepolia.id) await switchChainAsync({ chainId: baseSepolia.id });
      // One signed permission for exactly this amount to exactly this address; rBazaar submits it and pays the network fee.
      const validBefore = Math.floor(Date.now() / 1000) + 900;
      const nonce = toHex(crypto.getRandomValues(new Uint8Array(32)));
      const signature = await signTypedDataAsync({
        domain: { ...domain, verifyingContract: domain.verifyingContract },
        types: { TransferWithAuthorization: [
          { name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" },
          { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" }] },
        primaryType: "TransferWithAuthorization",
        message: { from: address, to: wallet.owner_address as `0x${string}`, value: parseUnits(amount, 6), validAfter: 0n, validBefore: BigInt(validBefore), nonce },
      });
      const result = await call<{ amount_ausd: string }>("/account/wallet/deposit", { sender: address, amount_ausd: amount, valid_after: "0", valid_before: String(validBefore), nonce, signature });
      setAmount(""); setDone(`${ausd(result.amount_ausd)} AUSD moved into your rBazaar wallet.`);
      void held.refetch(); onDeposited();
    } catch (reason) {
      setError((reason as Error).message.split("\n")[0]);
    } finally { setBusy(false); }
  }
  return (
    <section className="glass account-card">
      <div className="account-card-heading">
        <span className="label-with-icon"><Wallet size={15} />Bring your own wallet</span>
        <span className="tag">Rainbow · Coinbase · MetaMask · Binance · Ledger</span>
      </div>
      <p className="account-note">
        Connect a wallet you hold yourself, hot or cold. Your keys stay with you: rBazaar can only move what you sign for, one amount at a time.
      </p>
      <ConnectButton showBalance={false} chainStatus="icon" accountStatus="address" />
      {isConnected && address && (
        <>
          <dl className="spec-list own-wallet-balance">
            <div><dt>AUSD in this wallet</dt><dd>{held.data !== undefined ? `${ausd(formatUnits(held.data, 6))} AUSD` : "—"}</dd></div>
          </dl>
          <div className="own-wallet-form">
            <label className="account-field">Add to my rBazaar wallet (AUSD)
              <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.50" />
            </label>
            <button className="primary" disabled={busy} onClick={() => void deposit()}>
              {busy ? <LoaderCircle size={13} className="spin" /> : <ArrowDownLeft size={13} />} Add funds
            </button>
          </div>
          <button className="text-button" onClick={() => onUseAddress(address)}>Use this wallet as my withdrawal address</button>
          <p className="fine-print">Adding funds is one signature in your wallet, with no network fee. Needs test AUSD on Base Sepolia.</p>
        </>
      )}
      {error && <p className="account-error" role="alert">{error}</p>}
      {done && <p className="account-done" role="status">{done}</p>}
      <QrNote />
    </section>
  );
}

/** Sign-in page: prove you hold a wallet by signing a message. No password, no email. */
export function WalletSignIn() {
  return <Providers><SignWithWallet /></Providers>;
}
function SignWithWallet() {
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { signMessageAsync } = useSignMessage();
  const [wanted, setWanted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!wanted || !isConnected || !address || busy) return;
    setWanted(false); setBusy(true); setError("");
    (async () => {
      const challenge = await call<{ token: string; message: string }>("/auth/wallet/challenge", { address });
      const signature = await signMessageAsync({ message: challenge.message });
      session.adopt((await call<{ user: User }>("/auth/wallet/verify", { token: challenge.token, signature })).user);
    })().catch((reason: Error) => setError(reason.message.split("\n")[0])).finally(() => setBusy(false));
  }, [wanted, isConnected, address, busy, signMessageAsync]);
  return (
    <>
      <button type="button" className="secondary full-width" disabled={busy} onClick={() => { setWanted(true); if (!isConnected) openConnectModal?.(); }}>
        {busy ? <LoaderCircle size={14} className="spin" /> : <Wallet size={14} />} Continue with a wallet
      </button>
      {error && <p className="account-error" role="alert">{error}</p>}
    </>
  );
}
