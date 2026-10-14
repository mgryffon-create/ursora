
insert into public.lit_constructs
  (construct_key,name,plain_definition,matador_operationalization,variables_required,min_sample,confidence_requirement,evidence_grade,known_limitations,layer)
values
  (
    'late_confirmed_move_entry',
    'Late entry into a confirmed move',
    'Entering in the same direction as a substantiated move after a large share of the validated move has already occurred.',
    'URSORA measures time from confirmation to entry, share of confirmation-to-target distance already consumed, retest status, remaining room to target, pre-entry giveback, and repeated occurrence across comparable trades.',
    'historical confirmation timestamp and price; entry timestamp and underlying price; target; retest evidence; local move unit; repeated comparable trades',
    8,
    'At least 8 comparable confirmed-direction trades; stronger language at 15+ with a majority showing the same timing signature.',
    'OBSERVED PERSONAL PATTERN + RESEARCH CONTEXT',
    'Brokerage records can establish timing and price location but cannot establish motive. Research on attention, prior returns, and reinforcement is contextual rather than proof that a specific late entry was psychologically caused by chasing.',
    'execution'
  ),
  (
    'post_gain_risk_taking',
    'Post-gain risk taking',
    'Taking larger or more aggressive subsequent positions after prior gains.',
    'URSORA compares subsequent position size, speed of re-entry, and entry-quality metrics after realized winning trades against the user baseline.',
    'sequential closed trades; realized prior outcome; subsequent position size; time to next entry; entry-quality metrics',
    10,
    'At least 10 post-win sequences and a stable deviation from the all-trade baseline.',
    'MODERATE RESEARCH CONTEXT',
    'Experimental house-money findings and reinforcement studies are population-level evidence. Brokerage records alone cannot establish the user’s internal framing or motivation.',
    'sequence'
  ),
  (
    'loss_exit_asymmetry',
    'Loss / winner exit asymmetry',
    'A repeated tendency for losing positions to be held differently from winning positions, including holding through invalidation or exiting winners while the thesis remains intact.',
    'URSORA compares winner and loser holding behavior, thesis state at exit, target/invalidation timing, and MFE/MAE without using profit or loss to grade process quality.',
    'closed trades; realized outcome; thesis state at exit; target/invalidation timestamps; holding time; MFE/MAE',
    12,
    'At least 12 comparable closed trades with both winning and losing observations.',
    'STRONG RESEARCH CONTEXT',
    'The classic disposition effect is an aggregate selling asymmetry. A user-specific pattern may have different causes, and later research shows selling responses to gains/losses can be more complex than a single realization preference.',
    'exit'
  )
on conflict (construct_key) do update set
  name=excluded.name,
  plain_definition=excluded.plain_definition,
  matador_operationalization=excluded.matador_operationalization,
  variables_required=excluded.variables_required,
  min_sample=excluded.min_sample,
  confidence_requirement=excluded.confidence_requirement,
  evidence_grade=excluded.evidence_grade,
  known_limitations=excluded.known_limitations,
  layer=excluded.layer;

insert into public.lit_studies
  (study_key,title,authors,year,source,doi,doi_status,evidence_type,population_studied,known_limitations,finding_summary)
