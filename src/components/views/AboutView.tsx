import React from 'react';
import { BookOpen, Database, Eye, ShieldCheck } from 'lucide-react';
import DataSourcesView from '@/components/views/DataSourcesView';
import { Disclaimer, Panel, SectionHeading } from '@/components/common/Primitives';

const steps = [
  {
    title: 'Read the market in context',
    body: 'Use Today to review broad market conditions and the evidence behind current opportunities. URSORA separates directional evidence from trade-quality constraints so a strong thesis is not confused with a good entry.',
    Icon: Eye,
  },
  {
    title: 'Follow the life of a trade',
    body: 'URSORA is designed around TradeCycle: origin, thesis, monitoring, exit, and review. Connected brokerage data will allow the platform to follow real positions without becoming the place where trades are executed.',
    Icon: BookOpen,
  },
  {
    title: 'Learn from your own behavior',
    body: 'Trader Intelligence looks across trade episodes to identify recurring patterns in timing, thesis adherence, risk decisions, and response to changing evidence.',
    Icon: ShieldCheck,
  },
  {
    title: 'Know what the system knows',
    body: 'Every evidence panel should identify its source, timing, and limitations. Data Connections below shows which providers are connected and which capabilities are still unavailable.',
    Icon: Database,
  },
];

export const AboutView: React.FC = () => (
  <div className="space-y-5">
    <SectionHeading
      eyebrow="About URSORA"
      title="How to use URSORA"
      description="URSORA is a market-intelligence and trader-learning environment. It organizes evidence around the life cycle of a trade and explains what the evidence means as you work."
    />

    <div className="grid gap-3 md:grid-cols-2">
      {steps.map(({ title, body, Icon }) => (
        <Panel key={title} title={title}>
          <div className="flex gap-3">
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" aria-hidden="true" />
            <p className="text-[12px] leading-relaxed text-zinc-400">{body}</p>
          </div>
        </Panel>
      ))}
    </div>

    <Panel title="Important disclosures">
      <div className="space-y-2 text-[12px] leading-relaxed text-zinc-400">
        <p>URSORA explains and organizes market evidence. It does not guarantee an outcome and does not know information that its connected data sources do not provide.</p>
        <p>Scores summarize the evidence available to the system. They are not probabilities of profit. Missing or stale evidence increases uncertainty rather than being treated as neutral confirmation.</p>
        <p>Brokerage connections are intended to supply position and trade-history data for monitoring and review. Execution remains with the user and the connected brokerage.</p>
      </div>
      <Disclaimer className="mt-3 border-t border-zinc-800 pt-3" />
    </Panel>

    <DataSourcesView />
  </div>
);

export default AboutView;
