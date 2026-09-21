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
  { Icon: ShieldAlert, title: 'Risk engine', body: 'Bull, base and bear cases, premium at risk, theta per day, IV and liquidity risk, the invalidation level, and a prominent section on why this trade could fail.' },
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
          Market intelligence, trade intelligence, trader intelligence
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-zinc-400 sm:text-lg">
          URSORA ranks evidence-backed options setups and follows the TradeCycle from thesis through outcome: the data behind it, the contract
          that fits it, the risk it carries, and the level that would prove it wrong. Then it stays with the trade — and
          measures how you observably decide.
        </p>


        <blockquote
          className="mt-8 max-w-3xl border-l-2 border-sky-500/70 pl-4 text-[15px] italic leading-relaxed text-zinc-300 sm:text-lg"
          style={{ textWrap: 'balance' }}
        >
          “Don’t just tell the trader what looks interesting. Show them the evidence, show them the contract, show them
          the risk, and show them what would prove the thesis wrong.”
          <footer className="mt-2 font-mono text-[10px] not-italic uppercase tracking-[0.18em] text-zinc-500">
            The TradeCycle operating principle

          </footer>
        </blockquote>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button size="lg" onClick={onStart} className="gap-2">
            Open the workstation
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button size="lg" variant="outline" onClick={onSignIn} className="gap-2 border-zinc-700 bg-transparent hover:bg-zinc-900">
            Sign in
          </Button>
        </div>

        <dl className="mt-12 grid max-w-4xl grid-cols-2 gap-px overflow-hidden rounded-md border border-zinc-800 bg-zinc-800 sm:grid-cols-4">
          {[
            { k: '14', v: 'Prioritised tickers in the default universe' },
            { k: '9', v: 'Explainable factors behind every score' },
            { k: '3', v: 'Contract candidates per directional signal' },
            { k: '0', v: 'Numbers invented when data is missing' },
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
          title="Four obligations the engine will not skip"
          description="Most screeners hand over a number. URSORA is built around the belief that a number without evidence is worse than nothing, because it looks like research."

        />
        <div className="grid gap-4 lg:grid-cols-4">
          {[
            { t: 'Show the evidence', b: 'Every factor score carries its raw inputs, the weight the current regime gave it, and the reason it was weighted that way. Sources carry publication and retrieval timestamps and a click-through link.' },
            { t: 'Show the contract', b: 'A direction is not a trade. The contract engine ranks the actual chain on liquidity, spread, Greeks and reach to structure, then names three candidates and explains the tradeoff.' },
            { t: 'Show the risk', b: 'Bull, base and bear cases; premium at risk; theta per day; IV and liquidity risk; the expected move; and a prominent section on how this specific trade fails.' },
            { t: 'Show what breaks it', b: 'Every thesis stores an invalidation level and a list of disconfirming conditions. When the evidence changes, a SIGNAL UPDATE record is written — recommendations never change silently.' },
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
              title="“NO TRADE / WAIT” is a first-class answer"
              description="When the evidence is weak, contradictory or untradeable, the board returns a NO TRADE card with the specific rule that fired — not a low-conviction setup dressed up as an opportunity."
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
          eyebrow="Multi-factor signal engine"
          title="Dynamic weights, never a flat average"
          description="Nine factors are scored 0–100 and combined with weights the current market regime decides. Both the raw scores and the effective weights are stored on every signal, so any historical score can be re-derived exactly."
        />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {FACTOR_DEFINITIONS.map((f) => (
            <article key={f.key} className="rounded-md border border-zinc-800 bg-[#14171c] p-3">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-[13px] font-semibold text-zinc-200">{f.label}</h3>
                <span className="font-mono text-[10px] tabular-nums text-zinc-500">
                  base {Math.round(f.base_weight * 100)}%
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
          <SectionHeading eyebrow="Inside the workstation" title="Ten connected research surfaces" />
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
              eyebrow="Data architecture"
              title="Seven provider interfaces, swappable one at a time"
              description="Ingestion is strictly separate from signal generation. Each interface is isolated behind a provider contract, so a live vendor can be connected or replaced without changing the signal engine."
            />
            <div className="overflow-hidden rounded-md border border-zinc-800">
              <table className="w-full text-left text-[12px]">
                <thead className="bg-black/40 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                  <tr>
                    <th scope="col" className="px-3 py-2">Interface</th>
                    <th scope="col" className="px-3 py-2">Methods the ingestion layer calls</th>
                    <th scope="col" className="hidden px-3 py-2 md:table-cell">Tables written</th>
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
              Every ingested row stores its source name, source type, publication timestamp, retrieval timestamp and a
              confidence score. Demo rows are capped at low confidence on purpose, so nothing modelled can ever
              masquerade as a verified fact.
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
                Data provenance, stated plainly
              </h3>
              <p className="mt-2 text-[12px] leading-relaxed text-zinc-400">
                No live market feed is connected yet. Every quote, chain, headline, transcript line and sentiment
                modelled value is clearly identified and badged
                <span className="font-mono text-amber-300"> SIMULATED DATA</span> wherever it appears. Missing fields render
                as <span className="font-mono text-zinc-300">DATA UNAVAILABLE</span> — the platform never estimates a
                figure to fill a gap.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-zinc-800 bg-[#0e1116]">
        <div className="mx-auto w-full max-w-4xl px-4 py-16 text-center sm:px-6 lg:px-8">
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-100 sm:text-3xl">
            Open the workstation and follow the evidence
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-zinc-400">
            Create an account to get your own watchlist, alert thresholds, paper-trading ledger and analyst history. The
            ranked board, thesis pages, calendar and command center are populated from the seeded demo universe on first
            load.
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
