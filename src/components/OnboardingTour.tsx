import React, { useState } from 'react';
import { BookOpen, Brain, LineChart, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';

const STEPS = [
  {
    title: 'Welcome to URSORA',
    body: 'URSORA is a market-intelligence and trader-learning environment. The goal is to help you understand what the market evidence says, what changed, and how your own decisions interact with that evidence.',
    Icon: BookOpen,
  },
  {
    title: 'Start with Today',
    body: 'Opportunities ranks current setups. Market Overview explains the broader environment. Select a ticker anywhere it appears to open the current analysis and review the evidence behind it.',
    Icon: LineChart,
  },
  {
    title: 'Trades become learning episodes',
    body: 'When brokerage connections are available, open and closed positions become TradeCycle episodes. URSORA monitors the original thesis, meaningful changes in evidence, and the trader’s response over time.',
    Icon: Brain,
  },
  {
    title: 'Understand the limits',
    body: 'URSORA is a research and learning tool, not investment advice. Scores are summaries of available evidence, not probabilities of profit. Missing data increases uncertainty. Trading and options involve the risk of loss.',
    Icon: ShieldCheck,
  },
];

export const OnboardingTour: React.FC<{ onFinish: () => void }> = ({ onFinish }) => {
  const [step, setStep] = useState(0);
  const [acknowledged, setAcknowledged] = useState(false);
  const current = STEPS[step];
  const Icon = current.Icon;
  const final = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-lg border border-zinc-700 bg-[#111419] p-5 shadow-2xl">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-sky-400">
          Getting started · {step + 1} of {STEPS.length}
        </div>
        <div className="mt-4 flex gap-3">
          <div className="rounded-md border border-sky-500/30 bg-sky-500/10 p-2 text-sky-300">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-zinc-100">{current.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">{current.body}</p>
          </div>
        </div>

        {final && (
          <label className="mt-5 flex items-start gap-2 rounded-md border border-zinc-800 bg-black/20 p-3 text-[12px] leading-relaxed text-zinc-400">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
              className="mt-0.5"
            />
            <span>I understand that URSORA organizes market evidence for research and learning and does not guarantee investment outcomes.</span>
          </label>
        )}

        <div className="mt-6 flex items-center justify-between">
          <button
            type="button"
            disabled={step === 0}
            onClick={() => setStep((value) => Math.max(0, value - 1))}
            className="text-[12px] text-zinc-500 hover:text-zinc-300 disabled:opacity-30"
          >
            Back
          </button>
          <Button
            onClick={() => final ? onFinish() : setStep((value) => value + 1)}
            disabled={final && !acknowledged}
          >
            {final ? 'Enter URSORA' : 'Continue'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default OnboardingTour;
