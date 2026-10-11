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
  Zap,
} from "lucide-react";
import "@fontsource-variable/inter";
import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
import { useRoboMarket, type RoboMarket } from "./lib/useRoboMarket";
import {
  humanize,
  layerName,
  money,
  type Step,
  type View,
} from "./lib/types";
import "./style.css";

const ArmScene = lazy(() => import("./components/ArmScene").then((module) => ({ default: module.ArmScene })));

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
      <Layers3 size={small ? 16 : 19} strokeWidth={1.5} />
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

function RobotCard({
  data,
  compact = false,
}: {
  data: RoboMarket;
  compact?: boolean;
}) {
  const { arm, busy, plan } = data;
  return (
    <section className={"glass robot-card " + (compact ? "compact" : "")}>
      <div className="panel-heading">
        <span className="eyebrow">Robot workcell</span>
        <Status
          value={
            arm.running
              ? "running"
              : arm.phase === "complete"
                ? "completed"
                : "idle"
          }
        />
      </div>
      <div className="scene-wrap">
        <Suspense fallback={<div className="robot-viewport robot-scene-loading" aria-label="Loading 3D robot workspace" />}>
          <ArmScene arm={arm} />
        </Suspense>
      </div>
      <div className="robot-card-body">
        <div className="robot-title">
          <span className="soft-icon">
            <Bot size={19} />
          </span>
          <div>
            <h3>Scout’s pair of hands</h3>
            <p>6-axis arm · robot workspace</p>
          </div>
        </div>
        <dl className="spec-list">
          <div>
            <dt>Gripper</dt>
            <dd>
              {humanize(plan?.request.robot_card?.gripper || data.gripper)}
            </dd>
          </div>
          <div>
            <dt>Payload</dt>
            <dd>1.5 kg</dd>
          </div>
          <div>
            <dt>Senses</dt>
            <dd>RGB · depth · force</dd>
          </div>
          <div>
            <dt>Compute</dt>
            <dd>Jetson Orin</dd>
          </div>
        </dl>
        {arm.output && (
          <div className="motion-readout">
            <div>
              <span>Grip force</span>
              <strong>
                {arm.output.force_n.toFixed(2)} <small>N</small>
              </strong>
            </div>
            <div>
              <span>Speed</span>
              <strong>
                {arm.output.speed_mm_s} <small>mm/s</small>
              </strong>
            </div>
          </div>
        )}
        <div className="robot-caption">
          <span className="tiny-dot" />
          {arm.reason}
        </div>
        {plan?.status === "waiting_for_motion" && (
          <button
            className="secondary full-width"
            disabled={busy}
            onClick={() => void data.control(arm.running ? "pause" : "start")}
          >
            {arm.running ? <Pause size={14} /> : <Play size={14} />}
            {arm.running ? "Pause motion" : "Resume motion"}
          </button>
        )}
        <p className="fine-print">
          Simulated handling. Skin removal and material physics are not modeled.
        </p>
      </div>
    </section>
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
}: {
  data: RoboMarket;
  onPlanned: () => void;
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
        <span className="hero-symbol">
          <Sparkles size={23} strokeWidth={1.4} />
        </span>
        <h1>
          What should we
          <br />
          <em>put in motion?</em>
        </h1>
        <p>
          Give Scout a task. It will find the right expertise,
          <br className="desktop-break" /> fit it to your robot, and bring the
          pieces together.
        </p>
      </div>
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
              title="Attach observation image"
            >
              <ImagePlus size={18} />
              <span className="sr-only">Attach observation image</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void data.upload(file);
                  event.target.value = "";
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
            </button>
          </div>
          <span className="budget-hint">
            {money(data.budget || "0")} AUSD limit
          </span>
          <button
            className="send-button"
            title="Build mission plan"
            aria-label="Build mission plan"
            disabled={
              data.busy ||
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
        {settingsOpen && (
          <div id="mission-settings" className="mission-settings">
            <label>
              Mission budget <span>AUSD</span>
              <input
                aria-label="Mission budget"
                type="number"
                min="0.001"
                step="0.001"
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
            <label>
              Gripper
              <select
                aria-label="Gripper"
                value={data.gripper}
                onChange={(event) => data.setGripper(event.target.value)}
              >
                <option value="parallel_jaw">Parallel jaw</option>
                <option value="suction">Suction</option>
                <option value="none">None</option>
              </select>
            </label>
            <p>
              Parameters apply to this plan. Settlement time is separate from
              inference time.
            </p>
          </div>
        )}
      </div>
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
        <span>Review the plan and its cost before any purchase.</span>
      </div>
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
          Purchased output {step.result && <i className="tiny-dot" />}
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
                        {money(candidate.model.price_ausd)} <small>AUSD</small>
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
            <EmptyState
              icon={<Box size={26} />}
              title="Expertise, ready when you are."
            >
              Execute this mission to see the purchased result here. Each output
              becomes the next shard’s input.
            </EmptyState>
          )}
        </div>
      )}
    </section>
  );
}

