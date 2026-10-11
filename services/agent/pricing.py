"""Token-based planning estimates. Marketplace limits remain a separate ledger."""
from decimal import Decimal

SOURCE='https://platform.claude.com/docs/en/about-claude/pricing'
# Standard first-party API USD/MTok, checked 2026-10-11. No fast mode or regional premium.
RATES={'claude-opus-5-5':('4','20','0.20'), 'claude-sonnet-4-5':('3','15','0.30')}

def planning_usage(model, usage):
    counts={key:max(0,int(usage.get(key) or 0)) for key in
        ('input_tokens','output_tokens','cache_creation_input_tokens','cache_read_input_tokens')}
    result={**counts,'estimated_cost_usd':None,'pricing_source':SOURCE,'rates_checked_at':'2026-10-11'}
    rates=next((rates for name,rates in RATES.items() if model==name or model.startswith(name+'-')),None)
    if rates:
        input_rate,output_rate,read_rate=map(Decimal,rates)
        cache=usage.get('cache_creation') or {}
        hour=max(0,int(cache.get('ephemeral_1h_input_tokens',0)))
        short=max(0,counts['cache_creation_input_tokens']-hour)
        cost=(counts['input_tokens']*input_rate+counts['output_tokens']*output_rate+
            counts['cache_read_input_tokens']*read_rate+short*input_rate*Decimal('1.25')+hour*input_rate*2)/1000000
        result.update(estimated_cost_usd=format(cost.quantize(Decimal('.000001')),'f'),
            input_usd_per_million=str(input_rate),output_usd_per_million=str(output_rate))
    return result
