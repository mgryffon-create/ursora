import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, Bot, Brain, CalendarClock, ChevronDown, Database, FlaskConical, LineChart,
  ListChecks, LogOut, Menu, Radar, ScrollText, Settings2, Star, X,
} from 'lucide-react';
import { fetchFeed, fetchSnapshot } from '@/lib/api';
import type { FeedEvent, MarketSnapshot } from '@/lib/types';
import { changeColor, clockET, marketStatus, num, pct, stampET } from '@/lib/format';
import { useAuth } from '@/contexts/AuthContext';
import { CompactMark } from '@/brand';
import { cn } from '@/lib/utils';
import { DemoBadge, Spinner, Unavailable } from '@/components/common/Primitives';
import Landing from '@/components/Landing';
import AuthPanel from '@/components/AuthPanel';
import OpportunitiesView from '@/components/views/OpportunitiesView';
import CommandCenterView from '@/components/views/CommandCenterView';
import ThesisView from '@/components/views/ThesisView';
import CalendarView from '@/components/views/CalendarView';
import WatchlistView from '@/components/views/WatchlistView';
import SignalHistoryView from '@/components/views/SignalHistoryView';
import PaperTradingView from '@/components/views/PaperTradingView';
import BacktestView from '@/components/views/BacktestView';
import AnalystView from '@/components/views/AnalystView';
import DataSourcesView from '@/components/views/DataSourcesView';
import TraderIntelligenceView from '@/components/views/TraderIntelligenceView';

type ViewKey =
  | 'opportunities' | 'command' | 'calendar' | 'watchlist' | 'history'
  | 'paper' | 'backtest' | 'analyst' | 'sources' | 'thesis' | 'feed' | 'trader';

type NavGroupKey = 'today' | 'trades' | 'intelligence' | 'research' | 'system';

const NAV_GROUPS: {
  key: NavGroupKey;
  label: string;
  Icon: React.ElementType;
  defaultView: ViewKey;
  items: { key: ViewKey; label: string; hint: string; Icon: React.ElementType }[];
}[] = [
  {
    key: 'today',
    label: 'Today',
    Icon: ListChecks,
    defaultView: 'opportunities',
    items: [
      { key: 'opportunities', label: 'Opportunities', hint: 'Ranked setups', Icon: ListChecks },
      { key: 'command', label: 'Market Overview', hint: 'Current market conditions', Icon: Radar },
    ],
  },
  {
    key: 'trades',
    label: 'Trades',
    Icon: LineChart,
    defaultView: 'paper',
    items: [
      { key: 'paper', label: 'Paper Trading', hint: 'Account, positions, performance', Icon: LineChart },
      { key: 'history', label: 'Analysis History', hint: 'Past signals and changes', Icon: ScrollText },
      { key: 'backtest', label: 'Historical Testing', hint: 'Test rules on past data', Icon: FlaskConical },
    ],
  },
  {
    key: 'intelligence',
    label: 'Intelligence',
    Icon: Brain,
    defaultView: 'trader',
    items: [
      { key: 'trader', label: 'Trader Intelligence', hint: 'Patterns, process, behavior', Icon: Brain },
    ],
  },
  {
    key: 'research',
    label: 'Research',
    Icon: Star,
    defaultView: 'watchlist',
    items: [
      { key: 'watchlist', label: 'Watchlist', hint: 'Your universe', Icon: Star },
      { key: 'calendar', label: 'Market Events', hint: 'Upcoming market-moving events', Icon: CalendarClock },
      { key: 'analyst', label: 'AI Analyst', hint: 'Answers based on URSORA data', Icon: Bot },
      { key: 'feed', label: 'Signal Feed', hint: 'Timestamped events', Icon: Activity },
    ],
  },
  {
    key: 'system',
    label: 'System',
    Icon: Settings2,
    defaultView: 'sources',
    items: [
      { key: 'sources', label: 'Data Connections', hint: 'Connection status', Icon: Database },
    ],
  },
];

const groupForView = (view: ViewKey): NavGroupKey => {
  if (view === 'thesis' || view === 'opportunities' || view === 'command') return 'today';
  if (view === 'paper' || view === 'history' || view === 'backtest') return 'trades';
  if (view === 'trader') return 'intelligence';
  if (view === 'watchlist' || view === 'calendar' || view === 'analyst' || view === 'feed') return 'research';
  return 'system';
};