function Mission({ data, onNew }: { data: RoboMarket; onNew: () => void }) {
  const [selected, setSelected] = useState(0);
  const detailPanel = useRef<HTMLDivElement>(null);
  const { plan, busy } = data;
  useEffect(() => setSelected(0), [plan?.id]);
  if (!plan) return <Composer data={data} onPlanned={() => setSelected(0)} />;
  const completed = plan.subtasks.filter(
    (step) => step.status === "completed",
  ).length;
  const step = plan.subtasks[Math.min(selected, plan.subtasks.length - 1)];
  const blocked = plan.subtasks.find((item) => item.error)?.error;
  return (
    <div className="page mission-page enter">
      <div className="page-heading">
        <div>
          <div className="heading-kicker">
            <Sparkles size={14} /> Your mission, considered.
          </div>
          <h1>{plan.request.task}</h1>
          <p>
            One goal. {plan.subtasks.length} specialized shards. Every choice
            explained.
          </p>
        </div>
        <button className="secondary" onClick={onNew} disabled={busy}>
          <Plus size={15} />
          New mission
        </button>
      </div>
      <div className="mission-summary glass-quiet">
        <div>
          <span className="eyebrow">Mission status</span>
          <Status value={plan.status} />
        </div>
        <div>
          <span className="eyebrow">Quoted cost</span>
          <strong>
            {money(plan.estimated_cost_ausd)} <small>AUSD</small>
          </strong>
        </div>
        <div>
          <span className="eyebrow">Budget</span>
          <strong>
            {money(plan.request.budget_ausd)} <small>AUSD</small>
          </strong>
        </div>
        <div>
          <span className="eyebrow">Purchased</span>
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
      {plan.status === "blocked" && (
        <div className="mission-alert" role="status">
          <CircleHelp size={19} />
          <div>
            <strong>This mission needs your attention.</strong>
            <p>{readableMessage(blocked || plan.blockers?.join(" ") || plan.explanation)}</p>
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
                  : "Execute mission"}
              {!busy && plan.status === "planned" && (
                <span>{money(plan.estimated_cost_ausd)} AUSD</span>
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
              Each shard is purchased separately within your allowance.
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

function Marketplace({ data }: { data: RoboMarket }) {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const shown = data.models.filter(
    (model) =>
      (filter === "all" || model.task_type === filter) &&
      `${model.name} ${model.provider_id} ${model.task_type}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <div className="page market-page enter">
      <div className="page-heading">
        <div>
          <div className="heading-kicker">
            <Layers3 size={14} /> The right skill, on demand.
          </div>
          <h1>A little more capability.</h1>
          <p>Specialized expertise for the things your robot needs to do.</p>
        </div>
        <span className="count-badge">{data.models.length} expert shards</span>
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
      <div className="market-grid">
        {shown.map((model) => (
          <article className="glass market-card" key={model.id}>
            <div className="market-card-top">
              <span className={"layer-icon layer-" + model.task_type}>
                <LayerIcon type={model.task_type} size={22} />
              </span>
              <span className="tag">
                {model.kind === "algorithm" ? "Algorithm" : "Pretrained model"}
              </span>
            </div>
            <span className="eyebrow">{layerName(model.task_type)}</span>
            <h2>{model.name}</h2>
            <span className="vendor-name">
              by {humanize(model.provider_id)}
            </span>
            <div className="market-card-bottom">
              <div>
                <strong>{money(model.price_ausd)}</strong>
                <span>AUSD / call</span>
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
          <div className="heading-kicker">
            <ShieldCheck size={14} /> Every purchase, accounted for.
          </div>
          <h1>Intelligence has a receipt.</h1>
          <p>A clear view of what Scout spends, and what it gets in return.</p>
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
  const [contextOpen, setContextOpen] = useState(false);
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
        setContextOpen(false);
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
    { key: "robot" as View, title: "Robot station", icon: Bot },
    { key: "wallet" as View, title: "Wallet & receipts", icon: Wallet },
  ];
  return (
    <div
      className={
        "app-shell " +
        (navOpen ? "nav-open " : "") +
        (contextOpen ? "context-open" : "")
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
            aria-label="RoboMarket home"
          >
            <BrandMark />
            <span>robomarket</span>
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
            <p>Your next idea starts here.</p>
          )}
        </div>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="tiny-dot" />
            {data.online === null
              ? "Connecting to workspace"
              : data.online
                ? "Local workspace connected"
                : "Workspace offline"}
          </div>
          <button className="profile-button" onClick={() => navigate("robot")}>
            <span className="profile-avatar">
              <Bot size={18} />
            </span>
            <span>
              <strong>Scout</strong>
              <small>Robot workspace</small>
            </span>
            <ChevronRight size={14} />
          </button>
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
                      : view === "wallet"
                        ? "Wallet & receipts"
                        : "Robot station"}
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
            <IconButton
              label={contextOpen ? "Hide robot context" : "Show robot context"}
              onClick={() => setContextOpen(!contextOpen)}
            >
              {contextOpen ? (
                <PanelRightClose size={17} />
              ) : (
                <PanelRightOpen size={17} />
              )}
            </IconButton>
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
            <div className="landing enter">
              <div className="hero-heading">
                <div className="landing-eyebrow">
                  <span className="tiny-dot" />A workspace for robot
                  intelligence
                </div>
                <h1>Start with a task.</h1>
                <p>
                  Your robot has the hands. Scout finds the expertise.
                  <br />A little intelligence, exactly when it’s needed.
                </p>
              </div>
              <div className="welcome-cards">
                <button
                  className="welcome-card glass-raised"
                  onClick={() => navigate("mission")}
                >
                  <div className="welcome-card-title">
                    <span className="welcome-icon">
                      <Zap size={19} strokeWidth={1.7} />
                    </span>
                    <h2>{data.plan ? "Your mission" : "Run a mission"}</h2>
                    <ArrowRight size={17} />
                  </div>
                  <p>
                    {data.plan
                      ? "Pick up where you left off. Review the plan, see every decision, and follow your robot’s progress."
                      : "Describe what needs doing. Scout builds a plan, chooses the right skills, and puts them to work."}
                  </p>
                  <div className="welcome-card-footer">
                    <span className="skill-bubble">
                      <Eye size={13} />
                    </span>
                    <span className="skill-bubble">
                      <Hand size={13} />
                    </span>
                    <span className="skill-bubble">
                      <Activity size={13} />
                    </span>
                    <span>perceive · plan · act</span>
                  </div>
                </button>
                <button
                  className="welcome-card glass"
                  onClick={() => navigate("marketplace")}
                >
                  <div className="welcome-card-title">
                    <span className="welcome-icon neutral">
                      <Layers3 size={19} strokeWidth={1.7} />
                    </span>
                    <h2>Explore expertise</h2>
                    <ArrowRight size={17} />
                  </div>
                  <p>
                    A marketplace of specialized skills. Find the models and
                    controllers that fit your robot and your budget.
                  </p>
                  <div className="welcome-card-footer">
                    <span className="soft-pill">Perception</span>
                    <span className="soft-pill">Grasp</span>
                    <span className="soft-pill">Control</span>
                  </div>
                </button>
              </div>
              <div className="landing-note">
                <ShieldCheck size={13} />
                Your robot. Your budget. Every decision explained.
              </div>
            </div>
          )}
          {view === "mission" && (
            <Mission data={data} onNew={() => void newMission()} />
          )}
          {view === "marketplace" && <Marketplace data={data} />}
          {view === "wallet" && <WalletPage data={data} />}
          {view === "robot" && (
            <div className="page enter">
              <div className="page-heading">
                <div>
                  <div className="heading-kicker">
                    <Bot size={14} /> Your robot, in context.
                  </div>
                  <h1>Meet the hands behind it.</h1>
                  <p>
                    The workspace, capabilities, and live state Scout plans
                    around.
                  </p>
                </div>
                <button
                  className="secondary"
                  onClick={() => navigate("mission")}
                >
                  <Sparkles size={15} />
                  Open mission
                  <ArrowRight size={14} />
                </button>
              </div>
              <div className="station-layout">
                <RobotCard data={data} />
                <div className="station-notes">
                  <section className="glass station-note">
                    <span className="soft-icon">
                      <Eye size={20} />
                    </span>
                    <h2>Start with what it sees.</h2>
                    <p>
                      Attach a clear photo of the objects in your workspace when composing
                      a mission. Scout needs a successful detection before it
                      can plan a grasp.
                    </p>
                    <span className="tag">
                      {data.image
                        ? data.imageName
                        : "Using synthetic observation"}
                    </span>
                  </section>
                  <section className="glass station-note">
                    <span className="soft-icon">
                      <ShieldCheck size={20} />
                    </span>
                    <h2>A considered next move.</h2>
                    <p>
                      Every provider is checked against the arm’s gripper,
                      sensors, payload, and the object’s handling needs. Motion
                      follows purchased control output.
                    </p>
                    <p className="fine-print">
                      Image coordinates are not calibrated to a physical robot.
                      The server advances the simulation independently of this dashboard.
                    </p>
                  </section>
                </div>
              </div>
            </div>
          )}
        </main>
        <footer className="app-footer">
          <span>Small skills. Bigger possibilities.</span>
          <span>
            RoboMarket <i /> Testnet workspace
          </span>
        </footer>
      </div>
      {contextOpen && (
        <>
          <button
            className="context-scrim"
            aria-label="Close robot context"
            onClick={() => setContextOpen(false)}
          />
          <aside className="context-panel" aria-label="Robot context">
            <div className="context-heading">
              <span className="eyebrow">Robot context</span>
              <IconButton
                label="Close context panel"
                onClick={() => setContextOpen(false)}
              >
                <X size={16} />
              </IconButton>
            </div>
            <RobotCard data={data} compact />
            <WalletCard data={data} compact />
          </aside>
        </>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