values
  (
    'thaler_johnson_1990_house_money',
    'Gambling with the House Money and Trying to Break Even: The Effects of Prior Outcomes on Risky Choice',
    'Richard H. Thaler; Eric J. Johnson',
    1990,
    'Management Science 36(6):643-660',
    '10.1287/mnsc.36.6.643',
    'verified',
    'real-money experiments',
    'experimental decision makers',
    'Experimental risky-choice setting rather than brokerage execution timing; does not establish that a specific investor is motivated by prior gains.',
    'Prior gains increased risk seeking in the reported experiments, while prior losses could make break-even opportunities especially attractive.'
  ),
  (
    'barber_odean_2008_attention',
    'All That Glitters: The Effect of Attention and News on the Buying Behavior of Individual and Institutional Investors',
    'Brad M. Barber; Terrance Odean',
    2008,
    'The Review of Financial Studies 21(2):785-818',
    '10.1093/rfs/hhm079',
    'verified',
    'brokerage-record empirical study',
    'individual and institutional investors',
    'Attention-grabbing securities are not identical to late entry after technical confirmation; use as context for attention/return-chasing hypotheses, not causal attribution.',
    'Individual investors were net buyers of attention-grabbing stocks, including stocks with extreme recent returns and abnormal volume.'
  ),
  (
    'chiang_hirshleifer_qian_sherman_2011_reinforcement',
    'Do Investors Learn from Experience? Evidence from Frequent IPO Investors',
    'Yao-Min Chiang; David Hirshleifer; Yiming Qian; Ann E. Sherman',
    2011,
    'The Review of Financial Studies 24(5):1560-1589',
    '10.1093/rfs/hhq151',
    'verified',
    'investor-history empirical study',
    '31,476 individual and 1,232 institutional IPO-auction investors in Taiwan',
    'IPO-auction participation differs from secondary-market options trading; findings should be treated as reinforcement-learning context.',
    'Higher prior returns increased future participation for individuals, and more experienced individual bidders bid more aggressively, consistent with naïve reinforcement learning.'
  ),
  (
    'odean_1998_disposition',
    'Are Investors Reluctant to Realize Their Losses?',
    'Terrance Odean',
    1998,
    'The Journal of Finance 53(5):1775-1798',
    '10.1111/0022-1082.00072',
    'verified',
    'brokerage-record empirical study',
    '10,000 discount-brokerage accounts',
    'Documents aggregate realization behavior; does not identify the cause of a specific user’s exit and predates modern zero-commission/options-heavy trading environments.',
    'Investors showed a strong preference for realizing winners rather than losers, consistent with the disposition effect.'
  ),
  (
    'ben_david_hirshleifer_2012_disposition',
    'Are Investors Really Reluctant to Realize Their Losses? Trading Responses to Past Returns and the Disposition Effect',
    'Itzhak Ben-David; David Hirshleifer',
    2012,
    'The Review of Financial Studies 25(8):2485-2532',
    '10.1093/rfs/hhs077',
    'verified',
    'brokerage-record empirical study',
    'individual investor trading records',
    'Addresses selling responses to past returns and cautions against a single simple realization-preference explanation.',
    'Selling probability was V-shaped in profit and the evidence did not support a simple direct preference for realizing gains over losses as the sole explanation.'
  )
on conflict (study_key) do update set
  title=excluded.title,
  authors=excluded.authors,
  year=excluded.year,
  source=excluded.source,
  doi=excluded.doi,
  doi_status=excluded.doi_status,
  evidence_type=excluded.evidence_type,
  population_studied=excluded.population_studied,
  known_limitations=excluded.known_limitations,
  finding_summary=excluded.finding_summary;

insert into public.lit_construct_studies (construct_key,study_key,relation,note)
values
  ('late_confirmed_move_entry','barber_odean_2008_attention','CONTEXT','Extreme recent returns and abnormal volume can attract individual-investor buying; this is relevant context when repeated late entries occur after a move is already salient.'),
  ('late_confirmed_move_entry','chiang_hirshleifer_qian_sherman_2011_reinforcement','CONTEXT','Prior successful experiences can increase later participation/aggressiveness; this supports testing whether late entries cluster after recent gains, not assuming that motive.'),
  ('post_gain_risk_taking','thaler_johnson_1990_house_money','SUPPORTS','Experimental evidence that prior gains can increase risk seeking.'),
  ('post_gain_risk_taking','chiang_hirshleifer_qian_sherman_2011_reinforcement','SUPPORTS','Investor-history evidence consistent with reinforcement from prior returns affecting later participation/aggressiveness.'),
  ('loss_exit_asymmetry','odean_1998_disposition','SUPPORTS','Classic brokerage-record evidence of greater propensity to realize winners than losers.'),
  ('loss_exit_asymmetry','ben_david_hirshleifer_2012_disposition','CHALLENGES','Later evidence shows a more complex V-shaped selling response and cautions against a single simple realization-preference explanation.')
on conflict (construct_key,study_key) do update set
  relation=excluded.relation,
  note=excluded.note;
