import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowRight,
  ArrowUp,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  ExternalLink,
  Fingerprint,
  Flag,
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
  usd,
  DEFAULT_ROBOT,
  liveStep,
  type Candidate,
  type Step,
  type Plan,
  type View,
} from "./lib/types";
import "./style.css";
import MissionPricing from './components/MissionPricing';
import { GROUPS, familyOf } from "./lib/skills";

const sentence = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

const RobotStation = lazy(() => import('./components/RobotStation'));
const SkillPreview = lazy(() => import("./components/SkillPreview").then((module) => ({ default: module.SkillPreview })));
const TaskPreview3D = lazy(() => import("./components/TaskPreview3D"));
const BountyBoard = lazy(() => import("./components/BountyBoard"));
const AccountArea = lazy(() => import("./account/AccountArea"));
import PaymentFlow, { AccountButton } from "./account/PaymentFlow";

function readableMessage(message: string) {
  if (/missing.*(ROBOT_PRIVATE_KEY|FACILITATOR_PRIVATE_KEY|PROVIDER_ADDRESS)/i.test(message)) {
    return "Connect the robot wallet, settlement wallet, and provider recipient to execute a mission.";
  }
  return message.replaceAll("configured_estimate", "estimated latency").replaceAll("measured_ema", "measured latency");
}

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
        <a
          className="launch-tag"
          href="https://youtu.be/4LPFffFtbiI"
          target="_blank"
          rel="noreferrer"
        >
          <span className="launch-tag-badge">New</span>
          Watch our launch video
          <ArrowRight size={13} />
        </a>
        <h1>Model weights for robots, paid per call</h1>
        <p>
          A marketplace for physical AI. Developers sell VLAs, expert models,
          and policy layers. Your robot rents exactly the ones a task needs and
          pays per inference.
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
        {!!data.media.length && (
          <div className="attachment-list">
            {data.media.map((file, i) => (
              <div key={i}>
                <span>{file.name}</span>
                <small>{file.kind === "video" ? `${file.frames?.length || 0} frames` : file.kind.toUpperCase()}</small>
                <button className="icon-button" aria-label={`Remove ${file.name}`} onClick={() => data.removeMedia(i)}>
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
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
              Spending limit (USD)
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
            <label>Execution mode <select aria-label="Execution mode" value={data.executionMode} onChange={e=>data.setExecutionMode(e.target.value as 'simulation'|'testnet')}><option value="simulation">Simulation · USD estimates</option><option value="testnet">Real providers · AUSD testnet</option></select></label>
            <label>Automatic bounty reward (USD) <input aria-label="Automatic bounty reward" type="number" min="0.000001" step="0.01" value={data.bountyReward} onChange={e=>data.setBountyReward(e.target.value)}/></label>
            <label><input type="checkbox" checked={data.autoBounties} onChange={e=>data.setAutoBounties(e.target.checked)}/> Automatically post bounties for missing skills</label>
          </div></div>
        </div>
      </div>
      <ol className="how-it-works">
        <li>
          <strong>Describe a task</strong>
          <span>
            Tell your robot what to do. Claude splits it into steps like
            perception, grasp planning, and control.
          </span>
        </li>
        <li>
          <strong>Route to models</strong>
          <span>
            Each step goes to the VLA, expert, or layer that best fits your
            robot’s hardware and budget. Missing one? Post a bounty.
          </span>
        </li>
        <li>
          <strong>Pay per inference</strong>
          <span>
            Weights run on demand, and each call settles as an AUSD
            micropayment with a receipt.
          </span>
        </li>
      </ol>
    </div>
  );
}

function StepDetail({ step, index }: { step: Step; index: number }) {
  const [comparing, setComparing] = useState(false);
  const decision = step.decision;
  const candidates =
    decision?.candidates.filter(
      (candidate) => candidate.model.task_type === step.task_type,
    ) || [];
  candidates.sort((a, b) => Number(b.eligible) - Number(a.eligible) || (a.score ?? Infinity) - (b.score ?? Infinity));
  const chosen = candidates.find((candidate) => candidate.model.id === decision?.selected_model_id);
  const others = candidates.filter((candidate) => candidate !== chosen && candidate.eligible);
  const excluded = candidates.filter((candidate) => !candidate.eligible).length;
  const row = (candidate: Candidate, selected = false) => (
    <div key={candidate.model.id} className={"model-row" + (selected ? " selected" : "") + (candidate.eligible ? "" : " excluded")}>
      <div>
        <strong>{candidate.model.name}</strong>
        <span>{humanize(candidate.model.provider_id)}</span>
      </div>
      <span>{usd(candidate.model.price_ausd)}</span>
      <span>{candidate.model.latency_ms.toFixed(0)} ms</span>
      <span className="model-score">{selected ? <><Check size={12} /> Selected</> : candidate.eligible ? candidate.score?.toFixed(2) ?? "—" : "Excluded"}</span>
    </div>
  );
  return (
    <section className="step-detail glass-quiet">
      <div className="step-detail-head">
        <span>Step {index + 1} · {sentence(layerName(step.task_type))}</span>
      </div>
      <h2>{step.title}</h2>
      <p className="step-detail-description">{step.description}</p>
      {step.success_criteria && <p className="step-detail-done"><Check size={13} /> {step.success_criteria}</p>}
      <div className="step-detail-models">
        <span className="step-detail-label">Model</span>
        {chosen ? row(chosen, true) : <p className="step-detail-empty">No compatible model in the marketplace yet.</p>}
        {!!others.length && (
          <button className="text-button step-detail-compare" aria-expanded={comparing} onClick={() => setComparing(!comparing)}>
            {comparing ? "Hide" : "Compare"} {others.length} {others.length === 1 ? "alternative" : "alternatives"}
            <ChevronDown size={13} />
          </button>
        )}
        {comparing && <>{others.map((candidate) => row(candidate))}<p className="step-detail-note">Ranked by score; lower is better.{excluded ? ` ${excluded} more excluded as incompatible with this robot, budget or deadline.` : ""}</p></>}
      </div>
      {step.result && (
        <details className="step-detail-output">
          <summary>Output · {step.result.inference_latency_ms.toFixed(0)} ms<ChevronDown size={13} /></summary>
          <p>{step.result.summary}</p>
          <pre>{JSON.stringify(Object.keys(step.result.output).length ? step.result.output : step.result.predictions, null, 2)}</pre>
          {step.payment?.explorer_url && (
            <a className="text-link" href={step.payment.explorer_url} target="_blank" rel="noreferrer">
              View receipt <ExternalLink size={13} />
            </a>
          )}
        </details>
      )}
    </section>
  );
}

function Mission({ data, onNew, onRobot }: { data: RoboMarket; onNew: () => void; onRobot:()=>void }) {
  const selected=data.followLive?liveStep(data.plan):data.previewStep;
  const setSelected=(index:number)=>{data.setPreviewStep(index);data.setFollowLive(false);};
  const { plan, busy } = data;
  const simulated = plan?.request.execution_mode === "simulation";
  useEffect(() => data.setPreviewStep(0), [plan?.id]);
  if (!plan) return <Composer data={data} onPlanned={() => setSelected(0)} />;
  const completed = plan.subtasks.filter(
    (step) => step.status === "completed",
  ).length;
  const index = Math.min(selected, plan.subtasks.length - 1);
  const step = plan.subtasks[index];
  const blocked = plan.subtasks.find((item) => item.error)?.error;
  const scene = plan.simulation_scene?.source === "simulation_fixture" ? plan.simulation_scene : null;
  const modelName = (item: Step) => item.decision?.candidates.find((candidate) => candidate.model.id === item.decision?.selected_model_id)?.model;
  const run = () => {
    if (!simulated) return void window.dispatchEvent(new Event("rbazaar:checkout"));
    data.setFollowLive(true);
    void data.execute();
  };
  return (
    <div className="page mission-page enter">
      <div className="mission-header">
        <div>
          <h1>{plan.request.task}</h1>
          <p className="mission-meta">
            <span>{plan.robot_visual?.name || "Generated robot"}</span>
            <span>{completed} / {plan.subtasks.length} steps</span>
            <span>{usd(plan.estimated_cost_ausd)} in skills</span>
          </p>
        </div>
        <div className="mission-actions">
          {!["completed", "cancelled"].includes(plan.status) && (
            <button className="text-button" disabled={busy} onClick={() => void data.cancel()}>Cancel</button>
          )}
          <button className="secondary" onClick={onNew} disabled={busy}>
            <Plus size={15} />
            New mission
          </button>
          {plan.status === "planned" && (
            <button className="primary" disabled={busy} onClick={run}>
              {busy ? <LoaderCircle size={15} className="spin" /> : <Play size={14} />}
              {simulated ? "Run simulation" : "Execute mission"}
            </button>
          )}
        </div>
      </div>
      <div className="mission-progress" aria-hidden="true"><span style={{ width: `${(completed / Math.max(1, plan.subtasks.length)) * 100}%` }} /></div>
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
          <p>Mission cancelled. Existing purchases and receipts are retained.</p>
        </div>
      )}
      <div className="mission-main">
        {scene && (
          <section className="mission-stage glass-quiet">
            <button className="text-button mission-stage-open" onClick={onRobot}>Open studio <ArrowRight size={13} /></button>
            <Suspense fallback={<p className="preview-loading">Loading 3D workcell…</p>}>
              <TaskPreview3D key={plan.id} compact scene={scene} plan={plan} selected={index} onSelect={setSelected} robot={{...DEFAULT_ROBOT,...(plan.request.robot_card||data.robotConfig)}} arm={data.arm} mode={data.followLive?'live':'preview'} onFollow={()=>data.setFollowLive(true)} />
            </Suspense>
          </section>
        )}
        <section className="mission-steps">
          <div className="section-label"><span>Plan</span><span>{plan.subtasks.length} steps</span></div>
          <ol className="plan-steps">
            {plan.subtasks.map((item, i) => (
              <li key={item.id}>
                <button className={"plan-step" + (i === index ? " selected" : "")} aria-pressed={i === index} onClick={() => setSelected(i)}>
                  <span className={"step-number " + (item.status === "completed" ? "done" : "")}>
                    {item.status === "completed" ? <Check size={13} /> : ["running", "waiting_for_motion"].includes(item.status) ? <LoaderCircle size={13} className="spin" /> : i + 1}
                  </span>
                  <span className="plan-step-copy">
                    <strong>{item.title}</strong>
                    <small>{modelName(item)?.name ?? "No model yet"}</small>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      </div>
      {step && <StepDetail key={step.id + plan.id} step={step} index={index} />}
      <details className="mission-details">
        <summary>Mission details<ChevronDown size={14} /></summary>
        <MissionPricing plan={plan} data={data} />
        <h3>How the plan was built</h3>
        <p>{plan.explanation}</p>
        {!!plan.assumptions?.length && <ul>{plan.assumptions.map((assumption, i) => <li key={i}>{assumption}</li>)}</ul>}
        <p className="fine-print">
          Planner: {plan.planner_model || plan.planner}. {simulated ? "Simulation: marketplace spending is simulated and providers run locally; the 3D workcell uses estimated kinematics." : "Each step is purchased separately within your allowance."}
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
      (filter === "all" || GROUPS.find((group) => group.key === filter)?.families.includes(familyOf(model.task_type))) &&
      (category==='all'||model.category===category) &&
      search.toLowerCase().trim().split(/\s+/).every(term=>`${model.name} ${model.description} ${model.provider_id} ${model.task_type} ${(model.tags||[]).join(' ')}`.toLowerCase().includes(term)),
  );
  return (
    <div className="page market-page enter">
      <div className="page-heading">
        <div>
          <h1>Marketplace</h1>
        </div>
        <span className="count-badge">{data.models.length.toLocaleString()} models</span>
      </div>
      <div className="market-toolbar">
        <div className="filter-list" aria-label="Filter expertise">
          {[{ key: "all", label: "All" }, ...GROUPS].map(({ key, label }) => (
            <button
              key={key}
              className={filter === key ? "active" : ""}
              aria-pressed={filter === key}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="search-input glass-quiet">
          <Search size={15} />
          <input
            aria-label="Search shards"
            placeholder="Search models, objects, tasks…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      </div>
      <div className="market-browse"><label>Collection <select aria-label="Skill collection" value={category} onChange={e=>setCategory(e.target.value)}><option value="all">All collections</option>{[...new Set(data.models.map(m=>m.category).filter(Boolean))].sort().map(value=><option key={value} value={value}>{humanize(value)}</option>)}</select></label><span>{shown.length.toLocaleString()} matching</span><button className="text-button" onClick={onBounties}><Flag size={13} /> Need a missing skill? Post a bounty</button></div>
      <div className="market-grid">
        {shown.slice(page*18,(page+1)*18).map((model) => (
          <article className="glass market-card" key={model.id}>
            <div className="market-card-kicker">
              <span className="market-card-type">{sentence(layerName(model.task_type))}</span>
              <span className="tag">
                {model.execution_mode === "simulation" ? "Simulation" : model.kind === "algorithm" ? "Algorithm" : "Pretrained"}
              </span>
            </div>
            <h2 title={model.name}>{model.name}</h2>
            <span className="vendor-name">by {humanize(model.provider_id)}</span>
            <Suspense fallback={<div className="skill-preview skill-preview-loading" aria-label="Loading skill preview" />}>
              <SkillPreview offer={model} />
            </Suspense>
            <div className="market-card-bottom">
              <div>
                <strong>{usd(model.price_ausd)}</strong>
                <span>{model.execution_mode === "simulation" ? "per call · demo" : "per call"}</span>
              </div>
              <span className="latency-label" title={model.latency_source === "measured_ema" ? "Measured moving average" : "Provider estimate"}>
                <Clock3 size={12} />
                {model.latency_ms.toFixed(0)} ms
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
                      : view === "account" ? "Account"
                      : view === "wallet"
                        ? "Wallet & receipts"
                        : "Simulation studio"}
                </span>
              </>
            )}
          </div>
          <div className="topbar-right">
            <AccountButton onOpen={() => navigate("account")} />
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
            <Composer data={data} onPlanned={() => navigate("mission")} />
          )}
          {view === "mission" && (
            <Mission data={data} onNew={() => void newMission()} onRobot={()=>navigate('robot')} />
          )}
          {view === "marketplace" && <Marketplace data={data} onBounties={()=>navigate('bounties')} />}
          {view === "bounties" && <Suspense fallback={<p className="preview-loading">Loading bounty board…</p>}><BountyBoard data={data} /></Suspense>}
          {(view === "wallet" || view === "account") && <Suspense fallback={<p className="preview-loading">Loading your account…</p>}><AccountArea data={data} tab={view === "wallet" ? "wallet" : "profile"} /></Suspense>}
          {view === "robot" && <Suspense fallback={<p className="preview-loading">Loading connected robot workcell…</p>}><RobotStation data={data} onMission={()=>navigate('mission')}/></Suspense>}

        </main>
      </div>
      <PaymentFlow data={data} onHistory={() => navigate("wallet")} />
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
