import React, { useState } from 'react';
import { CheckCircle2, Link2, ListChecks, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState, Panel, SectionHeading } from '@/components/common/Primitives';

export const TradesView: React.FC = () => {
  const [showConnection, setShowConnection] = useState(false);

  return (
    <div className="space-y-4">
      <SectionHeading
        eyebrow="Trades"
        title="Positions and TradeCycles"
        description="Trades is the operational home for brokerage activity. Connected account data will populate open positions automatically, and closed positions will become completed TradeCycles for review in Intelligence."
      />

      <div className="grid gap-3 xl:grid-cols-2">
        <Panel
          title="Open positions"
          help="Positions currently held at a connected brokerage. URSORA uses them to monitor the original or inferred thesis and surface only meaningful evidence changes."
        >
          <EmptyState
            title="No connected positions yet"
            body="Connect a brokerage to bring current positions, orders, fills, and account activity into URSORA."
            action={
              <Button size="sm" className="gap-1.5" onClick={() => setShowConnection(true)}>
                <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
                Connect brokerage
              </Button>
            }
          />
        </Panel>

        <Panel
          title="Completed TradeCycles"
          help="Closed positions become completed TradeCycles. Select one to review the original thesis, meaningful evidence changes, how the trader responded, the exit, and the final post-trade review."
        >
          <EmptyState
            title="No completed TradeCycles yet"
            body="Completed trades will appear here automatically after brokerage history is connected."
            action={
              <Button size="sm" variant="outline" className="gap-1.5 border-zinc-700" onClick={() => setShowConnection(true)}>
                <ListChecks className="h-3.5 w-3.5" aria-hidden="true" />
                Connect trade history
              </Button>
            }
          />
        </Panel>
      </div>

      {showConnection && (
        <Panel
          title="Brokerage connectivity"
          subtitle="The interface is ready for a provider connection; no brokerage is connected to this account yet."
          right={
            <button
              type="button"
              onClick={() => setShowConnection(false)}
              className="font-mono text-[10px] uppercase tracking-wider text-zinc-500 hover:text-zinc-300"
            >
              close
            </button>
          }
        >
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-md border border-zinc-800 bg-black/20 p-3">
              <div className="flex items-center gap-2 text-[12px] font-medium text-zinc-200">
                <Link2 className="h-4 w-4 text-sky-400" aria-hidden="true" />
                Account connection
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500">
                User-authorized brokerage access will feed accounts, balances, positions, orders, fills, and activity into one normalized trade ledger.
              </p>
            </div>
            <div className="rounded-md border border-zinc-800 bg-black/20 p-3">
              <div className="flex items-center gap-2 text-[12px] font-medium text-zinc-200">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                Automatic TradeCycles
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500">
                Open positions enter monitoring automatically. When the position closes, the same episode becomes a completed TradeCycle.
              </p>
            </div>
            <div className="rounded-md border border-zinc-800 bg-black/20 p-3">
              <div className="flex items-center gap-2 text-[12px] font-medium text-zinc-200">
                <ShieldCheck className="h-4 w-4 text-amber-300" aria-hidden="true" />
                Permission-aware
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500">
                URSORA is being built read-first. Trading permissions can be added later through supported providers without changing the TradeCycle model.
              </p>
            </div>
          </div>
          <div className="mt-3 rounded-md border border-sky-500/25 bg-sky-500/[0.05] px-3 py-2 text-[11px] leading-relaxed text-zinc-400">
            Integration target: a provider-neutral brokerage layer so SnapTrade, direct broker APIs, and authenticated history imports can all feed the same TradeCycle engine.
          </div>
        </Panel>
      )}
    </div>
  );
};

export default TradesView;
