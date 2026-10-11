import { useState } from "react";
import { Check, Flag, Plus, Send } from "lucide-react";
import { humanize, money, type Bounty } from "../lib/types";
import type { RoboMarket } from "../lib/useRoboMarket";

function ProducerForm({ bounty, data }: {bounty: Bounty; data: RoboMarket}) {
  const [producer, setProducer] = useState("demo_producer");
  const [name, setName] = useState(bounty.title);
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [price, setPrice] = useState("0.001");
  const [operation, setOperation] = useState("set_attribute");
  const [attribute, setAttribute] = useState("task_outcome");
  const [value, setValue] = useState("completed in simulation");
  const [sent, setSent] = useState(false);
  return sent ? <p className="bounty-success"><Check size={14} /> Solution submitted for consumer review.</p> : <form className="bounty-form" onSubmit={async e => {
    e.preventDefault();
    if (await data.submitBounty(bounty.id,{producer_id:producer,model_name:name,description,evidence_url:url,price_ausd:price,operation,attribute,value})) setSent(true);
  }}>
    <h3>Submit a producer solution</h3>
    <div className="bounty-form-grid">
      <label>Producer ID<input required pattern="[a-z0-9_-]{1,64}" value={producer} onChange={e=>setProducer(e.target.value)} /></label>
      <label>Model / skill name<input required minLength={3} maxLength={100} value={name} onChange={e=>setName(e.target.value)} /></label>
      <label>Price per call<input required type="number" min="0.000001" step="0.000001" value={price} onChange={e=>setPrice(e.target.value)} /></label>
      <label>Evidence or model URL<input type="url" placeholder="https://… (optional)" value={url} onChange={e=>setUrl(e.target.value)} /></label>
    </div>
    <label>How it meets the requested outcome<textarea required minLength={10} maxLength={3000} value={description} onChange={e=>setDescription(e.target.value)} /></label>
    {bounty.execution_mode==='simulation' && <>
      <p className="fine-print">Demo delivery: publish a fixture adapter that reads or changes one object's attribute. It consumes detection evidence and runs locally. This records simulated behavior.</p>
      <div className="bounty-form-grid">
        <label>Fixture operation<select value={operation} onChange={e=>setOperation(e.target.value)}><option value="set_attribute">Set an object attribute</option><option value="inspect_attribute">Inspect an existing attribute</option></select></label>
        <label>Attribute<input required pattern="[a-z][a-z0-9_]{1,63}" value={attribute} onChange={e=>setAttribute(e.target.value)} /></label>
        {operation==='set_attribute' && <label>Simulated value<input required maxLength={500} value={value} onChange={e=>setValue(e.target.value)} /></label>}
      </div>
    </>}
    {bounty.execution_mode==='testnet' && <p className="fine-print">Real deliveries are listed as unavailable until their adapter is integrated. The AUSD reward remains a pledge until funded and settled.</p>}
    <button className="primary" disabled={data.busy}><Send size={13} /> Submit solution</button>
  </form>;
}

function BountyCard({ bounty, data }: {bounty:Bounty;data:RoboMarket}) {
  const [submitting, setSubmitting] = useState(false);
  const open=['open','review'].includes(bounty.status);
  return <article className="bounty-card glass">
    <div className="bounty-card-top"><span className="tag">{humanize(bounty.status)}</span><strong>{money(bounty.reward_ausd)} <small>{bounty.execution_mode==='simulation'?'demo credits':'AUSD pledge'}</small></strong></div>
    <h2>{bounty.title}</h2><p>{bounty.description}</p>
    <div className="bounty-tags"><span>{bounty.object_name || 'Custom capability'}</span><span>{bounty.plan_ids.length ? `${bounty.plan_ids.length} linked mission${bounty.plan_ids.length===1?'':'s'}` : 'Consumer request'}</span><span>{bounty.submissions.length} submissions</span></div>
    {bounty.success_criteria && <p className="bounty-criteria"><strong>Acceptance criteria:</strong> {bounty.success_criteria}</p>}
    {bounty.award && <div className="bounty-award"><Check size={15} /><div><strong>{bounty.execution_mode==='simulation'?'Solution accepted · skill published':'Solution accepted · integration pending'}</strong><p>{money(bounty.award.amount)} {bounty.award.currency} · {humanize(bounty.award.status)} · {bounty.award.producer_id}</p></div></div>}
    {!!bounty.submissions.length && <div className="bounty-submissions">{bounty.submissions.map(solution=><section key={solution.id}>
      <div><strong>{solution.model_name}</strong><small>by {solution.producer_id} · {money(solution.price_ausd)} / call</small></div>
      <p>{solution.description}</p>
      {bounty.execution_mode==='simulation' && <p className="fine-print">Fixture delivery: {humanize(solution.operation)} · {solution.attribute}{solution.operation==='set_attribute'?` → ${solution.value}`:''}</p>}
      {solution.evidence_url && <a className="text-link" href={solution.evidence_url} target="_blank" rel="noreferrer">View producer evidence</a>}
      {open && <button className="secondary" disabled={data.busy} onClick={()=>void data.acceptBounty(bounty.id,solution.id)}><Check size={13} /> Accept & publish{bounty.execution_mode==='simulation'?' · record demo reward':''}</button>}
    </section>)}</div>}
    {open && <button className="secondary" disabled={data.busy} onClick={()=>setSubmitting(!submitting)}><Plus size={13} />{submitting?'Close submission':'Build for this bounty'}</button>}
    {submitting && open && <ProducerForm bounty={bounty} data={data} />}
  </article>;
}

