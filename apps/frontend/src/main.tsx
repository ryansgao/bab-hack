import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Bot,
  Box,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  ExternalLink,
  Eye,
  Fingerprint,
  Flag,
  Hand,
  ImagePlus,
  Layers3,
  LoaderCircle,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Pause,
  Play,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Wallet,
  X,
} from "lucide-react";
import "@fontsource-variable/inter";
import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
import { useRoboMarket, type RoboMarket } from "./lib/useRoboMarket";
import {
  humanize,
  layerName,
  money,
  usd,
  DEFAULT_ROBOT,
  liveStep,
  type Step,
  type Plan,
  type View,
} from "./lib/types";
import "./style.css";
import MissionPricing from './components/MissionPricing';

const RobotStation = lazy(() => import('./components/RobotStation'));
const SkillPreview = lazy(() => import("./components/SkillPreview").then((module) => ({ default: module.SkillPreview })));
const TaskPreview3D = lazy(() => import("./components/TaskPreview3D"));
const BountyBoard = lazy(() => import("./components/BountyBoard"));

function TaskPreviewToggle({ data, plan, selected, onSelect }: {
  data: RoboMarket; plan?: Plan; selected?: number; onSelect?: (index: number) => void;
}) {
  const scene = plan?.simulation_scene?.source==="simulation_fixture" ? plan.simulation_scene : null;
  const region=useRef<HTMLElement>(null);
  useEffect(()=>{if(data.followLive&&data.previewEnabled)region.current?.scrollIntoView({block:'start',behavior:'smooth'});},[data.followLive,data.previewEnabled]);
  const id = plan ? "mission-task-preview" : "composer-task-preview";
  return <section ref={region} className="task-preview glass-quiet">
    <label className="task-preview-toggle">
      <span><strong>3D task preview</strong><small>Check Scout understood your task before running it. No extra AI tokens.</small></span>
      <input type="checkbox" role="switch" aria-label="3D task preview" aria-controls={id} checked={data.previewEnabled} onChange={e => data.setPreviewEnabled(e.target.checked)} />
      <span className="preview-switch" aria-hidden="true" />
    </label>
    {data.previewEnabled && <div id={id}>
      {scene ? <Suspense fallback={<p className="preview-loading">Loading local 3D preview…</p>}><TaskPreview3D key={plan?.id || scene.id} scene={scene} plan={plan} selected={selected} onSelect={onSelect} robot={{...DEFAULT_ROBOT,...(plan?.request.robot_card||data.robotConfig)}} arm={data.arm} mode={data.followLive?'live':'preview'} onFollow={()=>data.setFollowLive(true)} /></Suspense>
        : <p className="preview-loading">Your prompt and reference files will generate the robot and scene when you build the mission.</p>}
    </div>}
  </section>;
}

function readableMessage(message: string) {
  if (/missing.*(ROBOT_PRIVATE_KEY|FACILITATOR_PRIVATE_KEY|PROVIDER_ADDRESS)/i.test(message)) {
    return "Connect the robot wallet, settlement wallet, and provider recipient to execute a mission.";
  }
  return message.replaceAll("configured_estimate", "estimated latency").replaceAll("measured_ema", "measured latency");
}

