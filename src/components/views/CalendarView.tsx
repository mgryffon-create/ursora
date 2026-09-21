import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, List, Rows3 } from 'lucide-react';
import { fetchEarnings, fetchEconomicEvents } from '@/lib/api';
import type { EarningsEvent, EconomicEvent } from '@/lib/types';
import { dayET, pct, stampET } from '@/lib/format';
import { useAuth } from '@/contexts/AuthContext';
import {
  DemoBadge, Disclaimer, EmptyState, Panel, SectionHeading, SourceBadge, Spinner, Unavailable,
} from '@/components/common/Primitives';
import { cn } from '@/lib/utils';

interface CalItem {
  id: string;
  title: string;
  category: string;
  time: string;
  impact: 'low' | 'medium' | 'high' | 'critical';
  symbols: string[];
  detail: string | null;
  source_name: string;
  source_type: string;
  source_url: string | null;
  retrieved_at: string;
  kind: 'macro' | 'earnings';
}

const IMPACT_STYLE: Record<string, string> = {
  critical: 'border-red-500/50 bg-red-500/10 text-red-300',
  high: 'border-amber-500/50 bg-amber-500/10 text-amber-300',
  medium: 'border-sky-500/40 bg-sky-500/10 text-sky-300',
  low: 'border-zinc-600 bg-zinc-500/10 text-zinc-400',
};

const dayKey = (iso: string) => new Date(iso).toISOString().slice(0, 10);

