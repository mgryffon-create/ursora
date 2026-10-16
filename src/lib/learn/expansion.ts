import type { Unit } from './university';

// Curriculum expansion: each lesson uses the existing guided cards and one-screen ExerciseStage.
const unit = (id: string, title: string, stage: number, scenario: Unit['scenario'], cards: Unit['cards'], cases: Unit['cases'], source: Unit['source']): Unit =>
  ({ id, title, stage, scenario, studies: [], cards, cases, source });
const c=(title:string,text:string)=>({title,text});
const q=(prompt:string,options:string[],correct:number,why:string,scenario:Unit['scenario']):Unit['cases'][number]=>({prompt,options,correct,why,scenario});
const investor={title:'SEC Investor.gov · Investing basics',url:'https://www.investor.gov/introduction-investing/investing-basics'};
const finra={title:'FINRA · Investors',url:'https://www.finra.org/investors'};
const occ={title:'OIC · Options education',url:'https://www.optionseducation.org/'};
export const expansionUnits: Unit[] = [
unit('market-participants','Who trades, where trades happen, and when markets open',1,'chop',[
 c('An exchange is not your brokerage','A broker routes orders to venues, including exchanges and other execution venues. The order ticket is your instruction to a broker; it does not promise a fill.'),
 c('Know the trading session','Regular and extended-hours stock trading have different liquidity and execution risks. An overnight gap can move past a planned stop before an ordinary session resumes.'),
 c('Stocks, funds and derivatives differ','A company share represents equity; an ETF holds a portfolio. An option is a contract with an expiration and different risks. Do not treat their quotes, ownership or leverage as interchangeable.'),
 c('Rules depend on the account','Cash versus margin accounts, short selling, settlement, and day-trading requirements affect what orders may be permitted. Verify current rules with your broker and regulators before trading.')
],[
 q('A broker displays a last price of 42, but your market order fills at 42.08. What explains the difference?',['The broker must honor the last trade','The last price was a past transaction; available quotes changed','All market orders fill at the candle close'],1,'The last reported trade is not a guaranteed executable quote.','chop'),
 q('A stock closes at 50 and opens the next morning at 46. A stop trigger at 49 guarantees what fill?',['Exactly 49','No fixed fill price; gaps and liquidity affect execution','Exactly 46'],1,'A stop-market instruction does not guarantee the stop price.','selloff'),
 q('Two accounts have different day-trading permissions. Best next step?',['Assume every broker follows identical account rules','Ignore account type because only charts matter','Check current broker rules and regulatory requirements'],2,'Account permissions vary by product, jurisdiction and account type.','trend')
],[investor,finra]),
unit('trading-costs','The real cost of a trade',1,'chop',[
 c('Price movement is not net profit','A round trip can incur spread, commissions, regulatory fees and slippage. Calculate the breakeven result after costs, not from candles alone.'),
 c('The spread is paid in execution','An immediately executable buy often meets the ask; a sale often meets the bid. A wide spread makes an apparently attractive setup harder to trade.'),
 c('Market impact matters','A large quantity can exhaust the available quote and fill at multiple prices. Volume in a candle does not establish available depth at your chosen price.'),
 c('The smallest edge is easiest to erase','If expected reward is comparable to the spread and fees, a strategy may be unviable even when many entry signals look right.')
],[
 q('Bid 25.00, ask 25.12. Buying and immediately selling 100 shares at those quotes, unchanged, costs approximately',['$12 before additional fees','$0 because last price is unchanged','$1.20 before fees'],0,'Spread 0.12 multiplied by 100 shares is 12 dollars.','chop'),
 q('Your planned gross gain is $8, but estimated round-trip costs are $11. Your plan has',['A net gain of $19','An estimated net loss of $3','A guaranteed $8 gain'],1,'Subtract expected transaction costs when evaluating whether the trade is worthwhile.','steps'),
 q('A limit buy below the ask provides what certainty?',['A fill at the requested time','A favorable fill if it executes, but it may not execute','An immediate fill at the last candle close'],1,'A limit controls worst acceptable price but does not guarantee execution.','rebound')
],[investor,finra]),
unit('market-macro','Market regimes, sectors and economic catalysts',5,'rebound',[
 c('Read the environment before the ticker','A stock setup exists within broader market trends, sector movement, volatility and liquidity. One strong candle can be a rebound in a weak market.'),
 c('Economic releases can change conditions','Employment data, inflation releases, central-bank decisions and major earnings can alter volatility and spreads. Know when releases are scheduled; no headline guarantees direction.'),
 c('Relative strength needs comparison','Compare a candidate with its sector and a relevant broad-market benchmark over the same period. Outperformance is contextual evidence, not a command to buy.'),
 c('Distinguish facts from narratives','A company's reported results and published guidance are observable. Your explanation for the market response is a hypothesis to test against price, activity and competing events.')
],[
 q('A long setup looks strong on one-minute candles immediately ahead of a major scheduled release. Best assessment?',['The candles eliminate event risk','Check the event, liquidity and risk before deciding','Buy quickly before anyone else notices'],1,'Scheduled catalysts can invalidate a technical setup through volatility and execution risk.','rebound'),
 q('A stock rises 2%, its sector rises 5%, and the benchmark rises 1%. What can you say?',['It underperformed its sector but outperformed the benchmark','It led both groups','Relative strength guarantees a profitable trade'],0,'Comparisons require both a benchmark and the same measurement period.','steps'),
 q('The index is falling while a stock bounces toward resistance. What is most defensible?',['The bounce guarantees a trend reversal','The index determines every stock outcome','The long idea needs more evidence and attention to context'],2,'Market conditions are relevant but not determinative.','selloff')
],[investor,finra]),
unit('thesis-conflicts','Build and challenge a trade thesis',6,'rebound',[
 c('Define a testable claim','A useful thesis specifies the observed context, a conditional trigger, what would disprove the claim and where risk is contained. "It feels bullish" is not a condition.'),
 c('Seek contradictions','A rising oscillator can coexist with lower swing highs and weak volume. Ask which evidence is independent and whether the thesis survives its strongest contradiction.'),
 c('Distinguish setup, trigger and invalidation','A setup is an interesting condition; a trigger is a specific event that permits action; invalidation means the original reason no longer applies.'),
 c('Passing is active judgment','When confirmation is missing, reward is too small relative to risk or a catalyst is near, waiting can be the best documented plan.')
],[
 q('RSI rises but price remains below lower highs and falling resistance. The strongest conclusion is',['Momentum is improving but structure has not confirmed reversal','Every rising RSI guarantees a buy','Price structure has no relevance after RSI rises'],0,'Evidence can conflict; avoid promoting one indicator to certainty.','rebound'),
 q('A thesis states "Buy if price closes over resistance and holds on a retest." Before that occurs you should',['Enter because the thesis is written','Treat the trigger as unmet','Move resistance lower to force an entry'],1,'Conditional trade triggers must be observed, not imagined.','chop'),
 q('After entry, price breaks your documented invalidation. The appropriate review is',['Keep the original plan but ignore it','Rewrite the original thesis after seeing the outcome','Reassess or exit according to the recorded plan and document deviations'],2,'Preserve decision-time evidence and respond to meaningful invalidation.','selloff')
],[investor,finra]),
unit('drawdown-exposure','Drawdowns, correlated risk and stopping rules',7,'selloff',[
 c('Risk is cumulative','Multiple positions exposed to the same market movement can lose together. Separate per-trade risk from total account and correlated exposure.'),
 c('Drawdown changes the recovery problem','After a 20% account decline, a 25% gain is required to recover the starting value. Evaluate losing streaks before scaling a strategy.'),
 c('Plan a daily stop before trading','Set a reasonable precommitted loss limit and stop adding new risk when it is reached. Review whether the rule fits your capital and obligations.'),
 c('Stops can slip','Price gaps, thin markets and market-order execution can cause realized losses larger than the amount used for share sizing. Never assume a stop guarantees a maximum loss.')
],[
 q('An account falls from $10,000 to $8,000. What gain on $8,000 returns it to $10,000?',['20%','25%','10%'],1,'A 2000 increase on 8000 is 25 percent.','selloff'),
 q('Three highly correlated stocks each have $50 planned risk. What is the critical concern?',['Their risks are independent because they have different symbols','They guarantee diversification','A shared market shock can hurt all three simultaneously'],2,'Different tickers do not eliminate correlated exposure.','chop'),
 q('Your predefined daily loss limit has been reached. Your next action is',['Stop new trades and review the plan','Double the next size to recover','Lower the limit after every loss'],0,'A precommitted stopping rule is intended to prevent escalation under stress.','selloff')
],[finra,investor]),
unit('options-foundations','Calls, puts, expiration and option-specific risk',9,'rebound',[
 c('An option is a contract, not a share','A call gives its holder the right to buy; a put gives its holder the right to sell the underlying at a strike under the contract terms. Buying an option differs from writing one.'),
 c('Premium and multiplier matter','For a standard US equity option, a one-contract quote of $2.10 usually represents $210 premium before fees. Contract terms can differ: check the deliverable.'),
 c('Time and volatility influence premium','Intrinsic value is immediate exercise value; extrinsic value reflects additional market pricing including remaining time and volatility expectations. A correct directional forecast can still lose.'),
 c('Know the expiration and assignment risk','An option can expire worthless. Short options can create assignment obligations and certain positions may expose the trader to losses beyond premium collected.')
],[
 q('You buy one standard equity call quoted at $2.10. The usual premium before fees is',['$2.10','$210','$2,100'],1,'Standard contracts commonly represent 100 shares; check any adjusted contract deliverable.','rebound'),
 q('A stock rises slightly but a long call loses value near expiration. What could explain it?',['Time decay or declining implied volatility outweighed the stock move','Calls only track the stock direction','An up candle ensures option profit'],0,'Option value has multiple drivers beyond direction.','chop'),
 q('Which description correctly distinguishes buying and writing an option?',['They create identical rights and obligations','Writing eliminates assignment exposure','The holder purchases a right; the writer assumes contractual obligations'],2,'Risk and assignment requirements differ substantially.','selloff')
],[occ,finra]),
unit('behavioral-discipline','FOMO, loss aversion and process discipline',10,'trend',[
 c('Chasing is a process error','A setup that already completed its expected move may offer poor remaining reward relative to risk. Record the missed opportunity without automatically entering late.'),
 c('Losses change judgment','Revenge trading, averaging down without a plan and increasing size to recover can turn one loss into a sequence of uncontrolled decisions.'),
 c('Winning does not validate every action','A profitable rule violation is still a rule violation. Score the quality of the decision separately from realized profit.'),
 c('Plan a recovery protocol','Recognize stress, pause after a limit breach, use a checklist and return only when a reproducible setup and risk budget are present.')
],[
 q('You missed a breakout and price is far past your planned entry. What is a disciplined response?',['Raise size to make up for being late','Recalculate the setup and pass if reward-to-risk has deteriorated','Enter because the breakout already succeeded'],1,'Do not turn a missed opportunity into an unjustified late entry.','trend'),
 q('A poorly planned trade made money. The process score should',['Still identify the documented rule violations','Be perfect because profit proves quality','Delete the original plan and create a better one'],0,'Evaluate decision quality separately from the outcome.','steps'),
 q('After three losses you feel an urge to double size. What best protects the process?',['Trade rapidly before hesitation grows','Ignore cumulative exposure','Pause, check stopping rules and review the setup'],2,'Precommitted controls help when emotion distorts evaluation.','selloff')
],[finra,investor]),
unit('strategy-validation','Build, test and question a trading strategy',11,'chop',[
 c('Define a repeatable setup','State the instrument, market condition, entry trigger, invalidation, exit method and execution assumptions before testing. Unwritten discretion is hard to evaluate.'),
 c('Expectancy goes beyond win rate','Estimated average outcome equals win rate times average win minus loss rate times average loss, before costs. High win rates can still produce negative expectancy.'),
 c('Avoid data leakage','A historical test must use only information available at each decision time. Tuning rules on the same sample can make a random pattern look reliable.'),
 c('Use unseen data and realistic costs','Assess an out-of-sample period and multiple market regimes. Include spread, fees, slippage and losing streaks; simulated success does not prove live profitability.')
],[
 q('A setup wins 80% of the time, earns $10 when correct, and loses $50 when wrong. Gross expectancy per trade is',['+$8','-$2','+$30'],1,'0.8 × 10 minus 0.2 × 50 equals -2 dollars.','chop'),
 q('You pick indicator thresholds after observing the full test dataset. What risk increases?',['Overfitting and selection bias','Guaranteed future performance','Elimination of market uncertainty'],0,'Tuning against observed outcomes can mistake noise for a persistent edge.','trend'),
 q('A strategy succeeds on synthetic candles. What should you conclude?',['Live performance is established','Costs never matter in simulation','It merits independent testing on unseen conditions before stronger claims'],2,'Synthetic exercises assess process; they do not establish a live trading edge.','rebound')
],[investor,finra])
];
