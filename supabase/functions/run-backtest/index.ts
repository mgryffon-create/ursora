import { AuthError, requireUser } from '../_shared/auth.ts';
import { handleOptions, json } from '../_shared/http.ts';

type Trade = { symbol:string; entry_date:string; direction:string; score:number; entry_price:number; exit_price:number; underlying_return_pct:number; option_return_pct:number; mfe_pct:number; mae_pct:number; result:string; news_visible:number };
const round = (x:number) => Math.round(x * 100) / 100;

Deno.serve(async (req) => {
  const preflight = handleOptions(req); if (preflight) return preflight;
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405);
  try {
    const { user, db } = await requireUser(req);
    const b = await req.json().catch(() => ({}));
    const symbols:string[] = Array.isArray(b.symbols) ? b.symbols.map((x:any)=>String(x).toUpperCase()) : [];
    const minScore = Number(b.min_opportunity_score ?? 60);
    const directionFilter = String(b.direction_filter ?? 'any');
    const hold = Math.max(1, Math.min(20, Number(b.holding_period_days ?? 3)));
    const start = String(b.start_date ?? '1900-01-01'); const end = String(b.end_date ?? '2999-12-31');
    let sq:any = db.from('signals').select('id,symbol,direction,opportunity_score,generated_at').gte('generated_at', `${start}T00:00:00Z`).lte('generated_at', `${end}T23:59:59Z`).gte('opportunity_score', minScore).order('generated_at');
    if (symbols.length) sq = sq.in('symbol', symbols); if (directionFilter !== 'any') sq = sq.eq('direction', directionFilter);
    const { data: signals, error } = await sq; if (error) throw error;
    const trades:Trade[] = [];
    for (const s of signals ?? []) {
      const entryDay = String(s.generated_at).slice(0,10);
      const { data: bars } = await db.from('ohlcv_bars').select('bar_time,open,high,low,close').eq('symbol', s.symbol).eq('timeframe','1d').gte('bar_time', `${entryDay}T00:00:00Z`).order('bar_time').limit(hold + 1);
      if (!bars || bars.length < 2) continue;
      const entry = Number(bars[0].close); const exit = Number(bars[Math.min(hold, bars.length - 1)].close); if (!entry || !exit) continue;
      const raw = ((exit-entry)/entry)*100; const signed = s.direction === 'bearish' ? -raw : raw;
      const highs = bars.slice(1).map((x:any)=>Number(x.high)); const lows = bars.slice(1).map((x:any)=>Number(x.low));
      const mfeUnderlying = s.direction === 'bearish' ? ((entry-Math.min(...lows))/entry)*100 : ((Math.max(...highs)-entry)/entry)*100;
      const maeUnderlying = s.direction === 'bearish' ? ((entry-Math.max(...highs))/entry)*100 : ((Math.min(...lows)-entry)/entry)*100;
      const optionRet = signed * 2; // Explicit baseline proxy; not an options-pricing simulation.
      const { count } = await db.from('news_items').select('*', { count:'exact', head:true }).eq('symbol', s.symbol).lte('published_at', s.generated_at);
      trades.push({ symbol:s.symbol, entry_date:entryDay, direction:s.direction, score:Number(s.opportunity_score), entry_price:round(entry), exit_price:round(exit), underlying_return_pct:round(signed), option_return_pct:round(optionRet), mfe_pct:round(mfeUnderlying*2), mae_pct:round(maeUnderlying*2), result: optionRet > 3 ? 'win' : optionRet < -3 ? 'loss' : 'scratch', news_visible:count ?? 0 });
    }
    let equity=100, peak=100; const curve:any[]=[]; let maxDD=0;
    for (const t of trades) { equity *= 1 + t.option_return_pct/100; peak=Math.max(peak,equity); const dd=((equity-peak)/peak)*100; maxDD=Math.min(maxDD,dd); curve.push({t:t.entry_date,equity:round(equity),drawdown:round(dd)}); }
    const wins=trades.filter(t=>t.result==='win'), losses=trades.filter(t=>t.result==='loss'), scratches=trades.filter(t=>t.result==='scratch').length;
    const avg=(a:number[])=>a.length?a.reduce((x,y)=>x+y,0)/a.length:null;
    const aw=avg(wins.map(t=>t.option_return_pct)), al=avg(losses.map(t=>t.option_return_pct));
    const grossWin=wins.reduce((x,t)=>x+t.option_return_pct,0), grossLoss=Math.abs(losses.reduce((x,t)=>x+t.option_return_pct,0));
    const expectancy=avg(trades.map(t=>t.option_return_pct));
    const bucket=(key:(t:Trade)=>string)=>{ const groups=new Map<string,Trade[]>(); for (const t of trades){ const k=key(t); groups.set(k,[...(groups.get(k)??[]),t]); } return [...groups.entries()].map(([k,v])=>{ const ex=avg(v.map(t=>t.option_return_pct)); return { bucket:k, n:v.length, win_rate:v.length?round(v.filter(t=>t.result==='win').length/v.length*100):null, expectancy:ex===null?null:round(ex) }; }); };
    return json({
      success: true, user_id: user.id,
      metrics:{ sample_size:trades.length, win_rate_pct:trades.length?round(wins.length/trades.length*100):null, avg_winner_pct:aw===null?null:round(aw), avg_loser_pct:al===null?null:round(al), expectancy_pct:expectancy===null?null:round(expectancy), profit_factor:grossLoss?round(grossWin/grossLoss):null, max_drawdown_pct:round(maxDD), total_return_pct:round(equity-100), scratches, news_rows_excluded_by_guard:0 },
      equity_curve:curve, trades,
      by_score_bucket:bucket(t=>t.score>=80?'80–100':t.score>=70?'70–79':t.score>=60?'60–69':'<60'),
      by_symbol:bucket(t=>t.symbol),
      warnings:['Independent baseline uses a transparent 2× underlying-return proxy for option returns. Replace this with historical option-chain data before treating options backtest results as realistic.'],
      look_ahead_guard:'Entry signals and visible-news counts are restricted to timestamps at or before the simulated decision. Forward bars are used only for outcome measurement.', run_id:null,
    });
  } catch (e) { if (e instanceof AuthError) return json({ error: e.message }, e.status); return json({ error: e instanceof Error ? e.message : String(e) }, 500); }
});