const labelForView = (view: ViewKey) => {
  for (const group of NAV_GROUPS) {
    const item = group.items.find((entry) => entry.key === view);
    if (item) return item.label;
  }
  return view === 'thesis' ? 'Trade Analysis' : 'URSORA';
};

const StatusBar: React.FC<{ snapshot: MarketSnapshot | null }> = ({ snapshot }) => {
  const [status, setStatus] = useState(marketStatus());
  useEffect(() => {
    const id = window.setInterval(() => setStatus(marketStatus()), 30000);
    return () => window.clearInterval(id);
  }, []);
  const tickers = [
    { label: 'SPY', price: snapshot?.spy_price, change: snapshot?.spy_change_pct },
    { label: 'QQQ', price: snapshot?.qqq_price, change: snapshot?.qqq_change_pct },
  ];
  return (
    <div className="flex items-center gap-4 border-b border-zinc-800 bg-[#0b0d10] px-3 py-1.5">
      <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider">
        <span className={cn('h-1.5 w-1.5 rounded-full', status.open ? 'animate-pulse bg-emerald-400' : 'bg-zinc-500')} />
        <span className={status.open ? 'text-emerald-400' : 'text-zinc-400'}>{status.label}</span>
      </span>
      <span className="hidden font-mono text-[10px] uppercase tracking-wider text-zinc-500 sm:inline">
        market environment <span className={cn(
          snapshot?.regime === 'Risk-On' ? 'text-emerald-300' : snapshot?.regime === 'Risk-Off' ? 'text-red-300' : 'text-sky-300',
        )}>{snapshot?.regime ?? 'DATA UNAVAILABLE'}</span>
      </span>
      <div className="hidden items-center gap-3 md:flex">
        {tickers.map((t) => (
          <span key={t.label} className="font-mono text-[10px] tabular-nums">
            <span className="text-zinc-500">{t.label} </span>
            <span className="text-zinc-200">{num(t.price) ?? '—'}</span>
            <span className={cn('ml-1', changeColor(t.change))}>{pct(t.change) ?? ''}</span>
          </span>
        ))}
      </div>
      <span className="ml-auto flex items-center gap-2">
        <span className="hidden font-mono text-[10px] text-zinc-600 lg:inline">
          {stampET(snapshot?.as_of) ?? 'DATA UNAVAILABLE'}
        </span>
        <DemoBadge />
      </span>
    </div>
  );
};

const FeedPage: React.FC = () => {
  const [feed, setFeed] = useState<FeedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    const load = () => {
      void fetchFeed(80).then((f) => {
        if (!active) return;
        setFeed(f);
        setLoading(false);
      });
    };
    load();
    const id = window.setInterval(load, 20000);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, []);
  if (loading) return <Spinner label="Loading the signal feed" />;
  return (
    <div className="space-y-3">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-sky-400/80">Market activity</div>
        <h2 className="mt-1 text-xl font-semibold tracking-tight text-zinc-100">Recent market and signal activity</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Each item shows when it occurred, which symbol it relates to, the event type, and the source. The page refreshes automatically while open.
        </p>
      </div>
      <ul className="divide-y divide-zinc-800/70 overflow-hidden rounded-md border border-zinc-800 bg-[#14171c]">
        {feed.map((f) => (
          <li key={f.id} className="px-3 py-2 transition-colors hover:bg-black/30">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[11px] tabular-nums text-zinc-400">{clockET(f.event_time)}</span>
              {f.symbol && <span className="font-mono text-[11px] font-semibold text-zinc-100">{f.symbol}</span>}
              <span className="rounded-sm border border-zinc-700 px-1.5 py-[1px] font-mono text-[9px] uppercase tracking-wide text-zinc-400">
                {f.category}
              </span>
              <span className="ml-auto font-mono text-[9px] text-zinc-600">{f.source_name}</span>
            </div>
            <p className="mt-1 text-[12px] leading-snug text-zinc-300">{f.message}</p>
          </li>
        ))}
        {!feed.length && <li className="p-3"><Unavailable /></li>}
      </ul>
    </div>
  );
};