export default function BountyBoard({ data }: {data:RoboMarket}) {
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState('all');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [object, setObject] = useState('');
  const [criteria, setCriteria] = useState('');
  const [reward, setReward] = useState('0.05');
  const [mode, setMode] = useState('simulation');
  const shown=data.bounties.filter(b=>filter==='all'||b.status===filter);
  return <div className="page bounty-page enter">
    <div className="page-heading"><div><h1>Bounties</h1></div><button className="secondary" onClick={()=>setCreating(!creating)}><Plus size={14} /> Post a bounty</button></div>
    <div className="bounty-overview glass-quiet"><span><strong>{data.bounties.filter(b=>b.status==='open'||b.status==='review').length}</strong> active requests</span><span><strong>{data.bounties.filter(b=>b.status==='fulfilled').length}</strong> fulfilled</span><p>Scout automatically posts missing-capability requests when enabled in the mission composer. Budget or latency failures do not create bounties.</p></div>
    {creating && <form className="bounty-form bounty-create glass" onSubmit={async e=>{
      e.preventDefault(); const task_type=title.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,60); 
      if(await data.postBounty({title,description,task_type:/^[a-z]/.test(task_type)?task_type:'custom_'+task_type,object_name:object.trim().toLowerCase()||null,success_criteria:criteria,reward_ausd:reward,execution_mode:mode})) {setCreating(false);setTitle('');setDescription('');}
    }}><h2>Request a specific capability</h2><label>Wanted skill<input required minLength={3} maxLength={100} placeholder="Peel an orange without crushing it" value={title} onChange={e=>setTitle(e.target.value)} /></label><label>Requested outcome<textarea required minLength={3} maxLength={3000} value={description} onChange={e=>setDescription(e.target.value)} /></label><div className="bounty-form-grid"><label>Object (optional)<input value={object} onChange={e=>setObject(e.target.value)} placeholder="orange" /></label><label>Reward per solution<input required min="0.000001" step="0.000001" type="number" value={reward} onChange={e=>setReward(e.target.value)} /></label><label>Delivery mode<select value={mode} onChange={e=>setMode(e.target.value)}><option value="simulation">Simulation · demo reward</option><option value="testnet">Real adapter · AUSD pledge</option></select></label></div><label>Acceptance criteria<textarea value={criteria} onChange={e=>setCriteria(e.target.value)} placeholder="What would count as a successful solution?" /></label><p className="fine-print">Posting records the reward commitment. Demo rewards are recorded on acceptance. Real AUSD rewards require funding and verified settlement.</p><button className="primary" disabled={data.busy}><Flag size={13} /> Publish bounty</button></form>}
    <div className="filter-list bounty-filters">{['all','open','review','fulfilled','awaiting_integration'].map(value=><button key={value} className={filter===value?'active':''} onClick={()=>setFilter(value)}>{humanize(value)}</button>)}</div>
    <div className="bounty-list">{shown.map(bounty=><BountyCard key={bounty.id} bounty={bounty} data={data} />)}</div>
    {!shown.length && <div className="empty-state"><Flag size={26} /><h3>No bounties here yet.</h3><p>Post a capability request, or build a mission with automatic bounties enabled. Missing expertise will appear here.</p></div>}
  </div>;
}
