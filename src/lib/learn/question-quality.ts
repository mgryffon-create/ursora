// Alternatives represent nearby concepts or common calculation/process errors.
// Canonical answer slots stay fixed so existing account progress remains valid.
type Question = { prompt: string; options: string[]; correct: number };
type Revision = { prompt?: string; answer?: string; wrong: [string,string] };
const r = (a:string,b:string,prompt?:string,answer?:string):Revision => ({wrong:[a,b],prompt,answer});
const assessment = [
 r('The complete session, including candles after the entry','The final profit relative to the largest available move'),
 r('Enter a smaller position before the condition appears','Substitute a different trigger after inspecting the next candle'),
 r('Estimates of the probability that the next trade will profit','Personalized live position limits inferred from this practice'),
];
const bank:Record<string,Revision[]> = {
 'account-mechanics':[
 r('The total cash display regardless of settlement','The planned stop distance rather than the purchase amount'),
 r('The initial order’s cash debit and commissions alone','The order’s time-in-force without the financing conditions'),
 r('A snapshot of market value and buying power at one moment','Advertised commission and the sample’s gross results','Which record best supports a defensible account-permission check?','Instrument, dated official terms and unresolved constraints'),
 ],
 'event-risk':[
 r('Change the chart interval while retaining the earlier execution assumptions','Keep quantity fixed and move invalidation closer to offset the spread'),
 r('The timestamp of the newest repost','The time price first crossed the planned entry condition'),
 r('Acceptance above the ceiling confirmed by the intrabar high','A completed larger reversal because the upper test failed'),
 ],
 'portfolio-risk':[
 r('$110','$130'),
 r('Offsetting because the companies have separate issuer-specific risks','Independent budgets because each position has a separate stop'),
 r('The expected return calculated from earlier completed fills','The original share purchase cost before commissions'),
 ],
 'execution-friction':[
 r('100 because the order is still working','Zero because the cancellation request was submitted'),
 r('Execution at the next bid because a stop-market order activated','Execution at the trigger because the limit fixes the stop price'),
 r('Original desired quantity and the newest ask','Unfilled quantity measured before the cancellation request'),
 ],
 'option-contracts':[
 r('A strike above the stock changes the call’s moneyness','Open interest measures outstanding contracts','Which issue most directly conflicts with a three-session thesis using a same-day option?'),
 r('5%','100%'),
 r('The quantity traded during the current session','The quantity currently resting at the best bid'),
 ],
 'option-payoffs':[
 r('$500','$300'),
 r('$2','$5'),
 r('The fixed multiplier used in the calculation','The strike prices used to define the spread width','Which issue can make actual account exposure differ from a modeled expiration payoff?','Assignment, funding and leg execution can change the account state'),
 ],
 'option-lifecycle':[
 r('Possible only after all extrinsic value disappears','Possible only after the stock crosses the writer’s breakeven'),
 r('Quoted premium and current delta','Recent volume and open interest'),
 r('Use the expiration net payoff as the current account exposure','Treat the long and short as an automatically exercised pair'),
 ],
 'validation-lab':[
 r('$3','−$1'),
 r('A validation period confirming a frozen threshold','Forward evaluation because each revision was logged'),
 r('Final net profit and average without the trade sequence','Entry-rule frequency without the sequence of losses'),
 ],

 'summary-candles':[r('Its final high and low are already fixed','Only the body color can change after this point')],
 'summary-candle-patterns':[r('A completed reversal through the earlier swing low','Continuation acceptance above the resistance area','A shooting-star shape appears after a rise near resistance. What is established?','A possible rejection that still needs confirmation and risk context')],
 'summary-chart-patterns':[r('Confirmed acceptance outside the range','A completed reversal of the larger trend','A breakout wick closes back inside its range. What is supported?','An excursion that failed to hold on that close; further evidence remains relevant')],
 'summary-structure':[r('A completed reversal because the latest interval fell','An unchanged trend regardless of later structural breaks')],
 'summary-movement':[r('Recent volume from the width of the candle bodies','The latest tick from a completed-candle structural break')],
 'summary-indicators':[r('Price is above its unweighted mean closing price','Price has exceeded one average true range')],
 'summary-plan':[r('Update every earlier snapshot to match the revised target','Remove earlier snapshots so only the latest target remains')],
 'summary-management':[r('Treat the profitable result as validation of the violated rule','Discard the financial result because it conflicts with the process score')],

 'market-participants':[r('The last trade fixes the fill despite changing quotes','The candle close sets all fills in its interval'),r('The trigger creates a minimum acceptable sale price of 49','The opening print guarantees every stop fills at 46'),r('Use equity as the sole permission check','Use permissions from another account at the same broker')],
 'trading-costs':[r('$6 before fees','$120 before fees'),r('A net gain of $3','A net loss of $11'),r('An immediate midpoint fill','A fill whenever the last print touches the limit, regardless of available offers')],
 'market-macro':[r('Keep ordinary execution assumptions once the trigger occurs','Tighten the stop with unchanged size to compensate for the event'),r('It outperformed both reference groups','It underperformed both reference groups'),r('The local bounce establishes the larger reversal','The index direction rules out any stock-specific recovery')],
 'thesis-conflicts':[r('The oscillator recovery confirms the lower-high sequence ended','The price sequence rules out any local momentum improvement'),r('Treat the intrabar touch as the completed-close condition','Lower the threshold because the same setup remains visible'),r('Hold until another indicator agrees independently','Redraw the boundary lower and treat it as the original plan')],
 'drawdown-exposure':[r('20%','22.5%'),r('Separate stops prevent simultaneous losses','Different issuers mean those risks offset'),r('Continue beyond the stop at reduced size','Apply the daily limit only after the next trade closes')],
 'options-foundations':[r('$2.10','$2,100'),r('Delta alone determines the entire premium change','Intrinsic value necessarily rises by the full stock move'),r('Both acquire a right without an exercise obligation','The writer’s exposure is capped at premium received')],
 'behavioral-discipline':[r('Keep the original ratio because the formation remains','Increase size to compensate for reduced room'),r('Treat profit as validation of the violated rule','Exclude the trade because process and outcome disagree'),r('Continue beyond the stopping rule at smaller size','Change the limit after losses to preserve another opportunity')],
 'strategy-validation':[r('+$2','−$10'),r('More independent evidence because more thresholds were compared','Untouched evaluation because historical prices did not change'),r('The execution model is validated by a positive synthetic result','The score estimates performance in every regime')],

 'market-basics':[
 r('Price activity since the regular-session open','The last sixty completed one-minute candles'),
 r('Use a small initial order to discover the entry condition','Enter at the prior high and define invalidation after the fill',undefined,'Wait or pass until a defined entry condition is observed'),
 r('It buys a put contract that gains when the underlying falls','It sells shares already owned and can repurchase them later'),
 ],
 'quotes-liquidity':[
 r('$0.05','$0.20'),
 r('Use the last print as the current executable offer','Use the midpoint as the available market-buy price','The last print is $100. How should a trader treat a new market-buy fill?','Quotes and liquidity can change before the order fills'),
 r('Only at the best ask visible when the order was submitted','At the midpoint whenever both sides display a quote'),
 ],
 'volume-pressure':[
 r('Observed buying absorption; lower closes show the sellers are exhausted','A widening quoted spread; volume measures quote disagreement'),
 r('Treat the flat base as confirmation of accumulation','Infer distribution because upward progress has paused','A flat base forms after selling. How should accumulation be classified?'),
 r('Treat the volume burst as acceptance above the ceiling','Use the size of the spike as the new support condition'),
 ],
 'drawing-lines':[
 r('Separated swing highs','The two most recent candle closes'),
 r('A confirmed support retest above the old ceiling','A continuation pause that has held above resistance'),
 r('Updates the original entry evidence to reflect the latest structure','Preserves the original thesis because the new line fits more points','An entry’s support breaks. The trader redraws the line through lower lows. What does that change about the original decision?'),
 ],
 wedges:[
 r('Directional continuation because both boundaries slope','A parallel channel with approximately constant width'),
 r('A rising wedge','An ascending triangle'),
 r('Label the breakout direction from the boundary slope','Move the decision boundary to the latest candle wick'),
 ],
 'cup-steps':[
 r('104, using the rim alone','106, using half the cup depth'),
 r('Transfer the larger-timeframe projection without changing the evidence standard','Treat the rounded shape as confirmed once its center is visible','An intraday rounded shape resembles a longer cup. How should the comparison be treated?'),
 r('Keep the continuation label because the earlier steps rose','Replace the broken resting floor with the next lower price'),
 ],
 timeframes:[
 r('20 minutes','25 minutes'),
 r('A confirmed reversal of the larger decline','A continuation observation on both intervals'),
 r('Independent confirmation from another data source','A neutral change that leaves the evidence comparison unchanged'),
 ],
 'sma-ema':[
 r('Volume-weighted typical prices','The average of recent true ranges'),
 r('Equal weight to each close in the chosen window','More weight to observations with higher trading volume'),
 r('The green candle confirms recovery above the larger downtrend','The color change outweighs the still-falling average','A green candle closes below a falling average. What does that observation support?'),
 ],
 vwap:[
 r('Less weight because high activity is smoothed out','Equal weight regardless of traded volume',undefined,'A greater contribution to the cumulative weighted average'),
 r('Whether the crossing candle is green, regardless of later response','Whether the cross also changes the historical VWAP values'),
 r('Different moving-average periods selected for the same VWAP','Different option multipliers applied to the underlying stock'),
 ],
 rsi:[
 r('A measured 75% chance that the next candle will close higher','A fixed reversal threshold that overrides the rising structure'),
 r('Treat the threshold crossing as the entry trigger','Use the RSI low as proof that the price floor has held','RSI falls below 30 while price keeps making lower lows. Is a long entry established by that threshold alone?','No; check price structure and the planned confirmation'),
 r('An immediate countertrend entry at the latest price','Replacing the price invalidation with the indicator value'),
 ],
 macd:[
 r('Confirmed positive long-term momentum because a crossover occurred','Further momentum deterioration because MACD remains below zero'),
 r('The fast EMA minus the slow EMA','The signal line minus the latest closing price'),
 r('Independent observations of price, volume and volatility','Equivalent to a separately verified market-news catalyst'),
 ],
 bollinger:[
 r('A confirmed upward break because the bands compressed','Lower trading volume because the bands moved closer'),
 r('The trend has reversed because the upper boundary was touched','Price must return to the middle band before the next candle','During a persistent trend, what does an upper-band touch establish?'),
 r('Evidence that the selloff has ended at a support floor','A long trigger with invalidation at the middle band'),
 ],
 atr:[
 r('Stronger downside momentum measured from closing-price changes','More shares traded relative to the recent volume average'),
 r('Remains unchanged because the share quantity is unchanged','Decreases because the position has more room to recover',undefined,'Increases because each share has a larger planned loss distance'),
 r('Yes, because ATR includes opening gaps in its calculation','Yes, when the stop distance uses the latest complete ATR','Does using ATR to select a stop distance fix the eventual execution loss?','No; stop selection and execution price remain different issues'),
 ],
 confluence:[
 r('Several independent sources confirming the same forecast','A direct measure of the probability of continuation'),
 r('The candle color confirms the larger structure has reversed','The average must turn upward on the next completed interval','A green candle forms below a falling average. What follows?','A rebound remains possible; inspect structure and follow-through'),
 r('Which indicator produced the most recent entry signal','Which setting would best explain the subsequent price outcome'),
 ],
 'risk-sizing':[
 r('25 shares before costs','50 shares before costs'),
 r('−0.67R','+1.5R'),
 r('Yes, by multiplying the stock-price distance by 100','Yes, because one stock-price point equals one premium point','Can a stock-price invalidation alone determine the option-premium loss?','No; premium sensitivity and execution also matter'),
 ],
 execution:[
 r('Pay the quoted ask once the stock reaches the limit','Activate a market order when the limit is touched'),
 r('The stop price is the fill price after the trigger','The fill is capped at the stop price even through a gap','What does a stop-market trigger determine?','It activates a market order; the eventual fill can differ from the stop'),
 r('30 shares, matching the amount already filled','100 shares, because the original quantity is unchanged'),
 ],
 'scan-news':[
 r('Rank the percentage move above spread and available liquidity','Use the percentage gain as confirmation that a pullback will hold','A stock leads the percentage-gainers list. What should happen next?','Assess liquidity, spread and the setup before treating it as a candidate'),
 r('Treat the newest repost timestamp as the event time','Compare only the headline sentiment with the chart direction'),
 r('The signal provides an executable price during the halt','A market order submitted now will fill at the last print','How should a bullish indicator on a halted stock be interpreted?'),
 ],
 'option-greeks':[
 r('Its delta must be negative because the option is a call','Its quoted premium follows the stock point for point'),
 r('How the option price changes as one day passes','How the option price changes with implied volatility'),
 r('Fixed contract characteristics that remain unchanged after entry','Exact fill-price predictions for large stock moves'),
 ],
 'journal-testing':[
 r('+$0.20 before additional costs','+$0.60 before additional costs'),
 r('An out-of-sample rule selected before the replay','A spread adjustment applied to both entry and exit'),
 r('The gain as evidence that the risk rule should be removed','Only the rule violation, omitting the financial result'),
 ],
 capstone:[
 r('Treat the green candle as confirmation that MACD has reversed','Treat negative MACD as evidence that local price cannot improve'),
 r('A reversal trigger because RSI has remained elevated','A completed pullback because strong momentum must reset'),
 r('Trade each average crossing as a new trend confirmation','Increase the quantity to compensate for the short price swings'),
 ],
 'price-assessment':assessment,'indicator-assessment':assessment,'execution-assessment':assessment,
 'brokerage-choice':[
 r('The platform with the most indicators, before verifying account rules','The lowest advertised commission, before comparing the full fee schedule'),
 r('Zero until a charge appears on the statement','The rate advertised by a different broker for a similar account'),
 r('Yes, once a brokerage comparison is marked complete','Yes, after the practice order ticket passes its checks','Which order capability is available inside this lesson?','Simulated lesson orders; live execution is not available here'),
 ],
 'ursora-workflow':[
 r('Use the Opportunity score as the entry trigger and size the trade afterward','Select the highest score, then use the eventual outcome to validate the entry','How should an Opportunity score fit into a trade decision?','Inspect its evidence and form a conditional entry and risk plan'),
 r('The same analysis presented as separate navigation pages','Separate tools for bullish and bearish chart formations'),
 r('The final outcome from a reconstruction using later candles','The best later exit from the original entry-time assessment'),
 ],
};

