import React from 'react';
import { Link2, ListChecks } from 'lucide-react';
import { EmptyState, Panel, SectionHeading } from '@/components/common/Primitives';

export const TradesView: React.FC = () => (
  <div className="space-y-4">
    <SectionHeading
      eyebrow="Trades"
      title="Positions and TradeCycles"
      description="URSORA does not execute trades. Connected brokerage data will populate open positions and completed trades here so each position can be monitored and reviewed as a TradeCycle."
    />

    <div className="grid gap-3 lg:grid-cols-2">
      <Panel
        title="Open positions"
        help="Positions currently held at a connected brokerage. URSORA will use them to monitor the original or inferred thesis and alert you only when the evidence changes meaningfully."
      >
        <EmptyState
          title="No connected positions yet"
          body="Connect a supported brokerage to bring current positions into URSORA. Trade execution remains with the brokerage."
          action={<Link2 className="h-4 w-4 text-sky-400" aria-hidden="true" />}
        />
      </Panel>

      <Panel
        title="Completed TradeCycles"
        help="Closed positions become completed TradeCycles. URSORA can compare the original thesis, evidence changes during the trade, the exit, and the trader’s response."
      >
        <EmptyState
          title="No completed TradeCycles yet"
          body="Completed brokerage trades will appear here after a supported connection is enabled."
          action={<ListChecks className="h-4 w-4 text-sky-400" aria-hidden="true" />}
        />
      </Panel>
    </div>
  </div>
);

export default TradesView;