export const CalendarView: React.FC = () => {
  const { watchlist } = useAuth();
  const [items, setItems] = useState<CalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'month' | 'week' | 'list'>('month');
  const [monthOffset, setMonthOffset] = useState(0);
  const [watchlistOnly, setWatchlistOnly] = useState(false);

  const load = useCallback(async () => {
    const [econ, earn] = await Promise.all([fetchEconomicEvents(), fetchEarnings()]);
    const mapped: CalItem[] = [
      ...econ.map<CalItem>((e: EconomicEvent) => ({
        id: `m-${e.id}`, title: e.title, category: e.category, time: e.event_time, impact: e.impact,
        symbols: e.affected_symbols, detail: e.detail, source_name: e.source_name, source_type: e.source_type,
        source_url: e.source_url, retrieved_at: e.retrieved_at, kind: 'macro',
      })),
      ...earn.map<CalItem>((e: EarningsEvent) => ({
        id: `e-${e.id}`, title: `${e.symbol} earnings report`, category: 'Earnings', time: e.report_time,
        impact: 'high', symbols: [e.symbol],
        detail: `${e.session ?? 'unspecified'} session · EPS estimate ${e.eps_estimate ?? 'DATA UNAVAILABLE'} · revenue estimate ${e.revenue_estimate ?? 'DATA UNAVAILABLE'} · expected move ${pct(e.expected_move_pct) ?? 'DATA UNAVAILABLE'} · ${e.confirmed ? 'date confirmed' : 'date unconfirmed'}`,
        source_name: e.source_name, source_type: 'Company Source', source_url: e.source_url,
        retrieved_at: new Date().toISOString(), kind: 'earnings',
      })),
    ].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
    setItems(mapped);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(
    () => (watchlistOnly ? items.filter((i) => i.symbols.some((s) => watchlist.includes(s))) : items),
    [items, watchlistOnly, watchlist],
  );

  const grouped = useMemo(() => {
    const g: Record<string, CalItem[]> = {};
    for (const i of filtered) g[dayKey(i.time)] = [...(g[dayKey(i.time)] ?? []), i];
    return g;
  }, [filtered]);

  const monthGrid = useMemo(() => {
    const base = new Date();
    base.setDate(1);
    base.setMonth(base.getMonth() + monthOffset);
    const year = base.getFullYear();
    const month = base.getMonth();
    const first = new Date(year, month, 1);
    const start = new Date(first);
    start.setDate(first.getDate() - first.getDay());
    const cells: { date: Date; inMonth: boolean }[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      cells.push({ date: d, inMonth: d.getMonth() === month });
    }
    return { label: base.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }), cells };
  }, [monthOffset]);

  const weekDays = useMemo(() => {
    const out: Date[] = [];
    const d = new Date();
    d.setDate(d.getDate() - d.getDay() + monthOffset * 7);
    for (let i = 0; i < 7; i++) {
      const x = new Date(d);
      x.setDate(d.getDate() + i);
      out.push(x);
    }
    return out;
  }, [monthOffset]);

  if (loading) return <Spinner label="Loading market events" />;

  const todayKey = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <SectionHeading
        eyebrow="Market events"
        title="Upcoming events that may affect the market"
        description="Review earnings, economic reports, central-bank events, company presentations, product announcements, regulatory decisions, and other scheduled events that may affect tracked symbols."
        right={
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex cursor-pointer items-center gap-2 text-[11px] text-zinc-400">
              <input type="checkbox" checked={watchlistOnly} onChange={(e) => setWatchlistOnly(e.target.checked)} className="h-3.5 w-3.5 accent-sky-500" />
              Watchlist symbols only
            </label>
            <div className="flex overflow-hidden rounded-sm border border-zinc-800">
              {([
                { v: 'month', Icon: CalendarDays },
                { v: 'week', Icon: Rows3 },
                { v: 'list', Icon: List },
              ] as const).map(({ v, Icon }) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => {
                    setView(v);
                    setMonthOffset(0);
                  }}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider transition-colors',
                    view === v ? 'bg-sky-500/15 text-sky-300' : 'bg-black/30 text-zinc-400 hover:text-zinc-200',
                  )}
                >
                  <Icon className="h-3 w-3" aria-hidden="true" />
                  {v}
                </button>
              ))}
            </div>
          </div>
        }
      />

      {view !== 'list' && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMonthOffset((m) => m - 1)}
            aria-label="Previous period"
            className="rounded-sm border border-zinc-800 bg-black/30 p-1.5 text-zinc-400 transition-colors hover:text-sky-300"
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <span className="font-mono text-[11px] uppercase tracking-wider text-zinc-300">
            {view === 'month' ? monthGrid.label : `Week of ${weekDays[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
          </span>
          <button
            type="button"
            onClick={() => setMonthOffset((m) => m + 1)}
            aria-label="Next period"
            className="rounded-sm border border-zinc-800 bg-black/30 p-1.5 text-zinc-400 transition-colors hover:text-sky-300"
          >
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setMonthOffset(0)}
            className="ml-2 font-mono text-[10px] uppercase tracking-wider text-zinc-500 transition-colors hover:text-sky-300"
          >
            today
          </button>
          <DemoBadge className="ml-auto" />
        </div>
      )}

      {view === 'month' && (
        <div className="overflow-hidden rounded-md border border-zinc-800">
          <div className="grid grid-cols-7 bg-black/50 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="border-b border-zinc-800 px-2 py-1.5">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {monthGrid.cells.map(({ date, inMonth }) => {
              const key = date.toISOString().slice(0, 10);
              const dayItems = grouped[key] ?? [];
              return (
                <div
                  key={key}
                  className={cn(
                    'min-h-[96px] border-b border-r border-zinc-800 p-1.5 transition-colors last:border-r-0',
                    inMonth ? 'bg-[#14171c]' : 'bg-black/30',
                    key === todayKey && 'ring-1 ring-inset ring-sky-500/50',
                  )}
                >
                  <div className={cn('font-mono text-[10px]', inMonth ? 'text-zinc-400' : 'text-zinc-600')}>
                    {date.getDate()}
                  </div>
                  <div className="mt-1 space-y-1">
                    {dayItems.slice(0, 3).map((it) => (
                      <div
                        key={it.id}
                        className={cn('truncate rounded-sm border px-1 py-[1px] text-[9px] leading-tight', IMPACT_STYLE[it.impact])}
                        title={`${it.title} — ${stampET(it.time)}`}
                      >
                        {it.kind === 'earnings' ? `${it.symbols[0]} ER` : it.title}
                      </div>
                    ))}
                    {dayItems.length > 3 && (
                      <div className="font-mono text-[9px] text-zinc-500">+{dayItems.length - 3} more</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {view === 'week' && (
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {weekDays.map((d) => {
            const key = d.toISOString().slice(0, 10);
            const dayItems = grouped[key] ?? [];
            return (
              <Panel key={key} title={dayET(d.toISOString()) ?? key} className={key === todayKey ? 'border-sky-500/50' : undefined}>
                {dayItems.length === 0 ? (
                  <p className="text-[11px] text-zinc-600">No dated event stored.</p>
                ) : (
                  <ul className="space-y-2">
                    {dayItems.map((it) => (
                      <li key={it.id} className="rounded-sm border border-zinc-800 bg-black/20 p-2">
                        <div className={cn('inline-flex rounded-sm border px-1.5 py-[1px] font-mono text-[9px] uppercase', IMPACT_STYLE[it.impact])}>
                          {it.impact}
                        </div>
                        <div className="mt-1 text-[12px] font-semibold leading-snug text-zinc-200">{it.title}</div>
                        <div className="mt-0.5 font-mono text-[10px] text-zinc-500">{stampET(it.time)}</div>
                        {it.symbols.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {it.symbols.map((s) => (
                              <span key={s} className={cn(
                                'rounded-sm px-1 py-[1px] font-mono text-[9px]',
                                watchlist.includes(s) ? 'bg-sky-500/15 text-sky-300' : 'bg-zinc-800 text-zinc-400',
                              )}>
                                {s}
                              </span>
                            ))}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            );
          })}
        </div>
      )}

      {view === 'list' && (
        <Panel title="All stored catalysts" right={<DemoBadge />} bodyClassName="p-0">
          {filtered.length === 0 ? (
            <div className="p-4">
              <EmptyState title="No events match" body="Turn off the watchlist filter to see macro events that affect no single name directly." />
            </div>
          ) : (
            <ul className="divide-y divide-zinc-800">
              {filtered.map((it) => (
                <li key={it.id} className="p-3 transition-colors hover:bg-black/30">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn('rounded-sm border px-1.5 py-[1px] font-mono text-[9px] uppercase', IMPACT_STYLE[it.impact])}>
                      {it.impact} impact
                    </span>
                    <span className="rounded-sm border border-zinc-700 px-1.5 py-[1px] font-mono text-[9px] uppercase text-zinc-400">
                      {it.category}
                    </span>
                    <span className="text-[13px] font-semibold text-zinc-100">{it.title}</span>
                    <span className="ml-auto font-mono text-[10px] text-zinc-400">{stampET(it.time)}</span>
                  </div>
                  <p className="mt-1.5 text-[12px] leading-relaxed text-zinc-400">{it.detail ?? <Unavailable />}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">affected watchlist tickers</span>
                    {it.symbols.length ? (
                      it.symbols.map((s) => (
                        <span key={s} className={cn(
                          'rounded-sm px-1.5 py-[1px] font-mono text-[10px]',
                          watchlist.includes(s) ? 'bg-sky-500/15 text-sky-300' : 'bg-zinc-800 text-zinc-400',
                        )}>
                          {s}
                        </span>
                      ))
                    ) : (
                      <span className="font-mono text-[10px] text-zinc-600">none directly exposed</span>
                    )}
                    <span className="ml-auto flex items-center gap-2">
                      <SourceBadge type={it.source_type} />
                      <span className="font-mono text-[10px] text-zinc-500">{it.source_name}</span>
                      {it.source_url && (
                        <a
                          href={it.source_url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="font-mono text-[10px] text-sky-400 underline-offset-2 transition-colors hover:underline"
                        >
                          source
                        </a>
                      )}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}

      <Disclaimer />
    </div>
  );
};

export default CalendarView;