Object.assign(bank, {
 'summary-candles':[r('The full candle range is now above the opening price','Its eventual close has been set by crossing the open')],
 'summary-structure':[r('The last rising swing low has been broken','The latest swing high has become confirmed resistance')],
 'summary-movement':[r('Trading volume from the bid-ask spread','The selected chart interval from the order quantity')],
 'summary-indicators':[r('Price has completed a reclaim of the previous swing high','The next pullback has a confirmed floor at VWAP')],
 'summary-plan':[r('Apply the corrected target to earlier fills and later decisions','Keep only the latest target and reconstruct earlier snapshots from it')],
 'summary-options':[r('$60','$1.20')],
 'summary-management':[r('The recorded profit validates the original risk decision','The later recovery shows the original invalidation was misplaced')],
 placement:[
  r('Its current price becomes the close used for completed-candle indicators','Its high and low are fixed once it first moves above the open'),
  r('The preceding swing low has been broken','The earlier upward trend has resumed at the retreat low'),
  r('A preferred direction, an exit target and a past winning example','An indicator setting, a preferred symbol and a profit objective'),
  r('Reject the plan because a losing outcome disproves its entry evidence','Keep the same entry but increase the next size to restore expected return'),
 ],
 'candle-wicks':[r('It measures the distance between open and close','It marks the price range before this candle opened')],
 candles:[
  r('98 to 103','100 to 103'),
  r('It must finish with the same color once a body is visible','Only its trading volume changes after the open'),
  r('The higher-volume candle had a larger price gain','The higher-volume candle had a wider quoted spread'),
 ],
 structure:[r('Rising peaks but falling dips','Falling peaks but rising dips'),r('Higher rebound peaks and lower swing lows','A sideways sequence with equal rebound peaks'),r('An upward trend defined by the latest rebound','A completed reversal through the upper boundary')],
 movement:[r('A break beneath the prior swing low','A recovery that has already exceeded the prior peak'),r('A smooth trend with progressively higher resting areas','A narrow range with little movement in either direction'),r('Treat the break as a normal pullback above the old floor','Keep the same thesis by moving its floor to the latest low')],
 indicators:[r('Price is above its simple average closing price','Price has risen by one average true range'),r('Independent confirmation of a new rising price sequence','A confirmed recovery above the previous swing peak'),r('100.40','102.00')],
 plan:[r('The latest price rebounds from any point inside the range','The last candle closes green while remaining below the ceiling'),r('A small red candle that still holds above 99','A later close above the previous swing high'),r('4.5 to the exit versus 0.5 to invalidation','0.5 to the exit versus 0.5 to invalidation')],
 management:[r('Closing the entire position','Adding two contracts to the existing four'),r('Replacing the original four with two contracts','Selling two of the original four contracts'),r('The profit as evidence the original risk rule was too strict','The broken rule as proof the trade could not finish profitably')],
 options:[r('$60','$1.20'),r('$0.06','$0.60'),r('A buy stop that activates when price reaches $0.55','A market order expected to execute at the last trade price')],
});

export function improveQuestion<T extends Question>(id:string,index:number,question:T):T {
 const revision=bank[id]?.[index];if(!revision)return question;
 let wrongIndex=0;
 return {...question,prompt:revision.prompt??question.prompt,options:question.options.map((_,i)=>i===question.correct?revision.answer??question.options[i]:revision.wrong[wrongIndex++])};
}
export const revisedQuestionGroups=Object.keys(bank);
