import React from 'react';
import {
  ArrowRight, Binary, CalendarClock, FlaskConical, Gauge, LineChart, ListChecks,
  Radar, ScrollText, ShieldAlert,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DemoBadge, Disclaimer, SectionHeading } from '@/components/common/Primitives';
import { FACTOR_DEFINITIONS, NO_TRADE_RULES, PROVIDER_CONTRACTS, WEIGHTING_RULES } from '@/lib/providers';
import { CompactMark, FullLockup } from '@/brand';

const HERO_IMG = '/assets/hero-chart.svg';
const EVIDENCE_IMG = '/assets/evidence-network.svg';
const DAWN_IMG = '/assets/dawn-grid.svg';


const MODULES = [
  { Icon: ListChecks, title: "Today's Opportunities", body: 'A ranked, filterable board of the day’s setups with direction, strategy, confidence, opportunity score, risk level, the full contract line and a link straight to the evidence.' },
  { Icon: ScrollText, title: 'Trade Thesis pages', body: 'Market context, price action with levels drawn on the chart, options-market interpretation, dated news, keynote intelligence, both sentiment cohorts, risk and contract candidates.' },
  { Icon: Gauge, title: 'Explainable score breakdown', body: 'Nine factors, each with its raw score, the effective weight this regime assigned it, the direction it pushed the score, and a plain-English reason for every weighting decision.' },
  { Icon: Binary, title: 'Contract selection engine', body: 'Aggressive, Balanced and Conservative candidates ranked on liquidity, spread, Greeks, expiry and reach to structure — with the tradeoff between them written out and risk flags attached.' },
  { Icon: Radar, title: 'Live command center', body: 'Regime, index trends, VIX, breadth, movers, relative-volume leaders, unusual options activity and a timestamped signal feed that polls continuously.' },
  { Icon: CalendarClock, title: 'Catalyst calendar', body: 'Month, week and list views of earnings, CPI, PPI, jobs, FOMC, Fed speeches, product launches, court and regulatory decisions — each tagged with the watchlist names exposed.' },
  { Icon: ShieldAlert, title: 'Risk engine', body: 'Bull, standard and bear cases, premium at risk, theta per day, IV and liquidity risk, the invalidation level, and a prominent section on why this trade could fail.' },
  { Icon: LineChart, title: 'Paper-trading ledger', body: 'Append-only records with the price and contract at generation, excursions, result and return, rolled up into win rate, expectancy, profit factor and drawdown.' },
  { Icon: FlaskConical, title: 'Backtesting with a look-ahead guard', body: 'Only rows whose publication timestamp precedes the simulated bar are eligible, sample size is shown before results, and backtested, paper and live performance never share a panel.' },
];

