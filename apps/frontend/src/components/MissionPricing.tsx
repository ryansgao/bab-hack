import { usd, cents, type Plan } from '../lib/types';
import type { RoboMarket } from '../lib/useRoboMarket';

export default function MissionPricing({plan,data}:{plan:Plan;data:RoboMarket}) {
  const demo=plan.request.execution_mode==='simulation';
  const skill=Number(plan.estimated_cost_ausd),limit=Number(plan.request.budget_ausd);
  const usage=plan.planning_usage,planning=plan.planner==='hackathon_demo'?'0':usage?.estimated_cost_usd;
  const inputTokens=(usage?.input_tokens||0)+(usage?.cache_creation_input_tokens||0)+(usage?.cache_read_input_tokens||0);
  const total=skill+Number(planning||0);
  const virtual=plan.subtasks.filter(step=>step.decision?.candidates.some(c=>c.model.id===step.decision?.selected_model_id && c.model.simulation_placeholder)).length;
  const spent=Number(demo?plan.simulation_cost_ausd:plan.spent_ausd);
  const pledges=data.bounties.filter(b=>plan.bounty_ids.includes(b.id) && ['open','review'].includes(b.status));
  return <section className="mission-pricing glass-quiet" aria-label="Mission cost breakdown">
    <div className="price-overview">
      <div><span>Estimated {planning!=null?'mission total':'skill cost'}</span><strong>{usd(total)}</strong><small>{planning!=null?'Planning + selected skills':'Planning usage unavailable for this saved plan'}</small></div>
      <div><span>Skill spending limit</span><strong>{usd(limit)}</strong><small>A maximum, not a charge</small></div>
      <div><span>{demo?'Simulated skills used':'Marketplace paid'}</span><strong>{usd(spent)}</strong><small>{usd(Math.max(0,limit-spent))} remains in the skill limit</small></div>
    </div>
    <details className="price-details"><summary>How this estimate is calculated</summary>
      <div className="price-line"><span>{plan.planner==='hackathon_demo'?'Fixed demo recipe · no planning API call':`Claude planning ${planning!=null?`· ${inputTokens.toLocaleString()} input / ${(usage?.output_tokens||0).toLocaleString()} output tokens`:''}`}</span><strong>{planning!=null?usd(planning):'Not recorded'}</strong></div>
      <div className="price-line"><span>{plan.subtasks.length-virtual} selected marketplace skills</span><strong>{usd(skill)} {skill>0 && skill<.01 && <small>({cents(skill)})</small>}</strong></div>
      {plan.subtasks.map(step=>{const offer=step.decision?.candidates.find(c=>c.model.id===step.decision?.selected_model_id)?.model;return <div className="price-line price-step" key={step.id}><span>{step.title}{offer?.simulation_placeholder?' · virtual effect':''}</span><span>{offer?usd(offer.price_ausd):'Unquoted'}</span></div>;})}
      {!!pledges.length && <div className="price-line"><span>{pledges.length} separate bounty pledge{pledges.length===1?'':'s'} · excluded from total</span><strong>{usd(pledges.reduce((sum,b)=>sum+Number(b.reward_ausd),0))}</strong></div>}
      <p>Claude planning is billed separately by Anthropic. The skill limit covers marketplace calls; bounty pledges and chain fees are separate. {demo?'Skill amounts here are dollar-denominated demo estimates. Running this simulation charges no money.':'Dollar amounts settle using AUSD on testnet.'}</p>
      {usage?.estimated_cost_usd!=null && <a href={usage?.pricing_source} target="_blank" rel="noreferrer">Planning estimate uses standard API rates checked {usage?.rates_checked_at}; your invoice may differ.</a>}
    </details>
  </section>;
}