export const AppLayout: React.FC = () => {
  const { user, loading, signOut } = useAuth();
  const [entered, setEntered] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup' | null>(null);
  const [view, setView] = useState<ViewKey>('opportunities');
  const [thesisId, setThesisId] = useState<number | null>(null);
  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [expandedGroup, setExpandedGroup] = useState<NavGroupKey>('today');

  useEffect(() => {
    let active = true;
    const load = () => {
      void fetchSnapshot().then((s) => {
        if (active) setSnapshot(s);
      });
    };
    load();
    const id = window.setInterval(load, 60000);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (user) {
      setEntered(true);
      setAuthMode(null);
    }
  }, [user]);

  useEffect(() => {
    setExpandedGroup(groupForView(view));
  }, [view]);

  const openThesis = useCallback((id: number) => {
    setThesisId(id);
    setView('thesis');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const go = useCallback((key: ViewKey) => {
    setView(key);
    setNavOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const goGroup = useCallback((groupKey: NavGroupKey) => {
    const group = NAV_GROUPS.find((entry) => entry.key === groupKey);
    if (!group) return;
    if (expandedGroup === groupKey) {
      go(group.defaultView);
      return;
    }
    setExpandedGroup(groupKey);
    go(group.defaultView);
  }, [expandedGroup, go]);

  const body = useMemo(() => {
    switch (view) {
      case 'thesis':
        return thesisId ? (
          <ThesisView signalId={thesisId} onBack={() => go('opportunities')} />
        ) : (
          <OpportunitiesView onOpenThesis={openThesis} />
        );
      case 'command':
        return <CommandCenterView onOpenThesis={openThesis} />;
      case 'calendar':
        return <CalendarView />;
      case 'watchlist':
        return <WatchlistView onOpenThesis={openThesis} />;
      case 'history':
        return <SignalHistoryView onOpenThesis={openThesis} />;
      case 'paper':
        return <PaperTradingView onOpenThesis={openThesis} />;
      case 'backtest':
        return <BacktestView />;
      case 'analyst':
        return <AnalystView onOpenThesis={openThesis} />;
      case 'trader':
        return <TraderIntelligenceView onOpenThesis={openThesis} />;
      case 'sources':
        return <DataSourcesView />;
      case 'feed':
        return <FeedPage />;
      default:
        return <OpportunitiesView onOpenThesis={openThesis} />;
    }
  }, [go, openThesis, thesisId, view]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0b0d10]">
        <Spinner label="Starting URSORA" />
      </div>
    );
  }

  if (!entered && !user) {
    return (
      <>
        <Landing
          onStart={() => setAuthMode('signup')}
          onSignIn={() => setAuthMode('signin')}
        />
        {authMode && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 animate-fade-in">
            <div className="w-full max-w-md">
              <AuthPanel initialMode={authMode} onClose={() => setAuthMode(null)} />
              <button
                type="button"
                onClick={() => {
                  setAuthMode(null);
                  setEntered(true);
                }}
                className="mx-auto mt-3 block font-mono text-[10px] uppercase tracking-wider text-zinc-500 transition-colors hover:text-sky-300"
              >
                explore the demo workstation without an account
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  const activeGroup = groupForView(view);
  const activeLabel = labelForView(view);

  return (
    <div className="min-h-screen bg-[#0b0d10] text-zinc-200">
      <header className="sticky top-0 z-40 border-b border-zinc-800 bg-[#0b0d10]/95 backdrop-blur">
        <StatusBar snapshot={snapshot} />
        <div className="flex items-center gap-3 px-3 py-2">
          <button
            type="button"
            onClick={() => setNavOpen((v) => !v)}
            aria-label="Toggle navigation"
            className="rounded-sm border border-zinc-800 p-1.5 text-zinc-400 transition-colors hover:text-sky-300 lg:hidden"
          >
            {navOpen ? <X className="h-4 w-4" aria-hidden="true" /> : <Menu className="h-4 w-4" aria-hidden="true" />}
          </button>
          <button
            type="button"
            onClick={() => go('opportunities')}
            className="flex items-center gap-2 font-mono text-[13px] font-semibold tracking-[0.2em] text-zinc-100 transition-colors hover:text-sky-300"
          >
            <CompactMark className="h-6 w-6" title="URSORA" />
            URSORA
          </button>
          <span className="hidden font-mono text-[10px] uppercase tracking-wider text-zinc-500 md:inline">
            {activeLabel}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden rounded-sm border border-amber-500/30 bg-amber-500/[0.06] px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-amber-300 lg:inline">
              sandbox data
            </span>
            <span className="hidden font-mono text-[10px] text-zinc-500 sm:inline">
              {user ? user.email : 'demo session'}
            </span>
            {user ? (
              <button
                type="button"
                onClick={signOut}
                className="inline-flex items-center gap-1.5 rounded-sm border border-zinc-800 px-2 py-1.5 font-mono text-[10px] uppercase tracking-wider text-zinc-400 transition-colors hover:border-red-500/40 hover:text-red-300"
              >
                <LogOut className="h-3 w-3" aria-hidden="true" />
                sign out
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setAuthMode('signin')}
                className="rounded-sm border border-sky-500/40 bg-sky-500/10 px-2 py-1.5 font-mono text-[10px] uppercase tracking-wider text-sky-300"
              >
                sign in
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="flex">
        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-30 w-56 shrink-0 overflow-y-auto border-r border-zinc-800 bg-[#0e1116] pt-[94px] transition-transform lg:sticky lg:top-[94px] lg:h-[calc(100vh-94px)] lg:translate-x-0 lg:pt-0',
            navOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          <nav aria-label="Primary" className="p-2">
            {NAV_GROUPS.map((group) => {
              const GroupIcon = group.Icon;
              const expanded = expandedGroup === group.key;
              const active = activeGroup === group.key;
              return (
                <div key={group.key} className="mb-1">
                  <button
                    type="button"
                    onClick={() => goGroup(group.key)}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-sm border px-2.5 py-2.5 text-left transition-colors',
                      active
                        ? 'border-sky-500/30 bg-sky-500/[0.08] text-sky-100'
                        : 'border-transparent text-zinc-300 hover:border-zinc-800 hover:bg-black/30',
                    )}
                  >
                    <GroupIcon className={cn('h-4 w-4 shrink-0', active ? 'text-sky-400' : 'text-zinc-500')} aria-hidden="true" />
                    <span className="text-[13px] font-medium">{group.label}</span>
                    <ChevronDown
                      className={cn('ml-auto h-3.5 w-3.5 text-zinc-600 transition-transform', expanded && 'rotate-180')}
                      aria-hidden="true"
                    />
                  </button>
                  {expanded && (
                    <div className="ml-5 mt-1 border-l border-zinc-800 pl-2">
                      {group.items.map((item) => {
                        const ItemIcon = item.Icon;
                        const selected = view === item.key || (view === 'thesis' && item.key === 'opportunities');
                        return (
                          <button
                            key={item.key}
                            type="button"
                            onClick={() => go(item.key)}
                            className={cn(
                              'flex w-full items-start gap-2 rounded-sm px-2 py-2 text-left transition-colors',
                              selected ? 'bg-sky-500/[0.08] text-sky-200' : 'text-zinc-400 hover:bg-black/30 hover:text-zinc-200',
                            )}
                          >
                            <ItemIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            <span className="min-w-0">
                              <span className="block text-[11px] font-medium">{item.label}</span>
                              <span className="block truncate text-[9px] text-zinc-600">{item.hint}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        </aside>

        {navOpen && (
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setNavOpen(false)}
            className="fixed inset-0 z-20 bg-black/60 lg:hidden"
          />
        )}

        <main className="min-w-0 flex-1 px-3 py-4 pb-20 lg:px-6 lg:pb-8">
          <div className="mx-auto w-full max-w-[1600px]">{body}</div>
        </main>
      </div>

      <nav
        aria-label="Mobile primary"
        className="fixed bottom-0 left-0 right-0 z-40 grid grid-cols-5 border-t border-zinc-800 bg-[#0b0d10]/98 backdrop-blur lg:hidden"
      >
        {NAV_GROUPS.map((group) => {
          const Icon = group.Icon;
          const active = activeGroup === group.key;
          return (
            <button
              key={group.key}
              type="button"
              onClick={() => goGroup(group.key)}
              className={cn(
                'flex flex-col items-center gap-0.5 py-2 transition-colors',
                active ? 'text-sky-300' : 'text-zinc-500 hover:text-zinc-300',
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              <span className="font-mono text-[9px] uppercase tracking-wider">{group.label}</span>
            </button>
          );
        })}
      </nav>

      {authMode && !user && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 animate-fade-in">
          <AuthPanel initialMode={authMode} onClose={() => setAuthMode(null)} />
        </div>
      )}
    </div>
  );
};

export default AppLayout;