export const Landing: React.FC<{ onStart: () => void; onSignIn: () => void }> = ({ onStart, onSignIn }) => (
  <div className="min-h-screen bg-[#0b0d10]">
    {/* HERO */}
    <header className="relative overflow-hidden border-b border-zinc-800">
      <img
        src={HERO_IMG}
        alt="Dark candlestick price chart with volume histogram, rendered in thin green and red strokes"
        className="absolute inset-0 h-full w-full object-cover opacity-30"
        loading="eager"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-[#0b0d10]/70 via-[#0b0d10]/85 to-[#0b0d10]" />
      <div className="relative mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-2 font-mono text-sm font-semibold tracking-[0.3em] text-zinc-100">
            <CompactMark className="h-7 w-7" title="URSORA" />
            URSORA
          </span>
          <DemoBadge />
        </div>
        <div className="mt-5">
          <FullLockup className="h-20" />
        </div>
        <h1 className="mt-6 max-w-4xl text-3xl font-semibold leading-[1.1] tracking-tight text-zinc-50 sm:text-5xl lg:text-6xl">
          Market analysis, trade analysis, and trading-process insight
        </h1>
        <p className="mt-5 max-w-2xl text-standard leading-relaxed text-zinc-400 sm:text-lg">
          URSORA identifies options-trading opportunities, explains the evidence behind them, evaluates available contracts and risk, and tracks how the analysis changes over time. It also reviews your recorded trading process to identify patterns in how you plan and execute trades.
        </p>


        <blockquote
          className="mt-8 max-w-3xl border-l-2 border-sky-500/70 pl-4 text-[15px] italic leading-relaxed text-zinc-300 sm:text-lg"
          style={{ textWrap: 'balance' }}
        >
          “Do not present an opportunity without showing the supporting evidence, the relevant contract information, the associated risk, and the conditions that would make the analysis no longer valid.”
          <footer className="mt-2 font-mono text-[10px] not-italic uppercase tracking-[0.18em] text-zinc-500">
            TradeCycle principle

          </footer>
        </blockquote>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button size="lg" onClick={onStart} className="gap-2">
            Open URSORA
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button size="lg" variant="outline" onClick={onSignIn} className="gap-2 border-zinc-700 bg-transparent hover:bg-zinc-900">
            Sign in
          </Button>
        </div>

        <dl className="mt-12 grid max-w-4xl grid-cols-2 gap-px overflow-hidden rounded-md border border-zinc-800 bg-zinc-800 sm:grid-cols-4">
          {[
            { k: '14', v: 'Symbols included in the default watchlist' },
            { k: '9', v: 'Factors used to explain each score' },
            { k: '3', v: 'Option contracts compared for each qualifying opportunity' },
            { k: '0', v: 'Values estimated solely to fill missing data' },
          ].map((s) => (
            <div key={s.v} className="bg-[#14171c] px-4 py-3">
              <dt className="font-mono text-2xl font-semibold tabular-nums text-zinc-100">{s.k}</dt>
              <dd className="mt-1 text-[11px] leading-snug text-zinc-500">{s.v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </header>

    <main>
      {/* PHILOSOPHY */}
      <section className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="What makes it different"
          title="Four principles URSORA follows"
          description="URSORA is designed to show how a conclusion was reached rather than presenting a score without supporting context."

        />
        <div className="grid gap-4 lg:grid-cols-4">
          {[
            { t: 'Show the evidence', b: 'Each score shows the underlying inputs, the importance assigned to them, and the reason they affected the result. Source information is retained where available.' },
            { t: 'Show the contract', b: 'A directional view does not by itself identify a usable option contract. URSORA compares available contracts using price, liquidity, spread, expiration, and risk characteristics, then explains the differences.' },
            { t: 'Show the risk', b: 'Risk is presented in practical terms, including potential loss, time decay, liquidity, expected price movement, and the conditions that could undermine the trade.' },
            { t: 'Show what breaks it', b: 'Each trade analysis identifies the conditions that would make it no longer valid. Meaningful changes are recorded rather than silently replacing the earlier conclusion.' },
          ].map((c) => (
            <article
              key={c.t}
              className="rounded-md border border-zinc-800 bg-[#14171c] p-4 transition-colors duration-200 hover:border-sky-500/40"
            >
              <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-300">{c.t}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-zinc-400">{c.b}</p>
            </article>
          ))}
        </div>
      </section>

      {/* NO TRADE */}
      <section className="border-y border-zinc-800 bg-[#0e1116]">
        <div className="mx-auto grid w-full max-w-7xl items-center gap-8 px-4 py-14 sm:px-6 lg:grid-cols-2 lg:px-8">
          <div>
            <SectionHeading
              eyebrow="The engine does not force trades"
              title="Not every analysis should result in a trade"
              description="When the available evidence is insufficient, conflicting, or unsuitable for execution, URSORA identifies the opportunity as not meeting trading criteria and explains why."
            />
            <ul className="space-y-2">
              {NO_TRADE_RULES.map((r) => (
                <li key={r} className="flex gap-2 text-[13px] leading-relaxed text-zinc-400">
                  <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-amber-400" aria-hidden="true" />
                  {r}
                </li>
              ))}
            </ul>
          </div>
          <img
            src={EVIDENCE_IMG}
            alt="Abstract network of thin glowing lines linking documents and price data on a dark background"
            className="w-full rounded-md border border-zinc-800 object-cover"
            loading="lazy"
          />
        </div>
      </section>

      {/* FACTORS */}
      <section className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Opportunity scoring"
          title="Scores reflect the information available at the time"
          description="URSORA combines multiple categories of evidence and adjusts their importance when market conditions change. The underlying inputs and weights are retained so prior scores can be reviewed later."
        />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {FACTOR_DEFINITIONS.map((f) => (
            <article key={f.key} className="rounded-md border border-zinc-800 bg-[#14171c] p-3">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-[13px] font-semibold text-zinc-200">{f.label}</h3>
                <span className="font-mono text-[10px] tabular-nums text-zinc-500">
                  standard {Math.round(f.base_weight * 100)}%
                </span>
              </div>
              <p className="mt-1.5 text-[12px] leading-relaxed text-zinc-500">{f.measures}</p>
            </article>
          ))}
        </div>
        <div className="mt-4 overflow-hidden rounded-md border border-zinc-800">
          <table className="w-full text-left text-[12px]">
            <thead className="bg-black/40 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
              <tr>
                <th scope="col" className="px-3 py-2">Market condition</th>
                <th scope="col" className="px-3 py-2">Weighting response</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800 bg-[#14171c]">
              {WEIGHTING_RULES.map((r) => (
                <tr key={r.trigger} className="transition-colors hover:bg-black/30">
                  <td className="px-3 py-2 align-top text-zinc-300">{r.trigger}</td>
                  <td className="px-3 py-2 align-top text-zinc-500">{r.effect}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* MODULES */}
      <section className="border-y border-zinc-800 bg-[#0e1116]">
        <div className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <SectionHeading eyebrow="Core features" title="A connected trading research workflow" />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {MODULES.map(({ Icon, title, body }) => (
              <article
                key={title}
                className="group rounded-md border border-zinc-800 bg-[#14171c] p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-sky-500/40"
              >
                <Icon className="h-4 w-4 text-sky-400 transition-transform duration-200 group-hover:scale-110" aria-hidden="true" />
                <h3 className="mt-2.5 text-sm font-semibold text-zinc-200">{title}</h3>
                <p className="mt-1.5 text-[12px] leading-relaxed text-zinc-500">{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* DATA ARCHITECTURE */}
      <section className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid items-start gap-8 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <SectionHeading
              eyebrow="Data connections"
              title="External data sources can be added or replaced independently"
              description="URSORA separates external data connections from its analysis logic so market, options, news, and other data sources can be changed without redesigning the user experience."
            />
            <div className="overflow-hidden rounded-md border border-zinc-800">
              <table className="w-full text-left text-[12px]">
                <thead className="bg-black/40 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                  <tr>
                    <th scope="col" className="px-3 py-2">Interface</th>
                    <th scope="col" className="px-3 py-2">Information supplied</th>
                    <th scope="col" className="hidden px-3 py-2 md:table-cell">Stored information</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800 bg-[#14171c]">
                  {PROVIDER_CONTRACTS.map((p) => (
                    <tr key={p.interface_name} className="transition-colors hover:bg-black/30">
                      <td className="px-3 py-2 align-top font-mono text-[11px] text-sky-300">{p.interface_name}</td>
                      <td className="px-3 py-2 align-top font-mono text-[10px] leading-relaxed text-zinc-400">
                        {p.methods.join('  ·  ')}
                      </td>
                      <td className="hidden px-3 py-2 align-top font-mono text-[10px] text-zinc-500 md:table-cell">
                        {p.writes.join(', ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[12px] leading-relaxed text-zinc-500">
              URSORA keeps source and timing information with incoming data where available. Simulated information is clearly identified so it is not mistaken for verified live market data.
            </p>
          </div>
          <div className="space-y-4">
            <img
              src={DAWN_IMG}
              alt="Dark glass office window at dawn overlooking a financial district skyline"
              className="w-full rounded-md border border-zinc-800 object-cover"
              loading="lazy"
            />
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-4">
              <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-300">
                Current data status
              </h3>
              <p className="mt-2 text-[12px] leading-relaxed text-zinc-400">
                Live market and options data are not yet connected. Simulated values are clearly identified with the
                <span className="font-mono text-amber-300"> SIMULATED DATA</span> wherever it appears. When information is not available, URSORA displays <span className="font-mono text-zinc-300">DATA UNAVAILABLE</span> rather than inventing a value.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-zinc-800 bg-[#0e1116]">
        <div className="mx-auto w-full max-w-4xl px-4 py-16 text-center sm:px-6 lg:px-8">
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-100 sm:text-3xl">
            Open URSORA and follow the evidence
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-zinc-400">
            Create an account to save your watchlist, alert preferences, paper-trading history, and analyst conversations. The current demonstration environment includes sample market data for evaluation.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button size="lg" onClick={onStart} className="gap-2">
              Create account
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button size="lg" variant="outline" onClick={onSignIn} className="border-zinc-700 bg-transparent hover:bg-zinc-900">
              Sign in
            </Button>
          </div>
          <Disclaimer className="mx-auto mt-8 max-w-2xl" />
        </div>
      </section>
    </main>
  </div>
);

export default Landing;