const LayerIcon = ({ type, size = 18 }: { type: string; size?: number }) => {
  const Icon =
    type === "object_detection"
      ? Eye
      : type === "grasp"
        ? Hand
        : type === "control"
          ? Activity
          : type === "path_planning"
            ? ArrowRight
            : Layers3;
  return <Icon size={size} strokeWidth={1.7} />;
};
function BrandMark({ small = false }: { small?: boolean }) {
  return (
    <span className={"brand-mark " + (small ? "small" : "")} aria-hidden="true">
      <Layers3 size={small ? 20 : 26} strokeWidth={1.6} />
    </span>
  );
}
function IconButton({
  label,
  onClick,
  children,
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      className="icon-button"
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
function Status({ value }: { value: string }) {
  return (
    <span className={"status status-" + value}>
      <i />
      {humanize(value)}
    </span>
  );
}
function EmptyState({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">{icon}</span>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
function Background() {
  return (
    <div className="ambient" aria-hidden="true">
      <div className="ambient-color" />
      <div className="ambient-landscape" />
      <div className="ambient-light" />
      <div className="ambient-wash" />
    </div>
  );
}

function WalletCard({
  data,
  compact = false,
}: {
  data: RoboMarket;
  compact?: boolean;
}) {
  const { wallet, paymentError } = data;
  return (
    <section className={"glass wallet-card " + (compact ? "compact" : "")}>
      <div className="panel-heading">
        <span className="label-with-icon">
          <Wallet size={16} /> Scout wallet
        </span>
        <span className="tag">Base Sepolia</span>
      </div>
      {wallet?.custody === "mission_float" ? (
        <div className="wallet-amount">
          <span className="eyebrow">Owner treasury</span>
          <strong>
            {wallet.owner_treasury_ausd ? money(wallet.owner_treasury_ausd) : "—"}{" "}
            <small>AUSD</small>
          </strong>
          <span className="wallet-address">
            Robot holds {wallet.balance_ausd ? money(wallet.balance_ausd) : "—"} AUSD
            (mission float only, no gas)
            {wallet.wallet_address
              ? ` · ${wallet.wallet_address.slice(0, 8)}…${wallet.wallet_address.slice(-6)}`
              : ""}
          </span>
          {wallet.policy_chain && (
            <a
              className="wallet-address"
              href={wallet.policy_chain.explorer_url}
              target="_blank"
              rel="noreferrer"
            >
              Policy on BNB chain · {wallet.policy_chain.receipt_count} receipts
            </a>
          )}
        </div>
      ) : (
      <div className="wallet-amount">
        <span className="eyebrow">Available balance</span>
        <strong>
          {wallet?.balance_ausd !== null && wallet?.balance_ausd !== undefined
            ? money(wallet.balance_ausd)
            : "—"}{" "}
          <small>AUSD</small>
        </strong>
        <span className="wallet-address">
          {wallet?.wallet_address
            ? `${wallet.wallet_address.slice(0, 8)}…${wallet.wallet_address.slice(-6)}`
            : "Connect a funded testnet wallet to execute."}
        </span>
      </div>
      )}
      <div className="allowance-heading">
        <ShieldCheck size={16} />
        <strong>Spending allowance</strong>
        <span className="tiny-dot" />
      </div>
      <dl className="spec-list">
        <div>
          <dt>Per purchase</dt>
          <dd>
            {wallet ? money(wallet.allowance.max_per_request_ausd) : "—"} AUSD
          </dd>
        </div>
        <div>
          <dt>Per mission</dt>
          <dd>
            {wallet ? money(wallet.allowance.max_per_task_ausd) : "—"} AUSD
          </dd>
        </div>
        <div>
          <dt>Session remaining</dt>
          <dd>{wallet ? money(wallet.remaining_allowance_ausd) : "—"} AUSD</dd>
        </div>
      </dl>
      {(paymentError || wallet?.setup_error) && (
        <div className="quiet-notice">
          <CircleHelp size={15} />
          <div>
            <strong>Wallet setup needed</strong>
            <p>{readableMessage(wallet?.setup_error || paymentError)}</p>
          </div>
        </div>
      )}
    </section>
  );
}

function Composer({
  data,
  onPlanned,
  hero,
  footer,
}: {
  data: RoboMarket;
  onPlanned: () => void;
  hero?: ReactNode;
  footer?: ReactNode;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    input.current?.focus();
  }, []);
  async function submit() {
    if (
      data.task.trim().length >= 3 &&
      !data.busy &&
      !data.restoring &&
      data.online
    )
      if (await data.createPlan()) onPlanned();
  }
  return (
    <div className="compose-page enter">
      <div className="hero-heading">
        {hero ?? <h1>New mission</h1>}
      </div>
      <div className="simulation-mode glass-quiet"><label>Execution mode <select aria-label="Execution mode" value={data.executionMode} onChange={e=>data.setExecutionMode(e.target.value as "simulation"|"testnet")}><option value="simulation">Simulation · USD estimates</option><option value="testnet">Real providers · AUSD testnet</option></select></label><p>{data.executionMode==="simulation"?"Your prompt creates the demo scene. Available marketplace skills run locally; missing skills use free virtual effects and can open producer bounties. Claude planning usage still applies.":"Real model inference and testnet payments. Supply an observation and funded wallets."}</p></div>
      <div className="composer glass-raised">
        <textarea
          ref={input}
          rows={2}
          maxLength={6000}
          aria-label="Mission task"
          placeholder="Describe the outcome you want your robot to achieve…"
          value={data.task}
          onChange={(event) => data.setTask(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              void submit();
            }
          }}
        />
        {data.image && (
          <div className="attachment">
            <ImagePlus size={14} />
            <span>{data.imageName}</span>
            <IconButton label="Remove image" onClick={data.clearImage}>
              <X size={13} />
            </IconButton>
          </div>
        )}
        <div className="composer-toolbar">
          <div className="composer-tools">
            <label
              className="icon-button upload-button"
              title="Upload reference files"
            >
              <ImagePlus size={18} />
              <span className="sr-only">Upload reference files</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,.txt,.md,.csv,.json,video/mp4,video/webm,video/quicktime"
                multiple
                onChange={async (event) => {
                  const files=Array.from(event.target.files||[]);event.target.value="";
                  for(const file of files)await data.uploadMedia(file);
                }}
              />
            </label>
            <button
              type="button"
              className={"settings-trigger " + (settingsOpen ? "active" : "")}
              aria-expanded={settingsOpen}
              aria-controls="mission-settings"
              onClick={() => setSettingsOpen(!settingsOpen)}
            >
              <Settings2 size={15} />
              <span>Parameters</span>
              <ChevronDown size={13} className="settings-chevron" />
            </button>
          </div>
          <span className="budget-hint">
            {usd(data.budget || "0")} skill limit
          </span>
          <button
            className="send-button"
            title="Build mission plan"
            aria-label="Build mission plan"
            disabled={
              data.busy || data.mediaBusy ||
              data.restoring ||
              !data.online ||
              data.task.trim().length < 3
            }
            onClick={() => void submit()}
          >
            {data.busy ? (
              <LoaderCircle className="spin" size={19} />
            ) : (
              <ArrowUp size={20} />
            )}
          </button>
        </div>
        <div id="mission-settings" className={"mission-settings-wrap " + (settingsOpen ? "open" : "")} inert={!settingsOpen}>
          <div className="mission-settings-clip"><div className="mission-settings">
            <label>
              Skill spending limit <span>USD · maximum for marketplace calls</span>
              <input
                aria-label="Skill spending limit in USD"
                type="number"
                min="0.001"
                step="0.01"
                max="99999999"
                value={data.budget}
                onChange={(event) => data.setBudget(event.target.value)}
              />
            </label>
            <label>
              Inference deadline
              <select
                aria-label="Inference deadline"
                value={data.deadline}
                onChange={(event) =>
                  data.setDeadline(Number(event.target.value))
                }
              >
                {[100, 800, 3000, 10000, 30000].map((value) => (
                  <option key={value} value={value}>
                    {value >= 1000 ? `${value / 1000} seconds` : `${value} ms`}
                  </option>
                ))}
              </select>
            </label>
            <p>
              Parameters apply to this plan. Settlement time is separate from
              inference time.
            </p>
          </div></div>
        </div>
      </div>
      <div className="media-context-note"><label className="secondary upload-context"><ImagePlus size={14}/>{data.mediaBusy?'Preparing reference files…':'Upload documents, images or video'}<input type="file" aria-label="Upload task reference files" multiple accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,.txt,.md,.csv,.json,video/mp4,video/webm,video/quicktime" disabled={data.mediaBusy||data.busy} onChange={async e=>{const files=Array.from(e.target.files||[]);e.target.value='';for(const file of files)await data.uploadMedia(file);}}/></label><p>Optional references are sent to Anthropic with your prompt. PDFs and text documents are supported. Video uses six sampled frames; audio is not analyzed.</p><div className="attachment-list">{data.media.map((file,i)=><div key={i}><span>{file.name}</span><small>{file.kind==='video'?`${file.frames?.length||0} frames`:file.kind.toUpperCase()}</small><button className="icon-button" aria-label={`Remove ${file.name}`} onClick={()=>data.removeMedia(i)}><X size={12}/></button></div>)}</div></div>
      {data.executionMode === "simulation" && <TaskPreviewToggle data={data} />}
      <div className="auto-bounty-settings glass-quiet"><label><input type="checkbox" checked={data.autoBounties} onChange={e=>data.setAutoBounties(e.target.checked)} /> Automatically post bounties for missing skills</label>{data.autoBounties && <label className="bounty-reward-setting">Reward per missing capability <input aria-label="Automatic bounty reward" type="number" min="0.000001" step="0.001" value={data.bountyReward} onChange={e=>data.setBountyReward(e.target.value)} /><span>{data.executionMode==='simulation'?'USD demo pledge':'USD pledge'}</span></label>}<p>Creates a producer request when no compatible skill exists. Posting commits a reward pledge; it does not send a payment.</p></div>
      <div className="suggestions">
        <span>A place to start</span>
        {[
          "Organize my workbench",
          "Find and inspect a coffee mug",
          "Sort packages by destination",
        ].map((task) => (
          <button
            key={task}
            onClick={() => {
              data.setTask(task);
              input.current?.focus();
            }}
          >
            {task}
            <ArrowUp size={12} />
          </button>
        ))}
      </div>
      <div className="planner-status glass-quiet" role="status"><Sparkles size={15} /><div><strong>{data.planner?.configured ? "Planner connected" : "Planner setup needed"}</strong><p>{data.planner?.configured ? `${data.planner.model} · Your goal becomes a dependency graph of purchasable skills.` : "Configure the planning service on the server to build a mission. Your API key stays on the backend."}</p></div></div>
      <div className="composer-note">
        <ShieldCheck size={13} />
        <span>Review the fine-grained plan before running. Simulation never sends a blockchain payment.</span>
      </div>
      {footer}
    </div>
  );
}

function StepDetail({ step }: { step: Step }) {
  const [detail, setDetail] = useState<"providers" | "output">("providers");
  const decision = step.decision;
  const candidates =
    decision?.candidates.filter(
      (candidate) => candidate.model.task_type === step.task_type,
    ) || [];
  candidates.sort((a, b) => {
    if (a.model.id === decision?.selected_model_id) return -1;
    if (b.model.id === decision?.selected_model_id) return 1;
    return Number(b.eligible) - Number(a.eligible) || (a.score ?? Infinity) - (b.score ?? Infinity);
  });
  return (
    <section className="glass detail-panel">
      <div className="detail-top">
        <span className={"layer-icon layer-" + step.task_type}>
          <LayerIcon type={step.task_type} size={22} />
        </span>
        <div>
          <span className="eyebrow">
            {step.object_name || step.requirements?.object_name || "Mission capability"}
          </span>
          <h2>{layerName(step.task_type)}</h2>
        </div>
        <Status value={step.status} />
      </div>
      <div className="subtask-context"><h3>{step.title}</h3><p>{step.description}</p>{step.success_criteria && <p><strong>Complete when:</strong> {step.success_criteria}</p>}<p><strong>Requires:</strong> {step.depends_on.join(", ") || "No prerequisites"}</p></div>
      <div className="detail-tabs" role="tablist" aria-label="Shard details">
        <button
          role="tab"
          aria-selected={detail === "providers"}
          onClick={() => setDetail("providers")}
        >
          Provider comparison <span>{candidates.length}</span>
        </button>
        <button
          role="tab"
          aria-selected={detail === "output"}
          onClick={() => setDetail("output")}
        >
          {step.result?.source==="simulation"||step.decision?.candidates.find(c=>c.model.id===step.decision?.selected_model_id)?.model.execution_mode==="simulation"?"Simulation output":"Purchased output"} {step.result && <i className="tiny-dot" />}
        </button>
      </div>
      {detail === "providers" ? (
        <div className="detail-content">
          <div className="decision-summary">
            <Sparkles size={16} />
            <p>{readableMessage(decision?.explanation || "Provider selection is pending.")}</p>
          </div>
          <div className="candidate-list">
            {candidates.map((candidate) => {
              const chosen = decision?.selected_model_id === candidate.model.id;
              return (
                <article
                  key={candidate.model.id}
                  className={"candidate " + (chosen ? "chosen" : "")}
                >
                  <div className="candidate-heading">
                    <span className="provider-avatar">
                      {candidate.model.provider_id[0].toUpperCase()}
                    </span>
                    <div>
                      <h3>{candidate.model.name}</h3>
                      <span>{humanize(candidate.model.provider_id)}</span>
                    </div>
                    <span
                      className={
                        "selection-label " +
                        (chosen
                          ? "selected"
                          : !candidate.eligible
                            ? "excluded"
                            : "")
                      }
                    >
                      {chosen ? (
                        <Check size={12} />
                      ) : !candidate.eligible ? (
                        <X size={12} />
                      ) : null}
                      {chosen
                        ? "Selected"
                        : candidate.eligible
                          ? "Alternative"
                          : "Excluded"}
                    </span>
                  </div>
                  <div className="candidate-metrics">
                    <div>
                      <span>Per call</span>
                      <strong>
                        {usd(candidate.model.price_ausd)} <small>{candidate.model.execution_mode === "simulation" ? "demo estimate" : "USD"}</small>
                      </strong>
                    </div>
                    <div>
                      <span>
                        {candidate.model.latency_source === "measured_ema"
                          ? "Measured EMA"
                          : "Latency estimate"}
                      </span>
                      <strong>
                        {candidate.model.latency_ms.toFixed(0)}{" "}
                        <small>ms</small>
                      </strong>
                    </div>
                    <div>
                      <span>Score ↓</span>
                      <strong>{candidate.score?.toFixed(3) ?? "—"}</strong>
                    </div>
                  </div>
                  <p className="candidate-reasons">
                    {candidate.reasons.join(". ")}.
                  </p>
                </article>
              );
            })}
          </div>
          <div className="detail-footnote">
            <ShieldCheck size={13} />
            Lower scores are preferred. Quality estimates are not benchmarks.
          </div>
        </div>
      ) : (
        <div className="detail-content">
          {step.result ? (
            <>
              <div className="output-meta">
                <Status value="completed" />
                <span>
                  {step.result.inference_latency_ms.toFixed(1)} ms measured
                </span>
              </div>
              {step.result.source==="simulation"&&<p className="simulation-label">{step.result.output.virtual_effect?'VIRTUAL DEMO · Expected outcome only · No model purchase':'SIMULATION · Fixture-backed output · No on-chain payment'}</p>}
              <p className="result-summary">{step.result.summary}</p>
              <pre className="result-json">
                {JSON.stringify(
                  Object.keys(step.result.output).length
                    ? step.result.output
                    : step.result.predictions,
                  null,
                  2,
                )}
              </pre>
              {step.payment?.explorer_url && (
                <a
                  className="text-link"
                  href={step.payment.explorer_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  View verified receipt <ExternalLink size={13} />
                </a>
              )}
            </>
          ) : (
            <EmptyState icon={<Box size={26} />} title="No output yet">
              Execute the mission to see purchased shard results here.
            </EmptyState>
          )}
        </div>
      )}
    </section>
  );
}

function Mission({ data, onNew, onBounties, onRobot }: { data: RoboMarket; onNew: () => void; onBounties: () => void; onRobot:()=>void }) {
  const selected=data.followLive?liveStep(data.plan):data.previewStep;
  const setSelected=(index:number)=>{data.setPreviewStep(index);data.setFollowLive(false);};
  const detailPanel = useRef<HTMLDivElement>(null);
  const { plan, busy } = data;
  const simulated = plan?.request.execution_mode === "simulation";
  useEffect(() => data.setPreviewStep(0), [plan?.id]);
  if (!plan) return <Composer data={data} onPlanned={() => setSelected(0)} />;
  const completed = plan.subtasks.filter(
    (step) => step.status === "completed",
  ).length;
  const step = plan.subtasks[Math.min(selected, plan.subtasks.length - 1)];
  const blocked = plan.subtasks.find((item) => item.error)?.error;
  const virtualSteps=plan.subtasks.filter(item=>item.decision?.candidates.some(candidate=>candidate.model.id===item.decision?.selected_model_id && candidate.model.simulation_placeholder));
  return (
    <div className="page mission-page enter">
      <div className="page-heading">
        <div>
          <h1>{plan.request.task}</h1>
        </div>
        <button className="secondary" onClick={onNew} disabled={busy}>
          <Plus size={15} />
          New mission
        </button>
      </div>
      <div className="mission-robot-link glass-quiet"><Bot size={20}/><div><strong>{plan.robot_visual?.name||'Generated demo robot'} · from your prompt{plan.request.media?.length?` + ${plan.request.media.length} reference files`:''}</strong><span>{plan.subtasks[liveStep(plan)]?.title} · {humanize(plan.status)}</span></div><button className="secondary" onClick={onRobot}>Open 3D studio <ArrowRight size={13}/></button></div>
      {simulated&&<div className="simulation-mode glass-quiet"><strong>Simulation · This scene and robot follow your mission</strong><p>Run Simulation opens the live 3D workcell. Marketplace spending is simulated; Claude planning is billed separately.</p>{!!virtualSteps.length && <p><strong>{virtualSteps.length} {virtualSteps.length===1?'step uses':'steps use'} free virtual demo effects.</strong> These illustrate expected outcomes while marketplace skills are unavailable.</p>}</div>}
      <MissionPricing plan={plan} data={data}/>
      <div className="mission-summary mission-status-only glass-quiet">
        <div>
          <span className="eyebrow">Mission status</span>
          <Status value={plan.status} />
        </div>
        <div>
          <span className="eyebrow">{simulated?"Simulated steps":"Purchased"}</span>
          <strong>
            {completed} <small>/ {plan.subtasks.length} shards</small>
          </strong>
        </div>
        <div className="summary-progress">
          <span
            style={{
              width: `${(completed / Math.max(1, plan.subtasks.length)) * 100}%`,
            }}
          />
        </div>
      </div>
      {simulated && <TaskPreviewToggle data={data} plan={plan} selected={selected} onSelect={setSelected} />}
      {!!plan.bounty_ids?.length && <div className="bounty-mission-notice glass-quiet"><Flag size={18}/><div><strong>{plan.bounty_ids.length} missing-skill {plan.bounty_ids.length===1?'bounty':'bounties'} posted automatically</strong><p>{simulated?'Your demo can continue with virtual effects while producers deliver these skills.':'Producers can deliver the missing capabilities.'} Review submissions, then rebuild to use a published solution.</p><button className="secondary" onClick={onBounties}>View bounties</button><button className="secondary" disabled={busy || !['blocked','planned','completed'].includes(plan.status)} onClick={()=>void data.replan()}>Rebuild with new expertise</button></div></div>}
      {plan.status === "blocked" && (
        <div className="mission-alert" role="status">
          <CircleHelp size={19} />
          <div>
            <strong>This mission needs your attention.</strong>
            <p>{readableMessage(blocked || plan.blockers?.join(" ") || plan.explanation)}</p><button className="secondary" disabled={busy} onClick={()=>void (simulated?data.replan():data.rebuildInSimulation())}>{busy?"Preparing demo…":simulated?"Refresh demo for this prompt":"Rebuild with simulation providers"}</button>
          </div>
        </div>
      )}
      {plan.status === "cancelled" && (
        <div className="mission-alert neutral">
          <ShieldCheck size={18} />
          <p>
            Mission cancelled. Existing purchases and receipts are retained.
          </p>
        </div>
      )}
      <div className="mission-grid">
        <section className="plan-column">
          <div className="section-label">
            <span>Execution plan</span>
            <span>{plan.subtasks.length} shards</span>
          </div>
          <div className="step-list">
            {plan.subtasks.map((item, index) => (
              <div key={item.id}>
                <button
                  className={
                    "step-card glass-quiet " +
                    (selected === index ? "selected" : "")
                  }
                  onClick={() => {
                    setSelected(index);
                    if (window.innerWidth <= 1000) detailPanel.current?.scrollIntoView({ block: "start" });
                  }}
                  aria-pressed={selected === index}
                >
                  <span
                    className={
                      "step-number " +
                      (item.status === "completed" ? "done" : "")
                    }
                  >
                    {item.status === "completed" ? (
                      <Check size={15} />
                    ) : (
                      String(index + 1).padStart(2, "0")
                    )}
                  </span>
                  <span className="step-copy">
                    <span>
                      {item.object_name || item.requirements?.object_name || "Robot"} ·{" "}
                      {layerName(item.task_type)}
                    </span>
                    <strong>{item.title}</strong>
                    <small>
                      {item.decision?.selected_model_id
                        ? item.decision.candidates.find(
                            (candidate) =>
                              candidate.model.id ===
                              item.decision?.selected_model_id,
                          )?.model.name
                        : "No compatible provider"}
                    </small>
                    <small>{humanize(item.status)}</small>
                  </span>
                  <ChevronRight size={15} />
                </button>
                {index < plan.subtasks.length - 1 && (
                  <span className="step-connector">
                    <ArrowDown size={11} />
                    {plan.subtasks[index + 1].depends_on.length ? `Needs ${plan.subtasks[index + 1].depends_on.join(", ")}` : "Independent subtask"}
                  </span>
                )}
              </div>
            ))}
          </div>
          <div className="execution-actions">
            <button
              className="primary full-width"
              disabled={busy || plan.status !== "planned"}
              onClick={() => void data.execute()}
            >
              {busy ? (
                <LoaderCircle size={15} className="spin" />
              ) : (
                <Play size={14} />
              )}
              {busy
                ? "Working on your mission…"
                : plan.status === "completed"
                  ? "Mission completed"
                  : simulated?"Run simulation":"Execute mission"}
              {!busy && plan.status === "planned" && (
                <span>{usd(plan.estimated_cost_ausd)}</span>
              )}
            </button>
            {!["completed", "cancelled"].includes(plan.status) && (
              <button
                className="text-button cancel-button"
                disabled={busy}
                onClick={() => void data.cancel()}
              >
                Cancel mission
              </button>
            )}
            <p className="fine-print">
              {simulated?"Each demo provider runs locally. Outputs and demo charges are recorded per step.":"Each shard is purchased separately within your allowance."}
            </p>
          </div>
        </section>
        {step && <div ref={detailPanel}><StepDetail key={step.id + plan.id} step={step} /></div>}
      </div>
      <details className="method-note">
        <summary>
          <CircleHelp size={14} />
          How Scout built this plan
          <ChevronDown size={14} />
        </summary>
        <p>{plan.explanation}</p>
        {!!plan.assumptions?.length && <ul>{plan.assumptions.map((assumption, index) => <li key={index}>{assumption}</li>)}</ul>}
        <p>
          Planner: {plan.planner_model || plan.planner}. Scout checks the resulting graph against robot compatibility, available capabilities, and budget.
        </p>
      </details>
    </div>
  );
}

function Marketplace({ data, onBounties }: { data: RoboMarket; onBounties: () => void }) {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [category, setCategory] = useState('all');
  const [page, setPage] = useState(0);
  useEffect(()=>setPage(0),[filter,search,category]);
  const shown = data.models.filter(
    (model) =>
      (filter === "all" || model.task_type === filter) &&
      (category==='all'||model.category===category) &&
      search.toLowerCase().trim().split(/\s+/).every(term=>`${model.name} ${model.description} ${model.provider_id} ${model.task_type} ${(model.tags||[]).join(' ')}`.toLowerCase().includes(term)),
  );
  return (
    <div className="page market-page enter">
      <div className="page-heading">
        <div>
          <h1>Marketplace</h1>
        </div>
        <span className="count-badge">{data.models.length} shards</span>
      </div>
      <div className="market-toolbar">
        <div className="filter-list" aria-label="Filter expertise">
          {[
            "all",
            "object_detection",
            "grasp",
            "control",
            "path_planning",
            "scene_inspection",
          ].map((value) => (
            <button
              key={value}
              className={filter === value ? "active" : ""}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {value === "all" ? "All expertise" : layerName(value)}
            </button>
          ))}
        </div>
        <label className="search-input glass-quiet">
          <Search size={15} />
          <input
            aria-label="Search shards"
            placeholder="Find a skill…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      </div>
      <div className="market-browse"><label>Collection <select aria-label="Skill collection" value={category} onChange={e=>setCategory(e.target.value)}><option value="all">All collections</option>{[...new Set(data.models.map(m=>m.category).filter(Boolean))].sort().map(value=><option key={value} value={value}>{humanize(value)}</option>)}</select></label><span>{shown.length} matching skills</span><button className="text-button" onClick={onBounties}><Flag size={13} /> Need a missing skill? Post a bounty</button></div>
      <div className="market-grid">
        {shown.slice(page*18,(page+1)*18).map((model) => (
          <article className="glass market-card" key={model.id}>
            <div className="market-card-head">
              <span className={"layer-icon layer-" + model.task_type}>
                <LayerIcon type={model.task_type} size={18} />
              </span>
              <div className="market-card-copy">
                <div className="market-card-kicker">
                  <span className="eyebrow">{layerName(model.task_type)}</span>
                  <span className="tag">
                    {model.execution_mode === "simulation" ? "Simulation" : model.kind === "algorithm" ? "Algorithm" : "Pretrained"}
                  </span>
                </div>
                <h2>{model.name}</h2>
                <span className="vendor-name">
                  by {humanize(model.provider_id)}
                </span>
              </div>
            </div>
            <Suspense fallback={<div className="skill-preview skill-preview-loading" aria-label="Loading skill preview" />}>
              {model.execution_mode!=="simulation"&&<SkillPreview offer={model} />}
            </Suspense>
            <div className="market-card-bottom">
              <div>
                <strong>{money(model.price_ausd)}</strong>
                <span>{model.execution_mode==="simulation"?"demo credits / call":"AUSD / call"}</span>
              </div>
              <span className="latency-label">
                <Clock3 size={12} />
                {model.latency_ms.toFixed(0)} ms
                <small>
                  {model.latency_source === "measured_ema"
                    ? "measured EMA"
                    : "estimate"}
                </small>
              </span>
            </div>
            <button
              className="card-details-toggle"
              aria-expanded={expanded === model.id}
              onClick={() =>
                setExpanded(expanded === model.id ? null : model.id)
              }
            >
              Compatibility & details
              <ChevronDown size={14} />
            </button>
            {expanded === model.id && (
              <div className="offer-details">
                <dl className="spec-list">
                  <div>
                    <dt>Robots</dt>
                    <dd>{model.embodiments.map(humanize).join(", ")}</dd>
                  </div>
                  <div>
                    <dt>Sensors</dt>
                    <dd>
                      {model.required_sensors.map(humanize).join(", ") ||
                        "None required"}
                    </dd>
                  </div>
                  <div>
                    <dt>Objects</dt>
                    <dd>
                      {model.supported_objects.join(", ") || "Task dependent"}
                    </dd>
                  </div>
                  <div>
                    <dt>Quality</dt>
                    <dd>
                      {model.quality === null
                        ? "Not benchmarked"
                        : `${Math.round(model.quality * 100)}% · ${humanize(model.quality_source)}`}
                    </dd>
                  </div>
                </dl>
                <p className="fine-print">
                  Availability is provider-declared. Readiness is checked on
                  execution.
                </p>
              </div>
            )}
          </article>
        ))}
      </div>
      {shown.length>18 && <div className="market-pagination"><button className="secondary" disabled={page===0} onClick={()=>setPage(page-1)}>Previous</button><span>Page {page+1} of {Math.ceil(shown.length/18)}</span><button className="secondary" disabled={(page+1)*18>=shown.length} onClick={()=>setPage(page+1)}>Next</button></div>}
      {!shown.length && (
        <EmptyState
          icon={<Search size={26} />}
          title={
            data.online === false
              ? "The marketplace is offline."
              : "No matching expertise."
          }
        >
          {data.online === false
            ? "Start the local services, then refresh to load available shards."
            : "Try another search or choose a different capability."}
        </EmptyState>
      )}
      <p className="market-note">
        <ShieldCheck size={14} />
        Scout checks compatibility, task risk, latency, and your budget before
        selecting a provider.
      </p>
    </div>
  );
}

function WalletPage({ data }: { data: RoboMarket }) {
  return (
    <div className="page enter">
      <div className="page-heading">
        <div>
          <h1>Wallet & Receipts</h1>
        </div>
        <button className="secondary" onClick={() => void data.refresh()}>
          <Wallet size={14} />
          Refresh wallet
        </button>
      </div>
      <div className="wallet-layout">
        <WalletCard data={data} />
        <section className="glass ledger">
          <div className="panel-heading">
            <span className="label-with-icon">
              <Fingerprint size={17} />
              Purchase history
            </span>
            <span className="tag">{data.receipts.length} receipts</span>
          </div>
          {data.receipts.length ? (
            <div className="receipt-list">
              {data.receipts.map((receipt) => (
                <article className="receipt" key={receipt.request_id}>
                  <span className="soft-icon">
                    <Box size={17} />
                  </span>
                  <div>
                    <h3>
                      {data.models.find(
                        (model) => model.id === receipt.model_id,
                      )?.name || receipt.model_id}
                    </h3>
                    <Status value={receipt.status} />
                    <small>{receipt.timestamp} UTC</small>
                  </div>
                  <div className="receipt-price">
                    <strong>
                      {money(receipt.amount_ausd)} <small>AUSD</small>
                    </strong>
                    {receipt.explorer_url ? (
                      <a
                        href={receipt.explorer_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View receipt <ExternalLink size={12} />
                      </a>
                    ) : (
                      <span>No confirmed receipt</span>
                    )}
                    {receipt.pay_to && (
                      <small title={receipt.pay_to}>
                        Paid to {receipt.pay_to.slice(0, 8)}…{receipt.pay_to.slice(-4)}
                      </small>
                    )}
                    {receipt.audit_explorer_url && (
                      <a
                        href={receipt.audit_explorer_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        BNB audit record <ExternalLink size={12} />
                      </a>
                    )}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState icon={<Fingerprint size={30} />} title="A clean slate.">
              Your purchases will appear here, each with its amount, status, and
              verified onchain receipt when settled.
            </EmptyState>
          )}
        </section>
      </div>
    </div>
  );
}

function App() {
  const data = useRoboMarket();
  const [view, setView] = useState<View>("home");
  const [navOpen, setNavOpen] = useState(() => window.innerWidth > 760);
  const restored = useRef(false);
  const content = useRef<HTMLElement>(null);
  useEffect(() => {
    content.current?.scrollTo({ top: 0 });
  }, [view, data.plan?.id]);
  useEffect(() => {
    if (!data.restoring && !restored.current) {
      restored.current = true;
      if (data.plan) setView("mission");
    }
  }, [data.restoring, data.plan]);
  useEffect(() => {
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (window.innerWidth <= 760) setNavOpen(false);
      }
    }
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, []);
  function navigate(next: View) {
    setView(next);
    data.setError("");
    if (window.innerWidth <= 760) setNavOpen(false);
  }
  async function newMission() {
    if (await data.newMission()) navigate("mission");
  }
  const nav = [
    { key: "mission" as View, title: "Missions", icon: Sparkles },
    { key: "marketplace" as View, title: "Marketplace", icon: Layers3 },
    { key: "bounties" as View, title: "Bounties", icon: Flag },
    { key: "robot" as View, title: "Simulation studio", icon: Bot },
    { key: "wallet" as View, title: "Wallet & receipts", icon: Wallet },
  ];
  return (
    <div
      className={
        "app-shell " +
        (navOpen ? "nav-open " : "") +
        ""
      }
    >
      <Background />
      {navOpen && (
        <button
          className="mobile-scrim"
          aria-label="Close navigation"
          onClick={() => setNavOpen(false)}
        />
      )}
      <aside className="sidebar" aria-label="Main navigation" inert={!navOpen}>
        <div className="brand-row">
          <button
            className="brand"
            onClick={() => navigate("home")}
            aria-label="rBazaar home"
          >
            <BrandMark />
            <span>rBazaar</span>
          </button>
          <IconButton
            label="Collapse sidebar"
            onClick={() => setNavOpen(false)}
          >
            <PanelLeftClose size={17} />
          </IconButton>
        </div>
        <button
          className="new-mission"
          disabled={data.busy || data.restoring}
          onClick={() => void newMission()}
        >
          <Plus size={16} />
          New mission<span>↗</span>
        </button>
        <nav>
          {nav.map((item) => (
            <button
              key={item.key}
              className={
                view === item.key || (view === "home" && item.key === "mission")
                  ? "active"
                  : ""
              }
              aria-current={view === item.key ? "page" : undefined}
              onClick={() => navigate(item.key)}
            >
              <item.icon size={18} strokeWidth={1.7} />
              <span>{item.title}</span>
              {item.key === "mission" && data.plan && (
                <span className="nav-count">1</span>
              )}
            </button>
          ))}
        </nav>
        <div className="recent-missions">
          <div className="section-label">
            <span>Recent missions</span>
            <Plus size={12} />
          </div>
          {data.recent.length ? (
            data.recent.map((item) => (
              <button
                key={item.id}
                disabled={data.busy}
                className={
                  data.plan?.id === item.id && view === "mission"
                    ? "active"
                    : ""
                }
                onClick={() =>
                  void data.openMission(item.id).then((next) => {
                    if (next) navigate("mission");
                  })
                }
              >
                <span className="recent-dot" />
                <span>{item.title}</span>
              </button>
            ))
          ) : (
            <p>No recent missions</p>
          )}
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-left">
            {!navOpen && (
              <IconButton label="Show sidebar" onClick={() => setNavOpen(true)}>
                <PanelLeftOpen size={17} />
              </IconButton>
            )}
            {view !== "home" && (
              <>
                <button
                  className="breadcrumb-home"
                  onClick={() => navigate("home")}
                >
                  Workspace
                </button>
                <ChevronRight size={12} />
                <span>
                  {view === "mission"
                    ? "Missions"
                    : view === "marketplace"
                      ? "Marketplace"
                      : view === "bounties" ? "Bounties"
                      : view === "wallet"
                        ? "Wallet & receipts"
                        : "Simulation studio"}
                </span>
              </>
            )}
          </div>
          <div className="topbar-right">
            <span className="workspace-status">
              <span
                className={
                  "tiny-dot " + (data.online === false ? "offline" : "")
                }
              />
              {data.online === null
                ? "Connecting"
                : data.online
                  ? "Scout is online"
                  : "Offline"}
            </span>
            <span className="topbar-divider" />

          </div>
        </header>
        <main ref={content} id="main-content" className="main-content">
          {data.error && (
            <div className="error-banner" role="alert">
              <CircleHelp size={17} />
              <p>{data.error}</p>
              <IconButton
                label="Dismiss error"
                onClick={() => data.setError("")}
              >
                <X size={15} />
              </IconButton>
            </div>
          )}
          {view === "home" && (
            <Composer
              data={data}
              onPlanned={() => navigate("mission")}
              hero={
                <>
                  <h1>A marketplace where robots buy skills</h1>
                  <p>
                    Describe a task in plain language. rBazaar breaks it into
                    steps, finds a skill in the marketplace for each one, and
                    pays for it per use.
                  </p>
                </>
              }
              footer={
                <ol className="how-it-works">
                  <li>
                    <strong>Describe a task</strong>
                    <span>
                      Say what the robot should do, like “organize my workbench”.
                    </span>
                  </li>
                  <li>
                    <strong>Match skills</strong>
                    <span>
                      Each step gets a skill that fits your robot’s hardware and
                      budget. If none exists, post a bounty.
                    </span>
                  </li>
                  <li>
                    <strong>Pay per use</strong>
                    <span>
                      Skills run in order and are paid in AUSD micropayments,
                      with a receipt for each.
                    </span>
                  </li>
                </ol>
              }
            />
          )}
          {view === "mission" && (
            <Mission data={data} onNew={() => void newMission()} onBounties={()=>navigate('bounties')} onRobot={()=>navigate('robot')} />
          )}
          {view === "marketplace" && <Marketplace data={data} onBounties={()=>navigate('bounties')} />}
          {view === "bounties" && <Suspense fallback={<p className="preview-loading">Loading bounty board…</p>}><BountyBoard data={data} /></Suspense>}
          {view === "wallet" && <WalletPage data={data} />}
          {view === "robot" && <Suspense fallback={<p className="preview-loading">Loading connected robot workcell…</p>}><RobotStation data={data} onMission={()=>navigate('mission')}/></Suspense>}

        </main>
      </div>

    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
